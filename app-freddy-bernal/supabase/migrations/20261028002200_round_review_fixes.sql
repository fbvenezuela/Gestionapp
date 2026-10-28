-- Fixes from the review of the whole round (28/10/2026). Nothing here edits an earlier file.
--
--   1. Roles. «Solo el jefe aprueba» and «Administración no pone fecha ni edita la agenda» hold in the database even
--      against Administración itself: user_roles_insert (20261023000100_base.sql) let admin give ITSELF 'boss' (then
--      can_approve() said yes) or 'dispatch' (then can_manage_agenda() said yes). Now nobody gives roles to
--      themselves, and an account never holds Administración together with the boss or despacho (guard_role_mix, for
--      everyone, the system too). Invitations that mix them are refused (guard_invitation_roles), and the pending ones
--      that already mix them are revoked here (a sign-up from one would now fail).
--   2. The 2FA list. The agenda's gate (can_manage_agenda()), the date (can_see_schedule()) and the contacts (the
--      *_private policies) still read the editable list 'security.mfa_roles' through mfa_ok(). An admin with 2FA could
--      take despacho, política or the IVT out of it, and then those roles passed on a first-factor session. The list
--      now always names admin, the boss, despacho, política and the IVT (guard_mfa_roles_setting), and this file puts
--      back any of them that is missing.
--   3. Community contacts (spec §4.2: «solo las ven el director de política, el despacho y el jefe»). Administración
--      no longer reads, adds or changes community_report_private, and no longer creates a report (it keeps reading the
--      main part, which carries no phone, to soft-delete and restore it). D-41.
--   4. The audit of the private tables (obra_ficha_private, community_report_private) keeps the NAMES of the fields
--      that changed, never their values (as ficha_private_history already does): Administración reads audit_log, and
--      a phone or a name kept there would outlive the ficha. Rows written before this file are not rewritten
--      (audit_log is append-only).
--   5. Phones in text Redes reads. Until now only the obra's main text and the cancel reason refused one
--      (text_has_phone(), 20261028002100_privacy_hardening.sql). Now also: Grabación's notes for the editor
--      (recording_notes.body: a time code such as «2:15» is not a phone and still passes), the community report's
--      main text (the same fields the app checks: mainTextPhone over REPORT_FIELDS; «Ponerle fecha» copies some of
--      them into the event), and the event's own text (title, place, summary).
--   6. A soft-deleted event is Administración's only. can_see_event() (brief, storyboard, material, notes) and the
--      camera branch of can_see_schedule() (date, address, site contacts) no longer open a deleted event to the camera
--      person assigned, Redes, the boss or despacho; Administración keeps it through its own branch.
--   7. An event's code belongs to the database, as a ficha's (20261027001950_fichas_media_fixes.sql): a person could
--      put a date in it (Redes reads the code and it starts every downloaded file name) or take the next number (the
--      next event, the boss's own or «Ponerle fecha», then failed). guard_event_code gives it; it always looks like
--      E-0001; the sequence is no longer usable by API roles.
--   8. An event already done keeps its date and place: event_schedule refuses a change once the event is marked done
--      (the obra visit would show the IVT a future date for a visit already made). Trusted paths and the system pass.
-- No enum values, no rows except the revoked invitations and the 2FA list, nothing new in the Realtime publication.

-- ---------------------------------------------------------------------------
-- 1. Roles: nobody to themselves, and never Administración with the boss or despacho
-- ---------------------------------------------------------------------------
alter policy user_roles_insert on public.user_roles
  with check (public.has_role('admin') and public.mfa_ok() and user_id <> auth.uid());

create function public.guard_role_mix()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.user_roles ur where ur.user_id = new.user_id and ur.role = 'admin')
     and exists (select 1 from public.user_roles ur where ur.user_id = new.user_id and ur.role in ('boss', 'dispatch')) then
    raise exception 'Administración no puede ser también el jefe ni el despacho: usa otra cuenta.' using errcode = '42501';
  end if;
  return null;
end $$;
create trigger guard_role_mix after insert or update on public.user_roles
  for each row execute function public.guard_role_mix();

create or replace function public.guard_invitation_roles()
returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from unnest(new.roles) r
              where r::text not in ('admin', 'boss', 'dispatch', 'politics', 'ivt', 'camera', 'social')) then
    raise exception 'Ese rol ya no se usa. Los roles son: jefe, despacho, política, IVT, grabación, redes y administración.'
      using errcode = '42501';
  end if;
  if 'admin' = any (new.roles::text[]) and new.roles::text[] && array['boss', 'dispatch'] then
    raise exception 'Administración no puede ser también el jefe ni el despacho: invita otra cuenta.' using errcode = '42501';
  end if;
  return new;
