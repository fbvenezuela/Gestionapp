import 'server-only';
import type { Sql } from '../db';
import { publicFileUrl } from '../storage/buckets';
import type { FrozenMedia } from '../web/public';
import type { WebKind } from '../web/schema';
import { STATUS_SQL, type StatusFilter, type WebStatus } from '../web/cms/status';

// What the website's administrator reads (/admin/web, design §3), always AS THE PERSON (db(session)): RLS decides what
// comes back (drafts, versions and the library only for the web's people and Administración; the site's settings and
// redirects for who keeps the site), and the gates say what the screens offer. Nothing here writes.

export type WebCaps = { canRead: boolean; canEdit: boolean; canPublish: boolean; canManageSite: boolean };

/** The database's own gates for this person (with the second factor): the screens follow them, the database enforces. */
export async function webCaps(sql: Sql): Promise<WebCaps> {
  const r = await sql.one<{ r: boolean; e: boolean; p: boolean; s: boolean }>(
    `select public.can_read_web() as r, public.can_edit_web() as e, public.can_publish_web() as p, public.can_manage_site() as s`,
  );
  return { canRead: !!r?.r, canEdit: !!r?.e, canPublish: !!r?.p, canManageSite: !!r?.s };
}

export type AdminRow = {
  id: string;
  kind: WebKind;
  slug: string;
  status: WebStatus;
  title: string;
  excerpt: string;
  draftVersion: number;
  publishedVersion: number | null;
  hasPublished: boolean;
  publishAt: Date | null;
  publishedAt: Date | null;
  archivedAt: Date | null;
  updatedAt: Date;
  submittedAt: Date | null;
  reviewNote: string | null;
  rev: number;
  updatedByName: string | null;
  submittedByName: string | null;
};

type RawRow = {
  id: string; kind: WebKind; slug: string; status: WebStatus; title: string; excerpt: string; draft_version: number; published_version: number | null;
  has_published: boolean; publish_at: Date | null; published_at: Date | null; archived_at: Date | null; updated_at: Date; submitted_at: Date | null;
  review_note: string | null; rev: number; updated_by_name: string | null; submitted_by_name: string | null;
};

const ROW = `i.id, i.kind, i.slug, i.status, coalesce(i.draft ->> 'title', '') as title, coalesce(i.draft ->> 'excerpt', '') as excerpt,
  i.draft_version, i.published_version, i.published is not null as has_published, i.publish_at, i.published_at, i.archived_at, i.updated_at,
  i.submitted_at, i.review_note, i.rev, nullif(up.full_name, '') as updated_by_name, nullif(sp.full_name, '') as submitted_by_name`;
const FROM = `public.web_items i left join public.profiles up on up.id = i.updated_by left join public.profiles sp on sp.id = i.submitted_by`;

const toRow = (r: RawRow): AdminRow => ({
  id: r.id, kind: r.kind, slug: r.slug, status: r.status, title: r.title, excerpt: r.excerpt, draftVersion: r.draft_version,
  publishedVersion: r.published_version, hasPublished: r.has_published, publishAt: r.publish_at, publishedAt: r.published_at,
  archivedAt: r.archived_at, updatedAt: r.updated_at, submittedAt: r.submitted_at, reviewNote: r.review_note, rev: r.rev,
  updatedByName: r.updated_by_name, submittedByName: r.submitted_by_name,
});

/** Accents and case out, on both sides of a search (the database's translate, the same letters). */
const PLAIN = (expr: string) => `translate(lower(${expr}), 'áéíóúüñ', 'aeiouun')`;

export const ADMIN_PAGE_SIZE = 30;

