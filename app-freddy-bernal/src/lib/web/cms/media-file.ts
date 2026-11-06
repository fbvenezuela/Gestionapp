import { sniffPhoto, stripPhotoMetadata } from '../../media/photo-meta';

// A file for the public media library (design §3, §6), checked by the server whatever the browser did: photos are JPEG,
// PNG or WebP by their first bytes (never by the name or the browser's word), cleaned of their metadata without losing
// quality (GPS position, camera, date: src/lib/media/photo-meta.ts) and of a reasonable size; documents are PDFs. The
// browser already made the photo smaller (compressImage); this is the server's own check. Pure.

export const WEB_MEDIA_LIMITS = {
  imageBytes: 10 * 1024 * 1024,
  documentBytes: 20 * 1024 * 1024,
  /** Vercel stops a function's request body at 4.5 MB: there, files up to 4 MB (photos are made smaller before). */
  vercelBytes: 4 * 1024 * 1024,
  minSide: 120,
  maxSide: 12000,
  maxPixels: 60_000_000,
} as const;

export type WebMediaKind = 'image' | 'document';
export type CheckedFile =
  | { ok: true; kind: WebMediaKind; mime: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf'; ext: 'jpg' | 'png' | 'webp' | 'pdf'; bytes: Uint8Array; width: number | null; height: number | null }
  | { ok: false; status: 413 | 415 | 422; error: string };

/** The largest file this deployment takes for each kind. */
export function maxMediaBytes(kind: WebMediaKind, platform: string | undefined = process.env.VERCEL): number {
  const own = kind === 'image' ? WEB_MEDIA_LIMITS.imageBytes : WEB_MEDIA_LIMITS.documentBytes;
  return platform ? Math.min(own, WEB_MEDIA_LIMITS.vercelBytes) : own;
}

const mb = (n: number) => `${Math.round(n / (1024 * 1024))} MB`;

export function checkWebMediaFile(f: { kind: WebMediaKind; bytes: Uint8Array }, platform: string | undefined = process.env.VERCEL): CheckedFile {
  const max = maxMediaBytes(f.kind, platform);
  if (!f.bytes.length) return { ok: false, status: 422, error: 'El archivo está vacío.' };
  if (f.bytes.length > max) return { ok: false, status: 413, error: `El archivo pasa de ${mb(max)}: súbelo más liviano.` };
  if (f.kind === 'document') {
    const head = String.fromCharCode(...f.bytes.subarray(0, 5));
    if (head !== '%PDF-') return { ok: false, status: 415, error: 'Los documentos van en PDF: ese archivo no es un PDF.' };
    return { ok: true, kind: 'document', mime: 'application/pdf', ext: 'pdf', bytes: f.bytes, width: null, height: null };
  }
  const photo = sniffPhoto(f.bytes.subarray(0, 64));
  if (photo !== 'jpeg' && photo !== 'png' && photo !== 'webp') {
    return { ok: false, status: 415, error: 'Las fotos van en JPG, PNG o WebP: ese archivo no es una de ellas.' };
  }
  const clean = stripPhotoMetadata(photo, f.bytes);
  if (!clean) return { ok: false, status: 422, error: 'No pudimos leer esa foto. Ábrela y guárdala de nuevo como JPG, y vuelve a subirla.' };
  const { width, height } = clean;
  if (Math.min(width, height) < WEB_MEDIA_LIMITS.minSide) {
    return { ok: false, status: 422, error: `La foto es muy pequeña (${width} × ${height}): usa una de al menos ${WEB_MEDIA_LIMITS.minSide} píxeles por lado.` };
  }
  if (Math.max(width, height) > WEB_MEDIA_LIMITS.maxSide || width * height > WEB_MEDIA_LIMITS.maxPixels) {
    return { ok: false, status: 422, error: `La foto es demasiado grande (${width} × ${height}): achícala antes de subirla.` };
  }
  const map = { jpeg: ['image/jpeg', 'jpg'], png: ['image/png', 'png'], webp: ['image/webp', 'webp'] } as const;
  const [mime, ext] = map[photo];
  return { ok: true, kind: 'image', mime, ext, bytes: clean.bytes, width, height };
}

/** A same-site request (route handlers check Origin/Host besides the SameSite cookies, design §7). */
export function sameSite(h: { get(name: string): string | null }, url: string): boolean {
  const origin = h.get('origin');
  if (origin) {
    try {
      const host = h.get('x-forwarded-host') ?? h.get('host') ?? new URL(url).host;
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }
  const site = h.get('sec-fetch-site');
  return site === null || site === 'same-origin' || site === 'none';
}

/** The alternative text a person writes, the minimum the database asks (3 letters) and some honest advice. */
export const ALT_HELP =
  'Describe lo que se ve, en pocas palabras, como se lo contarías a alguien que no puede verla: quién, qué hace, dónde. No empieces con «foto de…». Si la foto tiene un texto importante, escríbelo.';
export const ALT_MISSING = 'Falta el texto alternativo: describe en pocas palabras lo que se ve (lo leen los lectores de pantalla).';
