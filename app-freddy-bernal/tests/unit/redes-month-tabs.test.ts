// The month tabs of Redes and what sits under them (R4, WP-C1, D-67, D-68, F2, F14), rendered on the server: every tab a
// link with ?mes= (the month follows in every section and in the feed), «+ Nuevo mes» always visible after the tabs, the
// «⋯» of the open month («Cambiar nombre», «Borrar este mes» only for who may and while another month is left), the
// month's quota that never blocks, and the six formats of «¿Qué quieres crear?». Invented data.
import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }), usePathname: () => '/redes/reels' }));
vi.mock('@/lib/actions/redes', () => ({ chooseMonth: vi.fn(), createMonth: vi.fn(), renameMonth: vi.fn(), deleteMonth: vi.fn(), quickCreate: vi.fn() }));

const { MonthTabs } = await import('@/components/redes/month-tabs');
const { MONTH_SLOT } = await import('@/components/redes/card/card-core');
const { QuotaLine, quotaText } = await import('@/components/redes/quota-line');
const { CREATE_TITLE } = await import('@/components/redes/create-sheet');
const { FORMAT, FORMATS, deleteMonthText, sectionHref } = await import('@/lib/domain/redes');

const M1 = '3f2b8c1e-5d4a-4b6c-9e7f-0a1b2c3d4e5f';
const M2 = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const M3 = '0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e';
const months = [
  { id: M1, label: 'Mes 1', ordinal: 1 },
  { id: M2, label: 'Mes 2', ordinal: 2 },
  { id: M3, label: 'Mes 3', ordinal: 3 },
];
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const links = (html: string) =>
  [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => ({ href: /href="([^"]*)"/.exec(m[1])![1].replace(/&amp;/g, '&'), current: /aria-current="page"/.test(m[1]), text: text(m[2]) }));
const tabs = (over: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(MonthTabs, {
      months, active: M2, counts: { [M1]: 9, [M2]: 2 }, quotaLabel: '12', hrefFor: (id: string) => sectionHref('reels', id), canCreate: true, canDelete: true,
      totals: { [M2]: { pieces: 5, placed: 3 } }, ...over,
    }),
  );

describe('las pestañas de los meses', () => {
  it('cada pestaña es un enlace con ?mes=, la abierta marcada, con «N de cupo»', () => {
    const html = tabs();
    expect(html).toMatch(/^<nav aria-label="Meses de contenido" data-tour="month-tabs"/);
    expect(links(html).map((l) => [l.text, l.href, l.current])).toEqual([
      ['Mes 1 · 9 de 12', `/redes/reels?mes=${M1}`, false],
      ['Mes 2 · 2 de 12', `/redes/reels?mes=${M2}`, true],
      ['Mes 3 · 0 de 12', `/redes/reels?mes=${M3}`, false],
    ]);
    // Every tab is big enough for a finger.
    expect(html.match(/<a [^>]*min-h-11/g)?.length).toBe(3);
  });

  it('«+ Nuevo mes» siempre a la vista después de las pestañas, con su ancla', () => {
    const html = tabs();
    expect(html).toMatch(/<button type="button" data-tour="month-new"[^>]*>\+ Nuevo mes<\/button>/);
    expect(html.indexOf('Nuevo mes')).toBeGreaterThan(html.indexOf('Mes 3 · 0 de 12'));
    expect(tabs({ canCreate: false })).not.toContain('Nuevo mes');
    // The new month's address is the tab's with the id in its place.
    expect(sectionHref('reels', MONTH_SLOT)).toBe(`/redes/reels?mes=${MONTH_SLOT}`);
  });

  it('el «⋯» del mes abierto: cambiar nombre y borrar (Redes y el jefe, si queda otro mes)', () => {
    const t = text(tabs());
    expect(t).toContain('Cambiar nombre');
    expect(t).toContain('Borrar este mes');
    expect(tabs()).toContain('aria-label="Opciones de Mes 2"');
    // Administración renames but does not delete; without the totals nothing can be said first, so no delete.
    expect(text(tabs({ canDelete: false }))).not.toContain('Borrar este mes');
    expect(text(tabs({ totals: undefined }))).not.toContain('Borrar este mes');
    // The last month is never deleted.
    expect(text(tabs({ months: [months[0]], active: M1, totals: {} }))).not.toContain('Borrar este mes');
    // With no open month there is no «⋯».
    expect(tabs({ active: null })).not.toContain('Opciones de');
  });

  it('borrar un mes dice antes cuántas piezas tiene y que ninguna se borra', () => {
    expect(deleteMonthText('Mes 2', 5, 3, 'Mes 1')).toBe('¿Borrar «Mes 2»? Tiene 5 piezas (3 en el feed). No se borra ninguna: pasan a «Mes 1» y las del feed quedan «Sin programar».');
    expect(deleteMonthText('Mes 3', 0, 0, 'Mes 1')).toBe('¿Borrar «Mes 3»? No tiene piezas.');
  });

  it('sin cupo (Fin de mes) solo el número', () => {
    expect(links(tabs({ quotaLabel: null, hrefFor: (id: string) => sectionHref('fin-de-mes', id) }))[0].text).toBe('Mes 1 · 9');
  });
});

describe('el cupo del mes (informativo)', () => {
  it('«Reels de Mes 1: 9 de 12», pasarse no bloquea nada, y Fin de mes no tiene cupo', () => {
    expect(quotaText('reel', 'Mes 1', 9, 12)).toBe('Reels de Mes 1: 9 de 12');
    expect(quotaText('reel', 'Mes 1', 14, 12)).toBe('Reels de Mes 1: 14 de 12: pasaste el cupo (no bloquea nada)');
    expect(quotaText('month_end', 'Mes 1', 1, null)).toBe('Fin de mes de Mes 1: 1 pieza (sin cupo)');
  });

  it('administración ve «Cambiar en Ajustes»; los demás no; con su ancla', () => {
    const admin = renderToStaticMarkup(createElement(QuotaLine, { format: 'post', monthLabel: 'Mes 1', count: 3, quota: 8, canChange: true }));
    expect(admin).toContain('data-tour="month-quota"');
    expect(admin).toContain('href="/ajustes/contenido"');
    expect(text(admin)).toContain('Posts de Mes 1: 3 de 8');
    const redes = renderToStaticMarkup(createElement(QuotaLine, { format: 'post', monthLabel: 'Mes 1', count: 9, quota: 8, canChange: false }));
    expect(redes).not.toContain('Cambiar en Ajustes');
    expect(redes).toContain('text-warn');
  });
});

describe('«¿Qué quieres crear?»', () => {
  it('los seis formatos con su ayuda corta', () => {
    expect(CREATE_TITLE).toBe('¿Qué quieres crear?');
    expect(FORMATS.map((f) => FORMAT[f].label)).toEqual(['Reel', 'Post', 'Carrusel', 'Historia', 'Video de YouTube', 'Pieza de fin de mes']);
    for (const f of FORMATS) expect(FORMAT[f].hint.length).toBeGreaterThan(5);
  });
});
