// Media kinds, where each one may go, and the file type a new file is stored with. Pure (no server code): the upload
// action, Google Drive, the labels and the tests share it. The database has the last word:
// media_assets_kind_check, media_assets_storyboard_shape and media_assets_parent_kinds
// (supabase/migrations/20261027001900_media_handoff.sql); tests/unit/media-kinds.test.ts keeps both the same.

export const MEDIA_KINDS = [
  'boss', 'drone', 'broll', 'other', 'final', 'cover', 'editable', 'voice_line', 'evidence', 'tweet_image',
  'storyboard', 'before', 'progress', 'after', 'document',
] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

/** What Grabación records at an event. */
export const RAW_KINDS = ['boss', 'drone', 'broll', 'other'] as const satisfies readonly MediaKind[];
/** What Grabación may upload on an event assigned to it: the raw kinds and the storyboard it recorded with. */
export const CAMERA_KINDS = [...RAW_KINDS, 'storyboard'] as const satisfies readonly MediaKind[];
/** Photos and papers of an obra ficha (IVT). */
export const OBRA_KINDS = ['before', 'progress', 'document'] as const satisfies readonly MediaKind[];
/** Evidence of a community report (política). */
export const REPORT_KINDS = ['before', 'after', 'document'] as const satisfies readonly MediaKind[];
/** The kinds that only go on a ficha. */
export const FICHA_KINDS = ['before', 'progress', 'after', 'document'] as const satisfies readonly MediaKind[];
/** A storyboard file is a picture or a PDF. */
export const STORYBOARD_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;

// ---------------------------------------------------------------------------
// Where a file goes: an event, an obra ficha, a report, or nothing (piece versions, screenshots, tweet images).
// ---------------------------------------------------------------------------
export type UploadTarget = { eventId?: string | null; obraFichaId?: string | null; reportId?: string | null };
export type TargetKind = 'event' | 'obra' | 'report' | 'none';
export type Target = { kind: TargetKind; id: string | null };

/** The one parent of a target, or null when it names more than one. */
export function targetOf(t: UploadTarget): Target | null {
  const set = [t.eventId, t.obraFichaId, t.reportId].filter((x) => x != null && x !== '').length;
  if (set > 1) return null;
  if (t.eventId) return { kind: 'event', id: t.eventId };
  if (t.obraFichaId) return { kind: 'obra', id: t.obraFichaId };
  if (t.reportId) return { kind: 'report', id: t.reportId };
  return { kind: 'none', id: null };
}

const has = (list: readonly string[], k: string) => list.includes(k);

/**
 * Why this kind cannot go to that target (Spanish, for the person), or null when it can. Mirrors the CHECKs of
 * media_assets: one parent, ficha kinds only on their ficha, a storyboard always on its event.
 */
export function kindTargetError(kind: MediaKind, target: Target | null): string | null {
  if (!target) return 'Un archivo va en un solo lugar: un evento, una ficha de obra o un reporte.';
  if (target.kind === 'obra') return has(OBRA_KINDS, kind) ? null : 'En una ficha de obra van fotos de antes, de avance o documentos.';
  if (target.kind === 'report') return has(REPORT_KINDS, kind) ? null : 'En un reporte van fotos de antes, de después o documentos.';
  if (has(FICHA_KINDS, kind)) return 'Las fotos de antes, avance y después van en su ficha.';
  if (kind === 'storyboard' && target.kind !== 'event') return 'El storyboard va en su evento.';
  return null;
}

// ---------------------------------------------------------------------------
// File types. Files are served from the platform's own origin (/api/media, and the demo's temp disk), so a file the
// browser would run (HTML, SVG, XML, scripts) is never stored as one.
// ---------------------------------------------------------------------------
export type Group = 'video' | 'image' | 'audio' | 'doc';

