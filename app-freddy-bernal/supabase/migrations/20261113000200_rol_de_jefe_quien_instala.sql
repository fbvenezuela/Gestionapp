-- The boss's role in plain words (13/11, the team-guide round): the refusals of guard_boss_grant() said «el comando de
-- instalación», an inner word, and a person can read them: friendlyDbError() (src/lib/db/core.ts) passes our own
-- guards' messages through as they are, and «Anular» on an invitation naming the boss that another person of
-- Administración had just revoked reaches the third one. Now they say who gives the role, as the screen does
-- (BOSS_GRANT_MESSAGE, src/lib/roles.ts: «El rol de jefe lo da quien instala la app.»).
-- The same function as in 20261028002350_boss_grant.sql (nothing here edits an earlier file), with only those three
-- texts changed: the same checks, the same error code, the same triggers (they keep calling it by name). No new rows.

create or replace function public.guard_boss_grant()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.uid() is null then return null; end if;
  if tg_table_name = 'user_roles' then
    if new.role::text = 'boss'
       and (tg_op = 'INSERT' or old.role::text <> 'boss' or new.user_id is distinct from old.user_id) then
      raise exception 'El rol de jefe lo da quien instala la app, no la pantalla de Equipo.' using errcode = '42501';
    end if;
    return null;
  end if;
  -- invitations
  if tg_op = 'INSERT' then
    if 'boss' = any (new.roles::text[]) then
      raise exception 'El rol de jefe lo da quien instala la app, no una invitación.' using errcode = '42501';
    end if;
  elsif ('boss' = any (new.roles::text[]) or 'boss' = any (old.roles::text[]))
        and ((to_jsonb(new) - 'revoked_at') is distinct from (to_jsonb(old) - 'revoked_at')
             or (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at)) then
    -- Only revoking it: another email, other roles, a new expiry or bringing it back would give the role again.
    raise exception 'Una invitación con el rol de jefe solo se anula; la da quien instala la app.' using errcode = '42501';
  end if;
  return null;
end $$;

-- The same privileges as before (create or replace keeps them; said again so this file stands on its own).
revoke all on function public.guard_boss_grant() from public, anon, authenticated;
