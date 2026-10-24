-- Approval traffic light (semáforo), copy options per piece, and the boss's
-- spontaneous posts (D-23).
--   verde:    routine. Supervision approves (it can approve several at once).
--   amarillo: normal. Supervision approves; reminder at 60 min.
--   rojo:     sensitive. Only the boss approves; reminder at 30 min.
-- Deadlines are reminders, never approvals: no answer = not approved.

alter table public.pieces
  add column review_level text not null default 'amarillo' check (review_level in ('verde', 'amarillo', 'rojo')),
  add column sent_to_review_at timestamptz,
  add column review_escalated_at timestamptz,
  add column copy_voice text not null default 'boss' check (copy_voice in ('boss', 'institutional')),
  add column copy_closing jsonb;

update public.pieces set sent_to_review_at = updated_at where status = 'in_review';
create index pieces_review_idx on public.pieces (review_level, sent_to_review_at) where status = 'in_review' and deleted_at is null;

-- ---------------------------------------------------------------------------
-- Approval guard (replaces the one in 20261023000300_content.sql)
-- ---------------------------------------------------------------------------
create or replace function public.guard_piece_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('app.trusted_update', true) = 'on' then return new; end if;
  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'in_review') or new.approved_by is not null or new.approved_at is not null then
      raise exception 'Una pieza nueva empieza como borrador.' using errcode = '42501';
    end if;
    new.sent_to_review_at := case when new.status = 'in_review' then now() end;
    new.review_escalated_at := null;
    return new;
  end if;
  if new.status is distinct from old.status and new.status in ('approved', 'changes_requested') then
    raise exception 'Solo quien aprueba decide (usa review_piece).' using errcode = '42501';
  end if;
  if new.approved_by is distinct from old.approved_by or new.approved_at is distinct from old.approved_at
     or new.approved_version is distinct from old.approved_version then
    raise exception 'La aprobación no se edita a mano.' using errcode = '42501';
  end if;
  -- Level: whoever sends it picks one. Out of red only with the boss or admin; while in
  -- review, only supervision, the boss or admin.
  if new.review_level is distinct from old.review_level then
    if old.review_level = 'rojo' and not (public.has_any_role(array['boss', 'admin']::public.app_role[]) and public.mfa_ok()) then
      raise exception 'Solo el jefe o administración sacan una pieza del rojo.' using errcode = '42501';
    end if;
    if old.status = 'in_review' and not (public.has_any_role(array['supervisor', 'boss', 'admin']::public.app_role[]) and public.mfa_ok()) then
      raise exception 'Una pieza en revisión solo cambia de nivel con supervisión, el jefe o administración.' using errcode = '42501';
    end if;
  end if;
  -- Review clock: set here, never by hand (only system jobs mark the reminder as sent).
  if auth.uid() is not null then
    new.sent_to_review_at := old.sent_to_review_at;
    new.review_escalated_at := old.review_escalated_at;
  end if;
  -- New version: back to review, approval no longer valid for the new file.
  if new.current_version > old.current_version and old.status in ('approved', 'changes_requested') then
    new.status := 'in_review';
  end if;
  if new.status = 'in_review' and old.status is distinct from 'in_review' then
    new.sent_to_review_at := now();
    new.review_escalated_at := null;
  end if;
  return new;
end $$;

-- The one way to approve or request changes.
--   verde / amarillo: supervision approves.  rojo: only the boss approves.
--   Supervision and the boss can ask for changes at any level. Admin never decides.
create or replace function public.review_piece(p uuid, decision text, comment text default '')
returns void language plpgsql security definer set search_path = public as $$
declare
  pc public.pieces;
