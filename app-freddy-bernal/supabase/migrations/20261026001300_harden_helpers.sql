-- wire_standard_triggers only runs inside migrations, as the owner. It creates triggers with dynamic SQL, so a caller
-- with TRIGGER on a table could, for example, add an audit loop on audit_log. Nobody else needs to call it.
revoke all on function public.wire_standard_triggers(regclass, boolean, boolean) from public, anon, authenticated;

-- A fixed search_path for the helpers that had none (Supabase's Security Advisor flags them). Their bodies only use
-- pg_catalog and schema-qualified names, so an empty path is enough.
alter function public.audit_log_immutable() set search_path = '';
alter function public.touch_updated_at() set search_path = '';
alter function public.wire_standard_triggers(regclass, boolean, boolean) set search_path = '';
alter function public.guard_notification_update() set search_path = '';
alter function public.level_rank(text) set search_path = '';
alter function public.assistant_append_only() set search_path = '';
alter function public.assistant_arr(jsonb) set search_path = '';
alter function public.assistant_minutes(int) set search_path = '';
