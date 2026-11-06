-- «La oficina» (pedido del 06/11/2026): the content line for each activity of the boss, drawn as an isometric office.
-- Most rooms read what already exists (storyboard, material, pieces, copies, publications, metrics). Three steps had
-- nowhere to live, and get it here, one row per event:
--   * the script (guion): a draft from the ficha that the boss approves before the storyboard;
--   * «Editor en línea»: the lead of Redes marks the video clean (dead time and flaws out);
--   * «Editor brutal»: the final edit (animations, effects, sound, subtitles) is ready for the boss.
-- Who writes: the boss and Redes (is_content_team, as pieces). Only the boss approves the script (can_approve()), and a
-- change to an approved script sends it back to draft. Who reads: whoever sees the event (can_see_event). No date,
-- time or place lives here (§4.4). Audited; never deleted (the event's own soft delete hides it).

create table public.event_office (
  event_id uuid primary key references public.events (id),
  script text not null default '' check (char_length(script) <= 6000),
  script_status text not null default 'none' check (script_status in ('none', 'draft', 'approved')),
  script_approved_by uuid references public.profiles (id),
  clean_done boolean not null default false,
  brutal_done boolean not null default false,
  updated_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (script_status = 'none' or btrim(script) <> ''),
  check (script_status = 'approved' or script_approved_by is null)
);
select public.wire_standard_triggers('public.event_office', false, true);

create function public.guard_event_office()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or current_setting('app.trusted_update', true) = 'on' then return new; end if;
  new.updated_by := auth.uid();
  if tg_op = 'UPDATE' and new.event_id is distinct from old.event_id then
    raise exception 'La fila de la oficina no cambia de actividad.' using errcode = '42501';
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
  -- The video is cleaned before the final edit: «Editor brutal» cannot be ready over a video that is not clean.
  if new.brutal_done and not new.clean_done then
    raise exception 'Primero el editor en línea deja el video limpio.';
  end if;
  return new;
end $$;
create trigger guard_event_office before insert or update on public.event_office
  for each row execute function public.guard_event_office();

alter table public.event_office enable row level security;
grant select, insert, update on public.event_office to authenticated;

create policy eo_select on public.event_office for select to authenticated
  using (public.can_see_event(event_id));
create policy eo_insert on public.event_office for insert to authenticated
  with check (public.is_content_team() and public.can_see_event(event_id));
create policy eo_update on public.event_office for update to authenticated
  using (public.is_content_team() and public.can_see_event(event_id))
  with check (public.is_content_team() and public.can_see_event(event_id));

-- What the office needs to place each activity in its room, the same for every reader: counts and yes/no only, for
-- the events the caller may see (can_see_event), never their content, date, time or place. Security definer so the
-- room does not depend on which pieces or files each role may open (despacho does not read pieces, yet sees where
-- the video is). Accepted, live, not cancelled.
create function public.office_facts()
returns table (
  event_id uuid, tracked boolean, script_status text, clean_done boolean, brutal_done boolean,
  shots int, raw_media int, pieces int, pieces_in_review int, pieces_approved int, pieces_approved_with_copies int, published int
)
language sql stable security definer set search_path = public as $$
  select e.id,
         o.event_id is not null,
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
revoke all on function public.guard_event_office() from public, anon, authenticated;
