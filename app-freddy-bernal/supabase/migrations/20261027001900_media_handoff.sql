-- Material (cambios del 27/10/2026, §4.1, §5 and §6): every media_assets rule lives here from now on.
--   * Five new kinds: 'storyboard' (the storyboard Grabación recorded with: a picture or a PDF, always on its event),
--     'before', 'progress' and 'document' (photos and papers of an obra ficha, IVT) and 'before', 'after' and
--     'document' (evidence of a community report, política). A file has at most one parent: an event, an obra ficha
--     or a report (media_assets_one_parent, 20261027001700_fichas.sql). The ficha kinds go only on a ficha, and every
--     other kind never does.
--   * Who reads a file: the event's people (admin, boss, Redes, Grabación assigned, despacho) through can_see_event;
--     files with no parent (piece versions, screenshots, tweet images) the content team (admin, Redes, the boss); a
--     ficha's files whoever can read that ficha under its own RLS (so Redes and Grabación only the photos of an obra
--     whose visit they can see, and never a report's evidence).
--   * Who uploads: admin, Redes and the boss any kind with no ficha parent (the boss «hace lo de Redes»: finals,
--     covers, screenshots); Grabación the raw kinds and its storyboard on an event assigned to it; the obra roles
--     (admin, boss, despacho, IVT) obra photos; the report roles (admin, boss, despacho, política) report evidence.
--     IVT and política never enter can_see_event, so they never see an event's material.
--   * Once uploaded, a file never moves to another event, ficha or report (guard_media_update).
--   * recording_notes: Grabación's note for the editor and the storyboard it typed, one per person, event and kind.
--     No date, time or address columns: Redes reads these notes and never reads event_schedule.
--   * The retired roles' branches (supervisor, secretary) are gone from the media policies.
-- NOT here: the agenda tables (20261027001800_shared_agenda.sql). No enum values (only 20261027001500 adds them), and
-- no rows: stable demo ids (src/lib/db/stable-ids.ts) renumber migration rows with UPDATE.

