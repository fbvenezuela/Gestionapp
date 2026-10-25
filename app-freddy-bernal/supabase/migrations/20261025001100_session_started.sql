-- When the Supabase Auth session behind a token began (src/lib/auth/session.ts). A token renewed
-- after «Cerrar sus sesiones» keeps its old session but gets a fresh iat, so the session's start
-- decides. SECURITY DEFINER: it runs as its owner (the role that applies the migrations), so the
-- app's DATABASE_URL role needs no grant on the auth schema. Null when auth.sessions does not exist
-- (the demo and test shim), when the session is gone, and for a null id (strict). plpgsql, so the
-- body is only planned when it runs, after the to_regclass guard.
create or replace function public.auth_session_started(p_session_id uuid)
returns timestamptz
language plpgsql stable strict security definer
set search_path = ''
as $$
begin
  if to_regclass('auth.sessions') is null then
    return null;
  end if;
  return (select s.created_at from auth.sessions s where s.id = p_session_id);
end $$;

-- Only the server calls it (as the owner); never the API roles. If DATABASE_URL ever uses a role
-- other than the owner, grant it EXECUTE; without it the app falls back to the token's time.
revoke all on function public.auth_session_started(uuid) from public, anon, authenticated;
