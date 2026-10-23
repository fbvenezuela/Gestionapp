-- Weekly tweets, publications, metrics and per-network rules.
-- Nothing is scheduled or marked published without approval (enforced by trigger).

create table public.tweet_batches (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  source_name text not null default '',
  week_start date,
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.tweets (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.tweet_batches (id) on delete cascade,
  position int not null default 0,
  body text not null check (char_length(body) between 1 and 4000),
  weighted_length int not null default 0,
  category_id uuid references public.categories (id),
  image_asset_id uuid references public.media_assets (id),
  scheduled_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'approved', 'scheduled', 'published', 'failed', 'skipped')),
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  published_at timestamptz,
  published_url text,
  external_id text,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index tweets_batch_idx on public.tweets (batch_id, position);
create index tweets_scheduled_idx on public.tweets (scheduled_at) where deleted_at is null;

create table public.network_specs (
  network text primary key check (network in ('instagram', 'facebook', 'tiktok', 'threads', 'x', 'youtube')),
  label text not null,
  -- { "reel": { "min_duration_s":3, "max_duration_s":900, "aspects":["9:16"], ... }, ... }
  formats jsonb not null default '{}'::jsonb,
  copy_max_chars int not null default 2200,
  length_group text not null default 'long' check (length_group in ('long', 'medium', 'short')),
  notes text not null default '',
  source_url text not null default '',
  verified_on date,
  updated_at timestamptz not null default now()
);

create table public.publications (
  id uuid primary key default gen_random_uuid(),
  piece_id uuid not null references public.pieces (id),
  network text not null references public.network_specs (network),
  format text not null default 'post',
  copy_body text not null default '',
  cover_asset_id uuid references public.media_assets (id),
  collaborators text[] not null default '{}',
  scheduled_at timestamptz,
  published_at timestamptz,
  url text,
  evidence_asset_id uuid references public.media_assets (id),
  republish_of uuid references public.publications (id),
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'published', 'failed')),
  mode text not null default 'manual' check (mode in ('manual', 'simulated', 'api')),
  validation jsonb,
  failure_reason text,
  external_id text,
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index publications_piece_idx on public.publications (piece_id);
create index publications_when_idx on public.publications (coalesce(published_at, scheduled_at)) where deleted_at is null;

create table public.publication_metrics (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references public.publications (id) on delete cascade,
  captured_at timestamptz not null default now(),
  views int check (views >= 0),
  reach int check (reach >= 0),
  likes int check (likes >= 0),
  comments int check (comments >= 0),
  shares int check (shares >= 0),
  saves int check (saves >= 0),
  source text not null default 'manual' check (source in ('manual', 'csv', 'api')),
  created_by uuid references public.profiles (id) default auth.uid()
);
create index publication_metrics_pub_idx on public.publication_metrics (publication_id, captured_at desc);

select public.wire_standard_triggers('public.tweet_batches', true, true);
select public.wire_standard_triggers('public.tweets', true, true);
select public.wire_standard_triggers('public.network_specs', false, true);
select public.wire_standard_triggers('public.publications', true, true);
select public.wire_standard_triggers('public.publication_metrics', false, false);

-- Tweets: only supervision approves; nothing goes past 'approved' without approval;
-- editing an approved tweet's text sends it back to draft.
create or replace function public.guard_tweet()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' or new.approved_by is not null or new.approved_at is not null then
      raise exception 'Un tweet nuevo empieza como borrador.' using errcode = '42501';
    end if;
    return new;
  end if;
  if (new.approved_by is distinct from old.approved_by or new.approved_at is distinct from old.approved_at
      or (new.status = 'approved' and old.status = 'draft'))
     and not (public.has_role('supervisor') and public.mfa_ok()) then
    raise exception 'Solo supervisión aprueba tweets.' using errcode = '42501';
  end if;
  if new.body is distinct from old.body and old.approved_at is not null then
    new.status := 'draft';
    new.approved_by := null;
    new.approved_at := null;
  end if;
  if new.status in ('approved', 'scheduled', 'published') and new.approved_at is null then
    raise exception 'El tweet no está aprobado.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger guard_tweet before insert or update on public.tweets
  for each row execute function public.guard_tweet();

-- Publications: scheduled/published only for an approved piece. In API mode the
-- publishing switch must be on (setting `publishing.enabled`).
create or replace function public.guard_publication()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  st text;
begin
  if new.status in ('scheduled', 'published') then
    select status into st from public.pieces where id = new.piece_id;
    if st is distinct from 'approved' then
      raise exception 'La pieza no está aprobada por supervisión.' using errcode = '42501';
    end if;
  end if;
  if new.mode = 'api' and new.status = 'scheduled' and coalesce(
       (select value #>> '{}' from public.app_settings where key = 'publishing.enabled'), 'false') <> 'true' then
    raise exception 'La publicación automática está apagada.' using errcode = '42501';
  end if;
  if new.status = 'published' and (new.url is null or btrim(new.url) = '') and new.mode = 'manual' then
    raise exception 'Falta el link de la publicación.';
  end if;
  return new;
end $$;
create trigger guard_publication before insert or update on public.publications
  for each row execute function public.guard_publication();

alter table public.tweet_batches enable row level security;
alter table public.tweets enable row level security;
alter table public.network_specs enable row level security;
alter table public.publications enable row level security;
alter table public.publication_metrics enable row level security;

grant select, insert, update on public.tweet_batches, public.tweets, public.network_specs,
  public.publications, public.publication_metrics to authenticated;

create policy batches_select on public.tweet_batches for select to authenticated
  using (public.is_content_team() and (deleted_at is null or public.has_role('admin')));
create policy batches_insert on public.tweet_batches for insert to authenticated
  with check (public.has_any_role(array['admin', 'social']::public.app_role[]));
create policy batches_update on public.tweet_batches for update to authenticated
  using (public.has_any_role(array['admin', 'social']::public.app_role[]))
  with check (public.has_any_role(array['admin', 'social']::public.app_role[]));

create policy tweets_select on public.tweets for select to authenticated
  using (public.is_content_team() and (deleted_at is null or public.has_role('admin')));
create policy tweets_insert on public.tweets for insert to authenticated
  with check (public.has_any_role(array['admin', 'social']::public.app_role[]));
create policy tweets_update on public.tweets for update to authenticated
  using (public.has_any_role(array['admin', 'social', 'supervisor']::public.app_role[]))
  with check (public.has_any_role(array['admin', 'social', 'supervisor']::public.app_role[]));

create policy specs_select on public.network_specs for select to authenticated using (public.is_staff());
create policy specs_insert on public.network_specs for insert to authenticated with check (public.has_role('admin'));
create policy specs_update on public.network_specs for update to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

create policy pubs_select on public.publications for select to authenticated
  using (public.is_content_team() and (deleted_at is null or public.has_role('admin')));
create policy pubs_insert on public.publications for insert to authenticated
  with check (public.has_any_role(array['admin', 'social']::public.app_role[]));
create policy pubs_update on public.publications for update to authenticated
  using (public.has_any_role(array['admin', 'social']::public.app_role[]))
  with check (public.has_any_role(array['admin', 'social']::public.app_role[]));

create policy metrics_select on public.publication_metrics for select to authenticated using (public.is_content_team());
create policy metrics_insert on public.publication_metrics for insert to authenticated
  with check (public.has_any_role(array['admin', 'social']::public.app_role[]));
