-- Redes por formato, meses y feed (R4, 29/10/2026, D-60 a D-78). Nothing here edits an earlier file.
--   * pieces.format: reel | post | carousel | story | youtube | month_end, backfilled from kind (D-61, D-76).
--   * content_months: ONE list for the sections and the feed (D-67). feed_slots: 24 numbered places per month; a piece
--     sits in one place at most, in any month, and only in its own month (D-69). Month, place and order are set by
--     people, never derived from an event's date (D-75).
--   * What goes out stays frozen or goes back to the boss (D-61): files, cover and carousel images in piece_versions
--     (slide_asset_ids, insert-only like the rest of the row), copies (copies_reopen_review, unchanged), the title of
--     a reel or a YouTube video (redes_piece_rules), a story's on-screen text and sticker (story_details_reopen_review)
--     and a new or edited compliance notice (notices_reopen_review). Everything else (the rest of piece_details,
--     month, place, order, pillar, rating, design marks) never touches status or revision. A design the boss
--     disapproved after approving does not go out (guard_publication_design).
--   * Design marks and rating: Redes and the boss; the boss's disapproval only the boss lifts (D-64, D-65). Deleting a
--     piece: only the boss with 2FA, through remove_piece(); restoring: only administración (D-70). Deleting a month:
--     Redes and the boss; its pieces move to the first month left and leave the feed (D-67). A live piece is always in
--     a live month (guard_piece_month). Every month has its 24 place rows from birth (content_month_slots), so the
--     feed functions lock a row before reading it.
--   * Text Redes reads (piece title, month name, card fields, notes, notices): never a phone (CHECK); from someone who
--     knows the agenda, never a concrete date or time (the Mensajes rule, E1) (D-75).
-- No rows, no enum values, nothing reads event_schedule / event_calendar / events.done_on, nothing new in the Realtime
-- publication.

-- ---------------------------------------------------------------------------------------------------------------
-- 1. Pieces: format, month, pillar, order, rating, design
-- ---------------------------------------------------------------------------------------------------------------
alter table public.pieces
  add column format text,
  add column content_month_id uuid,
  add column pillar text,
  add column sort_order int not null default 0,
  add column rating smallint,
  add column design_status text,
  add column design_note text not null default '',
  add column design_by uuid references public.profiles (id),
  add column design_at timestamptz;

-- Existing pieces (none on fb-dev today; the legacy DB of retire-roles has videos). No person: no guard fires.
update public.pieces set format = case kind
  when 'carousel' then 'carousel' when 'photo' then 'post' when 'cover' then 'post' else 'reel' end;

alter table public.pieces
  alter column format set not null,
  alter column format set default 'reel',
  add constraint pieces_format_check check (format in ('reel', 'post', 'carousel', 'story', 'youtube', 'month_end')),
  add constraint pieces_pillar_key check (pillar is null or pillar ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  add constraint pieces_rating_range check (rating is null or rating between 1 and 10),
  add constraint pieces_rating_formats check (rating is null or format in ('post', 'reel', 'carousel')),
  add constraint pieces_design_status check (design_status is null or design_status in ('approved', 'disapproved')),
  add constraint pieces_design_note_len check (char_length(design_note) <= 1000),
  add constraint pieces_design_note_no_phone check (not public.text_has_phone(design_note));

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Content months (one list for the sections and the feed)
-- ---------------------------------------------------------------------------------------------------------------
create table public.content_months (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  ordinal int not null check (ordinal >= 1),
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint content_months_label_len check (char_length(btrim(label)) between 1 and 40),
  constraint content_months_label_no_phone check (not public.text_has_phone(label))
);
create unique index content_months_ordinal_live on public.content_months (ordinal) where deleted_at is null;
select public.wire_standard_triggers('public.content_months', false, true);  -- no admin-only soft-delete guard: see policy

-- Every tab, section and the feed show the month's name to Redes: no concrete date or time from someone who knows the
-- agenda (the Mensajes rule).
create function public.guard_content_month()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and (tg_op = 'INSERT' or new.label is distinct from old.label)
     and public.chat_author_knows_agenda(auth.uid()) and public.text_has_concrete_datetime(new.label) then
    raise exception 'Todo Redes lee el nombre del mes: sin fecha ni hora («Mes 2», «Cierre de año»).' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger guard_content_month before insert or update on public.content_months
  for each row execute function public.guard_content_month();

alter table public.pieces
  add constraint pieces_content_month_fk foreign key (content_month_id) references public.content_months (id);
create index pieces_month_format_idx on public.pieces (content_month_id, format, sort_order) where deleted_at is null;

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Feed: numbered places 1..24 per month. Number = real publication order (#1 bottom-right ... #24 top-left; the
--    grid is drawn by the app). The 24 rows are created with the month (content_month_slots) and never move: people
--    only change piece_id (null = empty), so every function locks the row it reads. Deferrable uniques so a swap works
--    inside one transaction.
-- ---------------------------------------------------------------------------------------------------------------
create table public.feed_slots (
  id uuid primary key default gen_random_uuid(),
  month_id uuid not null references public.content_months (id),
  num smallint not null check (num between 1 and 24),
  piece_id uuid references public.pieces (id),
  placed_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint feed_slots_month_num unique (month_id, num) deferrable initially deferred,
  constraint feed_slots_one_place unique (piece_id) deferrable initially deferred
);
create index feed_slots_month_idx on public.feed_slots (month_id) where piece_id is not null;
select public.wire_standard_triggers('public.feed_slots', false, true);

create function public.content_month_slots()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.feed_slots (month_id, num) select new.id, n::smallint from generate_series(1, 24) n;
  return null;
end $$;
create trigger content_month_slots after insert on public.content_months
  for each row execute function public.content_month_slots();

-- A place never changes month or number (only its piece): the (month, num) unique cannot be hit by a person.
create function public.guard_feed_slot()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.month_id is distinct from old.month_id or new.num is distinct from old.num then
    raise exception 'Un espacio del feed no cambia de mes ni de número.' using errcode = '42501';
  end if;
  new.placed_by := coalesce(auth.uid(), new.placed_by);
  return new;
end $$;
create trigger guard_feed_slot before update on public.feed_slots
  for each row execute function public.guard_feed_slot();

-- At commit: a placed piece is alive, a feed format, of the slot's month, and the month is alive.
create function public.check_feed_slot()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  pc record;
begin
  if new.piece_id is null then return null; end if;
  select p.format, p.content_month_id, p.deleted_at into pc from public.pieces p where p.id = new.piece_id;
  if pc.deleted_at is not null then
    raise exception 'Esa pieza ya no está.' using errcode = 'P0001';
  end if;
  if pc.format not in ('post', 'reel', 'carousel') then
    raise exception 'En el feed van posts, reels y carruseles.' using errcode = 'P0001';
  end if;
  if pc.content_month_id is distinct from new.month_id then
    raise exception 'La pieza es de otro mes: usa «Mover a otro mes».' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.content_months m where m.id = new.month_id and m.deleted_at is not null) then
    raise exception 'Ese mes ya no está.' using errcode = 'P0001';
  end if;
  return null;
