-- Fixes from the review of the shared agenda (20261027002000_shared_agenda.sql, already applied: this file goes after
-- it and changes nothing in it).
--   1. mark_event_done(): only who may see the date writes the day it happened (can_see_schedule(): the boss and
--      despacho with 2FA, Grabación on its own events), and only once the event has started. Administración reads
--      the agenda and does not mark it. Before, a first-factor session could use it to learn the day (an error for a
--      future day, the day itself for later today), and done_on (which Redes, política, the IVT and Realtime read)
--      could appear hours before the event. Whoever may not mark it gets the same «No autorizado», whatever the event.
--   2. guard_event_update(): deciding (boss_decision) and rating (priority) need can_approve() (the boss WITH 2FA);
--      the boss keeps work_status and urgency on his role alone (what Redes' screens do, without 2FA too).
--      Administración soft-deletes and restores an event only with 2FA (it pulls a visit off every agenda).
--   3. agenda_last_writers(): whom «cambió lo mismo que tú» goes to. The person whose value a save replaces is the
--      last one who changed THAT field (or that storyboard block), read from audit_log; not whoever saved the row last.
--      Names fields and people, never a value.
--   4. event_history(): also gives each storyboard block's content (inserted and soft-deleted blocks showed only
--      «creó/borró»), and the storyboard part (storyboards and their blocks, never the schedule) to whoever edits
--      the storyboard: Redes, the boss and administración (2FA). The rest, as before: boss and despacho with 2FA.
-- No enum values, no rows, nothing new in the Realtime publication.

