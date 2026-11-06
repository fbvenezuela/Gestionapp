import { z } from 'zod';
import { blocks, externalUrl, richText, safeHref } from './blocks';

// What each kind of content holds (design §3): the DRAFT the editors save and the snapshot the publisher publishes
// (web_items.draft / published, 20261106000100_web_publica.sql). The database reads a few top-level keys when it
// publishes (title, excerpt, date «YYYY-MM-DD», municipalityId, category, state) to fill its filters, and freezes every
// web_media id it finds. The rest is the app's: validated here before saving and before rendering. No figure without its
// source: an investment, a progress percentage or an indicator's value carry where they come from. Pure.

export const WEB_KINDS = ['page', 'news', 'project', 'episode', 'document', 'notice', 'faq', 'indicator'] as const;
export type WebKind = (typeof WEB_KINDS)[number];

export const WEB_KIND_LABEL: Record<WebKind, string> = {
  page: 'Página',
  news: 'Noticia',
  project: 'Obra o acción',
  episode: 'Reporte Bernal',
  document: 'Documento',
  notice: 'Aviso de servicio',
  faq: 'Pregunta frecuente',
  indicator: 'Indicador',
};

export const WEB_STATUS_LABEL = {
  draft: 'Borrador',
  in_review: 'Espera aprobación',
  scheduled: 'Programado',
  published: 'Publicado',
  archived: 'Archivado',
} as const;

// Categories per kind (the filter column `category`). Fixed lists in the code, with the words people read.
export const NEWS_CATEGORIES = { noticia: 'Noticia', comunicado: 'Comunicado', articulo: 'Artículo', entrevista: 'Entrevista' } as const;
export const PROJECT_CATEGORIES = {
  vialidad: 'Vialidad', agua: 'Agua', electricidad: 'Electricidad', salud: 'Salud', educacion: 'Educación', vivienda: 'Vivienda',
  'deporte-cultura': 'Deporte y cultura', ambiente: 'Ambiente', social: 'Atención social', otros: 'Otros',
} as const;
// Never percentages or amounts without a documented source; the state is what can be said for sure.
export const PROJECT_STATES = { anunciado: 'Anunciado', en_ejecucion: 'En ejecución', concluido: 'Concluido' } as const;
export const DOCUMENT_CATEGORIES = { semanario: 'Semanario', informe: 'Informe', rendicion: 'Rendición de cuentas', normativa: 'Normativa', prensa: 'Kit de prensa', otro: 'Otro' } as const;
export const NOTICE_CATEGORIES = { agua: 'Agua', electricidad: 'Electricidad', vialidad: 'Vialidad', transporte: 'Transporte', salud: 'Salud', general: 'General' } as const;
export const FAQ_GROUPS = { atencion: 'Atención ciudadana', web: 'Esta web', gobernacion: 'La gestión' } as const;

const keysOf = <T extends Record<string, string>>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];
const uuid = z.string().uuid();
const text = (max: number) => z.string().trim().max(max);

/** «YYYY-MM-DD», a real day. */
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha va como AAAA-MM-DD.')
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v), 'Esa fecha no existe.');

/** Where a figure or a statement comes from: a name and, when there is one, its address. */
export const source = z.object({ label: text(200).min(2), url: externalUrl.optional() });
export type Source = z.infer<typeof source>;

/** Search engines and social networks (editable, and approved with the rest: it lives in the snapshot). */
export const seo = z.object({
  title: text(70).optional(),
  description: text(170).optional(),
  imageId: uuid.nullable().optional(),
  canonical: safeHref.optional(),
  noindex: z.boolean().optional(),
});

// The keys every kind shares. `date` is the date shown and filtered by (the database's display_date).
const base = {
  title: text(160).min(1, 'Falta el título.'),
  excerpt: text(400).optional(),
  date: isoDate.optional(),
  coverId: uuid.nullable().optional(),
  seo: seo.optional(),
};

export const pageSnapshot = z.object({ ...base, blocks });

export const newsSnapshot = z.object({
  ...base,
  category: z.enum(keysOf(NEWS_CATEGORIES)),
  author: text(120).optional(),
  municipalityId: uuid.nullable().optional(),
  body: richText.default([]),
  galleryIds: z.array(uuid).max(24).optional(),
  sources: z.array(source).max(20).optional(),
  topics: z.array(text(40).min(1)).max(12).optional(),
  // A YouTube video of the note (the site shows it with the lite player, after the text). The importer of the old
  // site puts here the first video an article had (scripts/web-import).
  youtubeId: z.string().regex(/^[A-Za-z0-9_-]{11}$/, 'El código del video de YouTube tiene 11 caracteres.').nullable().optional(),
});

