-- Web pública (6/11/2026, D-90 to D-96): the governor's new public website, built inside this app, and its content
-- management. Nothing here edits an earlier file. Citizen participation is 20261106000200_participacion.sql; the
-- functions a citizen calls without an account are 20261106000300_citizen.sql.
--
--   * Roles (D-93). The phase-3 roles become assignable: writer («Editor de la web»), web_publisher («Aprobador de la
--     web»), attention_coordinator, reports_operator («Responsable de área»), complaints_operator and auditor. aid_operator
--     stays unused, the retired ones stay retired. Administración never holds the publisher's or a case role in the same
--     account (it never publishes and never reads a case, D-93), as it never holds the boss's or despacho's (D-41).
--   * Every gate of the web and of the attention desk asks for the second factor ITSELF (is_aal2()), not through the
--     editable list 'security.mfa_roles' (the lesson of can_approve(), 20261027001650_approval_gate_fixes.sql). The
--     list still names these roles, so the app asks them to set it up.
--   * Content (D-90, §3): web_items holds the draft (what the editors work on) and the published snapshot (exactly what
--     was approved, the only thing the public reads). Only the web_publisher or the boss publish, schedule, archive and
--     restore, through the functions below; a person's update touches the draft, the address and the review state only
--     (guard_web_item). Every saved draft is a row of web_versions (append-only). The photos and files a snapshot names
--     are frozen into it at publish time (published_media: key, alt text, caption, credit, focal point), so editing the
--     library never changes a live page and the public never reads web_media.
--   * The public reads with RLS too (D-96): the role anon gets column privileges on the public columns and a policy for
--     what is published (never a draft, never a scheduled item before its time, never an archived one): web_items,
--     web_settings (public rows), web_redirects, territories (active). Nothing else in public: no table privilege, no
--     function (tests/rls/rls-everywhere.test.ts and hosted-defaults.test.ts list exactly these columns).
--   * Territories (§4, D-35): municipalities from the client's config and parishes only when the official list exists;
--     editable by Administración, never deleted (active = false). The internal panel keeps reading the settings
--     'municipalities' and 'parishes' (check_territory), loaded from the same config.
-- No rows (the client's seed brings the catalogues and the skeleton pages), nothing new in the Realtime publication.

-- ---------------------------------------------------------------------------------------------------------------
-- 1. Roles: the web's and the attention desk's can be given; Administración apart
-- ---------------------------------------------------------------------------------------------------------------
alter table public.user_roles drop constraint user_roles_assignable;
alter table public.user_roles add constraint user_roles_assignable
  check (role in ('admin', 'boss', 'dispatch', 'politics', 'ivt', 'camera', 'social',
                  'writer', 'web_publisher', 'attention_coordinator', 'reports_operator', 'complaints_operator', 'auditor'));

create or replace function public.guard_invitation_roles()
returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from unnest(new.roles) r
              where r::text not in ('admin', 'boss', 'dispatch', 'politics', 'ivt', 'camera', 'social', 'writer', 'web_publisher',
                                    'attention_coordinator', 'reports_operator', 'complaints_operator', 'auditor')) then
    raise exception 'Ese rol ya no se usa. Los roles son: jefe, despacho, política, IVT, grabación, redes, administración, y los de la web y la atención ciudadana.'
      using errcode = '42501';
  end if;
  if 'admin' = any (new.roles::text[]) and new.roles::text[] && array['boss', 'dispatch'] then
    raise exception 'Administración no puede ser también el jefe ni el despacho: invita otra cuenta.' using errcode = '42501';
  end if;
  if 'admin' = any (new.roles::text[])
     and new.roles::text[] && array['web_publisher', 'attention_coordinator', 'reports_operator', 'complaints_operator', 'auditor'] then
    raise exception 'Administración no publica la web ni lee las solicitudes ciudadanas: invita otra cuenta.' using errcode = '42501';
  end if;
  return new;
end $$;

-- The boss and despacho first (the more specific reason, as before); then the web's publisher and the case roles.
create or replace function public.guard_role_mix()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.user_roles ur where ur.user_id = new.user_id and ur.role = 'admin') then
    if exists (select 1 from public.user_roles ur where ur.user_id = new.user_id and ur.role in ('boss', 'dispatch')) then
      raise exception 'Administración no puede ser también el jefe ni el despacho: usa otra cuenta.' using errcode = '42501';
    end if;
    if exists (select 1 from public.user_roles ur where ur.user_id = new.user_id
                and ur.role in ('web_publisher', 'attention_coordinator', 'reports_operator', 'complaints_operator', 'auditor')) then
      raise exception 'Administración no publica la web ni lee las solicitudes ciudadanas: usa otra cuenta.' using errcode = '42501';
    end if;
  end if;
  return null;
