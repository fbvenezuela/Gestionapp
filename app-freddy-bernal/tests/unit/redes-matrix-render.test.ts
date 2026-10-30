// The board of Redes (R4, WP-D, D-71), rendered on the server as /redes does: «Estado del contenido» is a real table
// (caption, column and row headers) on a computer and one block per format on the phone; every number links to a piece
// of its cell in that piece's own section and month (?mes= and #pieza-), and taps go on to the next one and back to the
// first; zero says «¡al día!»; the period (month or quarter) and its arrows; the activity in relative times only; the
// quick actions create in the open month; the search is a plain form. Invented data.
import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }), usePathname: () => '/redes' }));
vi.mock('@/lib/actions/redes', () => ({ chooseMonth: vi.fn(), quickCreate: vi.fn() }));

const { Matrix } = await import('@/components/redes/dashboard/matrix');
const mc = await import('@/components/redes/dashboard/matrix-core');
const { boardHref, boardPeriod } = await import('@/components/redes/dashboard/period-core');
const { PeriodNav } = await import('@/components/redes/dashboard/period-nav');
const { Activity, activityText } = await import('@/components/redes/dashboard/activity');
const { Observations } = await import('@/components/redes/dashboard/observations');
const { QuickActions } = await import('@/components/redes/dashboard/quick-actions');
const { SearchBox } = await import('@/components/redes/dashboard/search-box');
const { Stats } = await import('@/components/redes/dashboard/stats');
const { CATEGORIES, CATEGORY_LABEL, matrix } = await import('@/lib/domain/redes-dashboard');
const { FORMATS, FORMAT } = await import('@/lib/domain/redes');
import type { DashRow } from '@/lib/domain/redes-dashboard';

const M1 = '3f2b8c1e-5d4a-4b6c-9e7f-0a1b2c3d4e5f';
const M2 = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const M3 = '0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e';
const M4 = '5c6d7e8f-9a0b-4c1d-8e2f-3a4b5c6d7e8f';
const id = (n: number) => `11111111-2222-4333-8444-${String(n).padStart(12, '0')}`;
const MONTHS = [
  { id: M1, label: 'Mes 1', ordinal: 1 },
  { id: M2, label: 'Mes 2', ordinal: 2 },
  { id: M3, label: 'Mes 3', ordinal: 3 },
  { id: M4, label: 'Mes 4', ordinal: 4 },
];

function row(n: number, over: Partial<DashRow> = {}): DashRow {
  return {
    id: id(n), format: 'post', status: 'draft', designStatus: null, published: false, rating: null, monthId: M1, sortKey: n,
    currentVersion: 1, mediaMime: 'image/jpeg', mediaW: 1080, mediaH: 1350, coverId: null, slides: [], longCopy: 'Copy de prueba', onScreen: '', postRatio: '4:5',
    ...over,
  };
}

// Two posts without copy (one of them in Mes 2, as «Por trimestre» would bring), one approved reel, nothing else.
const ROWS = [row(1, { longCopy: '' }), row(2, { longCopy: '', monthId: M2 }), row(3, { format: 'reel', status: 'approved', mediaMime: 'video/mp4', coverId: id(90) })];
const props = { cells: matrix(ROWS), monthOf: Object.fromEntries(ROWS.map((r) => [r.id, r.monthId])), fallbackMonthId: M1, period: 'mes-x' };
const html = renderToStaticMarkup(createElement(Matrix, props));
const text = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const amp = (s: string) => s.replace(/&amp;/g, '&');

