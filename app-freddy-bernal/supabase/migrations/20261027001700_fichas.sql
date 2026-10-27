-- Fichas (Hillary, 27/10/2026, §4.1 and §4.2): the obra ficha the Director del IVT fills before the boss's visit,
-- and the community report the Director de política fills per municipality.
--   * Same split as the agenda (event_schedule): third-party names and phones, and what the boss must know, live
--     ONLY in obra_ficha_private / community_report_private, readable by the ficha's roles WITH 2FA (mfa_ok()).
--     Redes never reads a community report nor any private row; Grabación and Redes read the main part of an obra
--     only when a live event they can see links to it (the visit already has a date).
--   * The link to the agenda lives on the event: events.obra_ficha_id / events.community_report_id (at most one).
--     Only schedule_ficha() (20261027001800_shared_agenda.sql) sets them; stage 'scheduled' and 'done' change only
--     through trusted paths (that function, the cancel/done sync), never by hand.
--   * Every ficha keeps its history in ficha_updates: written by trigger, append-only for everyone (people, the
--     owner, system jobs). For the private tables it keeps the FIELD NAMES only, so a phone or a name never lands
--     in it; the visit date never does either (it is not in these tables). People add 'note' rows only.
--   * Values are English (labels in src/lib/data/ficha-labels.ts). A field answered «No aplica» / «Por confirmar»
--     is stored empty and named in `marks` ({"<field>": "not_applicable" | "to_confirm"}).
--   * Parishes: setting 'parishes' ({"<municipality>": [names]}) is empty until the official list arrives; while a
--     municipality has no list, any parish text of 100 characters or fewer is accepted (check_territory).
-- NOT here: media_assets policies and kinds (20261027001900_media_handoff.sql), events policies and guards, rev on
-- the agenda tables and the «Por ponerle fecha» view (20261027001800_shared_agenda.sql).

create sequence public.obra_code_seq;
create sequence public.report_code_seq;

