// The «Más», «Crear» and «Mi cuenta» menus close like menus (menu-core.ts). What the phone shows
// (labels that fit, no sideways scroll, menus used in the header) is checked on real pixels by
// tests/e2e/pages.spec.ts and tests/e2e/ui-polish.spec.ts, not by reading the source here.
import { describe, it, expect } from 'vitest';
import { dismissMenu, type MenuDoc, type MenuEl } from '@/components/shell/menu-core';

type Handler = (e: never) => void;

function fakeDom() {
  const listeners = new Map<string, Handler>();
  const body = { name: 'body' };
  const outside = { name: 'page' };
  const doc = {
    body,
    activeElement: body as unknown,
    addEventListener: (type: string, fn: Handler) => listeners.set(type, fn),
    removeEventListener: (type: string, fn: Handler) => {
      if (listeners.get(type) === fn) listeners.delete(type);
    },
  };
  const fire = (type: 'pointerdown' | 'keydown', e: object) => (listeners.get(type) as ((e: object) => void) | undefined)?.(e);
  return { listeners, doc: doc as unknown as MenuDoc & { activeElement: unknown }, fire, outside };
}

// A <details>: setting `open` fires «toggle», as the browser does.
function fakeMenu() {
  const own = new Map<string, Handler>();
  const summary = { focused: 0, focus() { this.focused++; } };
  const inside = { name: 'item' };
  let open = false;
  const menu = {
    get open() { return open; },
    set open(v: boolean) {
      const changed = v !== open;
      open = v;
      if (changed) (own.get('toggle') as (() => void) | undefined)?.();
    },
    contains: (n: unknown) => n === inside || n === summary,
    querySelector: () => summary,
    addEventListener: (type: string, fn: Handler) => own.set(type, fn),
    removeEventListener: (type: string, fn: Handler) => {
      if (own.get(type) === fn) own.delete(type);
    },
  };
  const focusOut = (relatedTarget: unknown) => (own.get('focusout') as ((e: object) => void) | undefined)?.({ relatedTarget });
  return { menu: menu as MenuEl, own, summary, inside, focusOut };
}

describe('menús «Más», «Crear» y «Mi cuenta»', () => {
  it('un toque afuera los cierra; adentro, no', () => {
    const d = fakeDom();
    const m = fakeMenu();
    dismissMenu(m.menu, d.doc, new Set());
    m.menu.open = true;
    d.fire('pointerdown', { target: m.inside });
    expect(m.menu.open).toBe(true);
    d.fire('pointerdown', { target: d.outside });
    expect(m.menu.open).toBe(false);
  });

  it('Escape los cierra y devuelve el foco al botón del menú', () => {
    const d = fakeDom();
    const m = fakeMenu();
    dismissMenu(m.menu, d.doc, new Set());
    m.menu.open = true;
    d.doc.activeElement = m.inside;
    d.fire('keydown', { key: 'Enter' });
    expect(m.menu.open).toBe(true);
    d.fire('keydown', { key: 'Escape' });
    expect(m.menu.open).toBe(false);
    expect(m.summary.focused).toBe(1);
    // Closed already: another Escape does nothing.
    d.fire('keydown', { key: 'Escape' });
    expect(m.summary.focused).toBe(1);
  });

  it('un Escape con el foco en otra parte (un diálogo) no es del menú', () => {
    const d = fakeDom();
    const m = fakeMenu();
    dismissMenu(m.menu, d.doc, new Set());
    m.menu.open = true;
    d.doc.activeElement = d.outside;
    d.fire('keydown', { key: 'Escape' });
    expect(m.menu.open).toBe(true);
  });

  it('con el teclado: Tab fuera del menú lo cierra; moverse adentro, no', () => {
    const d = fakeDom();
    const m = fakeMenu();
    dismissMenu(m.menu, d.doc, new Set());
    m.menu.open = true;
    m.focusOut(m.inside);
    expect(m.menu.open).toBe(true);
    // The focus went nowhere (another window): it stays open.
    m.focusOut(null);
    expect(m.menu.open).toBe(true);
    m.focusOut(d.outside);
    expect(m.menu.open).toBe(false);
  });

  it('abrir uno cierra los demás (nunca dos paneles encimados)', () => {
    const d = fakeDom();
    const group = new Set<MenuEl>();
    const create = fakeMenu();
    const account = fakeMenu();
    dismissMenu(create.menu, d.doc, group);
    dismissMenu(account.menu, d.doc, group);
    create.menu.open = true;
    account.menu.open = true;
    expect([create.menu.open, account.menu.open]).toEqual([false, true]);
    create.menu.open = true;
    expect([create.menu.open, account.menu.open]).toEqual([true, false]);
  });

  it('al desmontar deja de escuchar y sale del grupo', () => {
    const d = fakeDom();
    const m = fakeMenu();
    const group = new Set<MenuEl>();
    const stop = dismissMenu(m.menu, d.doc, group);
    expect([...d.listeners.keys()].sort()).toEqual(['keydown', 'pointerdown']);
    expect([...m.own.keys()].sort()).toEqual(['focusout', 'toggle']);
    stop();
    expect(d.listeners.size).toBe(0);
    expect(m.own.size).toBe(0);
    expect(group.size).toBe(0);
  });
});
