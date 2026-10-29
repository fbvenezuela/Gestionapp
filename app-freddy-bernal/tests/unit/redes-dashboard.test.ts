// The board of Redes (R4, D-71) and the section bar (F1): seven columns from one matrix, the jump to the NEXT piece of
// a cell (not always the same one), quarters of three months in a row, and the receptivity average of the rated
// pieces only (the reference counted the rest as 0). Pure: no database.
import { describe, it, expect } from 'vitest';
import {
  ACTIVITY_VERB, CATEGORIES, CATEGORY_LABEL, categoriesOf, fmtAverage, matrix, navCounts, nextInCell, periodCount, periodMonths, receptivityAverage, type DashRow,
} from '@/lib/domain/redes-dashboard';
import type { Month } from '@/lib/domain/redes';

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let seq = 0;
const row = (x: Partial<DashRow> & Pick<DashRow, 'format'>): DashRow => ({
  id: ID(++seq), status: 'draft', designStatus: null, published: false, rating: null, monthId: ID(900), sortKey: seq,
  currentVersion: 1, mediaMime: null, coverId: null, slides: [], longCopy: '', onScreen: '', postRatio: '4:5', ...x,
});

describe('las siete columnas', () => {
  it('tienen sus nombres en español', () => {
    expect(CATEGORIES.map((c) => CATEGORY_LABEL[c])).toEqual(['Revisados', 'Por revisar', 'Diseño aprobado', 'Diseño desaprobado', 'Publicado', 'Copy faltante', 'Imagen faltante']);
  });

  it('una pieza cae en varias a la vez, nunca en «Revisados» y «Por revisar» juntas', () => {
    const p = row({ format: 'post', status: 'approved', designStatus: 'approved', published: true, mediaMime: 'image/jpeg', longCopy: 'Copy' });
    expect(categoriesOf(p)).toEqual(['reviewed', 'design_ok', 'published']);
    const d = row({ format: 'post', status: 'changes_requested', designStatus: 'disapproved' });
    expect(categoriesOf(d)).toEqual(['to_review', 'design_bad', 'copy_missing', 'image_missing']);
    expect(categoriesOf(row({ format: 'post', status: 'archived', mediaMime: 'image/jpeg', longCopy: 'x' }))).toEqual([]);
  });

  it('historias: «Copy faltante» mira el texto en pantalla (no cuenta todas las historias)', () => {
    const conTexto = row({ format: 'story', mediaMime: 'image/jpeg', onScreen: '¿Qué obra quieres ver?' });
    const sinTexto = row({ format: 'story', mediaMime: 'image/jpeg' });
    const m = matrix([conTexto, sinTexto]);
    expect(m.story.copy_missing).toEqual([sinTexto.id]);
    expect(m.story.image_missing).toEqual([]);
  });

  it('carrusel con una lámina sin imagen: «Imagen faltante»', () => {
    const c = row({ format: 'carousel', slides: [ID(1), null, ID(2)], longCopy: 'x' });
    const ok = row({ format: 'carousel', slides: [ID(1), ID(2)], longCopy: 'x' });
    expect(matrix([c, ok]).carousel.image_missing).toEqual([c.id]);
  });

  it('cada casilla trae los ids en el orden de la sección', () => {
    const a = row({ format: 'reel', sortKey: 3 });
    const b = row({ format: 'reel', sortKey: 1 });
    const c = row({ format: 'reel', sortKey: 2 });
    expect(matrix([a, b, c]).reel.to_review).toEqual([b.id, c.id, a.id]);
    // The six formats are always there, empty or not.
    expect(Object.keys(matrix([]))).toEqual(['reel', 'post', 'carousel', 'story', 'youtube', 'month_end']);
  });
});