end $$;
create constraint trigger check_feed_slot after insert or update on public.feed_slots
  deferrable initially deferred for each row execute function public.check_feed_slot();

-- The same rule seen from the piece: moving its month, changing its format or deleting it while it is placed.
create function public.check_piece_feed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.feed_slots s
              where s.piece_id = new.id
                and (s.month_id is distinct from new.content_month_id or new.deleted_at is not null
                     or new.format not in ('post', 'reel', 'carousel'))) then
    raise exception 'La pieza está en el feed de otro mes: muévela con «Mover a otro mes».' using errcode = 'P0001';
  end if;
  return null;
end $$;
create constraint trigger check_piece_feed after update of content_month_id, format, deleted_at on public.pieces
  deferrable initially deferred for each row execute function public.check_piece_feed();

-- A live piece is always in a live month. No month given (or restoring a piece whose month was deleted): the first
-- live month (null only while no month exists: an old database before seed-client). A deleted month: refused. The
-- month is read FOR SHARE, so this waits for a delete_content_month in progress (FOR UPDATE) and then sees it.
create function public.guard_piece_month()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  first_live uuid;
begin
  if new.deleted_at is not null then return new; end if;
  if new.content_month_id is null
     or (tg_op = 'UPDATE' and old.deleted_at is not null
         and exists (select 1 from public.content_months m where m.id = new.content_month_id and m.deleted_at is not null)) then
    select id into first_live from public.content_months where deleted_at is null order by ordinal limit 1 for share;
    new.content_month_id := first_live;
    return new;
  end if;
  if tg_op = 'INSERT' or new.content_month_id is distinct from old.content_month_id then
    perform 1 from public.content_months where id = new.content_month_id and deleted_at is null for share;
    if not found then
      raise exception 'Ese mes ya no está: recarga la página.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger guard_piece_month before insert or update of content_month_id, deleted_at on public.pieces
  for each row execute function public.guard_piece_month();

-- The title shows on every card, the feed and notifications: no concrete date or time from someone who knows the
-- agenda (the boss and administración edit it inline).
create function public.guard_piece_title()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and (tg_op = 'INSERT' or new.title is distinct from old.title)
     and public.chat_author_knows_agenda(auth.uid()) and public.text_has_concrete_datetime(new.title) then
    raise exception 'Redes lee el título: escríbelo sin fecha ni hora.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger guard_piece_title before insert or update of title on public.pieces
  for each row execute function public.guard_piece_title();

-- ---------------------------------------------------------------------------------------------------------------
-- 4. Carousel / month-end images: an ordered list frozen in the version (versions are insert-only for persons:
--    content.sql has no UPDATE policy). A null element = a planned slide without its image yet.
-- ---------------------------------------------------------------------------------------------------------------
alter table public.piece_versions
  add column slide_asset_ids uuid[] not null default '{}',
  add constraint piece_versions_slides_max check (cardinality(slide_asset_ids) <= 20);

create function public.guard_version_slides()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from unnest(new.slide_asset_ids) a(id)
              where a.id is not null and not exists (
                select 1 from public.media_assets m
                 where m.id = a.id and m.deleted_at is null and m.status = 'ready'
                   and m.kind in ('final', 'cover') and m.mime like 'image/%')) then
    raise exception 'Cada lámina tiene que ser una imagen ya subida.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger guard_version_slides before insert on public.piece_versions
  for each row execute function public.guard_version_slides();

