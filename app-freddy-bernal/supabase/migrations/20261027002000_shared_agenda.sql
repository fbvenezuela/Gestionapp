-- Shared agenda (cambios del 27/10/2026, §3 and §4): the boss makes his own agenda with despacho, «Por ponerle
-- fecha» turns a ficha into an event, and every agenda object lives here from now on (events, event_schedule,
-- event_brief, event_assignments, storyboards, storyboard_blocks and their helpers).
--   * THE DATE RULE does not move: date, time, exact address, directions and site contacts live only in
--     event_schedule. Who reads it: admin, the boss and despacho with 2FA; Grabación for its assigned events; the
--     Director del IVT (2FA) for the visits born from an obra ficha. Política and Redes never. Nothing new goes into
--     the Realtime publication, and a schedule change never touches events (its rev and updated_at reach Redes).
--   * Only the boss and despacho write the agenda (can_manage_agenda(): boss or despacho, with 2FA): events,
--     schedule, brief and «Ponerle fecha» (schedule_ficha()). Administración reads it and keeps the soft delete.
--   * What the boss creates or dates himself is accepted at once (origin 'boss'); what despacho creates or dates
--     arrives «Por decidir». Only the boss changes priority and boss_decision. Born from a ficha: origin 'ivt' or
--     'politics', and kind 'obra_visit' / 'community'.
--   * IVT and política never enter can_see_event (it also opens the brief, the storyboard and the material): they
--     get their own branches in events_select, read from the event's own columns (obra_ficha_id /
--     community_report_id), never from the fichas (obra_fichas_select reads events: that would loop).
--   * Concurrency: an integer rev on events, event_schedule, event_brief and storyboards (bump_rev() of
--     20261027001700_fichas.sql) and updated_by on each; the app merges by field and the last save wins, with a
--     notice to the other person. event_history() gives the boss and despacho who changed what (from audit_log).
--   * Cancelling is not deleting: cancelled_at / cancelled_by / cancel_reason. A cancelled (or rejected, or
--     deleted) visit puts its obra back in «Por ponerle fecha» by itself (events_source_sync), with the reason in the
--     ficha's history; a visit marked done marks the obra done.
--   * The retired roles' branches (secretary, supervisor) are gone from every agenda function and policy.
-- No enum values here (only 20261027001500 adds them) and no rows: stable demo ids (src/lib/db/stable-ids.ts)
-- renumber migration rows with UPDATE.

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
alter table public.events
  add column kind text not null default 'event' check (kind in ('event', 'obra_visit', 'community')),
  -- Who proposed it. The default is also the backfill: what the ex-Secretaría proposed reads «Despacho» (spec §2),
  -- while created_by and the audit keep the real author.
  add column origin text not null default 'dispatch' check (origin in ('dispatch', 'boss', 'politics', 'ivt')),
  add column rev int not null default 1,
  add column updated_by uuid references public.profiles (id),
  add column cancelled_at timestamptz,
  add column cancelled_by uuid references public.profiles (id),
  add column cancel_reason text not null default '' check (char_length(cancel_reason) <= 500),
  add constraint events_cancel_shape check (cancelled_at is not null or (cancelled_by is null and cancel_reason = ''));

alter table public.event_schedule
  add column rev int not null default 1,
  add column updated_by uuid references public.profiles (id);
alter table public.event_brief add column rev int not null default 1;
alter table public.storyboards add column rev int not null default 1;

-- An event born from a ficha (only the system or a trusted path can link one: guard_event_source_links).
update public.events
   set kind = case when obra_ficha_id is not null then 'obra_visit' else 'community' end,
       origin = case when obra_ficha_id is not null then 'ivt' else 'politics' end
 where obra_ficha_id is not null or community_report_id is not null;

-- One live visit per ficha: a second «Ponerle fecha» fails while the first is not cancelled, rejected or deleted.
create unique index events_one_live_obra on public.events (obra_ficha_id)
  where obra_ficha_id is not null and cancelled_at is null and deleted_at is null and boss_decision <> 'rejected';