-- ---------------------------------------------------------------------------
-- 1. Kinds and shapes
-- ---------------------------------------------------------------------------
alter table public.media_assets drop constraint media_assets_kind_check;
alter table public.media_assets
  add constraint media_assets_kind_check check (kind in ('boss', 'drone', 'broll', 'other', 'final', 'cover', 'editable',
    'voice_line', 'evidence', 'tweet_image', 'storyboard', 'before', 'progress', 'after', 'document')),
  -- The storyboard Grabación recorded with: on its event, and a picture or a PDF (Redes opens it on the phone).
  add constraint media_assets_storyboard_shape check (kind <> 'storyboard' or (event_id is not null
    and mime in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf'))),
  -- Ficha kinds only on a ficha ('progress' an obra's, 'after' a report's); every other kind never on a ficha.
  -- (Postgres checks CHECKs in name order: a file with two parents still reports media_assets_one_parent first.)
  add constraint media_assets_parent_kinds check (case kind
    when 'progress' then obra_ficha_id is not null
    when 'after' then community_report_id is not null
    when 'before' then obra_ficha_id is not null or community_report_id is not null
    when 'document' then obra_ficha_id is not null or community_report_id is not null
    else obra_ficha_id is null and community_report_id is null end);

-- ---------------------------------------------------------------------------
-- 2. Policies (inline, not through a helper, so INSERT ... RETURNING sees the new row)
-- ---------------------------------------------------------------------------
drop policy media_select on public.media_assets;
drop policy media_insert on public.media_assets;
drop policy media_update on public.media_assets;

create policy media_select on public.media_assets for select to authenticated
  using ((deleted_at is null and (
           (event_id is not null and public.can_see_event(event_id)
            and public.has_any_role(array['admin', 'boss', 'social', 'camera', 'dispatch']::public.app_role[]))
           or (event_id is null and obra_ficha_id is null and community_report_id is null and public.is_content_team())
           -- A ficha's files: whoever reads the ficha under its own RLS (obra_fichas_select, community_reports_select).
           or (obra_ficha_id is not null
               and exists (select 1 from public.obra_fichas f where f.id = media_assets.obra_ficha_id))
           or (community_report_id is not null
               and exists (select 1 from public.community_reports r where r.id = media_assets.community_report_id))))
         or (deleted_at is not null and public.has_role('admin')));

create policy media_insert on public.media_assets for insert to authenticated
  with check (uploaded_by = auth.uid() and (
    (public.has_any_role(array['admin', 'social', 'boss']::public.app_role[])
     and obra_ficha_id is null and community_report_id is null)
    or (public.has_role('camera') and event_id is not null and public.is_assigned(event_id)
        and kind in ('boss', 'drone', 'broll', 'other', 'storyboard'))
    or (obra_ficha_id is not null and kind in ('before', 'progress', 'document')
        and public.has_any_role(array['admin', 'boss', 'dispatch', 'ivt']::public.app_role[])
        and exists (select 1 from public.obra_fichas f where f.id = media_assets.obra_ficha_id and f.deleted_at is null))
    or (community_report_id is not null and kind in ('before', 'after', 'document')
        and public.has_any_role(array['admin', 'boss', 'dispatch', 'politics']::public.app_role[])
        and exists (select 1 from public.community_reports r where r.id = media_assets.community_report_id and r.deleted_at is null))
  ));

-- Your own upload (finish, fail, label), or admin, Redes and the boss (labels, soft delete through the guards).
create policy media_update on public.media_assets for update to authenticated
  using (uploaded_by = auth.uid() or public.has_any_role(array['admin', 'social', 'boss']::public.app_role[]))
  with check (uploaded_by = auth.uid() or public.has_any_role(array['admin', 'social', 'boss']::public.app_role[]));

-- ---------------------------------------------------------------------------
-- 3. A file is what it is: it never changes kind, bytes or parent (event, obra ficha, report).
-- ---------------------------------------------------------------------------
create or replace function public.guard_media_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or current_setting('app.trusted_update', true) = 'on' then return new; end if;
  if new.bucket is distinct from old.bucket or new.storage_path is distinct from old.storage_path or new.kind is distinct from old.kind
     or new.event_id is distinct from old.event_id or new.obra_ficha_id is distinct from old.obra_ficha_id
     or new.community_report_id is distinct from old.community_report_id
     or new.uploaded_by is distinct from old.uploaded_by or new.mime is distinct from old.mime
     or new.size_bytes is distinct from old.size_bytes or new.duration_s is distinct from old.duration_s or new.width is distinct from old.width
     or new.height is distinct from old.height or new.fps is distinct from old.fps or new.video_codec is distinct from old.video_codec
     or new.audio_codec is distinct from old.audio_codec then
    raise exception 'Un archivo subido no se reemplaza ni se pasa a otro lado: súbelo otra vez donde va.' using errcode = '42501';
  end if;
  if new.status is distinct from old.status and old.status <> 'uploading' then
    raise exception 'Un archivo terminado no vuelve a subirse.' using errcode = '42501';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Grabación's handoff: the note for the editor and the storyboard it typed. One live row per person, event and
--    kind (the app saves with an upsert). Audited, soft delete by admin only, never hard-deleted.
-- ---------------------------------------------------------------------------
create table public.recording_notes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id),
  kind text not null check (kind in ('editor_note', 'storyboard_text')),
  body text not null default '' check (char_length(body) <= 5000),
  author_id uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index recording_notes_one on public.recording_notes (event_id, author_id, kind) where deleted_at is null;
create index recording_notes_event_idx on public.recording_notes (event_id) where deleted_at is null;
select public.wire_standard_triggers('public.recording_notes', true, true);

-- A note stays on its event, its kind and its author; only the text (and admin's soft delete) changes.
create function public.guard_recording_note()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.uid() is null or current_setting('app.trusted_update', true) = 'on' then return new; end if;
  if new.id is distinct from old.id or new.event_id is distinct from old.event_id or new.kind is distinct from old.kind
     or new.author_id is distinct from old.author_id or new.created_at is distinct from old.created_at then
    raise exception 'Una nota no cambia de evento, de tipo ni de autor.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger guard_recording_note before update on public.recording_notes
  for each row execute function public.guard_recording_note();

alter table public.recording_notes enable row level security;
grant select, insert, update on public.recording_notes to authenticated;

-- Read: admin, the boss and Redes with the event; Grabación on its own events. Not despacho, IVT or política.
create policy rn_select on public.recording_notes for select to authenticated
  using ((deleted_at is null and (
           (public.has_any_role(array['admin', 'boss', 'social']::public.app_role[]) and public.can_see_event(event_id))
           or (public.has_role('camera') and public.is_assigned(event_id))))
         or (deleted_at is not null and public.has_role('admin')));
-- Write your own: the boss, or Grabación on an event assigned to it.
create policy rn_insert on public.recording_notes for insert to authenticated
  with check (author_id = auth.uid() and deleted_at is null
              and (public.has_role('boss') or (public.has_role('camera') and public.is_assigned(event_id))));
create policy rn_update on public.recording_notes for update to authenticated
  using (author_id = auth.uid() or public.has_role('admin'))
  with check (author_id = auth.uid() or public.has_role('admin'));

-- ---------------------------------------------------------------------------
-- 5. Publications: the same gate as 20261024000700_semaforo.sql, with the approver's name of the six roles
--    (Supervisión is retired; the boss approves everything, 20261027001600_six_roles.sql).
-- ---------------------------------------------------------------------------
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
      raise exception 'La pieza no está aprobada por el jefe.' using errcode = '42501';
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

-- ---------------------------------------------------------------------------
-- 6. Privileges (rule of 20261026001400_functions_closed_to_anon.sql). Every function here is a trigger function.
--    CREATE OR REPLACE keeps a function's grants; they are stated again so this file reads on its own.
-- ---------------------------------------------------------------------------
revoke all on function public.guard_media_update() from public, anon, authenticated;
revoke all on function public.guard_recording_note() from public, anon, authenticated;
revoke all on function public.guard_publication() from public, anon, authenticated;