describe('cada número lleva a la siguiente pieza de su casilla', () => {
  const ids = [ID(1), ID(2), ID(3)];
  it('la primera vez a la primera, después a la que sigue, y vuelve al principio', () => {
    expect(nextInCell(ids, null)).toBe(ID(1));
    expect(nextInCell(ids, ID(1))).toBe(ID(2));
    expect(nextInCell(ids, ID(2))).toBe(ID(3));
    expect(nextInCell(ids, ID(3))).toBe(ID(1));
  });
  it('si la última ya no está, empieza de nuevo; vacía no lleva a ninguna', () => {
    expect(nextInCell(ids, ID(9))).toBe(ID(1));
    expect(nextInCell([], ID(1))).toBeNull();
  });
});

describe('por mes y por trimestre', () => {
  const months: Month[] = [1, 2, 3, 4, 5].map((n) => ({ id: ID(100 + n), label: `Mes ${n}`, ordinal: n }));
  it('un mes es uno; un trimestre son tres seguidos de la lista (el último puede quedar corto)', () => {
    expect(periodCount(months, 'month')).toBe(5);
    expect(periodCount(months, 'quarter')).toBe(2);
    expect(periodMonths(months, 'month', 1)).toEqual({ label: 'Mes 2', ids: [ID(102)], index: 1 });
    expect(periodMonths(months, 'quarter', 0)).toEqual({ label: 'Mes 1 a Mes 3', ids: [ID(101), ID(102), ID(103)], index: 0 });
    expect(periodMonths(months, 'quarter', 1)).toEqual({ label: 'Mes 4 a Mes 5', ids: [ID(104), ID(105)], index: 1 });
  });
  it('un índice fuera de la lista se queda en el borde; sin meses, nada', () => {
    expect(periodMonths(months, 'quarter', 7).index).toBe(1);
    expect(periodMonths(months, 'month', -3).index).toBe(0);
    expect(periodMonths([], 'month', 0)).toEqual({ label: '', ids: [], index: 0 });
    expect(periodMonths(months.slice(0, 1), 'quarter', 0).label).toBe('Mes 1');
  });
});

describe('receptividad media', () => {
  it('cuenta solo las puntuadas, y solo posts, reels y carruseles', () => {
    const rows = [
      row({ format: 'post', rating: 8 }), row({ format: 'reel', rating: 7 }), row({ format: 'carousel', rating: null }),
      row({ format: 'post', rating: null }), row({ format: 'story', rating: 1 }),
    ];
    expect(receptivityAverage(rows)).toEqual({ avg: 7.5, count: 2 });
    expect(fmtAverage(7.5)).toBe('7,5');
    expect(receptivityAverage([row({ format: 'post' })])).toEqual({ avg: null, count: 0 });
    expect(fmtAverage(null)).toBe('—');
  });
});

describe('actividad reciente', () => {
  it('cada tipo dice su verbo en español', () => {
    expect(ACTIVITY_VERB.version).toBe('subió una versión de');
    expect(Object.values(ACTIVITY_VERB).every((v) => v.length > 2)).toBe(true);
  });
});

describe('la barra de secciones', () => {
  it('revisadas de su cupo, sin copy y sin imagen, de la misma matriz; fin de mes sin cupo', () => {
    const rows = [
      row({ format: 'post', status: 'approved', mediaMime: 'image/jpeg', longCopy: 'x' }),
      row({ format: 'post', status: 'in_review', mediaMime: 'image/jpeg' }),
      row({ format: 'post' }),
      row({ format: 'month_end', status: 'approved', slides: [ID(1)], longCopy: 'x' }),
    ];
    const n = navCounts(rows, { post: 8, reel: 12 });
    expect(n.post).toEqual({ reviewed: 1, quota: 8, copyMissing: 2, imageMissing: 1 });
    expect(n.reel).toEqual({ reviewed: 0, quota: 12, copyMissing: 0, imageMissing: 0 });
    expect(n.story.quota).toBeNull();
    expect(n.month_end).toEqual({ reviewed: 1, quota: null, copyMissing: 0, imageMissing: 0 });
  });
});
