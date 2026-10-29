// The tutorials' anchors are a closed list (R3, design §6.2, src/lib/guides/anchors.ts), checked both ways: every name
// of TOUR_ANCHORS is on some screen as data-tour="…", and no screen carries a data-tour outside the list. The selectors
// the screens already had (STABLE_TARGETS, ✔) are still there too. A tutorial whose target goes away just loses that
// step; these tests say so before anyone notices.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { STABLE_TARGETS, TOUR_ANCHORS, anchor } from '@/lib/guides/anchors';

const files = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(path.join(dir, d.name)) : /\.tsx?$/.test(d.name) ? [path.join(dir, d.name)] : []));
// The screens: everything in src/ except the help content itself (src/lib/guides holds the selectors, not anchors).
const GUIDES = path.join('src', 'lib', 'guides');
const sources = files('src')
  .filter((f) => !f.startsWith(GUIDES + path.sep))
  .map((f) => ({ f, code: fs.readFileSync(f, 'utf8') }));
const all = sources.map((s) => s.code).join('\n');

// data-tour="x" written as an attribute (not '[data-tour="x"]', the selector the tutorials use).
const ATTR = /(?<![\w[-])data-tour="([^"]*)"/g;
const used = sources.flatMap(({ f, code }) => [...code.matchAll(ATTR)].map((m) => ({ f, name: m[1] })));

describe('anclas de los tutoriales (lista cerrada)', () => {
  it('cada nombre de la lista está como data-tour="…" en alguna pantalla', () => {
    const names = new Set(used.map((u) => u.name));
    expect(TOUR_ANCHORS.filter((a) => !names.has(a))).toEqual([]);
  });

  it('ninguna pantalla lleva un data-tour que no está en la lista', () => {
    const list = new Set<string>(TOUR_ANCHORS);
    expect(used.filter((u) => !list.has(u.name)).map((u) => `${u.f}: ${u.name}`)).toEqual([]);
  });

  it('la lista no repite nombres y los nombres son cortos y en minúsculas', () => {
    expect(new Set(TOUR_ANCHORS).size).toBe(TOUR_ANCHORS.length);
    for (const a of TOUR_ANCHORS) expect(a).toMatch(/^[a-z0-9-]{1,40}$/);
    expect(anchor('bell')).toBe('[data-tour="bell"]');
  });

  it('los selectores que ya existían siguen en las pantallas', () => {
    const missing = STABLE_TARGETS.filter((sel) => {
      const id = /^#([\w-]+)$/.exec(sel)?.[1];
      if (id) {
        // An id written as such, or the title of a big button (HubTile builds `${id}-title` from id="tile-…").
        const base = id.replace(/-title$/, '');
        return !all.includes(`id="${id}"`) && !(id.endsWith('-title') && all.includes(`id="${base}"`) && all.includes('id={`${id}-title`}'));
      }
      if (sel === '[data-assistant-button]') return !all.includes('data-assistant-button=""');
      // [aria-label="X"] (also one of the labels of a button that changes, aria-label={on ? 'Pausar' : 'X'}),
      // [aria-label^="X"] (the start of a longer label) and [aria-labelledby="X"].
      const attr = [...sel.matchAll(/\[(aria-label|aria-labelledby)(\^?)="([^"]+)"\]/g)];
      if (!attr.length) return true;
      const has = (name: string, prefix: string, value: string) =>
        prefix ? all.includes(`${name}={\`${value}`) : all.includes(`${name}="${value}"`) || all.split('\n').some((l) => l.includes(`${name}={`) && l.includes(`'${value}'`));
      return !attr.every(([, name, prefix, value]) => has(name, prefix, value));
    });
    expect(missing).toEqual([]);
  });

  it('las pestañas que los tutoriales señalan tienen nombre: los meses de Redes y «Qué aprobar»', () => {
    const read = (f: string) => fs.readFileSync(f, 'utf8');
    // The month tabs live in their component (R4, F15), shared by the sections and the feed, not in a page.
    expect(read('src/components/redes/month-tabs.tsx')).toMatch(/<nav aria-label="Meses de contenido" data-tour="month-tabs"/);
    expect(read('src/components/redes/month-tabs.tsx')).toContain('data-tour="month-new"');
    expect(read('src/app/(panel)/aprobar/page.tsx')).toMatch(/role="tablist" aria-label="Qué aprobar" data-tour="approve-tabs"/);
  });

  it('cada ancla de Redes por formato está una sola vez en src/ (R4: un componente, o su envoltorio del Paso 0)', () => {
    const R4 = ['new-piece', 'month-tabs', 'month-new', 'month-quota', 'section-sort', 'piece-card', 'card-checks', 'design-checks', 'rating', 'notice-band', 'month-summary', 'feed-grid', 'feed-live', 'feed-clear-month', 'redes-matrix', 'redes-period', 'redes-observations', 'redes-activity', 'redes-search'];
    for (const a of R4) expect(TOUR_ANCHORS as readonly string[], a).toContain(a);
    const twice = R4.filter((a) => used.filter((u) => u.name === a).length !== 1).map((a) => `${a}: ${used.filter((u) => u.name === a).map((u) => u.f).join(', ')}`);
    expect(twice).toEqual([]);
    // «Piezas» is gone: its tabs and list are no anchors any more, nor the hub's «Piezas» tile.
    for (const gone of ['pieces-tabs', 'pieces-list']) expect(TOUR_ANCHORS as readonly string[]).not.toContain(gone);
    expect(STABLE_TARGETS as readonly string[]).not.toContain('#hub-piezas-title');
    expect(STABLE_TARGETS as readonly string[]).toContain('nav[aria-label="Secciones de Redes"]');
  });
});
