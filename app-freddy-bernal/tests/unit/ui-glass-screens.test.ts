// «Cara glass» on the screens that still drew their own surfaces (cambios del 27/10/2026, WP4b): the calendar, publishing
// a post, the tweets to approve, a new tweet batch, the agenda's view switch, «Algo no cargó», the two «no encontrado»
// pages and Google Drive in Ajustes. They now use the base components (<Card>, <Card solid>, menuPanelClass) and the
// corner tokens, so the glass, its solid fallbacks and its contrast checks (ui-glass.test.ts) reach them too.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DateTime } from 'luxon';
import { TZ } from '@/lib/time';
import PanelError from '@/app/(panel)/error';
import PanelNotFound from '@/app/(panel)/not-found';
import RootNotFound from '@/app/not-found';
import { MonthView, TimeGrid } from '@/components/agenda/calendar';

const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), 'utf8');
const files = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(path.join(dir, d.name)) : /\.tsx?$/.test(d.name) ? [path.join(dir, d.name)] : []));
const html = <P extends object>(c: ComponentType<P>, props: P) => renderToStaticMarkup(createElement(c, props));

// A card drawn by hand: the corner of a card, the border and the plain white background (not bg-surface-2, which is an
// inner box). Only the base components in src/components/ui may draw a surface.
const HAND_CARD = /rounded-\[var\(--radius-card\)\] border border-border bg-surface(?![-\w/])/;

describe('glass en las pantallas sueltas', () => {
  it('nadie arma una tarjeta a mano fuera de los componentes base', () => {
    const base = path.join('src', 'components', 'ui');
    expect(files('src').filter((f) => !f.startsWith(base) && HAND_CARD.test(read(f)))).toEqual([]);
  });

  it('las esquinas salen de los tokens (nada de rounded-[6px])', () => {
    expect(files('src').filter((f) => /\brounded-\[\d+(\.\d+)?px\]/.test(read(f)))).toEqual([]);
    expect(read('src/app/(panel)/agenda/page.tsx')).toContain("'min-h-10 rounded-[var(--radius-chip)] px-3 py-2 text-sm font-semibold'");
  });

  it('las barras que flotan sobre una lista al bajar usan el vidrio de los menús (casi opaco)', () => {
    for (const f of ['src/app/(panel)/aprobar/tweet-approvals.tsx', 'src/app/(panel)/tweets/nueva/new-batch.tsx']) {
      const code = read(f);
      expect(code, f).toMatch(/className=\{cn\(menuPanelClass, 'sticky /);
      // menuPanelClass brings its own soft shadow.
      expect(code, f).not.toMatch(/shadow-lg/);
    }
  });

  it('los paneles que se abren («No se pudo publicar», «Más opciones» de Drive) van dentro de una <Card>', () => {
    for (const f of ['src/app/(panel)/publicar/[id]/publication-client.tsx', 'src/app/(panel)/ajustes/drive/drive-settings.tsx']) {
      expect(read(f), f).toMatch(/<Card>\s*<details>/);
      expect(read(f), f).not.toMatch(/<details className=/);
    }
  });

  it('«Algo no cargó» y los dos «no encontrado» son una tarjeta de vidrio', () => {
    const pages: [string, string][] = [
      ['error', html(PanelError, { error: new Error('prueba'), reset: () => {} })],
      ['no encontrado (panel)', html(PanelNotFound, {})],
      ['no encontrado', html(RootNotFound, {})],
    ];
    for (const [name, out] of pages) {
      expect(out, name).toMatch(/<div class="glass-card rounded-\[var\(--radius-card\)\] /);
      expect(out, name).not.toContain('glass-solid');
      expect(out, name).not.toMatch(/bg-surface(?![-\w/])/);
    }
    expect(pages[0][1]).toContain('Algo no cargó');
    expect(pages[1][1]).toContain('No encontramos esto');
    expect(pages[2][1]).toMatch(/^<main /);
  });

  it('el calendario (mes, semana y día) es una grilla larga: <Card solid>, sin desenfoque detrás', () => {
    const anchor = DateTime.fromISO('2026-10-15', { zone: TZ });
    expect(html(MonthView, { anchor, events: [] })).toMatch(/^<div class="glass-card rounded-\[var\(--radius-card\)\] glass-solid overflow-hidden">/);
    const week = Array.from({ length: 7 }, (_, i) => anchor.startOf('week').plus({ days: i }));
    for (const days of [week, [anchor]]) expect(html(TimeGrid, { days, events: [] })).toMatch(/^<div class="glass-card rounded-\[var\(--radius-card\)\] glass-solid overflow-x-auto">/);
  });
});

describe('sin ventanas nativas del navegador en los tweets', () => {
  it('«Empezar de nuevo» y «Repartir de nuevo» usan el diálogo propio, no confirm()', () => {
    for (const f of ['src/app/(panel)/tweets/nueva/new-batch.tsx', 'src/app/(panel)/tweets/[id]/batch-client.tsx']) {
      const code = read(f);
      expect(code, f).not.toMatch(/(^|[^.\w])(window\.)?(confirm|alert)\(\s*['"`]/m);
      expect(code, f).toContain('useConfirm()');
      expect(code, f).toContain('{dialog}');
    }
  });
});
