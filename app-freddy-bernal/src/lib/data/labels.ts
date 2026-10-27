import type { Tone } from '@/components/ui/chip';
import type { MediaKind } from '@/lib/domain/media-mime';

export const WORK_STATUS: Record<string, { label: string; tone: Tone }> = {
  brief: { label: 'Ficha', tone: 'neutral' },
  storyboard: { label: 'Storyboard', tone: 'info' },
  recording: { label: 'Por grabar', tone: 'warn' },
  material: { label: 'Material listo', tone: 'accent' },
  editing: { label: 'En edición', tone: 'info' },
  published: { label: 'Publicado', tone: 'ok' },
};

export const BOSS_DECISION: Record<string, { label: string; tone: Tone }> = {
  pending: { label: 'Por decidir', tone: 'warn' },
  accepted: { label: 'Aceptado', tone: 'ok' },
  rejected: { label: 'Rechazado', tone: 'danger' },
};

// The shared agenda (27/10/2026): what an event is and who proposed it (events.kind, events.origin). What the
// ex-Secretaría proposed reads «Despacho» (origin), whoever created it.
export const EVENT_KIND: Record<string, string> = {
  event: 'Evento',
  obra_visit: 'Visita de obra',
  community: 'Actividad comunitaria',
};

export const EVENT_ORIGIN: Record<string, string> = {
  dispatch: 'Propuesto por Despacho',
  boss: 'Lo agregó el jefe',
  ivt: 'Nació de una ficha del IVT',
  politics: 'Nació de un reporte de política',
};

export const PIECE_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: 'Borrador', tone: 'neutral' },
  in_review: { label: 'Por aprobar', tone: 'warn' },
  changes_requested: { label: 'Cambios pedidos', tone: 'danger' },
  approved: { label: 'Aprobada', tone: 'ok' },
  archived: { label: 'Archivada', tone: 'neutral' },
};

export const PIECE_KIND: Record<string, string> = {
  video: 'Video',
  short: 'Video corto',
  cover: 'Portada',
  carousel: 'Carrusel',
  photo: 'Foto',
};

// Also the start of each file's name («Jefe hablando 2», «Antes 1»): never a date, a time or a place.
export const MEDIA_KIND: Record<string, string> = {
  boss: 'Jefe hablando',
  drone: 'Dron',
  broll: 'Tomas de apoyo',
  other: 'Otros',
  final: 'Video final',
  cover: 'Portada',
  editable: 'Editable',
  voice_line: 'Audio del jefe',
  evidence: 'Captura',
  tweet_image: 'Imagen de tweet',
  storyboard: 'Storyboard',
  before: 'Antes',
  progress: 'Avance',
  after: 'Después',
  document: 'Documento',
} satisfies Record<MediaKind, string>;

export const TWEET_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: 'Por aprobar', tone: 'warn' },
  approved: { label: 'Aprobado', tone: 'info' },
  scheduled: { label: 'Programado', tone: 'accent' },
  published: { label: 'Publicado', tone: 'ok' },
  failed: { label: 'Falló', tone: 'danger' },
  skipped: { label: 'Saltado', tone: 'neutral' },
};

export const PUB_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: 'Borrador', tone: 'neutral' },
  scheduled: { label: 'Programada', tone: 'accent' },
  published: { label: 'Publicada', tone: 'ok' },
  failed: { label: 'Falló', tone: 'danger' },
};

export const NETWORK_LABEL: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  threads: 'Threads',
  x: 'X',
  youtube: 'YouTube',
};

export const LENGTH_GROUP: Record<string, { label: string; networks: string }> = {
  long: { label: 'Largo', networks: 'Instagram, TikTok y Facebook' },
  medium: { label: 'Medio', networks: 'Threads' },
  short: { label: 'Corto', networks: 'X' },
};

// Long fields: the phone keyboard's microphone dictates (on the device in many cases) and needs nothing from us.
export const DICTATE_HINT = 'Puedes dictar: toca el micrófono del teclado.';