// `also`: a second group the same extension is used for (an .mp4 or .webm that holds only audio).
export const BY_EXT: Record<string, { mime: string; group: Group; also?: Group }> = {
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
export const MIME_GROUP: Record<string, Group> = {
  'video/mp4': 'video', 'video/quicktime': 'video', 'video/webm': 'video', 'video/x-matroska': 'video', 'video/3gpp': 'video',
  'image/jpeg': 'image', 'image/png': 'image', 'image/webp': 'image',
  'audio/mpeg': 'audio', 'audio/mp4': 'audio', 'audio/x-m4a': 'audio', 'audio/aac': 'audio', 'audio/ogg': 'audio', 'audio/wav': 'audio',
  'audio/x-wav': 'audio', 'audio/webm': 'audio',
  'application/pdf': 'doc', 'application/zip': 'doc', 'application/x-zip-compressed': 'doc', 'image/vnd.adobe.photoshop': 'doc',
};

export const KIND_GROUPS: Record<MediaKind, Group[]> = {
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
  storyboard: ['image', 'doc'],
  before: ['image', 'video'],
  progress: ['image', 'video'],
  after: ['image', 'video'],
  document: ['doc', 'image'],
};

// For these kinds a «doc» is a PDF only (no zip, psd or project files): people open them on the phone.
const PDF_ONLY = new Set<MediaKind>(['storyboard', 'document']);

// New this round, so no older upload depends on a looser rule: checked by kind for EVERY provider. (The database
// refuses a storyboard that is not a picture or a PDF; ficha photos are shown to the team as pictures.)
const SHAPED = new Set<MediaKind>(['storyboard', ...FICHA_KINDS]);

// Never stored as themselves: things a browser would run or parse as a document.
export const ACTIVE = /(^text\/)|html|xml|svg|javascript|ecmascript|^multipart\/|^application\/(x-)?sh$/i;

export function cleanMime(mime: string): string {
  return (mime.split(';')[0] ?? '').trim().toLowerCase();
}

const isGeneric = (m: string) => m === '' || m === 'application/octet-stream' || m === 'binary/octet-stream';

export type MimeCheck = { ok: true; mime: string; group: Group } | { ok: false; error: string };

const WRONG = 'Ese tipo de archivo no se puede guardar aquí.';
const PICTURE_OR_PDF = 'Aquí va una foto o un PDF.';

/**
 * The strict check (Google Drive, and the kinds new this round everywhere): a known extension, a declared type that
 * matches its group (an empty or generic type takes the extension's: a PDF from Android with no type is still a PDF)
 * and a group the kind accepts.
 */
export function strictMime(kind: MediaKind, mime: string, ext: string): MimeCheck {
  const m = cleanMime(mime);
  const byExt = BY_EXT[ext.toLowerCase()];
  const refuse = (): MimeCheck => ({ ok: false, error: PDF_ONLY.has(kind) ? PICTURE_OR_PDF : WRONG });
  if (!byExt || ACTIVE.test(m)) return refuse();
  const generic = isGeneric(m);
  const group = generic ? byExt.group : MIME_GROUP[m];
  if (!group || (group !== byExt.group && group !== byExt.also) || !KIND_GROUPS[kind].includes(group)) return refuse();
  const out = generic ? byExt.mime : m;
  if (group === 'doc' && PDF_ONLY.has(kind) && out !== 'application/pdf') return refuse();
  return { ok: true, mime: out, group };
}

export type StoredMime = { ok: true; mime: string } | { ok: false; error: string };

/**
 * The type a new file is stored and served with, for every provider. Drive (`strict`) and the new kinds get the
 * strict check. Elsewhere (the demo disk, Supabase Storage) a known extension fills an empty or generic type (the
 * PDF fallback), and a type the browser would run is stored as a plain download (application/octet-stream) instead
 * of being refused, so no upload that worked before starts failing.
 */
export function storageMime(kind: MediaKind, mime: string, ext: string, strict: boolean): StoredMime {
  if (strict || SHAPED.has(kind)) {
    const c = strictMime(kind, mime, ext);
    return c.ok ? { ok: true, mime: c.mime } : c;
  }
  const m = cleanMime(mime);
  if (ACTIVE.test(m)) return { ok: true, mime: 'application/octet-stream' };
  if (isGeneric(m)) return { ok: true, mime: BY_EXT[ext.toLowerCase()]?.mime ?? 'application/octet-stream' };
  return { ok: true, mime: m };
}
