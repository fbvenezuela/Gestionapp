import type { MediaKind } from './names';

// What a Drive file may be, and how it is served. Drive files are served from the platform's own
// origin (/api/media), so a file the browser would run (HTML, SVG, XML, scripts) must never be
// stored as one, and only plain media types are ever shown inline. Everything else is a download
// with Content-Type application/octet-stream.

type Group = 'video' | 'image' | 'audio' | 'doc';

// `also`: a second group the same extension is used for (an .mp4 or .webm that holds only audio).
const BY_EXT: Record<string, { mime: string; group: Group; also?: Group }> = {
  mp4: { mime: 'video/mp4', group: 'video', also: 'audio' },
  m4v: { mime: 'video/mp4', group: 'video' },
  mov: { mime: 'video/quicktime', group: 'video' },
  webm: { mime: 'video/webm', group: 'video', also: 'audio' },
  mkv: { mime: 'video/x-matroska', group: 'video' },
  '3gp': { mime: 'video/3gpp', group: 'video' },
  jpg: { mime: 'image/jpeg', group: 'image' },
  jpeg: { mime: 'image/jpeg', group: 'image' },
  png: { mime: 'image/png', group: 'image' },
  webp: { mime: 'image/webp', group: 'image' },
  mp3: { mime: 'audio/mpeg', group: 'audio' },
  m4a: { mime: 'audio/mp4', group: 'audio' },
  aac: { mime: 'audio/aac', group: 'audio' },
  ogg: { mime: 'audio/ogg', group: 'audio' },
  oga: { mime: 'audio/ogg', group: 'audio' },
  opus: { mime: 'audio/ogg', group: 'audio' },
  wav: { mime: 'audio/wav', group: 'audio' },
  pdf: { mime: 'application/pdf', group: 'doc' },
  zip: { mime: 'application/zip', group: 'doc' },
  psd: { mime: 'image/vnd.adobe.photoshop', group: 'doc' },
  prproj: { mime: 'application/octet-stream', group: 'doc' },
  aep: { mime: 'application/octet-stream', group: 'doc' },
};

// Accepted declared types per group (besides the one the extension implies).
const MIME_GROUP: Record<string, Group> = {
  'video/mp4': 'video', 'video/quicktime': 'video', 'video/webm': 'video', 'video/x-matroska': 'video', 'video/3gpp': 'video',
  'image/jpeg': 'image', 'image/png': 'image', 'image/webp': 'image',
  'audio/mpeg': 'audio', 'audio/mp4': 'audio', 'audio/x-m4a': 'audio', 'audio/aac': 'audio', 'audio/ogg': 'audio', 'audio/wav': 'audio',
  'audio/x-wav': 'audio', 'audio/webm': 'audio',
  'application/pdf': 'doc', 'application/zip': 'doc', 'application/x-zip-compressed': 'doc', 'image/vnd.adobe.photoshop': 'doc',
};

const KIND_GROUPS: Record<MediaKind, Group[]> = {
  boss: ['video', 'image', 'audio'],
  drone: ['video', 'image', 'audio'],
  broll: ['video', 'image', 'audio'],
  other: ['video', 'image', 'audio'],
  final: ['video', 'image'],
  cover: ['image'],
  evidence: ['image'],
  tweet_image: ['image'],
  voice_line: ['audio', 'video'],
  editable: ['doc', 'video', 'image', 'audio'],
};

// Never stored, whatever the kind: things a browser would run or parse as a document.
const ACTIVE = /(^text\/)|html|xml|svg|javascript|ecmascript|^multipart\/|^application\/(x-)?sh$/i;

// Shown inline (?ver=1) only for these exact types.
export const INLINE_MIME = new Set(['video/mp4', 'video/quicktime', 'video/webm', 'image/jpeg', 'image/png', 'image/webp', 'audio/mpeg', 'audio/mp4', 'audio/ogg']);

export function cleanMime(mime: string): string {
  return (mime.split(';')[0] ?? '').trim().toLowerCase();
}

export type MimeCheck = { ok: true; mime: string; group: Group } | { ok: false; error: string };

const WRONG = 'Ese tipo de archivo no se puede guardar aquí.';

/**
 * The type a Drive file is stored and served with, or a refusal. An empty or generic type
 * (application/octet-stream) takes the one its extension implies; a declared type must match
 * the extension's group and the kind (a «Portada» is a picture).
 */
export function driveMime(kind: MediaKind, mime: string, ext: string): MimeCheck {
  const m = cleanMime(mime);
  const e = ext.toLowerCase();
  const byExt = BY_EXT[e];
  if (!byExt || ACTIVE.test(m)) return { ok: false, error: WRONG };
  const generic = m === '' || m === 'application/octet-stream' || m === 'binary/octet-stream';
  const group = generic ? byExt.group : MIME_GROUP[m];
  if (!group || (group !== byExt.group && group !== byExt.also) || !KIND_GROUPS[kind].includes(group)) return { ok: false, error: WRONG };
  return { ok: true, mime: generic ? byExt.mime : m, group };
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