end $$;

-- Pending invitations that mix them: revoked (guard_invitation_roles fires only when the roles change).
update public.invitations
   set revoked_at = now()
 where accepted_at is null and revoked_at is null
   and 'admin' = any (roles::text[]) and roles::text[] && array['boss', 'dispatch'];

-- ---------------------------------------------------------------------------
-- 2. The 2FA list always names the five roles whose gates read it
-- ---------------------------------------------------------------------------
create or replace function public.guard_mfa_roles_setting()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'UPDATE' and old.key = 'security.mfa_roles' and new.key is distinct from old.key then
    raise exception 'La lista del doble factor no se renombra.' using errcode = '42501';
  end if;
  if new.key <> 'security.mfa_roles' then return new; end if;
  if coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then
    raise exception 'Para cambiar quién usa doble factor hay que entrar con doble factor.' using errcode = '42501';
  end if;
  if jsonb_typeof(new.value) is distinct from 'array'
     or exists (select 1 from jsonb_array_elements(new.value) x where jsonb_typeof(x) <> 'string')
     or not (new.value ?& array['admin', 'boss', 'dispatch', 'politics', 'ivt']) then
    raise exception 'El doble factor siempre lo usan administración, el jefe, el despacho, política y el IVT.' using errcode = '42501';
  end if;
  return new;
end $$;

update public.app_settings s
   set value = (select jsonb_agg(r order by r) from (
                  select jsonb_array_elements_text(s.value) as r
                  union select unnest(array['admin', 'boss', 'dispatch', 'politics', 'ivt'])) t),
       updated_at = now()
 where s.key = 'security.mfa_roles' and jsonb_typeof(s.value) = 'array'
   and not (s.value ?& array['admin', 'boss', 'dispatch', 'politics', 'ivt']);

-- ---------------------------------------------------------------------------
-- 3. Community contacts: política, despacho and the boss (with 2FA). Administración keeps the main part (no phone).
-- ---------------------------------------------------------------------------
alter policy community_reports_insert on public.community_reports
  with check (public.has_any_role(array['boss', 'dispatch', 'politics']::public.app_role[])
              and created_by = auth.uid() and deleted_at is null);
alter policy community_report_private_select on public.community_report_private
  using (public.mfa_ok() and public.has_any_role(array['boss', 'dispatch', 'politics']::public.app_role[])
         and exists (select 1 from public.community_reports r where r.id = community_report_private.id));
alter policy community_report_private_insert on public.community_report_private
  with check (public.mfa_ok() and public.has_any_role(array['boss', 'dispatch', 'politics']::public.app_role[])
              and exists (select 1 from public.community_reports r where r.id = community_report_private.id));
alter policy community_report_private_update on public.community_report_private
  using (public.mfa_ok() and public.has_any_role(array['boss', 'dispatch', 'politics']::public.app_role[])
         and exists (select 1 from public.community_reports r where r.id = community_report_private.id))
  with check (public.mfa_ok() and public.has_any_role(array['boss', 'dispatch', 'politics']::public.app_role[])
              and exists (select 1 from public.community_reports r where r.id = community_report_private.id));

-- ---------------------------------------------------------------------------
-- 4. The audit trail: the private tables keep field names only
-- ---------------------------------------------------------------------------
create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  rid text;
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_action text := lower(tg_op);
  -- What a private row may keep in the trail: which row, its version, who saved it and when.
  v_keep constant text[] := array['id', 'rev', 'updated_by', 'updated_at'];
  v_fields jsonb;
begin
  if tg_op = 'UPDATE' and v_new = v_old then return new; end if;
  if tg_op = 'DELETE' then
    rid := coalesce(v_old ->> 'id', v_old ->> 'event_id', v_old ->> 'key');
  else
    rid := coalesce(v_new ->> 'id', v_new ->> 'event_id', v_new ->> 'key', v_new ->> 'user_id');
  end if;
  if tg_op = 'UPDATE' and (v_old ->> 'deleted_at') is null and (v_new ->> 'deleted_at') is not null then
    v_action := 'soft_delete';
  end if;
  if tg_table_name in ('obra_ficha_private', 'community_report_private') then
    select coalesce(jsonb_agg(k order by k), '[]'::jsonb) into v_fields
      from jsonb_object_keys(coalesce(v_new, v_old)) k
     where k <> all (v_keep)
       and case when tg_op = 'UPDATE' then (v_new -> k) is distinct from (v_old -> k)
                else (coalesce(v_new, v_old) -> k) not in ('null'::jsonb, '""'::jsonb, '{}'::jsonb) end;
    if v_old is not null then
      v_old := coalesce((select jsonb_object_agg(k, v_old -> k) from unnest(v_keep) k where v_old ? k), '{}'::jsonb);
    end if;
    if v_new is not null then
      v_new := coalesce((select jsonb_object_agg(k, v_new -> k) from unnest(v_keep) k where v_new ? k), '{}'::jsonb)
               || jsonb_build_object('fields', v_fields);
    else
      v_old := v_old || jsonb_build_object('fields', v_fields);
    end if;
  end if;
  insert into public.audit_log (actor_id, table_name, row_id, action, old_data, new_data)
  values (auth.uid(), tg_table_name, rid, v_action, v_old, v_new);
  return case when tg_op = 'DELETE' then old else new end;
