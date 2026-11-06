-- Citizen participation (6/11/2026, D-92, D-93, §4 to §7 of the web's design): what a person sends from the public
-- site without an account (a reporte, petición, acotación, sugerencia, reconocimiento or denuncia) and how the team
-- attends it. Nothing here edits an earlier file. The functions a citizen calls are 20261106000300_citizen.sql.
--
--   * Who reads a request (can_read_request, always with the second factor): a DENUNCIA only the denuncias operator
--     and the attention coordinator, nobody else, ever (D-92). The rest: the coordinator, the responsible of the area
--     it is in or the person it is assigned to (reports_operator), the auditor and the boss (both read only).
--     Administración, the web's editors and the six team roles never read a request. Who works on it
--     (can_work_request): the same minus the auditor and the boss.
--   * Nobody writes a request or its history directly: every change goes through the functions of section 5, which
--     check that the person may work on that case, follow the state machine (request_transition_ok: the reason is
--     required for requiere_informacion, derivado, no_procede, cerrado, resuelto and any reopening) and leave a
--     request_events row with who, when and why. Nothing is deleted by people: logical states only.
--   * The citizen's contact (name, email, phone) arrives encrypted by the app (AES-256-GCM, PARTICIPATION_DATA_KEY) and
--     lives apart, in request_contacts, which no API role reads: request_contact() gives the ciphertext to who works on
--     the case and leaves a 'contact_view' row in the audit log. The secret of the receipt is stored only as the app's
--     HMAC (secret_digest), a column no API role can read.
--   * The audit of these tables keeps which row, who, when, the workflow fields (state, priority, area, assignee, due
--     date) and the NAMES of the other fields that changed, never their content (Administración and the auditor read
--     audit_log; a denuncia's text or a contact must not live there). rate_limits is not audited (counters).
--   * Denuncias are never placed on a map: no coordinates and no location reference, only municipality and sector.
-- No enum values, no rows (the client's seed brings areas and categories), nothing new in the Realtime publication.

-- ---------------------------------------------------------------------------------------------------------------
-- 1. Areas, their people and the request categories (catalogues kept by Administración)
-- ---------------------------------------------------------------------------------------------------------------
create table public.areas (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  description text not null default '' check (char_length(description) <= 500),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index areas_name_unique on public.areas (lower(name));
select public.wire_standard_triggers('public.areas', false, true);

create table public.area_members (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references public.areas (id),
  user_id uuid not null references public.profiles (id),
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  unique (area_id, user_id)
);
create index area_members_user_idx on public.area_members (user_id);
select public.wire_standard_triggers('public.area_members', false, false);

create table public.request_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  description text not null default '' check (char_length(description) <= 300),
  default_area_id uuid references public.areas (id),
  default_due_days int check (default_due_days between 1 and 365),
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index request_categories_name_unique on public.request_categories (lower(name));
select public.wire_standard_triggers('public.request_categories', false, true);

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Requests and everything around them
-- ---------------------------------------------------------------------------------------------------------------
-- reference: «AC-<year>-» and 6 random Crockford characters (not sequential), the receipt's code. secret_digest:
-- HMAC-SHA256(PARTICIPATION_PEPPER, secret) in hex, computed by the app; the secret itself is never stored.
-- submission_key: the browser's id for this form, so a retry returns the same receipt.
create table public.requests (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique check (reference ~ '^AC-[0-9]{4}-[0-9A-HJKMNP-TV-Z]{6}$'),
  type text not null check (type in ('reporte', 'peticion', 'acotacion', 'sugerencia', 'reconocimiento', 'denuncia')),
  category_id uuid not null references public.request_categories (id),
  municipality_id uuid references public.territories (id),
  parish_id uuid references public.territories (id),
  sector text not null default '' check (char_length(sector) <= 200),
  location_reference text not null default '' check (char_length(location_reference) <= 300),
  title text not null check (char_length(btrim(title)) between 3 and 140),
  description text not null check (char_length(btrim(description)) between 10 and 4000),
  event_date date,
  lat numeric(8, 5) check (lat between -90 and 90),
  lng numeric(8, 5) check (lng between -180 and 180),
  location_consent boolean not null default false,
  anonymous boolean not null default false,
  publish_name_consent boolean not null default false,
  linked_item_id uuid references public.web_items (id),
  submission_key uuid not null unique,
  secret_digest text not null check (secret_digest ~ '^[0-9a-f]{64}$'),
  state text not null default 'recibido' check (state in ('recibido', 'en_revision', 'asignado', 'en_atencion',
    'requiere_informacion', 'derivado', 'resuelto', 'cerrado', 'no_procede')),
  priority text not null default 'normal' check (priority in ('baja', 'normal', 'alta', 'urgente')),
  area_id uuid references public.areas (id),
  assignee_id uuid references public.profiles (id),
  due_at timestamptz,
  first_response_at timestamptz,
  resolved_at timestamptz,
  resolution_note text check (resolution_note is null or char_length(resolution_note) between 1 and 2000),
  duplicate_of uuid references public.requests (id),
  support_count int not null default 0 check (support_count >= 0),
  is_spam boolean not null default false,
  citizen_confirmation text check (citizen_confirmation in ('resolved', 'not_resolved')),
  citizen_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint requests_point_pair check ((lat is null) = (lng is null)),
  constraint requests_point_consent check (lat is null or location_consent),
  constraint requests_denuncia_place check (type <> 'denuncia' or (lat is null and location_reference = '')),
  constraint requests_place_needed check (type not in ('reporte', 'peticion', 'denuncia') or municipality_id is not null),
  constraint requests_not_own_duplicate check (duplicate_of is distinct from id),
  constraint requests_anonymous_no_name check (not (anonymous and publish_name_consent))
);
create index requests_state_idx on public.requests (state, type, created_at desc);
create index requests_area_idx on public.requests (area_id, state) where area_id is not null;
create index requests_assignee_idx on public.requests (assignee_id, state) where assignee_id is not null;
create index requests_open_reports_idx on public.requests (category_id, municipality_id)
  where type = 'reporte' and duplicate_of is null and state not in ('resuelto', 'cerrado', 'no_procede');

-- «¿Te sumas?»: a person who adds to an open report gets a receipt of their own (reference and secret) that follows
-- that case. Their words (note) are read by the team only.
create table public.request_supports (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id),
  reference text not null unique check (reference ~ '^AC-[0-9]{4}-[0-9A-HJKMNP-TV-Z]{6}$'),
  submission_key uuid not null unique,
  secret_digest text not null check (secret_digest ~ '^[0-9a-f]{64}$'),
  note text not null default '' check (char_length(note) <= 2000),
  automatic boolean not null default false,
  created_at timestamptz not null default now()
);
create index request_supports_request_idx on public.request_supports (request_id);

-- The contact, encrypted by the app: «<key id>:<iv, base64url of 12 bytes>:<ciphertext with its tag, base64url>».
-- One row per request or per support; none when the person sent it anonymously.
create table public.request_contacts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid unique references public.requests (id),
  support_id uuid unique references public.request_supports (id),
  -- (PostgreSQL's regular expressions count up to 255: the length goes apart.)
  name_enc text check (name_enc ~ '^[a-z0-9]{1,16}:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{22,}$' and char_length(name_enc) <= 3000),
  email_enc text check (email_enc ~ '^[a-z0-9]{1,16}:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{22,}$' and char_length(email_enc) <= 3000),
  phone_enc text check (phone_enc ~ '^[a-z0-9]{1,16}:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{22,}$' and char_length(phone_enc) <= 3000),
  preferred_channel text not null default 'none' check (preferred_channel in ('email', 'phone', 'whatsapp', 'none')),
  created_at timestamptz not null default now(),
  constraint request_contacts_one_parent check (num_nonnulls(request_id, support_id) = 1),
  constraint request_contacts_something check (num_nonnulls(name_enc, email_enc, phone_enc) >= 1)
);

-- The case's history: states, assignments, priority, due date, merges, moderation. Shared with the citizen (lookup):
-- created, state (without its reason), merged, citizen_confirmed and citizen_not_resolved; the rest is the team's.
create table public.request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id),
  kind text not null check (kind in ('created', 'state', 'assigned', 'priority', 'due', 'reclassified', 'merged', 'support',
    'citizen_message', 'citizen_confirmed', 'citizen_not_resolved', 'redacted', 'spam', 'attended_published',
    'attended_withdrawn', 'contact_erased', 'evidence')),
  from_state text,
  to_state text,
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  reason text check (reason is null or char_length(reason) between 1 and 4000),
  actor_id uuid references public.profiles (id),
  actor_kind text not null check (actor_kind in ('staff', 'citizen', 'system')),
  created_at timestamptz not null default now()
);
create index request_events_request_idx on public.request_events (request_id, created_at);

-- Messages: internal notes (the team only) and what the citizen sees (replies, requests for more information, their
-- own messages). Never changed, except a moderation redaction (redact_request_message), never deleted.
create table public.request_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id),
  kind text not null check (kind in ('internal_note', 'public_reply', 'citizen_message', 'info_request')),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  author_id uuid references public.profiles (id),
  redacted_at timestamptz,
  redacted_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint request_messages_author check ((kind = 'citizen_message') = (author_id is null))
);
create index request_messages_request_idx on public.request_messages (request_id, created_at);

