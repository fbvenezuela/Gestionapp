// Which picture a publication shows in Resultados and in the boss's Digital (cambios del 27/10/2026, §6: «cada
// publicación en Resultados lleva su miniatura, la portada del video o la imagen»). Pure: the page reads the
// candidate files with the person's RLS and this decides the order; the picture itself always comes through
// /api/media/<id>/thumb (permissions checked again there), and MediaThumb tries the next file when one has none.
//
// Order:
//   1. the piece's cover: the one the publication went out with, then the approved version's;
//   2. the final file of the approved version: the picture itself, or a video's frame kept at upload;
//   3. the screenshot saved with «Ya lo publiqué» (or with the boss's own post);
//   4. no picture: an icon for the format.
// The boss's spontaneous posts have no piece: only their screenshot, or the icon.

export type ThumbFile = { id: string | null | undefined; mime: string | null | undefined };

export type PubThumbInput = {
  origin: string;
  network: string;
  format: string;
  /** publications.cover_asset_id: the approved cover, copied when the publication was made. */
  cover?: ThumbFile;
  /** The approved (or current) version's cover. */
  versionCover?: ThumbFile;
  /** The approved (or current) version's final file: a video or a picture. */
  versionMedia?: ThumbFile;
  /** publications.evidence_asset_id: the screenshot of the post. */
  evidence?: ThumbFile;
};

export type PubIcon = 'video' | 'image' | 'carousel' | 'text';

export type PubThumb = { ids: string[]; icon: PubIcon };

const VIDEO_FORMATS = new Set(['reel', 'video', 'short', 'story']);
const TEXT_NETWORKS = new Set(['x', 'threads']);

/**
 * A file can give a picture when the person could read it (the page only gets a mime for a ready, live file
 * under their RLS) and it is a picture or a video. A PDF, an audio file or an unreadable row never shows.
 */
export function canShow(f: ThumbFile | undefined): f is { id: string; mime: string } {
  return !!f?.id && !!f.mime && (f.mime.startsWith('image/') || f.mime.startsWith('video/'));
}

/** The icon when there is no picture: by format, then by the final file, then by network. */
export function pubIcon(p: Pick<PubThumbInput, 'network' | 'format' | 'versionMedia'>): PubIcon {
  if (VIDEO_FORMATS.has(p.format)) return 'video';
  if (p.format === 'carousel') return 'carousel';
  if (p.format === 'photo') return 'image';
  const mime = p.versionMedia?.mime ?? '';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('image/')) return 'image';
  if (TEXT_NETWORKS.has(p.network)) return 'text';
  if (p.network === 'tiktok' || p.network === 'youtube') return 'video';
  return 'image';
}

/** The files to try, in order, each once, and the icon for when none has a picture. */
export function thumbSources(p: PubThumbInput): PubThumb {
  const order = p.origin === 'boss_spontaneous' ? [p.evidence] : [p.cover, p.versionCover, p.versionMedia, p.evidence];
  const ids: string[] = [];
  for (const f of order) if (canShow(f) && !ids.includes(f.id)) ids.push(f.id);
  return { ids, icon: pubIcon(p) };
}
