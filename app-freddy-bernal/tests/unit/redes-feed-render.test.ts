// The feed of the month (R4, WP-D, D-69, F11), rendered on the server as /redes/feed does: the #1 is the last cell
// (bottom right) and the #24 the first (top left), from cellToNumber only; a published piece has a green frame and says
// so in words too; before the page knows the pointer (and on a phone) a filled cell is a button that opens its menu, so
// nothing depends on a mouse; only a fine pointer makes cells draggable, with a link to the card and a named «⋯»; the
// profile header has no Instagram user; and each tutorial anchor of the feed is there once. Invented data.
import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }), usePathname: () => '/redes/feed' }));
vi.mock('@/lib/actions/redes', () => ({ feedPlace: vi.fn(), feedSwap: vi.fn(), feedClear: vi.fn(), movePieceToMonth: vi.fn() }));

const { FeedGrid } = await import('@/components/redes/feed/feed-grid');
const { FeedCell } = await import('@/components/redes/feed/feed-cell');
const { FeedProfile } = await import('@/components/redes/feed/feed-profile');
const core = await import('@/components/redes/feed/feed-core');
const { FEED_SIZE, cellToNumber, numberToCell } = await import('@/lib/domain/redes');
const { brand } = await import('@/lib/client-config');
import type { FeedCell as Cell, FeedPiece, PickerItem } from '@/lib/data/redes';

const M1 = '3f2b8c1e-5d4a-4b6c-9e7f-0a1b2c3d4e5f';
const M2 = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const id = (n: number) => `11111111-2222-4333-8444-${String(n).padStart(12, '0')}`;
const THUMB = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function piece(num: number, over: Partial<FeedPiece> = {}): FeedPiece {
  return { pieceId: id(num), num, format: 'post', title: `Pieza de prueba ${num}`, thumbIds: [THUMB], state: 'draft', ready: false, published: false, rating: null, ...over };
}

// The same cells getFeed builds: cell 0 = top left, the number from cellToNumber.
function cells(placed: Record<number, Partial<FeedPiece>>): Cell[] {
  return Array.from({ length: FEED_SIZE }, (_, cell) => {
    const num = cellToNumber(cell);
    return { cell, num, piece: placed[num] ? piece(num, placed[num]) : null };
  });
}

const EMPTY_PICKER = { post: [] as PickerItem[], reel: [] as PickerItem[], carousel: [] as PickerItem[] };
const MONTHS = [{ id: M1, label: 'Mes 1', ordinal: 1 }, { id: M2, label: 'Mes 2', ordinal: 2 }];
const drag = { over: null, onDragStart: () => {}, onDragEnd: () => {}, onDragOver: () => {}, onDragLeave: () => {}, onDrop: () => {} };

const grid = (placed: Record<number, Partial<FeedPiece>>) =>
  renderToStaticMarkup(
    createElement(FeedGrid, {
      monthId: M1, monthLabel: 'Mes 1', months: MONTHS, cells: cells(placed), filled: Object.keys(placed).length, avg: 7.4, picker: EMPTY_PICKER,
      profile: createElement(FeedProfile, { count: Object.keys(placed).length, monthLabel: 'Mes 1' }),
    }),
  );
const cell = (c: Cell, fine: boolean) =>
  renderToStaticMarkup(createElement(FeedCell, { cell: c, monthId: M1, fine, onPick: () => {}, onMenu: () => {}, drag, busy: false }));
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
// Each <li> of the grid, in document order, with what is inside.
const items = (html: string) => [...html.matchAll(/<li id="espacio-(\d+)"[^>]*>([\s\S]*?)<\/li>/g)].map((m) => ({ num: Number(m[1]), open: m[0].slice(0, m[0].indexOf('>') + 1), inner: m[2] }));

