import { BY_EXT, cleanMime, strictMime, type MimeCheck } from '@/lib/domain/media-mime';
import type { MediaKind } from './names';

// What a Drive file may be, and how it is served. Drive files are served from the platform's own
// origin (/api/media), so a file the browser would run (HTML, SVG, XML, scripts) must never be
// stored as one, and only plain media types are ever shown inline. Everything else is a download
// with Content-Type application/octet-stream. The type tables and the per-kind rule live in
// src/lib/domain/media-mime.ts (shared with the other providers).

export { cleanMime, type MimeCheck };

// Shown inline (?ver=1) only for these exact types.
export const INLINE_MIME = new Set(['video/mp4', 'video/quicktime', 'video/webm', 'image/jpeg', 'image/png', 'image/webp', 'audio/mpeg', 'audio/mp4', 'audio/ogg']);

/**
 * The type a Drive file is stored and served with, or a refusal. An empty or generic type
 * (application/octet-stream) takes the one its extension implies; a declared type must match
 * the extension's group and the kind (a «Portada» is a picture; a storyboard a picture or a PDF).
 */
export function driveMime(kind: MediaKind, mime: string, ext: string): MimeCheck {
  return strictMime(kind, mime, ext);
}

/** The extension for a type Drive reports (files picked from Drive have no trusted name). */
export function extForMime(mime: string): string | null {
  const m = cleanMime(mime);
  const order = ['mp4', 'mov', 'webm', 'mkv', '3gp', 'jpg', 'png', 'webp', 'mp3', 'm4a', 'aac', 'ogg', 'wav', 'pdf', 'zip', 'psd'];
  for (const e of order) if (BY_EXT[e].mime === m) return e;
  if (m === 'audio/x-m4a') return 'm4a';
  if (m === 'audio/x-wav') return 'wav';
  if (m === 'application/x-zip-compressed') return 'zip';
  return null;
}

/** How /api/media serves a Drive file: inline only for plain media types and only when asked. */
export function servedAs(mime: string, wantInline: boolean): { type: string; disposition: 'inline' | 'attachment' } {
  const m = cleanMime(mime);
  return wantInline && INLINE_MIME.has(m) ? { type: m, disposition: 'inline' } : { type: 'application/octet-stream', disposition: 'attachment' };
}
