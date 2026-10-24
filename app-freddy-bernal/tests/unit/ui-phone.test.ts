// The panel at 360 px: menus that close like menus, a phone bar whose labels fit, and lists
// that truncate long titles instead of pushing the page sideways (tests/e2e checks the pixels).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { dismissMenu, type MenuDoc } from '@/components/shell/menu-core';

const read = (f: string) => fs.readFileSync(f, 'utf8');

type Handler = (e: never) => void;

function fakeDom() {
  const listeners = new Map<string, Handler>();
  const body = { name: 'body' };
  const summary = { focused: 0, focus() { this.focused++; } };
  const inside = { name: 'item' };
  const outside = { name: 'page' };
  const menu = { open: false, contains: (n: unknown) => n === inside || n === summary, querySelector: () => summary };
  const doc = {
    body,
    activeElement: body as unknown,
    addEventListener: (type: string, fn: Handler) => listeners.set(type, fn),
    removeEventListener: (type: string, fn: Handler) => {
      if (listeners.get(type) === fn) listeners.delete(type);
    },
  };
  const fire = (type: 'pointerdown' | 'keydown', e: object) => (listeners.get(type) as ((e: object) => void) | undefined)?.(e);
  return { listeners, menu, doc: doc as unknown as MenuDoc & { activeElement: unknown }, fire, summary, inside, outside };
}

describe('menús «Más», «Crear» y «Mi cuenta»', () => {
  it('un toque afuera los cierra; adentro, no', () => {
    const d = fakeDom();
    dismissMenu(d.menu, d.doc);
    d.menu.open = true;
    d.fire('pointerdown', { target: d.inside });
    expect(d.menu.open).toBe(true);
    d.fire('pointerdown', { target: d.outside });
    expect(d.menu.open).toBe(false);
  });

  it('Escape los cierra y devuelve el foco al botón del menú', () => {
    const d = fakeDom();
    dismissMenu(d.menu, d.doc);
    d.menu.open = true;
    d.doc.activeElement = d.inside;
    d.fire('keydown', { key: 'Enter' });
    expect(d.menu.open).toBe(true);
    d.fire('keydown', { key: 'Escape' });
    expect(d.menu.open).toBe(false);
    expect(d.summary.focused).toBe(1);
    // Closed already: another Escape does nothing.
    d.fire('keydown', { key: 'Escape' });
    expect(d.summary.focused).toBe(1);
  });

  it('un Escape con el foco en otra parte (un diálogo) no es del menú', () => {
    const d = fakeDom();
    dismissMenu(d.menu, d.doc);
    d.menu.open = true;
    d.doc.activeElement = d.outside;
    d.fire('keydown', { key: 'Escape' });
    expect(d.menu.open).toBe(true);
  });

  it('al desmontar deja de escuchar', () => {
    const d = fakeDom();
    const stop = dismissMenu(d.menu, d.doc);
    expect([...d.listeners.keys()].sort()).toEqual(['keydown', 'pointerdown']);
    stop();
    expect(d.listeners.size).toBe(0);
  });

  it('«Más», «Crear» y «Mi cuenta» usan el menú que se cierra solo', () => {
    expect(read('src/components/shell/nav.tsx')).toMatch(/<MenuDetails key=\{pathname\}/);
    const layout = read('src/app/(panel)/layout.tsx');
    expect(layout).toMatch(/<MenuDetails className="relative">\s*<summary[^>]*aria-label="Mi cuenta"/);
    expect(layout).toMatch(/<MenuDetails className="relative">\s*<summary[^>]*>\s*<Plus /);
    expect(layout).not.toContain('<details');
  });

  it('elegir una opción también lo cierra: el encabezado no cambia al cambiar de página', () => {
    expect(read('src/components/shell/menu-details.tsx')).toMatch(/closest\('a\[href\]'\)\) e\.currentTarget\.open = false/);
  });
});

describe('barra del teléfono', () => {
  const nav = read('src/components/shell/nav.tsx');

  it('cada etiqueta mide lo que su casilla (no se monta sobre la vecina)', () => {
    expect(nav).toContain('<span className="block w-full truncate px-0.5 text-center">{it.label}</span>');
  });

  it('con cinco casillas la letra es fija de 11 px, también en «Modo sol»', () => {
    expect(nav).toMatch(/cols >= 5 \? 'text-\[11px\] tracking-tight' : 'text-xs'/);
  });
});

describe('listas que no empujan la página hacia los lados', () => {
  it('Hoy: las dos columnas pueden encogerse, así los títulos largos se cortan', () => {
    expect(read('src/app/(panel)/hoy/page.tsx').match(/<div className="flex min-w-0 flex-col gap-5">/g)).toHaveLength(2);
  });

  it('Material: el nombre pide 11rem y los botones bajan a su línea', () => {
    const m = read('src/app/(panel)/eventos/[id]/material-panel.tsx');
    expect(m).toContain('<div className="min-w-0 flex-[1_1_11rem]">');
    expect(m).toContain('<div className="ml-auto flex items-center gap-2">');
  });
});