describe('la rejilla: 24 espacios, el #1 abajo a la derecha', () => {
  it('el orden de las celdas sale de cellToNumber: la primera es el #24 y la última el #1', () => {
    const html = grid({ 1: { published: true }, 5: {}, 24: {} });
    const li = items(html);
    expect(li).toHaveLength(24);
    expect(li[0].num).toBe(24);
    expect(li[23].num).toBe(1);
    expect(li.map((x) => x.num)).toEqual(Array.from({ length: 24 }, (_, i) => cellToNumber(i)));
    // Three columns: the #1 is the third of the last row, the #24 the first of the first one.
    expect(numberToCell(1) % 3).toBe(2);
    expect(Math.floor(numberToCell(1) / 3)).toBe(7);
    expect(numberToCell(24)).toBe(0);
    expect(html).toContain('style="grid-template-columns:repeat(3, minmax(0, 1fr))"');
  });

  it('una celda vacía dice «Elegir publicación · Espacio #NN» y es un botón', () => {
    const li = items(grid({})).find((x) => x.num === 7)!;
    expect(li.inner).toMatch(/^<button type="button" data-cell-focus=""/);
    expect(text(li.inner)).toBe('Elegir publicación · Espacio #07');
  });

  it('lo publicado lleva el marco verde y lo dice con palabras («✓ Publicado»), no solo con el color', () => {
    const li = items(grid({ 1: { published: true, rating: 9 } })).find((x) => x.num === 1)!;
    expect(li.open).toMatch(/ring-4 ring-ok/);
    expect(li.inner).toContain('Publicado');
    // The cell's name, for screen readers (on the phone only ✓ shows).
    expect(li.inner).toMatch(/aria-label="#1 · Post · «Pieza de prueba 1» · Publicado\. Opciones"/);
    expect(text(li.inner)).toContain('9');
  });

  it('sin miniatura, la celda muestra el título; el número sale arriba a la derecha', () => {
    const li = items(grid({ 10: { thumbIds: [], title: 'Jornada de prueba sin archivo' } })).find((x) => x.num === 10)!;
    expect(text(li.inner)).toContain('Jornada de prueba sin archivo');
    expect(text(li.inner)).toContain('#10');
  });
});

describe('sin ratón: el menú de la celda es el camino (dedo y teclado)', () => {
  it('antes de saber el puntero (y en el teléfono) la celda llena es un botón que abre el menú, sin arrastrar', () => {
    const html = grid({ 5: {} });
    const li = items(html).find((x) => x.num === 5)!;
    expect(li.inner).toMatch(/^<button type="button" data-cell-focus="" aria-haspopup="dialog" aria-label="#5 · Post · «Pieza de prueba 5»\. Opciones"/);
    expect(html).not.toContain('draggable="true"');
    expect(li.inner).not.toContain('<a ');
  });

  it('con puntero fino: la celda se arrastra, es un enlace a su tarjeta y el «⋯» tiene nombre', () => {
    const c = cells({ 7: { format: 'reel' } }).find((x) => x.num === 7)!;
    const fine = cell(c, true);
    expect(fine).toMatch(/<li id="espacio-7"[^>]*draggable="true"/);
    expect(fine).toContain(`href="/redes/reels?mes=${M1}#pieza-${id(7)}"`);
    expect(fine).toMatch(/aria-label="#7 · Reel · «Pieza de prueba 7»: abrir la tarjeta"/);
    expect(fine).toMatch(/<button type="button" data-cell-focus="" aria-label="Opciones del #7" aria-haspopup="dialog"/);
    // A finger: no drag, no link; the whole cell opens the menu.
    const touch = cell(c, false);
    expect(touch).not.toContain('draggable="true"');
    expect(touch).not.toContain('href=');
    expect(touch).toMatch(/aria-haspopup="dialog"/);
  });

  it('las acciones del menú dicen adónde va la pieza, y en los bordes no se pasan', () => {
    expect(core.beforeLabel(7)).toBe('Publicar antes (#6)');
    expect(core.afterLabel(7)).toBe('Publicar después (#8)');
    expect(core.canBefore(1)).toBe(false);
    expect(core.canAfter(24)).toBe(false);
    expect(core.canBefore(2) && core.canAfter(23)).toBe(true);
    expect(core.optionsLabel(5)).toBe('Opciones del #5');
  });
});

