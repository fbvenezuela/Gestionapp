-- Base: roles, profiles, settings, categories, audit and the helpers every policy uses.
-- Conventions:
--   * RLS on every table. No table is readable by `anon` unless a policy says so.
--   * Nothing is hard-deleted by the app: rows carry `deleted_at` and only admins may set it.
--   * Every change on business tables is written to `audit_log` by trigger.

create type public.app_role as enum (
  'admin',              -- Juan, Hillary: everything
  'boss',               -- the governor ("el jefe")
  'dispatch',           -- director de despacho: creates events, fills the brief
  'secretary',          -- secretarías: propose events, see only their own
  'social',             -- equipo de redes: events WITHOUT date/time, content, tweets, publishing
  'supervisor',         -- supervisión política: approves before publishing
  'camera',             -- quien graba: assigned events and uploads material
  'writer',             -- redactor de trazabilidad (phase 3): create/edit, never delete
  'reports_operator',   -- phase 3
  'complaints_operator',-- phase 3
  'aid_operator'        -- phase 3
);

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text not null default '',
  phone text,
  notify_prefs jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  sessions_revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.user_roles (
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text not null default '',
  roles public.app_role[] not null,
  invited_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  revoked_at timestamptz
);
create index invitations_email_idx on public.invitations (lower(email));

-- ---------------------------------------------------------------------------
-- Helpers used by policies. SECURITY DEFINER so they can read user_roles
-- without recursing into user_roles' own policies.
-- ---------------------------------------------------------------------------
create or replace function public.has_role(r public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = auth.uid() and ur.role = r and p.active and p.deleted_at is null
  )
$$;

create or replace function public.has_any_role(rs public.app_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = auth.uid() and ur.role = any (rs) and p.active and p.deleted_at is null
  )
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = auth.uid() and p.active and p.deleted_at is null
  )
$$;

-- ---------------------------------------------------------------------------
-- Settings (brand, schedules, limits). Values are JSON; keys are documented
-- in docs/ARQUITECTURA.md.
-- ---------------------------------------------------------------------------
create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);

-- Two-factor: roles listed in setting `security.mfa_roles` must carry aal2.
create or replace function public.mfa_ok()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    or not exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.role::text in (
          select jsonb_array_elements_text(coalesce(
            (select value from public.app_settings where key = 'security.mfa_roles'), '[]'::jsonb))
        )
    )
$$;

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.categories (id),
  kind text not null check (kind in ('content', 'traceability', 'event', 'youtube_pillar')),
  name text not null,
  emoji text,
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index categories_parent_idx on public.categories (parent_id);
create unique index categories_unique_name on public.categories (kind, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), name);

-- ---------------------------------------------------------------------------
-- Audit: append-only. Written by trigger, readable by admins only.
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  table_name text not null,
  row_id text,
  action text not null,
  old_data jsonb,
  new_data jsonb
);
create index audit_log_at_idx on public.audit_log (at desc);
create index audit_log_row_idx on public.audit_log (table_name, row_id);

create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  rid text;
begin
  if tg_op = 'DELETE' then
    rid := coalesce(to_jsonb(old) ->> 'id', to_jsonb(old) ->> 'event_id', to_jsonb(old) ->> 'key');
    insert into public.audit_log (actor_id, table_name, row_id, action, old_data)
    values (auth.uid(), tg_table_name, rid, 'delete', to_jsonb(old));
    return old;
  end if;
  rid := coalesce(to_jsonb(new) ->> 'id', to_jsonb(new) ->> 'event_id', to_jsonb(new) ->> 'key', to_jsonb(new) ->> 'user_id');
  if tg_op = 'INSERT' then
    insert into public.audit_log (actor_id, table_name, row_id, action, new_data)
    values (auth.uid(), tg_table_name, rid, 'insert', to_jsonb(new));
  else
    if to_jsonb(new) = to_jsonb(old) then return new; end if;
    insert into public.audit_log (actor_id, table_name, row_id, action, old_data, new_data)
    values (auth.uid(), tg_table_name, rid,
      case when (to_jsonb(old) ->> 'deleted_at') is null and (to_jsonb(new) ->> 'deleted_at') is not null
        then 'soft_delete' else 'update' end,
      to_jsonb(old), to_jsonb(new));
  end if;
  return new;
end $$;

-- Prevent tampering with the audit trail, even by the table owner through the API roles.
create or replace function public.audit_log_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'audit_log is append-only';
end $$;
create trigger audit_log_no_update before update or delete on public.audit_log
  for each row execute function public.audit_log_immutable();

