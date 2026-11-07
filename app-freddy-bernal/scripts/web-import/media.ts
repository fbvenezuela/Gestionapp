// The old site's photos → the website's library (web_media, bucket web-public). Downloaded, never linked to the old
// site; checked like an upload of the team (src/lib/web/cms/media-file.ts: JPEG, PNG or WebP by their first bytes,
// metadata such as the GPS position removed without touching the pixels, a sensible size); with the alternative text
// WordPress had (or its caption), else the importer's placeholder «[Por escribir] …» that keeps the item from being
// published until a person writes it (src/lib/web/import-marks.ts). Only photos of the old site itself: one hosted
// somewhere else is not brought (the item is flagged). Pure, except fetchPhoto (it downloads through the polite client).
import { createHash } from 'node:crypto';
import { checkWebMediaFile } from '../../src/lib/web/cms/media-file';
import { ALT_PLACEHOLDER } from '../../src/lib/web/import-marks';
import { plainFromHtml, type FoundImage } from './convert';
import { addPii, noPii, scrubText, type PiiCounts } from './pii';

export type WpMediaSize = { source_url: string; width?: number; height?: number; filesize?: number; mime_type?: string };
export type WpMedia = {
  id: number;
  source_url: string;
  mime_type?: string;
  media_type?: string;
  alt_text?: string;
  caption?: { rendered: string };
  media_details?: { width?: number; height?: number; filesize?: number; sizes?: Record<string, WpMediaSize> };
};

export type PhotoWant = {
  /** The key it is remembered by (web_import_media.source_key): «id:<WordPress id>» or «url:<original address>». */
  key: string;
  /** What to download (the size chosen), and a second address to try. */
  url: string;
  fallbackUrl: string | null;
  /** The old address of the original file (/wp-content/uploads/…): its redirect goes to the new file. */
  oldPath: string | null;
  alt: string;
  caption: string;
  altMissing: boolean;
  /** Known size in bytes of what will be downloaded (for the estimate of a dry run). */
  bytes: number | null;
  external: boolean;
  pii: PiiCounts;
};

const UPLOADS = /^\/wp-content\/uploads\/.+\.(?:jpe?g|png|webp|gif|avif|bmp|tiff?|heic)$/i;
const SIZE_SUFFIX = /-\d{1,5}x\d{1,5}(?=\.[a-z0-9]+$)/i;
const SCALED_SUFFIX = /-(?:scaled|rotated|e\d{10,13})(?=\.[a-z0-9]+$)/i;

/** The path of an upload of the old site (/wp-content/uploads/…), or null (another site, not an upload). */
export function uploadsPath(url: string, ownHosts: readonly string[]): string | null {
  try {
    const u = new URL(url);
    if (!ownHosts.includes(u.hostname.toLowerCase())) return null;
    return UPLOADS.test(u.pathname) ? u.pathname : null;
  } catch {
    return null;
  }
}

/** The original file of a size WordPress made: «foto-1024x683.jpg», «foto-scaled.jpg» → «foto.jpg». */
export function originalPath(path: string): string {
  return path.replace(SIZE_SUFFIX, '').replace(SCALED_SUFFIX, '');
}

/** An address of the old site in https, without its query (the same file for every visitor). */
export function cleanPhotoUrl(url: string, ownHosts: readonly string[]): string {
  try {
    const u = new URL(url);
    if (ownHosts.includes(u.hostname.toLowerCase())) u.protocol = 'https:';
    u.search = '';
    u.hash = '';
    return u.toString();
  } catch {
    return url;
  }
}

/** The size to bring: the largest WordPress made with the same proportions and no side over `maxSide`; else the
 * original. Crops (the theme's squares) are never chosen. */
export function chooseSize(m: WpMedia, maxSide: number): { url: string; width: number | null; height: number | null; bytes: number | null } {
  const d = m.media_details ?? {};
  const full = { url: m.source_url, width: d.width ?? null, height: d.height ?? null, bytes: d.filesize ?? null };
  if (!full.width || !full.height) return full;
  if (Math.max(full.width, full.height) <= maxSide) return full;
  const ratio = full.width / full.height;
  let best: typeof full | null = null;
  for (const s of Object.values(d.sizes ?? {})) {
    if (!s?.source_url || !s.width || !s.height) continue;
    if (Math.abs(s.width / s.height - ratio) / ratio > 0.02) continue;
    if (Math.max(s.width, s.height) > maxSide) continue;
    if (!best || s.width > (best.width ?? 0)) best = { url: s.source_url, width: s.width, height: s.height, bytes: s.filesize ?? null };
  }
  return best && Math.max(best.width ?? 0, best.height ?? 0) >= 600 ? best : full;
}