begin
  if not (public.has_any_role(array['supervisor', 'boss']::public.app_role[]) and public.mfa_ok()) then
    raise exception 'Solo supervisión (o el jefe, en rojo) puede aprobar.' using errcode = '42501';
  end if;
  if decision not in ('approved', 'changes_requested') then raise exception 'Decisión inválida'; end if;
  if decision = 'changes_requested' and coalesce(btrim(comment), '') = '' then
    raise exception 'Escribe qué hay que cambiar.';
  end if;
  select * into pc from public.pieces where id = p and deleted_at is null for update;
  if pc.id is null then raise exception 'Pieza no encontrada'; end if;
  if pc.status not in ('in_review', 'approved') then raise exception 'La pieza no está en revisión.'; end if;
  if pc.current_version < 1 then raise exception 'La pieza no tiene archivo todavía.'; end if;
  if decision = 'approved' then
    if pc.review_level = 'rojo' and not public.has_role('boss') then
      raise exception 'Las piezas en rojo las aprueba el jefe.' using errcode = '42501';
    end if;
    if pc.review_level <> 'rojo' and not public.has_role('supervisor') then
      raise exception 'Esta pieza la aprueba supervisión.' using errcode = '42501';
    end if;
  end if;
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

-- Supervision, the boss and admin can change the level at any time (the guard above
-- still keeps red pieces red unless the boss or admin says otherwise).
create or replace function public.set_review_level(p uuid, level text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if level not in ('verde', 'amarillo', 'rojo') then raise exception 'Nivel inválido'; end if;
  if not (public.has_any_role(array['supervisor', 'boss', 'admin']::public.app_role[]) and public.mfa_ok()) then
    raise exception 'Solo supervisión, el jefe o administración cambian el nivel.' using errcode = '42501';
  end if;
  update public.pieces set review_level = level where id = p and deleted_at is null;
end $$;
grant execute on function public.set_review_level(uuid, text) to authenticated;

-- What goes out is what was approved: editing the copies of an approved piece sends
-- it back to review. System jobs (no person) don't count.
create or replace function public.copies_reopen_review()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'UPDATE' and new.body is not distinct from old.body then return new; end if;
  update public.pieces set status = 'in_review' where id = new.piece_id and status = 'approved';
  return new;
end $$;
create trigger copies_reopen_review after insert or update on public.copies
  for each row execute function public.copies_reopen_review();

-- The boss can comment on what he reviews.
drop policy rc_insert on public.review_comments;
create policy rc_insert on public.review_comments for insert to authenticated
  with check (author_id = auth.uid() and public.has_any_role(array['admin', 'social', 'supervisor', 'boss']::public.app_role[]));

-- ---------------------------------------------------------------------------
-- Spontaneous posts: the boss published something himself. The team records it
-- afterwards (with its link) so it counts in results. No piece, nothing to approve,
-- never sent by the platform.
-- ---------------------------------------------------------------------------
alter table public.publications
  add column origin text not null default 'team' check (origin in ('team', 'boss_spontaneous')),
  add column title text not null default '',
  alter column piece_id drop not null,
  add constraint publications_origin_piece check (
    (origin = 'team' and piece_id is not null)
    or (origin = 'boss_spontaneous' and piece_id is null and status = 'published' and mode = 'manual'
        and char_length(btrim(title)) between 3 and 140)
  );

create or replace function public.guard_publication()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  st text;
begin
  if new.status = 'published' and (new.url is null or btrim(new.url) = '') and new.mode = 'manual' then
    raise exception 'Falta el link de la publicación.';
  end if;
  if new.origin = 'boss_spontaneous' then
    new.published_at := coalesce(new.published_at, now());
    return new;
  end if;
  if new.status in ('scheduled', 'published') then
    select status into st from public.pieces where id = new.piece_id;
    if st is distinct from 'approved' then
      raise exception 'La pieza no está aprobada.' using errcode = '42501';
    end if;
  end if;
  if new.mode = 'api' and new.status = 'scheduled' and coalesce(
       (select value #>> '{}' from public.app_settings where key = 'publishing.enabled'), 'false') <> 'true' then
    raise exception 'La publicación automática está apagada.' using errcode = '42501';
  end if;
  return new;
end $$;
