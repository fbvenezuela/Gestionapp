// The board's table (R4, D-71), pure: what each number says and where it jumps. The counting is the domain's
// (src/lib/domain/redes-dashboard.ts matrix()); this only names the cells, keeps each cell's place in the tab and builds
// the address of the next piece. No React here, so the table, the phone blocks and the tests read the same words.

import { FORMAT, sectionHref, type Format } from '@/lib/domain/redes';
import { CATEGORY_LABEL, nextInCell, type Category, type Matrix } from '@/lib/domain/redes-dashboard';

export type MatrixProps = {
  cells: Matrix; // formats × categories → the pieces' ids, in the order of each section
  monthOf: Record<string, string | null>; // each piece's month: in «Por trimestre» the next piece may be another month's
  fallbackMonthId: string | null; // the open month, for a piece with no month (an old database)
  period: string; // 'mes-<id>' or 'trimestre-<n>': each period keeps its own place in each cell
};

/** Where a cell remembers the last piece it opened, in this tab (sessionStorage). */
export const cursorKey = (f: Format, c: Category, period: string) => `fb:redes:cursor:${f}:${c}:${period}`;

/** The period part of the key: the month, or the quarter's number. */
export const periodKey = (mode: 'month' | 'quarter', monthId: string | null, quarter: number) =>
  mode === 'quarter' ? `trimestre-${quarter + 1}` : `mes-${monthId ?? 'ninguno'}`;

/** What a screen reader hears on each number: «Reels, Copy faltante: 3. Ir a la siguiente». */
export function cellName(f: Format, c: Category, n: number): string {
  return n > 0 ? `${FORMAT[f].plural}, ${CATEGORY_LABEL[c]}: ${n}. Ir a la siguiente` : `${FORMAT[f].plural}, ${CATEGORY_LABEL[c]}: 0. Nada pendiente`;
}

/** A piece's card in its section, with its own month and its anchor (the section opens it and gives it the focus). */
export function pieceHref(f: Format, id: string, monthOf: Record<string, string | null>, fallback: string | null): string {
  return sectionHref(FORMAT[f].slug, monthOf[id] ?? fallback, id);
}

/** The next piece of a cell after `last` (the first one the first time, the first again after the last). */
export function jumpTarget(p: Pick<MatrixProps, 'cells' | 'monthOf' | 'fallbackMonthId'>, f: Format, c: Category, last: string | null): { id: string; href: string } | null {
  const id = nextInCell(p.cells[f][c], last);
  return id ? { id, href: pieceHref(f, id, p.monthOf, p.fallbackMonthId) } : null;
}

// Categories that say something is missing or wrong: their numbers go amber when there is something.
export const WARN_CATEGORIES: ReadonlySet<Category> = new Set<Category>(['to_review', 'design_bad', 'copy_missing', 'image_missing']);