describe('«Estado del contenido»', () => {
  it('es una tabla de verdad: caption, encabezados de columna y una fila por formato (Fin de mes también)', () => {
    const table = /<table[\s\S]*?<\/table>/.exec(html)![0];
    expect(table).toMatch(/^<table class="hidden w-full table-fixed text-left md:table">/);
    expect(table).toContain('<caption class="sr-only">Estado del contenido</caption>');
    const cols = [...table.matchAll(/<th scope="col"[^>]*>([^<]*)<\/th>/g)].map((m) => m[1]);
    expect(cols).toEqual(['Formato', ...CATEGORIES.map((c) => CATEGORY_LABEL[c])]);
    expect(cols).toEqual(['Formato', 'Revisados', 'Por revisar', 'Diseño aprobado', 'Diseño desaprobado', 'Publicado', 'Copy faltante', 'Imagen faltante']);
    const rows = [...table.matchAll(/<th scope="row"[^>]*>([^<]*)<\/th>/g)].map((m) => m[1]);
    expect(rows).toEqual(FORMATS.map((f) => FORMAT[f].plural));
  });

  it('en el teléfono, un bloque por formato con sus siete cifras en dos columnas (y la tabla escondida)', () => {
    const blocks = /<ul aria-label="Estado del contenido por formato" class="grid gap-3 md:hidden">([\s\S]*)<\/ul><p role="status"/.exec(html)![1];
    const heads = [...blocks.matchAll(/<h3 id="matriz-(\w+)"[^>]*>([^<]*)<\/h3>/g)].map((m) => m[2]);
    expect(heads).toEqual(FORMATS.map((f) => FORMAT[f].plural));
    expect(blocks.match(/grid-cols-2/g)).toHaveLength(FORMATS.length);
    expect(blocks.match(/<li class="flex min-w-0 items-center justify-between gap-2">/g)).toHaveLength(FORMATS.length * CATEGORIES.length);
  });

  it('cada número lleva a una pieza de su casilla, en su sección y su mes, con el ancla de la tarjeta', () => {
    const name = mc.cellName('post', 'copy_missing', 2);
    expect(name).toBe('Posts, Copy faltante: 2. Ir a la siguiente');
    // Twice: the table and the phone block, both pointing at the first piece of the cell (before the page comes alive).
    const links = [...html.matchAll(new RegExp(`<a href="([^"]+)" aria-label="${name}"`, 'g'))].map((m) => amp(m[1]));
    expect(links).toEqual([`/redes/posts?mes=${M1}#pieza-${id(1)}`, `/redes/posts?mes=${M1}#pieza-${id(1)}`]);
    expect(html).toContain(`aria-label="${mc.cellName('reel', 'reviewed', 1)}"`);
  });

  it('la vez siguiente, la que sigue (aunque sea de otro mes del trimestre), y al terminar vuelve a la primera', () => {
    const first = mc.jumpTarget(props, 'post', 'copy_missing', null)!;
    const second = mc.jumpTarget(props, 'post', 'copy_missing', first.id)!;
    const again = mc.jumpTarget(props, 'post', 'copy_missing', second.id)!;
    expect(first.href).toBe(`/redes/posts?mes=${M1}#pieza-${id(1)}`);
    expect(second.href).toBe(`/redes/posts?mes=${M2}#pieza-${id(2)}`);
    expect(again.id).toBe(first.id);
    expect(mc.jumpTarget(props, 'story', 'published', null)).toBeNull();
    expect(mc.cursorKey('post', 'copy_missing', mc.periodKey('quarter', M1, 0))).toBe('fb:redes:cursor:post:copy_missing:trimestre-1');
    expect(mc.periodKey('month', M2, 0)).toBe(`mes-${M2}`);
  });

  it('un cero no lleva a ninguna parte: dice «Nada pendiente»', () => {
    const zero = mc.cellName('youtube', 'image_missing', 0);
    expect(zero).toBe('YouTube, Imagen faltante: 0. Nada pendiente');
    expect(html).toMatch(new RegExp(`<button type="button" aria-label="${zero}"[^>]*>0</button>`));
    expect(html).not.toMatch(new RegExp(`<a [^>]*aria-label="${zero}"`));
    // Every number is big enough for a finger.
    const n = (html.match(/min-h-11 min-w-11/g) ?? []).length;
    expect(n).toBe(2 * FORMATS.length * CATEGORIES.length);
    expect(html.split('data-tour="redes-matrix"').length - 1).toBe(1);
  });
});

describe('el periodo: por mes o por trimestre', () => {
  it('por mes: el mes abierto, y «Anterior»/«Siguiente» van al mes de al lado (apagados en las puntas)', () => {
    const p = boardPeriod(MONTHS, MONTHS[0], 'month');
    expect(p.label).toBe('Mes 1');
    expect(p.ids).toEqual([M1]);
    expect(p.prev).toBeNull();
    expect(p.next).toEqual({ href: `/redes?mes=${M2}`, monthId: M2 });
    expect(boardPeriod(MONTHS, MONTHS[3], 'month').next).toBeNull();
  });

  it('por trimestre: tres meses seguidos de la lista, con su nombre en dos líneas', () => {
    const p = boardPeriod(MONTHS, MONTHS[1], 'quarter');
    expect(p.label).toBe('Trimestre 1');
    expect(p.detail).toBe('Mes 1 a Mes 3');
    expect(p.ids).toEqual([M1, M2, M3]);
    expect(p.next).toEqual({ href: `/redes?mes=${M4}&vista=trimestre`, monthId: M4 });
    const q2 = boardPeriod(MONTHS, MONTHS[3], 'quarter');
    expect(q2.label).toBe('Trimestre 2');
    expect(q2.detail).toBe('Mes 4');
    expect(q2.prev?.href).toBe(`/redes?mes=${M1}&vista=trimestre`);
    expect(boardHref(null, 'quarter')).toBe('/redes?vista=trimestre');
  });

  it('la navegación: «Por mes» / «Por trimestre» marcados, flechas con nombre y la del borde apagada', () => {
    const p = boardPeriod(MONTHS, MONTHS[0], 'quarter');
    const nav = renderToStaticMarkup(
      createElement(PeriodNav, { mode: 'quarter', label: p.label, detail: p.detail, monthHref: boardHref(M1, 'month'), quarterHref: boardHref(M1, 'quarter'), prev: p.prev, next: p.next }),
    );
    expect(nav).toMatch(/data-tour="redes-period"/);
    expect(nav).toMatch(new RegExp(`<a aria-current="page"[^>]*href="/redes\\?mes=${M1}&amp;vista=trimestre">Por trimestre</a>`));
    expect(nav).toMatch(new RegExp(`<a class="[^"]*" href="/redes\\?mes=${M1}">Por mes</a>`));
    expect(nav).toMatch(/<button type="button" disabled="" aria-label="Anterior: trimestre"/);
    expect(nav).toMatch(new RegExp(`<a aria-label="Siguiente: trimestre"[^>]*href="/redes\\?mes=${M4}&amp;vista=trimestre"`));
    expect(text(nav)).toContain('Trimestre 1 Mes 1 a Mes 3');
  });
});

