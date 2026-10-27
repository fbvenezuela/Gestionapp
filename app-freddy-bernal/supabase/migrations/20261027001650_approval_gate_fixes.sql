-- Fixes found in the review of the six roles (20261027001600_six_roles.sql). Nothing here edits that file.
--
--   1. public.can_approve() is the boss WITH 2FA, always. Its 2FA part was public.mfa_ok(), which reads the editable
--      list app_settings 'security.mfa_roles' and says yes to anyone whose roles are not in it. Whoever could take
--      'boss' out of that list let the boss approve on a first-factor session (aal1); an emptied list also let admin
--      give himself 'boss' without 2FA. The gate no longer reads the list.
--   2. Settings are written by admin WITH 2FA (mfa_ok(), the same rule as user_roles and invitations). The 2FA list
--      itself changes only on an aal2 session, is always a JSON array of role names, always names admin and the
--      boss, and is never renamed. Seeds, migrations and system jobs (no person) pass.
--   3. The boss «hace lo de Redes»: «Ya lo publiqué» and «Crear pieza» move the event's work_status in the same
--      transaction, and guard_event_update let the boss change only priority and boss_decision, so the whole action
--      was rolled back. The boss may now change work_status and urgency, like Redes. The retired-role branch goes.
--      This function belongs to 20261027001800_shared_agenda.sql from now on, which must keep the boss's
--      work_status and urgency (tests/rls/roles.test.ts and tests/unit/flows-actions.test.ts check it).

-- ---------------------------------------------------------------------------
-- 1. The one approval gate: the boss, on a session that passed the second factor.
-- ---------------------------------------------------------------------------
create or replace function public.can_approve()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role('boss') and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
$$;

-- ---------------------------------------------------------------------------
-- 2. Settings: admin with 2FA; the 2FA list keeps admin and the boss.
-- ---------------------------------------------------------------------------
alter policy settings_write on public.app_settings
  with check (public.has_role('admin') and public.mfa_ok());
alter policy settings_update on public.app_settings
  using (public.has_role('admin') and public.mfa_ok())
  with check (public.has_role('admin') and public.mfa_ok());

create function public.guard_mfa_roles_setting()
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
     or not (new.value ? 'admin' and new.value ? 'boss') then
    raise exception 'El doble factor siempre lo usan administración y el jefe.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger guard_mfa_roles_setting before insert or update on public.app_settings
  for each row execute function public.guard_mfa_roles_setting();

-- ---------------------------------------------------------------------------
-- 3. Column guard on events: the boss also moves work_status and urgency (what Redes' screens do).
-- ---------------------------------------------------------------------------
create or replace function public.guard_event_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  changed text[];
  allowed text[];
begin
  if auth.uid() is null or public.has_any_role(array['admin', 'dispatch']::public.app_role[])
     or current_setting('app.trusted_update', true) = 'on' then
    return new;
  end if;
  select coalesce(array_agg(n.key), '{}') into changed
    from jsonb_each(to_jsonb(new)) n
   where n.value is distinct from (to_jsonb(old) -> n.key) and n.key not in ('updated_at');
  allowed := '{}';
  if public.has_role('boss') then allowed := allowed || array['priority', 'boss_decision', 'work_status', 'urgency']; end if;
  if public.has_role('social') then allowed := allowed || array['work_status', 'urgency']; end if;
  if not changed <@ allowed then
    raise exception 'No puedes cambiar estos datos del evento.' using errcode = '42501';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Privileges (rule of 20261026001400_functions_closed_to_anon.sql). CREATE OR REPLACE keeps a function's grants;
-- they are stated again so this file reads on its own.
-- ---------------------------------------------------------------------------
revoke all on function public.can_approve() from public, anon;
grant execute on function public.can_approve() to authenticated;
revoke all on function public.guard_mfa_roles_setting() from public, anon, authenticated;
revoke all on function public.guard_event_update() from public, anon, authenticated;
