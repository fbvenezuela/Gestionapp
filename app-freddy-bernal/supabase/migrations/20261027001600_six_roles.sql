-- Six roles (Hillary, 27/10/2026): jefe, director de despacho, director de política, director del IVT, grabación
-- y redes, «más nada». Administración stays as the technical role (invite, settings, register).
--   * Secretaría and Supervisión política are retired WITHOUT losing history: profiles are never deleted, so
--     events.created_by, reviews.reviewer_id, pieces.approved_by and tweets.approved_by keep naming the real person,
--     and every deleted role row is written to audit_log by its trigger.
--   * Everything Supervisión approved now goes to the boss: verde, amarillo, rojo and tweets, through ONE gate,
--     public.can_approve() (boss + 2FA). A future delegation («el despacho aprueba las verdes») is a one-function change.
--   * The boss does everything Redes does (pieces, copies, comments, tweets, publications, results).
-- NOT here: the agenda tables (events, schedule, brief, assignments, storyboards: 20261027001800_shared_agenda.sql)
-- and the media policies (20261027001900_media_handoff.sql). Their retired-role branches are dead code from now on,
-- because nobody can hold those roles any more (user_roles_assignable below).

-- ---------------------------------------------------------------------------
-- 1. One summary row in the register, counted before anything changes.
-- ---------------------------------------------------------------------------
insert into public.audit_log (actor_id, table_name, row_id, action, new_data)
select null, 'user_roles', 'retire', 'roles_retired', jsonb_build_object(
  'roles', jsonb_build_array('secretary', 'supervisor'),
  'why', 'Seis roles (Hillary, 27/10/2026)',
  'role_rows', (select count(*) from public.user_roles
                 where role::text not in ('admin', 'boss', 'dispatch', 'politics', 'ivt', 'camera', 'social')),
  'people_left_without_role', (select count(distinct ur.user_id) from public.user_roles ur
     where ur.role::text not in ('admin', 'boss', 'dispatch', 'politics', 'ivt', 'camera', 'social')
       and not exists (select 1 from public.user_roles o where o.user_id = ur.user_id
                        and o.role::text in ('admin', 'boss', 'dispatch', 'politics', 'ivt', 'camera', 'social'))),
  'pending_invitations', (select count(*) from public.invitations i
     where i.accepted_at is null and i.revoked_at is null
       and exists (select 1 from unnest(i.roles) r
                    where r::text not in ('admin', 'boss', 'dispatch', 'politics', 'ivt', 'camera', 'social'))));

-- ---------------------------------------------------------------------------
-- 2. Pending invitations lose the retired roles; one left with no role is revoked. Accepted and revoked
--    invitations stay exactly as they were (history).
-- ---------------------------------------------------------------------------
update public.invitations i
   set roles = array(select r from unnest(i.roles) with ordinality u(r, n)
                      where r::text in ('admin', 'boss', 'dispatch', 'politics', 'ivt', 'camera', 'social') order by n)
 where i.accepted_at is null and i.revoked_at is null
   and exists (select 1 from unnest(i.roles) r
                where r::text not in ('admin', 'boss', 'dispatch', 'politics', 'ivt', 'camera', 'social'));
update public.invitations set revoked_at = now()
 where accepted_at is null and revoked_at is null and cardinality(roles) = 0;

-- ---------------------------------------------------------------------------
-- 3. People left with no role: their sessions close (the trigger profiles_drop_push_when_off drops their phones).
--    The profile stays active and visible; admin can give them one of the six roles. Until then: «Sin acceso».
-- ---------------------------------------------------------------------------
update public.profiles p set sessions_revoked_at = now()
 where exists (select 1 from public.user_roles ur where ur.user_id = p.id
                and ur.role::text not in ('admin', 'boss', 'dispatch', 'politics', 'ivt', 'camera', 'social'))
   and not exists (select 1 from public.user_roles o where o.user_id = p.id
                    and o.role::text in ('admin', 'boss', 'dispatch', 'politics', 'ivt', 'camera', 'social'));

-- ---------------------------------------------------------------------------
-- 4. The retired role rows go (each delete is audited with who had what in old_data).
-- ---------------------------------------------------------------------------
delete from public.user_roles
 where role::text not in ('admin', 'boss', 'dispatch', 'politics', 'ivt', 'camera', 'social');

