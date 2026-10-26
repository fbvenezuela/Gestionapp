-- PostgreSQL lets PUBLIC (and so anon, a browser without a session) execute every new function, and Supabase's Data
-- API exposes them at /rest/v1/rpc. Each one checks roles inside, but anon never needs any of them (it reads no table),
-- so take it away. Functions that signed-in people use keep EXECUTE through authenticated; trigger functions need no
-- EXECUTE to fire. A new function in a later migration needs the same: revoke from public and anon, grant to
-- authenticated only what the app calls (tests/rls/hosted-defaults.test.ts checks that anon has nothing).
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig,
           p.prorettype = 'trigger'::regtype as is_trigger,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') as signed_in
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    if f.is_trigger then
      execute format('revoke execute on function %s from authenticated', f.sig);
    elsif f.signed_in then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;