end $$;

-- A stale invitation never makes a sign-up fail: only the roles that can be given are copied.
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
     where r::text in ('admin', 'boss', 'dispatch', 'politics', 'ivt', 'camera', 'social', 'writer', 'web_publisher',
                       'attention_coordinator', 'reports_operator', 'complaints_operator', 'auditor')
    on conflict do nothing;
    update public.invitations set accepted_at = now() where id = inv.id;
  end if;
  return new;
end $$;

-- The two-factor list names the new roles where it already exists (a real project; the demo and the tests seed it
-- afterwards from config/clients/fb.json, which carries them). The gates below do not depend on it.
update public.app_settings s
   set value = (select jsonb_agg(r order by r) from (
                  select jsonb_array_elements_text(s.value) as r
                  union select unnest(array['writer', 'web_publisher', 'attention_coordinator', 'reports_operator',
                                            'complaints_operator', 'auditor'])) t),
       updated_at = now()
 where s.key = 'security.mfa_roles' and jsonb_typeof(s.value) = 'array'
   and not (s.value ?& array['writer', 'web_publisher', 'attention_coordinator', 'reports_operator', 'complaints_operator', 'auditor']);

-- ---------------------------------------------------------------------------------------------------------------
-- 2. The second factor and the web's gates
-- ---------------------------------------------------------------------------------------------------------------
-- A session that passed the second factor. Read from the token itself, never from the editable list.
create function public.is_aal2()
returns boolean language sql stable set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
$$;

-- Writes drafts and the media library: the editor, the publisher and the boss.
create function public.can_edit_web()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_aal2() and public.has_any_role(array['writer', 'web_publisher', 'boss']::public.app_role[])
$$;

-- Publishes, schedules, archives and restores: the publisher and the boss (D-93). Administración never.
create function public.can_publish_web()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_aal2() and public.has_any_role(array['web_publisher', 'boss']::public.app_role[])
$$;

-- Reads drafts, versions and the library: whoever edits or publishes, and Administración (it keeps the site running).
create function public.can_read_web()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_aal2() and public.has_any_role(array['writer', 'web_publisher', 'boss', 'admin']::public.app_role[])
$$;

-- The site's settings and redirects: Administración, the publisher and the boss.
create function public.can_manage_site()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_aal2() and public.has_any_role(array['admin', 'web_publisher', 'boss']::public.app_role[])
$$;

-- Catalogues (territories, areas and their people, request categories): Administración.
create function public.can_manage_catalogs()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_aal2() and public.has_role('admin')
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Territories: municipalities and, when the official list arrives, their parishes
-- ---------------------------------------------------------------------------------------------------------------
create table public.territories (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('municipality', 'parish')),
  parent_id uuid references public.territories (id),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint territories_parent check ((kind = 'municipality') = (parent_id is null))
);
create unique index territories_name_unique on public.territories
  (coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
create unique index territories_slug_unique on public.territories
  (coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), slug);
create index territories_parent_idx on public.territories (parent_id, sort) where parent_id is not null;
select public.wire_standard_triggers('public.territories', false, true);

-- A parish lives in a municipality; a territory never changes kind. Raised with P0001 so the text reaches the person.
create function public.guard_territory()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.name := regexp_replace(btrim(new.name), '\s+', ' ', 'g');
  if tg_op = 'UPDATE' and new.kind is distinct from old.kind then
    raise exception 'Un municipio no se vuelve parroquia ni al revés.';
  end if;
  if new.parent_id is not null
     and not exists (select 1 from public.territories t where t.id = new.parent_id and t.kind = 'municipality') then
    raise exception 'Una parroquia va dentro de un municipio.';
  end if;
  return new;
end $$;
create trigger guard_territory before insert or update on public.territories
  for each row execute function public.guard_territory();

