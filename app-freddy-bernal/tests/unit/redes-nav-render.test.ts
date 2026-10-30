// The section bar of Redes (R4, D-60, F1, F2), rendered without a server: the nine sections and «Buscar en Redes» in
// one named <nav>, the current one marked, every link with the open month, and each format's numbers said for screen
// readers too («Posts: 3 de 8 revisados, 2 sin copy, 1 sin imagen»). Invented numbers.
import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RedesNav, navCountText } from '@/components/redes/redes-nav';

// The month tabs answer taps (WP-C1: «+ Nuevo mes», «⋯»): rendered here without the app's router.
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }), usePathname: () => '/redes/posts' }));
import { MonthTabs, monthTabLabel } from '@/components/redes/month-tabs';
import { sectionHref } from '@/lib/domain/redes';

const M = '3f2b8c1e-5d4a-4b6c-9e7f-0a1b2c3d4e5f';
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const links = (html: string) =>
  [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => ({ href: /href="([^"]*)"/.exec(m[1])![1].replace(/&amp;/g, '&'), current: /aria-current="page"/.test(m[1]), text: text(m[2]) }));

describe('la barra de secciones de Redes', () => {
  it('Tablero, los seis formatos, Feed y Tweets, y «Buscar en Redes», todos con el mes abierto', () => {
    const html = renderToStaticMarkup(createElement(RedesNav, { active: 'post', monthId: M }));
    expect(html).toMatch(/^<nav aria-label="Secciones de Redes"/);
    const ls = links(html);
    expect(ls.map((l) => l.text)).toEqual(['Tablero', 'Reels', 'Posts', 'Carruseles', 'Historias', 'YouTube', 'Fin de mes', 'Feed', 'Tweets', 'Buscar en Redes']);
    expect(ls.map((l) => l.href)).toEqual(
      ['/redes', '/redes/reels', '/redes/posts', '/redes/carruseles', '/redes/historias', '/redes/youtube', '/redes/fin-de-mes', '/redes/feed', '/tweets', '/redes/buscar'].map((h) => `${h}?mes=${M}`),
    );
    expect(ls.filter((l) => l.current).map((l) => l.text)).toEqual(['Posts']);
    // Every target is big enough for a finger (44 px).
    expect(html.match(/min-h-11/g)?.length).toBe(ls.length);
  });

  it('sin mes abierto, las direcciones van limpias; en la búsqueda, ella es la marcada', () => {
    const ls = links(renderToStaticMarkup(createElement(RedesNav, { active: 'search', monthId: null })));
    expect(ls[0].href).toBe('/redes');
    expect(ls.filter((l) => l.current).map((l) => l.text)).toEqual(['Buscar en Redes']);
  });

  it('con los números del mes: «3/8», copy e imagen faltantes, y lo mismo dicho para lectores de pantalla', () => {
    const html = renderToStaticMarkup(
      createElement(RedesNav, {
        active: 'dashboard',
        monthId: M,
        counts: { post: { reviewed: 3, quota: 8, copyMissing: 2, imageMissing: 1 }, story: { reviewed: 4, quota: 30, copyMissing: 0, imageMissing: 0 }, month_end: { reviewed: 1, quota: null, copyMissing: 0, imageMissing: 0 } },
      }),
    );
    const posts = links(html).find((l) => l.href.startsWith('/redes/posts'))!;
    expect(posts.text).toBe('Posts 3/8 2 1 : 3 de 8 revisados, 2 sin copy, 1 sin imagen');
    expect(html).toContain('<span class="sr-only">: 3 de 8 revisados, 2 sin copy, 1 sin imagen</span>');
    expect(navCountText('story', { reviewed: 4, quota: 30, copyMissing: 0, imageMissing: 0 })).toBe(': 4 de 30 revisadas');
    expect(navCountText('month_end', { reviewed: 1, quota: null, copyMissing: 0, imageMissing: 0 })).toBe(': 1 revisadas');
    // A format without numbers says only its name.
    expect(links(html).find((l) => l.href.startsWith('/redes/reels'))!.text).toBe('Reels');
  });
});

describe('las pestañas de los meses (props del Paso 0; WP-C1 completa)', () => {
  const months = [
    { id: M, label: 'Mes 1', ordinal: 1 },
    { id: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d', label: 'Mes 2', ordinal: 2 },
  ];
  it('enlaces con ?mes=, la abierta marcada, «+ Nuevo mes» y las dos anclas de los tutoriales', () => {
    const html = renderToStaticMarkup(createElement(MonthTabs, { months, active: M, counts: { [M]: 3 }, quotaLabel: '8', hrefFor: (id: string) => sectionHref('posts', id), canCreate: true, canDelete: true }));
    expect(html).toContain('data-tour="month-tabs"');
    expect(html).toContain('data-tour="month-new"');
    expect(text(html)).toContain('+ Nuevo mes');
    const ls = links(html);
    expect(ls.map((l) => [l.text, l.href, l.current])).toEqual([
      ['Mes 1 · 3 de 8', `/redes/posts?mes=${M}`, true],
      ['Mes 2 · 0 de 8', `/redes/posts?mes=${months[1].id}`, false],
    ]);
  });

  it('sin permiso de crear no sale «+ Nuevo mes»; sin cupo, solo el número', () => {
    const html = renderToStaticMarkup(createElement(MonthTabs, { months, active: null, hrefFor: (id: string) => `/x?mes=${id}`, canCreate: false, canDelete: false }));
    expect(html).not.toContain('Nuevo mes');
    expect(monthTabLabel('Mes 1')).toBe('Mes 1');
    expect(monthTabLabel('Mes 1', 3, null)).toBe('Mes 1 · 3');
    expect(monthTabLabel('Mes 1', 21, '24')).toBe('Mes 1 · 21 de 24');
  });
});
