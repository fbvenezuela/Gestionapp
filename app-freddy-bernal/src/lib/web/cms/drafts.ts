import type { core } from 'zod';
import { BLOCK_LABEL, type BlockType } from '../blocks';
import { marksText, removedMarksIn } from '../import-marks';
import { SNAPSHOT, type WebKind } from '../schema';

// The drafts of the website's administrator (design §3): how a new item starts, the names of its fields in the team's
// words, and what is still missing before it can go to approval. A draft may be saved half done (the work of a day is
// never lost); what goes to approval, to the preview and to the public is checked whole with the kind's schema
// (src/lib/web/schema.ts) plus the rules the schema cannot say: an indicator only with its source, a document only with
// its PDF, a notice that does not expire before it was updated. Pure.

/** «YYYY-MM-DD» of a moment in the Táchira (the app's time zone). */
export function dayIn(tz: string, at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

/** How a new item of each kind starts (pages are not created: they are the site's own). */
export function emptyDraft(kind: WebKind, title: string, opts: { tz?: string; now?: Date } = {}): Record<string, unknown> {
  const now = opts.now ?? new Date();
  const date = dayIn(opts.tz ?? 'America/Caracas', now);
  switch (kind) {
    case 'news':
      return { title, excerpt: '', date, category: 'noticia', author: '', municipalityId: null, coverId: null, body: [], galleryIds: [], sources: [], topics: [] };
    case 'project':
      return { title, excerpt: '', date, category: 'otros', state: 'anunciado', municipalityId: null, place: '', description: [], coverId: null, evidenceIds: [] };
    case 'episode':
      return { title, excerpt: '', date, youtubeId: null, topics: [], links: [] };
    case 'document':
      return { title, excerpt: '', date, category: 'otro', fileId: null, versionLabel: '' };
    case 'notice':
      return { title, excerpt: '', date, category: 'general', body: '', municipalityIds: [], municipalityId: null, updatedAt: now.toISOString(), expiresAt: null };
    case 'faq':
      return { title, category: 'atencion', answer: [] };
    case 'indicator':
      return { title, value: 0, unit: '', source: null, asOf: date, computedFrom: null };
    case 'page':
      return { title, excerpt: '', blocks: [] };
  }
}

// --- The names of the fields -------------------------------------------------------------------------------------
const COMMON: Record<string, string> = {
  title: 'Título',
  excerpt: 'Resumen',
  date: 'Fecha',
  coverId: 'Foto principal',
  seo: 'Buscadores y redes',
  category: 'Categoría',
  municipalityId: 'Municipio',
  topics: 'Temas',
  sources: 'Fuentes',
  blocks: 'Bloques',
};

export const FIELD_LABELS: Record<WebKind, Record<string, string>> = {
  page: { ...COMMON },
  news: { ...COMMON, author: 'Firma', body: 'Texto', galleryIds: 'Galería', youtubeId: 'Video de YouTube' },
  project: {
    ...COMMON, state: 'Estado', place: 'Parroquia, localidad o sector', description: 'De qué se trata', beneficiaries: 'Para quién',
    organization: 'Organismo responsable', investment: 'Inversión', progress: 'Avance', dates: 'Fechas', evidenceIds: 'Evidencias',
    updatedOn: 'Última actualización', youtubeId: 'Video de YouTube',
  },
  episode: { ...COMMON, youtubeId: 'Video de YouTube', links: 'Enlaces', minutes: 'Duración' },
  document: { ...COMMON, fileId: 'Archivo PDF', versionLabel: 'Versión', pages: 'Páginas' },
  notice: { ...COMMON, body: 'Texto del aviso', municipalityIds: 'Municipios', updatedAt: 'Actualizado', expiresAt: 'Vence' },
  faq: { ...COMMON, title: 'Pregunta', category: 'Grupo', answer: 'Respuesta', order: 'Orden' },
  indicator: { ...COMMON, title: 'Qué se cuenta', value: 'Cifra', unit: 'Unidad', source: 'Fuente', asOf: 'Fecha del dato', computedFrom: 'Cálculo', order: 'Orden' },
};

const SUB_LABELS: Record<string, string> = {
  title: 'título', description: 'descripción', imageId: 'imagen para redes', canonical: 'dirección canónica', label: 'nombre', url: 'enlace',
  amount: 'monto', currency: 'moneda', source: 'fuente', percent: 'porcentaje', announced: 'anunciada', started: 'inicio', finished: 'fin',
  expected: 'fin estimado', text: 'texto', href: 'enlace', items: 'puntos', runs: 'texto', cite: 'autor', mediaId: 'foto', mediaIds: 'fotos',
  ctaLabel: 'texto del botón', ctaHref: 'enlace del botón', youtubeId: 'video', ids: 'contenidos elegidos', limit: 'cuántos', content: 'texto',
};

/** «Bloque 2 (Portada con foto) · título», «Fuentes · 1 · enlace»: where a problem is, for a person. */
export function fieldPath(kind: WebKind, path: readonly PropertyKey[], blocks?: unknown): string {
  if (!path.length) return '';
  const [head, ...rest] = path;
  const parts: string[] = [FIELD_LABELS[kind][String(head)] ?? String(head)];
  const at = rest[0];
  if (head === 'blocks' && typeof at === 'number') {
    const type = Array.isArray(blocks) ? ((blocks[at] as { type?: string } | undefined)?.type as BlockType | undefined) : undefined;
    parts[0] = `Bloque ${at + 1}${type && BLOCK_LABEL[type] ? ` (${BLOCK_LABEL[type]})` : ''}`;
    rest.splice(0, rest[1] === 'data' ? 2 : 1);
  }
  for (const p of rest) {
    if (typeof p === 'number') parts.push(String(p + 1));
    else if (SUB_LABELS[String(p)]) parts.push(SUB_LABELS[String(p)]);
  }
  return parts.join(' · ');
}

// Zod's own words are in English: the problems a person reads are said here (the schemas' own messages win).
const sizeWord = (origin: string | undefined, n: number | bigint, big: boolean) => {
  if (origin === 'string') return big ? `Hasta ${n} letras.` : Number(n) <= 1 ? 'No puede quedar vacío.' : `Al menos ${n} letras.`;
  if (origin === 'array' || origin === 'set') return big ? `Hasta ${n}.` : Number(n) <= 1 ? 'Elige o agrega al menos uno.' : `Al menos ${n}.`;
  return big ? `El número va hasta ${n}.` : `El número va desde ${n}.`;
};

export const spanishIssue: core.$ZodErrorMap = (iss) => {
  switch (iss.code) {
    case 'invalid_type':
      return iss.input === undefined || iss.input === null ? 'Falta este dato.' : 'Este dato no tiene la forma esperada.';
    case 'too_small':
      return sizeWord(iss.origin, iss.minimum, false);
    case 'too_big':
      return sizeWord(iss.origin, iss.maximum, true);
    case 'invalid_format':
      return iss.format === 'datetime' ? 'La fecha y hora no es válida.' : 'El formato no es válido.';
    case 'invalid_value':
      return 'Elige una opción de la lista.';
    case 'invalid_union':
      return 'Este dato no tiene la forma esperada.';
    default:
      return undefined;
  }
};

export type Issue = { path: string; message: string };

/** Everything the kind's schema says is missing or wrong, in the person's words (empty = it fits). */
export function snapshotIssues(kind: WebKind, value: unknown): Issue[] {
  const r = SNAPSHOT[kind].safeParse(value, { error: spanishIssue });
  if (r.success) return [];
  const blocks = (value as { blocks?: unknown } | null)?.blocks;
  const seen = new Set<string>();
  const out: Issue[] = [];
  for (const i of r.error.issues) {
    const issue = { path: fieldPath(kind, i.path, blocks), message: i.message };
    const key = `${issue.path}|${issue.message}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(issue);
    }
  }
  return out;
}

/** What the schema cannot say but the site needs before an item goes to approval (design §3). */
export function readinessIssues(kind: WebKind, value: unknown): Issue[] {
  const v = (value ?? {}) as Record<string, unknown>;
  const out: Issue[] = [];
  if (kind === 'indicator') {
    const s = v.source as { label?: unknown } | null | undefined;
    if (!s || typeof s.label !== 'string' || s.label.trim().length < 2) {
      out.push({ path: FIELD_LABELS.indicator.source, message: 'Un indicador sale en la web solo con su fuente: escribe de dónde sale la cifra.' });
    }
  }
  if (kind === 'document' && !v.fileId) {
    out.push({ path: FIELD_LABELS.document.fileId, message: 'Sube el PDF del documento antes de enviarlo.' });
  }
  if (kind === 'notice' && typeof v.updatedAt === 'string' && typeof v.expiresAt === 'string' && Date.parse(v.expiresAt) <= Date.parse(v.updatedAt)) {
    out.push({ path: FIELD_LABELS.notice.expiresAt, message: 'El aviso vence antes de su actualización: revisa las fechas.' });
  }
  // What the importer of the old site took out (an email, a phone, an ID number) left a mark: a person rewrites that
  // sentence (src/lib/web/import-marks.ts; the database refuses to publish it anyway).
  const marks = removedMarksIn(v);
  if (marks.length) {
    out.push({ path: '', message: `Quedó ${marksText(marks)} donde el importador quitó un dato personal: reescribe esa frase.` });
  }
  return out;
}

/** Every problem before sending to approval or publishing (schema first, then the site's rules). */
export function draftProblems(kind: WebKind, value: unknown): Issue[] {
  const schema = snapshotIssues(kind, value);
  return schema.length ? schema : readinessIssues(kind, value);
}

export const issueText = (i: Issue) => (i.path ? `${i.path}: ${i.message}` : i.message);

/** Every library id a draft names (any string that is a uuid, at any depth), like publish_web_item freezes them. */
export function mediaIdsIn(value: unknown): string[] {
  const out = new Set<string>();
  const walk = (x: unknown) => {
    if (typeof x === 'string') {
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x)) out.add(x);
    } else if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === 'object') Object.values(x).forEach(walk);
  };
  walk(value);
  return [...out];
}
