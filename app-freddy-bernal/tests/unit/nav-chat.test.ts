// Inside one conversation of Mensajes (/mensajes/<uuid>) the phone has no bottom bar: the box to write sits at the very
// bottom and the messages get the room (R3, design §5.3, U11). The list of conversations, «Escribirle a alguien» and the
// boss's pages keep it, and so does every other screen. Also: «Más» carries the tutorials' anchor.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { NavItem } from '@/lib/roles';

let path = '/hoy';
vi.mock('next/navigation', () => ({ usePathname: () => path }));

const { BottomNav, hidesBottomNav } = await import('@/components/shell/nav');

const items: NavItem[] = [
  { href: '/hoy', label: 'Hoy', icon: 'home', roles: ['social'] },
  { href: '/agenda', label: 'Agenda', icon: 'calendar', roles: ['social'] },
] as NavItem[];
const more: NavItem[] = [{ href: '/publicar', label: 'Publicar', icon: 'send', roles: ['social'] }] as NavItem[];
const bar = () => renderToStaticMarkup(createElement(BottomNav, { items, more }));
const UUID = '0b6f3c2e-9d41-4a7b-8c55-2f1e6a9d3b70';

describe('la barra de abajo en Mensajes', () => {
  beforeEach(() => {
    path = '/hoy';
  });

  it('no sale dentro de una conversación', () => {
    path = `/mensajes/${UUID}`;
    expect(bar()).toBe('');
    expect(hidesBottomNav(`/mensajes/${UUID.toUpperCase()}/`)).toBe(true);
  });

  it('sí sale en la lista, al escribirle a alguien, en las pantallas del jefe y en todo lo demás', () => {
    for (const p of ['/mensajes', '/mensajes/nueva', '/mensajes/todas', '/mensajes/permisos', '/hoy', '/eventos/' + UUID, `/mensajes/${UUID}/otra`, '/mensajes/no-es-un-id']) {
      path = p;
      expect(bar(), p).toMatch(/^<nav aria-label="Menú"/);
      expect(hidesBottomNav(p), p).toBe(false);
    }
    expect(hidesBottomNav(null)).toBe(false);
  });

  it('«Más» lleva el ancla de los tutoriales', () => {
    expect(bar()).toMatch(/<summary[^>]*data-tour="nav-more"/);
  });
});