-- ---------------------------------------------------------------------------------------------------------------
-- 5. Script and planning fields (free, except a story's on-screen text and sticker: story_details_reopen_review).
--    One row per piece, created on the first save. reference_asset_id = the reel's «Referencia» picture (planning
--    only: not in the version, not frozen, never published). shots = [{says, action, on_screen}] (Reel, YouTube); slides = [{role, title, text}] (Carousel,
--    Fin de mes), in the same order as the current version's slide_asset_ids. rev = concurrency token (bump_rev).
-- ---------------------------------------------------------------------------------------------------------------
create table public.piece_details (
  id uuid primary key default gen_random_uuid(),
  piece_id uuid not null unique references public.pieces (id),
  art_overline text not null default '',
  art_headline text not null default '',
  art_seals text not null default '',
  art_fine_print text not null default '',
  visual_concept text not null default '',
  hook text not null default '',
  cta text not null default '',
  hashtags text not null default '',
  publication_notes text not null default '',
  sticker text,
  sticker_text text not null default '',
  sticker_url text not null default '',
  on_screen text not null default '',
  follow_up text not null default '',
  idea text not null default '',
  links text not null default '',
  post_ratio text not null default '4:5',
  reference_asset_id uuid references public.media_assets (id),
  shots jsonb not null default '[]',
  slides jsonb not null default '[]',
  rev int not null default 0,
  updated_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint piece_details_len check (
    char_length(art_overline) <= 200 and char_length(art_headline) <= 200 and char_length(art_seals) <= 300
    and char_length(art_fine_print) <= 600 and char_length(visual_concept) <= 2000 and char_length(hook) <= 300
    and char_length(cta) <= 300 and char_length(hashtags) <= 500 and char_length(publication_notes) <= 2000
    and char_length(on_screen) <= 500 and char_length(follow_up) <= 1000 and char_length(sticker_text) <= 300
    and char_length(sticker_url) <= 500 and char_length(idea) <= 2000 and char_length(links) <= 2000),
  constraint piece_details_sticker_url check (sticker_url = '' or sticker_url ~ '^https://[^[:space:]]+$'),
  constraint piece_details_post_ratio check (post_ratio in ('4:5', '1:1')),
  constraint piece_details_sticker check (sticker is null or sticker in
    ('poll', 'quiz', 'question', 'slider', 'repost', 'tip', 'countdown', 'link', 'behind_scenes', 'other')),
  constraint piece_details_shape check (
    jsonb_typeof(shots) = 'array' and jsonb_array_length(shots) <= 60
    and jsonb_typeof(slides) = 'array' and jsonb_array_length(slides) <= 20),
  constraint piece_details_no_phone check (not public.text_has_phone(
    art_overline || ' ' || art_headline || ' ' || art_seals || ' ' || art_fine_print || ' ' || visual_concept || ' '
    || hook || ' ' || cta || ' ' || hashtags || ' ' || publication_notes || ' ' || on_screen || ' ' || follow_up
    || ' ' || sticker_text || ' ' || sticker_url || ' ' || idea || ' ' || links
    || ' ' || shots::text || ' ' || slides::text))
);
select public.wire_standard_triggers('public.piece_details', false, true);
create trigger rev_piece_details before insert or update on public.piece_details
  for each row execute function public.bump_rev();