describe('lo de abajo del tablero', () => {
  const CLOCK = /\b\d{1,2}:\d{2}\b|\b[ap]\.\s?m\./i;

  it('la actividad: quién, qué y la pieza, en tiempos relativos (nunca una hora), y cada línea abre la tarjeta', () => {
    const at = new Date(Date.now() - 5 * 60_000).toISOString();
    const out = renderToStaticMarkup(
      createElement(Activity, { items: [{ kind: 'version', pieceId: id(1), title: 'Reel de prueba', format: 'reel', monthId: M2, who: 'Persona de prueba', at }], fallbackMonthId: M1 }),
    );
    expect(text(out)).toContain('Persona de prueba subió una versión de «Reel de prueba»');
    expect(text(out)).toContain('Reel · hace 5 min');
    expect(text(out)).not.toMatch(CLOCK);
    expect(out).toContain(`href="/redes/reels?mes=${M2}#pieza-${id(1)}"`);
    expect(activityText({ kind: 'approved', who: null, title: 'X' })).toBe('Alguien aprobó «X»');
    expect(text(renderToStaticMarkup(createElement(Activity, { items: [], fallbackMonthId: M1 })))).toContain('Sin actividad todavía.');
  });

  it('las observaciones: diseño desaprobado con su nota y avisos abiertos, cada una con su tarjeta', () => {
    const out = renderToStaticMarkup(
      createElement(Observations, {
        items: [
          { kind: 'design', pieceId: id(1), title: 'Post de prueba', format: 'post', monthId: null, text: 'La foto está oscura (prueba).' },
          { kind: 'notice', pieceId: id(2), title: 'Reel de prueba', format: 'reel', monthId: M2, text: 'Verificar el dato (prueba).', noticeKind: 'verify_source' },
        ],
        fallbackMonthId: M1,
      }),
    );
    expect(text(out)).toContain('Diseño desaprobado');
    expect(text(out)).toContain('Aviso: Verificar la fuente y la fecha del dato');
    expect(out).toContain(`href="/redes/posts?mes=${M1}#pieza-${id(1)}"`);
    expect(out).toContain(`href="/redes/reels?mes=${M2}#pieza-${id(2)}"`);
    expect(out.split('data-tour="redes-observations"').length - 1).toBe(1);
  });

  it('las acciones rápidas: los seis formatos (se crean en el mes abierto), el Feed con el mes y los tweets', () => {
    const out = renderToStaticMarkup(createElement(QuickActions, { monthId: M2, monthLabel: 'Mes 2' }));
    expect(out).toMatch(/^<nav aria-label="Crear en Redes"/);
    const buttons = [...out.matchAll(/<span class="block font-semibold">([^<]+)<\/span>/g)].map((m) => m[1]);
    expect(buttons).toEqual([...FORMATS.map((f) => FORMAT[f].newLabel), 'Feed', 'Tweets de la semana', 'Nueva publicación']);
    expect(text(out)).toContain('En Mes 2');
    expect(out).toContain(`href="/redes/feed?mes=${M2}"`);
  });

  it('la búsqueda es un formulario simple a /redes/buscar con el mes abierto', () => {
    const out = renderToStaticMarkup(createElement(SearchBox, { monthId: M1, q: 'agua' }));
    expect(out).toMatch(/^<form role="search" aria-label="Buscar en Redes" data-tour="redes-search"[^>]*action="\/redes\/buscar">/);
    expect(out).toContain(`<input type="hidden" name="mes" value="${M1}"/>`);
    expect(out).toMatch(/name="q"[^>]*value="agua"|value="agua"[^>]*name="q"/);
  });

  it('las cifras de arriba: receptividad solo de lo puntuado, y lo listo y lo programado abren Publicar', () => {
    const out = renderToStaticMarkup(createElement(Stats, { receptivity: { avg: 7.4, count: 12 }, ready: 3, scheduled: 1, periodLabel: 'Mes 1' }));
    expect(text(out)).toContain('Receptividad media 7,4 de 10');
    expect(text(out)).toContain('12 piezas puntuadas en Mes 1');
    expect(out.match(/href="\/publicar"/g)).toHaveLength(2);
    const none = renderToStaticMarkup(createElement(Stats, { receptivity: { avg: null, count: 0 }, ready: 0, scheduled: 0, periodLabel: 'Mes 3' }));
    expect(text(none)).toContain('Sin evaluar');
  });
});
