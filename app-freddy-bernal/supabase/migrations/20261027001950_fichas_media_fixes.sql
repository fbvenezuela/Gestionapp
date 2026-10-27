-- Fixes found in the review of the fichas (20261027001700_fichas.sql) and the material (20261027001900_media_handoff.sql).
-- Nothing here edits those files.
--
--   1. The link from an event to a ficha (events.obra_ficha_id / events.community_report_id) is set only by the system
--      or a trusted path (schedule_ficha() of the shared agenda, the seed). guard_event_update lets admin and despacho
--      change any column, so either could point any event at any obra, even a draft, and open it (and its photos) to
--      Redes and to the camera person of that event. New trigger guard_event_source_links, on insert and update, for
--      every person. The shared agenda may fold it into guard_event_insert / guard_event_update; it must keep the rule.
--   2. Redes and Grabación read an obra only while a LIVE visit links to it: not deleted and not rejected by the boss.
--      (The shared agenda adds «and not cancelled» when it creates events.cancelled_at.) media_select's obra branch
--      reads obra_fichas under RLS, so a ficha's photos follow.
--   3. A ficha's code, created_at and updated_at belong to the database. A person could give an obra an event's code
--      (E-0002: its files went to that event's Drive folders and downloads), take the next number (the next save
--      failed), put a date in a code (it shows in file names) or backdate a ficha. guard_ficha_insert now gives the
--      code (no column default: a default would spend a number that the trigger then replaces) and the times; the
--      code always looks like O-0001 / R-0001. The sequences are no longer usable by API roles.
--   4. «Lo que voy a decir» (fab_dialog) is free text that Redes reads: its old and new text no longer go into the
--      history JSON, only the field name (the app refuses contacts and phone numbers in it, too).
--   5. media_update: admin edits any file; Redes and the boss only the files they can read (Redes never touches a
--      report's evidence, which it cannot see).
--   6. report_has_live_event(id): política gets «Ya tiene fecha» for its report WITHOUT the date. Política never reads
--      events or event_schedule; this answers yes or no only, and only to the report's roles.

-- ---------------------------------------------------------------------------
-- 1. Event ↔ ficha links: only the system and trusted paths
-- ---------------------------------------------------------------------------
create function public.guard_event_source_links()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.uid() is null or current_setting('app.trusted_update', true) = 'on' then return new; end if;
  if (tg_op = 'INSERT' and (new.obra_ficha_id is not null or new.community_report_id is not null))
     or (tg_op = 'UPDATE' and (new.obra_ficha_id is distinct from old.obra_ficha_id
                               or new.community_report_id is distinct from old.community_report_id)) then
    raise exception 'Un evento se une a una ficha solo con «Ponerle fecha»; no se cambia a mano.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger guard_event_source_links before insert or update on public.events
  for each row execute function public.guard_event_source_links();

-- ---------------------------------------------------------------------------
-- 2. Redes and Grabación: the main part of an obra only while a live visit they can see links to it
-- ---------------------------------------------------------------------------
drop policy obra_fichas_select on public.obra_fichas;
-- Inline (not through a helper) so INSERT ... RETURNING sees the new row.
create policy obra_fichas_select on public.obra_fichas for select to authenticated
  using ((deleted_at is null and (
           public.has_any_role(array['admin', 'boss', 'dispatch', 'ivt']::public.app_role[])
           or (public.has_any_role(array['social', 'camera']::public.app_role[])
               and exists (select 1 from public.events e
                            where e.obra_ficha_id = obra_fichas.id and e.deleted_at is null and e.boss_decision <> 'rejected'
                              and public.can_see_event(e.id)))))
         or (deleted_at is not null and public.has_role('admin')));

-- ---------------------------------------------------------------------------
-- 3. Codes and creation times: the database's, never the person's
-- ---------------------------------------------------------------------------
create function public.guard_ficha_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.code is null or auth.uid() is not null then
    new.code := case when tg_table_name = 'obra_fichas'
                     then 'O-' || lpad(nextval('public.obra_code_seq')::text, 4, '0')
                     else 'R-' || lpad(nextval('public.report_code_seq')::text, 4, '0') end;
  end if;
  if auth.uid() is not null then
    new.created_at := now();
    new.updated_at := now();
  end if;
  return new;
end $$;

alter table public.obra_fichas alter column code drop default;
alter table public.community_reports alter column code drop default;
alter table public.obra_fichas add constraint obra_fichas_code_shape check (code ~ '^O-[0-9]{4,}$');
alter table public.community_reports add constraint community_reports_code_shape check (code ~ '^R-[0-9]{4,}$');
create trigger guard_ficha_insert_obra_fichas before insert on public.obra_fichas
  for each row execute function public.guard_ficha_insert();
create trigger guard_ficha_insert_community_reports before insert on public.community_reports
  for each row execute function public.guard_ficha_insert();
revoke all on sequence public.obra_code_seq, public.report_code_seq from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. History of the main tables: the same as before, except that fab_dialog keeps its field name only.
-- ---------------------------------------------------------------------------
create or replace function public.ficha_history()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_obra uuid;
  v_report uuid;
  v_state text := case when tg_table_name = 'obra_fichas' then 'stage' else 'status' end;
  v_new jsonb := to_jsonb(new);
  v_old jsonb;
  v_note text := left(nullif(btrim(coalesce(current_setting('app.history_note', true), '')), ''), 2000);
  v_kind text;
  v_fields text[];
  v_changes jsonb;
  v_rows jsonb[] := '{}';
  r jsonb;
begin
  if tg_table_name = 'obra_fichas' then v_obra := new.id; else v_report := new.id; end if;
  if tg_op = 'INSERT' then
    v_rows := array_append(v_rows, jsonb_build_object('kind', 'created', 'to', v_new ->> v_state));
  else
    v_old := to_jsonb(old);
    if (v_old ->> 'deleted_at') is null and (v_new ->> 'deleted_at') is not null then
      v_rows := array_append(v_rows, jsonb_build_object('kind', 'deleted'));
    elsif (v_old ->> 'deleted_at') is not null and (v_new ->> 'deleted_at') is null then
      v_rows := array_append(v_rows, jsonb_build_object('kind', 'restored'));
    end if;
    if (v_new ->> v_state) is distinct from (v_old ->> v_state) then
      v_kind := case when v_state = 'stage' and v_new ->> v_state = 'scheduled' then 'scheduled'
                     when v_state = 'stage' and v_new ->> v_state = 'done' then 'done'
                     else 'status' end;
      v_rows := array_append(v_rows, jsonb_build_object('kind', v_kind, 'from', v_old ->> v_state, 'to', v_new ->> v_state));
    end if;
    -- Free text Redes reads («Lo que voy a decir»): which field changed, never what it said.
    select coalesce(array_agg(n.key order by n.key), '{}'),
           coalesce(jsonb_object_agg(n.key, jsonb_build_array(v_old -> n.key, n.value)) filter (where n.key <> 'fab_dialog'), '{}'::jsonb)
      into v_fields, v_changes
      from jsonb_each(v_new) n
     where n.value is distinct from (v_old -> n.key)
       and n.key not in ('id', 'code', 'created_by', 'created_at', 'updated_at', 'deleted_at', 'rev', 'stage', 'status');
    if cardinality(v_fields) > 0 then
      v_rows := array_append(v_rows, jsonb_build_object('kind', 'update', 'fields', to_jsonb(v_fields), 'changes', v_changes));
    end if;
  end if;
  foreach r in array v_rows loop
    insert into public.ficha_updates (obra_ficha_id, community_report_id, kind, from_value, to_value, fields, changes, note, actor_id)
    values (v_obra, v_report, r ->> 'kind', r ->> 'from', r ->> 'to',
            coalesce(array(select jsonb_array_elements_text(r -> 'fields')), '{}'), r -> 'changes', v_note, auth.uid());
    if v_note is not null then
      v_note := null;
      perform set_config('app.history_note', '', true);
    end if;
  end loop;
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Changing a file: your own upload; admin any; Redes and the boss only what they can read (media_select).
-- ---------------------------------------------------------------------------
drop policy media_update on public.media_assets;
create policy media_update on public.media_assets for update to authenticated
  using (uploaded_by = auth.uid() or public.has_role('admin')
         or (public.has_any_role(array['social', 'boss']::public.app_role[]) and deleted_at is null and (
               (event_id is not null and public.can_see_event(event_id))
               or (event_id is null and obra_ficha_id is null and community_report_id is null)
               or (obra_ficha_id is not null
                   and exists (select 1 from public.obra_fichas f where f.id = media_assets.obra_ficha_id))
               or (community_report_id is not null
                   and exists (select 1 from public.community_reports r where r.id = media_assets.community_report_id)))))
  with check (uploaded_by = auth.uid() or public.has_any_role(array['admin', 'social', 'boss']::public.app_role[]));

-- ---------------------------------------------------------------------------
-- 6. «Ya tiene fecha» for a report, without the date: a dated, live event links to it.
-- ---------------------------------------------------------------------------
create function public.report_has_live_event(p_report uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_any_role(array['admin', 'boss', 'dispatch', 'politics']::public.app_role[])
    and exists (select 1 from public.community_reports r where r.id = p_report and r.deleted_at is null)
    and exists (select 1 from public.events e join public.event_schedule sc on sc.event_id = e.id
                 where e.community_report_id = p_report and e.deleted_at is null and e.boss_decision <> 'rejected')
$$;

-- ---------------------------------------------------------------------------
-- Privileges (rule of 20261026001400_functions_closed_to_anon.sql). CREATE OR REPLACE keeps a function's grants;
-- they are stated again so this file reads on its own.
-- ---------------------------------------------------------------------------
revoke all on function public.guard_event_source_links() from public, anon, authenticated;
revoke all on function public.guard_ficha_insert() from public, anon, authenticated;
revoke all on function public.ficha_history() from public, anon, authenticated;
revoke all on function public.report_has_live_event(uuid) from public, anon;
grant execute on function public.report_has_live_event(uuid) to authenticated;
