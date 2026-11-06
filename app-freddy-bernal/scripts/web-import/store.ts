// Where the importer writes, and only with --apply: the database (as the system, like the client's seed: the items
// arrive as drafts, nothing is published) and the website's public bucket (web-public: the Supabase bucket, or the
// folder of the local database under LOCAL_DATA_DIR, the same one the app serves at /api/archivos/web/<key>).
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { Sql } from '../../src/lib/db/core';

// --- Files -------------------------------------------------------------------------------------------------------
export interface MediaStore {
  /** Where the files go, in words (for the report). */
  readonly where: string;
  put(key: string, bytes: Uint8Array, mime: string): Promise<void>;
  remove(key: string): Promise<void>;
}

const KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;
const checkKey = (key: string) => {
  if (!KEY.test(key)) throw new Error(`clave de archivo inválida: ${key}`);
};

/** The local database's files (LOCAL_DATA_DIR): <dir>/files/web-public/<key>, the layout of src/lib/storage. */
export function localMediaStore(dataDir: string): MediaStore {
  const folder = path.resolve(dataDir, 'files', 'web-public');
  return {
    where: `la carpeta ${folder}`,
    async put(key, bytes) {
      checkKey(key);
      await fs.mkdir(folder, { recursive: true });
      const file = path.join(folder, key);
      const tmp = `${file}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
      await fs.writeFile(tmp, bytes, { flag: 'wx' });
      await fs.rename(tmp, file);
    },
    async remove(key) {
      checkKey(key);
      await fs.rm(path.join(folder, key), { force: true });
    },
  };
}

/** The Supabase bucket (production), with the server's key: a public file never changes, so it is cached a year. */
export async function supabaseMediaStore(url: string, serviceKey: string, bucket: string): Promise<MediaStore> {
  const { createClient } = await import('@supabase/supabase-js');
  const storage = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }).storage.from(bucket);
  return {
    where: `el balde «${bucket}» de Supabase`,
    async put(key, bytes, mime) {
      checkKey(key);
      const { error } = await storage.upload(key, bytes, { contentType: mime, upsert: false, cacheControl: '31536000' });
      if (error) throw new Error(`no se pudo subir la foto (${error.message})`);
    },
    async remove(key) {
      checkKey(key);
      await storage.remove([key]);
    },
  };
}

/** In memory (tests). */
export function memoryMediaStore(): MediaStore & { files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>();
  return {
    where: 'la memoria',
    files,
    async put(key, bytes) {
      checkKey(key);
      files.set(key, bytes);
    },
    async remove(key) {
      files.delete(key);
    },
  };
}

// --- The database --------------------------------------------------------------------------------------------------
export type ImportedItem = {
  item_id: string;
  item_rev: number;
  content_hash: string;
  slug: string;
  rev: number;
  status: string;
  has_published: boolean;
  archived: boolean;
};

/** What the importer wrote for a post earlier, with the item as it is now. */
export async function findImported(sql: Sql, site: string, sourceId: number): Promise<ImportedItem | null> {
  return sql.one<ImportedItem>(
    `select i.item_id, i.item_rev, i.content_hash, w.slug, w.rev, w.status, w.published is not null as has_published,
            w.archived_at is not null as archived
       from public.web_import_items i join public.web_items w on w.id = i.item_id
      where i.site = $1 and i.source_id = $2`,
    [site, sourceId],
  );
}

/** Library files already brought, by key (and by content, so the same photo under two addresses is one file). */
export async function findImportedMedia(sql: Sql, site: string, keys: string[]): Promise<Map<string, string>> {
  if (!keys.length) return new Map();
  const rows = await sql.query<{ source_key: string; media_id: string }>(
    `select source_key, media_id::text as media_id from public.web_import_media where site = $1 and source_key = any ($2::text[])`,
    [site, keys],
  );
  return new Map(rows.map((r) => [r.source_key, r.media_id]));
}

/** A photo already brought with the same content (the same file under another address): its library file. */
export async function mediaBySha(sql: Sql, site: string, sha256: string): Promise<{ mediaId: string; storageKey: string } | null> {
  const r = await sql.one<{ media_id: string; storage_key: string }>(
    `select i.media_id::text as media_id, m.storage_key
       from public.web_import_media i join public.web_media m on m.id = i.media_id
      where i.site = $1 and i.sha256 = $2 order by i.created_at limit 1`,
    [site, sha256],
  );
  return r ? { mediaId: r.media_id, storageKey: r.storage_key } : null;
}

export async function slugTaken(sql: Sql, slug: string, exceptId: string | null): Promise<boolean> {
  return !!(await sql.one(`select 1 from public.web_items where kind = 'news' and slug = $1 and ($2::uuid is null or id <> $2::uuid)`, [slug, exceptId]));
}

export type NewMedia = {
  /** Chosen by the importer, so the draft can name it before anything is written. */
  id: string;
  storageKey: string;
  mime: string;
  bytes: number;
  width: number;
  height: number;
  alt: string;
  caption: string;
};

export async function insertMedia(sql: Sql, m: NewMedia): Promise<void> {
  await sql.query(
    `insert into public.web_media (id, storage_key, kind, mime, bytes, width, height, alt, caption)
     values ($1, $2, 'image', $3, $4, $5, $6, $7, $8)`,
    [m.id, m.storageKey, m.mime, m.bytes, m.width, m.height, m.alt, m.caption],
  );
}

export async function rememberMedia(sql: Sql, r: { site: string; key: string; url: string; oldPath: string | null; mediaId: string; sha256: string }): Promise<void> {
  await sql.query(
    `insert into public.web_import_media (site, source_key, source_url, source_path, media_id, sha256)
     values ($1, $2, $3, $4, $5, $6) on conflict (site, source_key) do nothing`,
    [r.site, r.key, r.url.slice(0, 1000), r.oldPath, r.mediaId, r.sha256],
  );
}

/** A new draft (as the system: guard_web_item lets it in as a draft; a version row is written by the database). */
export async function insertItem(sql: Sql, slug: string, draft: unknown, note: string): Promise<{ id: string; rev: number }> {
  await sql.query(`select set_config('app.version_note', $1, true)`, [note]);
  const row = await sql.one<{ id: string; rev: number }>(
    `insert into public.web_items (kind, slug, status, draft) values ('news', $1, 'draft', $2::text::jsonb) returning id::text as id, rev`,
    [slug, JSON.stringify(draft)],
  );
  return row!;
}

/** The draft again, only if nobody touched the item since the importer wrote it (same rev, still a draft never
 * published nor archived). Null when it changed in between. */
export async function updateItemDraft(sql: Sql, id: string, rev: number, draft: unknown, note: string): Promise<number | null> {
  await sql.query(`select set_config('app.version_note', $1, true)`, [note]);
  const row = await sql.one<{ rev: number }>(
    `update public.web_items set draft = $3::text::jsonb
      where id = $1 and rev = $2 and status = 'draft' and published is null and archived_at is null
      returning rev`,
    [id, rev, JSON.stringify(draft)],
  );
  return row?.rev ?? null;
}

export type ImportRow = {
  site: string;
  sourceId: number;
  itemId: string;
  sourceUrl: string;
  sourcePath: string;
  publishedAt: string | null;
  modifiedAt: string | null;
  contentHash: string;
  itemRev: number;
  flags: string[];
};

export async function rememberItem(sql: Sql, r: ImportRow): Promise<void> {
  await sql.query(
    `insert into public.web_import_items (site, source_id, item_id, source_url, source_path, source_published_at, source_modified_at,
                                          content_hash, item_rev, review_flags)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::text[])
     on conflict (site, source_id) do update set
       source_url = excluded.source_url, source_path = excluded.source_path, source_published_at = excluded.source_published_at,
       source_modified_at = excluded.source_modified_at, content_hash = excluded.content_hash, item_rev = excluded.item_rev,
       review_flags = excluded.review_flags`,
    [r.site, r.sourceId, r.itemId, r.sourceUrl.slice(0, 1000), r.sourcePath.slice(0, 500), r.publishedAt, r.modifiedAt, r.contentHash, r.itemRev, r.flags],
  );
}

export type RedirectOutcome = 'created' | 'updated' | 'same' | 'manual';

/** An old address → its new one (301, source «importador»). A redirect the team made by hand is never changed. */
export async function upsertRedirect(sql: Sql, from: string, to: string): Promise<RedirectOutcome> {
  const now = await sql.one<{ to_path: string; source: string }>(`select to_path, source from public.web_redirects where from_path = $1`, [from]);
  if (now?.source === 'manual') return 'manual';
  if (now && now.to_path === to) return 'same';
  await sql.query(
    `insert into public.web_redirects (from_path, to_path, status_code, source) values ($1, $2, 301, 'importador')
     on conflict (from_path) do update set to_path = excluded.to_path, status_code = 301 where public.web_redirects.source = 'importador'`,
    [from, to],
  );
  return now ? 'updated' : 'created';
}