-- The row stays with its piece; each element of shots/slides is an object of short strings; an author who knows
-- the agenda writes no concrete date or time (Redes reads it).
create function public.guard_piece_details()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  written text;
begin
  if tg_op = 'UPDATE' and new.piece_id is distinct from old.piece_id then
    raise exception 'Los campos no se pasan a otra pieza.' using errcode = '42501';
  end if;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  if exists (select 1 from jsonb_array_elements(new.shots) e
              where jsonb_typeof(e) <> 'object'
                 or char_length(coalesce(e ->> 'says', '')) > 1000 or char_length(coalesce(e ->> 'action', '')) > 1000
                 or char_length(coalesce(e ->> 'on_screen', '')) > 300)
     or exists (select 1 from jsonb_array_elements(new.slides) e
              where jsonb_typeof(e) <> 'object'
                 or coalesce(e ->> 'role', 'body') not in ('cover', 'body', 'summary', 'cta')
                 or char_length(coalesce(e ->> 'title', '')) > 120 or char_length(coalesce(e ->> 'text', '')) > 1000) then
    raise exception 'Algún campo de la tarjeta no es válido o es muy largo.' using errcode = 'P0001';
  end if;
  if new.reference_asset_id is not null
     and (tg_op = 'INSERT' or new.reference_asset_id is distinct from old.reference_asset_id)
     and not exists (select 1 from public.media_assets m
                      where m.id = new.reference_asset_id and m.deleted_at is null and m.status = 'ready'
                        and m.mime like 'image/%') then
    raise exception 'La referencia tiene que ser una imagen ya subida.' using errcode = '42501';
  end if;
  if auth.uid() is null or not public.chat_author_knows_agenda(auth.uid()) then return new; end if;
  -- Only what this person writes: a field that changed, a shot or slide that was not there. Text someone else wrote
  -- (Redes may cite «del 12 de marzo») never locks the card for the boss, nor does a copy of a whole card («Duplicar»):
  -- it adds nothing Redes does not read already.
  if tg_op = 'INSERT' then
    if exists (select 1 from public.piece_details d
                where (d.art_overline, d.art_headline, d.art_seals, d.art_fine_print, d.visual_concept, d.hook, d.cta,
                       d.hashtags, d.publication_notes, d.on_screen, d.follow_up, d.sticker_text, d.sticker_url, d.idea,
                       d.links, d.shots, d.slides)
                    = (new.art_overline, new.art_headline, new.art_seals, new.art_fine_print, new.visual_concept, new.hook,
                       new.cta, new.hashtags, new.publication_notes, new.on_screen, new.follow_up, new.sticker_text,
                       new.sticker_url, new.idea, new.links, new.shots, new.slides)) then
      return new;
    end if;
    written := concat_ws(' ', new.art_overline, new.art_headline, new.art_seals, new.art_fine_print, new.visual_concept,
      new.hook, new.cta, new.hashtags, new.publication_notes, new.on_screen, new.follow_up, new.sticker_text,
      new.sticker_url, new.idea, new.links, new.shots::text, new.slides::text);
  else
    written := concat_ws(' ',
      case when new.art_overline is distinct from old.art_overline then new.art_overline end,
      case when new.art_headline is distinct from old.art_headline then new.art_headline end,
      case when new.art_seals is distinct from old.art_seals then new.art_seals end,
      case when new.art_fine_print is distinct from old.art_fine_print then new.art_fine_print end,
      case when new.visual_concept is distinct from old.visual_concept then new.visual_concept end,
      case when new.hook is distinct from old.hook then new.hook end,
      case when new.cta is distinct from old.cta then new.cta end,
      case when new.hashtags is distinct from old.hashtags then new.hashtags end,
      case when new.publication_notes is distinct from old.publication_notes then new.publication_notes end,
      case when new.on_screen is distinct from old.on_screen then new.on_screen end,
      case when new.follow_up is distinct from old.follow_up then new.follow_up end,
      case when new.sticker_text is distinct from old.sticker_text then new.sticker_text end,
      case when new.sticker_url is distinct from old.sticker_url then new.sticker_url end,
      case when new.idea is distinct from old.idea then new.idea end,
      case when new.links is distinct from old.links then new.links end,
      (select string_agg(e::text, ' ') from jsonb_array_elements(new.shots) e where not (old.shots @> jsonb_build_array(e))),
      (select string_agg(e::text, ' ') from jsonb_array_elements(new.slides) e where not (old.slides @> jsonb_build_array(e))));
  end if;
  if public.text_has_concrete_datetime(written) then
    raise exception 'Redes lee esta tarjeta: escríbela sin fecha ni hora.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger guard_piece_details before insert or update on public.piece_details
  for each row execute function public.guard_piece_details();

-- A story has no copy: its on-screen text and its sticker (kind, question or options, link) are what goes out, typed
-- in the Instagram or Facebook app when publishing. Once the story has a file, changing them is a change the boss must
-- see (the copies_reopen_review pattern).
create function public.story_details_reopen_review()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'UPDATE' and new.on_screen is not distinct from old.on_screen and new.sticker is not distinct from old.sticker
     and new.sticker_text is not distinct from old.sticker_text and new.sticker_url is not distinct from old.sticker_url then
    return new;
  end if;
  if tg_op = 'INSERT' and new.on_screen = '' and new.sticker is null and new.sticker_text = '' and new.sticker_url = '' then
    return new;
  end if;
  perform set_config('app.trusted_update', 'on', true);
  update public.pieces set
    revision = revision + 1,
    status = case when status = 'approved' then 'in_review' else status end,
    sent_to_review_at = case when status = 'approved' then now() else sent_to_review_at end,
    review_escalated_at = case when status = 'approved' then null else review_escalated_at end
  where id = new.piece_id and format = 'story' and current_version > 0;
  perform set_config('app.trusted_update', 'off', true);
  return new;
end $$;
create trigger story_details_reopen_review after insert or update on public.piece_details
  for each row execute function public.story_details_reopen_review();

-- ---------------------------------------------------------------------------------------------------------------
-- 6. Compliance notices («Antes de publicar»). Redes and the boss write and resolve them; nobody deletes them.
--    A new or edited open notice on a piece the boss already saw sends it back (the boss approved without it).
-- ---------------------------------------------------------------------------------------------------------------
create table public.piece_notices (
  id uuid primary key default gen_random_uuid(),
  piece_id uuid not null references public.pieces (id),
  kind text not null check (kind in ('written_consent', 'verify_source', 'refer_professional', 'testimonial', 'other')),
  body text not null,
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id),
  constraint piece_notices_len check (char_length(btrim(body)) between 3 and 500),
  constraint piece_notices_no_phone check (not public.text_has_phone(body))
);
create index piece_notices_open_idx on public.piece_notices (piece_id) where resolved_at is null;
select public.wire_standard_triggers('public.piece_notices', false, true);

