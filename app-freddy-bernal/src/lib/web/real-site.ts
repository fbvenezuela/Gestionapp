import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { externalUrl, richText } from './blocks';
import { isAltPlaceholder, removedMarksIn } from './import-marks';
import { parseSnapshot, slug as slugSchema } from './schema';

// «Contenido real» (REAL_SITE_CONTENT): the deployed demo shows the official site's real news, opinion, biography,
// photos, program episodes and weekly, inside the new design, and none of it ever enters git (the repository is
// public). The build fetches it (scripts/real-site/snapshot.mts, run by `npm run build` through «prebuild») and writes
// it next to the app, in .real-site/ (git-ignored): snapshot.json (this file's RealSnapshot) and media/<key> (the photos
// and PDFs, read-only, served by /api/archivos/web/<key>). The demo database seeds it at boot instead of the invented
// web content (src/lib/db/index.ts → seed-parts/web-real.ts); the invented citizen requests stay.
//
//   * Same file, same rows: every id is a hash of a name («real:item:news:<WordPress id>») and every key a hash of the
//     file's bytes, so every server of the demo seeds identical rows (D-39) and a file under a key never changes.
//   * Off unless all of this holds at runtime: the file exists in process.cwd(), there is no DATABASE_URL, the tests are
//     not running (VITEST), and REAL_SITE_CONTENT is not 0/false (Playwright sets it to 0: the e2e stay invented).
//   * Read with fs, never imported (the file does not exist in CI), validated again here, memoized per process.
// Pure, except loadRealSnapshot (it reads the file once). No Next or server-only imports: the build script uses it too.

// The runtime spells these out as literals (loadRealSnapshot, src/lib/storage/serve-public-file.ts) for the bundler's file
// tracing; the build script (scripts/real-site) uses the names.
export const REAL_SITE = { dir: '.real-site', file: 'snapshot.json', media: 'media' } as const;

/** The band at the top and bottom of every public page while the demo shows the official site's content: always this
 * text, whatever the settings say (anyone can enter the demo; nobody may make it pass for the official site). */
export const REAL_DEMO_BANNER = 'Versión de prueba en revisión. No es el sitio oficial.';

/** The settings that say whose site this is (name, office, accounts, contacts, the band): with the official site's
 * content they stay as the build left them (src/lib/actions/web-site.ts refuses to save them). */
export const REAL_LOCKED_SETTINGS = [
  'site.demo_banner', 'site.identity', 'site.structured_data', 'site.social_accounts', 'site.youtube_channel', 'site.whatsapp_channel',
  'site.institutional_portal', 'site.contacts',
] as const;

/** «1»/«true» → true, «0»/«false» → false, anything else (unset) → null. */
export function switchOf(v: string | undefined): boolean | null {
  const s = (v ?? '').trim().toLowerCase();
  if (s === '1' || s === 'true') return true;
  if (s === '0' || s === 'false') return false;
  return null;
}

/** At runtime: whether the demo seeds the official site's content (the file must exist too). */
export function realModeAtRuntime(env: Record<string, string | undefined>, snapshotExists: boolean): boolean {
  return snapshotExists && !env.DATABASE_URL && !env.VITEST && switchOf(env.REAL_SITE_CONTENT) !== false;
}

// --- Ids -------------------------------------------------------------------------------------------------------------
const sha256 = (v: string | Uint8Array) => createHash('sha256').update(v).digest('hex');