-- Files in the private bucket participacion-privado: the citizen's (with the request or a message) and the team's
-- evidence of the attention. scan_status is the scanner's (system): cuarentena → limpio | infectado; sin_analizar when
-- no scanner is configured. The citizen sees their own files and the evidence the team shares.
create table public.request_attachments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id),
  message_id uuid references public.request_messages (id),
  kind text not null check (kind in ('citizen', 'evidence')),
  storage_key text not null unique
    check (storage_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|pdf)$'),
  mime text not null check (mime in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  bytes bigint not null check (bytes between 1 and 8388608),
  scan_status text not null default 'cuarentena' check (scan_status in ('cuarentena', 'limpio', 'infectado', 'sin_analizar')),
  scanned_at timestamptz,
  shared boolean not null default false,
  uploaded_by uuid references public.profiles (id),
  withheld_at timestamptz,
  withheld_by uuid references public.profiles (id),
  withheld_reason text check (withheld_reason is null or char_length(withheld_reason) between 1 and 1000),
  created_at timestamptz not null default now(),
  constraint request_attachments_uploader check ((kind = 'citizen') = (uploaded_by is null)),
  constraint request_attachments_key_mime check (substring(storage_key from '\.([a-z]+)$') = case mime
    when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' else 'pdf' end)
);
create index request_attachments_request_idx on public.request_attachments (request_id, created_at);

-- «Lo atendido»: what the coordinator publishes of a resolved case, written for the public (no data of the person;
-- the name only with their consent, else initials; a denuncia only «Denuncia atendida en el municipio X»).
create table public.attended_publications (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.requests (id),
  type text not null,
  category_id uuid references public.request_categories (id),
  municipality_id uuid references public.territories (id),
  public_summary text not null check (char_length(btrim(public_summary)) between 10 and 600),
  display_name text check (display_name is null or char_length(btrim(display_name)) between 1 and 80),
  resolved_on date,
  status text not null default 'published' check (status in ('published', 'withdrawn')),
  published_at timestamptz not null default now(),
  published_by uuid references public.profiles (id),
  withdrawn_at timestamptz,
  withdrawn_by uuid references public.profiles (id),
  withdraw_reason text check (withdraw_reason is null or char_length(withdraw_reason) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attended_no_contact check (not public.text_has_phone(concat_ws(E'\n', public_summary, display_name))
    and concat_ws(' ', public_summary, display_name) !~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}'),
  constraint attended_denuncia_anonymous check (type <> 'denuncia' or (display_name is null and category_id is null))
);
create index attended_publications_public_idx on public.attended_publications (published_at desc) where status = 'published';

-- Persistent rate limits of the public functions: keys are the app's HMAC of the device cookie and of the IP, never
-- the IP itself. Fixed windows; old windows are pruned by the cron (prune_rate_limits).
create table public.rate_limits (
  bucket text not null check (bucket ~ '^[a-z_]{1,40}$'),
  key text not null check (key ~ '^[0-9a-f]{64}$'),
  window_start timestamptz not null,
  hits int not null default 0 check (hits >= 0),
  primary key (bucket, key, window_start)
);

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Who reads, who works, who steers
-- ---------------------------------------------------------------------------------------------------------------
create function public.is_area_member(p_area uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_area is not null and auth.uid() is not null and exists (
    select 1 from public.area_members m join public.areas a on a.id = m.area_id
     where m.area_id = p_area and m.user_id = auth.uid() and a.active)
$$;

-- Always true or false, never null: the functions of section 5 test them with IF NOT, where a null would let anyone
-- through (an unassigned case has p_assignee null).
create function public.can_read_request(p_type text, p_area uuid, p_assignee uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.is_aal2() and (
    public.has_role('attention_coordinator')
    or (p_type = 'denuncia' and public.has_role('complaints_operator'))
    or (p_type <> 'denuncia' and (
          public.has_any_role(array['auditor', 'boss']::public.app_role[])
          or (public.has_role('reports_operator') and (p_assignee = auth.uid() or public.is_area_member(p_area)))))), false)
$$;

create function public.can_work_request(p_type text, p_area uuid, p_assignee uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.is_aal2() and (
    public.has_role('attention_coordinator')
    or (p_type = 'denuncia' and public.has_role('complaints_operator'))
    or (p_type <> 'denuncia' and public.has_role('reports_operator')
        and (p_assignee = auth.uid() or public.is_area_member(p_area)))), false)
$$;

-- Area, priority, due date and moderation: the coordinator; for a denuncia, also the denuncias operator.
create function public.can_steer_request(p_type text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.is_aal2() and (
    public.has_role('attention_coordinator') or (p_type = 'denuncia' and public.has_role('complaints_operator'))), false)
$$;

-- Internal: whether ANOTHER person (active) holds one of these roles. Never for the API.
create function public.person_has_role(p_user uuid, p_roles public.app_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles ur join public.profiles p on p.id = ur.user_id
                  where ur.user_id = p_user and ur.role = any (p_roles) and p.active and p.deleted_at is null)
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 4. The state machine, the receipt's code, the due date and the duplicates
-- ---------------------------------------------------------------------------------------------------------------
--   recibido → en_revision → asignado → en_atencion → resuelto → cerrado, plus requiere_informacion, derivado and
--   no_procede. Reopening: resuelto → en_atencion, cerrado or no_procede → en_revision.
create function public.request_transition_ok(p_from text, p_to text)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(p_to = any (case p_from
    when 'recibido' then array['en_revision', 'asignado', 'en_atencion', 'requiere_informacion', 'derivado', 'no_procede']
    when 'en_revision' then array['asignado', 'en_atencion', 'requiere_informacion', 'derivado', 'no_procede']
    when 'asignado' then array['en_revision', 'en_atencion', 'requiere_informacion', 'derivado', 'no_procede']
    when 'en_atencion' then array['asignado', 'resuelto', 'requiere_informacion', 'derivado', 'no_procede']
    when 'requiere_informacion' then array['en_revision', 'asignado', 'en_atencion', 'no_procede', 'cerrado']
    when 'derivado' then array['en_atencion', 'resuelto', 'cerrado']
    when 'resuelto' then array['cerrado', 'en_atencion']
    when 'cerrado' then array['en_revision']
    when 'no_procede' then array['en_revision']
    end), false)
$$;

create function public.request_state_needs_reason(p_from text, p_to text)
returns boolean language sql immutable set search_path = '' as $$
  select p_to in ('requiere_informacion', 'derivado', 'no_procede', 'cerrado', 'resuelto')
      or p_from in ('resuelto', 'cerrado', 'no_procede')
$$;

-- The names people read (the app has its own copy in its labels).
create function public.request_state_label(p_state text)
returns text language sql immutable set search_path = '' as $$
  select case p_state when 'recibido' then 'Recibido' when 'en_revision' then 'En revisión' when 'asignado' then 'Asignado'
    when 'en_atencion' then 'En atención' when 'requiere_informacion' then 'Requiere información' when 'derivado' then 'Derivado'
    when 'resuelto' then 'Resuelto' when 'cerrado' then 'Cerrado' when 'no_procede' then 'No procede' else p_state end
$$;

-- «AC-2026-K7QM2H»: the year (Táchira) and 6 random characters of Crockford's alphabet (no I, L, O, U), from the
-- strong random source behind gen_random_uuid(); unique among requests and supports.
create function public.request_new_reference()
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  v_alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_year text := to_char(now() at time zone coalesce((select value #>> '{}' from public.app_settings where key = 'app.timezone'),
                                                     'America/Caracas'), 'YYYY');
  v_bits bigint;
  v_ref text;
begin
  loop
    v_bits := ('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint;
    v_ref := 'AC-' || v_year || '-';
    for i in 0 .. 5 loop
      v_ref := v_ref || substr(v_alphabet, ((v_bits >> (i * 5)) & 31)::int + 1, 1);
    end loop;
    exit when not exists (select 1 from public.requests where reference = v_ref)
          and not exists (select 1 from public.request_supports where reference = v_ref);
  end loop;
  return v_ref;
end $$;

-- The default due date: the category's days and the priority's (setting 'participation.due_days_by_priority'), the
-- shorter of the two, counted from when the request arrived. None when neither says.
create function public.request_default_due(p_category uuid, p_priority text, p_from timestamptz)
returns timestamptz language sql stable security definer set search_path = public as $$
  select p_from + make_interval(days => x.d)
    from (select least(
            (select c.default_due_days from public.request_categories c where c.id = p_category),
            (select case when jsonb_typeof(s.value -> p_priority) = 'number' then (s.value ->> p_priority)::numeric::int end
               from public.app_settings s where s.key = 'participation.due_days_by_priority')) as d) x
   where x.d between 1 and 365
$$;

-- Distance in metres between two points (haversine; no PostGIS).
create function public.distance_m(p_lat1 numeric, p_lng1 numeric, p_lat2 numeric, p_lng2 numeric)
returns double precision language sql immutable parallel safe set search_path = '' as $$
  select 2 * 6371008.8 * asin(least(1, sqrt(
    power(sin(radians((p_lat2 - p_lat1)::double precision) / 2), 2)
    + cos(radians(p_lat1::double precision)) * cos(radians(p_lat2::double precision))
      * power(sin(radians((p_lng2 - p_lng1)::double precision) / 2), 2))))
$$;

-- Internal: the OPEN reports of the same problem in the same place, oldest first. Same category and, with
-- coordinates on both, 100 m or less; otherwise the same municipality and the same sector (or, with no sector, the
-- same parish). Only reportes are ever counted or joined.
create function public.request_duplicates(p_category uuid, p_municipality uuid, p_parish uuid, p_sector text, p_lat numeric, p_lng numeric)
returns table (request_id uuid) language sql stable security definer set search_path = public as $$
  select r.id
    from public.requests r
   where r.type = 'reporte' and r.category_id = p_category and r.duplicate_of is null and not r.is_spam
     and r.state not in ('resuelto', 'cerrado', 'no_procede')
     and ((p_lat is not null and r.lat is not null and public.distance_m(p_lat, p_lng, r.lat, r.lng) <= 100)
          or ((p_lat is null or r.lat is null) and p_municipality is not null and r.municipality_id = p_municipality
              and ((public.assistant_plain(p_sector) <> '' and public.assistant_plain(r.sector) = public.assistant_plain(p_sector)
                    and (p_parish is null or r.parish_id is null or r.parish_id = p_parish))
                   or (public.assistant_plain(p_sector) = '' and public.assistant_plain(r.sector) = ''
                       and p_parish is not null and r.parish_id = p_parish))))
   order by r.created_at, r.id
$$;

-- Internal: the case, locked, if the person may work on it (else the same refusal whether it exists or not).
create function public.request_lock_for_work(p_id uuid)
returns public.requests language plpgsql security definer set search_path = public as $$
declare
  v public.requests;
begin
  select * into v from public.requests where id = p_id for update;
  if v.id is null or not public.can_work_request(v.type, v.area_id, v.assignee_id) then
    raise exception 'No encontramos esa solicitud o no te toca atenderla.' using errcode = '42501';
  end if;
  return v;
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- 5. What the team does with a case (functions: each one checks who, writes the history and keeps the rules)
-- ---------------------------------------------------------------------------------------------------------------
-- Change of state. p_reason (internal) is required where request_state_needs_reason says; for «resuelto» it is the
-- resolution's justification. p_public_note goes to the citizen (a reply; for «requiere_informacion» it is the request
-- for information itself, required).
create function public.set_request_state(p_id uuid, p_state text, p_reason text default null, p_public_note text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  v public.requests := public.request_lock_for_work(p_id);
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_note text := nullif(btrim(coalesce(p_public_note, '')), '');
begin
  if v.duplicate_of is not null then raise exception 'Esta solicitud está unida a otra: atiéndela allí.'; end if;
  if p_state = v.state then return v.state; end if;
  if not public.request_transition_ok(v.state, p_state) then
    raise exception 'De «%» no se pasa a «%».', public.request_state_label(v.state), public.request_state_label(p_state);
  end if;
  if p_state = 'requiere_informacion' then
    if v_note is null then raise exception 'Escribe qué información necesitas: eso lo lee la persona.'; end if;
    v_reason := coalesce(v_reason, v_note);
  end if;
  if public.request_state_needs_reason(v.state, p_state) and v_reason is null then
    raise exception 'Escribe el motivo.';
  end if;
  if char_length(v_reason) > 2000 or char_length(v_note) > 4000 then raise exception 'El texto es muy largo.'; end if;
  update public.requests set
    state = p_state,
    resolved_at = case when p_state = 'resuelto' then now() when p_state in ('cerrado', 'no_procede') then resolved_at end,
    resolution_note = case when p_state = 'resuelto' then v_reason else resolution_note end,
    citizen_confirmation = case when p_state = 'resuelto' then null else citizen_confirmation end,
    citizen_confirmed_at = case when p_state = 'resuelto' then null else citizen_confirmed_at end,
    first_response_at = coalesce(first_response_at, now())
  where id = p_id;
  insert into public.request_events (request_id, kind, from_state, to_state, reason, actor_id, actor_kind)
  values (p_id, 'state', v.state, p_state, v_reason, auth.uid(), 'staff');
  if v_note is not null then
    insert into public.request_messages (request_id, kind, body, author_id)
    values (p_id, case when p_state = 'requiere_informacion' then 'info_request' else 'public_reply' end, v_note, auth.uid());
  end if;
  return p_state;
end $$;

-- Area and responsible person. The area: the coordinator (and the denuncias operator for a denuncia). The person:
-- someone who can work that case (a denuncia: the denuncias operator or the coordinator; the rest: the coordinator
-- or a responsible of that area). A responsible of an area moves cases only inside it (to themselves or a colleague).
-- A case still «recibido» or «en revisión» becomes «asignado».
create function public.assign_request(p_id uuid, p_area uuid, p_assignee uuid default null, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.requests := public.request_lock_for_work(p_id);
  v_state text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v.duplicate_of is not null or v.state in ('resuelto', 'cerrado', 'no_procede') then
    raise exception 'Una solicitud cerrada o unida a otra no se reasigna: ábrela de nuevo primero.';
  end if;
  if p_area is distinct from v.area_id then
    if not public.can_steer_request(v.type) then
      raise exception 'El área la cambia la coordinación.' using errcode = '42501';
    end if;
    if p_area is not null and not exists (select 1 from public.areas a where a.id = p_area and a.active) then
      raise exception 'Esa área no existe o está apagada.';
    end if;
  end if;
  if p_assignee is not null and p_assignee is distinct from v.assignee_id then
    if v.type = 'denuncia' then
      if not public.person_has_role(p_assignee, array['complaints_operator', 'attention_coordinator']::public.app_role[]) then
        raise exception 'Una denuncia la atienden solo el operador de denuncias o la coordinación.';
      end if;
    elsif not (public.person_has_role(p_assignee, array['attention_coordinator']::public.app_role[])
               or (public.person_has_role(p_assignee, array['reports_operator']::public.app_role[])
                   and exists (select 1 from public.area_members m where m.area_id = p_area and m.user_id = p_assignee))) then
      raise exception 'Esa persona no atiende las solicitudes de esa área.';
    end if;
  end if;
  if p_area is not distinct from v.area_id and p_assignee is not distinct from v.assignee_id then return; end if;
  v_state := case when v.state in ('recibido', 'en_revision') and (p_area is not null or p_assignee is not null)
                  then 'asignado' else v.state end;
  update public.requests set area_id = p_area, assignee_id = p_assignee, state = v_state,
         first_response_at = case when v_state <> v.state then coalesce(first_response_at, now()) else first_response_at end
   where id = p_id;
  insert into public.request_events (request_id, kind, detail, reason, actor_id, actor_kind)
  values (p_id, 'assigned', jsonb_build_object('area', jsonb_build_object('from', v.area_id, 'to', p_area),
                                               'assignee', jsonb_build_object('from', v.assignee_id, 'to', p_assignee)),
          v_reason, auth.uid(), 'staff');
  if v_state <> v.state then
    insert into public.request_events (request_id, kind, from_state, to_state, actor_id, actor_kind)
    values (p_id, 'state', v.state, v_state, auth.uid(), 'staff');
  end if;
end $$;

-- Priority. The due date follows it while nobody set one by hand.
create function public.set_request_priority(p_id uuid, p_priority text, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.requests := public.request_lock_for_work(p_id);
begin
  if not public.can_steer_request(v.type) then
    raise exception 'La prioridad la pone la coordinación.' using errcode = '42501';
  end if;
  if p_priority is null or p_priority not in ('baja', 'normal', 'alta', 'urgente') then raise exception 'Prioridad inválida.'; end if;
  if p_priority = v.priority then return; end if;
  update public.requests set priority = p_priority,
         due_at = case when exists (select 1 from public.request_events e where e.request_id = p_id and e.kind = 'due')
                       then due_at else public.request_default_due(category_id, p_priority, created_at) end
   where id = p_id;
  insert into public.request_events (request_id, kind, detail, reason, actor_id, actor_kind)
  values (p_id, 'priority', jsonb_build_object('from', v.priority, 'to', p_priority), nullif(btrim(coalesce(p_reason, '')), ''),
          auth.uid(), 'staff');
end $$;

-- The committed date («fecha comprometida»), by hand. Null takes it away.
create function public.set_request_due(p_id uuid, p_due_at timestamptz, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.requests := public.request_lock_for_work(p_id);
begin
  if not public.can_steer_request(v.type) then
    raise exception 'La fecha comprometida la pone la coordinación.' using errcode = '42501';
  end if;
  if p_due_at is not null and p_due_at < v.created_at then
    raise exception 'La fecha comprometida no puede ser antes de que llegara la solicitud.';
  end if;
  update public.requests set due_at = p_due_at where id = p_id;
  insert into public.request_events (request_id, kind, detail, reason, actor_id, actor_kind)
  values (p_id, 'due', jsonb_build_object('from', v.due_at, 'to', p_due_at), nullif(btrim(coalesce(p_reason, '')), ''),
          auth.uid(), 'staff');
end $$;

-- The coordinator corrects what kind of request it is or its category (with a reason). A request that becomes a
-- denuncia loses its point and its location reference and leaves its area; one that stops being a denuncia goes to
-- its category's area. Whoever was attending it and cannot any more stops being its responsible.
create function public.reclassify_request(p_id uuid, p_type text, p_category_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.requests := public.request_lock_for_work(p_id);
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_area uuid;
  v_assignee uuid;
begin
  if not (public.is_aal2() and public.has_role('attention_coordinator')) then
    raise exception 'El tipo y la categoría los corrige la coordinación.' using errcode = '42501';
  end if;
  if v_reason is null then raise exception 'Escribe el motivo.'; end if;
  if p_type is null or p_type not in ('reporte', 'peticion', 'acotacion', 'sugerencia', 'reconocimiento', 'denuncia') then
    raise exception 'Tipo inválido.';
  end if;
  if not exists (select 1 from public.request_categories c where c.id = p_category_id and c.active) then
    raise exception 'Elige una categoría de la lista.';
  end if;
  if p_type in ('reporte', 'peticion', 'denuncia') and v.municipality_id is null then
    raise exception 'Para ese tipo hace falta el municipio, y esta solicitud no lo tiene.';
  end if;
  v_area := case when p_type = 'denuncia' then null
                 when v.type = 'denuncia' then (select c.default_area_id from public.request_categories c where c.id = p_category_id)
                 else v.area_id end;
  v_assignee := case when v.assignee_id is null then null
                     when p_type = 'denuncia' and public.person_has_role(v.assignee_id, array['complaints_operator', 'attention_coordinator']::public.app_role[]) then v.assignee_id
                     when p_type <> 'denuncia' and (public.person_has_role(v.assignee_id, array['attention_coordinator']::public.app_role[])
                          or (public.person_has_role(v.assignee_id, array['reports_operator']::public.app_role[])
                              and exists (select 1 from public.area_members m where m.area_id = v_area and m.user_id = v.assignee_id))) then v.assignee_id
                     end;
  update public.requests set type = p_type, category_id = p_category_id, area_id = v_area, assignee_id = v_assignee,
         lat = case when p_type = 'denuncia' then null else lat end,
         lng = case when p_type = 'denuncia' then null else lng end,
         location_reference = case when p_type = 'denuncia' then '' else location_reference end
   where id = p_id;
  insert into public.request_events (request_id, kind, detail, reason, actor_id, actor_kind)
  values (p_id, 'reclassified', jsonb_build_object('type', jsonb_build_object('from', v.type, 'to', p_type),
                                                   'category', jsonb_build_object('from', v.category_id, 'to', p_category_id)),
          v_reason, auth.uid(), 'staff');
end $$;

-- A message: an internal note (the team only), a reply to the citizen, or a request for more information (the case
-- goes to «requiere_informacion»). Returns the message's id.
create function public.add_request_message(p_id uuid, p_kind text, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v public.requests := public.request_lock_for_work(p_id);
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
begin
  if p_kind is null or p_kind not in ('internal_note', 'public_reply', 'info_request') then raise exception 'Tipo de mensaje inválido.'; end if;
  if char_length(v_body) not between 1 and 4000 then raise exception 'El mensaje va de 1 a 4000 letras.'; end if;
  if p_kind <> 'internal_note' and v.duplicate_of is not null then
    raise exception 'Esta solicitud está unida a otra: escríbele a la persona desde esa.';
  end if;
  if p_kind = 'info_request' and not public.request_transition_ok(v.state, 'requiere_informacion') then
    raise exception 'En «%» no se pide más información.', public.request_state_label(v.state);
  end if;
  insert into public.request_messages (request_id, kind, body, author_id) values (p_id, p_kind, v_body, auth.uid())
  returning id into v_id;
  if p_kind <> 'internal_note' then
    update public.requests set first_response_at = coalesce(first_response_at, now()),
           state = case when p_kind = 'info_request' then 'requiere_informacion' else state end
     where id = p_id;
  end if;
  if p_kind = 'info_request' then
    insert into public.request_events (request_id, kind, from_state, to_state, reason, actor_id, actor_kind)
    values (p_id, 'state', v.state, 'requiere_informacion', v_body, auth.uid(), 'staff');
  end if;
  return v_id;
end $$;

-- The team's evidence (photos after, papers), already in the private bucket: registered here. p_shared = the citizen
-- sees it in their timeline. Returns the file's id.
create function public.add_request_evidence(p_id uuid, p_storage_key text, p_mime text, p_bytes bigint,
  p_scan_status text default 'cuarentena', p_shared boolean default false, p_message_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v public.requests := public.request_lock_for_work(p_id);
  v_id uuid;
begin
  if p_scan_status is null or p_scan_status not in ('cuarentena', 'sin_analizar') then
    raise exception 'Un archivo nuevo entra en cuarentena (o sin analizar, si no hay revisor).';
  end if;
  if p_message_id is not null and not exists (select 1 from public.request_messages x where x.id = p_message_id
                                                and x.request_id = p_id and x.kind <> 'citizen_message') then
    raise exception 'Ese mensaje no es de esta solicitud.';
  end if;
  if (select count(*) from public.request_attachments a where a.request_id = p_id and a.kind = 'evidence') >= 30 then
    raise exception 'Esta solicitud ya tiene muchas evidencias.';
  end if;
  insert into public.request_attachments (request_id, message_id, kind, storage_key, mime, bytes, scan_status, shared, uploaded_by)
  values (p_id, p_message_id, 'evidence', p_storage_key, p_mime, p_bytes, p_scan_status, coalesce(p_shared, false), auth.uid())
  returning id into v_id;
  insert into public.request_events (request_id, kind, detail, actor_id, actor_kind)
  values (p_id, 'evidence', jsonb_build_object('attachment', v_id, 'shared', coalesce(p_shared, false)), auth.uid(), 'staff');
  return v_id;
end $$;

-- Show (or stop showing) a piece of the team's evidence to the citizen.
create function public.set_request_attachment_shared(p_attachment_id uuid, p_shared boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  a public.request_attachments;
begin
  select * into a from public.request_attachments where id = p_attachment_id;
  if a.id is null then raise exception 'No encontramos ese archivo.' using errcode = '42501'; end if;
  perform public.request_lock_for_work(a.request_id);
  if a.kind <> 'evidence' then raise exception 'Los archivos de la persona ya son suyos: solo se comparten las evidencias del equipo.'; end if;
  perform set_config('app.trusted_update', 'on', true);
  update public.request_attachments set shared = coalesce(p_shared, false) where id = p_attachment_id;
  perform set_config('app.trusted_update', 'off', true);
end $$;

-- Moderation: a file that exposes someone or should not be there is withheld (kept, never served again), with a reason.
create function public.withhold_request_attachment(p_attachment_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  a public.request_attachments;
  v public.requests;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select * into a from public.request_attachments where id = p_attachment_id;
  if a.id is null then raise exception 'No encontramos ese archivo.' using errcode = '42501'; end if;
  v := public.request_lock_for_work(a.request_id);
  if not public.can_steer_request(v.type) then raise exception 'Retira archivos la coordinación.' using errcode = '42501'; end if;
  if v_reason is null or char_length(v_reason) > 1000 then raise exception 'Escribe el motivo (hasta 1000 letras).'; end if;
  if a.withheld_at is not null then return; end if;
  perform set_config('app.trusted_update', 'on', true);
  update public.request_attachments set withheld_at = now(), withheld_by = auth.uid(), withheld_reason = v_reason
   where id = p_attachment_id;
  perform set_config('app.trusted_update', 'off', true);
  insert into public.request_events (request_id, kind, detail, reason, actor_id, actor_kind)
  values (a.request_id, 'redacted', jsonb_build_object('attachment', p_attachment_id), v_reason, auth.uid(), 'staff');
end $$;

-- Merge a duplicate into the case that stays (the coordinator). Both keep their history; the duplicate closes, its
-- supports move to the case that stays and count there (with the duplicate itself).
create function public.merge_request(p_id uuid, p_into uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_dup public.requests;
  v_main public.requests;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not (public.is_aal2() and public.has_role('attention_coordinator')) then
    raise exception 'Une casos la coordinación.' using errcode = '42501';
  end if;
  if p_id is null or p_into is null or p_id = p_into then raise exception 'Elige otro caso para unirla.'; end if;
  if v_reason is null then raise exception 'Escribe el motivo.'; end if;
  -- Both rows locked in the same order every time.
  perform 1 from public.requests where id in (p_id, p_into) order by id for update;
  select * into v_dup from public.requests where id = p_id;
  select * into v_main from public.requests where id = p_into;
  if v_dup.id is null or v_main.id is null then raise exception 'No encontramos alguno de los dos casos.'; end if;
  if v_dup.duplicate_of is not null or v_main.duplicate_of is not null then raise exception 'Uno de los dos ya está unido a otro caso.'; end if;
  if v_dup.type <> v_main.type then raise exception 'Solo se unen casos del mismo tipo.'; end if;
  if v_dup.state in ('resuelto', 'cerrado', 'no_procede') or v_main.state in ('resuelto', 'cerrado', 'no_procede') then
    raise exception 'Solo se unen casos abiertos.';
  end if;
  perform set_config('app.trusted_update', 'on', true);
  update public.requests set duplicate_of = p_into, state = 'cerrado' where id = p_id;
  update public.request_supports set request_id = p_into where request_id = p_id;
  update public.requests set support_count = support_count + 1 + v_dup.support_count where id = p_into;
  perform set_config('app.trusted_update', 'off', true);
  insert into public.request_events (request_id, kind, from_state, to_state, detail, reason, actor_id, actor_kind)
  values (p_id, 'merged', v_dup.state, 'cerrado', jsonb_build_object('into', p_into, 'intoReference', v_main.reference),
          v_reason, auth.uid(), 'staff'),
         (p_into, 'merged', null, null, jsonb_build_object('from', p_id, 'fromReference', v_dup.reference), v_reason, auth.uid(), 'staff');
end $$;

-- Moderation: a field that exposes data (an address, a name, a phone, an insult) is replaced, with a reason; 'location'
-- takes the point away. The history keeps which field and why, never what it said.
create function public.redact_request(p_id uuid, p_field text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.requests := public.request_lock_for_work(p_id);
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.can_steer_request(v.type) then raise exception 'Retira datos la coordinación.' using errcode = '42501'; end if;
  if v_reason is null then raise exception 'Escribe el motivo.'; end if;
  case p_field
    when 'title' then update public.requests set title = '[Texto retirado]' where id = p_id;
    when 'description' then update public.requests set description = '[Texto retirado por el equipo]' where id = p_id;
    when 'location_reference' then update public.requests set location_reference = '' where id = p_id;
    when 'sector' then update public.requests set sector = '' where id = p_id;
    when 'location' then update public.requests set lat = null, lng = null, location_consent = false where id = p_id;
    else raise exception 'Ese dato no se retira.';
  end case;
  insert into public.request_events (request_id, kind, detail, reason, actor_id, actor_kind)
  values (p_id, 'redacted', jsonb_build_object('field', p_field), v_reason, auth.uid(), 'staff');
end $$;

create function public.redact_request_message(p_message_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  x public.request_messages;
  v public.requests;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select * into x from public.request_messages where id = p_message_id;
  if x.id is null then raise exception 'No encontramos ese mensaje.' using errcode = '42501'; end if;
  v := public.request_lock_for_work(x.request_id);
  if not public.can_steer_request(v.type) then raise exception 'Retira textos la coordinación.' using errcode = '42501'; end if;
  if v_reason is null then raise exception 'Escribe el motivo.'; end if;
  if x.redacted_at is not null then return; end if;
  perform set_config('app.trusted_update', 'on', true);
  update public.request_messages set body = '[Texto retirado por el equipo]', redacted_at = now(), redacted_by = auth.uid()
   where id = p_message_id;
  perform set_config('app.trusted_update', 'off', true);
  insert into public.request_events (request_id, kind, detail, reason, actor_id, actor_kind)
  values (x.request_id, 'redacted', jsonb_build_object('message', p_message_id), v_reason, auth.uid(), 'staff');
end $$;

-- Spam (never criticism): «No procede» with the reason, marked as spam, kept.
create function public.mark_request_spam(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.requests := public.request_lock_for_work(p_id);
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.can_steer_request(v.type) then raise exception 'Marca spam la coordinación.' using errcode = '42501'; end if;
  if v_reason is null then raise exception 'Escribe el motivo.'; end if;
  if v.is_spam then return; end if;
  perform set_config('app.trusted_update', 'on', true);
  update public.requests set is_spam = true, state = 'no_procede' where id = p_id;
  perform set_config('app.trusted_update', 'off', true);
  insert into public.request_events (request_id, kind, from_state, to_state, reason, actor_id, actor_kind)
  values (p_id, 'spam', v.state, 'no_procede', v_reason, auth.uid(), 'staff');
end $$;

-- The citizen's contact, encrypted, for who works on the case. Every call leaves a row in the audit log
-- ('contact_view'): who looked, which case, when.
create function public.request_contact(p_id uuid)
returns table (name_enc text, email_enc text, phone_enc text, preferred_channel text)
language plpgsql security definer set search_path = public as $$
declare
  v public.requests;
begin
  select * into v from public.requests where id = p_id;
  if v.id is null or not public.can_work_request(v.type, v.area_id, v.assignee_id) then
    raise exception 'No puedes ver el contacto de esta solicitud.' using errcode = '42501';
  end if;
  insert into public.audit_log (actor_id, table_name, row_id, action, new_data)
  values (auth.uid(), 'request_contacts', p_id::text, 'contact_view', jsonb_build_object('request_id', p_id));
  return query select c.name_enc, c.email_enc, c.phone_enc, c.preferred_channel
                 from public.request_contacts c where c.request_id = p_id;
end $$;

-- The person asks that their contact be erased (privacy notice): the coordinator removes it, with a reason. The case
-- stays; the history says it was erased, never what it was. p_support_id: the contact of one of its supports.
create function public.erase_request_contact(p_id uuid, p_reason text, p_support_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.requests := public.request_lock_for_work(p_id);
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not (public.is_aal2() and public.has_role('attention_coordinator')) then
    raise exception 'Borra contactos la coordinación.' using errcode = '42501';
  end if;
  if v_reason is null then raise exception 'Escribe el motivo.'; end if;
  if p_support_id is null then
    delete from public.request_contacts where request_id = p_id;
  else
    delete from public.request_contacts c
     where c.support_id = p_support_id and exists (select 1 from public.request_supports s where s.id = p_support_id and s.request_id = p_id);
  end if;
  insert into public.request_events (request_id, kind, detail, reason, actor_id, actor_kind)
  values (p_id, 'contact_erased', jsonb_build_object('support', p_support_id), v_reason, auth.uid(), 'staff');
end $$;

-- «Lo atendido»: the coordinator publishes a resolved case for the public site. A denuncia: always «Denuncia atendida
-- en el municipio X», no name, no category. The rest: the coordinator's summary, and the person's name only with their
-- consent (else initials, or nothing; an anonymous request, nothing). Publishing again replaces the text.
create function public.publish_attended(p_request_id uuid, p_summary text, p_display_name text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v public.requests;
  v_summary text := btrim(coalesce(p_summary, ''));
  v_name text := nullif(btrim(coalesce(p_display_name, '')), '');
  v_muni text;
  v_id uuid;
  v_tz text := coalesce((select value #>> '{}' from public.app_settings where key = 'app.timezone'), 'America/Caracas');
begin
  if not (public.is_aal2() and public.has_role('attention_coordinator')) then
    raise exception 'Publica lo atendido la coordinación.' using errcode = '42501';
  end if;
  select * into v from public.requests where id = p_request_id for update;
  if v.id is null then raise exception 'No encontramos esa solicitud.'; end if;
  if v.resolved_at is null or v.state not in ('resuelto', 'cerrado') or v.is_spam or v.duplicate_of is not null then
    raise exception 'Solo se publica lo que ya se resolvió.';
  end if;
  if v.type = 'denuncia' then
    select t.name into v_muni from public.territories t where t.id = v.municipality_id;
    v_summary := case when v_muni is null then 'Denuncia atendida.' else 'Denuncia atendida en el municipio ' || v_muni || '.' end;
    v_name := null;
  else
    if char_length(v_summary) < 10 then raise exception 'Escribe el resumen para la web (sin datos de la persona).'; end if;
    if v_name is not null and v.anonymous then raise exception 'Una solicitud anónima se publica sin nombre ni iniciales.'; end if;
    if v_name is not null and not v.publish_name_consent and v_name !~ '^([A-ZÁÉÍÓÚÑÜ]\.[[:space:]]?){1,4}$' then
      raise exception 'La persona no dio permiso para su nombre: van solo sus iniciales (por ejemplo, M. P.).';
    end if;
  end if;
  insert into public.attended_publications as ap (request_id, type, category_id, municipality_id, public_summary, display_name,
                                                  resolved_on, status, published_at, published_by)
  values (v.id, v.type, case when v.type = 'denuncia' then null else v.category_id end, v.municipality_id, v_summary, v_name,
          (v.resolved_at at time zone v_tz)::date, 'published', now(), auth.uid())
  on conflict (request_id) do update
     set public_summary = excluded.public_summary, display_name = excluded.display_name, status = 'published',
         published_at = now(), published_by = auth.uid(), withdrawn_at = null, withdrawn_by = null, withdraw_reason = null
  returning ap.id into v_id;
  insert into public.request_events (request_id, kind, detail, actor_id, actor_kind)
  values (v.id, 'attended_published', jsonb_build_object('publication', v_id), auth.uid(), 'staff');
  return v_id;
end $$;

create function public.withdraw_attended(p_request_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not (public.is_aal2() and public.has_role('attention_coordinator')) then
    raise exception 'Retira lo atendido la coordinación.' using errcode = '42501';
  end if;
  if v_reason is null or char_length(v_reason) > 1000 then raise exception 'Escribe el motivo (hasta 1000 letras).'; end if;
  update public.attended_publications set status = 'withdrawn', withdrawn_at = now(), withdrawn_by = auth.uid(), withdraw_reason = v_reason
   where request_id = p_request_id and status = 'published';
  if not found then raise exception 'Eso no está publicado.'; end if;
  insert into public.request_events (request_id, kind, reason, actor_id, actor_kind)
  values (p_request_id, 'attended_withdrawn', v_reason, auth.uid(), 'staff');
end $$;

-- The figures (each one defined in the app and the docs): received (arrived in the range), resolved (marked resolved in
-- the range), pending (open now, arrived until the end of the range), overdue (open with its due date passed), average
-- hours to the first response (first reply, request for information or change of state by the team) and to the
-- resolution, and the distributions. Spam and merged duplicates do not count. For the coordinator, the auditor and the
-- boss; the latter two get denuncias only in the totals by type and state (they never read a denuncia).
create function public.request_stats(p_from date default null, p_to date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_tz text := coalesce((select value #>> '{}' from public.app_settings where key = 'app.timezone'), 'America/Caracas');
  v_all boolean := public.has_role('attention_coordinator');
  v_from timestamptz;
  v_to timestamptz;
  v_out jsonb;
begin
  if not (public.is_aal2() and public.has_any_role(array['attention_coordinator', 'auditor', 'boss']::public.app_role[])) then
    raise exception 'Las cifras de atención las ven la coordinación, auditoría y el jefe.' using errcode = '42501';
  end if;
  v_from := (coalesce(p_from, date '2000-01-01'))::timestamp at time zone v_tz;
  v_to := (coalesce(p_to, (now() at time zone v_tz)::date) + 1)::timestamp at time zone v_tz;
  with base as (
    select r.* from public.requests r where not r.is_spam and r.duplicate_of is null
  ), arrived as (
    select * from base where created_at >= v_from and created_at < v_to
  ), open_now as (
    select * from base where created_at < v_to and state not in ('resuelto', 'cerrado', 'no_procede')
  )
  select jsonb_build_object(
    'from', (v_from at time zone v_tz)::date, 'to', ((v_to at time zone v_tz)::date - 1),
    'received', (select count(*) from arrived),
    'resolved', (select count(*) from base where resolved_at >= v_from and resolved_at < v_to),
    'pending', (select count(*) from open_now),
    'overdue', (select count(*) from open_now where due_at < now()),
    'avgFirstResponseHours', (select round((avg(extract(epoch from first_response_at - created_at)) / 3600)::numeric, 1)
                                from arrived where first_response_at is not null),
    'avgResolutionHours', (select round((avg(extract(epoch from resolved_at - created_at)) / 3600)::numeric, 1)
                             from base where resolved_at >= v_from and resolved_at < v_to),
    'byType', (select coalesce(jsonb_object_agg(type, n), '{}'::jsonb) from (select type, count(*) as n from arrived group by type) x),
    'byState', (select coalesce(jsonb_object_agg(state, n), '{}'::jsonb) from (select state, count(*) as n from arrived group by state) x),
    'byCategory', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'count', x.n) order by x.n desc, c.name), '[]'::jsonb)
                     from (select category_id, count(*) as n from arrived where v_all or type <> 'denuncia' group by category_id) x
                     join public.request_categories c on c.id = x.category_id),
    'byMunicipality', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'count', x.n) order by x.n desc, t.name), '[]'::jsonb)
                         from (select municipality_id, count(*) as n from arrived where municipality_id is not null and (v_all or type <> 'denuncia')
                                group by municipality_id) x
                         join public.territories t on t.id = x.municipality_id),
    'byArea', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'count', x.n) order by x.n desc, a.name), '[]'::jsonb)
                 from (select area_id, count(*) as n from arrived where area_id is not null and (v_all or type <> 'denuncia') group by area_id) x
                 join public.areas a on a.id = x.area_id))
  into v_out;
  return v_out;
end $$;

-- For the cron (system): rate-limit windows older than two days go.
create function public.prune_rate_limits()
returns int language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  delete from public.rate_limits where window_start < now() - interval '2 days';
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- 6. Triggers: the receipt never changes, the state machine, append-only history, files, audit without content
-- ---------------------------------------------------------------------------------------------------------------
-- The code, the secret's digest, the form's key and the arrival time never change (for the system too). A change of
-- state follows request_transition_ok unless a trusted path of section 5 does it (a merge, spam).
create function public.guard_request_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.id is distinct from old.id or new.reference is distinct from old.reference
     or new.submission_key is distinct from old.submission_key or new.secret_digest is distinct from old.secret_digest
     or new.created_at is distinct from old.created_at then
    raise exception 'El código, la clave y la fecha de llegada de una solicitud no cambian.' using errcode = '42501';
  end if;
  if new.state is distinct from old.state and coalesce(current_setting('app.trusted_update', true), '') <> 'on'
     and not public.request_transition_ok(old.state, new.state) then
    raise exception 'De «%» no se pasa a «%».', public.request_state_label(old.state), public.request_state_label(new.state)
      using errcode = '42501';
  end if;
  return new;
end $$;
create trigger guard_request_update before update on public.requests
  for each row execute function public.guard_request_update();
create trigger touch_requests before update on public.requests
  for each row execute function public.touch_updated_at();

-- A support stays a support: only a merge moves it to the case that stays.
create function public.guard_request_support()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (to_jsonb(new) - 'request_id') is distinct from (to_jsonb(old) - 'request_id')
     or (new.request_id is distinct from old.request_id and coalesce(current_setting('app.trusted_update', true), '') <> 'on') then
    raise exception 'Un apoyo no se cambia.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger guard_request_support before update on public.request_supports
  for each row execute function public.guard_request_support();

-- Messages: only a moderation redaction changes one; nothing is deleted.
create function public.guard_request_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Un mensaje no se borra ni se cambia.' using errcode = '42501';
  end if;
  if coalesce(current_setting('app.trusted_update', true), '') <> 'on'
     or (new.id, new.request_id, new.kind, new.author_id, new.created_at) is distinct from (old.id, old.request_id, old.kind, old.author_id, old.created_at) then
    raise exception 'Un mensaje no se borra ni se cambia.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger guard_request_message before update or delete on public.request_messages
  for each row execute function public.guard_request_message();
create trigger request_messages_no_truncate before truncate on public.request_messages
  for each statement execute function public.history_append_only();

-- Files: what was uploaded never changes. The scan result is the system's (the scanner); shared and withheld come from
-- the functions of section 5.
create function public.guard_request_attachment()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_trusted boolean := coalesce(current_setting('app.trusted_update', true), '') = 'on';
begin
  if (new.id, new.request_id, new.message_id, new.kind, new.storage_key, new.mime, new.bytes, new.uploaded_by, new.created_at)
     is distinct from (old.id, old.request_id, old.message_id, old.kind, old.storage_key, old.mime, old.bytes, old.uploaded_by, old.created_at) then
    raise exception 'Un archivo subido no se cambia.' using errcode = '42501';
  end if;
  if (new.scan_status, new.scanned_at) is distinct from (old.scan_status, old.scanned_at) and (auth.uid() is not null or v_trusted) then
    raise exception 'El resultado de la revisión del archivo lo pone el revisor.' using errcode = '42501';
  end if;
  if (new.shared, new.withheld_at, new.withheld_by, new.withheld_reason) is distinct from (old.shared, old.withheld_at, old.withheld_by, old.withheld_reason)
     and not v_trusted and auth.uid() is not null then
    raise exception 'Eso se cambia con sus botones.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger guard_request_attachment before update on public.request_attachments
  for each row execute function public.guard_request_attachment();

create trigger request_events_append_only before update or delete on public.request_events
  for each row execute function public.history_append_only();
create trigger request_events_no_truncate before truncate on public.request_events
  for each statement execute function public.history_append_only();
create trigger touch_attended_publications before update on public.attended_publications
  for each row execute function public.touch_updated_at();

-- Audit without content: which row, who, when, the workflow fields, and the NAMES of the other fields that changed.
create function public.audit_participation_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_keep constant text[] := case tg_table_name
    when 'requests' then array['id', 'type', 'state', 'priority', 'area_id', 'assignee_id', 'due_at', 'first_response_at',
                               'resolved_at', 'duplicate_of', 'support_count', 'is_spam', 'citizen_confirmation', 'created_at', 'updated_at']
    when 'request_supports' then array['id', 'request_id', 'automatic', 'created_at']
    when 'request_contacts' then array['id', 'request_id', 'support_id', 'created_at']
    when 'request_events' then array['id', 'request_id', 'kind', 'from_state', 'to_state', 'detail', 'actor_id', 'actor_kind', 'created_at']
    when 'request_messages' then array['id', 'request_id', 'kind', 'author_id', 'redacted_at', 'redacted_by', 'created_at']
    when 'request_attachments' then array['id', 'request_id', 'message_id', 'kind', 'mime', 'bytes', 'scan_status', 'scanned_at', 'shared',
                                          'uploaded_by', 'withheld_at', 'withheld_by', 'created_at']
    when 'attended_publications' then array['id', 'request_id', 'type', 'status', 'published_at', 'published_by', 'withdrawn_at',
                                            'withdrawn_by', 'created_at', 'updated_at']
    else array['id'] end;
  v_fields jsonb;
begin
  if tg_op = 'UPDATE' and v_new = v_old then return null; end if;
  select coalesce(jsonb_agg(k order by k), '[]'::jsonb) into v_fields
    from jsonb_object_keys(coalesce(v_new, v_old)) k
   where k <> all (v_keep)
     and case when tg_op = 'UPDATE' then (v_new -> k) is distinct from (v_old -> k)
              else (coalesce(v_new, v_old) -> k) not in ('null'::jsonb, '""'::jsonb, '{}'::jsonb, 'false'::jsonb) end;
  if v_old is not null then
    v_old := coalesce((select jsonb_object_agg(k, v_old -> k) from unnest(v_keep) k where v_old ? k), '{}'::jsonb);
  end if;
  if v_new is not null then
    v_new := coalesce((select jsonb_object_agg(k, v_new -> k) from unnest(v_keep) k where v_new ? k), '{}'::jsonb)
             || jsonb_build_object('fields', v_fields);
  else
    v_old := v_old || jsonb_build_object('fields', v_fields);
  end if;
  insert into public.audit_log (actor_id, table_name, row_id, action, old_data, new_data)
  values (auth.uid(), tg_table_name, coalesce(v_new ->> 'id', v_old ->> 'id'), lower(tg_op), v_old, v_new);
  return null;
end $$;
create trigger audit_requests after insert or update or delete on public.requests
  for each row execute function public.audit_participation_row();
create trigger audit_request_supports after insert or update or delete on public.request_supports
  for each row execute function public.audit_participation_row();
create trigger audit_request_contacts after insert or update or delete on public.request_contacts
  for each row execute function public.audit_participation_row();
create trigger audit_request_events after insert on public.request_events
  for each row execute function public.audit_participation_row();
create trigger audit_request_messages after insert or update on public.request_messages
  for each row execute function public.audit_participation_row();
create trigger audit_request_attachments after insert or update on public.request_attachments
  for each row execute function public.audit_participation_row();
create trigger audit_attended_publications after insert or update on public.attended_publications
  for each row execute function public.audit_participation_row();

-- ---------------------------------------------------------------------------------------------------------------
-- 7. RLS and privileges. No API role inserts, updates or deletes a request or its history (section 5 only);
--    request_contacts and rate_limits: no privilege at all.
-- ---------------------------------------------------------------------------------------------------------------
alter table public.areas enable row level security;
alter table public.area_members enable row level security;
alter table public.request_categories enable row level security;
alter table public.requests enable row level security;
alter table public.request_supports enable row level security;
alter table public.request_contacts enable row level security;
alter table public.request_events enable row level security;
alter table public.request_messages enable row level security;
alter table public.request_attachments enable row level security;
alter table public.attended_publications enable row level security;
alter table public.rate_limits enable row level security;

revoke all on public.areas, public.area_members, public.request_categories, public.requests, public.request_supports,
  public.request_contacts, public.request_events, public.request_messages, public.request_attachments,
  public.attended_publications, public.rate_limits from public, anon, authenticated;

-- Catalogues: the staff reads them; Administración keeps them.
grant select on public.areas, public.request_categories to authenticated;
grant insert (slug, name, description, active), update (slug, name, description, active) on public.areas to authenticated;
grant insert (slug, name, description, default_area_id, default_due_days, sort, active),
      update (slug, name, description, default_area_id, default_due_days, sort, active) on public.request_categories to authenticated;
create policy areas_select on public.areas for select to authenticated using (public.is_staff());
create policy areas_insert on public.areas for insert to authenticated with check (public.can_manage_catalogs());
create policy areas_update on public.areas for update to authenticated
  using (public.can_manage_catalogs()) with check (public.can_manage_catalogs());
create policy request_categories_select on public.request_categories for select to authenticated using (public.is_staff());
create policy request_categories_insert on public.request_categories for insert to authenticated with check (public.can_manage_catalogs());
create policy request_categories_update on public.request_categories for update to authenticated
  using (public.can_manage_catalogs()) with check (public.can_manage_catalogs());

-- Who is in which area: the attention desk, Administración and the boss (with 2FA), and each person their own rows.
grant select, delete on public.area_members to authenticated;
grant insert (area_id, user_id) on public.area_members to authenticated;
create policy area_members_select on public.area_members for select to authenticated
  using (user_id = auth.uid()
         or (public.is_aal2() and public.has_any_role(array['admin', 'boss', 'attention_coordinator', 'reports_operator',
                                                            'complaints_operator', 'auditor']::public.app_role[])));
create policy area_members_insert on public.area_members for insert to authenticated with check (public.can_manage_catalogs());
create policy area_members_delete on public.area_members for delete to authenticated using (public.can_manage_catalogs());

-- Requests: every column but the receipt's secrets (secret_digest, submission_key).
grant select (id, reference, type, category_id, municipality_id, parish_id, sector, location_reference, title, description,
              event_date, lat, lng, location_consent, anonymous, publish_name_consent, linked_item_id, state, priority, area_id,
              assignee_id, due_at, first_response_at, resolved_at, resolution_note, duplicate_of, support_count, is_spam,
              citizen_confirmation, citizen_confirmed_at, created_at, updated_at)
  on public.requests to authenticated;
create policy requests_select on public.requests for select to authenticated
  using (public.can_read_request(type, area_id, assignee_id));

-- Around a request: whoever reads the request (the subquery runs under requests_select).
grant select (id, request_id, reference, note, automatic, created_at) on public.request_supports to authenticated;
grant select on public.request_events, public.request_messages, public.request_attachments to authenticated;
create policy request_supports_select on public.request_supports for select to authenticated
  using (exists (select 1 from public.requests r where r.id = request_supports.request_id));
create policy request_events_select on public.request_events for select to authenticated
  using (exists (select 1 from public.requests r where r.id = request_events.request_id));
create policy request_messages_select on public.request_messages for select to authenticated
  using (exists (select 1 from public.requests r where r.id = request_messages.request_id));
create policy request_attachments_select on public.request_attachments for select to authenticated
  using (exists (select 1 from public.requests r where r.id = request_attachments.request_id));

-- «Lo atendido»: what is published, for everyone; the rest, for whoever reads the request.
grant select on public.attended_publications to authenticated;
create policy attended_publications_select on public.attended_publications for select to authenticated
  using (status = 'published' or exists (select 1 from public.requests r where r.id = attended_publications.request_id));

-- anon (the public site, D-96): the form's catalogues and what was published of «lo atendido». Inline policies.
grant select (id, slug, name, description, sort) on public.request_categories to anon;
create policy request_categories_public on public.request_categories for select to anon using (active);
grant select (id, type, category_id, municipality_id, public_summary, display_name, resolved_on, published_at)
  on public.attended_publications to anon;
create policy attended_publications_public on public.attended_publications for select to anon using (status = 'published');

-- The auditor reads the audit trail of the web and the attention desk (with 2FA): never the rest of the platform's
-- (the agenda's dates live there). Administración keeps reading all of it (audit_select). The trail of these tables
-- carries no content (section 6).
create policy audit_select_auditor on public.audit_log for select to authenticated
  using (public.is_aal2() and public.has_role('auditor')
         and table_name = any (array['territories', 'areas', 'area_members', 'request_categories', 'requests', 'request_supports',
                                     'request_contacts', 'request_events', 'request_messages', 'request_attachments',
                                     'attended_publications', 'web_items', 'web_versions', 'web_media', 'web_settings', 'web_redirects']));

-- ---------------------------------------------------------------------------------------------------------------
-- 8. Function privileges (rule of 20261026001400_functions_closed_to_anon.sql). Internal helpers: nobody calls them
--    but other definer functions (they answer about other people, or skip the checks).
-- ---------------------------------------------------------------------------------------------------------------
revoke all on function public.person_has_role(uuid, public.app_role[]), public.request_new_reference(),
  public.request_default_due(uuid, text, timestamptz), public.request_duplicates(uuid, uuid, uuid, text, numeric, numeric),
  public.request_lock_for_work(uuid), public.prune_rate_limits(), public.guard_request_update(),
  public.guard_request_support(), public.guard_request_message(), public.guard_request_attachment(),
  public.audit_participation_row() from public, anon, authenticated;
revoke all on function public.is_area_member(uuid), public.can_read_request(text, uuid, uuid),
  public.can_work_request(text, uuid, uuid), public.can_steer_request(text), public.request_transition_ok(text, text),
  public.request_state_needs_reason(text, text), public.request_state_label(text),
  public.distance_m(numeric, numeric, numeric, numeric), public.set_request_state(uuid, text, text, text),
  public.assign_request(uuid, uuid, uuid, text), public.set_request_priority(uuid, text, text),
  public.set_request_due(uuid, timestamptz, text), public.reclassify_request(uuid, text, uuid, text),
  public.add_request_message(uuid, text, text), public.add_request_evidence(uuid, text, text, bigint, text, boolean, uuid),
  public.set_request_attachment_shared(uuid, boolean), public.withhold_request_attachment(uuid, text),
  public.merge_request(uuid, uuid, text), public.redact_request(uuid, text, text), public.redact_request_message(uuid, text),
  public.mark_request_spam(uuid, text), public.request_contact(uuid), public.erase_request_contact(uuid, text, uuid),
  public.publish_attended(uuid, text, text), public.withdraw_attended(uuid, text), public.request_stats(date, date)
  from public, anon;
grant execute on function public.is_area_member(uuid), public.can_read_request(text, uuid, uuid),
  public.can_work_request(text, uuid, uuid), public.can_steer_request(text), public.request_transition_ok(text, text),
  public.request_state_needs_reason(text, text), public.request_state_label(text),
  public.distance_m(numeric, numeric, numeric, numeric), public.set_request_state(uuid, text, text, text),
  public.assign_request(uuid, uuid, uuid, text), public.set_request_priority(uuid, text, text),
  public.set_request_due(uuid, timestamptz, text), public.reclassify_request(uuid, text, uuid, text),
  public.add_request_message(uuid, text, text), public.add_request_evidence(uuid, text, text, bigint, text, boolean, uuid),
  public.set_request_attachment_shared(uuid, boolean), public.withhold_request_attachment(uuid, text),
  public.merge_request(uuid, uuid, text), public.redact_request(uuid, text, text), public.redact_request_message(uuid, text),
  public.mark_request_spam(uuid, text), public.request_contact(uuid), public.erase_request_contact(uuid, text, uuid),
  public.publish_attended(uuid, text, text), public.withdraw_attended(uuid, text), public.request_stats(date, date)
  to authenticated;
