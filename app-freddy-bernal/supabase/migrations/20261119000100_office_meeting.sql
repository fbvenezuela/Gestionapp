-- «La oficina», the meeting room (Juan, 19/11/2026): «cuando empiece un proyecto todos vayan a la reunión para que
-- estén al tanto». Between the reception and the scriptwriters: once the boss approves the reading, the whole team is
-- told and meets to go over it; the boss says it was held, and only then the script starts. A new file (not a change to
-- 20261106000100_office.sql), so it applies the same whether that one is already in a database or not.

alter table public.event_office
  add column kickoff_done boolean not null default false,
  add column kickoff_by uuid references public.profiles (id),
  add constraint event_office_kickoff_shape check (kickoff_done or kickoff_by is null);

-- What already has a script went through its meeting outside the office: it does not go back to it.
update public.event_office set kickoff_done = true where script_status <> 'none';

create or replace function public.guard_event_office()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or current_setting('app.trusted_update', true) = 'on' then return new; end if;
  new.updated_by := auth.uid();
  if tg_op = 'UPDATE' and new.event_id is distinct from old.event_id then
    raise exception 'La fila de la oficina no cambia de actividad.' using errcode = '42501';
  end if;
  -- The reading: approving it is the boss's; changing an approved reading sends it back to him.
  if new.reception_status = 'approved' and (tg_op = 'INSERT' or old.reception_status <> 'approved'
       or (new.rx_what, new.rx_beneficiaries, new.rx_responsible, new.rx_research)
          is distinct from (old.rx_what, old.rx_beneficiaries, old.rx_responsible, old.rx_research)) then
    if public.can_approve() then
      new.reception_approved_by := auth.uid();
    elsif tg_op = 'UPDATE' and old.reception_status = 'approved' then
      new.reception_status := 'draft';
      new.reception_approved_by := null;
    else
      raise exception 'Solo el jefe aprueba la lectura de la recepción.' using errcode = '42501';
    end if;
  end if;
  if new.reception_status <> 'approved' then new.reception_approved_by := null; end if;
  -- The kick-off meeting (Juan, 19/11): only the boss says it was held (or undoes it), after the reading.
  if new.kickoff_done is distinct from (case when tg_op = 'UPDATE' then old.kickoff_done else false end) then
    if not public.can_approve() then
      raise exception 'Solo el jefe da por hecha la reunión.' using errcode = '42501';
    end if;
    if new.kickoff_done and new.reception_status <> 'approved' then
      raise exception 'Primero el jefe aprueba la lectura de la recepción.';
    end if;
    new.kickoff_by := case when new.kickoff_done then auth.uid() else null end;
  end if;
  -- The script starts once the boss approved the reading and the team had its meeting.
  if new.script_status <> 'none'
     and (tg_op = 'INSERT' or new.script_status is distinct from old.script_status or new.script is distinct from old.script) then
    if new.reception_status <> 'approved' then
      raise exception 'Primero el jefe aprueba la lectura de la recepción.';
    elsif not new.kickoff_done then
      raise exception 'Primero se hace la reunión de arranque.';
    end if;
  end if;
  -- Approving is the boss's (with his second factor). Anyone else saving an approved script sends it back to draft.
  if new.script_status = 'approved' and (tg_op = 'INSERT' or old.script_status <> 'approved' or new.script is distinct from old.script) then
    if public.can_approve() then
      new.script_approved_by := auth.uid();
    elsif tg_op = 'UPDATE' and old.script_status = 'approved' and new.script is distinct from old.script then
      new.script_status := 'draft';
      new.script_approved_by := null;
    else
      raise exception 'Solo el jefe aprueba el guion.' using errcode = '42501';
    end if;
  end if;
  if new.script_status <> 'approved' then new.script_approved_by := null; end if;
  -- «Ya está limpio» (and undoing it) is the boss's alone, with his second factor (Juan, 06/11/2026).
  if new.clean_done is distinct from (case when tg_op = 'UPDATE' then old.clean_done else false end) and not public.can_approve() then
    raise exception 'Solo el jefe marca el video limpio.' using errcode = '42501';
  end if;
  -- The video is cleaned before the final edit: «Editor brutal» cannot be ready over a video that is not clean.
  if new.brutal_done and not new.clean_done then
    raise exception 'Primero el editor en línea deja el video limpio.';
  end if;
  return new;
end $$;

drop function public.office_facts();
create function public.office_facts()
returns table (
  event_id uuid, tracked boolean, reception_status text, kickoff_done boolean, script_status text, clean_done boolean, brutal_done boolean,
  shots int, raw_media int, pieces int, pieces_in_review int, pieces_approved int, pieces_approved_with_copies int, published int
)
language sql stable security definer set search_path = public as $$
  select e.id,
         o.event_id is not null,
         coalesce(o.reception_status, 'none'),
         coalesce(o.kickoff_done, false),
         coalesce(o.script_status, 'none'),
         coalesce(o.clean_done, false),
         coalesce(o.brutal_done, false),
         (select count(*)::int from public.storyboard_blocks b join public.storyboards s on s.id = b.storyboard_id
           where s.event_id = e.id and b.deleted_at is null and (btrim(b.shot) <> '' or btrim(b.angle) <> '' or btrim(b.boss_line) <> '')),
         (select count(*)::int from public.media_assets m
           where m.event_id = e.id and m.deleted_at is null and m.status = 'ready' and m.kind in ('boss', 'drone', 'broll', 'other')),
         (select count(*)::int from public.pieces p where p.event_id = e.id and p.deleted_at is null and p.status <> 'archived'),
         (select count(*)::int from public.pieces p where p.event_id = e.id and p.deleted_at is null and p.status in ('in_review', 'changes_requested')),
         (select count(*)::int from public.pieces p where p.event_id = e.id and p.deleted_at is null and p.status = 'approved'),
         (select count(*)::int from public.pieces p where p.event_id = e.id and p.deleted_at is null and p.status = 'approved'
             and (select count(*) from public.copies c where c.piece_id = p.id and btrim(c.body) <> '') >= 3),
         (select count(*)::int from public.publications pub join public.pieces p on p.id = pub.piece_id
           where p.event_id = e.id and pub.deleted_at is null and pub.status = 'published')
    from public.events e
    left join public.event_office o on o.event_id = e.id
   where e.deleted_at is null and e.cancelled_at is null and e.boss_decision = 'accepted'
     and public.can_see_event(e.id)
$$;
revoke all on function public.office_facts() from public, anon;
grant execute on function public.office_facts() to authenticated;