create function public.guard_piece_notice()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;  -- the system (seed)
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.resolved_at := null;
    new.resolved_by := null;
  else
    if new.piece_id is distinct from old.piece_id or new.kind is distinct from old.kind
       or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
      raise exception 'Un aviso no cambia de pieza, tipo ni autor: pon otro.' using errcode = '42501';
    end if;
    if old.resolved_at is not null and (new.resolved_at is distinct from old.resolved_at or new.body is distinct from old.body) then
      raise exception 'Ese aviso ya está resuelto: pon otro si hace falta.' using errcode = '42501';
    end if;
    -- Otherwise the boss would find a resolved notice whose text he never saw open (notices_reopen_review skips it).
    if old.resolved_at is null and new.resolved_at is not null and new.body is distinct from old.body then
      raise exception 'Guarda el cambio del aviso y después márcalo «Resuelto».' using errcode = '42501';
    end if;
    if new.resolved_at is not null and old.resolved_at is null then
      new.resolved_at := now();
      new.resolved_by := auth.uid();
    else
      new.resolved_by := old.resolved_by;
    end if;
  end if;
  if new.body is distinct from (case when tg_op = 'UPDATE' then old.body end)
     and public.chat_author_knows_agenda(auth.uid()) and public.text_has_concrete_datetime(new.body) then
    raise exception 'Redes lee este aviso: escríbelo sin fecha ni hora.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger guard_piece_notice before insert or update on public.piece_notices
  for each row execute function public.guard_piece_notice();

-- Copy of copies_reopen_review (20261024000700_semaforo.sql): a person adds or edits an open notice.
create function public.notices_reopen_review()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or new.resolved_at is not null then return new; end if;
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
create trigger notices_reopen_review after insert or update on public.piece_notices
  for each row execute function public.notices_reopen_review();

-- ---------------------------------------------------------------------------------------------------------------
-- 7. Piece rules that are not approval: format lock, who rates and marks the design (the boss's disapproval only the
--    boss lifts), the title of a reel or a YouTube video (it goes out: YouTube and Shorts).
--    Named so it fires AFTER guard_piece_status (BEFORE triggers run in name order: audit_pieces is AFTER;
--    guard_piece_status < redes_piece_rules < soft_delete_pieces < touch_pieces).
-- ---------------------------------------------------------------------------------------------------------------
create function public.redes_piece_rules()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('app.trusted_update', true) = 'on' or auth.uid() is null then return new; end if;
  if new.format is distinct from old.format and old.current_version > 0 then
    raise exception 'El formato no cambia cuando la pieza ya tiene archivo: crea una pieza nueva en el otro formato.'
      using errcode = '42501';
  end if;
  if new.rating is distinct from old.rating or new.design_status is distinct from old.design_status
     or new.design_note is distinct from old.design_note then
    if not public.has_any_role(array['social', 'boss']::public.app_role[]) then
      raise exception 'Solo Redes y el jefe califican el diseño y la receptividad.' using errcode = '42501';
    end if;
    if old.design_status = 'disapproved'
       and (new.design_status is distinct from old.design_status or new.design_note is distinct from old.design_note)
       and not public.can_approve()
       and exists (select 1 from public.user_roles r where r.user_id = old.design_by and r.role = 'boss') then
      raise exception 'El jefe desaprobó este diseño: solo él quita o cambia esa marca.' using errcode = '42501';
    end if;
    if new.design_note is distinct from old.design_note and public.chat_author_knows_agenda(auth.uid())
       and public.text_has_concrete_datetime(new.design_note) then
      raise exception 'Redes lee la nota: escríbela sin fecha ni hora.' using errcode = 'P0001';
    end if;
  end if;
  if new.design_status is distinct from old.design_status or new.design_note is distinct from old.design_note then
    new.design_by := auth.uid();
    new.design_at := now();
    -- Disapproved after the boss's approval: what was scheduled goes back to draft (guard_publication_design refuses
    -- scheduling it again until he approves again), so no reminder and no publisher acts on a held design.
    if new.design_status = 'disapproved' and (new.approved_at is null or new.design_at > new.approved_at) then
      update public.publications
         set status = 'draft', failure_reason = 'El diseño quedó desaprobado: prográmala cuando el jefe la vuelva a aprobar.'
       where piece_id = new.id and status = 'scheduled' and deleted_at is null;
    end if;
  else
    new.design_by := old.design_by;
    new.design_at := old.design_at;
  end if;
  -- The title goes out with a YouTube video and with a reel as a Short: changing it after a file exists is a change
  -- the boss must see.
  if new.format in ('reel', 'youtube') and new.title is distinct from old.title and old.current_version > 0 then
    new.revision := new.revision + 1;
    if old.status = 'approved' then
      new.status := 'in_review';
      new.sent_to_review_at := now();
      new.review_escalated_at := null;
    end if;
  end if;
  return new;
end $$;
create trigger redes_piece_rules before update on public.pieces
  for each row execute function public.redes_piece_rules();

-- ---------------------------------------------------------------------------------------------------------------
-- 8. Delete a piece: only the boss (2FA) through remove_piece() (it empties the feed place first); restore: only
--    administración (guard_piece_month puts it in the first live month if its own is gone). Replaces the generic
--    soft_delete_pieces trigger (same name, same place in the order).
-- ---------------------------------------------------------------------------------------------------------------
create function public.guard_piece_soft_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.deleted_at is not distinct from old.deleted_at or auth.uid() is null then
    return new;
  end if;
  if old.deleted_at is not null and new.deleted_at is null and public.has_role('admin') then
    return new;  -- restore
  end if;
  if old.deleted_at is null and new.deleted_at is not null
     and current_setting('app.piece_remove', true) = 'on' and public.can_approve() then
    return new;
  end if;
  raise exception 'Eliminar una pieza es del jefe («Eliminar» en la tarjeta); recuperarla es de administración.'
    using errcode = '42501';