export const projectSnapshot = z.object({
  ...base,
  category: z.enum(keysOf(PROJECT_CATEGORIES)),
  state: z.enum(keysOf(PROJECT_STATES)),
  municipalityId: uuid.nullable(),
  // The parish, town or sector as people say it (no invented parish catalogue, D-35).
  place: text(200).optional(),
  description: richText.default([]),
  beneficiaries: text(200).optional(),
  organization: text(160).optional(),
  investment: z.object({ amount: z.number().positive(), currency: z.enum(['VES', 'USD']), source }).optional(),
  progress: z.object({ percent: z.number().int().min(0).max(100), source }).optional(),
  dates: z.object({ announced: isoDate.optional(), started: isoDate.optional(), finished: isoDate.optional(), expected: isoDate.optional() }).optional(),
  evidenceIds: z.array(uuid).max(24).optional(),
  updatedOn: isoDate.optional(),
  youtubeId: z.string().regex(/^[A-Za-z0-9_-]{11}$/).nullable().optional(),
});

export const episodeSnapshot = z.object({
  ...base,
  // Null until the real video is linked: the site shows its placeholder (the demo never names a real video).
  youtubeId: z.string().regex(/^[A-Za-z0-9_-]{11}$/, 'El código del video de YouTube tiene 11 caracteres.').nullable(),
  topics: z.array(text(40).min(1)).max(12).optional(),
  links: z.array(source.extend({ url: externalUrl })).max(10).optional(),
  minutes: z.number().int().min(1).max(600).optional(),
});

export const documentSnapshot = z.object({
  ...base,
  category: z.enum(keysOf(DOCUMENT_CATEGORIES)),
  // The PDF in the library (frozen at publish); null while it is not uploaded.
  fileId: uuid.nullable(),
  versionLabel: text(60).optional(),
  pages: z.number().int().min(1).max(5000).optional(),
});

export const noticeSnapshot = z.object({
  ...base,
  category: z.enum(keysOf(NOTICE_CATEGORIES)),
  body: text(1200).min(1),
  // The municipalities it affects (none: the whole state). `municipalityId` only when it is one.
  municipalityIds: z.array(uuid).max(29).default([]),
  municipalityId: uuid.nullable().optional(),
  updatedAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }).nullable(),
});

export const faqSnapshot = z.object({
  ...base,
  // title = the question.
  category: z.enum(keysOf(FAQ_GROUPS)),
  answer: richText.min(1),
  order: z.number().int().min(0).max(1000).optional(),
});

export const indicatorSnapshot = z.object({
  ...base,
  // title = the label («Viviendas entregadas»).
  value: z.number().finite(),
  unit: text(40).optional(),
  // Shown only with its source (design §3).
  source: source.nullable(),
  asOf: isoDate.optional(),
  // Computed from the platform's own data (later): what it counts.
  computedFrom: z.enum(['attended_requests', 'projects_concluded']).nullable().optional(),
  order: z.number().int().min(0).max(1000).optional(),
});

export const SNAPSHOT = {
  page: pageSnapshot,
  news: newsSnapshot,
  project: projectSnapshot,
  episode: episodeSnapshot,
  document: documentSnapshot,
  notice: noticeSnapshot,
  faq: faqSnapshot,
  indicator: indicatorSnapshot,
} as const;

export type Snapshot<K extends WebKind = WebKind> = z.infer<(typeof SNAPSHOT)[K]>;

export type ParsedSnapshot<K extends WebKind> = { ok: true; data: Snapshot<K> } | { ok: false; error: string };

/** A draft or a published snapshot of that kind, checked (the first problem in the person's words). */
export function parseSnapshot<K extends WebKind>(kind: K, value: unknown): ParsedSnapshot<K> {
  const r = SNAPSHOT[kind].safeParse(value);
  if (r.success) return { ok: true, data: r.data as Snapshot<K> };
  const issue = r.error.issues[0];
  return { ok: false, error: issue ? `${issue.message}${issue.path.length ? ` (${issue.path.join('.')})` : ''}` : 'Revisa los datos.' };
}

/** A web address piece: lowercase letters, numbers and dashes (web_items.slug's shape). */
export const slug = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'La dirección va en minúsculas, números y guiones.')
  .max(120);

/** «Huecos en la avenida (demo)» → «huecos-en-la-avenida-demo», cut at 80 characters on a dash. */
export function slugFromTitle(title: string): string {
  const s = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (s.length <= 80) return s || 'contenido';
  const cut = s.slice(0, 80);
  return cut.slice(0, cut.lastIndexOf('-') > 40 ? cut.lastIndexOf('-') : 80).replace(/-+$/g, '');
}

/** Whether a notice still applies at `now` (no expiry, or expiry later). */
export function noticeActive(n: Pick<Snapshot<'notice'>, 'expiresAt'>, now: Date = new Date()): boolean {
  return !n.expiresAt || Date.parse(n.expiresAt) > now.getTime();
}

/** Whether an indicator may be shown: only with its source. */
export function indicatorShown(i: Pick<Snapshot<'indicator'>, 'source'>): boolean {
  return !!i.source && i.source.label.trim().length >= 2;
}