/** A page of one kind's items, newest change first; optionally by state and by words of the title, summary or address. */
export async function adminList(sql: Sql, f: { kind: WebKind; status?: StatusFilter | null; q?: string | null; page?: number }): Promise<{ rows: AdminRow[]; total: number }> {
  const where = ['i.kind = $1'];
  const params: unknown[] = [f.kind];
  if (f.status) where.push(STATUS_SQL[f.status].replace(/\b(status|published|archived_at|publish_at)\b/g, 'i.$1'));
  for (const word of (f.q ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 6)) {
    params.push(word);
    where.push(`(${PLAIN(`coalesce(i.draft ->> 'title', '') || ' ' || coalesce(i.draft ->> 'excerpt', '') || ' ' || i.slug`)} like '%' || ${PLAIN(`$${params.length}`)} || '%')`);
  }
  const page = Math.max(1, f.page ?? 1);
  const rows = await sql.query<RawRow & { total: number }>(
    `select ${ROW}, count(*) over ()::int as total from ${FROM} where ${where.join(' and ')}
      order by (i.status = 'in_review') desc, i.updated_at desc, i.id limit ${ADMIN_PAGE_SIZE} offset ${(page - 1) * ADMIN_PAGE_SIZE}`,
    params,
  );
  return { rows: rows.map(toRow), total: rows[0]?.total ?? 0 };
}

export type KindCounts = { kind: WebKind; total: number; drafts: number; inReview: number; scheduled: number; live: number; archived: number };

/** How many of each kind, by where they are (for the administrator's home). */
export async function kindCounts(sql: Sql): Promise<KindCounts[]> {
  const rows = await sql.query<{ kind: WebKind; total: number; drafts: number; in_review: number; scheduled: number; live: number; archived: number }>(
    `select kind, count(*)::int as total,
            count(*) filter (where status = 'draft')::int as drafts,
            count(*) filter (where status = 'in_review')::int as in_review,
            count(*) filter (where ${STATUS_SQL.programado})::int as scheduled,
            count(*) filter (where ${STATUS_SQL.publicado})::int as live,
            count(*) filter (where ${STATUS_SQL.archivado})::int as archived
       from public.web_items group by kind`,
  );
  return rows.map((r) => ({ kind: r.kind, total: r.total, drafts: r.drafts, inReview: r.in_review, scheduled: r.scheduled, live: r.live, archived: r.archived }));
}

/** The flow's counts as the database keeps them (web_items.status). */
export async function statusCounts(sql: Sql): Promise<Record<WebStatus, number>> {
  const rows = await sql.query<{ status: WebStatus; n: number }>(`select status, count(*)::int as n from public.web_items group by status`);
  const out: Record<WebStatus, number> = { draft: 0, in_review: 0, scheduled: 0, published: 0, archived: 0 };
  for (const r of rows) out[r.status] = r.n;
  return out;
}

/** What waits for the publisher, oldest first. */
export async function reviewQueue(sql: Sql): Promise<AdminRow[]> {
  return (await sql.query<RawRow>(`select ${ROW} from ${FROM} where i.status = 'in_review' order by i.submitted_at nulls last, i.id`)).map(toRow);
}

/** The latest changes of any kind (the home's «Lo último»). */
export async function recentChanges(sql: Sql, limit = 8): Promise<AdminRow[]> {
  return (await sql.query<RawRow>(`select ${ROW} from ${FROM} order by i.updated_at desc, i.id limit $1`, [limit])).map(toRow);
}

export type AdminItem = AdminRow & {
  draft: Record<string, unknown>;
  published: Record<string, unknown> | null;
  publishedMedia: Record<string, FrozenMedia>;
  createdAt: Date;
  createdByName: string | null;
  publishedByName: string | null;
  archivedByName: string | null;
};

