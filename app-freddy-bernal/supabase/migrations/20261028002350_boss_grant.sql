-- The boss's role is given only by the system (R3, 28/10/2026, D-58). Nothing here edits an earlier file.
--
--   1. The boss reads every conversation in Mensajes (D-50, 20261028002400_internal_chat.sql) and approves everything
--      (can_approve()). Until now Administración could give the role to ANOTHER account (user_roles_insert,
--      20261028002200_round_review_fixes.sql, only stops it giving roles to itself) or invite one as the boss
--      (invitations_admin), put 2FA on it and read «Todas» or approve. Now giving 'boss' is the system's only:
--      auth.uid() is null, that is the seed, a migration, `npm run db:first-admin -- <correo> "<nombre>" --jefe`
--      (scripts/create-first-admin.mts) and the Supabase sign-up (handle_new_auth_user copies the roles of an
--      invitation the system made). A person cannot touch an invitation that names the boss either (another email on
--      it would hand the role to someone else), except to revoke it. Taking the role away is still Administración's
--      (closing opens nothing). The guard runs AFTER the row is written, so the policies speak first: what they
--      already refused (admin giving itself a role, a session without 2FA) still reads as a refusal of the policy,
--      and so does guard_role_mix (Administración with the boss in one account).
--   2. Every TEAM role a PERSON gives (not the system) reaches every active boss as a notice in the bell: «Administración
--      le dio el rol Grabación a Kevin Sánchez.» or «Administración invitó a … como Redes.», linked to «Quién habla con
--      quién» (/mensajes/permisos). The person's name and the role only: never the email. The names of the roles are
--      the app's (ROLE_LABEL, src/lib/roles.ts; tests/rls/boss-grant.test.ts compares them).
-- No enum values, no rows, nothing new in the Realtime publication.

-- ---------------------------------------------------------------------------
-- 1. The boss's role: the system's only
-- ---------------------------------------------------------------------------
create function public.guard_boss_grant()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.uid() is null then return null; end if;
  if tg_table_name = 'user_roles' then
    if new.role::text = 'boss'
       and (tg_op = 'INSERT' or old.role::text <> 'boss' or new.user_id is distinct from old.user_id) then
      raise exception 'El rol de jefe lo da el comando de instalación, no la pantalla de Equipo.' using errcode = '42501';
    end if;
    return null;
  end if;
  -- invitations
  if tg_op = 'INSERT' then
    if 'boss' = any (new.roles::text[]) then
      raise exception 'El rol de jefe lo da el comando de instalación, no una invitación.' using errcode = '42501';
    end if;
  elsif ('boss' = any (new.roles::text[]) or 'boss' = any (old.roles::text[]))
        and ((to_jsonb(new) - 'revoked_at') is distinct from (to_jsonb(old) - 'revoked_at')
             or (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at)) then
    -- Only revoking it: another email, other roles, a new expiry or bringing it back would give the role again.
    raise exception 'Una invitación con el rol de jefe solo se anula; la da el comando de instalación.' using errcode = '42501';
  end if;
  return null;
end $$;
-- AFTER triggers fire by name: this one after guard_role_mix (20261028002200_round_review_fixes.sql), so an account of
-- Administración given the boss's role still reads «Administración no puede ser también el jefe…», the more specific
-- reason (the same order as roleGrantProblem() in src/lib/roles.ts).
create trigger guard_role_to_boss after insert or update on public.user_roles
  for each row execute function public.guard_boss_grant();
create trigger guard_role_to_boss after insert or update on public.invitations
  for each row execute function public.guard_boss_grant();

-- ---------------------------------------------------------------------------
-- 2. A team role given by a person: the boss is told
-- ---------------------------------------------------------------------------
-- The same names as ROLE_LABEL of src/lib/roles.ts.
create function public.team_role_label(r text)
returns text language sql immutable set search_path = '' as $$
  select case r when 'boss' then 'Jefe' when 'dispatch' then 'Director de despacho' when 'politics' then 'Director de política'
                when 'ivt' then 'Director del IVT' when 'camera' then 'Grabación' when 'social' then 'Redes'
                when 'admin' then 'Administración' else r end
$$;

create function public.notify_team_role_grant()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_title text;
  v_body text;
  v_name text;
  v_roles text;
begin
  if auth.uid() is null then return null; end if;
  if tg_table_name = 'user_roles' then
    if new.role::text not in ('dispatch', 'politics', 'ivt', 'camera', 'social') then return null; end if;
    select nullif(btrim(full_name), '') into v_name from public.profiles where id = new.user_id;
    v_title := 'Un rol nuevo en el equipo';
    v_body := 'Administración le dio el rol ' || public.team_role_label(new.role::text) || ' a '
              || coalesce(v_name, 'una persona') || '.';
  else
    select string_agg(public.team_role_label(r::text), ', ' order by r) into v_roles
      from unnest(new.roles) r where r::text in ('dispatch', 'politics', 'ivt', 'camera', 'social');
    if v_roles is null then return null; end if;
    v_title := 'Alguien nuevo en el equipo';
    v_body := 'Administración invitó a ' || coalesce(nullif(btrim(new.full_name), ''), 'una persona') || ' como ' || v_roles || '.';
  end if;
  insert into public.notifications (user_id, kind, title, body, link)
  select ur.user_id, 'team_role_granted', v_title, v_body, '/mensajes/permisos'
    from public.user_roles ur join public.profiles p on p.id = ur.user_id
   where ur.role = 'boss' and p.active and p.deleted_at is null;
  return null;
end $$;
create trigger notify_team_role_grant after insert on public.user_roles
  for each row execute function public.notify_team_role_grant();
create trigger notify_team_role_grant after insert on public.invitations
  for each row execute function public.notify_team_role_grant();

-- ---------------------------------------------------------------------------
-- 3. Privileges (rule of 20261026001400_functions_closed_to_anon.sql). Trigger functions: nobody calls them.
-- ---------------------------------------------------------------------------
revoke all on function public.guard_boss_grant(), public.notify_team_role_grant() from public, anon, authenticated;
revoke all on function public.team_role_label(text) from public, anon;
grant execute on function public.team_role_label(text) to authenticated;