create unique index events_one_live_report on public.events (community_report_id)
  where community_report_id is not null and cancelled_at is null and deleted_at is null and boss_decision <> 'rejected';
create index events_cancelled_idx on public.events (cancelled_at) where cancelled_at is not null;

-- ---------------------------------------------------------------------------
-- 2. Helpers (security definer: they read roles and assignments; policies call them)
-- ---------------------------------------------------------------------------
-- Who writes the agenda: the boss and despacho, with 2FA. Administración reads it only.
create function public.can_manage_agenda()
returns boolean language sql stable security definer set search_path = public as $$
  select public.mfa_ok() and public.has_any_role(array['boss', 'dispatch']::public.app_role[])
$$;

-- Kept with its signature (policies and the app call it).
create or replace function public.can_edit_event(e uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_manage_agenda()
$$;

-- Who sees an event row with its brief, storyboard and material (no date involved). NOT the IVT nor política.
create or replace function public.can_see_event(e uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_any_role(array['admin', 'boss', 'dispatch', 'social']::public.app_role[])
    or (public.has_role('camera') and public.is_assigned(e))
$$;

-- Who sees date, time and exact place. The IVT: the visits born from an obra ficha (read from the event's own
-- column, never from obra_fichas).
create or replace function public.can_see_schedule(e uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.mfa_ok() and (
    public.has_any_role(array['admin', 'boss', 'dispatch']::public.app_role[])
    or (public.has_role('camera') and public.is_assigned(e))
    or (public.has_role('ivt') and exists (select 1 from public.events ev
                                            where ev.id = e and ev.obra_ficha_id is not null and ev.deleted_at is null))
  )
$$;

-- ---------------------------------------------------------------------------
-- 3. Triggers on events
-- ---------------------------------------------------------------------------
-- A new event, as a person: the boss's is accepted at once and is his; anyone else's waits for the boss («Por
-- decidir»), without a priority, and is despacho's. Nothing is born done, cancelled or half-way. The system (seed,
-- jobs) and trusted paths (schedule_ficha) pass as they are. Linking a ficha is refused by guard_event_source_links.
create function public.guard_event_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or current_setting('app.trusted_update', true) = 'on' then return new; end if;
  if new.kind not in ('event', 'obra_visit') then
    raise exception 'Una actividad comunitaria nace de un reporte con «Ponerle fecha».' using errcode = '42501';
  end if;
  if public.has_role('boss') and not public.has_role('dispatch') then
    new.boss_decision := 'accepted';
    new.origin := 'boss';
  else
    new.boss_decision := 'pending';
    new.priority := null;
    new.origin := 'dispatch';
  end if;
  new.work_status := 'brief';
  new.done_on := null;
  new.cancelled_at := null;
  new.cancelled_by := null;
  new.cancel_reason := '';
  new.deleted_at := null;
  return new;
end $$;
create trigger guard_event_insert before insert on public.events
  for each row execute function public.guard_event_insert();

-- Column guard: each role touches only its own fields.
--   boss and despacho (with 2FA): the event's data, its kind and the cancel columns (cancelling stamps who and when);
--   the boss alone: priority and boss_decision; the boss and Redes: work_status and urgency (Redes' screens);
--   administración: deleted_at only (the soft delete, guard_soft_delete).
--   origin, created_by, done_on, code and the ficha links change only through trusted paths (and the links never by
--   a person: guard_event_source_links, for every role).
create or replace function public.guard_event_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  changed text[];
  allowed text[] := '{}';
begin
  if auth.uid() is null or current_setting('app.trusted_update', true) = 'on' then
    return new;
  end if;
  select coalesce(array_agg(n.key), '{}') into changed
    from jsonb_each(to_jsonb(new)) n
   where n.value is distinct from (to_jsonb(old) -> n.key) and n.key not in ('updated_at', 'rev', 'updated_by');
  if public.can_manage_agenda() then
    allowed := allowed || array['title', 'place_name', 'municipality', 'summary', 'category_id', 'urgency', 'kind',
                                'cancelled_at', 'cancelled_by', 'cancel_reason'];
  end if;
  if public.has_role('boss') then allowed := allowed || array['priority', 'boss_decision', 'work_status', 'urgency']; end if;
  if public.has_role('social') then allowed := allowed || array['work_status', 'urgency']; end if;
  if public.has_role('admin') then allowed := allowed || array['deleted_at']; end if;
  if not changed <@ allowed then
    raise exception 'No puedes cambiar estos datos del evento.' using errcode = '42501';
  end if;
  -- Cancelling stamps who and when; bringing it back clears both and the reason. What already happened (done) is
  -- not cancelled: its material stays in the register by day.
  if new.cancelled_at is distinct from old.cancelled_at then
    if new.cancelled_at is not null and old.done_on is not null then
      raise exception 'Este evento ya se realizó: no se cancela.' using errcode = '42501';
    end if;
    if new.cancelled_at is not null then
      new.cancelled_at := now();
      new.cancelled_by := auth.uid();
    else
      new.cancelled_by := null;
      new.cancel_reason := '';
    end if;
  else
    new.cancelled_by := old.cancelled_by;
  end if;
  return new;
end $$;

-- The kind follows the source: an event born from an obra ficha is an obra visit, from a report a community
-- activity, whatever a person sends. When a source is linked (system or trusted path), the origin follows it too.
create function public.events_kind_from_source()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.obra_ficha_id is not null then
    new.kind := 'obra_visit';
  elsif new.community_report_id is not null then
    new.kind := 'community';
  end if;
  if (tg_op = 'INSERT' or old.obra_ficha_id is null) and new.obra_ficha_id is not null then
    new.origin := 'ivt';
  elsif (tg_op = 'INSERT' or old.community_report_id is null) and new.community_report_id is not null then
    new.origin := 'politics';
  end if;
  return new;
end $$;
create trigger kind_from_source_events before insert or update on public.events
  for each row execute function public.events_kind_from_source();

-- Whoever saved last (the app tells the other person when it overwrote what they wrote).
create function public.stamp_updated_by()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.uid() is not null then new.updated_by := auth.uid(); end if;
  return new;
end $$;

-- BEFORE triggers fire by name: the guards first (they see what the person sent), then kind, rev, soft delete,
-- updated_by and updated_at.
create trigger rev_events before insert or update on public.events
  for each row execute function public.bump_rev();
create trigger stamp_updated_by_events before insert or update on public.events
  for each row execute function public.stamp_updated_by();
create trigger rev_event_schedule before insert or update on public.event_schedule
  for each row execute function public.bump_rev();
create trigger stamp_updated_by_event_schedule before insert or update on public.event_schedule
  for each row execute function public.stamp_updated_by();
create trigger rev_event_brief before insert or update on public.event_brief
  for each row execute function public.bump_rev();
create trigger stamp_updated_by_event_brief before insert or update on public.event_brief
  for each row execute function public.stamp_updated_by();
create trigger rev_storyboards before insert or update on public.storyboards
  for each row execute function public.bump_rev();
create trigger stamp_updated_by_storyboards before insert or update on public.storyboards
  for each row execute function public.stamp_updated_by();

-- A visit that stops being live (cancelled, rejected by the boss or deleted) puts its obra back in «Por ponerle
-- fecha», with the reason in the ficha's history (written by ficha_history from app.history_note); one that is live
-- again takes it back. A report keeps a note (without the reason: política reads it, and the reason is free text).
-- A visit marked done marks its obra done. The ficha's guard lets these through (trusted path).
create function public.events_source_sync()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  was_live boolean := old.deleted_at is null and old.cancelled_at is null and old.boss_decision <> 'rejected';
  is_live boolean := new.deleted_at is null and new.cancelled_at is null and new.boss_decision <> 'rejected';
  v_trusted text := coalesce(current_setting('app.trusted_update', true), '');
  v_note text;
begin
  if new.obra_ficha_id is null and new.community_report_id is null then return null; end if;
  if was_live is distinct from is_live then
    v_note := case
      when is_live then 'La visita volvió a la agenda.'
      when new.cancelled_at is not null and old.cancelled_at is null then
        'Se canceló la visita' || case when btrim(new.cancel_reason) <> '' then ': ' || btrim(new.cancel_reason) else '.' end
      when new.boss_decision = 'rejected' and old.boss_decision <> 'rejected' then 'El jefe rechazó la visita.'
      else 'Se borró la visita.' end;
    if new.obra_ficha_id is not null then
      perform set_config('app.history_note', v_note, true);
      perform set_config('app.trusted_update', 'on', true);
      update public.obra_fichas
         set stage = case when is_live then 'scheduled' else 'to_schedule' end
       where id = new.obra_ficha_id and deleted_at is null
         and stage = case when is_live then 'to_schedule' else 'scheduled' end;
      perform set_config('app.trusted_update', v_trusted, true);
      perform set_config('app.history_note', '', true);
    else
      insert into public.ficha_updates (community_report_id, kind, note, actor_id)
      values (new.community_report_id, 'note',
              case when is_live then 'La actividad volvió a la agenda del jefe.' else 'La actividad salió de la agenda del jefe.' end,
              auth.uid());
    end if;
  end if;
  if new.done_on is not null and old.done_on is null and new.obra_ficha_id is not null then
    perform set_config('app.trusted_update', 'on', true);
    update public.obra_fichas set stage = 'done'
     where id = new.obra_ficha_id and deleted_at is null and stage in ('scheduled', 'to_schedule');
    perform set_config('app.trusted_update', v_trusted, true);
  end if;
  return null;
end $$;
create trigger events_source_sync after update on public.events
  for each row execute function public.events_source_sync();

-- Marking an event done reveals ONLY the day. A cancelled event is not done.
create or replace function public.mark_event_done(e uuid)
returns date language plpgsql security definer set search_path = public as $$
declare
  d date;
  tz text := coalesce((select value #>> '{}' from public.app_settings where key = 'app.timezone'), 'America/Caracas');
begin
  if not (public.has_any_role(array['admin', 'dispatch', 'boss']::public.app_role[])
          or (public.has_role('camera') and public.is_assigned(e))) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if exists (select 1 from public.events where id = e and cancelled_at is not null) then
    raise exception 'Este evento está cancelado: no se marca realizado.';
  end if;
  select (starts_at at time zone tz)::date into d from public.event_schedule where event_id = e;
  if d is null then raise exception 'El evento no tiene fecha.'; end if;
  if d > (now() at time zone tz)::date then raise exception 'El evento todavía no ha pasado.'; end if;
  perform set_config('app.trusted_update', 'on', true);
  update public.events set done_on = d,
    work_status = case when work_status in ('brief', 'storyboard', 'recording') then 'material' else work_status end
   where id = e;
  perform set_config('app.trusted_update', 'off', true);
  return d;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Policies (inline where INSERT ... RETURNING must see the new row)
-- ---------------------------------------------------------------------------
drop policy events_select on public.events;
drop policy events_insert on public.events;
drop policy events_update on public.events;
create policy events_select on public.events for select to authenticated
  using ((deleted_at is null and (
           public.has_any_role(array['admin', 'boss', 'dispatch', 'social']::public.app_role[])
           or (public.has_role('camera') and public.is_assigned(id))
           -- The IVT: the visits born from an obra ficha; política: the activities born from its reports (no date:
           -- event_schedule stays closed to política).
           or (public.has_role('ivt') and obra_ficha_id is not null)
           or (public.has_role('politics') and community_report_id is not null)))
         or (deleted_at is not null and public.has_role('admin')));
create policy events_insert on public.events for insert to authenticated
  with check (public.can_manage_agenda() and created_by = auth.uid());
-- The column guard decides what each of them may change.
create policy events_update on public.events for update to authenticated
  using (public.can_see_event(id) and public.has_any_role(array['admin', 'boss', 'dispatch', 'social']::public.app_role[]))
  with check (true);

drop policy schedule_insert on public.event_schedule;
drop policy schedule_update on public.event_schedule;
create policy schedule_insert on public.event_schedule for insert to authenticated
  with check (public.can_manage_agenda());
create policy schedule_update on public.event_schedule for update to authenticated
  using (public.can_manage_agenda()) with check (public.can_manage_agenda());

drop policy brief_insert on public.event_brief;
drop policy brief_update on public.event_brief;
create policy brief_insert on public.event_brief for insert to authenticated
  with check (public.can_manage_agenda());
create policy brief_update on public.event_brief for update to authenticated
  using (public.can_manage_agenda()) with check (public.can_manage_agenda());

drop policy assignments_select on public.event_assignments;
drop policy assignments_insert on public.event_assignments;
drop policy assignments_delete on public.event_assignments;
create policy assignments_select on public.event_assignments for select to authenticated
  using (user_id = auth.uid() or public.has_any_role(array['admin', 'boss', 'dispatch', 'social']::public.app_role[]));
create policy assignments_insert on public.event_assignments for insert to authenticated
  with check (public.has_any_role(array['admin', 'boss', 'dispatch', 'social']::public.app_role[]));
create policy assignments_delete on public.event_assignments for delete to authenticated
  using (public.has_any_role(array['admin', 'boss', 'dispatch', 'social']::public.app_role[]));

drop policy storyboards_insert on public.storyboards;
drop policy storyboards_update on public.storyboards;
create policy storyboards_insert on public.storyboards for insert to authenticated
  with check (public.has_any_role(array['admin', 'social', 'boss']::public.app_role[]) and public.can_see_event(event_id));
create policy storyboards_update on public.storyboards for update to authenticated
  using (public.has_any_role(array['admin', 'social', 'boss']::public.app_role[]))
  with check (public.has_any_role(array['admin', 'social', 'boss']::public.app_role[]));

drop policy blocks_insert on public.storyboard_blocks;
drop policy blocks_update on public.storyboard_blocks;
create policy blocks_insert on public.storyboard_blocks for insert to authenticated
  with check (public.has_any_role(array['admin', 'social', 'boss']::public.app_role[]));
create policy blocks_update on public.storyboard_blocks for update to authenticated
  using (public.has_any_role(array['admin', 'social', 'boss']::public.app_role[]))
  with check (public.has_any_role(array['admin', 'social', 'boss']::public.app_role[]));

-- Redes and Grabación read an obra only while a LIVE visit they can see links to it: not deleted, not rejected and
-- now not cancelled either (20261027001950_fichas_media_fixes.sql left this for here).
drop policy obra_fichas_select on public.obra_fichas;
create policy obra_fichas_select on public.obra_fichas for select to authenticated
  using ((deleted_at is null and (
           public.has_any_role(array['admin', 'boss', 'dispatch', 'ivt']::public.app_role[])
           or (public.has_any_role(array['social', 'camera']::public.app_role[])
               and exists (select 1 from public.events e
                            where e.obra_ficha_id = obra_fichas.id and e.deleted_at is null and e.cancelled_at is null
                              and e.boss_decision <> 'rejected' and public.can_see_event(e.id)))))
         or (deleted_at is not null and public.has_role('admin')));

-- «Ya tiene fecha» for a report, without the date: a dated, LIVE (not cancelled) event links to it.
create or replace function public.report_has_live_event(p_report uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_any_role(array['admin', 'boss', 'dispatch', 'politics']::public.app_role[])
    and exists (select 1 from public.community_reports r where r.id = p_report and r.deleted_at is null)
    and exists (select 1 from public.events e join public.event_schedule sc on sc.event_id = e.id
                 where e.community_report_id = p_report and e.deleted_at is null and e.cancelled_at is null
                   and e.boss_decision <> 'rejected')
$$;

-- ---------------------------------------------------------------------------
-- 5. Calendar view: same columns, plus kind, origin, cancelled_at and the schedule's rev at the end
--    (security_invoker: the caller's RLS applies, so Redes and política get zero rows).
-- ---------------------------------------------------------------------------
create or replace view public.event_calendar with (security_invoker = true) as
  select e.id, e.code, e.title, e.place_name, e.municipality, e.category_id, e.priority, e.boss_decision,
         e.work_status, s.starts_at, s.ends_at, s.exact_address,
         e.kind, e.origin, e.cancelled_at, s.rev as schedule_rev
    from public.events e
    join public.event_schedule s on s.event_id = e.id
   where e.deleted_at is null;

-- ---------------------------------------------------------------------------
-- 6. «Por ponerle fecha»: obras ready for a date and reports that go to the boss's agenda, with no live event.
--    No date column (there is none to show: the ficha has no date). security_invoker: each person sees what their
--    role reads (the IVT its obras, política its reports, Redes and Grabación nothing).
-- ---------------------------------------------------------------------------
create view public.agenda_to_schedule with (security_invoker = true) as
  select 'obra'::text as kind, f.id, f.code, f.name as title, f.municipality, f.parish, f.rev, f.updated_at as waiting_since,
         exists (select 1 from public.events e where e.obra_ficha_id = f.id and e.cancelled_at is not null) as had_cancelled
    from public.obra_fichas f
   where f.deleted_at is null and f.stage = 'to_schedule'
     and not exists (select 1 from public.events e
                      where e.obra_ficha_id = f.id and e.deleted_at is null and e.cancelled_at is null and e.boss_decision <> 'rejected')
  union all
  select 'report'::text, r.id, r.code, r.title, r.municipality, r.parish, r.rev, r.updated_at,
         exists (select 1 from public.events e where e.community_report_id = r.id and e.cancelled_at is not null)
    from public.community_reports r
   where r.deleted_at is null and r.wants_agenda and r.status not in ('finished', 'suspended')
     and not exists (select 1 from public.events e
                      where e.community_report_id = r.id and e.deleted_at is null and e.cancelled_at is null and e.boss_decision <> 'rejected');

-- ---------------------------------------------------------------------------
-- 7. «Ponerle fecha»: the ONLY way a ficha becomes an event. The boss or despacho (with 2FA); the boss's is accepted
--    at once, despacho's waits for the boss. Inserts the event (linked to the ficha), its schedule and its brief, as
--    a trusted path. Obra: its stage goes to 'scheduled' (ficha_history writes the 'scheduled' row, without a date);
--    report: one 'scheduled' row in its history, without a date. A second call for the same ficha fails.
-- ---------------------------------------------------------------------------
create function public.schedule_ficha(p_kind text, p_id uuid, p_title text, p_place text, p_starts timestamptz,
  p_ends timestamptz, p_address text, p_directions text, p_contacts text, p_brief jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_municipality text;
  v_stage text;
  v_status text;
  v_wants boolean;
  v_event uuid;
  v_brief jsonb := coalesce(p_brief, '{}'::jsonb);
  v_trusted text := coalesce(current_setting('app.trusted_update', true), '');
begin
  if not public.can_manage_agenda() then
    raise exception 'La fecha la ponen el jefe o el despacho (con doble factor).' using errcode = '42501';
  end if;
  if p_kind = 'obra' then
    select municipality, stage into v_municipality, v_stage from public.obra_fichas
     where id = p_id and deleted_at is null for update;
    if v_municipality is null then raise exception 'No encontramos esta ficha de obra.'; end if;
    if v_stage <> 'to_schedule' then
      raise exception '%', case v_stage
        when 'scheduled' then 'Esta obra ya tiene fecha: la pusieron mientras tanto.'
        when 'done' then 'Esta visita ya se hizo.'
        when 'draft' then 'Esta ficha sigue en borrador: el IVT tiene que mandarla con «Guardar y avisar al jefe».'
        else 'Esta ficha está archivada: no va a la agenda.' end;
    end if;
    if exists (select 1 from public.events e where e.obra_ficha_id = p_id and e.deleted_at is null
                and e.cancelled_at is null and e.boss_decision <> 'rejected') then
      raise exception 'Esta obra ya tiene fecha: la pusieron mientras tanto.';
    end if;
  elsif p_kind = 'community' then
    select municipality, status, wants_agenda into v_municipality, v_status, v_wants from public.community_reports
     where id = p_id and deleted_at is null for update;
    if v_municipality is null then raise exception 'No encontramos este reporte.'; end if;
    if not v_wants then raise exception 'Este reporte no va a la agenda del jefe.'; end if;
    if v_status in ('finished', 'suspended') then raise exception 'Este reporte ya está cerrado.'; end if;
    if exists (select 1 from public.events e where e.community_report_id = p_id and e.deleted_at is null
                and e.cancelled_at is null and e.boss_decision <> 'rejected') then
      raise exception 'Este reporte ya tiene fecha: la pusieron mientras tanto.';
    end if;
  else
    raise exception 'Tipo de ficha desconocido.';
  end if;

  perform set_config('app.trusted_update', 'on', true);
  insert into public.events (title, place_name, municipality, summary, created_by, origin, boss_decision,
                             obra_ficha_id, community_report_id)
  values (btrim(p_title), coalesce(btrim(p_place), ''), v_municipality, coalesce(left(v_brief ->> 'summary', 1000), ''), auth.uid(),
          case when p_kind = 'obra' then 'ivt' else 'politics' end,
          case when public.has_role('boss') and not public.has_role('dispatch') then 'accepted' else 'pending' end,
          case when p_kind = 'obra' then p_id end, case when p_kind = 'community' then p_id end)
  returning id into v_event;
  insert into public.event_schedule (event_id, starts_at, ends_at, exact_address, directions, site_contacts)
  values (v_event, p_starts, p_ends, coalesce(p_address, ''), coalesce(p_directions, ''), coalesce(p_contacts, ''));
  insert into public.event_brief (event_id, work_description, led_by, in_charge, achievements, key_facts, protocol, notes)
  values (v_event, coalesce(v_brief ->> 'work_description', ''), coalesce(v_brief ->> 'led_by', ''),
          coalesce(v_brief ->> 'in_charge', ''), coalesce(v_brief ->> 'achievements', ''),
          coalesce(v_brief ->> 'key_facts', ''), coalesce(v_brief ->> 'protocol', ''), coalesce(v_brief ->> 'notes', ''));
  if p_kind = 'obra' then
    update public.obra_fichas set stage = 'scheduled' where id = p_id;
  else
    insert into public.ficha_updates (community_report_id, kind, actor_id) values (p_id, 'scheduled', auth.uid());
  end if;
  perform set_config('app.trusted_update', v_trusted, true);
  return v_event;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Who changed what in an event (boss and despacho with 2FA only: the schedule's old values hold addresses).
--    One row per change, with the fields that changed and their value before and after.
-- ---------------------------------------------------------------------------
create function public.event_history(p_event uuid)
returns table (at timestamptz, actor_id uuid, actor_name text, table_name text, action text, changes jsonb)
language sql stable security definer set search_path = public as $$
  select a.at, a.actor_id, coalesce(nullif(p.full_name, ''), p.email), a.table_name, a.action,
         coalesce((select jsonb_object_agg(k, jsonb_build_object('before', a.old_data -> k, 'after', a.new_data -> k))
                     from jsonb_object_keys(coalesce(a.new_data, '{}'::jsonb) || coalesce(a.old_data, '{}'::jsonb)) k
                    where k not in ('id', 'event_id', 'storyboard_id', 'code', 'rev', 'updated_at', 'updated_by', 'created_at', 'created_by')
                      and (a.old_data -> k) is distinct from (a.new_data -> k)
                      and (a.old_data is not null or coalesce(a.new_data -> k, 'null'::jsonb) not in ('null'::jsonb, '""'::jsonb))),
                  '{}'::jsonb)
    from public.audit_log a
    left join public.profiles p on p.id = a.actor_id
   where public.can_manage_agenda()
     and ((a.table_name in ('events', 'event_schedule', 'event_brief', 'event_assignments') and a.row_id = p_event::text)
          or (a.table_name = 'storyboards' and a.row_id in (select s.id::text from public.storyboards s where s.event_id = p_event))
          or (a.table_name = 'storyboard_blocks' and a.row_id in (
                select b.id::text from public.storyboard_blocks b join public.storyboards s on s.id = b.storyboard_id
                 where s.event_id = p_event)))
   order by a.at desc, a.id desc
   limit 200
$$;

-- ---------------------------------------------------------------------------
-- 9. Who can record an event (per person: each camera person sees only what is assigned to them). The boss,
--    despacho and Redes assign Grabación, but user_roles is readable only by admin: this gives them the names of the
--    active camera people, nothing else.
-- ---------------------------------------------------------------------------
create function public.camera_people()
returns table (id uuid, full_name text)
language sql stable security definer set search_path = public as $$
  select p.id, coalesce(nullif(p.full_name, ''), p.email)
    from public.profiles p
   where public.has_any_role(array['admin', 'boss', 'dispatch', 'social']::public.app_role[])
     and p.active and p.deleted_at is null
     and exists (select 1 from public.user_roles ur where ur.user_id = p.id and ur.role = 'camera')
   order by 2
$$;

-- ---------------------------------------------------------------------------
-- 10. Privileges (rule of 20261026001400_functions_closed_to_anon.sql). CREATE OR REPLACE keeps a function's grants;
--    they are stated again so this file reads on its own. Trigger functions: nobody calls them.
-- ---------------------------------------------------------------------------
revoke all on function public.can_manage_agenda() from public, anon;
revoke all on function public.can_edit_event(uuid) from public, anon;
revoke all on function public.can_see_event(uuid) from public, anon;
revoke all on function public.can_see_schedule(uuid) from public, anon;
revoke all on function public.mark_event_done(uuid) from public, anon;
revoke all on function public.report_has_live_event(uuid) from public, anon;
revoke all on function public.schedule_ficha(text, uuid, text, text, timestamptz, timestamptz, text, text, text, jsonb) from public, anon;
revoke all on function public.event_history(uuid) from public, anon;
revoke all on function public.camera_people() from public, anon;
grant execute on function public.camera_people() to authenticated;
grant execute on function public.can_manage_agenda(), public.can_edit_event(uuid), public.can_see_event(uuid),
  public.can_see_schedule(uuid), public.mark_event_done(uuid), public.report_has_live_event(uuid),
  public.schedule_ficha(text, uuid, text, text, timestamptz, timestamptz, text, text, text, jsonb),
  public.event_history(uuid) to authenticated;
revoke all on function public.guard_event_insert() from public, anon, authenticated;
revoke all on function public.guard_event_update() from public, anon, authenticated;
revoke all on function public.events_kind_from_source() from public, anon, authenticated;
revoke all on function public.stamp_updated_by() from public, anon, authenticated;
revoke all on function public.events_source_sync() from public, anon, authenticated;

revoke all on public.event_calendar from public, anon;
grant select on public.event_calendar to authenticated;
revoke all on public.agenda_to_schedule from public, anon;
grant select on public.agenda_to_schedule to authenticated;