export async function adminItem(sql: Sql, id: string): Promise<AdminItem | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  const r = await sql.one<RawRow & { draft: Record<string, unknown>; published: Record<string, unknown> | null; published_media: Record<string, FrozenMedia>; created_at: Date; created_by_name: string | null; published_by_name: string | null; archived_by_name: string | null }>(
    `select ${ROW}, i.draft, i.published, i.published_media, i.created_at,
            nullif(cp.full_name, '') as created_by_name, nullif(pp.full_name, '') as published_by_name, nullif(ap.full_name, '') as archived_by_name
       from ${FROM}
       left join public.profiles cp on cp.id = i.created_by
       left join public.profiles pp on pp.id = i.published_by
       left join public.profiles ap on ap.id = i.archived_by
      where i.id = $1`,
    [id],
  );
  if (!r) return null;
  return {
    ...toRow(r), draft: r.draft ?? {}, published: r.published, publishedMedia: r.published_media ?? {}, createdAt: r.created_at,
    createdByName: r.created_by_name, publishedByName: r.published_by_name, archivedByName: r.archived_by_name,
  };
}

export type VersionRow = { versionNo: number; slug: string; note: string | null; createdAt: Date; authorName: string | null };

export async function itemVersions(sql: Sql, id: string): Promise<VersionRow[]> {
  const rows = await sql.query<{ version_no: number; slug: string; note: string | null; created_at: Date; author_name: string | null }>(
    `select v.version_no, v.slug, v.note, v.created_at, nullif(p.full_name, '') as author_name
       from public.web_versions v left join public.profiles p on p.id = v.author_id where v.item_id = $1 order by v.version_no desc`,
    [id],
  );
  return rows.map((r) => ({ versionNo: r.version_no, slug: r.slug, note: r.note, createdAt: r.created_at, authorName: r.author_name }));
}

export async function itemVersion(sql: Sql, id: string, versionNo: number): Promise<(VersionRow & { snapshot: Record<string, unknown> }) | null> {
  const r = await sql.one<{ version_no: number; slug: string; note: string | null; created_at: Date; author_name: string | null; snapshot: Record<string, unknown> }>(
    `select v.version_no, v.slug, v.note, v.created_at, nullif(p.full_name, '') as author_name, v.snapshot
       from public.web_versions v left join public.profiles p on p.id = v.author_id where v.item_id = $1 and v.version_no = $2`,
    [id, versionNo],
  );
  return r ? { versionNo: r.version_no, slug: r.slug, note: r.note, createdAt: r.created_at, authorName: r.author_name, snapshot: r.snapshot } : null;
}

// --- The media library --------------------------------------------------------------------------------------------
/** A file of the library as the screens use it (its public address worked out here, on the server). */
export type MediaInfo = {
  id: string; kind: 'image' | 'document'; mime: string; url: string; bytes: number; width: number | null; height: number | null;
  alt: string; caption: string; credit: string; title: string; focalX: number; focalY: number; archived: boolean; createdAt: string;
  createdByName: string | null;
};

type MediaRaw = {
  id: string; storage_key: string; kind: 'image' | 'document'; mime: string; bytes: string | number; width: number | null; height: number | null;
  alt: string; caption: string; credit: string; title: string; focal_x: string | number; focal_y: string | number; archived_at: Date | null;
  created_at: Date; created_by_name: string | null;
};

const MEDIA = `m.id, m.storage_key, m.kind, m.mime, m.bytes, m.width, m.height, m.alt, m.caption, m.credit, m.title, m.focal_x, m.focal_y,
  m.archived_at, m.created_at, nullif(p.full_name, '') as created_by_name`;
const MEDIA_FROM = `public.web_media m left join public.profiles p on p.id = m.created_by`;

export function toMediaInfo(r: MediaRaw): MediaInfo {
  return {
    id: r.id, kind: r.kind, mime: r.mime, url: publicFileUrl(r.storage_key), bytes: Number(r.bytes), width: r.width, height: r.height, alt: r.alt,
    caption: r.caption, credit: r.credit, title: r.title, focalX: Number(r.focal_x), focalY: Number(r.focal_y), archived: !!r.archived_at,
    createdAt: new Date(r.created_at).toISOString(), createdByName: r.created_by_name,
  };
}

