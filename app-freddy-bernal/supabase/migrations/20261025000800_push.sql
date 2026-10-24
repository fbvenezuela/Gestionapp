-- Phone notifications (Web Push), push throttling, the cron lease and the optional pg_cron schedule.
-- Push texts are the in-app notification title/body: they never carry an event's date, time,
-- address, directions or contacts (rule 4). The sender also strips anything that looks like one.

-- ---------------------------------------------------------------------------
-- One row per browser/phone that accepted notifications.
-- ---------------------------------------------------------------------------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  endpoint text not null unique check (endpoint like 'https://%' and length(endpoint) <= 1000),
  p256dh text not null check (length(p256dh) between 16 and 200),
  auth text not null check (length(auth) between 8 and 100),
  user_agent text not null default '' check (length(user_agent) <= 300),
  created_at timestamptz not null default now(),
  last_ok_at timestamptz,
  failed_count int not null default 0
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
grant select, insert, delete on public.push_subscriptions to authenticated;

-- Each person only sees, adds and removes their own phones. Nobody edits a row (the server
-- keeps last_ok_at / failed_count with the system connection).
create policy push_subscriptions_select on public.push_subscriptions for select to authenticated
  using (user_id = auth.uid());
create policy push_subscriptions_insert on public.push_subscriptions for insert to authenticated
  with check (user_id = auth.uid() and public.is_staff());
create policy push_subscriptions_delete on public.push_subscriptions for delete to authenticated
  using (user_id = auth.uid());

-- A browser endpoint belongs to whoever signed in last on that phone: saving it removes any
-- older row for the same endpoint (even another person's), so pushes never reach the wrong
-- person on a shared phone. Only the endpoint holder (the browser itself) knows that URL.
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  rid uuid;
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  delete from public.push_subscriptions where endpoint = p_endpoint;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(coalesce(p_user_agent, ''), 300))
  returning id into rid;
  return rid;
end $$;
revoke all on function public.save_push_subscription(text, text, text, text) from public;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;

-- Turning a person off (or removing them) drops their phones right away: a phone they keep
-- after leaving must never get another notice.
create or replace function public.drop_push_subscriptions_when_off()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.push_subscriptions where user_id = new.id;
  return new;
end $$;
revoke all on function public.drop_push_subscriptions_when_off() from public;
create trigger profiles_drop_push_when_off
  after update of active, deleted_at on public.profiles
  for each row when (new.active is distinct from true or new.deleted_at is not null)
  execute function public.drop_push_subscriptions_when_off();

-- ---------------------------------------------------------------------------
-- "Last time we sent X to this person": groups push bursts (one per person per kind per
-- 10 minutes) and marks the daily digest as done. Server only.
-- ---------------------------------------------------------------------------
create table public.notify_throttle (
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, kind)
);
alter table public.notify_throttle enable row level security;

-- ---------------------------------------------------------------------------
-- Lease so two cron ticks never run at the same time (pg_cron every 5 minutes plus Vercel).
-- Server only.
-- ---------------------------------------------------------------------------
create table public.cron_leases (
  name text primary key,
  until timestamptz not null
);
alter table public.cron_leases enable row level security;

-- ---------------------------------------------------------------------------
-- Optional: timely ticks for free with Supabase pg_cron + pg_net. Runs only where both
-- extensions and Vault exist (nothing happens in PGlite or plain Postgres). The URL and the
-- secret are read from Vault on every run; they are never stored here. Set them once with:
--   select vault.create_secret('https://<app>', 'app_url');
--   select vault.create_secret('<CRON_SECRET>', 'cron_secret');
-- ---------------------------------------------------------------------------
do $guard$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from pg_extension where extname = 'pg_net')
     and to_regclass('vault.decrypted_secrets') is not null then
    begin
      execute $sql$select cron.unschedule(jobid) from cron.job where jobname = 'app-cron-tick'$sql$;
      execute format(
        'select cron.schedule(%L, %L, %L)',
        'app-cron-tick',
        '*/5 * * * *',
        $job$
          select net.http_get(
            url := rtrim(u.decrypted_secret, '/') || '/api/cron/tick',
            headers := jsonb_build_object('Authorization', 'Bearer ' || c.decrypted_secret),
            timeout_milliseconds := 30000
          )
          from (select decrypted_secret from vault.decrypted_secrets where name = 'app_url' limit 1) u,
               (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1) c
          where coalesce(u.decrypted_secret, '') <> '' and coalesce(c.decrypted_secret, '') <> ''
        $job$
      );
    exception when others then
      raise notice 'pg_cron schedule skipped: %', sqlerrm;
    end;
  end if;
end
$guard$;
