// Names the platform gives to what it creates in Drive, and to downloads. Rule 4: never a date,
// a time or a place. Only fixed words, the event code (E-0042, a sequence) and the label the
// platform itself wrote («Jefe hablando 2»). The person's original file name is never used.
// The code is the file's parent: an event (E-0042), an obra ficha (O-0001) or a community report (R-0001).

import { MEDIA_KINDS, type MediaKind } from '@/lib/domain/media-mime';

export { MEDIA_KINDS, type MediaKind };

export const ROOT_FOLDER_MARK = { key: 'fb360', value: 'root' } as const;

const TYPE_FOLDER: Record<MediaKind, string> = {
  boss: 'Videos',
  drone: 'Videos',
  broll: 'Videos',
  other: 'Videos',
  final: 'Videos',
  cover: 'Portadas',
  editable: 'Documentos',
  voice_line: 'Audios',
  evidence: 'Fotos',
  tweet_image: 'Fotos',
  storyboard: 'Documentos',
  before: 'Fotos',
  progress: 'Fotos',
  after: 'Fotos',
  document: 'Documentos',
};

// Group folder for files with no parent code (a storyboard and the ficha kinds always have one; these are fallbacks).
const NO_EVENT_GROUP: Record<MediaKind, string> = {
  boss: 'Piezas',
  drone: 'Piezas',
  broll: 'Piezas',
  other: 'Piezas',
  final: 'Piezas',
  cover: 'Piezas',
  editable: 'Piezas',
  voice_line: 'Piezas',
  evidence: 'Capturas',
  tweet_image: 'Tweets',
  storyboard: 'Piezas',
  before: 'Fichas',
  progress: 'Fichas',
  after: 'Fichas',
  document: 'Fichas',
};

// E-0042 (event), O-0001 (obra ficha), R-0001 (community report): a letter and a sequence, never a date.
export const GROUP_CODE = /^[EOR]-\d{1,8}$/;

/** «Videos/E-0042», «Fotos/O-0001», «Fotos/Capturas», ... A bad code falls back to the no-parent group. */
export function driveFolderPath(kind: MediaKind, code: string | null): string {
  const group = code && GROUP_CODE.test(code) ? code : NO_EVENT_GROUP[kind];
  return `${TYPE_FOLDER[kind]}/${group}`;
}

/** Only letters, digits and dashes: accents dropped, everything else becomes one dash. */
export function slug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

/**
 * <event code or «pieza»>-<label>.<ext>, e.g. «E-0042-Jefe-hablando-1.mp4». The name Drive
 * stores and the name a download gets are the same.
 */
export function mediaFileName(eventCode: string | null, label: string, ext: string): string {
  const base = slug(`${eventCode ?? 'pieza'}-${label}`) || 'archivo';
  const e = /^[a-z0-9]{1,5}$/i.test(ext) ? `.${ext.toLowerCase()}` : '';
  return `${base}${e}`;
}

/** The extension at the end of a storage path («<uuid>.mp4» → «mp4»). */
export function extOf(storagePath: string): string {
  const m = /\.([a-z0-9]{1,5})$/i.exec(storagePath);
  return m ? m[1].toLowerCase() : 'bin';
}
