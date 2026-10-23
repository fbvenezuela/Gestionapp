-- In-app notifications, the email outbox and AI usage.
-- Rows here are written by the server (system connection), never directly by users.
-- Notification and email texts never carry an event's date or time (rule 4).

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null default '',
  link text,
  idempotency_key text unique,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.outbox (
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  subject text not null,
  html text not null,
  text_body text not null,
  template text not null,
  idempotency_key text not null unique,
  status text not null default 'stored' check (status in ('stored', 'sent', 'failed')),
  provider_id text,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index outbox_created_idx on public.outbox (created_at desc);

create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  user_id uuid references public.profiles (id),
  feature text not null,
  provider text not null,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_usd numeric(10, 4) not null default 0
);
create index ai_usage_at_idx on public.ai_usage (at desc);

-- Scheduled work queue (publish at time, tweet stock alerts, metrics pulls).
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  run_at timestamptz not null default now(),
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  attempts int not null default 0,
  last_error text,
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index jobs_due_idx on public.jobs (run_at) where status = 'queued';

alter table public.notifications enable row level security;
alter table public.outbox enable row level security;
alter table public.ai_usage enable row level security;
alter table public.jobs enable row level security;

grant select, update on public.notifications to authenticated;
grant select on public.outbox, public.ai_usage, public.jobs to authenticated;

create policy notifications_own on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_read on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy outbox_admin on public.outbox for select to authenticated using (public.has_role('admin') and public.mfa_ok());
create policy ai_usage_admin on public.ai_usage for select to authenticated using (public.has_role('admin'));
create policy jobs_admin on public.jobs for select to authenticated using (public.has_role('admin'));

-- Users may only flip read_at on their notifications.
create or replace function public.guard_notification_update()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and (new.title is distinct from old.title or new.body is distinct from old.body
      or new.user_id is distinct from old.user_id or new.kind is distinct from old.kind or new.link is distinct from old.link) then
    raise exception 'Solo se puede marcar como leído.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger guard_notification_update before update on public.notifications
  for each row execute function public.guard_notification_update();