-- ---------------------------------------------------------------------------
-- 5. Only the six roles and admin can be given. secretary, supervisor and the phase-3 values stay in the enum (a
--    value cannot be dropped safely) but cannot be assigned; phase 3 re-allows its roles with a new migration.
-- ---------------------------------------------------------------------------
alter table public.user_roles add constraint user_roles_assignable
  check (role in ('admin', 'boss', 'dispatch', 'politics', 'ivt', 'camera', 'social'));

create function public.guard_invitation_roles()
returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from unnest(new.roles) r
              where r::text not in ('admin', 'boss', 'dispatch', 'politics', 'ivt', 'camera', 'social')) then
    raise exception 'Ese rol ya no se usa. Los roles son: jefe, despacho, política, IVT, grabación, redes y administración.'
      using errcode = '42501';
  end if;
  return new;
end $$;
-- Only on insert or when the roles change: old accepted invitations keep their history untouched.
create trigger guard_invitation_roles before insert or update of roles on public.invitations
  for each row execute function public.guard_invitation_roles();

-- A stale invitation never makes a sign-up fail: only the roles that can still be given are copied.
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  inv public.invitations;
begin
  select * into inv from public.invitations
   where lower(email) = lower(new.email) and accepted_at is null and revoked_at is null and expires_at > now()
   order by created_at desc limit 1;

  insert into public.profiles (id, email, full_name)
  values (new.id, lower(new.email), coalesce(inv.full_name, new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;

  if inv.id is not null then
    insert into public.user_roles (user_id, role, granted_by)
    select new.id, r, inv.invited_by from unnest(inv.roles) r
     where r::text in ('admin', 'boss', 'dispatch', 'politics', 'ivt', 'camera', 'social')
    on conflict do nothing;
    update public.invitations set accepted_at = now() where id = inv.id;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 6. One approval gate.
-- ---------------------------------------------------------------------------
create function public.can_approve()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role('boss') and public.mfa_ok()
$$;

-- ---------------------------------------------------------------------------
-- 7. Approvals: the boss approves every level and every tweet; the boss or admin change the level.
-- ---------------------------------------------------------------------------
create or replace function public.guard_piece_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  reviewer boolean;
begin
  if current_setting('app.trusted_update', true) = 'on' then return new; end if;
  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'in_review') or new.approved_by is not null or new.approved_at is not null then
      raise exception 'Una pieza nueva empieza como borrador.' using errcode = '42501';
    end if;
    new.sent_to_review_at := case when new.status = 'in_review' then now() end;
    new.review_escalated_at := null;
    new.revision := 0;
    return new;
  end if;
  if new.status is distinct from old.status and new.status in ('approved', 'changes_requested') then
    raise exception 'Solo el jefe decide (usa review_piece).' using errcode = '42501';
  end if;
  if new.approved_by is distinct from old.approved_by or new.approved_at is distinct from old.approved_at
     or new.approved_version is distinct from old.approved_version then
    raise exception 'La aprobación no se edita a mano.' using errcode = '42501';
  end if;
  if new.current_version < old.current_version then
    raise exception 'Una versión no se vuelve atrás: sube el archivo como versión nueva.' using errcode = '42501';
  end if;
  -- Level. While in review, or going down after a review, only the boss or admin. The rest may raise it.
  if new.review_level is distinct from old.review_level then
    reviewer := public.has_any_role(array['boss', 'admin']::public.app_role[]) and public.mfa_ok();
    if old.review_level = 'rojo' and not reviewer then
      raise exception 'Solo el jefe o administración sacan una pieza del rojo.' using errcode = '42501';
    end if;
    if old.status = 'in_review' and not reviewer then
      raise exception 'Una pieza en revisión solo cambia de nivel con el jefe o administración.' using errcode = '42501';
    end if;
    if public.level_rank(new.review_level) < public.level_rank(old.review_level) and old.sent_to_review_at is not null and not reviewer then
      raise exception 'Una pieza que ya pasó por revisión solo baja de nivel con el jefe o administración.' using errcode = '42501';
    end if;
  end if;
  -- Review clock and revision: set here, never by hand (system jobs may mark the reminder).
  if auth.uid() is not null then
    new.sent_to_review_at := old.sent_to_review_at;
    new.review_escalated_at := old.review_escalated_at;
    new.revision := old.revision;
  end if;
  -- New version: what the boss saw is no longer what would go out.
  if new.current_version > old.current_version then
    new.revision := old.revision + 1;
    if old.status in ('approved', 'changes_requested') then new.status := 'in_review'; end if;
  end if;
  -- Raised to red after it was approved: it goes back to review («lo que sale es exactamente lo aprobado»).
  if new.review_level = 'rojo' and old.review_level <> 'rojo' and old.status = 'approved' then
    new.status := 'in_review';
  end if;
  if new.status = 'in_review' and old.status is distinct from 'in_review' then
    new.sent_to_review_at := now();
    new.review_escalated_at := null;
  end if;
  return new;
end $$;

-- The one way to approve or request changes. Every level: public.can_approve(). Admin never decides.
--   expected_rev: the revision the boss looked at; if the piece changed since, refuse.
create or replace function public.review_piece(p uuid, decision text, comment text default '', expected_rev int default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  pc public.pieces;
begin
  if not public.can_approve() then
    raise exception 'Solo el jefe aprueba o pide cambios.' using errcode = '42501';
  end if;
  if decision not in ('approved', 'changes_requested') then raise exception 'Decisión inválida'; end if;
  if decision = 'changes_requested' and coalesce(btrim(comment), '') = '' then
    raise exception 'Escribe qué hay que cambiar.';
  end if;
  select * into pc from public.pieces where id = p and deleted_at is null for update;
  if pc.id is null then raise exception 'Pieza no encontrada'; end if;
  if pc.status not in ('in_review', 'approved') then raise exception 'La pieza no está en revisión.'; end if;
  if pc.current_version < 1 then raise exception 'La pieza no tiene archivo todavía.'; end if;
  if expected_rev is not null and expected_rev <> pc.revision then
    raise exception 'La pieza cambió mientras la revisabas (versión nueva o copies). Ábrela de nuevo.';
  end if;
  insert into public.reviews (piece_id, version, reviewer_id, decision, comment)
  values (p, pc.current_version, auth.uid(), decision, coalesce(comment, ''));
  perform set_config('app.trusted_update', 'on', true);
  update public.pieces set
    status = decision,
    approved_version = case when decision = 'approved' then pc.current_version else null end,
    approved_by = case when decision = 'approved' then auth.uid() else null end,
    approved_at = case when decision = 'approved' then now() else null end
  where id = p;
  perform set_config('app.trusted_update', 'off', true);
end $$;

-- The boss and admin can change the level at any time.
create or replace function public.set_review_level(p uuid, level text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if level not in ('verde', 'amarillo', 'rojo') then raise exception 'Nivel inválido'; end if;
  if not (public.has_any_role(array['boss', 'admin']::public.app_role[]) and public.mfa_ok()) then
    raise exception 'Solo el jefe o administración cambian el nivel.' using errcode = '42501';
  end if;
  update public.pieces set review_level = level where id = p and deleted_at is null;
end $$;

-- Tweets: only the boss approves; nothing goes past 'approved' without approval; editing an approved tweet's
-- text sends it back to draft.
create or replace function public.guard_tweet()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' or new.approved_by is not null or new.approved_at is not null then
      raise exception 'Un tweet nuevo empieza como borrador.' using errcode = '42501';
    end if;
    return new;
  end if;
  if (new.approved_by is distinct from old.approved_by or new.approved_at is distinct from old.approved_at
      or (new.status = 'approved' and old.status = 'draft'))
     and not public.can_approve() then
    raise exception 'Solo el jefe aprueba tweets.' using errcode = '42501';
  end if;
  if new.body is distinct from old.body and old.approved_at is not null then
    new.status := 'draft';
    new.approved_by := null;
    new.approved_at := null;
  end if;
  if new.status in ('approved', 'scheduled', 'published') and new.approved_at is null then
    raise exception 'El tweet no está aprobado.' using errcode = '42501';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 8. The content team: admin, Redes and the boss.
-- ---------------------------------------------------------------------------
create or replace function public.is_content_team()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_any_role(array['admin', 'social', 'boss']::public.app_role[])
$$;

-- ---------------------------------------------------------------------------
-- 9. The boss does what Redes does («tiene todo, hasta lo de redes»). ALTER POLICY: no moment without a policy.
-- ---------------------------------------------------------------------------
alter policy pieces_insert on public.pieces
  with check (public.has_any_role(array['admin', 'social', 'boss']::public.app_role[]));
alter policy pieces_update on public.pieces
  using (public.has_any_role(array['admin', 'social', 'boss']::public.app_role[]))
  with check (public.has_any_role(array['admin', 'social', 'boss']::public.app_role[]));
alter policy versions_insert on public.piece_versions
  with check (public.has_any_role(array['admin', 'social', 'boss']::public.app_role[]));
alter policy copies_insert on public.copies
  with check (public.has_any_role(array['admin', 'social', 'boss']::public.app_role[]));
alter policy copies_update on public.copies
  using (public.has_any_role(array['admin', 'social', 'boss']::public.app_role[]))
  with check (public.has_any_role(array['admin', 'social', 'boss']::public.app_role[]));
alter policy rc_insert on public.review_comments
  with check (author_id = auth.uid() and public.has_any_role(array['admin', 'social', 'boss']::public.app_role[]));
alter policy rc_update on public.review_comments
  using (public.has_any_role(array['admin', 'social', 'boss']::public.app_role[]))
  with check (public.has_any_role(array['admin', 'social', 'boss']::public.app_role[]));
alter policy vlr_insert on public.voice_line_requests
  with check (public.has_any_role(array['admin', 'social', 'boss']::public.app_role[]));
alter policy batches_insert on public.tweet_batches
  with check (public.has_any_role(array['admin', 'social', 'boss']::public.app_role[]));
alter policy batches_update on public.tweet_batches
  using (public.has_any_role(array['admin', 'social', 'boss']::public.app_role[]))
  with check (public.has_any_role(array['admin', 'social', 'boss']::public.app_role[]));
alter policy tweets_insert on public.tweets
  with check (public.has_any_role(array['admin', 'social', 'boss']::public.app_role[]));
alter policy tweets_update on public.tweets
  using (public.has_any_role(array['admin', 'social', 'boss']::public.app_role[]))
  with check (public.has_any_role(array['admin', 'social', 'boss']::public.app_role[]));
alter policy pubs_insert on public.publications
  with check (public.has_any_role(array['admin', 'social', 'boss']::public.app_role[]));
alter policy pubs_update on public.publications
  using (public.has_any_role(array['admin', 'social', 'boss']::public.app_role[]))
  with check (public.has_any_role(array['admin', 'social', 'boss']::public.app_role[]));
alter policy metrics_insert on public.publication_metrics
  with check (public.has_any_role(array['admin', 'social', 'boss']::public.app_role[]));

-- ---------------------------------------------------------------------------
-- 11. The assistant (before 10: changing a setting refreshes the automatic fichas with this new text).
--     Retired roles leave every ficha and script; one left for nobody is switched off, never deleted. The guide
--     fichas and factory scripts get their new texts when seed-client runs (config/assistant).
-- ---------------------------------------------------------------------------
update public.assistant_knowledge
   set roles = array(select r from unnest(roles) r where r::text not in ('secretary', 'supervisor'))
 where roles && array['secretary', 'supervisor']::public.app_role[];
update public.assistant_knowledge set active = false where roles = '{}'::public.app_role[] and active;
update public.assistant_scripts
   set roles = array(select r from unnest(roles) r where r::text not in ('secretary', 'supervisor'))
 where roles && array['secretary', 'supervisor']::public.app_role[];
update public.assistant_scripts set active = false where roles = '{}'::public.app_role[] and active;

-- Same as 20261025000900_assistant.sql, with the content team = admin, Redes and the boss, and the semáforo text
-- for one approver.
create or replace function public.assistant_refresh()
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_keys text[] := '{}';
  v_brand jsonb := (select value from public.app_settings where key = 'brand');
  v_slots jsonb := (select value from public.app_settings where key = 'tweets.slots');
  v_per_day jsonb := (select value from public.app_settings where key = 'tweets.per_day');
  v_low int := (select (value #>> '{}')::int from public.app_settings where key = 'tweets.low_stock_days');
  v_windows jsonb := (select value from public.app_settings where key = 'publishing.windows');
  v_deadlines jsonb := (select value from public.app_settings where key = 'review.deadlines_min');
  v_days text[] := array['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  v_content constant public.app_role[] := array['admin', 'social', 'boss']::public.app_role[];
  v_text text;
  v_list text;
  r record;
  f record;
begin
  -- Brand and platform.
  if v_brand is null then
    v_text := 'Todavía no hay datos de la marca cargados. No inventes el nombre del cliente ni sus datos.';
  else
    v_text := format('La plataforma se llama %s (%s). El equipo trabaja para %s, %s (%s). En la plataforma se le dice «%s».',
      coalesce(v_brand ->> 'appName', 'sin nombre'), coalesce(v_brand ->> 'shortName', ''),
      coalesce(v_brand ->> 'clientName', 'sin dato'), coalesce(v_brand ->> 'clientTitle', 'sin dato'),
      coalesce(v_brand ->> 'region', 'sin dato'), coalesce(v_brand ->> 'bossLabel', 'el jefe'));
    if v_brand ? 'greeting' then v_text := v_text || format(' Saludo de los copies: «%s».', v_brand ->> 'greeting'); end if;
    if jsonb_typeof(v_brand -> 'closings') = 'array' then
      v_text := v_text || ' Cierres de marca: ' || (select string_agg('«' || x || '»', ', ') from jsonb_array_elements_text(v_brand -> 'closings') x) || '.';
    end if;
    if jsonb_typeof(v_brand -> 'hashtags') = 'array' then
      v_text := v_text || ' Hashtags base: ' || (select string_agg(x, ' ') from jsonb_array_elements_text(v_brand -> 'hashtags') x) || '.';
    end if;
  end if;
  perform public.assistant_put_auto('auto:marca', null, 'La marca y la plataforma', v_text, array['marca', 'plataforma']);
  v_keys := array_append(v_keys, 'auto:marca'::text);

  -- Tweets of the week.
  if v_slots is null or jsonb_typeof(v_slots) <> 'array' or jsonb_array_length(v_slots) = 0 then
    v_text := 'No hay franjas de tweets guardadas. No inventes horarios de tweets.';
  else
    v_text := format('Los tweets salen de %s a %s al día, en estas franjas (hora local): %s.',
      coalesce(v_per_day ->> 'min', '2'), coalesce(v_per_day ->> 'max', '3'),
      (select string_agg((x ->> 'from') || '–' || (x ->> 'to'), ', ') from jsonb_array_elements(v_slots) x));
    if v_low is not null then
      v_text := v_text || format(' Cuando quedan %s días o menos de tweets programados, la plataforma avisa a Redes.', v_low);
    end if;
  end if;
  perform public.assistant_put_auto('auto:tweets', v_content, 'Horarios de los tweets', v_text, array['tweets', 'horarios']);
  v_keys := array_append(v_keys, 'auto:tweets'::text);

  -- Best hours per network (advice only, never blocks a publication).
  if v_windows is null or jsonb_typeof(v_windows) <> 'object' or v_windows = '{}'::jsonb then
    perform public.assistant_put_auto('auto:horas', v_content, 'Mejores horas para publicar',
      'No hay mejores horas guardadas para ninguna red. No inventes horarios.', array['horas', 'publicar']);
    v_keys := array_append(v_keys, 'auto:horas'::text);
  else
    for r in select j.key as net, j.value as w, coalesce(ns.label, initcap(j.key)) as label
               from jsonb_each(v_windows) j left join public.network_specs ns on ns.network = j.key
              where jsonb_typeof(j.value) = 'object' order by j.key loop
      v_text := format('Mejores horas en %s (hora local): %s.', r.label,
        coalesce((select string_agg((x ->> 'from') || '–' || (x ->> 'to'), ' o ') from jsonb_array_elements(public.assistant_arr(r.w -> 'best')) x), 'sin dato'));
      v_list := (select string_agg(v_days[(d #>> '{}')::int], ', ') from jsonb_array_elements(public.assistant_arr(r.w -> 'bestDays')) d
                  where (d #>> '{}') ~ '^[1-7]$');
      if v_list is not null then v_text := v_text || ' Mejores días: ' || v_list || '.'; end if;
      v_list := (select string_agg((x ->> 'from') || '–' || (x ->> 'to'), ' o ') from jsonb_array_elements(public.assistant_arr(r.w -> 'avoid')) x);
      if v_list is not null then v_text := v_text || ' Evitar: ' || v_list || '.'; end if;
      v_list := (select string_agg(v_days[(d #>> '{}')::int], ', ') from jsonb_array_elements(public.assistant_arr(r.w -> 'avoidDays')) d
                  where (d #>> '{}') ~ '^[1-7]$');
      if v_list is not null then v_text := v_text || ' Días que peor rinden: ' || v_list || '.'; end if;
      if coalesce(r.w ->> 'note', '') <> '' then v_text := v_text || ' ' || (r.w ->> 'note'); end if;
      v_text := v_text || ' Es un consejo: nunca bloquea una publicación.';
      perform public.assistant_put_auto('auto:horas:' || r.net, v_content,
        'Mejores horas en ' || r.label, v_text, array['horas', 'publicar', r.net]);
      v_keys := array_append(v_keys, ('auto:horas:' || r.net)::text);
    end loop;
  end if;

  -- Approval traffic light and its deadlines. One approver: the boss.
  v_text := format('Semáforo de aprobación. Todo lo aprueba el jefe: las piezas verdes, amarillas y rojas, y los tweets. '
    'Verde (rutina): plazo %s; el jefe aprueba todas las verdes de una vez, con un toque. '
    'Amarillo (normal): plazo %s. Rojo (sensible: política, crisis, aclaratorias): plazo %s. '
    'La falta de respuesta no es aprobación: vencido el plazo la pieza sigue sin aprobar, sale en «Trancado» y se avisa de nuevo. '
    'Lo que sale es exactamente lo aprobado: si cambia el video o un copy, vuelve a revisión.',
    public.assistant_minutes(coalesce((v_deadlines ->> 'verde')::int, 1440)),
    public.assistant_minutes(coalesce((v_deadlines ->> 'amarillo')::int, 60)),
    public.assistant_minutes(coalesce((v_deadlines ->> 'rojo')::int, 30)));
  perform public.assistant_put_auto('auto:semaforo', null, 'El semáforo de aprobación', v_text, array['aprobar', 'semaforo', 'color', 'nivel', 'plazo']);
  v_keys := array_append(v_keys, 'auto:semaforo'::text);

  -- Copy formulas: a summary and one ficha per active formula.
  v_list := (select string_agg(code || ' (' || name || ')', ', ' order by sort, code)
               from public.copy_formulas where active and deleted_at is null);
  perform public.assistant_put_auto('auto:formulas', v_content, 'Fórmulas de copies',
    coalesce('Fórmulas de copies activas: ' || v_list || '. Cada pieza lleva tres largos (largo, medio y corto), con voz del jefe o institucional y un cierre.',
             'No hay fórmulas de copies activas. No inventes ninguna.'),
    array['copies', 'formulas']);
  v_keys := array_append(v_keys, 'auto:formulas'::text);
  for f in select code, name, description, steps from public.copy_formulas where active and deleted_at is null order by sort, code loop
    v_text := f.name || '. ' || coalesce(nullif(f.description, ''), '') ||
      coalesce(' Pasos: ' || (select string_agg((s ->> 'label') || coalesce(' (' || nullif(s ->> 'hint', '') || ')', ''), '; ')
                                from jsonb_array_elements(case when jsonb_typeof(f.steps) = 'array' then f.steps else '[]'::jsonb end) s) || '.', '');
    perform public.assistant_put_auto('auto:formula:' || f.code, v_content, 'Fórmula ' || f.code, v_text, array['copies', 'formula', lower(f.code)]);
    v_keys := array_append(v_keys, ('auto:formula:' || f.code)::text);
  end loop;

  -- Video rules per network.
  for r in select network, label, formats, copy_max_chars, length_group, notes from public.network_specs order by network loop
    v_text := format('Reglas de %s: el copy va en su versión %s, de hasta %s caracteres.', r.label,
      case r.length_group when 'long' then 'larga' when 'medium' then 'media' else 'corta' end, r.copy_max_chars);
    for f in select key as fmt, value as v from jsonb_each(case when jsonb_typeof(r.formats) = 'object' then r.formats else '{}'::jsonb end) order by key loop
      v_list := concat_ws(', ',
        case when f.v ? 'min_duration_s' and f.v ? 'max_duration_s' then
               'dura de ' || (f.v ->> 'min_duration_s') || ' a ' || (f.v ->> 'max_duration_s') || ' segundos'
             when f.v ? 'max_duration_s' then 'dura hasta ' || (f.v ->> 'max_duration_s') || ' segundos'
             when f.v ? 'min_duration_s' then 'dura desde ' || (f.v ->> 'min_duration_s') || ' segundos' end,
        case when jsonb_typeof(f.v -> 'aspects') = 'array' then
          'formato ' || (select string_agg(a, ' o ') from jsonb_array_elements_text(f.v -> 'aspects') a) end,
        case when f.v ? 'min_width' then 'ancho mínimo ' || (f.v ->> 'min_width') || ' px' end,
        case when f.v ? 'max_size_mb' then 'hasta ' || (f.v ->> 'max_size_mb') || ' MB' end,
        case when f.v ? 'max_fps' then 'hasta ' || (f.v ->> 'max_fps') || ' cuadros por segundo' end);
      v_text := v_text || ' ' || case f.fmt when 'reel' then 'Reel' when 'photo' then 'Foto' when 'video' then 'Video'
          when 'short' then 'Short' when 'post' then 'Publicación' when 'carousel' then 'Carrusel' else initcap(f.fmt) end
        || ': ' || coalesce(nullif(v_list, ''), 'sin reglas guardadas') || '.';
    end loop;
    if coalesce(r.notes, '') <> '' then v_text := v_text || ' Nota: ' || r.notes; end if;
    perform public.assistant_put_auto('auto:red:' || r.network, v_content || 'camera'::public.app_role,
      'Reglas de video de ' || r.label, v_text, array['video', 'reglas', r.network]);
    v_keys := array_append(v_keys, ('auto:red:' || r.network)::text);
  end loop;

  -- Categories, per kind.
  for r in select distinct kind from public.categories where active and deleted_at is null order by kind loop
    v_list := (select string_agg(p.name || coalesce(' (' || (
                 select string_agg(c.name, ', ' order by c.sort, c.name) from public.categories c
                  where c.parent_id = p.id and c.active and c.deleted_at is null) || ')', ''), '; ' order by p.sort, p.name)
                 from public.categories p where p.kind = r.kind and p.parent_id is null and p.active and p.deleted_at is null);
    perform public.assistant_put_auto('auto:categorias:' || r.kind, null,
      'Categorías de ' || case r.kind when 'content' then 'contenido' when 'event' then 'eventos'
        when 'traceability' then 'trazabilidad' when 'youtube_pillar' then 'pilares de YouTube' else r.kind end,
      coalesce(v_list, 'No hay categorías activas de este tipo.') || '.', array['categorias', r.kind]);
    v_keys := array_append(v_keys, ('auto:categorias:' || r.kind)::text);
  end loop;

  update public.assistant_knowledge set active = false
   where origin = 'plataforma' and active and key like 'auto:%' and not (key = any (v_keys));
  return coalesce(array_length(v_keys, 1), 0);
end $$;

-- ---------------------------------------------------------------------------
-- 10. Two-factor list, in place where it exists (a real project seeded it before this file; the demo and the tests
--     seed it afterwards from config/clients/fb.json, which carries the same list).
-- ---------------------------------------------------------------------------
update public.app_settings s
   set value = (select coalesce(jsonb_agg(r order by r), '[]'::jsonb) from (
                  select x as r from jsonb_array_elements_text(case when jsonb_typeof(s.value) = 'array' then s.value else '[]'::jsonb end) x
                   where x not in ('secretary', 'supervisor')
                  union select 'politics' union select 'ivt') t),
       updated_at = now()
 where s.key = 'security.mfa_roles';

select public.assistant_refresh();

-- ---------------------------------------------------------------------------
-- 12. Privileges (rule of 20261026001400_functions_closed_to_anon.sql). CREATE OR REPLACE keeps a function's grants;
--     they are stated again so this file reads on its own.
-- ---------------------------------------------------------------------------
revoke all on function public.can_approve() from public, anon;
grant execute on function public.can_approve() to authenticated;
revoke all on function public.is_content_team() from public, anon;
grant execute on function public.is_content_team() to authenticated;
revoke all on function public.review_piece(uuid, text, text, int) from public, anon;
grant execute on function public.review_piece(uuid, text, text, int) to authenticated;
revoke all on function public.set_review_level(uuid, text) from public, anon;
grant execute on function public.set_review_level(uuid, text) to authenticated;
revoke all on function public.guard_invitation_roles() from public, anon, authenticated;
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
revoke all on function public.guard_piece_status() from public, anon, authenticated;
revoke all on function public.guard_tweet() from public, anon, authenticated;
revoke all on function public.assistant_refresh() from public, anon, authenticated;
