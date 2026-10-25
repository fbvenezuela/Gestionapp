-- Google Drive storage (STORAGE_PROVIDER=drive, docs/DRIVE.md). While the variable is empty these
-- tables stay empty and nothing else changes.
--
-- A Drive file is an ordinary media_assets row with bucket = 'drive': same RLS, same uuid
-- storage_path (no date, no original name), same guard trigger. media_assets itself does not
-- change. What only Drive needs (the file id, the upload session, a thumbnail copy) lives in side
-- tables that NO API role can read: RLS on, no policies, privileges revoked. The server reads
-- them with the system connection, and only after the person's own query (RLS) has returned the
-- media row. So no Drive id, token or upload URL reaches the browser, the API or Realtime.

-- ---------------------------------------------------------------------------
-- The one Google account the platform stores files in. token_enc is the refresh token sealed by
-- the server (AES-256-GCM, key outside the database: DRIVE_TOKEN_KEY or derived from
-- SESSION_SECRET). account_email stays after a disconnect, so reconnecting with another account is
-- refused instead of quietly breaking every file.
-- ---------------------------------------------------------------------------
create table public.drive_connection (
  id boolean primary key default true check (id),
  account_email text check (account_email is null or length(account_email) between 3 and 320),
  token_enc text check (token_enc is null or length(token_enc) <= 4000),
  scope text not null default '' check (length(scope) <= 1000),
  root_folder_id text check (root_folder_id ~ '^[A-Za-z0-9_-]{10,200}$'),
  status text not null default 'disconnected' check (status in ('ok', 'expired', 'error', 'disconnected')),
  status_at timestamptz not null default now(),
  -- A short code (invalid_grant, bad_key, ...), never a token or a Google body.
  last_error text check (last_error ~ '^[a-z_]{1,40}$'),
  connected_by uuid references public.profiles (id),
  connected_at timestamptz,
  constraint drive_connection_ok_has_token check (status <> 'ok' or token_enc is not null)
);

-- Folder cache: 'Videos/E-0042' -> Drive folder id. Paths are fixed words plus event codes.
create table public.drive_folders (
  path text primary key check (path ~ '^[A-Za-z]{3,12}(/[A-Za-z0-9-]{1,20})?$'),
  folder_id text not null unique check (folder_id ~ '^[A-Za-z0-9_-]{10,200}$'),
  created_at timestamptz not null default now()
);

-- media_assets row -> Drive file. upload_url_enc = the resumable upload session while the file
-- is uploading (a bearer URL for that one file), sealed, cleared when the upload ends.
create table public.media_drive (
  media_id uuid primary key references public.media_assets (id) on delete cascade,
  file_id text not null unique check (file_id ~ '^[A-Za-z0-9_-]{10,200}$'),
  source text not null check (source in ('upload', 'picker', 'import')),
  -- A photo picked from Drive is registered as a cleaned copy (no EXIF/GPS) in the platform's
  -- folder; this is the original it came from, so it cannot be picked twice.
  origin_file_id text unique check (origin_file_id ~ '^[A-Za-z0-9_-]{10,200}$'),
  upload_url_enc text check (upload_url_enc is null or length(upload_url_enc) <= 4000),
  created_at timestamptz not null default now()
);

-- Small thumbnails copied from Drive (Drive's thumbnailLink lasts hours and needs credentials).
create table public.media_thumbs (
  media_id uuid primary key references public.media_assets (id) on delete cascade,
  mime text not null check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  bytes bytea not null check (octet_length(bytes) between 1 and 262144),
  fetched_at timestamptz not null default now()
);

-- Bytes of Drive files the platform served or relayed this month (playback, downloads, proxied
-- upload chunks). Vercel Hobby pauses the whole project past its monthly transfer; the server
-- refuses new Drive transfers at DRIVE_TRANSFER_CAP_GB.
create table public.drive_transfer (
  month text primary key check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  bytes bigint not null default 0 check (bytes >= 0),
  updated_at timestamptz not null default now()
);

-- The same count per person and day (Caracas). Bytes are reserved here BEFORE each answer and the
-- unsent part is given back after, so answers running at the same time cannot pass the cap, and
-- one account cannot spend the whole month's cap: past a daily share (Administración aside) the
-- server refuses that person until the next day. Rows older than a week are deleted by the cron.
create table public.drive_transfer_person (
  day date not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  bytes bigint not null default 0 check (bytes >= 0),
  updated_at timestamptz not null default now(),
  primary key (day, user_id)
);

alter table public.drive_connection enable row level security;
alter table public.drive_folders enable row level security;
alter table public.media_drive enable row level security;
alter table public.media_thumbs enable row level security;
alter table public.drive_transfer enable row level security;
alter table public.drive_transfer_person enable row level security;
-- Supabase grants new public tables to the API roles by default: take that back explicitly.
revoke all on public.drive_connection, public.drive_folders, public.media_drive, public.media_thumbs, public.drive_transfer,
  public.drive_transfer_person from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- What Ajustes shows (never the token or a Drive id): admin with 2FA only; everyone else gets no
-- row. month_bytes = this month's Drive transfer, for the meter.
-- ---------------------------------------------------------------------------
create or replace function public.drive_status()
returns table (status text, account_email text, connected_at timestamptz, status_at timestamptz,
               last_error text, root_ready boolean, month_bytes bigint)
language sql stable security definer set search_path = public as $$
  select c.status, c.account_email, c.connected_at, c.status_at, c.last_error, c.root_folder_id is not null,
         coalesce((select t.bytes from public.drive_transfer t where t.month = to_char(now() at time zone 'utc', 'YYYY-MM')), 0)
    from public.drive_connection c
   where public.has_role('admin') and public.mfa_ok()
$$;
revoke all on function public.drive_status() from public, anon;
grant execute on function public.drive_status() to authenticated;

-- ---------------------------------------------------------------------------
-- Audit without the token: connect, reconnect, status changes and disconnect are logged with the
-- account, status and error code only (audit_row() would copy token_enc into audit_log).
-- ---------------------------------------------------------------------------
create or replace function public.audit_drive_connection()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  o jsonb := case when tg_op = 'INSERT' then null
                  else jsonb_build_object('account_email', old.account_email, 'status', old.status, 'last_error', old.last_error) end;
  n jsonb := case when tg_op = 'DELETE' then null
                  else jsonb_build_object('account_email', new.account_email, 'status', new.status, 'last_error', new.last_error,
                                          'connected', new.token_enc is not null) end;
begin
  if tg_op = 'UPDATE' and o = n - 'connected' and (old.token_enc is null) = (new.token_enc is null)
     and old.connected_at is not distinct from new.connected_at then
    return new;
  end if;
  insert into public.audit_log (actor_id, table_name, row_id, action, old_data, new_data)
  values (coalesce(auth.uid(), case when tg_op = 'DELETE' then null else new.connected_by end), 'drive_connection', 'drive',
          lower(tg_op), o, n);
  return case when tg_op = 'DELETE' then old else new end;
end $$;
revoke all on function public.audit_drive_connection() from public, anon, authenticated;
create trigger audit_drive_connection after insert or update or delete on public.drive_connection
  for each row execute function public.audit_drive_connection();
