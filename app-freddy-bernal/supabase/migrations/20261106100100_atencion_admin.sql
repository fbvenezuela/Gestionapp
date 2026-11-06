-- The attention desk's administrator (6/11/2026, design §5 to §7, D-92, D-93): what /admin/atencion needs on top of
-- 20261106000200_participacion.sql and 20261106000300_citizen.sql. Nothing here edits an earlier file; two functions are
-- replaced (create or replace keeps their owner and privileges, and they are granted again below anyway).
--
--   * Reloading an open consultation is not a failed attempt (W2's open issue): citizen.lookup_request gives back the hit
--     of a lookup that FOUND the receipt, so only the attempts that fail count against the limit. The hit is taken first
--     and returned after (never checked first and counted later), so attempts sent at the same moment can never go past
--     the limit; once over it, even the right secret waits, as before.
--   * request_stats() also gives the median of the time to the first response and to the resolution (the average alone
--     hides a few very slow cases), and how many were answered.
--   * Reply templates (request_reply_templates): what the team writes to the citizen most often, editable by the
--     coordinator, read by whoever answers (the coordinator, the responsibles, the denuncias operator). Generic texts,
--     no names, seeded here so a real project gets them with the migration.
--   * The people of the desk (attention_staff()): who can be given a case and in which areas, for whoever assigns (only
--     Administración reads user_roles). Names and attention roles only.
--   * The export (log_attention_export()): the coordinator exports, with the contact only when asked; the auditor, never
--     with the contact. Every export leaves a row in the audit log (who, when, how many, which filters).
--   * Overdue and quiet cases (request_alerts): the cron tells the coordinator and the responsible at most once a day per
--     case; this table is that memory (the system's, no API role touches it, not audited: bookkeeping like rate_limits).

-- ---------------------------------------------------------------------------------------------------------------
-- 1. Only failed lookups count
-- ---------------------------------------------------------------------------------------------------------------
-- Internal: one hit back in this window (never below zero). The same window rate_limit_pass() used: now() is the time
-- the transaction started, the same in both calls.
create function public.rate_limit_refund(p_bucket text, p_key text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_minutes int;
begin
  select l.minutes into v_minutes from public.participation_limit(p_bucket) l;
  update public.rate_limits set hits = greatest(hits - 1, 0)
   where bucket = p_bucket and key = p_key
     and window_start = to_timestamp(floor(extract(epoch from now()) / (v_minutes * 60)) * (v_minutes * 60));
end $$;

create or replace function citizen.lookup_request(p_reference text, p_secret_digest text, p_device_key text, p_ip_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_ref text := upper(btrim(coalesce(p_reference, '')));
  v_id uuid;
  v_view jsonb;
begin
  -- The hit is taken before looking (attempts at the same moment cannot pass the limit together)…
  perform public.citizen_rate_limit('lookup', p_device_key, p_ip_key);
  if v_ref !~ '^AC-[0-9]{4}-[0-9A-HJKMNP-TV-Z]{6}$' or coalesce(p_secret_digest, '') !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('status', 'not_found');
  end if;
  select r.id into v_id from public.requests r where r.reference = v_ref and r.secret_digest = p_secret_digest;
  if v_id is not null then
    v_view := public.request_citizen_view(v_id);
  else
    select s.id into v_id from public.request_supports s where s.reference = v_ref and s.secret_digest = p_secret_digest;
    if v_id is not null then v_view := public.request_support_view(v_id); end if;
  end if;
  if v_view is null then return jsonb_build_object('status', 'not_found'); end if;
  -- …and given back when the receipt was right: reloading an open consultation never locks the person out.
  perform public.rate_limit_refund('lookup_device', p_device_key);
  perform public.rate_limit_refund('lookup_ip', p_ip_key);
  return v_view;
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- 2. The figures, with medians
-- ---------------------------------------------------------------------------------------------------------------
-- Same definitions as before (each one written in the app and the docs): received (arrived in the range), resolved
-- (marked resolved in the range), pending (open now, arrived until the end of the range), overdue (open with its due
-- date passed), the time to the first response (first reply, request for information or change of state by the team;
-- of those that arrived in the range and were answered) and to the resolution (of those resolved in the range), each
-- as average and median, and the distributions of what arrived. Spam and merged duplicates do not count. The
-- coordinator, the auditor and the boss; the latter two get denuncias only in the totals by type and state.
create or replace function public.request_stats(p_from date default null, p_to date default null)
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
  ), resolved_in as (
    select * from base where resolved_at >= v_from and resolved_at < v_to
  ), answered as (
    select extract(epoch from first_response_at - created_at)::double precision / 3600 as h from arrived where first_response_at is not null
  ), solved as (
    select extract(epoch from resolved_at - created_at)::double precision / 3600 as h from resolved_in
  )
  select jsonb_build_object(
    'from', (v_from at time zone v_tz)::date, 'to', ((v_to at time zone v_tz)::date - 1),
    'received', (select count(*) from arrived),
    'resolved', (select count(*) from resolved_in),
    'pending', (select count(*) from open_now),
    'overdue', (select count(*) from open_now where due_at < now()),
    'answered', (select count(*) from answered),
    'avgFirstResponseHours', (select round(avg(h)::numeric, 1) from answered),
    'medianFirstResponseHours', (select round((percentile_cont(0.5) within group (order by h))::numeric, 1) from answered),
    'avgResolutionHours', (select round(avg(h)::numeric, 1) from solved),
    'medianResolutionHours', (select round((percentile_cont(0.5) within group (order by h))::numeric, 1) from solved),
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

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Reply templates
-- ---------------------------------------------------------------------------------------------------------------
create table public.request_reply_templates (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'public_reply' check (kind in ('public_reply', 'info_request')),
  title text not null check (char_length(btrim(title)) between 2 and 80),
  body text not null check (char_length(btrim(body)) between 10 and 2000),
  sort int not null default 0 check (sort between 0 and 1000),
  active boolean not null default true,
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index request_reply_templates_title_unique on public.request_reply_templates (lower(btrim(title)));
select public.wire_standard_triggers('public.request_reply_templates', false, true);

-- Whoever answers a citizen: the coordinator, the responsibles and the denuncias operator (with the second factor).
create function public.can_answer_requests()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.is_aal2() and public.has_any_role(
    array['attention_coordinator', 'reports_operator', 'complaints_operator']::public.app_role[]), false)
$$;

alter table public.request_reply_templates enable row level security;
revoke all on public.request_reply_templates from public, anon, authenticated;
grant select on public.request_reply_templates to authenticated;
grant insert (kind, title, body, sort, active), update (kind, title, body, sort, active) on public.request_reply_templates to authenticated;
create policy request_reply_templates_select on public.request_reply_templates for select to authenticated
  using (public.can_answer_requests());
create policy request_reply_templates_insert on public.request_reply_templates for insert to authenticated
  with check (public.is_aal2() and public.has_role('attention_coordinator'));
create policy request_reply_templates_update on public.request_reply_templates for update to authenticated
  using (public.is_aal2() and public.has_role('attention_coordinator'))
  with check (public.is_aal2() and public.has_role('attention_coordinator'));

insert into public.request_reply_templates (kind, title, body, sort) values
  ('public_reply', 'Recibida y en revisión',
   'Recibimos tu solicitud y ya la estamos revisando. Te avisamos por aquí cuando haya novedades.', 10),
  ('public_reply', 'Pasó al área que la atiende',
   'Tu solicitud pasó al área que la atiende. Te escribimos por aquí cuando tengan una respuesta.', 20),
  ('public_reply', 'Atención programada',
   'Ya está programada la atención de tu solicitud. Te avisamos por aquí cuando se haga.', 30),
  ('public_reply', 'La atiende otra institución',
   'Lo que nos cuentas lo atiende otra institución. Ya le pasamos tu solicitud y te avisamos por aquí cuando responda.', 40),
  ('public_reply', 'Quedó resuelta',
   'Tu solicitud quedó resuelta. Si no es así, dínoslo desde tu consulta y la revisamos de nuevo.', 50),
  ('public_reply', 'No la atiende la gestión del estado',
   'Revisamos tu solicitud y no es algo que atienda la gestión del estado. Te recomendamos acudir a la institución que corresponde.', 60),
  ('info_request', 'Falta saber dónde es',
   'Para atender tu solicitud necesitamos saber mejor dónde es. ¿Nos das una referencia del lugar, como una calle o un punto conocido?', 70),
  ('info_request', 'Falta una foto',
   '¿Nos puedes enviar una foto del problema desde tu consulta? Nos ayuda a mandar al equipo con lo necesario.', 80),
  ('info_request', 'Falta un dato',
   'Para seguir con tu solicitud nos falta un dato. ¿Nos cuentas un poco más desde tu consulta?', 90);

-- ---------------------------------------------------------------------------------------------------------------
-- 4. The people of the desk, for whoever assigns
-- ---------------------------------------------------------------------------------------------------------------
-- Active people with an attention role that works cases, their roles and their active areas. For the coordinator, the
-- responsibles, the denuncias operator and Administración (it keeps the areas), with the second factor; nobody else
-- gets a row. assign_request() decides again who can take each case.
create function public.attention_staff()
returns table (id uuid, name text, coordinator boolean, complaints boolean, reports boolean, area_ids uuid[])
language sql stable security definer set search_path = public as $$
  select p.id, coalesce(nullif(btrim(p.full_name), ''), split_part(p.email, '@', 1)) as name,
         bool_or(ur.role = 'attention_coordinator'), bool_or(ur.role = 'complaints_operator'), bool_or(ur.role = 'reports_operator'),
         coalesce((select array_agg(m.area_id order by m.area_id) from public.area_members m join public.areas a on a.id = m.area_id
                    where m.user_id = p.id and a.active), '{}'::uuid[])
    from public.profiles p join public.user_roles ur on ur.user_id = p.id
   where p.active and p.deleted_at is null
     and ur.role in ('attention_coordinator', 'complaints_operator', 'reports_operator')
     and public.is_aal2()
     and public.has_any_role(array['attention_coordinator', 'reports_operator', 'complaints_operator', 'admin']::public.app_role[])
   group by p.id, p.full_name, p.email
   order by 2, 1
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 5. The export, in the audit log
-- ---------------------------------------------------------------------------------------------------------------
create function public.log_attention_export(p_rows int, p_filters jsonb, p_with_contact boolean default false)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_aal2() and (public.has_role('attention_coordinator')
          or (public.has_role('auditor') and not coalesce(p_with_contact, false)))) then
    raise exception 'Exporta la coordinación; auditoría, sin los contactos.' using errcode = '42501';
  end if;
  if p_rows is null or p_rows < 0 or (p_filters is not null and jsonb_typeof(p_filters) <> 'object') then
    raise exception 'Exportación inválida.';
  end if;
  insert into public.audit_log (actor_id, table_name, row_id, action, new_data)
  values (auth.uid(), 'requests', 'export', 'export',
          jsonb_build_object('rows', p_rows, 'filters', coalesce(p_filters, '{}'::jsonb), 'with_contact', coalesce(p_with_contact, false)));
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- 6. Overdue and quiet cases: one notice a day per case at most
-- ---------------------------------------------------------------------------------------------------------------
create table public.request_alerts (
  request_id uuid not null references public.requests (id),
  day date not null,
  reason text not null check (reason in ('overdue', 'stale')),
  created_at timestamptz not null default now(),
  primary key (request_id, day)
);
alter table public.request_alerts enable row level security;
revoke all on public.request_alerts from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- 7. Function privileges (rule of 20261026001400_functions_closed_to_anon.sql)
-- ---------------------------------------------------------------------------------------------------------------
revoke all on function public.rate_limit_refund(text, text) from public, anon, authenticated;
revoke all on function public.can_answer_requests(), public.attention_staff(), public.log_attention_export(int, jsonb, boolean),
  public.request_stats(date, date) from public, anon;
grant execute on function public.can_answer_requests(), public.attention_staff(), public.log_attention_export(int, jsonb, boolean),
  public.request_stats(date, date) to authenticated;
-- The citizen's lookup: anon only, as in 20261106000300_citizen.sql.
revoke all on function citizen.lookup_request(text, text, text, text) from public, authenticated, service_role;
grant execute on function citizen.lookup_request(text, text, text, text) to anon;
