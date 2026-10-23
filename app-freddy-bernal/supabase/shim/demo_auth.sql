-- Demo-only sign-in bookkeeping (codes and TOTP secrets). In a real project
-- Supabase Auth does this. No API role can read these tables.
create schema if not exists demo_auth;
revoke all on schema demo_auth from public;

create table if not exists demo_auth.login_codes (
  email text primary key,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0
);

create table if not exists demo_auth.totp_factors (
  user_id uuid primary key references auth.users (id) on delete cascade,
  secret text not null,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);
