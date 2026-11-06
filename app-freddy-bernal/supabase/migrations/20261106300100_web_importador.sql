-- Importador de la web vieja (6/11/2026, D-97, docs/PLAN-MIGRACION-Y-PRODUCCION.md): where each imported draft and
-- each imported photo came from (the old site's id and address), so that running the importer again updates only what
-- nobody touched and never downloads a photo twice; and the last gate before the public: nothing goes live with a photo
-- whose alternative text is still the importer's placeholder, or with the marks the importer left where it took out
-- personal data. Nothing here edits an earlier file.
--
--   * web_import_items: one row per imported post (site + WordPress id, unique). item_rev is web_items.rev right after
--     the importer wrote the draft: any change by a person (the draft, the address, sending it to approval) bumps rev,
--     and from then on the importer leaves that item alone; it never touches something published or archived either.
--     review_flags say what a person must look at (emails or phones taken out, embeds removed, photos without
--     alternative text, …). Written only by the importer (the system: no API role writes here); the web's people read
--     it (can_read_web) to see where a draft came from and what to check.
--   * web_import_media: one row per photo brought (site + its WordPress id or address): the library file it became.
--   * guard_web_item_ready (BEFORE INSERT/UPDATE of web_items): a snapshot being published may not freeze an image whose
--     alternative text starts with «[Por escribir]» (the importer's placeholder: the database already requires the alt
--     text and the importer never invents it), nor carry «[correo retirado]», «[teléfono retirado]» or
--     «[cédula retirada]». The same words are in src/lib/web/import-marks.ts (tests/unit/web-import-marks.test.ts).
-- No rows. Nothing for anon. Not in the Realtime publication. Not audited row by row: the items, photos and redirects
-- the importer writes are audited by their own tables' triggers.

create table public.web_import_items (
  id uuid primary key default gen_random_uuid(),
  site text not null check (site ~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$' and char_length(site) <= 120),
  source_id bigint not null check (source_id > 0),
  item_id uuid not null unique references public.web_items (id),
  source_url text not null check (source_url ~ '^https?://' and char_length(source_url) <= 1000),
  source_path text not null check (source_path ~ '^/' and char_length(source_path) <= 500),
  source_published_at timestamptz,
  source_modified_at timestamptz,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  item_rev int not null check (item_rev >= 1),
  review_flags text[] not null default '{}' check (cardinality(review_flags) <= 40),
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint web_import_items_source unique (site, source_id)
);
create trigger touch_web_import_items before update on public.web_import_items
  for each row execute function public.touch_updated_at();

create table public.web_import_media (
  id uuid primary key default gen_random_uuid(),
  site text not null check (site ~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$' and char_length(site) <= 120),
  -- «id:<WordPress attachment id>» or «url:<the photo's original address>».
  source_key text not null check (source_key ~ '^(id|url):' and char_length(source_key) <= 1000),
  source_url text not null check (source_url ~ '^https?://' and char_length(source_url) <= 1000),
  -- The old address of the file (/wp-content/uploads/…), the one its redirect answers.
  source_path text check (source_path is null or (source_path ~ '^/' and char_length(source_path) <= 500)),
  media_id uuid not null references public.web_media (id),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  constraint web_import_media_source unique (site, source_key)
);
create index web_import_media_media_idx on public.web_import_media (media_id);

-- The last gate before the public (see above). Raised with the default code (P0001), so the words reach the person.
create function public.guard_web_item_ready()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_text text;
begin
  if new.published is null then return new; end if;
  if tg_op = 'UPDATE' and new.published is not distinct from old.published
     and new.published_media is not distinct from old.published_media then
    return new;
  end if;
  if exists (select 1 from jsonb_each(new.published_media) m
              where m.value ->> 'kind' = 'image' and left(btrim(coalesce(m.value ->> 'alt', '')), 14) = '[Por escribir]') then
    raise exception 'Una foto de este contenido todavía no tiene su texto alternativo (dice «[Por escribir]»): escríbelo en la biblioteca antes de publicar.';
  end if;
  v_text := new.published::text;
  if strpos(v_text, '[correo retirado]') > 0 or strpos(v_text, '[teléfono retirado]') > 0 or strpos(v_text, '[cédula retirada]') > 0 then
    raise exception 'El texto todavía tiene una marca del importador («[correo retirado]», «[teléfono retirado]» o «[cédula retirada]»): reescribe esa frase antes de publicar.';
  end if;
  return new;
end $$;
create trigger guard_web_item_ready before insert or update on public.web_items
  for each row execute function public.guard_web_item_ready();

alter table public.web_import_items enable row level security;
alter table public.web_import_media enable row level security;
revoke all on public.web_import_items, public.web_import_media from public, anon, authenticated;
-- The web's people (the editor, the publisher, the boss and Administración, with 2FA) see where a draft came from.
grant select on public.web_import_items, public.web_import_media to authenticated;
create policy web_import_items_select on public.web_import_items for select to authenticated using (public.can_read_web());
create policy web_import_media_select on public.web_import_media for select to authenticated using (public.can_read_web());

revoke all on function public.guard_web_item_ready() from public, anon, authenticated;