end $$;

-- ---------------------------------------------------------------------------
-- 5. No phone in the text Redes reads
-- ---------------------------------------------------------------------------
alter table public.recording_notes add constraint recording_notes_no_phone check (not public.text_has_phone(body));

-- The report's main free text: the same fields as the app's check (mainTextPhone over REPORT_FIELDS, not private).
alter table public.community_reports add constraint community_reports_main_no_phone check (not public.text_has_phone(concat_ws(E'\n',
  parish, community, title, description, why_matters, in_charge, institution, collaborators, sectors, results,
  pending_support, priority_reason, follow_up_owner, observations)));

alter table public.events add constraint events_main_no_phone
  check (not public.text_has_phone(concat_ws(E'\n', title, place_name, summary)));

-- ---------------------------------------------------------------------------
-- 6. A deleted event: Administración only
-- ---------------------------------------------------------------------------
create or replace function public.can_see_event(e uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role('admin')
    or (exists (select 1 from public.events ev where ev.id = e and ev.deleted_at is null)
        and (public.has_any_role(array['boss', 'dispatch', 'social']::public.app_role[])
             or (public.has_role('camera') and public.is_assigned(e))))
$$;

create or replace function public.can_see_schedule(e uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.mfa_ok() and (
    public.has_any_role(array['admin', 'boss', 'dispatch']::public.app_role[])
    or (public.has_role('camera') and public.is_assigned(e)
        and exists (select 1 from public.events ev where ev.id = e and ev.deleted_at is null))
    or (public.has_role('ivt') and exists (select 1 from public.events ev
                                            where ev.id = e and ev.obra_ficha_id is not null and ev.deleted_at is null))
  )
$$;

-- ---------------------------------------------------------------------------
-- 7. The event's code: the database's
-- ---------------------------------------------------------------------------
-- BEFORE triggers fire by name: this one before guard_event_insert. The system (seed, jobs) may bring a code of the
-- right shape; a person never chooses one.
create function public.guard_event_code()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.code is null or auth.uid() is not null then
    new.code := 'E-' || lpad(nextval('public.event_code_seq')::text, 4, '0');
  end if;
  return new;
end $$;
create trigger guard_event_code before insert on public.events
  for each row execute function public.guard_event_code();
alter table public.events alter column code drop default;
alter table public.events add constraint events_code_shape check (code ~ '^E-[0-9]{4,}$');
revoke all on sequence public.event_code_seq from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. A done event keeps its date and place
-- ---------------------------------------------------------------------------
create function public.guard_schedule_done()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or current_setting('app.trusted_update', true) = 'on' then return new; end if;
  if (new.starts_at, new.ends_at, new.exact_address, new.directions, new.site_contacts)
       is distinct from (old.starts_at, old.ends_at, old.exact_address, old.directions, old.site_contacts)
     and exists (select 1 from public.events e where e.id = old.event_id and e.done_on is not null) then
    raise exception 'Este evento ya se realizó: su fecha y su lugar ya no se cambian.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger guard_schedule_done before update on public.event_schedule
  for each row execute function public.guard_schedule_done();

-- ---------------------------------------------------------------------------
-- 9. Privileges (rule of 20261026001400_functions_closed_to_anon.sql). CREATE OR REPLACE keeps a function's grants;
--    they are stated again so this file reads on its own. Trigger functions: nobody calls them.
-- ---------------------------------------------------------------------------
revoke all on function public.can_see_event(uuid) from public, anon;
revoke all on function public.can_see_schedule(uuid) from public, anon;
grant execute on function public.can_see_event(uuid), public.can_see_schedule(uuid) to authenticated;
revoke all on function public.guard_role_mix() from public, anon, authenticated;
revoke all on function public.guard_invitation_roles() from public, anon, authenticated;
revoke all on function public.guard_mfa_roles_setting() from public, anon, authenticated;
revoke all on function public.audit_row() from public, anon, authenticated;
revoke all on function public.guard_event_code() from public, anon, authenticated;
revoke all on function public.guard_schedule_done() from public, anon, authenticated;