-- ---------------------------------------------------------------------------
-- 1. Obra fichas (IVT). The visit date is NOT here: it is the linked event's event_schedule.
-- ---------------------------------------------------------------------------
create table public.obra_fichas (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('O-' || lpad(nextval('public.obra_code_seq')::text, 4, '0')),
  stage text not null default 'draft' check (stage in ('draft', 'to_schedule', 'scheduled', 'done', 'archived')),
  -- 1 Datos generales («fecha de actualización» = updated_at)
  name text not null check (char_length(btrim(name)) between 3 and 140),
  municipality text not null check (char_length(municipality) between 1 and 80),
  parish text not null default '' check (char_length(parish) <= 100),
  sector text not null default '' check (char_length(sector) <= 200),
  engineer_name text not null default '' check (char_length(engineer_name) <= 200),
  -- 2 Sobre la obra
  problem text not null default '' check (char_length(problem) <= 1000),
  problem_since text not null default '' check (char_length(problem_since) <= 200),
  why_decided text not null default '' check (char_length(why_decided) <= 1000),
  works text not null default '' check (char_length(works) <= 2000),
  communities text not null default '' check (char_length(communities) <= 500),
  people_count int check (people_count >= 0),
  families_count int check (families_count >= 0),
  benefits text not null default '' check (char_length(benefits) <= 1000),
  -- 4 Avance y entrega («tiempo restante» is computed on screen, never stored)
  executor text not null default '' check (char_length(executor) <= 300),
  investment text not null default '' check (char_length(investment) <= 200),
  currency text not null default '' check (currency in ('', 'VES', 'USD', 'EUR', 'COP', 'other')),
  funding_source text not null default '' check (char_length(funding_source) <= 300),
  work_state text check (work_state in ('not_started', 'in_progress', 'stalled', 'finished')),
  progress_pct smallint check (progress_pct between 0 and 100),
  started_on date,
  due_on date,
  difficulties text not null default '' check (char_length(difficulties) <= 1000),
  solutions text not null default '' check (char_length(solutions) <= 1000),
  -- 5 Comunidad y seguimiento
  other_aid text not null default '' check (char_length(other_aid) <= 1000),
  pending_needs text not null default '' check (char_length(pending_needs) <= 1000),
  next_action text not null default '' check (char_length(next_action) <= 500),
  follow_up_owner text not null default '' check (char_length(follow_up_owner) <= 200),
  follow_up_due date,
  -- «Lo que voy a decir» (FAB template, editable)
  fab_dialog text not null default '' check (char_length(fab_dialog) <= 6000),
  fab_generated_by text check (fab_generated_by in ('template', 'manual')),
  marks jsonb not null default '{}'::jsonb check (jsonb_typeof(marks) = 'object'
    and not jsonb_path_exists(marks, 'strict $.keyvalue() ? (!(@.key like_regex "^[a-z][a-z0-9_]{0,59}$"))')
    and not jsonb_path_exists(marks, 'strict $.* ? (@.type() != "string" || (@ != "not_applicable" && @ != "to_confirm"))')),
  rev int not null default 1,
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index obra_fichas_municipality_idx on public.obra_fichas (municipality, stage) where deleted_at is null;

-- Contacts and the boss's briefing: NEVER readable by Redes or Grabación. `id` is the ficha's id (audit row_id).
create table public.obra_ficha_private (
  id uuid primary key references public.obra_fichas (id),
  engineer_phone text not null default '' check (char_length(engineer_phone) <= 40 and engineer_phone ~ '^[0-9+() .-]*$'),
  -- 3 Reporte de la comunidad
  reporter_name text not null default '' check (char_length(reporter_name) <= 200),
  reported_when text not null default '' check (char_length(reported_when) <= 200),
  reported_via text not null default '' check (char_length(reported_via) <= 100),
  reporter_attends text check (reporter_attends in ('yes', 'no', 'to_confirm')),
  representative text not null default '' check (char_length(representative) <= 300),
  liaison_name text not null default '' check (char_length(liaison_name) <= 200),
  liaison_phone text not null default '' check (char_length(liaison_phone) <= 40 and liaison_phone ~ '^[0-9+() .-]*$'),
  -- 5 «Qué debe saber o decidir el gobernador en la visita»
  boss_should_know text not null default '' check (char_length(boss_should_know) <= 1000),
  marks jsonb not null default '{}'::jsonb check (jsonb_typeof(marks) = 'object'
    and not jsonb_path_exists(marks, 'strict $.keyvalue() ? (!(@.key like_regex "^[a-z][a-z0-9_]{0,59}$"))')
    and not jsonb_path_exists(marks, 'strict $.* ? (@.type() != "string" || (@ != "not_applicable" && @ != "to_confirm"))')),
  rev int not null default 1,
  updated_by uuid references public.profiles (id) default auth.uid(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. Community reports (política). One per activity or situation.
-- ---------------------------------------------------------------------------
create table public.community_reports (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('R-' || lpad(nextval('public.report_code_seq')::text, 4, '0')),
  wants_agenda boolean not null default false,          -- «¿Va a la agenda del jefe?»
  -- 2 Ubicación (dirección y referencia: private)
  municipality text not null check (char_length(municipality) between 1 and 80),
  parish text not null default '' check (char_length(parish) <= 100),
  community text not null default '' check (char_length(community) <= 200),
  -- 3 Actividad o asunto
  title text not null check (char_length(btrim(title)) between 3 and 140),
  type text not null check (type in ('delivery', 'benefit', 'event', 'repair', 'outreach', 'request', 'incident', 'other')),
  -- 4 Fecha del reporte (la de la actividad: private)
  reported_at timestamptz not null default now(),
  -- 5 Descripción
  description text not null default '' check (char_length(description) <= 2000),
  why_matters text not null default '' check (char_length(why_matters) <= 1000),
  -- 6 Responsables
  in_charge text not null default '' check (char_length(in_charge) <= 200),
  institution text not null default '' check (char_length(institution) <= 300),
  collaborators text not null default '' check (char_length(collaborators) <= 500),
  -- 7 Beneficiados o afectados
  people_count int check (people_count >= 0),
  families_count int check (families_count >= 0),
  sectors text not null default '' check (char_length(sectors) <= 500),
  figures_kind text check (figures_kind in ('confirmed', 'estimated')),
  -- 8 Estado y resultados
  status text not null default 'planned' check (status in ('planned', 'in_progress', 'finished', 'pending', 'suspended')),
  results text not null default '' check (char_length(results) <= 2000),
  -- 9 Seguimiento
  pending_support text not null default '' check (char_length(pending_support) <= 1000),
  priority text check (priority in ('high', 'medium', 'low')),
  priority_reason text not null default '' check (char_length(priority_reason) <= 300),
  follow_up_owner text not null default '' check (char_length(follow_up_owner) <= 200),
  follow_up_due date,
  -- 10 Evidencias y observaciones (the files are media_assets)
  evidence_url text not null default '' check (evidence_url = '' or (evidence_url ~ '^https://' and char_length(evidence_url) <= 500)),
  observations text not null default '' check (char_length(observations) <= 2000),
  marks jsonb not null default '{}'::jsonb check (jsonb_typeof(marks) = 'object'
    and not jsonb_path_exists(marks, 'strict $.keyvalue() ? (!(@.key like_regex "^[a-z][a-z0-9_]{0,59}$"))')
    and not jsonb_path_exists(marks, 'strict $.* ? (@.type() != "string" || (@ != "not_applicable" && @ != "to_confirm"))')),
  rev int not null default 1,
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index community_reports_municipality_idx on public.community_reports (municipality, status) where deleted_at is null;
create index community_reports_follow_up_idx on public.community_reports (follow_up_due)
  where deleted_at is null and status not in ('finished', 'suspended');
create index community_reports_agenda_idx on public.community_reports (created_at) where wants_agenda and deleted_at is null;

create table public.community_report_private (
  id uuid primary key references public.community_reports (id),
  -- 1 Persona que reporta
  reporter_name text not null default '' check (char_length(reporter_name) <= 200),
  reporter_role text not null default '' check (char_length(reporter_role) <= 200),
  reporter_phone text not null default '' check (char_length(reporter_phone) <= 40 and reporter_phone ~ '^[0-9+() .-]*$'),
  -- 2 Dirección y referencia
  address text not null default '' check (char_length(address) <= 500),
  reference text not null default '' check (char_length(reference) <= 500),
  -- 4 Fecha y hora de la actividad o situación (only a suggestion when it goes to the agenda)
  activity_at timestamptz,
  marks jsonb not null default '{}'::jsonb check (jsonb_typeof(marks) = 'object'
    and not jsonb_path_exists(marks, 'strict $.keyvalue() ? (!(@.key like_regex "^[a-z][a-z0-9_]{0,59}$"))')
    and not jsonb_path_exists(marks, 'strict $.* ? (@.type() != "string" || (@ != "not_applicable" && @ != "to_confirm"))')),
  rev int not null default 1,
  updated_by uuid references public.profiles (id) default auth.uid(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. The history of every ficha: append-only, never overwritten.
--   changes: {"<field>": [old, new]} of MAIN-table fields only. Private tables: field names in `fields`, nothing else.
-- ---------------------------------------------------------------------------
create table public.ficha_updates (
  id uuid primary key default gen_random_uuid(),
  obra_ficha_id uuid references public.obra_fichas (id),
  community_report_id uuid references public.community_reports (id),
  kind text not null check (kind in ('created', 'status', 'update', 'contact', 'scheduled', 'done', 'note', 'deleted', 'restored')),
  from_value text check (char_length(from_value) <= 40),
  to_value text check (char_length(to_value) <= 40),
  fields text[] not null default '{}' check (cardinality(fields) <= 100),
  changes jsonb check (changes is null or jsonb_typeof(changes) = 'object'),
  note text check (note is null or char_length(note) between 1 and 2000),
  actor_id uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  check (num_nonnulls(obra_ficha_id, community_report_id) = 1)
);
create index ficha_updates_obra_idx on public.ficha_updates (obra_ficha_id, created_at) where obra_ficha_id is not null;
create index ficha_updates_report_idx on public.ficha_updates (community_report_id, created_at) where community_report_id is not null;

-- ---------------------------------------------------------------------------
-- 4. Links: an event born from a ficha, and photos/documents of a ficha. One source, one parent.
-- ---------------------------------------------------------------------------
alter table public.events
  add column obra_ficha_id uuid references public.obra_fichas (id),
  add column community_report_id uuid references public.community_reports (id),
  add constraint events_one_source check (num_nonnulls(obra_ficha_id, community_report_id) <= 1);
create index events_obra_ficha_idx on public.events (obra_ficha_id) where obra_ficha_id is not null;
create index events_community_report_idx on public.events (community_report_id) where community_report_id is not null;

alter table public.media_assets
  add column obra_ficha_id uuid references public.obra_fichas (id),
  add column community_report_id uuid references public.community_reports (id),
  add constraint media_assets_one_parent check (num_nonnulls(event_id, obra_ficha_id, community_report_id) <= 1);
create index media_assets_obra_ficha_idx on public.media_assets (obra_ficha_id, kind)
  where deleted_at is null and obra_ficha_id is not null;
create index media_assets_community_report_idx on public.media_assets (community_report_id, kind)
  where deleted_at is null and community_report_id is not null;

-- ---------------------------------------------------------------------------
-- 5. Triggers
-- ---------------------------------------------------------------------------
-- Audit (every table), admin-only soft delete and updated_at.
select public.wire_standard_triggers('public.obra_fichas', true, true);
select public.wire_standard_triggers('public.obra_ficha_private', false, true);
select public.wire_standard_triggers('public.community_reports', true, true);
select public.wire_standard_triggers('public.community_report_private', false, true);
select public.wire_standard_triggers('public.ficha_updates', false, false);

-- Concurrency token for every shared editable row (fichas here; the agenda tables reuse it). It goes up by one
-- when anything but rev, updated_at and updated_by changes; nobody sets it by hand.
create function public.bump_rev()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.rev := 1;
  elsif (to_jsonb(new) - array['rev', 'updated_at', 'updated_by']) is distinct from
        (to_jsonb(old) - array['rev', 'updated_at', 'updated_by']) then
    new.rev := old.rev + 1;
  else
    new.rev := old.rev;
  end if;
  return new;
end $$;

-- Main tables: the code, the author and the creation time never change, and an obra's stage enters or leaves
-- 'scheduled' / 'done' only through trusted paths (schedule_ficha, the cancel and done sync) or the system.
-- Private tables: the row stays with its ficha, and updated_by is whoever saved it.
create function public.guard_ficha_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name in ('obra_ficha_private', 'community_report_private') then
    if tg_op = 'UPDATE' then
      if new.id is distinct from old.id then
        raise exception 'Los contactos no se pasan a otra ficha.' using errcode = '42501';
      end if;
    end if;
    if auth.uid() is not null then new.updated_by := auth.uid(); end if;
    return new;
  end if;
  if new.id is distinct from old.id or new.code is distinct from old.code
     or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
    raise exception 'El código, el autor y la fecha de creación de una ficha no se cambian.' using errcode = '42501';
  end if;
  if auth.uid() is null or current_setting('app.trusted_update', true) = 'on' then
    return new;
  end if;
  if tg_table_name = 'obra_fichas' then
    if new.stage is distinct from old.stage and (new.stage in ('scheduled', 'done') or old.stage in ('scheduled', 'done')) then
      raise exception 'La fecha de la visita la ponen el jefe o el despacho con «Ponerle fecha»; la ficha cambia sola al agendar, cancelar o realizar la visita.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

-- Municipality from setting 'municipalities'; parish from setting 'parishes' when that municipality has a list.
-- No setting, no check. Raised with P0001 so the Spanish text reaches the person (friendlyDbError).
create function public.check_territory()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_municipalities jsonb;
  v_parishes jsonb;
begin
  new.municipality := btrim(new.municipality);
  new.parish := regexp_replace(btrim(new.parish), '\s+', ' ', 'g');
  if tg_op = 'UPDATE' and new.municipality is not distinct from old.municipality and new.parish is not distinct from old.parish then
    return new;
  end if;
  select value into v_municipalities from public.app_settings where key = 'municipalities';
  if jsonb_typeof(v_municipalities) = 'array' and not (v_municipalities ? new.municipality) then
    raise exception 'El municipio «%» no está en la lista. Elígelo de la lista.', new.municipality;
  end if;
  select value -> new.municipality into v_parishes from public.app_settings where key = 'parishes';
  if jsonb_typeof(v_parishes) = 'array' and jsonb_array_length(v_parishes) > 0 and new.parish <> ''
     and not (v_parishes ? new.parish) then
    raise exception 'La parroquia «%» no está en la lista de %. Elígela de la lista o déjala en blanco.', new.parish, new.municipality;
  end if;
  return new;
end $$;

-- History of the main tables. One statement can write several rows (state change plus field changes). A note set
-- by the action with set_config('app.history_note', …, true) goes on the first row, then is cleared.
create function public.ficha_history()
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
    select coalesce(array_agg(n.key order by n.key), '{}'), jsonb_object_agg(n.key, jsonb_build_array(v_old -> n.key, n.value))
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

-- History of the private tables: WHICH fields changed (names only), never their values.
create function public.ficha_private_history()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_new jsonb := to_jsonb(new);
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end;
  v_fields text[];
begin
  select coalesce(array_agg(n.key order by n.key), '{}') into v_fields
    from jsonb_each(v_new) n
   where n.key not in ('id', 'rev', 'updated_by', 'updated_at')
     and case when tg_op = 'INSERT' then n.value not in ('null'::jsonb, '""'::jsonb, '{}'::jsonb)
              else n.value is distinct from (v_old -> n.key) end;
  if cardinality(v_fields) = 0 then return null; end if;
  insert into public.ficha_updates (obra_ficha_id, community_report_id, kind, fields, actor_id)
  values (case when tg_table_name = 'obra_ficha_private' then new.id end,
          case when tg_table_name = 'community_report_private' then new.id end,
          'contact', v_fields, auth.uid());
  return null;
end $$;

-- The history is never rewritten or deleted: not by people, not by the owner, not by system jobs.
create function public.ficha_updates_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'La historia de la ficha no se borra ni se cambia.' using errcode = '42501';
end $$;

-- BEFORE triggers fire by name: territory (normalizes the parish), guard, rev, soft delete, updated_at.
create trigger check_territory_obra_fichas before insert or update of municipality, parish on public.obra_fichas
  for each row execute function public.check_territory();
create trigger check_territory_community_reports before insert or update of municipality, parish on public.community_reports
  for each row execute function public.check_territory();
create trigger guard_ficha_update_obra_fichas before update on public.obra_fichas
  for each row execute function public.guard_ficha_update();
create trigger guard_ficha_update_community_reports before update on public.community_reports
  for each row execute function public.guard_ficha_update();
create trigger guard_ficha_update_obra_ficha_private before insert or update on public.obra_ficha_private
  for each row execute function public.guard_ficha_update();
create trigger guard_ficha_update_community_report_private before insert or update on public.community_report_private
  for each row execute function public.guard_ficha_update();
create trigger rev_obra_fichas before insert or update on public.obra_fichas
  for each row execute function public.bump_rev();
create trigger rev_obra_ficha_private before insert or update on public.obra_ficha_private
  for each row execute function public.bump_rev();
create trigger rev_community_reports before insert or update on public.community_reports
  for each row execute function public.bump_rev();
create trigger rev_community_report_private before insert or update on public.community_report_private
  for each row execute function public.bump_rev();
create trigger ficha_history_obra_fichas after insert or update on public.obra_fichas
  for each row execute function public.ficha_history();
create trigger ficha_history_community_reports after insert or update on public.community_reports
  for each row execute function public.ficha_history();
create trigger ficha_history_obra_ficha_private after insert or update on public.obra_ficha_private
  for each row execute function public.ficha_private_history();
create trigger ficha_history_community_report_private after insert or update on public.community_report_private
  for each row execute function public.ficha_private_history();
create trigger ficha_updates_append_only before update or delete on public.ficha_updates
  for each row execute function public.ficha_updates_immutable();
create trigger ficha_updates_no_truncate before truncate on public.ficha_updates
  for each statement execute function public.ficha_updates_immutable();

-- ---------------------------------------------------------------------------
-- 6. RLS. Obras: admin, boss, dispatch, IVT; Redes and Grabación only the main part of an obra whose live event
--    they can see. Reports: admin, boss, dispatch, política. Private rows: the same roles, with 2FA. History: when
--    the ficha is visible to one of its roles. Nobody hard-deletes (no DELETE grant); soft delete is admin-only.
-- ---------------------------------------------------------------------------
alter table public.obra_fichas enable row level security;
alter table public.obra_ficha_private enable row level security;
alter table public.community_reports enable row level security;
alter table public.community_report_private enable row level security;
alter table public.ficha_updates enable row level security;

grant select, insert, update on public.obra_fichas, public.obra_ficha_private, public.community_reports,
  public.community_report_private to authenticated;
grant select, insert on public.ficha_updates to authenticated;
grant usage on sequence public.obra_code_seq, public.report_code_seq to authenticated;

-- Inline (not through a helper) so INSERT ... RETURNING sees the new row.
create policy obra_fichas_select on public.obra_fichas for select to authenticated
  using ((deleted_at is null and (
           public.has_any_role(array['admin', 'boss', 'dispatch', 'ivt']::public.app_role[])
           or (public.has_any_role(array['social', 'camera']::public.app_role[])
               and exists (select 1 from public.events e
                            where e.obra_ficha_id = obra_fichas.id and e.deleted_at is null and public.can_see_event(e.id)))))
         or (deleted_at is not null and public.has_role('admin')));
create policy obra_fichas_insert on public.obra_fichas for insert to authenticated
  with check (public.has_any_role(array['admin', 'boss', 'dispatch', 'ivt']::public.app_role[])
              and created_by = auth.uid() and stage in ('draft', 'to_schedule') and deleted_at is null);
create policy obra_fichas_update on public.obra_fichas for update to authenticated
  using ((deleted_at is null and public.has_any_role(array['admin', 'boss', 'dispatch', 'ivt']::public.app_role[]))
         or public.has_role('admin'))
  with check (public.has_any_role(array['admin', 'boss', 'dispatch', 'ivt']::public.app_role[]));

create policy obra_ficha_private_select on public.obra_ficha_private for select to authenticated
  using (public.mfa_ok() and public.has_any_role(array['admin', 'boss', 'dispatch', 'ivt']::public.app_role[])
         and exists (select 1 from public.obra_fichas f where f.id = obra_ficha_private.id));
create policy obra_ficha_private_insert on public.obra_ficha_private for insert to authenticated
  with check (public.mfa_ok() and public.has_any_role(array['admin', 'boss', 'dispatch', 'ivt']::public.app_role[])
              and exists (select 1 from public.obra_fichas f where f.id = obra_ficha_private.id));
create policy obra_ficha_private_update on public.obra_ficha_private for update to authenticated
  using (public.mfa_ok() and public.has_any_role(array['admin', 'boss', 'dispatch', 'ivt']::public.app_role[])
         and exists (select 1 from public.obra_fichas f where f.id = obra_ficha_private.id))
  with check (public.mfa_ok() and public.has_any_role(array['admin', 'boss', 'dispatch', 'ivt']::public.app_role[])
              and exists (select 1 from public.obra_fichas f where f.id = obra_ficha_private.id));

create policy community_reports_select on public.community_reports for select to authenticated
  using ((deleted_at is null and public.has_any_role(array['admin', 'boss', 'dispatch', 'politics']::public.app_role[]))
         or (deleted_at is not null and public.has_role('admin')));
create policy community_reports_insert on public.community_reports for insert to authenticated
  with check (public.has_any_role(array['admin', 'boss', 'dispatch', 'politics']::public.app_role[])
              and created_by = auth.uid() and deleted_at is null);
create policy community_reports_update on public.community_reports for update to authenticated
  using ((deleted_at is null and public.has_any_role(array['admin', 'boss', 'dispatch', 'politics']::public.app_role[]))
         or public.has_role('admin'))
  with check (public.has_any_role(array['admin', 'boss', 'dispatch', 'politics']::public.app_role[]));

create policy community_report_private_select on public.community_report_private for select to authenticated
  using (public.mfa_ok() and public.has_any_role(array['admin', 'boss', 'dispatch', 'politics']::public.app_role[])
         and exists (select 1 from public.community_reports r where r.id = community_report_private.id));
create policy community_report_private_insert on public.community_report_private for insert to authenticated
  with check (public.mfa_ok() and public.has_any_role(array['admin', 'boss', 'dispatch', 'politics']::public.app_role[])
              and exists (select 1 from public.community_reports r where r.id = community_report_private.id));
create policy community_report_private_update on public.community_report_private for update to authenticated
  using (public.mfa_ok() and public.has_any_role(array['admin', 'boss', 'dispatch', 'politics']::public.app_role[])
         and exists (select 1 from public.community_reports r where r.id = community_report_private.id))
  with check (public.mfa_ok() and public.has_any_role(array['admin', 'boss', 'dispatch', 'politics']::public.app_role[])
              and exists (select 1 from public.community_reports r where r.id = community_report_private.id));

-- History: only the ficha's own roles (a free-text note may say more than the main part Redes can read).
create policy ficha_updates_select on public.ficha_updates for select to authenticated
  using ((obra_ficha_id is not null
          and public.has_any_role(array['admin', 'boss', 'dispatch', 'ivt']::public.app_role[])
          and exists (select 1 from public.obra_fichas f where f.id = ficha_updates.obra_ficha_id))
      or (community_report_id is not null
          and public.has_any_role(array['admin', 'boss', 'dispatch', 'politics']::public.app_role[])
          and exists (select 1 from public.community_reports r where r.id = ficha_updates.community_report_id)));
-- By hand only a note, as yourself, now; every other kind is written by the triggers above.
create policy ficha_updates_insert on public.ficha_updates for insert to authenticated
  with check (kind = 'note' and note is not null and actor_id = auth.uid() and created_at = now()
    and fields = '{}' and changes is null and from_value is null and to_value is null
    and ((obra_ficha_id is not null
          and public.has_any_role(array['admin', 'boss', 'dispatch', 'ivt']::public.app_role[])
          and exists (select 1 from public.obra_fichas f where f.id = ficha_updates.obra_ficha_id))
      or (community_report_id is not null
          and public.has_any_role(array['admin', 'boss', 'dispatch', 'politics']::public.app_role[])
          and exists (select 1 from public.community_reports r where r.id = ficha_updates.community_report_id))));

-- ---------------------------------------------------------------------------
-- 7. Privileges (rule of 20261026001400_functions_closed_to_anon.sql): every function here is a trigger function.
-- ---------------------------------------------------------------------------
revoke all on function public.bump_rev() from public, anon, authenticated;
revoke all on function public.guard_ficha_update() from public, anon, authenticated;
revoke all on function public.check_territory() from public, anon, authenticated;
revoke all on function public.ficha_history() from public, anon, authenticated;
revoke all on function public.ficha_private_history() from public, anon, authenticated;
revoke all on function public.ficha_updates_immutable() from public, anon, authenticated;
