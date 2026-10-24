-- Approval traffic light (semáforo), copy options per piece, the boss's spontaneous
-- posts (D-23), and "what goes out is exactly what was approved".
--   verde:    routine. Supervision approves (it can approve several at once).
--   amarillo: normal. Supervision approves; reminder at 60 min.
--   rojo:     sensitive. Only the boss approves; reminder at 30 min.
-- Deadlines are reminders, never approvals: no answer = not approved.

alter table public.pieces
  add column review_level text not null default 'amarillo' check (review_level in ('verde', 'amarillo', 'rojo')),
  add column sent_to_review_at timestamptz,
  add column review_escalated_at timestamptz,
  -- Bumped on every change a reviewer has to see (new version, copies). An approval
  -- names the revision it saw (review_piece expected_rev).
  add column revision int not null default 0,
  add column copy_voice text not null default 'boss' check (copy_voice in ('boss', 'institutional')),
  add column copy_closing jsonb;

update public.pieces set sent_to_review_at = updated_at where status = 'in_review';
create index pieces_review_idx on public.pieces (review_level, sent_to_review_at) where status = 'in_review' and deleted_at is null;

create or replace function public.level_rank(l text)
returns int language sql immutable as $$
  select case l when 'verde' then 1 when 'amarillo' then 2 when 'rojo' then 3 end
$$;

-- ---------------------------------------------------------------------------
-- Approval guard (replaces the one in 20261023000300_content.sql)
-- ---------------------------------------------------------------------------
create or replace function public.guard_piece_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  reviewer boolean;
begin
  if current_setting('app.trusted_update', true) = 'on' then return new; end if;
  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'in_review') or new.approved_by is not null or new.approved_at is not null then
      raise exception 'Una pieza nueva empieza como borrador.' using errcode = '42501';
    end if;
    new.sent_to_review_at := case when new.status = 'in_review' then now() end;
    new.review_escalated_at := null;
    new.revision := 0;
    return new;
  end if;
  if new.status is distinct from old.status and new.status in ('approved', 'changes_requested') then
    raise exception 'Solo quien aprueba decide (usa review_piece).' using errcode = '42501';
  end if;
  if new.approved_by is distinct from old.approved_by or new.approved_at is distinct from old.approved_at
     or new.approved_version is distinct from old.approved_version then
    raise exception 'La aprobación no se edita a mano.' using errcode = '42501';
  end if;
  if new.current_version < old.current_version then
    raise exception 'Una versión no se vuelve atrás: sube el archivo como versión nueva.' using errcode = '42501';
  end if;
  -- Level. Out of red only with the boss or admin. While in review, only supervision,
  -- the boss or admin. Once sent to review, the rest may raise it, never lower it.
  if new.review_level is distinct from old.review_level then
    reviewer := public.has_any_role(array['supervisor', 'boss', 'admin']::public.app_role[]) and public.mfa_ok();
    if old.review_level = 'rojo' and not (public.has_any_role(array['boss', 'admin']::public.app_role[]) and public.mfa_ok()) then
      raise exception 'Solo el jefe o administración sacan una pieza del rojo.' using errcode = '42501';
    end if;
    if old.status = 'in_review' and not reviewer then
      raise exception 'Una pieza en revisión solo cambia de nivel con supervisión, el jefe o administración.' using errcode = '42501';
    end if;
    if public.level_rank(new.review_level) < public.level_rank(old.review_level) and old.sent_to_review_at is not null and not reviewer then
      raise exception 'Una pieza que ya pasó por revisión solo baja de nivel con supervisión, el jefe o administración.' using errcode = '42501';
    end if;
  end if;
  -- Review clock and revision: set here, never by hand (system jobs may mark the reminder).
  if auth.uid() is not null then
    new.sent_to_review_at := old.sent_to_review_at;
    new.review_escalated_at := old.review_escalated_at;
    new.revision := old.revision;
  end if;
  -- New version: what the reviewer saw is no longer what would go out.
  if new.current_version > old.current_version then
    new.revision := old.revision + 1;
    if old.status in ('approved', 'changes_requested') then new.status := 'in_review'; end if;
  end if;
  -- Raised to red after supervision approved it: now it needs the boss.
  if new.review_level = 'rojo' and old.review_level <> 'rojo' and old.status = 'approved' then
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
--   expected_rev: the revision the person looked at; if the piece changed since, refuse.
drop function public.review_piece(uuid, text, text);
create function public.review_piece(p uuid, decision text, comment text default '', expected_rev int default null)
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
  if expected_rev is not null and expected_rev <> pc.revision then
    raise exception 'La pieza cambió mientras la revisabas (versión nueva o copies). Ábrela de nuevo.';
  end if;
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
grant execute on function public.review_piece(uuid, text, text, int) to authenticated;

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

-- When a piece stops being approved (back to review, archived, deleted), nothing of it
-- stays scheduled: those publications go back to draft with the reason.
create or replace function public.withdraw_publications()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (old.status = 'approved' and new.status <> 'approved') or (new.deleted_at is not null and old.deleted_at is null) then
    update public.publications
       set status = 'draft', failure_reason = 'La pieza ya no está aprobada: prográmala de nuevo cuando se apruebe.'
     where piece_id = new.id and status = 'scheduled' and deleted_at is null;
  end if;
  return new;
end $$;
create trigger withdraw_publications after update on public.pieces
  for each row execute function public.withdraw_publications();

-- ---------------------------------------------------------------------------
-- Copies: they belong to one piece and one length, forever. Editing the text of an
-- approved piece sends it back to review. System jobs (no person) don't count.
-- ---------------------------------------------------------------------------
create or replace function public.guard_copy()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.piece_id is distinct from old.piece_id or new.length_group is distinct from old.length_group then
    raise exception 'Un copy no se pasa a otra pieza ni a otro largo.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger guard_copy before update on public.copies
  for each row execute function public.guard_copy();