/** A v4-shaped uuid from (the first 32 of) some hex characters: the shape of stableId (seed-parts/web.ts). */
export function uuidFromHex(hex: string): string {
  const x = hex.toLowerCase();
  if (!/^[0-9a-f]{32}/.test(x)) throw new Error('uuidFromHex: hacen falta 32 caracteres hexadecimales');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-4${x.slice(13, 16)}-8${x.slice(17, 20)}-${x.slice(20, 32)}`;
}

/** The id of a name: a uuid made from its sha256. */
export function realId(name: string): string {
  return uuidFromHex(sha256(name));
}

export const realIds = {
  news: (wpId: number) => realId(`real:item:news:${wpId}`),
  episode: (videoId: string) => realId(`real:item:episode:${videoId}`),
  document: (sha: string) => realId(`real:item:document:semanario:${sha}`),
  faq: (slug: string) => realId(`real:item:faq:${slug}`),
  media: (sha: string) => realId(`real:media:${sha}`),
} as const;

/** The file's key in the library: a uuid made from the sha256 of its bytes, and its extension. */
export function mediaKey(sha: string, ext: string): string {
  return `${uuidFromHex(sha)}.${ext}`;
}

export function sha256Of(bytes: Uint8Array): string {
  return sha256(bytes);
}

// --- Accounts ----------------------------------------------------------------------------------------------------------
/** One account however it is written (www or not, with or without «@», a profile's number in its address…): «network:handle».
 * Null for an address that is not an account of a known network. */
export function accountKeyOf(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase().replace(/^(?:www|m|mobile|web)\./, '');
  let segs: string[];
  try {
    segs = u.pathname.split('/').filter(Boolean).map((s) => decodeURIComponent(s).toLowerCase());
  } catch {
    return null;
  }
  const first = segs[0] ?? '';
  const at = (s: string) => (s.startsWith('@') && s.length > 1 ? s.slice(1) : null);
  switch (host) {
    case 'instagram.com':
      return first ? `instagram:${first.replace(/^@/, '')}` : null;
    case 'x.com':
    case 'twitter.com':
      return first ? `x:${first.replace(/^@/, '')}` : null;
    case 'tiktok.com':
      return at(first) ? `tiktok:${at(first)}` : null;
    case 'threads.com':
    case 'threads.net':
      return at(first) ? `threads:${at(first)}` : null;
    case 'youtube.com': {
      // YouTube's own redirect wrapper («/redirect?q=<address>»).
      if (first === 'redirect') {
        const q = u.searchParams.get('q');
        return q ? accountKeyOf(q) : null;
      }
      if (at(first)) return `youtube:${at(first)}`;
      if (first === 'channel' && segs[1]) return `youtube:channel:${segs[1]}`;
      return null;
    }
    case 'facebook.com':
    case 'fb.com': {
      // A profile is its number wherever it is written («/p/Nombre-Apellido-100000000000000/», «profile.php?id=…»).
      const num = /(\d{8,})/.exec(`${u.pathname}?${u.searchParams.get('id') ?? ''}`);
      if (num) return `facebook:${num[1]}`;
      const name = first === 'p' ? segs[1] : first;
      return name ? `facebook:${name}` : null;
    }
    default:
      return null;
  }
}

/** The tagline without the name in front («<nombre> - Gobernador del estado…» → «Gobernador del estado…»), for the
 * home's hero. */
export function taglineWithoutName(identity: { name: string; tagline: string }): string {
  const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const name = identity.name.trim();
  const tagline = identity.tagline.trim();
  if (!name || !fold(tagline).startsWith(fold(name))) return tagline;
  const rest = tagline.slice(name.length).replace(/^[\s,.:;|·•–—-]+/, '').trim();
  return rest ? rest[0].toLocaleUpperCase('es') + rest.slice(1) : tagline;
}

// --- The snapshot ------------------------------------------------------------------------------------------------------
const uuid = z.string().uuid();
const KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|pdf)$/;
const EXT_OF_MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' } as const;
/** The draft size the importer keeps (the database takes up to 512 KB). */
export const REAL_DRAFT_MAX = 450_000;
/** The largest file the snapshot keeps: a server of the demo answers with it from a function, and Vercel stops a
 * function's answer at 4.5 MB. */
export const REAL_FILE_MAX_BYTES = 4 * 1024 * 1024;
/** How old the last good snapshot (or one of its parts) may be when the official site does not answer: past it, the
 * demo shows the invented content rather than what the official site may have taken down since. */
export const REAL_LAST_GOOD_MAX_MS = 7 * 86_400_000;

export const realMedia = z
  .object({
    id: uuid,
    key: z.string().regex(KEY),
    kind: z.enum(['image', 'document']),
    mime: z.enum(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
    bytes: z.number().int().min(1).max(REAL_FILE_MAX_BYTES),
    width: z.number().int().min(1).max(20000).optional(),
    height: z.number().int().min(1).max(20000).optional(),
    alt: z.string().max(300).optional(),
    caption: z.string().max(500).optional(),
    title: z.string().max(200).optional(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .superRefine((m, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: 'custom', message: `${m.key}: ${message}` });
    // The database's own checks (web_media) and the importer's gate (guard_web_item_ready), before any row is written.
    if (m.key !== mediaKey(m.sha256, EXT_OF_MIME[m.mime])) issue('la clave no sale del contenido');
    if (m.id !== realIds.media(m.sha256)) issue('el id no sale del contenido');
    if ((m.kind === 'image') !== m.mime.startsWith('image/')) issue('el tipo no corresponde');
    if (m.kind === 'image') {
      if (!m.width || !m.height) issue('una foto lleva su tamaño');
      if ((m.alt ?? '').trim().length < 3 || isAltPlaceholder(m.alt)) issue('una foto lleva su texto alternativo');
    }
    if (m.kind === 'document' && (m.title ?? '').trim().length < 3) issue('un documento lleva su título');
    if (removedMarksIn([m.alt, m.caption, m.title]).length) issue('tiene una marca de datos retirados');
  });
export type RealMedia = z.infer<typeof realMedia>;

export const REAL_KINDS = ['news', 'episode', 'document'] as const;
export type RealKind = (typeof REAL_KINDS)[number];

export const realItem = z
  .object({
    id: uuid,
    kind: z.enum(REAL_KINDS),
    slug: slugSchema,
    draft: z.record(z.string(), z.unknown()),
    // Where it came from on the old site (the CMS shows «Traído de la web vieja»).
    source: z
      .object({
        id: z.string().regex(/^\d{1,12}$/),
        url: externalUrl,
        path: z.string().regex(/^\/[^\s\\]*$/).max(500),
        publishedAt: z.string().datetime({ offset: true }).optional(),
      })
      .optional(),
  })
  .transform((it, ctx) => {
    const r = parseSnapshot(it.kind, it.draft);
    if (!r.ok) {
      ctx.addIssue({ code: 'custom', message: `${it.kind}/${it.slug}: ${r.error}` });
      return z.NEVER;
    }
    if (JSON.stringify(r.data).length > REAL_DRAFT_MAX) ctx.addIssue({ code: 'custom', message: `${it.kind}/${it.slug}: el texto es muy largo` });
    if (removedMarksIn(r.data).length) ctx.addIssue({ code: 'custom', message: `${it.kind}/${it.slug}: tiene una marca de datos retirados` });
    // What is seeded is what the CMS's own schema made of it (an unknown key of a tampered file never reaches the
    // database; text is trimmed and normalized as an editor's save would).
    return { ...it, draft: r.data as Record<string, unknown> };
  });
export type RealItem = z.infer<typeof realItem>;

const oldPath = z.string().regex(/^\/[^#\s\\]*$/).min(2).max(500);
const ourPath = z.string().regex(/^\/(?!\/)[^\s\\]*$/).max(500);

export const realSnapshotSchema = z
  .object({
    version: z.literal(1),
    fetchedAt: z.string().datetime({ offset: true }),
    source: externalUrl,
    identity: z.object({ name: z.string().trim().min(1).max(120), tagline: z.string().trim().max(200) }),
    accounts: z.object({ verifiedHandles: z.array(z.string().min(3).max(120)).max(40), youtubeOk: z.boolean() }),
    media: z.array(realMedia).max(2000),
    items: z.array(realItem).max(500),
    pages: z.object({
      heroMediaId: uuid.nullable(),
      bioMediaId: uuid.nullable(),
      biography: richText,
      office: richText,
      honors: richText,
      bioSourceUrl: z.union([z.literal(''), externalUrl]),
    }),
    redirects: z
      .array(z.object({ from: oldPath, to: ourPath }).refine((r) => r.from !== r.to, 'una redirección a sí misma'))
      .max(2000),
    report: z.object({
      news: z.number().int().min(0),
      opinion: z.number().int().min(0),
      episodes: z.number().int().min(0),
      photos: z.number().int().min(0),
      documents: z.number().int().min(0),
      skipped: z.array(z.object({ ref: z.string().max(300), reason: z.string().max(300) })).max(2000),
      // How the run went (the build's log says it too).
      mediaBytes: z.number().int().min(0).optional(),
      requests: z.number().int().min(0).optional(),
      durationMs: z.number().int().min(0).optional(),
      carriedOver: z.array(z.string().max(40)).max(10).optional(),
      // When a part that did not answer this time was last read (it came from an earlier snapshot): past
      // REAL_LAST_GOOD_MAX_MS it is not carried again.
      partsSince: z.object({ youtube: z.string().datetime({ offset: true }).optional(), semanario: z.string().datetime({ offset: true }).optional() }).optional(),
    }),
  })
  .superRefine((s, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
    const media = new Map(s.media.map((m) => [m.id, m]));
    if (media.size !== s.media.length) issue('dos archivos con el mismo id');
    if (new Set(s.media.map((m) => m.key)).size !== s.media.length) issue('dos archivos con la misma clave');
    if (new Set(s.items.map((i) => i.id)).size !== s.items.length) issue('dos contenidos con el mismo id');
    if (new Set(s.items.map((i) => `${i.kind}/${i.slug}`)).size !== s.items.length) issue('dos contenidos con la misma dirección');
    if (new Set(s.redirects.map((r) => r.from)).size !== s.redirects.length) issue('dos redirecciones desde la misma dirección');
    const needs = (id: unknown, kind: 'image' | 'document', where: string) => {
      if (id === null || id === undefined) return;
      const m = typeof id === 'string' ? media.get(id) : undefined;
      if (!m || m.kind !== kind) issue(`${where}: falta su archivo`);
    };
    for (const it of s.items) {
      const d = it.draft as { coverId?: unknown; galleryIds?: unknown; fileId?: unknown };
      needs(d.coverId, 'image', `${it.kind}/${it.slug}`);
      if (Array.isArray(d.galleryIds)) for (const g of d.galleryIds) needs(g, 'image', `${it.kind}/${it.slug}`);
      if (it.kind === 'document') needs(d.fileId, 'document', `${it.kind}/${it.slug}`);
    }
    needs(s.pages.heroMediaId, 'image', 'la portada');
    needs(s.pages.bioMediaId, 'image', 'el gobernador');
    if (removedMarksIn([s.pages, s.identity]).length) issue('las páginas tienen una marca de datos retirados');
  });
export type RealSnapshot = z.infer<typeof realSnapshotSchema>;

/** A snapshot checked whole, or the first problem in words. */
export function parseRealSnapshot(value: unknown): { ok: true; snapshot: RealSnapshot } | { ok: false; error: string } {
  const r = realSnapshotSchema.safeParse(value);
  if (r.success) return { ok: true, snapshot: r.data };
  const i = r.error.issues[0];
  return { ok: false, error: i ? `${i.message}${i.path.length ? ` (${i.path.join('.')})` : ''}` : 'no tiene la forma esperada' };
}

/** The snapshot's text, checked; null (and a line in the log) when it cannot be read or does not fit. */
export function snapshotFromText(raw: string): RealSnapshot | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    console.error('[web] .real-site/snapshot.json no se puede leer: la demo sigue con el contenido inventado.');
    return null;
  }
  const r = parseRealSnapshot(json);
  if (!r.ok) {
    console.error(`[web] .real-site/snapshot.json no es válido (${r.error}): la demo sigue con el contenido inventado.`);
    return null;
  }
  return r.snapshot;
}

type Memo = { value: RealSnapshot | null };
const g = globalThis as unknown as { __fbRealSnapshot?: Memo; __fbRealSeeded?: 'real' | 'invented'; __fbProcessToken?: string };

/** The official site's content for this demo server, or null (invented content): read once per process. The path is
 * written out in full so the bundler traces exactly that file (a path built from variables makes Turbopack trace the
 * whole project into every server function). */
export function loadRealSnapshot(): RealSnapshot | null {
  if (g.__fbRealSnapshot) return g.__fbRealSnapshot.value;
  const file = path.join(process.cwd(), '.real-site', 'snapshot.json');
  let value: RealSnapshot | null = null;
  if (realModeAtRuntime(process.env, fs.existsSync(file))) {
    try {
      value = snapshotFromText(fs.readFileSync(file, 'utf8'));
    } catch {
      value = null;
    }
  }
  g.__fbRealSnapshot = { value };
  return value;
}

/** The demo's seed says here what it seeded (src/lib/db/index.ts seedDemoData): when the real content could not be
 * seeded, the server shows the invented one even though it has the file. */
export function noteSeeded(what: 'real' | 'invented'): void {
  g.__fbRealSeeded = what;
}

/** Whether this server shows the official site's content (its file is there and its seed did not fall back). */
export function realContentShown(): boolean {
  return !!loadRealSnapshot() && g.__fbRealSeeded !== 'invented';
}

/** Which content this server shows, for the keys of the public pages' data cache (src/lib/web/cache.ts): a cached list
 * of the invented content is never served by a server with the real one, nor one of an older snapshot, nor one of
 * another deployment (the data cache can outlive a deployment; VERCEL_DEPLOYMENT_ID names each one). With the real
 * content each server process keys its own entries too: every one has its own demo database, so what someone edits on
 * one (anyone can enter the demo) never reaches the pages the others serve. */
export function realContentToken(): string {
  const s = loadRealSnapshot();
  if (!s || g.__fbRealSeeded === 'invented') return 'invented';
  const deployment = (process.env.VERCEL_DEPLOYMENT_ID ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
  g.__fbProcessToken ??= randomBytes(6).toString('hex');
  return `real:${s.fetchedAt}${deployment ? `:${deployment}` : ''}:${g.__fbProcessToken}`;
}

/** The snapshot's files by key, with the name a saved PDF takes (its item's address: «semanario-…-2026-03-02.pdf»);
 * photos keep none. Only these keys are served from .real-site/media (src/lib/storage/serve-public-file.ts). */
export function realFileNames(snap: Pick<RealSnapshot, 'media' | 'items'>): Map<string, string | null> {
  const slugOf = new Map<string, string>();
  for (const it of snap.items) {
    const fileId = (it.draft as { fileId?: unknown }).fileId;
    if (typeof fileId === 'string' && !slugOf.has(fileId)) slugOf.set(fileId, it.slug);
  }
  return new Map(snap.media.map((m) => [m.key, m.kind === 'document' && slugOf.has(m.id) ? `${slugOf.get(m.id)}.${m.key.split('.').pop()}` : null]));
}
