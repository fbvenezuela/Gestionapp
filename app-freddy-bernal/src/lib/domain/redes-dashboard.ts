// The board of Redes (R4, D-71) and the section bar's numbers (F1), from one matrix: formats × seven categories, for
// the month or the quarter. Each cell holds the pieces' ids in the order of their section, so a tap on a number goes
// to the next piece of that cell (nextInCell) and comes back to the first after the last. Pure: the reads give the
// rows (src/lib/data/redes.ts), this counts them. A piece never counted twice in one cell; rating counts only when
// someone rated it (D-65: the reference counted the rest as 0).

import { FORMATS, QUOTA_FORMATS, type Format, type Month, type NavCount } from './redes';
import { copyMissing, imageMissing, type PieceFacts } from './format-rules';

export type { NavCount };

export const CATEGORIES = ['reviewed', 'to_review', 'design_ok', 'design_bad', 'published', 'copy_missing', 'image_missing'] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL: Record<Category, string> = {
  reviewed: 'Revisados',
  to_review: 'Por revisar',
  design_ok: 'Diseño aprobado',
  design_bad: 'Diseño desaprobado',
  published: 'Publicado',
  copy_missing: 'Copy faltante',
  image_missing: 'Imagen faltante',
};

// What «Por revisar» counts: not approved yet (a draft, changes requested or waiting for the boss). Archived: neither.
const TO_REVIEW = new Set(['draft', 'changes_requested', 'in_review']);
const RATED_FORMATS: ReadonlySet<Format> = new Set<Format>(['post', 'reel', 'carousel']);

export type DashRow = PieceFacts & {
  id: string;
  status: string;
  designStatus: string | null;
  published: boolean;
  rating: number | null;
  monthId: string | null;
  sortKey: number; // its place in the section (sort_order, newest first on a tie)
};

export type Matrix = Record<Format, Record<Category, string[]>>;

const emptyRow = (): Record<Category, string[]> =>
  Object.fromEntries(CATEGORIES.map((c) => [c, [] as string[]])) as unknown as Record<Category, string[]>;

/** The categories one piece falls in (several at once: approved, design approved and published, say). */
export function categoriesOf(r: DashRow): Category[] {
  const out: Category[] = [];
  if (r.status === 'approved') out.push('reviewed');
  else if (TO_REVIEW.has(r.status)) out.push('to_review');
  if (r.designStatus === 'approved') out.push('design_ok');
  if (r.designStatus === 'disapproved') out.push('design_bad');
  if (r.published) out.push('published');
  if (copyMissing(r)) out.push('copy_missing');
  if (imageMissing(r)) out.push('image_missing');
  return out;
}

/** Formats × categories → the ids, in the order of each section. */
export function matrix(rows: DashRow[]): Matrix {
  const m = Object.fromEntries(FORMATS.map((f) => [f, emptyRow()])) as unknown as Matrix;
  const ordered = [...rows].sort((a, b) => a.sortKey - b.sortKey || a.id.localeCompare(b.id));
  for (const r of ordered) {
    if (!m[r.format]) continue;
    for (const c of categoriesOf(r)) m[r.format][c].push(r.id);
  }
  return m;
}

/** The piece after `last` in a cell; the first when `last` is not there (or none yet); back to the first at the end. */
export function nextInCell(ids: string[], last: string | null): string | null {
  if (!ids.length) return null;
  const at = last ? ids.indexOf(last) : -1;
  return ids[at < 0 ? 0 : (at + 1) % ids.length];
}

export type PeriodMode = 'month' | 'quarter';

/** How many periods the list of months gives: one per month, or one per three months in a row («trimestre»). */
export function periodCount(months: Month[], mode: PeriodMode): number {
  if (!months.length) return 0;
  return mode === 'month' ? months.length : Math.ceil(months.length / 3);
}

/** The months of period `index` (clamped): one month, or three in a row of the list. «Mes 1 a Mes 3». */
export function periodMonths(months: Month[], mode: PeriodMode, index: number): { label: string; ids: string[]; index: number } {
  const n = periodCount(months, mode);
  if (!n) return { label: '', ids: [], index: 0 };
  const i = Math.min(Math.max(0, Math.floor(index) || 0), n - 1);
  if (mode === 'month') return { label: months[i].label, ids: [months[i].id], index: i };
  const group = months.slice(i * 3, i * 3 + 3);
  const label = group.length === 1 ? group[0].label : `${group[0].label} a ${group[group.length - 1].label}`;
  return { label, ids: group.map((m) => m.id), index: i };
}

/** The average receptivity (1 to 10, one decimal) of the rated posts, reels and carousels, and how many count. */
export function receptivityAverage(rows: Pick<DashRow, 'format' | 'rating'>[]): { avg: number | null; count: number } {
  const rated = rows.filter((r) => RATED_FORMATS.has(r.format) && r.rating !== null && r.rating >= 1);
  if (!rated.length) return { avg: null, count: 0 };
  const sum = rated.reduce((a, r) => a + (r.rating ?? 0), 0);
  return { avg: Math.round((sum / rated.length) * 10) / 10, count: rated.length };
}

/** «7,4» (Venezuelan decimal comma). */
export function fmtAverage(avg: number | null): string {
  return avg === null ? '—' : avg.toFixed(1).replace('.', ',');
}

/** The section bar (F1): per format, the reviewed of its quota, without copy and without image, from the matrix. */
export function navCounts(rows: DashRow[], quotas: Partial<Record<Format, number>>): Record<Format, NavCount> {
  const m = matrix(rows);
  const quota = (f: Format): number | null => ((QUOTA_FORMATS as readonly Format[]).includes(f) ? (quotas[f] ?? null) : null);
  return Object.fromEntries(
    FORMATS.map((f) => [f, { reviewed: m[f].reviewed.length, quota: quota(f), copyMissing: m[f].copy_missing.length, imageMissing: m[f].image_missing.length }]),
  ) as Record<Format, NavCount>;
}

/** Zero in a cell: what the board says instead of a dead number. */
export const CELL_EMPTY = 'Nada pendiente en esta categoría: ¡al día!';

// «Actividad reciente» (D-71): «Yorman subió una versión de «Reel nuevo» · hace 5 min». Who, the verb, the title.
export type ActivityKind = 'created' | 'version' | 'approved' | 'changes_requested' | 'published' | 'design_ok' | 'design_bad' | 'notice';
export const ACTIVITY_VERB: Record<ActivityKind, string> = {
  created: 'creó',
  version: 'subió una versión de',
  approved: 'aprobó',
  changes_requested: 'pidió cambios en',
  published: 'publicó',
  design_ok: 'aprobó el diseño de',
  design_bad: 'desaprobó el diseño de',
  notice: 'puso un aviso en',
};
