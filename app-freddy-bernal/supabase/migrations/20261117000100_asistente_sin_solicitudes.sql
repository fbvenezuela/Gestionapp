-- 360 never reads what people send from the web (WF-C, design §4(e), decision 4; D-50, docs/ASISTENTE.md).
--   * Everything 360 runs in the database carries app.caller = 'assistant' (src/lib/assistant/db.ts). Like Mensajes
--     (chat_by_assistant(), 20261028002400_internal_chat.sql), the attention desk now says no to it: who reads, works and
--     steers a case (can_read_request(), can_work_request(), can_steer_request()) is false with the mark, so no table of
--     the desk gives a row (requests, its supports, events, messages, attachments and «lo atendido», whose policy also
--     leaves out the published ones), no contact comes out (request_contact()) and no case changes. The figures
--     (request_stats()), the reply templates (can_answer_requests()), the people of the desk (attention_staff()) and the
--     functions of the coordinator that check the role and not the case (merge_request(), publish_attended(),
--     withdraw_attended(), log_attention_export()) refuse too. The web and attention roles get no 360 at all; this is the
--     database's own wall for the boss and Administración, who do.
--   * Each function is the latest definition as it was (20261106000200_participacion.sql, 20261106100100_atencion_admin.sql)
--     with only the mark added. A person who sets the mark only blocks themselves.

create function public.request_by_assistant()
returns boolean language sql stable set search_path = '' as $$
  select coalesce(current_setting('app.caller', true), '') = 'assistant'
$$;

create or replace function public.can_read_request(p_type text, p_area uuid, p_assignee uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(not public.request_by_assistant() and public.is_aal2() and (
    public.has_role('attention_coordinator')
    or (p_type = 'denuncia' and public.has_role('complaints_operator'))
    or (p_type <> 'denuncia' and (
          public.has_any_role(array['auditor', 'boss']::public.app_role[])
          or (public.has_role('reports_operator') and (p_assignee = auth.uid() or public.is_area_member(p_area)))))), false)
$$;

create or replace function public.can_work_request(p_type text, p_area uuid, p_assignee uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(not public.request_by_assistant() and public.is_aal2() and (
    public.has_role('attention_coordinator')
    or (p_type = 'denuncia' and public.has_role('complaints_operator'))
    or (p_type <> 'denuncia' and public.has_role('reports_operator')
        and (p_assignee = auth.uid() or public.is_area_member(p_area)))), false)
$$;

create or replace function public.can_steer_request(p_type text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(not public.request_by_assistant() and public.is_aal2() and (
    public.has_role('attention_coordinator') or (p_type = 'denuncia' and public.has_role('complaints_operator'))), false)
$$;

create or replace function public.merge_request(p_id uuid, p_into uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_dup public.requests;
  v_main public.requests;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if public.request_by_assistant() or not (public.is_aal2() and public.has_role('attention_coordinator')) then
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

create or replace function public.publish_attended(p_request_id uuid, p_summary text, p_display_name text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v public.requests;
  v_summary text := btrim(coalesce(p_summary, ''));
  v_name text := nullif(btrim(coalesce(p_display_name, '')), '');
  v_muni text;
  v_id uuid;
  v_tz text := coalesce((select value #>> '{}' from public.app_settings where key = 'app.timezone'), 'America/Caracas');
begin
  if public.request_by_assistant() or not (public.is_aal2() and public.has_role('attention_coordinator')) then
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

create or replace function public.withdraw_attended(p_request_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if public.request_by_assistant() or not (public.is_aal2() and public.has_role('attention_coordinator')) then
    raise exception 'Retira lo atendido la coordinación.' using errcode = '42501';
  end if;
  if v_reason is null or char_length(v_reason) > 1000 then raise exception 'Escribe el motivo (hasta 1000 letras).'; end if;
  update public.attended_publications set status = 'withdrawn', withdrawn_at = now(), withdrawn_by = auth.uid(), withdraw_reason = v_reason
   where request_id = p_request_id and status = 'published';
  if not found then raise exception 'Eso no está publicado.'; end if;
  insert into public.request_events (request_id, kind, reason, actor_id, actor_kind)
  values (p_request_id, 'attended_withdrawn', v_reason, auth.uid(), 'staff');
end $$;

create or replace function public.request_stats(p_from date default null, p_to date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_tz text := coalesce((select value #>> '{}' from public.app_settings where key = 'app.timezone'), 'America/Caracas');
  v_all boolean := public.has_role('attention_coordinator');
  v_from timestamptz;
  v_to timestamptz;
  v_out jsonb;
begin
  if public.request_by_assistant() or not (public.is_aal2() and public.has_any_role(array['attention_coordinator', 'auditor', 'boss']::public.app_role[])) then
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

create or replace function public.can_answer_requests()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(not public.request_by_assistant() and public.is_aal2() and public.has_any_role(
    array['attention_coordinator', 'reports_operator', 'complaints_operator']::public.app_role[]), false)
$$;

create or replace function public.attention_staff()
returns table (id uuid, name text, coordinator boolean, complaints boolean, reports boolean, area_ids uuid[])
language sql stable security definer set search_path = public as $$
  select p.id, coalesce(nullif(btrim(p.full_name), ''), split_part(p.email, '@', 1)) as name,
         bool_or(ur.role = 'attention_coordinator'), bool_or(ur.role = 'complaints_operator'), bool_or(ur.role = 'reports_operator'),
         coalesce((select array_agg(m.area_id order by m.area_id) from public.area_members m join public.areas a on a.id = m.area_id
                    where m.user_id = p.id and a.active), '{}'::uuid[])
    from public.profiles p join public.user_roles ur on ur.user_id = p.id
   where p.active and p.deleted_at is null
     and ur.role in ('attention_coordinator', 'complaints_operator', 'reports_operator')
     and not public.request_by_assistant() and public.is_aal2()
     and public.has_any_role(array['attention_coordinator', 'reports_operator', 'complaints_operator', 'admin']::public.app_role[])
   group by p.id, p.full_name, p.email
   order by 2, 1
$$;

create or replace function public.log_attention_export(p_rows int, p_filters jsonb, p_with_contact boolean default false)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.request_by_assistant() or not (public.is_aal2() and (public.has_role('attention_coordinator')
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

alter policy attended_publications_select on public.attended_publications
  using (not public.request_by_assistant()
         and (status = 'published' or exists (select 1 from public.requests r where r.id = attended_publications.request_id)));

-- Function privileges (rule of 20261026001400_functions_closed_to_anon.sql): the replaced ones keep theirs; the mark is
-- read by the policy of «lo atendido», as the person.
revoke all on function public.request_by_assistant() from public, anon;
grant execute on function public.request_by_assistant() to authenticated;