-- ---------------------------------------------------------------------------
-- 1. Marking an event done
-- ---------------------------------------------------------------------------
create or replace function public.mark_event_done(e uuid)
returns date language plpgsql security definer set search_path = public as $$
declare
  s timestamptz;
  d date;
  tz text := coalesce((select value #>> '{}' from public.app_settings where key = 'app.timezone'), 'America/Caracas');
  v_trusted text := coalesce(current_setting('app.trusted_update', true), '');
begin
  -- Authorised first, and the same answer for any event otherwise: nothing here tells a day to someone who cannot
  -- read it. can_see_schedule() also opens the date to admin and the IVT: neither marks an event done.
  if e is null or not (
       public.can_see_schedule(e)
       and (public.has_any_role(array['boss', 'dispatch']::public.app_role[])
            or (public.has_role('camera') and public.is_assigned(e)))
       and exists (select 1 from public.events where id = e and deleted_at is null)) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if exists (select 1 from public.events where id = e and cancelled_at is not null) then
    raise exception 'Este evento está cancelado: no se marca realizado.';
  end if;
  select starts_at into s from public.event_schedule where event_id = e;
  if s is null then raise exception 'El evento no tiene fecha.'; end if;
  -- Started, not just «today»: done_on reaches Redes, política, the IVT and Realtime.
  if s > now() then raise exception 'El evento todavía no ha empezado.'; end if;
  d := (s at time zone tz)::date;
  perform set_config('app.trusted_update', 'on', true);
  update public.events set done_on = d,
    work_status = case when work_status in ('brief', 'storyboard', 'recording') then 'material' else work_status end
   where id = e;
  perform set_config('app.trusted_update', v_trusted, true);
  return d;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Column guard on events
--   boss and despacho (with 2FA): the event's data, its kind and the cancel columns (cancelling stamps who and when);
--   the boss WITH 2FA (can_approve()): priority and boss_decision; the boss and Redes: work_status and urgency;
--   administración WITH 2FA: deleted_at only (the soft delete, guard_soft_delete).
--   origin, created_by, done_on, code and the ficha links change only through trusted paths (and the links never by
--   a person: guard_event_source_links, for every role).
-- ---------------------------------------------------------------------------
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
  if public.can_approve() then allowed := allowed || array['priority', 'boss_decision']; end if;
  if public.has_role('boss') then allowed := allowed || array['work_status', 'urgency']; end if;
  if public.has_role('social') then allowed := allowed || array['work_status', 'urgency']; end if;
  if public.has_role('admin') and public.mfa_ok() then allowed := allowed || array['deleted_at']; end if;
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

-- ---------------------------------------------------------------------------
-- 3. Who wrote what a save is about to replace. For events, event_schedule, event_brief and storyboards: per field
--    in p_keys, the person of the newest audit row of that event's row where the field changed (insert included).
--    «Duración» (ends_at of event_schedule) is end minus start: moving an event keeps it, so a move does not count.
--    For storyboard_blocks: per block id in p_keys (blocks of this event only), the person of the newest audit row
--    of that block. The actor may be null (the system) or the caller: the app leaves those out.
--    Who may ask: whoever may save that row (the agenda: boss and despacho with 2FA; the storyboard also Redes, the
--    boss and administración, with 2FA where their role needs it).
-- ---------------------------------------------------------------------------
create function public.agenda_last_writers(p_table text, p_event uuid, p_keys text[])
returns table (key text, actor_id uuid)
language sql stable security definer set search_path = public as $$
  select distinct on (k.f) k.f, a.actor_id
    from unnest(p_keys) as k(f)
    join public.audit_log a
      on a.table_name = p_table
     and a.action in ('insert', 'update', 'soft_delete')
     and a.row_id = case
           when p_table in ('events', 'event_schedule', 'event_brief') then p_event::text
           when p_table = 'storyboards' then (select s.id::text from public.storyboards s where s.event_id = p_event)
           when p_table = 'storyboard_blocks' then (
             select b.id::text from public.storyboard_blocks b join public.storyboards s on s.id = b.storyboard_id
              where s.event_id = p_event and b.id::text = k.f)
         end
     and case
           when p_table = 'storyboard_blocks' then true
           when p_table = 'event_schedule' and k.f = 'ends_at' then
             ((a.new_data ->> 'ends_at')::timestamptz - (a.new_data ->> 'starts_at')::timestamptz)
               is distinct from ((a.old_data ->> 'ends_at')::timestamptz - (a.old_data ->> 'starts_at')::timestamptz)
           else (a.old_data -> k.f) is distinct from (a.new_data -> k.f)
         end
   where case
           when p_table in ('events', 'event_schedule', 'event_brief') then public.can_manage_agenda()
           when p_table in ('storyboards', 'storyboard_blocks') then public.can_manage_agenda()
             or (public.has_any_role(array['admin', 'social', 'boss']::public.app_role[]) and public.mfa_ok()
                 and public.can_see_event(p_event))
           else false
         end
   order by k.f, a.at desc, a.id desc
$$;

-- ---------------------------------------------------------------------------
-- 4. Who changed what in an event. Boss and despacho (2FA): every row (the schedule's old values hold addresses).
--    Redes, the boss and administración (2FA where their role needs it), who edit the storyboard: its rows only, so
--    «lo tuyo quedó en el historial» is true for them too. `block` = a storyboard block's content (inserted,
--    changed or soft-deleted), so a block nobody kept can still be read.
--    The return type changes (one more column): dropped and created again, with its grants.
-- ---------------------------------------------------------------------------
drop function public.event_history(uuid);
create function public.event_history(p_event uuid)
returns table (at timestamptz, actor_id uuid, actor_name text, table_name text, action text, changes jsonb, block jsonb)
language sql stable security definer set search_path = public as $$
  select a.at, a.actor_id, coalesce(nullif(p.full_name, ''), p.email), a.table_name, a.action,
         coalesce((select jsonb_object_agg(k, jsonb_build_object('before', a.old_data -> k, 'after', a.new_data -> k))
                     from jsonb_object_keys(coalesce(a.new_data, '{}'::jsonb) || coalesce(a.old_data, '{}'::jsonb)) k
                    where k not in ('id', 'event_id', 'storyboard_id', 'code', 'rev', 'updated_at', 'updated_by', 'created_at', 'created_by')
                      and (a.old_data -> k) is distinct from (a.new_data -> k)
                      and (a.old_data is not null or coalesce(a.new_data -> k, 'null'::jsonb) not in ('null'::jsonb, '""'::jsonb))),
                  '{}'::jsonb),
         case when a.table_name = 'storyboard_blocks' then
           (select jsonb_object_agg(k, d -> k)
              from (select coalesce(a.new_data, a.old_data) as d) x,
                   unnest(array['shot', 'angle', 'boss_line', 'broll', 'fact', 'fact_source']) k
             where coalesce(d ->> k, '') <> '')
         end
    from public.audit_log a
    left join public.profiles p on p.id = a.actor_id
   where (
           public.can_manage_agenda()
           and a.table_name in ('events', 'event_schedule', 'event_brief', 'event_assignments')
           and a.row_id = p_event::text
         )
      or (
           (public.can_manage_agenda()
            or (public.has_any_role(array['admin', 'social', 'boss']::public.app_role[]) and public.mfa_ok()
                and public.can_see_event(p_event)))
           and ((a.table_name = 'storyboards' and a.row_id in (select s.id::text from public.storyboards s where s.event_id = p_event))
                or (a.table_name = 'storyboard_blocks' and a.row_id in (
                      select b.id::text from public.storyboard_blocks b join public.storyboards s on s.id = b.storyboard_id
                       where s.event_id = p_event)))
         )
   order by a.at desc, a.id desc
   limit 200
$$;

-- ---------------------------------------------------------------------------
-- 5. Privileges (rule of 20261026001400_functions_closed_to_anon.sql). CREATE OR REPLACE keeps a function's grants;
--    they are stated again so this file reads on its own. Trigger functions: nobody calls them.
-- ---------------------------------------------------------------------------
revoke all on function public.mark_event_done(uuid) from public, anon;
grant execute on function public.mark_event_done(uuid) to authenticated;
revoke all on function public.agenda_last_writers(text, uuid, text[]) from public, anon;
grant execute on function public.agenda_last_writers(text, uuid, text[]) to authenticated;
revoke all on function public.event_history(uuid) from public, anon;
grant execute on function public.event_history(uuid) to authenticated;
revoke all on function public.guard_event_update() from public, anon, authenticated;