create or replace function public.copies_reopen_review()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'UPDATE' and new.body is not distinct from old.body then return new; end if;
  perform set_config('app.trusted_update', 'on', true);
  update public.pieces set
    revision = revision + 1,
    status = case when status = 'approved' then 'in_review' else status end,
    sent_to_review_at = case when status = 'approved' then now() else sent_to_review_at end,
    review_escalated_at = case when status = 'approved' then null else review_escalated_at end
  where id = new.piece_id;
  perform set_config('app.trusted_update', 'off', true);
  return new;
end $$;
create trigger copies_reopen_review after insert or update on public.copies
  for each row execute function public.copies_reopen_review();

-- ---------------------------------------------------------------------------
-- Files: once uploaded, a file is what it is. A different file is a new version.
-- ---------------------------------------------------------------------------
create or replace function public.guard_media_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or current_setting('app.trusted_update', true) = 'on' then return new; end if;
  if new.bucket is distinct from old.bucket or new.storage_path is distinct from old.storage_path or new.kind is distinct from old.kind
     or new.event_id is distinct from old.event_id or new.uploaded_by is distinct from old.uploaded_by or new.mime is distinct from old.mime
     or new.size_bytes is distinct from old.size_bytes or new.duration_s is distinct from old.duration_s or new.width is distinct from old.width
     or new.height is distinct from old.height or new.fps is distinct from old.fps or new.video_codec is distinct from old.video_codec
     or new.audio_codec is distinct from old.audio_codec then
    raise exception 'Un archivo subido no se reemplaza: súbelo como versión nueva.' using errcode = '42501';
  end if;
  if new.status is distinct from old.status and old.status <> 'uploading' then
    raise exception 'Un archivo terminado no vuelve a subirse.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger guard_media_update before update on public.media_assets
  for each row execute function public.guard_media_update();

-- Storage: overwriting an object is only allowed while its upload is in progress.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    execute 'drop policy if exists material_update on storage.objects';
    execute $p$
      create policy material_update on storage.objects for update to authenticated
      using (bucket_id in ('material', 'covers') and owner_id = auth.uid()::text and exists (
        select 1 from public.media_assets m
         where m.bucket = storage.objects.bucket_id and m.storage_path = storage.objects.name
           and m.uploaded_by = auth.uid() and m.status = 'uploading'))
    $p$;
  end if;
end $$;

-- The boss can comment on what he reviews.
drop policy rc_insert on public.review_comments;
create policy rc_insert on public.review_comments for insert to authenticated
  with check (author_id = auth.uid() and public.has_any_role(array['admin', 'social', 'supervisor', 'boss']::public.app_role[]));

-- ---------------------------------------------------------------------------
-- Publications. Spontaneous posts: the boss published something himself; the team
-- records it afterwards (with its link) so it counts in results. No piece, nothing
-- to approve, never sent by the platform.
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
  pc public.pieces;
  approved_copy text;
begin
  -- What a publication is (piece, network, format, text, cover, origin) never changes:
  -- to change it, make a new one.
  if tg_op = 'UPDATE' and (
       new.origin is distinct from old.origin or new.piece_id is distinct from old.piece_id or new.network is distinct from old.network
       or new.format is distinct from old.format or new.copy_body is distinct from old.copy_body
       or new.cover_asset_id is distinct from old.cover_asset_id) then
    raise exception 'Una publicación no cambia de pieza, red, formato, copy ni portada: crea otra.' using errcode = '42501';
  end if;
  if new.status = 'published' and (new.url is null or btrim(new.url) = '') and new.mode = 'manual' then
    raise exception 'Falta el link de la publicación.';
  end if;
  if new.origin = 'boss_spontaneous' then
    if tg_op = 'INSERT' then new.published_at := coalesce(new.published_at, now()); end if;
    if new.published_at > now() + interval '5 minutes' then
      raise exception 'Se registra lo que ya salió: la fecha no puede ser futura.';
    end if;
    return new;
  end if;
  -- Going out (created as scheduled/published, or moved there): only an approved piece,
  -- with its approved text for that network and the approved version's cover.
  if new.status in ('scheduled', 'published') and (tg_op = 'INSERT' or new.status is distinct from old.status) then
    select * into pc from public.pieces where id = new.piece_id;
    if pc.status is distinct from 'approved' or pc.deleted_at is not null then
      raise exception 'La pieza no está aprobada.' using errcode = '42501';
    end if;
    select c.body into approved_copy
      from public.copies c join public.network_specs s on s.length_group = c.length_group
     where c.piece_id = new.piece_id and s.network = new.network;
    if coalesce(approved_copy, '') <> new.copy_body then
      raise exception 'El copy no es el aprobado: crea la publicación de nuevo.' using errcode = '42501';
    end if;
    if new.cover_asset_id is not null and new.cover_asset_id is distinct from
       (select v.cover_asset_id from public.piece_versions v where v.piece_id = new.piece_id and v.version = pc.approved_version) then
      raise exception 'La portada no es la aprobada: crea la publicación de nuevo.' using errcode = '42501';
    end if;
  end if;
  if new.mode = 'api' and new.status = 'scheduled'
     and (tg_op = 'INSERT' or new.status is distinct from old.status or new.mode is distinct from old.mode)
     and coalesce((select value #>> '{}' from public.app_settings where key = 'publishing.enabled'), 'false') <> 'true' then
    raise exception 'La publicación automática está apagada.' using errcode = '42501';
  end if;
  return new;
end $$;
