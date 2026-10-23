-- Agenda: events, the private schedule, the brief, assignments and storyboards.
--
-- THE DATE/TIME RULE (prompt §4.4, §8.3): the date, time, duration, exact address,
-- directions and site contacts live ONLY in `event_schedule`. That table is readable
-- by admin, boss and dispatch, and by camera for the events assigned to them.
-- Everyone else (social, supervisor, secretary) sees `events`, which has no date.
-- When an event is marked done, `events.done_on` (the day only) becomes visible so
-- the material lands in the day-by-day registry.

create sequence public.event_code_seq;

create table public.events (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('E-' || lpad(nextval('public.event_code_seq')::text, 4, '0')),
  title text not null check (char_length(title) between 3 and 140),
  place_name text not null default '',
  municipality text not null default '',
  summary text not null default '',
  category_id uuid references public.categories (id),
  priority smallint check (priority between 1 and 10),
  boss_decision text not null default 'pending' check (boss_decision in ('pending', 'accepted', 'rejected')),
  work_status text not null default 'brief' check (work_status in ('brief', 'storyboard', 'recording', 'material', 'editing', 'published')),
  urgency smallint not null default 2 check (urgency between 1 and 3),
  done_on date,
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index events_status_idx on public.events (work_status, urgency) where deleted_at is null;
create index events_done_on_idx on public.events (done_on) where deleted_at is null;

create table public.event_schedule (
  event_id uuid primary key references public.events (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  exact_address text not null default '',
  directions text not null default '',
  site_contacts text not null default '',
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index event_schedule_starts_idx on public.event_schedule (starts_at);

create table public.event_brief (
  event_id uuid primary key references public.events (id) on delete cascade,
  work_description text not null default '',
  led_by text not null default '',
  in_charge text not null default '',
  achievements text not null default '',
  key_facts text not null default '',
  protocol text not null default '',
  notes text not null default '',
  updated_by uuid references public.profiles (id) default auth.uid(),
  updated_at timestamptz not null default now()
);

create table public.event_assignments (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  duty text not null default 'camera' check (duty in ('camera', 'social_lead')),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id, duty)
);
create index event_assignments_user_idx on public.event_assignments (user_id);

create table public.storyboards (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.events (id) on delete cascade,
  speech text not null default '',
  updated_by uuid references public.profiles (id) default auth.uid(),
  updated_at timestamptz not null default now()
);

create table public.storyboard_blocks (
  id uuid primary key default gen_random_uuid(),
  storyboard_id uuid not null references public.storyboards (id) on delete cascade,
  position int not null default 0,
  shot text not null default '',
  angle text not null default '',
  boss_line text not null default '',
  broll text not null default '',
  fact text not null default '',
  fact_source text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index storyboard_blocks_sb_idx on public.storyboard_blocks (storyboard_id, position);

select public.wire_standard_triggers('public.events', true, true);
select public.wire_standard_triggers('public.event_schedule', false, true);
select public.wire_standard_triggers('public.event_brief', false, true);
select public.wire_standard_triggers('public.event_assignments', false, false);
select public.wire_standard_triggers('public.storyboards', false, true);
-- Blocks are working notes: the storyboard team may remove them (still audited).
select public.wire_standard_triggers('public.storyboard_blocks', false, true);

-- ---------------------------------------------------------------------------
-- Visibility helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_assigned(e uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.event_assignments a where a.event_id = e and a.user_id = auth.uid())
$$;

-- Who may see an event row at all (no date involved).
create or replace function public.can_see_event(e uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_any_role(array['admin', 'boss', 'dispatch', 'social', 'supervisor']::public.app_role[])
    or (public.has_role('camera') and public.is_assigned(e))
    or (public.has_role('secretary') and exists (select 1 from public.events ev where ev.id = e and ev.created_by = auth.uid()))
$$;

-- Who may see date, time and exact place.
create or replace function public.can_see_schedule(e uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.mfa_ok() and (
    public.has_any_role(array['admin', 'boss', 'dispatch']::public.app_role[])
    or (public.has_role('camera') and public.is_assigned(e))
  )
$$;

create or replace function public.can_edit_event(e uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_any_role(array['admin', 'dispatch']::public.app_role[])
$$;

-- Column guard on events: each role may only touch its own fields.
create or replace function public.guard_event_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  changed text[];
  allowed text[];
begin
  if auth.uid() is null or public.has_any_role(array['admin', 'dispatch']::public.app_role[])
     or current_setting('app.trusted_update', true) = 'on' then
    return new;
  end if;
  select coalesce(array_agg(n.key), '{}') into changed
    from jsonb_each(to_jsonb(new)) n
   where n.value is distinct from (to_jsonb(old) -> n.key) and n.key not in ('updated_at');
  allowed := '{}';
  if public.has_role('boss') then allowed := allowed || array['priority', 'boss_decision']; end if;
  if public.has_role('social') then allowed := allowed || array['work_status', 'urgency']; end if;
  if public.has_role('secretary') and old.created_by = auth.uid() and old.boss_decision = 'pending' then
    allowed := allowed || array['title', 'place_name', 'municipality', 'summary', 'category_id'];
  end if;
  if not changed <@ allowed then
    raise exception 'No puedes cambiar estos datos del evento.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger guard_event_update before update on public.events
  for each row execute function public.guard_event_update();

-- Marking an event done reveals ONLY the day (in the app timezone), via this function.
create or replace function public.mark_event_done(e uuid)
returns date language plpgsql security definer set search_path = public as $$
declare
  d date;
  tz text := coalesce((select value #>> '{}' from public.app_settings where key = 'app.timezone'), 'America/Caracas');
begin
  if not (public.has_any_role(array['admin', 'dispatch', 'boss']::public.app_role[])
          or (public.has_role('camera') and public.is_assigned(e))) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  select (starts_at at time zone tz)::date into d from public.event_schedule where event_id = e;
  if d is null then raise exception 'El evento no tiene fecha.'; end if;
  if d > (now() at time zone tz)::date then raise exception 'El evento todavía no ha pasado.'; end if;
  perform set_config('app.trusted_update', 'on', true);
  update public.events set done_on = d,
    work_status = case when work_status in ('brief', 'storyboard', 'recording') then 'material' else work_status end
   where id = e;
  perform set_config('app.trusted_update', 'off', true);
  return d;
end $$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.events enable row level security;
alter table public.event_schedule enable row level security;
alter table public.event_brief enable row level security;
alter table public.event_assignments enable row level security;
alter table public.storyboards enable row level security;
alter table public.storyboard_blocks enable row level security;

grant select, insert, update on public.events, public.event_schedule, public.event_brief,
  public.storyboards, public.storyboard_blocks to authenticated;
grant select, insert, delete on public.event_assignments to authenticated;
grant usage on sequence public.event_code_seq to authenticated;

-- Inline (not via can_see_event) so INSERT ... RETURNING sees the new row.
create policy events_select on public.events for select to authenticated
  using ((deleted_at is null and (
           public.has_any_role(array['admin', 'boss', 'dispatch', 'social', 'supervisor']::public.app_role[])
           or (public.has_role('camera') and public.is_assigned(id))
           or (public.has_role('secretary') and created_by = auth.uid())))
         or (deleted_at is not null and public.has_role('admin')));
create policy events_insert on public.events for insert to authenticated
  with check (public.has_any_role(array['admin', 'dispatch', 'secretary']::public.app_role[]) and created_by = auth.uid());
create policy events_update on public.events for update to authenticated
  using (public.can_see_event(id) and public.has_any_role(array['admin', 'dispatch', 'boss', 'social', 'secretary']::public.app_role[]))
  with check (true);

create policy schedule_select on public.event_schedule for select to authenticated
  using (public.can_see_schedule(event_id));
create policy schedule_insert on public.event_schedule for insert to authenticated
  with check (public.mfa_ok() and (public.can_edit_event(event_id)
    or (public.has_role('secretary') and exists (select 1 from public.events ev where ev.id = event_id and ev.created_by = auth.uid()))));
create policy schedule_update on public.event_schedule for update to authenticated
  using (public.mfa_ok() and public.can_edit_event(event_id))
  with check (public.mfa_ok() and public.can_edit_event(event_id));

create policy brief_select on public.event_brief for select to authenticated
  using (public.can_see_event(event_id));
create policy brief_insert on public.event_brief for insert to authenticated
  with check (public.can_edit_event(event_id)
    or (public.has_role('secretary') and exists (select 1 from public.events ev where ev.id = event_id and ev.created_by = auth.uid())));
create policy brief_update on public.event_brief for update to authenticated
  using (public.can_edit_event(event_id)) with check (public.can_edit_event(event_id));

create policy assignments_select on public.event_assignments for select to authenticated
  using (user_id = auth.uid() or public.has_any_role(array['admin', 'boss', 'dispatch', 'social', 'supervisor']::public.app_role[]));
create policy assignments_insert on public.event_assignments for insert to authenticated
  with check (public.has_any_role(array['admin', 'dispatch', 'social']::public.app_role[]));
create policy assignments_delete on public.event_assignments for delete to authenticated
  using (public.has_any_role(array['admin', 'dispatch', 'social']::public.app_role[]));

create policy storyboards_select on public.storyboards for select to authenticated
  using (public.can_see_event(event_id));
create policy storyboards_insert on public.storyboards for insert to authenticated
  with check (public.has_any_role(array['admin', 'social']::public.app_role[]) and public.can_see_event(event_id));
create policy storyboards_update on public.storyboards for update to authenticated
  using (public.has_any_role(array['admin', 'social']::public.app_role[]))
  with check (public.has_any_role(array['admin', 'social']::public.app_role[]));

create policy blocks_select on public.storyboard_blocks for select to authenticated
  using (exists (select 1 from public.storyboards s where s.id = storyboard_id and public.can_see_event(s.event_id)));
create policy blocks_insert on public.storyboard_blocks for insert to authenticated
  with check (public.has_any_role(array['admin', 'social']::public.app_role[]));
create policy blocks_update on public.storyboard_blocks for update to authenticated
  using (public.has_any_role(array['admin', 'social']::public.app_role[]))
  with check (public.has_any_role(array['admin', 'social']::public.app_role[]));

-- Calendar view: security_invoker so the caller's RLS applies (social gets zero rows).
create view public.event_calendar with (security_invoker = true) as
  select e.id, e.code, e.title, e.place_name, e.municipality, e.category_id, e.priority, e.boss_decision,
         e.work_status, s.starts_at, s.ends_at, s.exact_address
    from public.events e
    join public.event_schedule s on s.event_id = e.id
   where e.deleted_at is null;
grant select on public.event_calendar to authenticated;

grant execute on function public.is_assigned(uuid), public.can_see_event(uuid), public.can_see_schedule(uuid),
  public.can_edit_event(uuid), public.mark_event_done(uuid) to authenticated;