/** The library's files as the public pages would freeze them (the preview draws a draft with these). */
export function toFrozen(m: MediaInfo, key: string): FrozenMedia {
  return { key, kind: m.kind, mime: m.mime, bytes: m.bytes, width: m.width, height: m.height, alt: m.alt, caption: m.caption, credit: m.credit, title: m.title, focalX: m.focalX, focalY: m.focalY };
}

export const MEDIA_PAGE_SIZE = 48;

export async function mediaList(sql: Sql, f: { q?: string | null; kind?: 'image' | 'document' | null; archived?: boolean; page?: number; limit?: number }): Promise<{ rows: MediaInfo[]; total: number }> {
  const where = [f.archived ? 'm.archived_at is not null' : 'm.archived_at is null'];
  const params: unknown[] = [];
  if (f.kind) {
    params.push(f.kind);
    where.push(`m.kind = $${params.length}`);
  }
  for (const word of (f.q ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 6)) {
    params.push(word);
    where.push(`(${PLAIN(`m.alt || ' ' || m.caption || ' ' || m.credit || ' ' || m.title`)} like '%' || ${PLAIN(`$${params.length}`)} || '%')`);
  }
  const limit = Math.min(Math.max(f.limit ?? MEDIA_PAGE_SIZE, 1), 100);
  const page = Math.max(1, f.page ?? 1);
  const rows = await sql.query<MediaRaw & { total: number }>(
    `select ${MEDIA}, count(*) over ()::int as total from ${MEDIA_FROM} where ${where.join(' and ')}
      order by m.created_at desc, m.id limit ${limit} offset ${(page - 1) * limit}`,
    params,
  );
  return { rows: rows.map(toMediaInfo), total: rows[0]?.total ?? 0 };
}

export async function mediaById(sql: Sql, id: string): Promise<(MediaInfo & { storageKey: string }) | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const r = await sql.one<MediaRaw>(`select ${MEDIA} from ${MEDIA_FROM} where m.id = $1`, [id]);
  return r ? { ...toMediaInfo(r), storageKey: r.storage_key } : null;
}

/** The library's files these ids name (in a draft), with their keys for the preview. */
export async function mediaByIds(sql: Sql, ids: readonly string[]): Promise<Map<string, MediaInfo & { storageKey: string }>> {
  const valid = ids.filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
  if (!valid.length) return new Map();
  const rows = await sql.query<MediaRaw>(`select ${MEDIA} from ${MEDIA_FROM} where m.id = any ($1::uuid[])`, [valid]);
  return new Map(rows.map((r) => [r.id, { ...toMediaInfo(r), storageKey: r.storage_key }]));
}

export type MediaUse = { id: string; kind: WebKind; slug: string; title: string; inDraft: boolean; inPublished: boolean };

/** Where a file of the library is used: in a draft, in what is published, or both. */
export async function mediaUsage(sql: Sql, mediaId: string): Promise<MediaUse[]> {
  const rows = await sql.query<{ id: string; kind: WebKind; slug: string; title: string; in_draft: boolean; in_published: boolean }>(
    `select id, kind, slug, coalesce(draft ->> 'title', '') as title, strpos(draft::text, $1) > 0 as in_draft,
            strpos(coalesce(published::text, ''), $1) > 0 as in_published
       from public.web_items where strpos(draft::text, $1) > 0 or strpos(coalesce(published::text, ''), $1) > 0
      order by updated_at desc limit 50`,
    [mediaId],
  );
  return rows.map((r) => ({ id: r.id, kind: r.kind, slug: r.slug, title: r.title, inDraft: r.in_draft, inPublished: r.in_published }));
}

/** How many items use each of these files (in a draft or in what is published): the library's «Se usa en». */
export async function mediaUseCounts(sql: Sql, ids: readonly string[]): Promise<Map<string, number>> {
  if (!ids.length) return new Map();
  const rows = await sql.query<{ id: string; n: number }>(
    `select m.id, count(i.id)::int as n
       from unnest($1::uuid[]) as m(id)
       left join public.web_items i on strpos(i.draft::text, m.id::text) > 0 or strpos(coalesce(i.published::text, ''), m.id::text) > 0
      group by m.id`,
    [ids],
  );
  return new Map(rows.map((r) => [r.id, r.n]));
}

