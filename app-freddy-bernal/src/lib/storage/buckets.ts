import 'server-only';
import path from 'node:path';
import { env } from '../env';
import { insideFolder, localFilesRoot, readIfExists, writeAtomic } from './local-files';

// The website's two logical buckets (design §6, 20261106000100_web_publica.sql §9):
//   web-public             the media library (photos, PDFs of documents): public, never changes once uploaded.
//   participacion-privado  the citizens' files and the team's evidence: never public.
// With DATABASE_URL they are the Supabase buckets of those names (STORAGE_BUCKET_* to rename them), written with the
// server's key after the app checked the file (there are no storage policies); the public one is read at its public
// address, the private one only through short signed links handed out by the app's authorized routes. In the demo (and
// with LOCAL_DATA_DIR) they are folders on this machine, served by /api/archivos/web/<key> (public, cached for a year)
// and /api/archivos/atencion/<id> (the person's session and RLS decide, every time).

export type BucketId = 'web-public' | 'participacion-privado';

const UUID_NAME = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
// The same shapes the database checks (web_media.storage_key, request_attachments.storage_key).
export const KEY_PATTERN: Record<BucketId, RegExp> = {
  'web-public': new RegExp(`^${UUID_NAME}\\.(jpg|png|webp|avif|pdf)$`),
  'participacion-privado': new RegExp(`^${UUID_NAME}\\.(jpg|png|webp|pdf)$`),
};

const MIME_BY_EXT: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif', pdf: 'application/pdf' };

/** The type a stored key stands for (its extension, which the database ties to the file's type). */
export function mimeOfKey(key: string): string {
  return MIME_BY_EXT[key.slice(key.lastIndexOf('.') + 1)] ?? 'application/octet-stream';
}

export interface BucketStore {
  readonly bucket: BucketId;
  put(key: string, bytes: Uint8Array, mime: string): Promise<void>;
  read(key: string): Promise<Uint8Array | null>;
  exists(key: string): Promise<boolean>;
  remove(key: string): Promise<void>;
}

function checkKey(bucket: BucketId, key: string) {
  if (!KEY_PATTERN[bucket].test(key)) throw new Error(`storage: bad key for ${bucket}`);
}

/** A folder per bucket on this machine (demo and local work). */
export function localBucket(bucket: BucketId, root: string = localFilesRoot()): BucketStore {
  const folder = path.join(root, bucket);
  const fileOf = (key: string) => {
    checkKey(bucket, key);
    const f = insideFolder(folder, key);
    if (!f) throw new Error('storage: key outside its bucket');
    return f;
  };
  return {
    bucket,
    put: async (key, bytes) => writeAtomic(fileOf(key), bytes),
    read: async (key) => readIfExists(fileOf(key)),
    exists: async (key) => (await readIfExists(fileOf(key))) !== null,
    remove: async (key) => {
      const { rm } = await import('node:fs/promises');
      await rm(fileOf(key), { force: true });
    },
  };
}

const supabaseName = (bucket: BucketId) => (bucket === 'web-public' ? env.buckets.webPublic : env.buckets.participation);

/** The Supabase bucket, with the server's key (production). */
export function supabaseBucket(bucket: BucketId): BucketStore {
  const client = async () => (await import('../supabase/server')).supabaseAdmin().storage.from(supabaseName(bucket));
  return {
    bucket,
    put: async (key, bytes, mime) => {
      checkKey(bucket, key);
      // A public file never changes (its key is new for each upload): the CDN may keep it for a year.
      const { error } = await (await client()).upload(key, bytes, {
        contentType: mime,
        upsert: false,
        cacheControl: bucket === 'web-public' ? '31536000' : '0',
      });
      if (error) throw new Error(`storage: upload failed (${error.message})`);
    },
    read: async (key) => {
      checkKey(bucket, key);
      const { data, error } = await (await client()).download(key);
      if (error || !data) return null;
      return new Uint8Array(await data.arrayBuffer());
    },
    exists: async (key) => {
      checkKey(bucket, key);
      const { data } = await (await client()).exists(key);
      return !!data;
    },
    remove: async (key) => {
      checkKey(bucket, key);
      await (await client()).remove([key]);
    },
  };
}

export function bucketStore(bucket: BucketId): BucketStore {
  return env.dataMode === 'supabase' ? supabaseBucket(bucket) : localBucket(bucket);
}

/** Where the public site points an image or a document of the library (the frozen key of a published item). */
export function publicFileUrl(key: string): string {
  if (!KEY_PATTERN['web-public'].test(key)) return '';
  if (env.dataMode === 'supabase') return `${env.supabaseUrl}/storage/v1/object/public/${encodeURIComponent(supabaseName('web-public'))}/${key}`;
  return `/api/archivos/web/${key}`;
}

/** A short signed link to a private file (production only; the demo serves it from its own route). */
export async function privateSignedUrl(key: string, opts: { seconds?: number; downloadAs?: string } = {}): Promise<string | null> {
  checkKey('participacion-privado', key);
  if (env.dataMode !== 'supabase') return null;
  const { supabaseAdmin } = await import('../supabase/server');
  const { data, error } = await supabaseAdmin()
    .storage.from(supabaseName('participacion-privado'))
    .createSignedUrl(key, opts.seconds ?? 60, opts.downloadAs ? { download: opts.downloadAs } : undefined);
  return error || !data ? null : data.signedUrl;
}
