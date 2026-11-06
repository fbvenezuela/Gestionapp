-- What a citizen does without an account (6/11/2026, D-96, §4): send a request, add to an open report («¿Te sumas?»),
-- follow it with the receipt (reference + secret), add information and files, and confirm the resolution. Nothing here
-- edits an earlier file.
--
--   * Schema citizen: Supabase's Data API exposes only public and graphql_public, so nobody can call these functions
--     with the public anon key from a browser. Only the app does, as the role anon (withAnon, D-96), after its own
--     checks (zod, honeypot, Turnstile when configured). EXECUTE: anon only; never authenticated, never PUBLIC.
--     The citizen schema must never be added to the Data API's exposed schemas.
--   * Every function is SECURITY DEFINER with a fixed search_path, checks every input again, and answers the minimum:
--     submit and support give back the receipt's reference and id; lookup gives back the safe summary, the state, the
--     SHARED timeline and the person's own files, never a contact, an internal note, a staff name (only «team») or
--     another person's file. Anything with the wrong reference or secret answers {"status": "not_found"}, the same
--     whether the reference exists or not.
--   * The secret: the app stores and compares HMAC-SHA256(PARTICIPATION_PEPPER, secret) in hex (p_secret_digest); the
--     secret never reaches the database. The contact arrives encrypted by the app (request_contacts' format).
--   * Persistent rate limits by device and by network: p_device_key and p_ip_key are the app's HMAC (hex, 64) of its
--     first-party device cookie and of the IP. Limits per action in app_settings 'participation.rate_limits' ({"<action>_
--     device" | "<action>_ip": {"limit": n, "minutes": m}}), with defaults here. Over a limit: SQLSTATE P0429. A failed
--     lookup still counts (it answers instead of failing, so its count is kept).
--   * Duplicates (reportes only): 1 or more OPEN reports of the same category within 100 m (or, without coordinates,
--     the same municipality and sector) are offered with similar_requests (a count and opaque ids for «¿Te sumas?»);
--     the same problem in the same place never opens more than 3 cases: from the 4th, submit_request adds a support
--     to the oldest one by itself (kind 'support').

create schema if not exists citizen;
revoke all on schema citizen from public;
grant usage on schema citizen to anon;
comment on schema citizen is 'Funciones de la participación ciudadana sin cuenta (D-96). Solo el rol anon, solo desde la app. No exponer en la Data API.';

-- ---------------------------------------------------------------------------------------------------------------
-- 1. Internal helpers (public; only other definer functions call them)
-- ---------------------------------------------------------------------------------------------------------------
create function public.participation_limit(p_bucket text, out lim int, out minutes int)
language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb := (select s.value -> p_bucket from public.app_settings s where s.key = 'participation.rate_limits');
begin
  lim := case p_bucket when 'submit_device' then 5 when 'submit_ip' then 20 when 'similar_device' then 30 when 'similar_ip' then 120
                       when 'lookup_device' then 10 when 'lookup_ip' then 30 when 'message_device' then 10 when 'message_ip' then 40
                       when 'attach_device' then 20 when 'attach_ip' then 60 when 'download_device' then 60 when 'download_ip' then 200 end;
  minutes := case p_bucket when 'submit_device' then 60 when 'submit_ip' then 1440 when 'similar_device' then 15 when 'similar_ip' then 15
                           when 'lookup_device' then 15 when 'lookup_ip' then 15 when 'message_device' then 60 when 'message_ip' then 1440
                           when 'attach_device' then 60 when 'attach_ip' then 1440 when 'download_device' then 15 when 'download_ip' then 15 end;
  if lim is null then raise exception 'Límite desconocido: %', p_bucket; end if;
  if jsonb_typeof(v -> 'limit') = 'number' and (v ->> 'limit')::numeric between 1 and 100000 then lim := (v ->> 'limit')::numeric::int; end if;
  if jsonb_typeof(v -> 'minutes') = 'number' and (v ->> 'minutes')::numeric between 1 and 10080 then
    minutes := (v ->> 'minutes')::numeric::int;
  end if;
end $$;

-- One more hit in this window; true while within the limit.
create function public.rate_limit_pass(p_bucket text, p_key text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_lim int;
  v_minutes int;
  v_hits int;
begin
  select l.lim, l.minutes into v_lim, v_minutes from public.participation_limit(p_bucket) l;
  insert into public.rate_limits as rl (bucket, key, window_start, hits)
  values (p_bucket, p_key, to_timestamp(floor(extract(epoch from now()) / (v_minutes * 60)) * (v_minutes * 60)), 1)
  on conflict (bucket, key, window_start) do update set hits = rl.hits + 1
  returning rl.hits into v_hits;
  return v_hits <= v_lim;
end $$;

-- Both keys are required; both windows count; either one over its limit stops the call (P0429).
create function public.citizen_rate_limit(p_action text, p_device_key text, p_ip_key text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_device boolean;
  v_ip boolean;
begin
  if coalesce(p_device_key, '') !~ '^[0-9a-f]{64}$' or coalesce(p_ip_key, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'Faltan las llaves del límite de envíos.' using errcode = '22023';
  end if;
  v_device := public.rate_limit_pass(p_action || '_device', p_device_key);
  v_ip := public.rate_limit_pass(p_action || '_ip', p_ip_key);
  if not (v_device and v_ip) then
    raise exception 'Hiciste muchos intentos seguidos. Espera un rato y vuelve a intentarlo.' using errcode = 'P0429';
  end if;
end $$;

-- A receipt being created: the form's key and the secret's digest, well formed.
create function public.citizen_check_receipt(p_submission_key uuid, p_secret_digest text)
returns void language plpgsql immutable set search_path = '' as $$
begin
  if p_submission_key is null or coalesce(p_secret_digest, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'Falta la clave del comprobante.' using errcode = '22023';
  end if;
end $$;

-- The same form sent again (a retry, a double tap): the receipt it already got; null if it is new. Another secret for
-- the same form key is refused.
create function public.citizen_existing_receipt(p_submission_key uuid, p_secret_digest text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_id uuid;
  v_ref text;
  v_digest text;
begin
  select r.id, r.reference, r.secret_digest into v_id, v_ref, v_digest from public.requests r where r.submission_key = p_submission_key;
  if v_id is not null then
    if v_digest <> p_secret_digest then raise exception 'Ese envío ya existe con otra clave.'; end if;
    return jsonb_build_object('status', 'ok', 'id', v_id, 'reference', v_ref, 'kind', 'request');
  end if;
  select s.id, s.reference, s.secret_digest into v_id, v_ref, v_digest from public.request_supports s where s.submission_key = p_submission_key;
  if v_id is not null then
    if v_digest <> p_secret_digest then raise exception 'Ese envío ya existe con otra clave.'; end if;
    return jsonb_build_object('status', 'ok', 'id', v_id, 'reference', v_ref, 'kind', 'support');
  end if;
  return null;
end $$;

-- The contact, as the app encrypted it (nothing stored when nothing was given).
create function public.citizen_store_contact(p_request_id uuid, p_support_id uuid, p_name text, p_email text, p_phone text, p_channel text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(p_channel, 'none') not in ('email', 'phone', 'whatsapp', 'none') then raise exception 'Canal de contacto inválido.'; end if;
  if num_nonnulls(nullif(p_name, ''), nullif(p_email, ''), nullif(p_phone, '')) = 0 then return; end if;
  insert into public.request_contacts (request_id, support_id, name_enc, email_enc, phone_enc, preferred_channel)
  values (p_request_id, p_support_id, nullif(p_name, ''), nullif(p_email, ''), nullif(p_phone, ''), coalesce(p_channel, 'none'));
end $$;

-- A support on an open report: its own receipt, +1 on the report, a line in the report's history (no content).
create function public.citizen_add_support(p_request_id uuid, p_submission_key uuid, p_secret_digest text, p_note text,
  p_name text, p_email text, p_phone text, p_channel text, p_automatic boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_main public.requests;
  v_id uuid;
  v_ref text;
begin
  select * into v_main from public.requests where id = p_request_id for update;
  if v_main.id is null or v_main.type <> 'reporte' or v_main.duplicate_of is not null or v_main.is_spam
     or v_main.state in ('resuelto', 'cerrado', 'no_procede') then
    raise exception 'Ese reporte ya no está abierto: envía el tuyo.';
  end if;
  v_ref := public.request_new_reference();
  insert into public.request_supports (request_id, reference, submission_key, secret_digest, note, automatic)
  values (p_request_id, v_ref, p_submission_key, p_secret_digest, left(coalesce(p_note, ''), 2000), p_automatic)
  returning id into v_id;
  update public.requests set support_count = support_count + 1 where id = p_request_id;
  insert into public.request_events (request_id, kind, detail, actor_kind)
  values (p_request_id, 'support', jsonb_build_object('support', v_id, 'automatic', p_automatic), 'citizen');
  perform public.citizen_store_contact(null, v_id, p_name, p_email, p_phone, p_channel);
  return jsonb_build_object('status', 'ok', 'id', v_id, 'reference', v_ref, 'kind', 'support');
end $$;

-- The request behind a receipt (reference + digest), or an empty row. The reference is read in capitals.
create function public.request_by_receipt(p_reference text, p_secret_digest text, p_lock boolean default false)
returns public.requests language plpgsql security definer set search_path = public as $$
declare
  v public.requests;
  v_ref text := upper(btrim(coalesce(p_reference, '')));
begin
  if v_ref !~ '^AC-[0-9]{4}-[0-9A-HJKMNP-TV-Z]{6}$' or coalesce(p_secret_digest, '') !~ '^[0-9a-f]{64}$' then
    return v;
  end if;
  if p_lock then
    select * into v from public.requests r where r.reference = v_ref and r.secret_digest = p_secret_digest for update;
  else
    select * into v from public.requests r where r.reference = v_ref and r.secret_digest = p_secret_digest;
  end if;
  return v;
end $$;

-- What the citizen sees of their request: their own data, the state, the shared timeline (states without their reason,
-- replies, requests for information, their messages and confirmations) and their files plus the evidence the team
-- shared. Never the contact, the internal notes, who in the team did what, the area, the priority or the due date.
create function public.request_citizen_view(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'status', 'ok',
    'kind', 'request',
    'request', jsonb_build_object(
      'reference', r.reference, 'type', r.type, 'category', c.name, 'municipality', m.name, 'parish', p.name,
      'sector', r.sector, 'locationReference', r.location_reference, 'title', r.title, 'description', r.description,
      'eventDate', r.event_date, 'hasLocation', r.lat is not null, 'anonymous', r.anonymous,
      'state', r.state, 'merged', r.duplicate_of is not null, 'mainState', main.state,
      'supportCount', r.support_count, 'citizenConfirmation', r.citizen_confirmation,
      'createdAt', r.created_at, 'updatedAt', r.updated_at, 'resolvedAt', r.resolved_at,
      'canAddInfo', r.duplicate_of is null and r.state not in ('cerrado', 'no_procede'),
      'canConfirm', r.duplicate_of is null and r.state = 'resuelto' and r.citizen_confirmation is null),
    -- At the same moment (one action): the message first, then what the person said (confirmed or not), then the
    -- change of state it caused.
    'timeline', coalesce((
      select jsonb_agg(t.item order by t.at, t.ord, t.id)
        from (select e.created_at as at, case when e.kind in ('created', 'state') then 2 else 1 end as ord, e.id,
                     jsonb_strip_nulls(jsonb_build_object('at', e.created_at, 'kind', e.kind, 'state', e.to_state,
                                                          'by', case e.actor_kind when 'citizen' then 'citizen' else 'team' end)) as item
                from public.request_events e
               where e.request_id = r.id and e.kind in ('created', 'state', 'merged', 'citizen_confirmed', 'citizen_not_resolved')
              union all
              select x.created_at, 0, x.id,
                     jsonb_build_object('at', x.created_at, 'kind', x.kind, 'body', x.body, 'redacted', x.redacted_at is not null,
                                        'by', case x.kind when 'citizen_message' then 'citizen' else 'team' end)
                from public.request_messages x
               where x.request_id = r.id and x.kind in ('public_reply', 'info_request', 'citizen_message')) t), '[]'::jsonb),
    'attachments', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'kind', a.kind, 'mime', a.mime, 'bytes', a.bytes, 'at', a.created_at,
                                          'scanStatus', a.scan_status, 'messageId', a.message_id) order by a.created_at, a.id)
        from public.request_attachments a
       where a.request_id = r.id and a.withheld_at is null and (a.kind = 'citizen' or a.shared)), '[]'::jsonb))
  from public.requests r
  join public.request_categories c on c.id = r.category_id
  left join public.territories m on m.id = r.municipality_id
  left join public.territories p on p.id = r.parish_id
  left join public.requests main on main.id = r.duplicate_of
  where r.id = p_id
$$;

-- What a supporter sees: the report's kind, category, municipality and state, its changes of state, their own note.
-- Never the report's title or text (another person wrote them).
create function public.request_support_view(p_support_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'status', 'ok',
    'kind', 'support',
    'request', jsonb_build_object(
      'reference', s.reference, 'type', r.type, 'category', c.name, 'municipality', m.name, 'state', r.state,
      'note', s.note, 'automatic', s.automatic, 'supportCount', r.support_count,
      'createdAt', s.created_at, 'updatedAt', r.updated_at, 'resolvedAt', r.resolved_at,
      'canAddInfo', false, 'canConfirm', false),
    'timeline', coalesce((
      select jsonb_agg(t.item order by t.at, t.ord)
        from (select s.created_at as at, 0 as ord, jsonb_build_object('at', s.created_at, 'kind', 'support', 'by', 'citizen') as item
              union all
              select e.created_at, 1, jsonb_build_object('at', e.created_at, 'kind', 'state', 'state', e.to_state, 'by', 'team')
                from public.request_events e
               where e.request_id = r.id and e.kind = 'state') t), '[]'::jsonb),
    'attachments', '[]'::jsonb)
  from public.request_supports s
  join public.requests r on r.id = s.request_id
  join public.request_categories c on c.id = r.category_id
  left join public.territories m on m.id = r.municipality_id
  where s.id = p_support_id
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 2. «¿Ya lo reportaron?»: open reports of the same problem nearby (a count and opaque ids, never their content)
-- ---------------------------------------------------------------------------------------------------------------
create function citizen.similar_requests(p_device_key text, p_ip_key text, p_category_id uuid, p_municipality_id uuid default null,
  p_parish_id uuid default null, p_sector text default '', p_lat numeric default null, p_lng numeric default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_ids uuid[];
begin
  perform public.citizen_rate_limit('similar', p_device_key, p_ip_key);
  if (p_lat is null) <> (p_lng is null) then raise exception 'La ubicación no está completa.'; end if;
  v_ids := array(select d.request_id from public.request_duplicates(p_category_id, p_municipality_id, p_parish_id,
                   regexp_replace(btrim(coalesce(p_sector, '')), '\s+', ' ', 'g'), p_lat, p_lng) d);
  return jsonb_build_object('status', 'ok', 'count', cardinality(v_ids), 'ids', to_jsonb(v_ids[1:5]));
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Send a request
-- ---------------------------------------------------------------------------------------------------------------
-- Returns {"status": "ok", "id", "reference", "kind": "request" | "support"}. The contact comes encrypted; anonymous
-- requests carry none. A denuncia: never coordinates nor a location reference. p_linked_item_id: the published web
-- item it is about («Hacer una observación sobre esta obra»).
create function citizen.submit_request(
  p_submission_key uuid,
  p_secret_digest text,
  p_device_key text,
  p_ip_key text,
  p_type text,
  p_category_id uuid,
  p_title text,
  p_description text,
  p_municipality_id uuid default null,
  p_parish_id uuid default null,
  p_sector text default '',
  p_location_reference text default '',
  p_event_date date default null,
  p_lat numeric default null,
  p_lng numeric default null,
  p_location_consent boolean default false,
  p_anonymous boolean default false,
  p_publish_name_consent boolean default false,
  p_linked_item_id uuid default null,
  p_contact_name text default null,
  p_contact_email text default null,
  p_contact_phone text default null,
  p_contact_channel text default 'none')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_existing jsonb;
  v_category public.request_categories;
  v_title text := btrim(coalesce(p_title, ''));
  v_description text := btrim(coalesce(p_description, ''));
  v_sector text := regexp_replace(btrim(coalesce(p_sector, '')), '\s+', ' ', 'g');
  v_place text := btrim(coalesce(p_location_reference, ''));
  v_today date := (now() at time zone coalesce((select value #>> '{}' from public.app_settings where key = 'app.timezone'),
                                               'America/Caracas'))::date;
  v_dups uuid[];
  v_id uuid;
  v_ref text;
begin
  perform public.citizen_check_receipt(p_submission_key, p_secret_digest);
  v_existing := public.citizen_existing_receipt(p_submission_key, p_secret_digest);
  if v_existing is not null then return v_existing; end if;
  perform public.citizen_rate_limit('submit', p_device_key, p_ip_key);

  -- What it is
  if p_type is null or p_type not in ('reporte', 'peticion', 'acotacion', 'sugerencia', 'reconocimiento', 'denuncia') then
    raise exception 'Elige qué quieres enviar.';
  end if;
  select * into v_category from public.request_categories c where c.id = p_category_id and c.active;
  if v_category.id is null then raise exception 'Elige una categoría de la lista.'; end if;
  if char_length(v_title) not between 3 and 140 then raise exception 'El título va de 3 a 140 letras.'; end if;
  if char_length(v_description) not between 10 and 4000 then raise exception 'Cuéntanos qué pasa en 10 a 4000 letras.'; end if;
  if p_event_date is not null and (p_event_date > v_today + 1 or p_event_date < v_today - 3650) then
    raise exception 'Revisa la fecha del hecho.';
  end if;

  -- Where
  if p_municipality_id is null and p_type in ('reporte', 'peticion', 'denuncia') then raise exception 'Elige el municipio.'; end if;
  if p_municipality_id is not null
     and not exists (select 1 from public.territories t where t.id = p_municipality_id and t.kind = 'municipality' and t.active) then
    raise exception 'Elige el municipio de la lista.';
  end if;
  if p_parish_id is not null and not exists (select 1 from public.territories t where t.id = p_parish_id and t.kind = 'parish'
                                                and t.active and t.parent_id = p_municipality_id) then
    raise exception 'Elige la parroquia de la lista del municipio.';
  end if;
  if char_length(v_sector) > 200 then raise exception 'La parroquia, localidad o sector va hasta 200 letras.'; end if;
  if char_length(v_place) > 300 then raise exception 'La referencia va hasta 300 letras.'; end if;
  if p_type = 'denuncia' and (v_place <> '' or p_lat is not null or p_lng is not null) then
    raise exception 'En una denuncia va solo el lugar aproximado: municipio y sector.';
  end if;
  if (p_lat is null) <> (p_lng is null) then raise exception 'La ubicación no está completa.'; end if;
  if p_lat is not null and not coalesce(p_location_consent, false) then
    raise exception 'Para guardar tu ubicación hace falta tu permiso.';
  end if;
  if p_lat is not null and (p_lat not between -90 and 90 or p_lng not between -180 and 180) then
    raise exception 'La ubicación no es válida.';
  end if;

  -- Who (optional)
  if coalesce(p_anonymous, false) and (num_nonnulls(nullif(p_contact_name, ''), nullif(p_contact_email, ''), nullif(p_contact_phone, '')) > 0
                                       or coalesce(p_publish_name_consent, false)) then
    raise exception 'Una solicitud anónima va sin contacto.';
  end if;
  if p_linked_item_id is not null and not exists (select 1 from public.web_items i where i.id = p_linked_item_id
                                                     and i.published is not null and i.archived_at is null and i.publish_at <= now()) then
    raise exception 'El contenido al que se refiere ya no está publicado.';
  end if;

  -- The same problem in the same place opens at most three cases: the fourth adds to the oldest one.
  if p_type = 'reporte' then
    v_dups := array(select d.request_id from public.request_duplicates(p_category_id, p_municipality_id, p_parish_id, v_sector,
                                                                       p_lat, p_lng) d);
    if cardinality(v_dups) >= 3 then
      return public.citizen_add_support(v_dups[1], p_submission_key, p_secret_digest, left(v_title || E'\n' || v_description, 2000),
                                        p_contact_name, p_contact_email, p_contact_phone, p_contact_channel, true);
    end if;
  end if;

  begin
    v_ref := public.request_new_reference();
    insert into public.requests (reference, type, category_id, municipality_id, parish_id, sector, location_reference, title,
                                 description, event_date, lat, lng, location_consent, anonymous, publish_name_consent,
                                 linked_item_id, submission_key, secret_digest, area_id, due_at)
    values (v_ref, p_type, p_category_id, p_municipality_id, p_parish_id, v_sector, v_place, v_title, v_description, p_event_date,
            round(p_lat, 5), round(p_lng, 5), p_lat is not null, coalesce(p_anonymous, false),
            coalesce(p_publish_name_consent, false), p_linked_item_id, p_submission_key, p_secret_digest,
            case when p_type <> 'denuncia' then v_category.default_area_id end,
            public.request_default_due(p_category_id, 'normal', now()))
    returning id into v_id;
  exception when unique_violation then
    -- The same form arrived twice at the same moment: the first one won; answer with its receipt.
    v_existing := public.citizen_existing_receipt(p_submission_key, p_secret_digest);
    if v_existing is null then raise; end if;
    return v_existing;
  end;
  perform public.citizen_store_contact(v_id, null, p_contact_name, p_contact_email, p_contact_phone, p_contact_channel);
  insert into public.request_events (request_id, kind, to_state, actor_kind) values (v_id, 'created', 'recibido', 'citizen');
  return jsonb_build_object('status', 'ok', 'id', v_id, 'reference', v_ref, 'kind', 'request');
end $$;

-- «¿Te sumas?»: add to one of the reports similar_requests offered. Its own receipt. Returns like submit_request.
create function citizen.support_request(p_submission_key uuid, p_secret_digest text, p_device_key text, p_ip_key text,
  p_request_id uuid, p_note text default '', p_contact_name text default null, p_contact_email text default null,
  p_contact_phone text default null, p_contact_channel text default 'none')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_existing jsonb;
  v_note text := btrim(coalesce(p_note, ''));
begin
  perform public.citizen_check_receipt(p_submission_key, p_secret_digest);
  v_existing := public.citizen_existing_receipt(p_submission_key, p_secret_digest);
  if v_existing is not null then return v_existing; end if;
  perform public.citizen_rate_limit('submit', p_device_key, p_ip_key);
  if char_length(v_note) > 2000 then raise exception 'Lo que agregas va hasta 2000 letras.'; end if;
  return public.citizen_add_support(p_request_id, p_submission_key, p_secret_digest, v_note,
                                    p_contact_name, p_contact_email, p_contact_phone, p_contact_channel, false);
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- 4. Follow it with the receipt
-- ---------------------------------------------------------------------------------------------------------------
create function citizen.lookup_request(p_reference text, p_secret_digest text, p_device_key text, p_ip_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_ref text := upper(btrim(coalesce(p_reference, '')));
  v_id uuid;
begin
  perform public.citizen_rate_limit('lookup', p_device_key, p_ip_key);
  if v_ref !~ '^AC-[0-9]{4}-[0-9A-HJKMNP-TV-Z]{6}$' or coalesce(p_secret_digest, '') !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('status', 'not_found');
  end if;
  select r.id into v_id from public.requests r where r.reference = v_ref and r.secret_digest = p_secret_digest;
  if v_id is not null then return public.request_citizen_view(v_id); end if;
  select s.id into v_id from public.request_supports s where s.reference = v_ref and s.secret_digest = p_secret_digest;
  if v_id is not null then return public.request_support_view(v_id); end if;
  return jsonb_build_object('status', 'not_found');
end $$;

-- «Agregar información»: a message to the team. A case waiting for information goes back to review.
create function citizen.add_citizen_message(p_reference text, p_secret_digest text, p_device_key text, p_ip_key text, p_body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.requests;
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
begin
  perform public.citizen_rate_limit('message', p_device_key, p_ip_key);
  v := public.request_by_receipt(p_reference, p_secret_digest, true);
  if v.id is null then return jsonb_build_object('status', 'not_found'); end if;
  if v.duplicate_of is not null or v.state in ('cerrado', 'no_procede') then
    raise exception 'Esta solicitud ya está cerrada: si es otra cosa, envía una nueva.';
  end if;
  if char_length(v_body) not between 1 and 4000 then raise exception 'El mensaje va de 1 a 4000 letras.'; end if;
  insert into public.request_messages (request_id, kind, body) values (v.id, 'citizen_message', v_body) returning id into v_id;
  insert into public.request_events (request_id, kind, detail, actor_kind)
  values (v.id, 'citizen_message', jsonb_build_object('message', v_id), 'citizen');
  if v.state = 'requiere_informacion' then
    update public.requests set state = 'en_revision' where id = v.id;
    insert into public.request_events (request_id, kind, from_state, to_state, reason, actor_kind)
    values (v.id, 'state', v.state, 'en_revision', 'La persona respondió.', 'citizen');
  end if;
  return jsonb_build_object('status', 'ok', 'id', v_id);
end $$;

-- A file the app already checked and stored in the private bucket (type by magic bytes, size, metadata stripped):
-- with the request (p_message_id null) or with one of the person's messages. Up to 3 per send, 12 per request.
create function citizen.add_request_attachment(p_reference text, p_secret_digest text, p_device_key text, p_ip_key text,
  p_storage_key text, p_mime text, p_bytes bigint, p_scan_status text default 'cuarentena', p_message_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.requests;
  v_id uuid;
begin
  perform public.citizen_rate_limit('attach', p_device_key, p_ip_key);
  v := public.request_by_receipt(p_reference, p_secret_digest, true);
  if v.id is null then return jsonb_build_object('status', 'not_found'); end if;
  if v.duplicate_of is not null or v.state in ('cerrado', 'no_procede') then
    raise exception 'Esta solicitud ya está cerrada: si es otra cosa, envía una nueva.';
  end if;
  if p_scan_status is null or p_scan_status not in ('cuarentena', 'sin_analizar') then
    raise exception 'Un archivo nuevo entra en cuarentena (o sin analizar, si no hay revisor).';
  end if;
  if p_message_id is not null and not exists (select 1 from public.request_messages x where x.id = p_message_id
                                                and x.request_id = v.id and x.kind = 'citizen_message') then
    raise exception 'Ese mensaje no es de esta solicitud.';
  end if;
  if (select count(*) from public.request_attachments a where a.request_id = v.id and a.kind = 'citizen'
        and a.message_id is not distinct from p_message_id) >= 3 then
    raise exception 'Van hasta 3 archivos por envío.';
  end if;
  if (select count(*) from public.request_attachments a where a.request_id = v.id and a.kind = 'citizen') >= 12 then
    raise exception 'Esta solicitud ya tiene muchos archivos.';
  end if;
  insert into public.request_attachments (request_id, message_id, kind, storage_key, mime, bytes, scan_status)
  values (v.id, p_message_id, 'citizen', p_storage_key, p_mime, p_bytes, p_scan_status)
  returning id into v_id;
  return jsonb_build_object('status', 'ok', 'id', v_id);
end $$;

-- Before serving a file to the citizen (the app's route): theirs or shared evidence, not withheld, of this request.
-- The route decides by scanStatus (production serves only 'limpio').
create function citizen.request_attachment(p_reference text, p_secret_digest text, p_device_key text, p_ip_key text, p_attachment_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.requests;
  a public.request_attachments;
begin
  perform public.citizen_rate_limit('download', p_device_key, p_ip_key);
  v := public.request_by_receipt(p_reference, p_secret_digest, false);
  if v.id is null then return jsonb_build_object('status', 'not_found'); end if;
  select * into a from public.request_attachments x
   where x.id = p_attachment_id and x.request_id = v.id and x.withheld_at is null and (x.kind = 'citizen' or x.shared);
  if a.id is null then return jsonb_build_object('status', 'not_found'); end if;
  return jsonb_build_object('status', 'ok', 'storageKey', a.storage_key, 'mime', a.mime, 'bytes', a.bytes, 'scanStatus', a.scan_status);
end $$;

-- «¿Se resolvió?»: yes (recorded) or no (the case reopens, with a record; the comment goes to the team as a message).
create function citizen.confirm_request(p_reference text, p_secret_digest text, p_device_key text, p_ip_key text,
  p_resolved boolean, p_comment text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.requests;
  v_comment text := btrim(coalesce(p_comment, ''));
  v_state text;
begin
  perform public.citizen_rate_limit('message', p_device_key, p_ip_key);
  v := public.request_by_receipt(p_reference, p_secret_digest, true);
  if v.id is null then return jsonb_build_object('status', 'not_found'); end if;
  if p_resolved is null then raise exception 'Dinos si se resolvió o no.'; end if;
  if v.duplicate_of is not null or v.state <> 'resuelto' or v.citizen_confirmation is not null then
    raise exception 'Esta solicitud no está esperando tu confirmación.';
  end if;
  if char_length(v_comment) > 4000 then raise exception 'El comentario va hasta 4000 letras.'; end if;
  if p_resolved then
    update public.requests set citizen_confirmation = 'resolved', citizen_confirmed_at = now() where id = v.id;
    insert into public.request_events (request_id, kind, actor_kind) values (v.id, 'citizen_confirmed', 'citizen');
    v_state := v.state;
  else
    update public.requests set state = 'en_atencion', citizen_confirmation = 'not_resolved', citizen_confirmed_at = now(),
           resolved_at = null
     where id = v.id;
    insert into public.request_events (request_id, kind, actor_kind) values (v.id, 'citizen_not_resolved', 'citizen');
    insert into public.request_events (request_id, kind, from_state, to_state, reason, actor_kind)
    values (v.id, 'state', v.state, 'en_atencion', 'La persona dice que no está resuelto.', 'citizen');
    v_state := 'en_atencion';
  end if;
  if v_comment <> '' then
    insert into public.request_messages (request_id, kind, body) values (v.id, 'citizen_message', v_comment);
  end if;
  return jsonb_build_object('status', 'ok', 'state', v_state);
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- 5. The public figures (/transparencia): the same definitions as request_stats(), without areas, and denuncias only in
--    the totals by type and state. Spam and merged duplicates do not count.
-- ---------------------------------------------------------------------------------------------------------------
create function citizen.request_stats(p_from date default null, p_to date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_tz text := coalesce((select value #>> '{}' from public.app_settings where key = 'app.timezone'), 'America/Caracas');
  v_from timestamptz := (coalesce(p_from, date '2000-01-01'))::timestamp at time zone v_tz;
  v_to timestamptz := (coalesce(p_to, (now() at time zone v_tz)::date) + 1)::timestamp at time zone v_tz;
  v_out jsonb;
begin
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
                     from (select category_id, count(*) as n from arrived where type <> 'denuncia' group by category_id) x
                     join public.request_categories c on c.id = x.category_id),
    'byMunicipality', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'count', x.n) order by x.n desc, t.name), '[]'::jsonb)
                         from (select municipality_id, count(*) as n from arrived where type <> 'denuncia' and municipality_id is not null
                                group by municipality_id) x
                         join public.territories t on t.id = x.municipality_id))
  into v_out;
  return v_out;
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- 6. Privileges: the citizen functions for anon only; the helpers for nobody but other definer functions.
-- ---------------------------------------------------------------------------------------------------------------
revoke all on function public.participation_limit(text), public.rate_limit_pass(text, text),
  public.citizen_rate_limit(text, text, text), public.citizen_check_receipt(uuid, text),
  public.citizen_existing_receipt(uuid, text), public.citizen_store_contact(uuid, uuid, text, text, text, text),
  public.citizen_add_support(uuid, uuid, text, text, text, text, text, text, boolean),
  public.request_by_receipt(text, text, boolean), public.request_citizen_view(uuid), public.request_support_view(uuid)
  from public, anon, authenticated;
-- service_role too: the server's key never needs them (a hosted project may carry global default privileges for it).
revoke all on all functions in schema citizen from public, anon, authenticated, service_role;
grant execute on function citizen.similar_requests(text, text, uuid, uuid, uuid, text, numeric, numeric),
  citizen.submit_request(uuid, text, text, text, text, uuid, text, text, uuid, uuid, text, text, date, numeric, numeric, boolean,
                         boolean, boolean, uuid, text, text, text, text),
  citizen.support_request(uuid, text, text, text, uuid, text, text, text, text, text),
  citizen.lookup_request(text, text, text, text),
  citizen.add_citizen_message(text, text, text, text, text),
  citizen.add_request_attachment(text, text, text, text, text, text, bigint, text, uuid),
  citizen.request_attachment(text, text, text, text, uuid),
  citizen.confirm_request(text, text, text, text, boolean, text),
  citizen.request_stats(date, date)
  to anon;