function words(alt: string, caption: string, pii: PiiCounts): { alt: string; caption: string; altMissing: boolean } {
  const clean = (s: string, max: number) => {
    const r = scrubText(plainFromHtml(s).replace(/\s+/g, ' ').trim());
    addPii(pii, r.found);
    return r.text.slice(0, max).trim();
  };
  const cap = clean(caption, 500);
  const own = clean(alt, 300);
  const chosen = own.length >= 3 ? own : cap.length >= 3 ? cap.slice(0, 300) : '';
  return { alt: chosen || ALT_PLACEHOLDER, caption: cap, altMissing: !chosen };
}

/** A photo WordPress knows (the post's photo, or one with its id in the text); the article's own alt text and caption
 * count when the library has none. */
export function wantFromWp(m: WpMedia, ownHosts: readonly string[], maxSide: number, inArticle: { alt?: string; caption?: string } = {}): PhotoWant {
  const pii = noPii();
  const size = chooseSize(m, maxSide);
  const w = words((m.alt_text ?? '').trim() || inArticle.alt || '', m.caption?.rendered || inArticle.caption || '', pii);
  const url = cleanPhotoUrl(size.url, ownHosts);
  const original = cleanPhotoUrl(m.source_url, ownHosts);
  const path = uploadsPath(original, ownHosts);
  return {
    key: `id:${m.id}`,
    url,
    fallbackUrl: url !== original ? original : null,
    oldPath: path ? originalPath(path) : null,
    ...w,
    bytes: size.bytes,
    external: !uploadsPath(url, ownHosts),
    pii,
  };
}

/** A photo found only by its address in the text: its original first (without WordPress's size), then as written. */
export function wantFromImage(img: FoundImage, ownHosts: readonly string[]): PhotoWant {
  const pii = noPii();
  const w = words(img.alt, img.caption, pii);
  // The link around a photo usually points to the full-size file.
  const linked = img.linkHref ? (img.linkHref.startsWith('/') ? `https://${ownHosts[0]}${img.linkHref}` : img.linkHref) : null;
  const src = cleanPhotoUrl(img.src, ownHosts);
  const srcPath = uploadsPath(src, ownHosts);
  const linkPath = linked ? uploadsPath(cleanPhotoUrl(linked, ownHosts), ownHosts) : null;
  const basePath = srcPath ? originalPath(srcPath) : null;
  const best = linkPath && basePath && originalPath(linkPath) === basePath ? cleanPhotoUrl(linked!, ownHosts) : null;
  const original = basePath ? `https://${new URL(src).hostname}${basePath}` : null;
  const url = best ?? original ?? src;
  return {
    key: `url:${basePath ? `https://${ownHosts[0]}${basePath}` : src}`,
    url,
    fallbackUrl: url !== src ? src : null,
    oldPath: basePath,
    ...w,
    bytes: null,
    external: !srcPath,
    pii,
  };
}

export type FetchedPhoto =
  | { ok: true; bytes: Uint8Array; mime: string; ext: string; width: number; height: number; sha256: string }
  | { ok: false; reason: 'missing' | 'unsupported' | 'unreadable' | 'too_big' | 'too_small' | 'failed' };

export interface BytesSource {
  bytes(url: string, maxBytes: number): Promise<Uint8Array | null>;
  /** The bytes of `url` were not a photo that passes the checks: a source that keeps what it downloads drops them, so
   * the next run asks again (a page served as a photo once is never kept for good). */
  forget?(url: string): void;
}

const MAX_DOWNLOAD = 15 * 1024 * 1024;

/** Downloads a photo (or its second address) and checks it like an upload of the team. Never throws for a bad file nor
 * for a photo the old site refuses or fails to send: the post is imported without it (flagged) and the next run tries
 * again. */
export async function fetchPhoto(http: BytesSource, want: PhotoWant): Promise<FetchedPhoto> {
  let last: FetchedPhoto = { ok: false, reason: 'missing' };
  for (const url of [want.url, want.fallbackUrl].filter((u): u is string => !!u)) {
    let bytes: Uint8Array | null;
    try {
      bytes = await http.bytes(url, MAX_DOWNLOAD);
    } catch (e) {
      last = { ok: false, reason: (e as Error).name === 'TooBigError' ? 'too_big' : 'failed' };
      continue;
    }
    if (!bytes) continue;
    // Not an upload: the library's own limit (10 MB), not the 4 MB of a request to Vercel. An empty platform, never
    // `undefined`: that one falls back to process.env.VERCEL, and a build on Vercel would refuse every photo over 4 MB.
    const checked = checkWebMediaFile({ kind: 'image', bytes }, '');
    if (!checked.ok) {
      http.forget?.(url);
      last = { ok: false, reason: checked.status === 415 ? 'unsupported' : checked.status === 413 ? 'too_big' : /pequeña/.test(checked.error) ? 'too_small' : 'unreadable' };
      continue;
    }
    return {
      ok: true,
      bytes: checked.bytes,
      mime: checked.mime,
      ext: checked.ext,
      width: checked.width ?? 0,
      height: checked.height ?? 0,
      sha256: createHash('sha256').update(checked.bytes).digest('hex'),
    };
  }
  return last;
}
