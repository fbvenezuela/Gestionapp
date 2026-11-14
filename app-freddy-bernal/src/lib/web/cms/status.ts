// Where an item of the website is, in the words of the team (design §3, the chips of the lists): the draft's place in
// the flow (web_items.status) is not enough on its own, because a live item keeps its approved snapshot while its draft
// goes back to work, and a scheduled item is live by publish_at before the cron marks it «Publicado». So what the person
// reads is worked out from the snapshot, its time and the archive mark too. Pure.

export type WebStatus = 'draft' | 'in_review' | 'scheduled' | 'published' | 'archived';
export type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info' | 'accent';

export type ItemFlow = {
  status: WebStatus;
  hasPublished: boolean;
  publishAt: Date | string | null;
  archivedAt: Date | string | null;
  draftVersion: number;
  publishedVersion: number | null;
  reviewNote: string | null;
};

export type Chip = { label: string; tone: Tone };

const time = (v: Date | string | null) => (v ? new Date(v).getTime() : 0);

/** The item is on the public site right now (approved snapshot, its time came, not archived). */
export function isLive(f: Pick<ItemFlow, 'hasPublished' | 'publishAt' | 'archivedAt'>, now: Date = new Date()): boolean {
  return f.hasPublished && !f.archivedAt && time(f.publishAt) <= now.getTime();
}

/** Approved and waiting for its time (not on the site yet). */
export function isScheduled(f: Pick<ItemFlow, 'hasPublished' | 'publishAt' | 'archivedAt'>, now: Date = new Date()): boolean {
  return f.hasPublished && !f.archivedAt && time(f.publishAt) > now.getTime();
}

/** The draft has changes that are not what is published (a live or scheduled item being edited again). */
export function hasPendingChanges(f: Pick<ItemFlow, 'hasPublished' | 'draftVersion' | 'publishedVersion'>): boolean {
  return f.hasPublished && f.publishedVersion !== f.draftVersion;
}

/** The page «Atención ciudadana» of «Páginas»: /atencion builds its own texts (src/app/(web)/atencion/page.tsx) and
 * never reads it (APP-20). Wherever it is listed, and in its editor, it says so instead of its flow (R01). */
export function isUnusedPage(f: { kind?: string; slug?: string }): boolean {
  return f.kind === 'page' && f.slug === 'atencion';
}

/** The chips of an item: its main state first, then what else the person should know. A page the web never shows has
 * one chip, «No sale en la web», never «Publicado». */
export function flowChips(f: ItemFlow & { kind?: string; slug?: string }, now: Date = new Date()): Chip[] {
  if (isUnusedPage(f)) return [{ label: 'No sale en la web', tone: 'neutral' }];
  if (f.archivedAt) return [{ label: 'Archivado', tone: 'neutral' }];
  const chips: Chip[] = [];
  if (isLive(f, now)) chips.push({ label: 'Publicado', tone: 'ok' });
  else if (isScheduled(f, now)) chips.push({ label: 'Programado', tone: 'info' });
  if (f.status === 'in_review') chips.push({ label: 'En revisión', tone: 'accent' });
  else if (!f.hasPublished) chips.push({ label: 'Borrador', tone: 'neutral' });
  else if (hasPendingChanges(f)) chips.push({ label: 'Cambios sin publicar', tone: 'warn' });
  if (f.status === 'draft' && f.reviewNote) chips.push({ label: 'Devuelto con comentario', tone: 'danger' });
  return chips;
}

// The status filter of the lists (?estado=…), with the chips' words.
export const STATUS_FILTERS = {
  borrador: 'Borradores',
  revision: 'En revisión',
  programado: 'Programados',
  publicado: 'Publicados',
  archivado: 'Archivados',
} as const;
export type StatusFilter = keyof typeof STATUS_FILTERS;

export function isStatusFilter(v: unknown): v is StatusFilter {
  return typeof v === 'string' && v in STATUS_FILTERS;
}

/** The SQL condition of a filter (columns of web_items; `now()` is the database's). */
export const STATUS_SQL: Record<StatusFilter, string> = {
  borrador: `status = 'draft'`,
  revision: `status = 'in_review'`,
  programado: `published is not null and archived_at is null and publish_at > now()`,
  publicado: `published is not null and archived_at is null and publish_at <= now()`,
  archivado: `archived_at is not null`,
};