describe('el selector, la línea en vivo y «Vaciar este mes»', () => {
  const here = { month: 'Mes 1', num: 7 };
  const item = (over: Partial<PickerItem>): PickerItem => ({ id: id(1), title: 'X', thumbIds: [], hasMedia: true, monthId: M1, monthLabel: 'Mes 1', otherMonth: false, place: null, ...over });

  it('cada título dice dónde está: «En este espacio», «Ya en Mes 1 · #4», «De Mes 2», «Sin media»', () => {
    expect(core.pickerTags(item({ place: { month: 'Mes 1', num: 7 } }), here).map((t) => t.text)).toEqual(['En este espacio']);
    expect(core.pickerTags(item({ place: { month: 'Mes 1', num: 4 } }), here).map((t) => t.text)).toEqual(['Ya en Mes 1 · #4']);
    expect(core.pickerTags(item({ otherMonth: true, monthLabel: 'Mes 2', hasMedia: false }), here).map((t) => t.text)).toEqual(['De Mes 2', 'Sin media']);
    expect(core.pickerTags(item({}), here)).toEqual([]);
    expect(core.pickerTitle('Mes 1', 7)).toBe('Mes 1 · Espacio #07');
    expect(core.moveAsk('Mes 1', 4)).toBe('Está en Mes 1 · #4. ¿La mueves a este espacio?');
    expect(core.titlesCount(1)).toBe('1 título');
    expect(core.titlesCount(8)).toBe('8 títulos');
  });

  it('la línea en vivo cuenta los espacios y la receptividad (solo lo puntuado); «Vaciar» avisa que no borra nada', () => {
    expect(core.feedLiveText(21, 7.4)).toBe('21 de 24 espacios ocupados en este mes · receptividad media 7,4');
    expect(core.feedLiveText(0, null)).toBe('0 de 24 espacios ocupados en este mes');
    expect(core.clearMonthText('Mes 1', 21)).toBe('¿Vaciar el feed de «Mes 1»? Las 21 piezas colocadas quedan «Sin programar»: no se borra ninguna y siguen en su sección. Los demás meses no se tocan.');
    expect(core.clearMonthText('Mes 2', 1)).toContain('La pieza colocada queda «Sin programar»');
    const html = grid({ 3: {} });
    expect(text(html)).toContain('1 de 24 espacios ocupados en este mes · receptividad media 7,4');
    expect(html).toMatch(/<p role="status" aria-live="polite"/);
    expect(text(html)).toContain('Vaciar este mes');
  });

  it('cada ancla de los tutoriales del feed sale una vez', () => {
    const html = grid({ 3: {} });
    for (const a of ['feed-grid', 'feed-live', 'feed-clear-month']) expect(html.split(`data-tour="${a}"`).length - 1, a).toBe(1);
    expect(html).toMatch(/<ol aria-label="Feed de Mes 1: el #1, abajo a la derecha, es el primero que sale" data-tour="feed-grid"/);
  });
});

describe('la cabecera de perfil', () => {
  it('solo lo que ya está en la configuración: las letras del logo, el nombre, el cargo y cuántas hay; sin usuario', () => {
    const html = renderToStaticMarkup(createElement(FeedProfile, { count: 21, monthLabel: 'Mes 1' }));
    expect(text(html)).toBe(`${brand.logoText} ${brand.clientName} ${brand.clientTitle} 21 publicaciones en Mes 1`);
    expect(html).not.toContain('@');
    expect(text(html)).not.toMatch(/seguidores|followers|bio/i);
    // The brand's colour comes from the tokens (the accent is the brand's themeColor), its text keeps AA.
    expect(html).toContain('bg-accent text-xl font-bold text-on-accent');
    expect(core.profileCount(1, 'Mes 2')).toBe('1 publicación en Mes 2');
  });
});