-- Soft delete is admin-only; restoring too.
create or replace function public.guard_soft_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (to_jsonb(new) ->> 'deleted_at') is distinct from (to_jsonb(old) ->> 'deleted_at')
     and auth.uid() is not null and not public.has_role('admin') then
    raise exception 'Solo un administrador puede borrar o restaurar.' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Helper to wire the standard triggers on a table.
create or replace function public.wire_standard_triggers(t regclass, has_soft_delete boolean, has_updated_at boolean)
returns void language plpgsql as $$
begin
  execute format('create trigger %I after insert or update or delete on %s for each row execute function public.audit_row()',
    'audit_' || replace(t::text, 'public.', ''), t);
  if has_soft_delete then
    execute format('create trigger %I before update on %s for each row execute function public.guard_soft_delete()',
      'soft_delete_' || replace(t::text, 'public.', ''), t);
  end if;
  if has_updated_at then
    execute format('create trigger %I before update on %s for each row execute function public.touch_updated_at()',
      'touch_' || replace(t::text, 'public.', ''), t);
  end if;
end $$;

select public.wire_standard_triggers('public.profiles', true, true);
select public.wire_standard_triggers('public.user_roles', false, false);
select public.wire_standard_triggers('public.invitations', false, false);
select public.wire_standard_triggers('public.app_settings', false, false);
select public.wire_standard_triggers('public.categories', true, true);

-- Users may edit their own name, phone and notification preferences — nothing else.
create or replace function public.guard_profile_self_edit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.has_role('admin') then return new; end if;
  if new.id <> auth.uid() then raise exception 'No autorizado' using errcode = '42501'; end if;
  if new.email is distinct from old.email or new.active is distinct from old.active
     or new.sessions_revoked_at is distinct from old.sessions_revoked_at then
    raise exception 'Solo un administrador puede cambiar eso.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger guard_profile_self_edit before update on public.profiles
  for each row execute function public.guard_profile_self_edit();

-- New auth user -> profile + roles from a pending invitation. No invitation, no roles.
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  inv public.invitations;
begin
  select * into inv from public.invitations
   where lower(email) = lower(new.email) and accepted_at is null and revoked_at is null and expires_at > now()
   order by created_at desc limit 1;

  insert into public.profiles (id, email, full_name)
  values (new.id, lower(new.email), coalesce(inv.full_name, new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;

  if inv.id is not null then
    insert into public.user_roles (user_id, role, granted_by)
    select new.id, r, inv.invited_by from unnest(inv.roles) r
    on conflict do nothing;
    update public.invitations set accepted_at = now() where id = inv.id;
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- Grants + RLS
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.invitations enable row level security;
alter table public.app_settings enable row level security;
alter table public.categories enable row level security;
alter table public.audit_log enable row level security;

grant select, insert, update on public.profiles, public.invitations, public.app_settings, public.categories to authenticated;
grant select, insert, delete on public.user_roles to authenticated;
grant select on public.audit_log to authenticated;
revoke delete on public.profiles, public.invitations, public.app_settings, public.categories from authenticated;

create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_staff());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.has_role('admin'))
  with check (id = auth.uid() or public.has_role('admin'));

create policy user_roles_select on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_role('admin'));
create policy user_roles_insert on public.user_roles for insert to authenticated
  with check (public.has_role('admin') and public.mfa_ok());
create policy user_roles_delete on public.user_roles for delete to authenticated
  using (public.has_role('admin') and public.mfa_ok());

create policy invitations_admin on public.invitations for all to authenticated
  using (public.has_role('admin') and public.mfa_ok())
  with check (public.has_role('admin') and public.mfa_ok());

create policy settings_select on public.app_settings for select to authenticated
  using (public.is_staff());
create policy settings_write on public.app_settings for insert to authenticated
  with check (public.has_role('admin'));
create policy settings_update on public.app_settings for update to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

create policy categories_select on public.categories for select to authenticated
  using (public.is_staff());
create policy categories_insert on public.categories for insert to authenticated
  with check (public.has_role('admin'));
create policy categories_update on public.categories for update to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

create policy audit_select on public.audit_log for select to authenticated
  using (public.has_role('admin') and public.mfa_ok());

grant execute on function public.has_role(public.app_role), public.has_any_role(public.app_role[]),
  public.is_staff(), public.mfa_ok() to authenticated;
