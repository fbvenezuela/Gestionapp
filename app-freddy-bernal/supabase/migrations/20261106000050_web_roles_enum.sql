-- Web pública (6/11/2026, D-93): three new roles for the governor's public website and citizen participation. Only the
-- values are added here; they are used from the next file on (Postgres refuses a new enum value inside the transaction
-- that adds it). writer, reports_operator and complaints_operator already exist (phase 3) and are reused; aid_operator
-- stays unused.
--   web_publisher          «Aprobador de la web»: reviews, publishes, schedules and archives what the editors prepare.
--   attention_coordinator  «Coordinador de atención»: every citizen request (denuncias too), assigns, merges, publishes.
--   auditor                «Consulta y auditoría»: reads requests (never the citizen's contact) and their audit trail.
alter type public.app_role add value if not exists 'web_publisher' after 'writer';
alter type public.app_role add value if not exists 'attention_coordinator' before 'reports_operator';
alter type public.app_role add value if not exists 'auditor' after 'aid_operator';
