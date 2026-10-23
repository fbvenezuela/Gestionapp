-- Material, pieces, copies and the review/approval flow.
-- Approval is enforced here, not in the UI: only `supervisor` can move a piece to
-- 'approved' or 'changes_requested', and a new version sends it back to review.

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events (id),
  kind text not null check (kind in ('boss', 'drone', 'broll', 'other', 'final', 'cover', 'editable', 'voice_line', 'evidence', 'tweet_image')),
  bucket text not null default 'material',
  -- Storage paths never contain dates or original file names: <event_id|kind>/<uuid>.<ext>
  storage_path text not null unique,
  label text not null default '',
  mime text not null default '',
  size_bytes bigint not null default 0,
  duration_s numeric,
  width int,
  height int,
  fps numeric,
  video_codec text,
  audio_codec text,
  status text not null default 'uploading' check (status in ('uploading', 'ready', 'failed')),
  uploaded_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index media_assets_event_idx on public.media_assets (event_id, kind) where deleted_at is null;

create table public.pieces (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events (id),
  kind text not null check (kind in ('video', 'short', 'cover', 'carousel', 'photo')),
  title text not null check (char_length(title) between 3 and 140),
  category_id uuid references public.categories (id),
  status text not null default 'draft' check (status in ('draft', 'in_review', 'changes_requested', 'approved', 'archived')),
  current_version int not null default 0,
  approved_version int,
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index pieces_status_idx on public.pieces (status) where deleted_at is null;
create index pieces_event_idx on public.pieces (event_id);

create table public.piece_versions (
  id uuid primary key default gen_random_uuid(),
  piece_id uuid not null references public.pieces (id) on delete cascade,
  version int not null,
  media_asset_id uuid references public.media_assets (id),
  cover_asset_id uuid references public.media_assets (id),
  notes text not null default '',
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  unique (piece_id, version)
);

create table public.copy_formulas (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text not null default '',
  -- [{ "key": "feature", "label": "Característica", "hint": "..." }, ...]
  steps jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.copies (
  id uuid primary key default gen_random_uuid(),
  piece_id uuid not null references public.pieces (id) on delete cascade,
  formula_id uuid references public.copy_formulas (id),
  length_group text not null check (length_group in ('long', 'medium', 'short')),
  body text not null default '',
  char_count int not null default 0,
  generated_by text not null default 'manual' check (generated_by in ('template', 'ai', 'manual')),
  updated_by uuid references public.profiles (id) default auth.uid(),
  updated_at timestamptz not null default now(),
  unique (piece_id, length_group)
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  piece_id uuid not null references public.pieces (id) on delete cascade,
  version int not null,
  reviewer_id uuid not null references public.profiles (id) default auth.uid(),
  decision text not null check (decision in ('approved', 'changes_requested')),
  comment text not null default '',
  created_at timestamptz not null default now()
);
create index reviews_piece_idx on public.reviews (piece_id, created_at desc);

create table public.review_comments (
  id uuid primary key default gen_random_uuid(),
  piece_id uuid not null references public.pieces (id) on delete cascade,
  version int not null,
  author_id uuid not null references public.profiles (id) default auth.uid(),
  at_second numeric check (at_second >= 0),
  body text not null check (char_length(body) between 1 and 2000),
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.voice_line_requests (
  id uuid primary key default gen_random_uuid(),
  piece_id uuid not null references public.pieces (id) on delete cascade,
  at_second numeric check (at_second >= 0),
  phrase text not null check (char_length(phrase) between 1 and 1000),
  status text not null default 'requested' check (status in ('requested', 'received', 'cancelled')),
  audio_asset_id uuid references public.media_assets (id),
  requested_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

select public.wire_standard_triggers('public.media_assets', true, true);
select public.wire_standard_triggers('public.pieces', true, true);
select public.wire_standard_triggers('public.piece_versions', false, false);
select public.wire_standard_triggers('public.copy_formulas', true, true);
select public.wire_standard_triggers('public.copies', false, true);
select public.wire_standard_triggers('public.reviews', false, false);
select public.wire_standard_triggers('public.review_comments', false, false);
select public.wire_standard_triggers('public.voice_line_requests', false, true);

-- ---------------------------------------------------------------------------
-- Approval guard
-- ---------------------------------------------------------------------------
create or replace function public.guard_piece_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('app.trusted_update', true) = 'on' then return new; end if;
  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'in_review') or new.approved_by is not null or new.approved_at is not null then
      raise exception 'Una pieza nueva empieza como borrador.' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.status is distinct from old.status and new.status in ('approved', 'changes_requested') then
    raise exception 'Solo supervisión aprueba o pide cambios (usa review_piece).' using errcode = '42501';
  end if;
  if new.approved_by is distinct from old.approved_by or new.approved_at is distinct from old.approved_at
     or new.approved_version is distinct from old.approved_version then
    raise exception 'La aprobación no se edita a mano.' using errcode = '42501';
  end if;
  -- New version: back to review, approval no longer valid for the new file.
  if new.current_version > old.current_version and old.status in ('approved', 'changes_requested') then
    new.status := 'in_review';
  end if;
  return new;
end $$;
create trigger guard_piece_status before insert or update on public.pieces
  for each row execute function public.guard_piece_status();

-- The one way to approve or request changes. Supervisor only (and with 2FA when required).
create or replace function public.review_piece(p uuid, decision text, comment text default '')
returns void language plpgsql security definer set search_path = public as $$
declare
  pc public.pieces;
begin
  if not (public.has_role('supervisor') and public.mfa_ok()) then
    raise exception 'Solo supervisión puede aprobar.' using errcode = '42501';
  end if;
  if decision not in ('approved', 'changes_requested') then raise exception 'Decisión inválida'; end if;
  if decision = 'changes_requested' and coalesce(btrim(comment), '') = '' then
    raise exception 'Escribe qué hay que cambiar.';
  end if;
  select * into pc from public.pieces where id = p and deleted_at is null for update;
  if pc.id is null then raise exception 'Pieza no encontrada'; end if;
  if pc.current_version < 1 then raise exception 'La pieza no tiene archivo todavía.'; end if;
  insert into public.reviews (piece_id, version, reviewer_id, decision, comment)
  values (p, pc.current_version, auth.uid(), decision, coalesce(comment, ''));
  perform set_config('app.trusted_update', 'on', true);
  update public.pieces set
    status = decision,
    approved_version = case when decision = 'approved' then pc.current_version else null end,
    approved_by = case when decision = 'approved' then auth.uid() else null end,
    approved_at = case when decision = 'approved' then now() else null end
  where id = p;
  perform set_config('app.trusted_update', 'off', true);
end $$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.media_assets enable row level security;
alter table public.pieces enable row level security;
alter table public.piece_versions enable row level security;
alter table public.copy_formulas enable row level security;
alter table public.copies enable row level security;
alter table public.reviews enable row level security;
alter table public.review_comments enable row level security;
alter table public.voice_line_requests enable row level security;

grant select, insert, update on public.media_assets, public.pieces, public.piece_versions, public.copy_formulas,
  public.copies, public.review_comments, public.voice_line_requests to authenticated;
grant select on public.reviews to authenticated;

create or replace function public.is_content_team()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_any_role(array['admin', 'social', 'supervisor', 'boss']::public.app_role[])
$$;
grant execute on function public.is_content_team(), public.review_piece(uuid, text, text) to authenticated;

-- Material: visible with its event; camera only for assigned events. Pieces-only assets
-- (no event) are for the content team.
create policy media_select on public.media_assets for select to authenticated
  using (deleted_at is null and (
    (event_id is not null and public.can_see_event(event_id) and public.has_any_role(array['admin', 'boss', 'social', 'supervisor', 'camera', 'dispatch']::public.app_role[]))
    or (event_id is null and public.is_content_team())
  ) or (deleted_at is not null and public.has_role('admin')));
create policy media_insert on public.media_assets for insert to authenticated
  with check (uploaded_by = auth.uid() and (
    public.has_any_role(array['admin', 'social']::public.app_role[])
    or (public.has_role('camera') and event_id is not null and public.is_assigned(event_id) and kind in ('boss', 'drone', 'broll', 'other'))
    or (public.has_role('boss') and kind = 'voice_line')
  ));
create policy media_update on public.media_assets for update to authenticated
  using (uploaded_by = auth.uid() or public.has_any_role(array['admin', 'social']::public.app_role[]))
  with check (uploaded_by = auth.uid() or public.has_any_role(array['admin', 'social']::public.app_role[]));

create policy pieces_select on public.pieces for select to authenticated
  using (public.is_content_team() and (deleted_at is null or public.has_role('admin')));
create policy pieces_insert on public.pieces for insert to authenticated
  with check (public.has_any_role(array['admin', 'social']::public.app_role[]));
create policy pieces_update on public.pieces for update to authenticated
  using (public.has_any_role(array['admin', 'social']::public.app_role[]))
  with check (public.has_any_role(array['admin', 'social']::public.app_role[]));

create policy versions_select on public.piece_versions for select to authenticated using (public.is_content_team());
create policy versions_insert on public.piece_versions for insert to authenticated
  with check (public.has_any_role(array['admin', 'social']::public.app_role[]));

create policy formulas_select on public.copy_formulas for select to authenticated using (public.is_staff());
create policy formulas_insert on public.copy_formulas for insert to authenticated with check (public.has_role('admin'));
create policy formulas_update on public.copy_formulas for update to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

create policy copies_select on public.copies for select to authenticated using (public.is_content_team());
create policy copies_insert on public.copies for insert to authenticated
  with check (public.has_any_role(array['admin', 'social']::public.app_role[]));
create policy copies_update on public.copies for update to authenticated
  using (public.has_any_role(array['admin', 'social']::public.app_role[]))
  with check (public.has_any_role(array['admin', 'social']::public.app_role[]));

create policy reviews_select on public.reviews for select to authenticated using (public.is_content_team());

create policy rc_select on public.review_comments for select to authenticated using (public.is_content_team());
create policy rc_insert on public.review_comments for insert to authenticated
  with check (author_id = auth.uid() and public.has_any_role(array['admin', 'social', 'supervisor']::public.app_role[]));
create policy rc_update on public.review_comments for update to authenticated
  using (public.has_any_role(array['admin', 'social', 'supervisor']::public.app_role[]))
  with check (public.has_any_role(array['admin', 'social', 'supervisor']::public.app_role[]));

create policy vlr_select on public.voice_line_requests for select to authenticated using (public.is_content_team());
create policy vlr_insert on public.voice_line_requests for insert to authenticated
  with check (public.has_any_role(array['admin', 'social', 'supervisor']::public.app_role[]));
create policy vlr_update on public.voice_line_requests for update to authenticated
  using (public.has_any_role(array['admin', 'social', 'boss']::public.app_role[]))
  with check (public.has_any_role(array['admin', 'social', 'boss']::public.app_role[]));