// --- What the forms choose from ----------------------------------------------------------------------------------
export type RefOption = { id: string; kind: WebKind; title: string; live: boolean; group: string | null; hasSource: boolean };

/** The items a page's blocks may point at (documents, questions, indicators, projects, episodes), drafts too (marked). */
export async function referenceOptions(sql: Sql): Promise<RefOption[]> {
  const rows = await sql.query<{ id: string; kind: WebKind; title: string; live: boolean; grp: string | null; has_source: boolean }>(
    `select id, kind, coalesce(draft ->> 'title', '') as title,
            (published is not null and archived_at is null and publish_at <= now()) as live, draft ->> 'category' as grp,
            coalesce(length(btrim(coalesce(draft #>> '{source,label}', ''))) >= 2, false) as has_source
       from public.web_items where kind in ('document', 'faq', 'indicator', 'project', 'episode') and archived_at is null
      order by kind, coalesce(draft ->> 'title', '')`,
  );
  return rows.map((r) => ({ id: r.id, kind: r.kind, title: r.title, live: r.live, group: r.grp, hasSource: r.has_source }));
}

export type Municipality = { id: string; name: string };

export async function municipalities(sql: Sql): Promise<Municipality[]> {
  return sql.query<Municipality>(`select id, name from public.territories where kind = 'municipality' and active order by sort, name`);
}

// --- The site ----------------------------------------------------------------------------------------------------
export type SettingRow = { key: string; value: unknown; isPublic: boolean; updatedAt: Date; updatedByName: string | null };

export async function siteSettingRows(sql: Sql): Promise<SettingRow[]> {
  const rows = await sql.query<{ key: string; value: unknown; is_public: boolean; updated_at: Date; name: string | null }>(
    `select s.key, s.value, s.is_public, s.updated_at, nullif(p.full_name, '') as name
       from public.web_settings s left join public.profiles p on p.id = s.updated_by order by s.key`,
  );
  return rows.map((r) => ({ key: r.key, value: r.value, isPublic: r.is_public, updatedAt: r.updated_at, updatedByName: r.name }));
}

export type RedirectRow = { id: string; from: string; to: string; status: number; source: 'importador' | 'manual'; createdAt: Date; createdByName: string | null };

export const REDIRECT_PAGE_SIZE = 50;

export async function redirectList(sql: Sql, f: { q?: string | null; page?: number }): Promise<{ rows: RedirectRow[]; total: number }> {
  const params: unknown[] = [];
  const where: string[] = [];
  const q = (f.q ?? '').trim();
  if (q) {
    params.push(q.toLowerCase());
    where.push(`(lower(r.from_path) like '%' || $1 || '%' or lower(r.to_path) like '%' || $1 || '%')`);
  }
  const page = Math.max(1, f.page ?? 1);
  const rows = await sql.query<{ id: string; from_path: string; to_path: string; status_code: number; source: 'importador' | 'manual'; created_at: Date; name: string | null; total: number }>(
    `select r.id, r.from_path, r.to_path, r.status_code, r.source, r.created_at, nullif(p.full_name, '') as name, count(*) over ()::int as total
       from public.web_redirects r left join public.profiles p on p.id = r.created_by
      ${where.length ? `where ${where.join(' and ')}` : ''}
      order by r.created_at desc, r.from_path limit ${REDIRECT_PAGE_SIZE} offset ${(page - 1) * REDIRECT_PAGE_SIZE}`,
    params,
  );
  return {
    rows: rows.map((r) => ({ id: r.id, from: r.from_path, to: r.to_path, status: r.status_code, source: r.source, createdAt: r.created_at, createdByName: r.name })),
    total: rows[0]?.total ?? 0,
  };
}