end $$;
drop trigger soft_delete_pieces on public.pieces;
create trigger soft_delete_pieces before update on public.pieces
  for each row execute function public.guard_piece_soft_delete();

create function public.remove_piece(p uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  t text;
begin
  if not public.can_approve() then
    raise exception 'Solo el jefe elimina una pieza.' using errcode = '42501';
  end if;
  perform set_config('app.piece_remove', 'on', true);
  update public.feed_slots set piece_id = null where piece_id = p;
  update public.pieces set deleted_at = now() where id = p and deleted_at is null returning title into t;
  perform set_config('app.piece_remove', 'off', true);
  if t is null then raise exception 'Pieza no encontrada.' using errcode = 'P0001'; end if;
  return t;  -- withdraw_publications already sent its scheduled publications back to draft
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- 9. Months and feed: functions. Invoker (RLS applies) except delete_content_month (it sets deleted_at, which no
--    policy lets a person write).
-- ---------------------------------------------------------------------------------------------------------------
create function public.feed_place_of(p uuid)
returns text language sql stable security invoker set search_path = public as $$
  select m.label || ' · #' || s.num
    from public.feed_slots s join public.content_months m on m.id = s.month_id
   where s.piece_id = p
$$;

create function public.feed_put(m uuid, pos smallint, p uuid)
returns void language plpgsql security invoker set search_path = public as $$
begin
  update public.feed_slots set piece_id = p where month_id = m and num = pos;
  if not found then raise exception 'Ese espacio del feed no existe.' using errcode = 'P0001'; end if;
end $$;

-- Lock order in every feed function: the month (FOR SHARE; delete_content_month takes it FOR UPDATE), then the place
-- rows (by number), then the piece. A deadlock that still happens (40P01) reads «vuelve a intentarlo» in the app.

-- Put a piece in place #pos of month m. Already somewhere: refused («Ya en Mes 1 · #4») unless allow_move.
-- Another piece in that place: it becomes «Sin programar» and the answer says which (read under the row lock, so two
-- people filling #7 at once are both told the truth). A piece of another month moves to m with its place.
create function public.feed_place(m uuid, pos smallint, p uuid, allow_move boolean default false)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  pc record;
  slot record;
  here text;
  replaced uuid;
  moved_from text;
begin
  if pos is null or pos not between 1 and 24 then raise exception 'El feed tiene 24 espacios.' using errcode = 'P0001'; end if;
  perform 1 from public.content_months where id = m and deleted_at is null for share;
  if not found then raise exception 'Ese mes ya no está.' using errcode = 'P0001'; end if;
  select id, piece_id into slot from public.feed_slots where month_id = m and num = pos for update;
  if slot.id is null then raise exception 'Ese espacio del feed no existe.' using errcode = 'P0001'; end if;
  select id, format, content_month_id into pc from public.pieces where id = p and deleted_at is null for update;
  if pc.id is null then raise exception 'Pieza no encontrada.' using errcode = 'P0001'; end if;
  if pc.format not in ('post', 'reel', 'carousel') then
    raise exception 'En el feed van posts, reels y carruseles.' using errcode = 'P0001';
  end if;
  if slot.piece_id is not distinct from p then
    return jsonb_build_object('was', null, 'replaced', null, 'moved_from', null);  -- already there
  end if;
  replaced := slot.piece_id;
  here := public.feed_place_of(p);
  if here is not null then
    if not allow_move then raise exception 'Ya en %', here using errcode = 'P0001'; end if;
    update public.feed_slots set piece_id = null where piece_id = p;
  end if;
  if pc.content_month_id is distinct from m then
    select label into moved_from from public.content_months where id = pc.content_month_id;
    update public.pieces set content_month_id = m where id = p;
  end if;
  perform public.feed_put(m, pos, p);
  return jsonb_build_object('was', here, 'replaced', replaced, 'moved_from', moved_from);
end $$;

-- Move a placed piece to place #pos of its own month; the piece there (if any) takes the old place. Both rows are
-- locked in number order, then the piece's place is checked again.
create function public.feed_swap(p uuid, pos smallint)
returns smallint language plpgsql security invoker set search_path = public as $$
declare
  s record;
  other uuid;
begin
  if pos is null or pos not between 1 and 24 then raise exception 'El feed tiene 24 espacios.' using errcode = 'P0001'; end if;
  select month_id, num into s from public.feed_slots where piece_id = p;
  if s.month_id is null then raise exception 'Esa pieza no está en el feed.' using errcode = 'P0001'; end if;
  if s.num = pos then return pos; end if;
  perform 1 from public.content_months where id = s.month_id and deleted_at is null for share;
  if not found then raise exception 'Ese mes ya no está.' using errcode = 'P0001'; end if;
  perform 1 from public.feed_slots where month_id = s.month_id and num in (s.num, pos) order by num for update;
  if not exists (select 1 from public.feed_slots where month_id = s.month_id and num = s.num and piece_id = p) then
    raise exception 'Otra persona movió esta pieza hace un momento: mira el feed y vuelve a intentarlo.' using errcode = 'P0001';
  end if;
  select piece_id into other from public.feed_slots where month_id = s.month_id and num = pos;
  update public.feed_slots set piece_id = other where month_id = s.month_id and num = s.num;
  perform public.feed_put(s.month_id, pos, p);
  return pos;
end $$;

-- Empty one place (pos) or the whole month (pos null). Pieces are never deleted. Returns how many places emptied.
create function public.feed_clear(m uuid, pos smallint default null)
returns int language plpgsql security invoker set search_path = public as $$
declare
  n int;
begin
  update public.feed_slots set piece_id = null
   where month_id = m and piece_id is not null and (pos is null or num = pos);
  get diagnostics n = row_count;
  return n;
end $$;

-- The card's «Mover a otro mes». If the piece was in the feed, its place moves to the lowest free number of the new
-- month (the next to go out after what is there), or it stays «Sin programar» when that month is full.
create function public.move_piece_to_month(p uuid, m uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  pc record;
  had boolean;
  free smallint;
begin
  perform 1 from public.content_months where id = m and deleted_at is null for share;
  if not found then raise exception 'Ese mes ya no está.' using errcode = 'P0001'; end if;
  perform 1 from public.feed_slots where month_id = m order by num for update;  -- the 24 places of the new month
  select id, content_month_id into pc from public.pieces where id = p and deleted_at is null for update;
  if pc.id is null then raise exception 'Pieza no encontrada.' using errcode = 'P0001'; end if;
  if pc.content_month_id is not distinct from m then
    return jsonb_build_object('num', (select num from public.feed_slots where piece_id = p), 'released', false);
  end if;
  had := exists (select 1 from public.feed_slots where piece_id = p);
  update public.feed_slots set piece_id = null where piece_id = p;
  update public.pieces set content_month_id = m where id = p;
  if had then
    select min(num) into free from public.feed_slots where month_id = m and piece_id is null;
    if free is not null then perform public.feed_put(m, free, p); end if;
  end if;
  return jsonb_build_object('num', free, 'released', had and free is null);
end $$;

-- Delete a month: Redes and the boss. Refuses the last month and a stale count; empties its places; its pieces go to
-- the first month left. Returns how many pieces moved. It locks every live month FOR UPDATE (in ordinal order).
create function public.delete_content_month(m uuid, expected int)
returns int language plpgsql security definer set search_path = public as $$
declare
  target uuid;
  n int;
begin
  if not public.has_any_role(array['social', 'boss']::public.app_role[]) then
    raise exception 'Solo Redes y el jefe borran un mes.' using errcode = '42501';
  end if;
  -- Every live month, in order: two deletes at once wait for each other, so at least one month always stays.
  perform 1 from public.content_months where deleted_at is null order by ordinal, id for update;
  perform 1 from public.content_months where id = m and deleted_at is null;
  if not found then raise exception 'Ese mes ya no está.' using errcode = 'P0001'; end if;
  select id into target from public.content_months where deleted_at is null and id <> m order by ordinal limit 1;
  if target is null then raise exception 'Debe quedar al menos un mes.' using errcode = 'P0001'; end if;
  select count(*)::int into n from public.pieces where content_month_id = m and deleted_at is null;
  if expected is distinct from n then
    raise exception 'El mes cambió: ahora tiene % pieza(s). Míralo y vuelve a intentarlo.', n using errcode = 'P0001';
  end if;
  update public.feed_slots set piece_id = null where month_id = m and piece_id is not null;
  update public.pieces set content_month_id = target where content_month_id = m;
  update public.content_months set deleted_at = now() where id = m;
  return n;
end $$;

-- A design disapproved after the boss's approval does not go out (scheduled or «Ya lo publiqué»): the boss asks for
-- changes or approves again (approved_at newer than design_at). Applies to the system too (a future publisher).
create function public.guard_publication_design()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status not in ('scheduled', 'published') or (tg_op = 'UPDATE' and new.status is not distinct from old.status) then
    return new;
  end if;
  if exists (select 1 from public.pieces p
              where p.id = new.piece_id and p.design_status = 'disapproved' and p.design_at is not null
                and (p.approved_at is null or p.design_at > p.approved_at)) then
    raise exception 'El diseño quedó desaprobado después de la aprobación: arréglalo y que el jefe lo vuelva a ver.'
      using errcode = '42501';
  end if;
  return new;
end $$;
create trigger guard_publication_design before insert or update of status on public.publications
  for each row execute function public.guard_publication_design();

-- ---------------------------------------------------------------------------------------------------------------
-- 10. Settings: shape of redes.quotas and redes.pillars (writes stay admin + 2FA: app_settings policies unchanged).
-- ---------------------------------------------------------------------------------------------------------------
create function public.guard_redes_settings()
returns trigger language plpgsql set search_path = '' as $$
declare
  v jsonb := new.value;
begin
  if new.key = 'redes.quotas' then
    if jsonb_typeof(v) <> 'object'
       or exists (select 1 from jsonb_each(v) e
                   where e.key not in ('reel', 'post', 'carousel', 'story', 'youtube')
                      or jsonb_typeof(e.value) <> 'number' or (e.value #>> '{}')::numeric <> floor((e.value #>> '{}')::numeric)
                      or (e.value #>> '{}')::numeric not between 0 and 200) then
      raise exception 'El cupo es un número entero de 0 a 200 por formato.' using errcode = 'P0001';
    end if;
  elsif new.key = 'redes.pillars' then
    if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) > 12
       or exists (select 1 from jsonb_array_elements(v) e
                   where jsonb_typeof(e) <> 'object'
                      or coalesce(e ->> 'key', '') !~ '^[a-z0-9][a-z0-9-]{0,39}$'
                      or char_length(btrim(coalesce(e ->> 'name', ''))) not between 1 and 40
                      or public.text_has_phone(coalesce(e ->> 'name', ''))
                      or coalesce(e ->> 'tone', 'neutral') not in ('neutral', 'info', 'accent', 'ok'))
       or (select count(distinct e ->> 'key') from jsonb_array_elements(v) e) <> jsonb_array_length(v) then
      raise exception 'Cada pilar lleva una clave única y un nombre de 1 a 40 letras.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger guard_redes_settings before insert or update on public.app_settings
  for each row execute function public.guard_redes_settings();

-- ---------------------------------------------------------------------------------------------------------------
-- 11. RLS and grants. Selects: the content team (the boss sees every live row). Writes: as pieces, with the boss
--     wherever Redes is. No DELETE grant anywhere; nothing to anon.
-- ---------------------------------------------------------------------------------------------------------------
alter table public.content_months enable row level security;
alter table public.feed_slots enable row level security;
alter table public.piece_details enable row level security;
alter table public.piece_notices enable row level security;

create policy content_months_select on public.content_months for select to authenticated
  using (public.is_content_team() and (deleted_at is null or public.has_role('admin')));
create policy content_months_insert on public.content_months for insert to authenticated
  with check (public.has_any_role(array['admin', 'social', 'boss']::public.app_role[]) and deleted_at is null);
create policy content_months_update on public.content_months for update to authenticated
  using (public.has_any_role(array['admin', 'social', 'boss']::public.app_role[]) and deleted_at is null)
  with check (public.has_any_role(array['admin', 'social', 'boss']::public.app_role[]) and deleted_at is null);

create policy feed_slots_select on public.feed_slots for select to authenticated using (public.is_content_team());
-- No insert policy: the 24 rows come with the month (content_month_slots).
create policy feed_slots_update on public.feed_slots for update to authenticated
  using (public.has_any_role(array['admin', 'social', 'boss']::public.app_role[]))
  with check (public.has_any_role(array['admin', 'social', 'boss']::public.app_role[]));

create policy piece_details_select on public.piece_details for select to authenticated using (public.is_content_team());
create policy piece_details_insert on public.piece_details for insert to authenticated
  with check (public.has_any_role(array['admin', 'social', 'boss']::public.app_role[]));
create policy piece_details_update on public.piece_details for update to authenticated
  using (public.has_any_role(array['admin', 'social', 'boss']::public.app_role[]))
  with check (public.has_any_role(array['admin', 'social', 'boss']::public.app_role[]));

create policy piece_notices_select on public.piece_notices for select to authenticated using (public.is_content_team());
create policy piece_notices_insert on public.piece_notices for insert to authenticated
  with check (public.has_any_role(array['social', 'boss']::public.app_role[]));
create policy piece_notices_update on public.piece_notices for update to authenticated
  using (public.has_any_role(array['social', 'boss']::public.app_role[]))
  with check (public.has_any_role(array['social', 'boss']::public.app_role[]));

grant select, insert, update on public.content_months, public.piece_details, public.piece_notices to authenticated;
grant select, update on public.feed_slots to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- 12. Function privileges (rule of 20261026001400_functions_closed_to_anon.sql)
-- ---------------------------------------------------------------------------------------------------------------
revoke all on function public.feed_place_of(uuid), public.feed_put(uuid, smallint, uuid),
  public.feed_place(uuid, smallint, uuid, boolean), public.feed_swap(uuid, smallint), public.feed_clear(uuid, smallint),
  public.move_piece_to_month(uuid, uuid), public.delete_content_month(uuid, int), public.remove_piece(uuid)
  from public, anon;
grant execute on function public.feed_place_of(uuid), public.feed_put(uuid, smallint, uuid),
  public.feed_place(uuid, smallint, uuid, boolean), public.feed_swap(uuid, smallint), public.feed_clear(uuid, smallint),
  public.move_piece_to_month(uuid, uuid), public.delete_content_month(uuid, int), public.remove_piece(uuid)
  to authenticated;
revoke all on function public.check_feed_slot(), public.check_piece_feed(), public.guard_version_slides(),
  public.guard_piece_details(), public.guard_piece_notice(), public.notices_reopen_review(), public.redes_piece_rules(),
  public.guard_piece_soft_delete(), public.guard_redes_settings(), public.guard_content_month(),
  public.content_month_slots(), public.guard_feed_slot(), public.guard_piece_month(), public.guard_piece_title(),
  public.story_details_reopen_review(), public.guard_publication_design()
  from public, anon, authenticated;
