-- Hosted Supabase gives anon, authenticated and service_role ALL (TRIGGER and TRUNCATE included) on every table,
-- sequence and function that the role "postgres" creates in public: platform default privileges, seen on fb-dev on
-- 26/10/2026. The migrations were written and tested without them (supabase/shim): the API roles get only what a
-- migration grants on purpose, and RLS does the rest. This runs first, so a hosted project ends up with exactly the
-- privileges the tests check. A no-op on the shim and PGlite. Functions keep PostgreSQL's own EXECUTE for PUBLIC.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
