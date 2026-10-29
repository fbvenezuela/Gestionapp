// The boss lands on his Inicio (/jefe), not on Hoy: Grabación's new notes for the editor (§5) show in the Redes tile as a
// line with how many and the title of each event, which opens its Material tab. Rendered here without a server; the
// numbers themselves are tried in fresh-notes.test.ts. Titles only, never a date. All data here is invented.
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Clapperboard, Megaphone } from 'lucide-react';
import { HubTile, type HubList } from '@/components/home/hub-tile';
import { looksLikeDateTime } from '@/lib/push/text';

// As on the boss's Redes tile: the pieces in progress open the board of Redes (R4: «Piezas» went into its sections).
const counters = [{ href: '/redes', value: 2, label: 'piezas en curso' }];
const notes = (over: Partial<HubList> = {}): HubList => ({
  key: 'notes',
  label: 'Notas de Grabación nuevas',
  icon: Clapperboard,
  total: 2,
  items: [
    { href: '/eventos/ev-1?tab=material', label: 'Jornada de prueba en la cancha' },
    { href: '/eventos/ev-2?tab=material', label: 'Entrega de prueba en la escuela' },
  ],
  itemHint: 'ver las notas de Grabación',
  ...over,
});
const tile = (list?: HubList | null) =>
  renderToStaticMarkup(
    createElement(HubTile, { id: 'tile-redes', href: '/redes', title: 'Redes', subtitle: 'Piezas, tweets, publicaciones y resultados', icon: Megaphone, counters, list }),
  );
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
// Each <a …>…</a> of the markup: its href, its classes and its text.
const links = (html: string) =>
  [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => ({ href: /href="([^"]*)"/.exec(m[1])![1], cls: /class="([^"]*)"/.exec(m[1])?.[1] ?? '', text: text(m[2]) }));

describe('la línea de notas de Grabación nuevas en el botón de Redes del jefe', () => {
  it('dice cuántas son y trae el título de cada evento, que abre su pestaña Material', () => {
    const html = tile(notes());
    expect(text(html)).toContain('Notas de Grabación nuevas 2');
    const items = links(html).filter((l) => l.href.startsWith('/eventos/'));
    expect(items.map((l) => l.href)).toEqual(['/eventos/ev-1?tab=material', '/eventos/ev-2?tab=material']);
    expect(items.map((l) => l.text)).toEqual(['Jornada de prueba en la cancha : ver las notas de Grabación', 'Entrega de prueba en la escuela : ver las notas de Grabación']);
    // The hint is for screen readers only; on screen, the title alone.
    expect(html).toContain('<span class="sr-only">: ver las notas de Grabación</span>');
  });

  it('la lista se llama como la línea (lectores de pantalla) y queda dentro del botón de Redes', () => {
    const html = tile(notes());
    expect(html).toContain('id="tile-redes-notes"');
    expect(html).toContain('<ul aria-labelledby="tile-redes-notes"');
    expect(html).toMatch(/^<div class="glass-card [^"]*" role="region" aria-labelledby="tile-redes-title">/);
    // Under the counters.
    expect(html.indexOf('tile-redes-notes')).toBeGreaterThan(html.indexOf('piezas en curso'));
    expect(html.indexOf('piezas en curso')).toBeGreaterThan(0);
  });

  it('cada título es un blanco grande para el dedo (56 px), como los contadores', () => {
    for (const l of links(tile(notes({ more: { href: '/hoy', label: 'Ver más en «Hoy»' } }))).slice(1)) expect(l.cls, l.text).toContain('min-h-14');
  });

  it('si hay más de las que se muestran, «Ver más en «Hoy»»', () => {
    const html = tile(notes({ total: 5, more: { href: '/hoy', label: 'Ver más en «Hoy»' } }));
    expect(text(html)).toContain('Notas de Grabación nuevas 5');
    expect(links(html).at(-1)).toMatchObject({ href: '/hoy', text: 'Ver más en «Hoy»' });
    expect(links(tile(notes())).some((l) => l.href === '/hoy')).toBe(false);
  });

  it('sin notas nuevas (o sin lista) no sale nada: el botón queda como antes', () => {
    const before = tile(null);
    expect(tile(notes({ total: 0, items: [] }))).toBe(before);
    expect(tile(undefined)).toBe(before);
    expect(before).not.toContain('Grabación');
  });

  it('solo títulos: ni fecha ni hora en lo que dibuja', () => {
    expect(looksLikeDateTime(text(tile(notes())))).toBe(false);
    // With «Ver más en «Hoy»» (the name of a screen, not a day): still no date or time of day.
    expect(text(tile(notes({ total: 5, more: { href: '/hoy', label: 'Ver más en «Hoy»' } })))).not.toMatch(/\d{1,2}:\d{2}|\d{1,2}\/\d{1,2}|\d{4}-\d{2}-\d{2}/);
  });
});