-- ---------------------------------------------------------------------------------------------------------------
-- 4. Content: items (draft and published snapshot), their versions and the media library
-- ---------------------------------------------------------------------------------------------------------------
-- status is the draft's place in the flow: draft (being edited) → in_review (sent to approval) → published, or
-- scheduled (approved, goes live at publish_at), or archived (hidden). An item that is live keeps its snapshot while
-- its draft goes back to 'draft' with new changes. The snapshot's shape is the app's (src/lib/web/schema.ts): the
-- filters below are read from its top-level keys title, excerpt, date, municipalityId, category and state.
create table public.web_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('page', 'news', 'project', 'episode', 'document', 'notice', 'faq', 'indicator')),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 120),
  status text not null default 'draft' check (status in ('draft', 'in_review', 'scheduled', 'published', 'archived')),
  draft jsonb not null default '{}'::jsonb check (jsonb_typeof(draft) = 'object' and octet_length(draft::text) <= 524288),
  draft_version int not null default 0,
  review_note text check (review_note is null or char_length(review_note) between 1 and 1000),
  submitted_at timestamptz,
  submitted_by uuid references public.profiles (id),
  published jsonb check (published is null or jsonb_typeof(published) = 'object'),
  published_version int,
  published_media jsonb not null default '{}'::jsonb check (jsonb_typeof(published_media) = 'object'),
  publish_at timestamptz,
  published_at timestamptz,
  published_by uuid references public.profiles (id),
  archived_at timestamptz,
  archived_by uuid references public.profiles (id),
  -- Filters of the published snapshot, set when it is published (never by hand).
  municipality_id uuid references public.territories (id),
  category text check (category is null or char_length(category) <= 80),
  state text check (state is null or char_length(state) <= 40),
  display_date date,
  search text not null default '',
  rev int not null default 1,
  created_by uuid references public.profiles (id) default auth.uid(),
  updated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint web_items_slug_unique unique (kind, slug),
  constraint web_items_published_shape check ((published is null) = (publish_at is null)
                                              and (published is null) = (published_version is null)),
  constraint web_items_archived_status check ((archived_at is not null) = (status = 'archived'))
);
create index web_items_public_idx on public.web_items (kind, display_date desc, publish_at desc)
  where published is not null and archived_at is null;
create index web_items_status_idx on public.web_items (kind, status, updated_at desc);

-- Every saved draft, as it was: the history and «Volver a esta versión» (which copies one back into the draft, never
-- into what is published). Written by trigger; never changed or deleted.
create table public.web_versions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.web_items (id),
  version_no int not null check (version_no >= 1),
  slug text not null,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  note text check (note is null or char_length(note) between 1 and 300),
  author_id uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (item_id, version_no)
);

