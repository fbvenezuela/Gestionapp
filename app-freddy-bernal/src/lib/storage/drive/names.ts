// Names the platform gives to what it creates in Drive, and to downloads. Rule 4: never a date,
// a time or a place. Only fixed words, the event code (E-0042, a sequence) and the label the
// platform itself wrote («Jefe hablando 2»). The person's original file name is never used.

export const MEDIA_KINDS = ['boss', 'drone', 'broll', 'other', 'final', 'cover', 'editable', 'voice_line', 'evidence', 'tweet_image'] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

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
};

// Group folder for files with no event.
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
};

const EVENT_CODE = /^E-\d{1,8}$/;

/** «Videos/E-0042», «Fotos/Capturas», ... A bad code falls back to the no-event group. */
export function driveFolderPath(kind: MediaKind, eventCode: string | null): string {
  const group = eventCode && EVENT_CODE.test(eventCode) ? eventCode : NO_EVENT_GROUP[kind];
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