-- The public media library (bucket web-public). The file is what it is: its key, type, size and dimensions never
-- change. Images always carry their alternative text (D: «texto alternativo obligatorio», in the database).
create table public.web_media (
  id uuid primary key default gen_random_uuid(),
  storage_key text not null unique
    check (storage_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|avif|pdf)$'),
  kind text not null check (kind in ('image', 'document')),
  mime text not null check (mime in ('image/jpeg', 'image/png', 'image/webp', 'image/avif', 'application/pdf')),
  bytes bigint not null check (bytes between 1 and 26214400),
  width int check (width between 1 and 20000),
  height int check (height between 1 and 20000),
  alt text not null default '' check (char_length(alt) <= 300),
  caption text not null default '' check (char_length(caption) <= 500),
  credit text not null default '' check (char_length(credit) <= 200),
  title text not null default '' check (char_length(title) <= 200),
  focal_x numeric(4, 3) not null default 0.5 check (focal_x between 0 and 1),
  focal_y numeric(4, 3) not null default 0.5 check (focal_y between 0 and 1),
  archived_at timestamptz,
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint web_media_kind_mime check ((kind = 'image') = (mime like 'image/%')),
  constraint web_media_key_mime check (substring(storage_key from '\.([a-z]+)$') = case mime
    when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' when 'image/avif' then 'avif' else 'pdf' end),
  constraint web_media_image_alt check (kind <> 'image' or char_length(btrim(alt)) >= 3),
  constraint web_media_image_size check (kind <> 'image' or (width is not null and height is not null)),
  constraint web_media_document_title check (kind <> 'document' or char_length(btrim(title)) >= 3)
);
create index web_media_library_idx on public.web_media (created_at desc) where archived_at is null;

-- What a person may do to an item: the draft, the address (only while it was never published, unless they publish)
-- and draft ↔ in_review. Everything published (snapshot, dates, filters, archive) only through the functions of
-- section 6 (app.trusted_update) or the system. Changing the draft bumps its version and, on a live item, sends the
-- draft back to work while the snapshot stays live.
create function public.guard_web_item()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_trusted boolean := coalesce(current_setting('app.trusted_update', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null and not v_trusted then
      if new.status not in ('draft', 'in_review') or new.published is not null or new.published_version is not null
         or new.published_media <> '{}'::jsonb or new.publish_at is not null or new.published_at is not null
         or new.published_by is not null or new.archived_at is not null or new.archived_by is not null
         or new.municipality_id is not null or new.category is not null or new.state is not null
         or new.display_date is not null or new.search <> '' or new.review_note is not null then
        raise exception 'Un contenido nuevo empieza como borrador: sale a la web con «Publicar».' using errcode = '42501';
      end if;
      new.created_by := auth.uid();
      new.created_at := now();
    end if;
    new.draft_version := 1;
    new.submitted_at := case when new.status = 'in_review' then now() end;
    new.submitted_by := case when new.status = 'in_review' then auth.uid() end;
    return new;
  end if;
  if new.id is distinct from old.id or new.kind is distinct from old.kind or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'El tipo, el autor y la fecha de creación de un contenido no se cambian.' using errcode = '42501';
  end if;
  if auth.uid() is not null and not v_trusted then
    if (new.published, new.published_version, new.published_media, new.publish_at, new.published_at, new.published_by,
        new.archived_at, new.archived_by, new.municipality_id, new.category, new.state, new.display_date, new.search,
        new.review_note, new.draft_version, new.submitted_at, new.submitted_by)
       is distinct from
       (old.published, old.published_version, old.published_media, old.publish_at, old.published_at, old.published_by,
        old.archived_at, old.archived_by, old.municipality_id, old.category, old.state, old.display_date, old.search,
        old.review_note, old.draft_version, old.submitted_at, old.submitted_by) then
      raise exception 'Lo publicado solo cambia con «Publicar», «Programar» o «Archivar».' using errcode = '42501';
    end if;
    if new.status is distinct from old.status and new.status not in ('draft', 'in_review') then
      raise exception 'Publicar, programar y archivar se hacen con sus botones.' using errcode = '42501';
    end if;
    if new.status is distinct from old.status and old.status = 'archived' then
      raise exception 'Un contenido archivado vuelve con «Desarchivar» o al publicarlo de nuevo.' using errcode = '42501';
    end if;
    if new.slug is distinct from old.slug and old.published is not null and not public.can_publish_web() then
      raise exception 'La dirección de algo ya publicado la cambia quien publica (y deja una redirección).' using errcode = '42501';
    end if;
  end if;
  if new.draft is distinct from old.draft then
    new.draft_version := old.draft_version + 1;
    if not v_trusted and new.status in ('scheduled', 'published') then new.status := 'draft'; end if;
  end if;
  if new.status = 'in_review' and old.status is distinct from 'in_review' then
    new.submitted_at := now();
    new.submitted_by := auth.uid();
    new.review_note := null;
  end if;
  return new;
end $$;

-- One row of web_versions per saved draft. A note for it comes from set_config('app.version_note', …, true).
create function public.web_item_version()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.draft is distinct from old.draft then
    insert into public.web_versions (item_id, version_no, slug, snapshot, note, author_id)
    values (new.id, new.draft_version, new.slug, new.draft,
            left(nullif(btrim(coalesce(current_setting('app.version_note', true), '')), ''), 300), auth.uid());
    perform set_config('app.version_note', '', true);
  end if;
  return null;
end $$;

-- A file stays the file it is; the words around it (alt, caption, credit, title, focal point) and the archive mark
-- change. Archiving takes it out of the library's picker: pages already published keep their frozen copy.
create function public.guard_web_media()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.created_by := auth.uid();
      new.created_at := now();
      new.archived_at := null;
    end if;
    return new;
  end if;
  if (new.id, new.storage_key, new.kind, new.mime, new.bytes, new.width, new.height, new.created_by, new.created_at)
     is distinct from (old.id, old.storage_key, old.kind, old.mime, old.bytes, old.width, old.height, old.created_by, old.created_at) then
    raise exception 'Un archivo subido no se reemplaza: súbelo otra vez.' using errcode = '42501';
  end if;
  return new;
end $$;

-- The history of the web and of the cases is never rewritten or deleted (for the system too).
create function public.history_append_only()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'El historial no se borra ni se cambia.' using errcode = '42501';
end $$;

-- BEFORE triggers fire by name: the guard (it sees what the person sent), then rev, updated_by and updated_at.
create trigger guard_web_item before insert or update on public.web_items
  for each row execute function public.guard_web_item();
create trigger rev_web_items before insert or update on public.web_items
  for each row execute function public.bump_rev();
create trigger stamp_updated_by_web_items before insert or update on public.web_items
  for each row execute function public.stamp_updated_by();
create trigger touch_web_items before update on public.web_items
  for each row execute function public.touch_updated_at();
create trigger web_item_version after insert or update on public.web_items
  for each row execute function public.web_item_version();
create trigger web_versions_append_only before update or delete on public.web_versions
  for each row execute function public.history_append_only();
create trigger web_versions_no_truncate before truncate on public.web_versions
  for each statement execute function public.history_append_only();
create trigger guard_web_media before insert or update on public.web_media
  for each row execute function public.guard_web_media();
create trigger touch_web_media before update on public.web_media
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------------------------------------------
-- 5. The site: settings (all public by default) and redirects of old addresses
-- ---------------------------------------------------------------------------------------------------------------
-- Navigation, footer, institutional contacts (verified only), social accounts, WhatsApp channel, institutional portal,
-- structured data, the demo banner. A value is live when saved (it is configuration, not an article); anon reads the
-- rows marked public. Something that must not be public goes with is_public = false or in app_settings.
create table public.web_settings (
  key text primary key check (key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$' and char_length(key) <= 80),
  value jsonb not null check (octet_length(value::text) <= 65536),
  is_public boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);
select public.wire_standard_triggers('public.web_settings', false, true);
create trigger stamp_updated_by_web_settings before insert or update on public.web_settings
  for each row execute function public.stamp_updated_by();

-- Old address → new one (301 by default), applied by the app before rendering. Internal targets only (no open
-- redirect: never another site, never //host). Filled by the importer (source 'importador', the system) or by hand.
create table public.web_redirects (
  id uuid primary key default gen_random_uuid(),
  from_path text not null unique check (from_path ~ '^/[^#[:space:]\\]*$' and char_length(from_path) between 2 and 500),
  to_path text not null check (to_path ~ '^/[^[:space:]\\]*$' and to_path !~ '^//' and char_length(to_path) <= 500),
  status_code smallint not null default 301 check (status_code in (301, 302, 307, 308)),
  source text not null default 'manual' check (source in ('importador', 'manual')),
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint web_redirects_not_self check (from_path <> to_path)
);
select public.wire_standard_triggers('public.web_redirects', false, true);

-- ---------------------------------------------------------------------------------------------------------------
-- 6. Publishing: the only ways something reaches the public
-- ---------------------------------------------------------------------------------------------------------------
-- «Publicar» (p_publish_at null or now) or «Programar» (a future time): the draft the publisher looked at
-- (p_expected_rev; if someone changed it since, refuse) becomes the published snapshot, with its photos frozen. An item
-- already live is updated now, never scheduled (one snapshot per item: scheduling it would take the live one down until
-- then). Returns the time it goes (went) live. The system (a seed, no person) may publish too.
create function public.publish_web_item(p_id uuid, p_expected_rev int, p_publish_at timestamptz default null)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  it public.web_items;
  v_at timestamptz := coalesce(p_publish_at, now());
  v_snapshot jsonb;
  v_media jsonb;
  v_archived int;
  v_muni uuid;
  v_date date;
  v_tz text := coalesce((select value #>> '{}' from public.app_settings where key = 'app.timezone'), 'America/Caracas');
begin
  if auth.uid() is not null and not public.can_publish_web() then
    raise exception 'Publica quien aprueba la web o el jefe, con doble factor.' using errcode = '42501';
  end if;
  select * into it from public.web_items where id = p_id for update;
  if it.id is null then raise exception 'No encontramos ese contenido.'; end if;
  if p_expected_rev is not null and p_expected_rev <> it.rev then
    raise exception 'El contenido cambió mientras lo revisabas. Ábrelo de nuevo.';
  end if;
  if coalesce(btrim(it.draft ->> 'title'), '') = '' then raise exception 'Falta el título.'; end if;
  if v_at < now() - interval '1 minute' then
    raise exception 'Esa hora ya pasó: elige una hora futura o publica ahora.';
  end if;
  if v_at > now() + interval '1 minute' and it.published is not null and it.archived_at is null and it.publish_at <= now() then
    raise exception 'Este contenido ya está publicado: publica los cambios ahora, o archívalo antes de programarlo.';
  end if;
  v_snapshot := it.draft;
  -- Every library file the snapshot names (any string that is a web_media id, at any depth), frozen as it is now.
  select coalesce(jsonb_object_agg(m.id::text, jsonb_build_object(
           'key', m.storage_key, 'kind', m.kind, 'mime', m.mime, 'bytes', m.bytes, 'width', m.width, 'height', m.height,
           'alt', m.alt, 'caption', m.caption, 'credit', m.credit, 'title', m.title,
           'focalX', m.focal_x, 'focalY', m.focal_y)), '{}'::jsonb),
         count(*) filter (where m.archived_at is not null)
    into v_media, v_archived
    from public.web_media m
   where m.id::text in (select x #>> '{}' from jsonb_path_query(v_snapshot, 'strict $.** ? (@.type() == "string")') x
                         where (x #>> '{}') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
  if v_archived > 0 then
    raise exception 'Una foto o un archivo de este contenido está archivado en la biblioteca: cámbialo antes de publicar.';
  end if;
  if (v_snapshot ->> 'municipalityId') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select t.id into v_muni from public.territories t where t.id = (v_snapshot ->> 'municipalityId')::uuid and t.kind = 'municipality';
  end if;
  begin
    v_date := case when (v_snapshot ->> 'date') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then (v_snapshot ->> 'date')::date end;
  exception when others then
    v_date := null;
  end;
  perform set_config('app.trusted_update', 'on', true);
  update public.web_items set
    published = v_snapshot,
    published_version = it.draft_version,
    published_media = v_media,
    publish_at = v_at,
    published_at = now(),
    published_by = auth.uid(),
    archived_at = null,
    archived_by = null,
    review_note = null,
    status = case when v_at > now() then 'scheduled' else 'published' end,
    municipality_id = v_muni,
    category = left(nullif(btrim(v_snapshot ->> 'category'), ''), 80),
    state = left(nullif(btrim(v_snapshot ->> 'state'), ''), 40),
    display_date = coalesce(v_date, (v_at at time zone v_tz)::date),
    search = left(coalesce((select public.assistant_plain(string_agg(x #>> '{}', ' '))
                              from jsonb_path_query(v_snapshot, 'strict $.** ? (@.type() == "string")') x
                             where (x #>> '{}') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-' and (x #>> '{}') !~ '^https?://'), ''), 20000)
  where id = p_id;
  perform set_config('app.trusted_update', 'off', true);
  return v_at;
end $$;

-- «Pedir cambios»: the publisher sends a draft in review back to the editors, with a note.
create function public.return_web_item(p_id uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare
  it public.web_items;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.can_publish_web() then
    raise exception 'Pide cambios quien aprueba la web o el jefe, con doble factor.' using errcode = '42501';
  end if;
  if v_note is null or char_length(v_note) > 1000 then raise exception 'Escribe qué hay que cambiar (hasta 1000 letras).'; end if;
  select * into it from public.web_items where id = p_id for update;
  if it.id is null or it.status <> 'in_review' then raise exception 'Ese contenido no está esperando aprobación.'; end if;
  perform set_config('app.trusted_update', 'on', true);
  update public.web_items set status = 'draft', review_note = v_note where id = p_id;
  perform set_config('app.trusted_update', 'off', true);
end $$;

-- «Quitar la programación»: an item scheduled and not live yet goes back to draft, nothing reaches the public.
create function public.cancel_web_schedule(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  it public.web_items;
begin
  if not public.can_publish_web() then
    raise exception 'La programación la quita quien aprueba la web o el jefe, con doble factor.' using errcode = '42501';
  end if;
  select * into it from public.web_items where id = p_id for update;
  if it.id is null or it.published is null or it.publish_at <= now() then raise exception 'Ese contenido no está programado.'; end if;
  perform set_config('app.trusted_update', 'on', true);
  update public.web_items set published = null, published_version = null, published_media = '{}'::jsonb, publish_at = null,
         published_at = null, published_by = null, status = 'draft', municipality_id = null, category = null, state = null,
         display_date = null, search = ''
   where id = p_id;
  perform set_config('app.trusted_update', 'off', true);
end $$;

-- «Archivar»: out of the public site at once (the snapshot and the history stay).
create function public.archive_web_item(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  it public.web_items;
begin
  if not public.can_publish_web() then
    raise exception 'Archiva quien aprueba la web o el jefe, con doble factor.' using errcode = '42501';
  end if;
  select * into it from public.web_items where id = p_id for update;
  if it.id is null then raise exception 'No encontramos ese contenido.'; end if;
  if it.archived_at is not null then return; end if;
  perform set_config('app.trusted_update', 'on', true);
  update public.web_items set archived_at = now(), archived_by = auth.uid(), status = 'archived' where id = p_id;
  perform set_config('app.trusted_update', 'off', true);
end $$;

-- «Desarchivar»: the approved snapshot it had comes back as it was (scheduled if its time has not come).
create function public.unarchive_web_item(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  it public.web_items;
begin
  if not public.can_publish_web() then
    raise exception 'Desarchiva quien aprueba la web o el jefe, con doble factor.' using errcode = '42501';
  end if;
  select * into it from public.web_items where id = p_id for update;
  if it.id is null or it.archived_at is null then raise exception 'Ese contenido no está archivado.'; end if;
  perform set_config('app.trusted_update', 'on', true);
  update public.web_items set archived_at = null, archived_by = null,
         status = case when it.published is null or it.draft is distinct from it.published then 'draft'
                       when it.publish_at > now() then 'scheduled' else 'published' end
   where id = p_id;
  perform set_config('app.trusted_update', 'off', true);
end $$;

-- «Volver a esta versión»: copies that version into the DRAFT (a new version), never into what is published. Whoever
-- edits may do it (it publishes nothing).
create function public.restore_web_version(p_id uuid, p_version int)
returns int language plpgsql security definer set search_path = public as $$
declare
  it public.web_items;
  v public.web_versions;
begin
  if not public.can_edit_web() then
    raise exception 'Vuelve a una versión quien edita la web, con doble factor.' using errcode = '42501';
  end if;
  select * into it from public.web_items where id = p_id for update;
  if it.id is null then raise exception 'No encontramos ese contenido.'; end if;
  select * into v from public.web_versions where item_id = p_id and version_no = p_version;
  if v.id is null then raise exception 'Esa versión no existe.'; end if;
  if it.archived_at is not null then raise exception 'Desarchívalo antes de cambiar su borrador.'; end if;
  perform set_config('app.version_note', 'Vuelta a la versión ' || p_version, true);
  update public.web_items set draft = v.snapshot, status = 'draft' where id = p_id;
  return (select draft_version from public.web_items where id = p_id);
end $$;

-- For the cron (system): scheduled items whose time came read «Publicado» in the panel (the public already sees them,
-- by publish_at). Returns how many changed.
create function public.web_items_flip_scheduled()
returns int language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  perform set_config('app.trusted_update', 'on', true);
  update public.web_items set status = 'published' where status = 'scheduled' and publish_at <= now() and archived_at is null;
  get diagnostics n = row_count;
  perform set_config('app.trusted_update', 'off', true);
  return n;
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- 7. Audit. Items and versions keep who, when, which version and which fields changed, without the content (the
--    versions are the content's history); the rest of the web's tables use the standard trail (wired above).
-- ---------------------------------------------------------------------------------------------------------------
create function public.audit_web_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_drop constant text[] := case tg_table_name when 'web_items' then array['draft', 'published', 'published_media', 'search']
                                               else array['snapshot'] end;
  v_fields jsonb;
begin
  if tg_op = 'UPDATE' and v_new = v_old then return null; end if;
  select coalesce(jsonb_agg(k order by k), '[]'::jsonb) into v_fields
    from unnest(v_drop) k
   where case when tg_op = 'UPDATE' then (v_new -> k) is distinct from (v_old -> k) else coalesce(v_new, v_old) ? k end;
  insert into public.audit_log (actor_id, table_name, row_id, action, old_data, new_data)
  values (auth.uid(), tg_table_name, coalesce(v_new ->> 'id', v_old ->> 'id'), lower(tg_op),
          v_old - v_drop, case when v_new is null then null else (v_new - v_drop) || jsonb_build_object('content_fields', v_fields) end);
  return null;
end $$;
create trigger audit_web_items after insert or update or delete on public.web_items
  for each row execute function public.audit_web_row();
create trigger audit_web_versions after insert on public.web_versions
  for each row execute function public.audit_web_row();
select public.wire_standard_triggers('public.web_media', false, false);

-- ---------------------------------------------------------------------------------------------------------------
-- 8. RLS and privileges. Nobody deletes content (archive) nor a territory (active = false); redirects are deleted by
--    who manages the site (audited). anon: the public columns of what is published, nothing else.
-- ---------------------------------------------------------------------------------------------------------------
alter table public.territories enable row level security;
alter table public.web_items enable row level security;
alter table public.web_versions enable row level security;
alter table public.web_media enable row level security;
alter table public.web_settings enable row level security;
alter table public.web_redirects enable row level security;

revoke all on public.territories, public.web_items, public.web_versions, public.web_media, public.web_settings,
  public.web_redirects from public, anon, authenticated;

-- Territories: every person of the staff reads them (forms, filters); Administración keeps them.
grant select on public.territories to authenticated;
grant insert (kind, parent_id, name, slug, sort, active), update (parent_id, name, slug, sort, active)
  on public.territories to authenticated;
create policy territories_select on public.territories for select to authenticated using (public.is_staff());
create policy territories_insert on public.territories for insert to authenticated with check (public.can_manage_catalogs());
create policy territories_update on public.territories for update to authenticated
  using (public.can_manage_catalogs()) with check (public.can_manage_catalogs());

-- Items: the web's people read everything (drafts too); editors write the draft; the rest goes through section 6.
grant select on public.web_items to authenticated;
grant insert (kind, slug, status, draft), update (slug, status, draft) on public.web_items to authenticated;
create policy web_items_select on public.web_items for select to authenticated using (public.can_read_web());
create policy web_items_insert on public.web_items for insert to authenticated
  with check (public.can_edit_web() and created_by = auth.uid());
create policy web_items_update on public.web_items for update to authenticated
  using (public.can_edit_web()) with check (public.can_edit_web());

grant select on public.web_versions to authenticated;
create policy web_versions_select on public.web_versions for select to authenticated using (public.can_read_web());

grant select on public.web_media to authenticated;
grant insert (storage_key, kind, mime, bytes, width, height, alt, caption, credit, title, focal_x, focal_y),
      update (alt, caption, credit, title, focal_x, focal_y, archived_at) on public.web_media to authenticated;
create policy web_media_select on public.web_media for select to authenticated using (public.can_read_web());
create policy web_media_insert on public.web_media for insert to authenticated
  with check (public.can_edit_web() and created_by = auth.uid());
create policy web_media_update on public.web_media for update to authenticated
  using (public.can_edit_web()) with check (public.can_edit_web());

grant select on public.web_settings to authenticated;
grant insert (key, value, is_public), update (value, is_public) on public.web_settings to authenticated;
create policy web_settings_select on public.web_settings for select to authenticated
  using (is_public or public.can_read_web() or public.can_manage_site());
create policy web_settings_insert on public.web_settings for insert to authenticated with check (public.can_manage_site());
create policy web_settings_update on public.web_settings for update to authenticated
  using (public.can_manage_site()) with check (public.can_manage_site());

grant select, delete on public.web_redirects to authenticated;
grant insert (from_path, to_path, status_code), update (to_path, status_code) on public.web_redirects to authenticated;
create policy web_redirects_select on public.web_redirects for select to authenticated
  using (public.can_read_web() or public.can_manage_site());
create policy web_redirects_insert on public.web_redirects for insert to authenticated with check (public.can_manage_site());
create policy web_redirects_update on public.web_redirects for update to authenticated
  using (public.can_manage_site()) with check (public.can_manage_site());
create policy web_redirects_delete on public.web_redirects for delete to authenticated using (public.can_manage_site());

-- anon (the public site, D-96). Inline policies: anon executes no function of public.
grant select (id, kind, parent_id, name, slug, sort) on public.territories to anon;
create policy territories_public on public.territories for select to anon using (active);
grant select (id, kind, slug, published, published_version, published_media, publish_at, published_at, municipality_id,
              category, state, display_date, search) on public.web_items to anon;
create policy web_items_public on public.web_items for select to anon
  using (published is not null and archived_at is null and publish_at <= now());
grant select (key, value, updated_at) on public.web_settings to anon;
create policy web_settings_public on public.web_settings for select to anon using (is_public);
grant select (from_path, to_path, status_code) on public.web_redirects to anon;
create policy web_redirects_public on public.web_redirects for select to anon using (true);

-- ---------------------------------------------------------------------------------------------------------------
-- 9. Storage (only on a real Supabase project): the public library and the private participation files. No storage
--    policy on either: the server uploads with its own key after checking the file (type by magic bytes, size,
--    metadata stripped); the public bucket is read through its public address, the private one only through the
--    app's authorized routes (short signed links). The in-memory demo database skips this block.
-- ---------------------------------------------------------------------------------------------------------------
do $outer$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('web-public', 'web-public', true, 26214400),
           ('participacion-privado', 'participacion-privado', false, 8388608)
    on conflict (id) do nothing;
  end if;
end
$outer$;

-- ---------------------------------------------------------------------------------------------------------------
-- 10. Function privileges (rule of 20261026001400_functions_closed_to_anon.sql). CREATE OR REPLACE keeps grants; they
--     are stated again so this file reads on its own.
-- ---------------------------------------------------------------------------------------------------------------
revoke all on function public.guard_invitation_roles(), public.guard_role_mix(), public.handle_new_auth_user(),
  public.guard_territory(), public.guard_web_item(), public.web_item_version(), public.guard_web_media(),
  public.history_append_only(), public.audit_web_row(), public.web_items_flip_scheduled()
  from public, anon, authenticated;
revoke all on function public.is_aal2(), public.can_edit_web(), public.can_publish_web(), public.can_read_web(),
  public.can_manage_site(), public.can_manage_catalogs(), public.publish_web_item(uuid, int, timestamptz),
  public.return_web_item(uuid, text), public.cancel_web_schedule(uuid), public.archive_web_item(uuid),
  public.unarchive_web_item(uuid), public.restore_web_version(uuid, int) from public, anon;
grant execute on function public.is_aal2(), public.can_edit_web(), public.can_publish_web(), public.can_read_web(),
  public.can_manage_site(), public.can_manage_catalogs(), public.publish_web_item(uuid, int, timestamptz),
  public.return_web_item(uuid, text), public.cancel_web_schedule(uuid), public.archive_web_item(uuid),
  public.unarchive_web_item(uuid), public.restore_web_version(uuid, int) to authenticated;
