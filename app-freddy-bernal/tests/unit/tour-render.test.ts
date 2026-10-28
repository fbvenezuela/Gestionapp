// The tutorial's dialog and card as they are drawn (R3, D-45, design §6.1, U1, U5), rendered here without a browser:
// a transparent full-screen native <dialog> (no glass, no blur, no dimming: what it points at looks as always), the
// card inside it on glass-sheet, «Paso n de N», the ring hidden from screen readers and letting taps through, the X
// «Salir del tutorial», and the buttons of each step («Seguir» on the last one of `bienvenida`). The «Mi cuenta»
// items list only what the engine says can run here. Real pixels: tests/e2e/tours.spec.ts.
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CHAIN_LINE, CHANGED_TEXT, TourCard, type TourCardProps, type TourCardView } from '@/components/tour/tour-card';
import { HelpMenuItems, tutorialLabel, tutorialsHere } from '@/components/tour/help-menu-items';
import { TOUR_CAN_ANSWER_EVENT, TOUR_CAN_EVENT } from '@/components/tour/tour-core';
import type { Tour } from '@/lib/guides/types';

const step = (over: Partial<Extract<TourCardView, { kind: 'step' }>> = {}): TourCardView => ({
  kind: 'step',
  index: 0,
  total: 4,
  title: 'Tus pantallas',
  body: 'Aquí están las pantallas de tu trabajo.',
  primary: 'next',
  ...over,
});
const draw = (over: Partial<TourCardProps> = {}) =>
  renderToStaticMarkup(
    createElement(TourCard, {
      view: step(),
      spot: { top: 76, left: 12 },
      ring: { top: 572, left: 0, width: 360, height: 68 },
      ids: { title: 't-title', body: 't-body' },
      onClose: () => {},
      ...over,
    }),
  );
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const tag = (html: string, re: RegExp) => re.exec(html)?.[0] ?? '';
const classOf = (openTag: string) => /class="([^"]*)"/.exec(openTag)?.[1] ?? '';
const buttons = (html: string) => [...html.matchAll(/<(button|a)\b[^>]*>([\s\S]*?)<\/\1>/g)].map((m) => text(m[2]));

describe('el diálogo del tutorial', () => {
  it('es un <dialog> transparente de pantalla completa, sin vidrio y sin oscurecer ni difuminar lo de atrás', () => {
    const html = draw();
    const dialog = tag(html, /<dialog\b[^>]*>/);
    expect(dialog).toContain('data-tour-dialog=""');
    const cls = classOf(dialog);
    expect(cls).not.toMatch(/glass-/);
    for (const c of ['fixed', 'inset-0', 'm-0', 'h-dvh', 'max-h-none', 'w-screen', 'max-w-none', 'bg-transparent', 'p-0', 'backdrop:bg-transparent']) expect(cls.split(' ')).toContain(c);
    expect(dialog).toContain('aria-labelledby="t-title"');
    expect(dialog).toContain('aria-describedby="t-body"');
  });

  it('adentro, la tarjeta (glass-sheet) y el anillo como hermanos; el anillo no lo leen ni lo tocan', () => {
    const html = draw();
    const card = tag(html, /<div[^>]*role="document"[^>]*>/);
    expect(classOf(card)).toMatch(/\bglass-sheet\b/);
    expect(classOf(card)).toContain('w-[min(22rem,calc(100vw-24px))]');
    expect(classOf(card)).toContain('rounded-[var(--radius-card)]');
    expect(card).toContain('top:76px');
    const ring = tag(html, /<div[^>]*data-tour-ring=""[^>]*>/);
    expect(ring).toContain('aria-hidden="true"');
    expect(classOf(ring)).toMatch(/\bpointer-events-none\b/);
    // A border (forced colors keep it), the focus color, the controls' corner.
    expect(classOf(ring)).toMatch(/\bborder-\[3px\] border-focus\b/);
    expect(classOf(ring)).toContain('rounded-[var(--radius-control)]');
    expect(ring).toMatch(/top:572px;left:0;width:360px;height:68px/);
    // The ring after the card: on top of it in the z-order.
    expect(html.indexOf('data-tour-ring')).toBeGreaterThan(html.indexOf('role="document"'));
    // No transitions on the card or the ring («Menos movimiento»).
    expect(classOf(card)).not.toMatch(/transition|animate/);
    expect(classOf(ring)).not.toMatch(/transition|animate/);
  });

  it('el título dice «Paso 1 de N · …» y el cuerpo es la descripción', () => {
    const html = draw();
    expect(text(tag(html, /<h2\b[^>]*id="t-title"[^>]*>[\s\S]*?<\/h2>/))).toBe('Paso 1 de 4 · Tus pantallas');
    expect(text(tag(html, /<p\b[^>]*id="t-body"[^>]*>[\s\S]*?<\/p>/))).toBe('Aquí están las pantallas de tu trabajo.');
  });

  it('la X «Salir del tutorial» de 44 px; en el paso 1 no hay «Atrás»; los botones tienen 44 px', () => {
    const html = draw();
    const x = tag(html, /<button[^>]*aria-label="Salir del tutorial"[^>]*>/);
    expect(classOf(x)).toMatch(/\bh-11 w-11\b/);
    expect(buttons(html)).toEqual(['', 'Siguiente']);
    for (const b of html.matchAll(/<button\b[^>]*>/g)) expect(classOf(b[0])).toMatch(/\b(min-h-11|h-11)\b/);
  });

  it('del paso 2 en adelante, «Atrás · Siguiente»; el último, «Terminar»', () => {
    expect(buttons(draw({ view: step({ index: 1 }) }))).toEqual(['', 'Atrás', 'Siguiente']);
    expect(buttons(draw({ view: step({ index: 3, primary: 'finish' }) }))).toEqual(['', 'Atrás', 'Terminar']);
  });

  it('el último paso de bienvenida: «Ahora tu pantalla de inicio» y «Seguir»', () => {
    const html = draw({ view: step({ index: 5, total: 6, title: '360', body: 'Pregúntale a 360 lo que sea de la plataforma.', primary: 'continue' }) });
    expect(text(tag(html, /<p\b[^>]*id="t-body"[^>]*>[\s\S]*?<\/p>/))).toBe(`Pregúntale a 360 lo que sea de la plataforma. ${CHAIN_LINE}`);
    expect(buttons(html)).toEqual(['', 'Atrás', 'Seguir']);
  });

  it('sin medir todavía, la tarjeta se dibuja transparente (para medirla; su botón puede tomar el foco) y sin anillo', () => {
    const html = draw({ spot: null, ring: null });
    expect(classOf(tag(html, /<div[^>]*role="document"[^>]*>/))).toMatch(/\bopacity-0\b/);
    expect(classOf(tag(html, /<div[^>]*role="document"[^>]*>/))).not.toMatch(/\binvisible\b/);
    expect(html).not.toContain('data-tour-ring');
  });

  it('si la pantalla cambió (menos de 2 pasos): al centro, «Abrir la guía» de su rol y «Cerrar»', () => {
    const html = draw({ view: { kind: 'changed', title: 'Cómo se usa Hoy', guideHref: '/ayuda/redes?ver=pantallas' }, spot: 'center', ring: null });
    expect(text(html)).toContain(CHANGED_TEXT);
    expect(text(html)).not.toMatch(/Paso \d/);
    expect(classOf(tag(html, /<div[^>]*role="document"[^>]*>/))).toMatch(/\bleft-1\/2 top-1\/2\b/);
    expect(buttons(html)).toEqual(['', 'Cerrar', 'Abrir la guía']);
    expect(html).toMatch(/<a[^>]*href="\/ayuda\/redes\?ver=pantallas"/);
  });
});

describe('«Ayuda y guías» y «Ver el tutorial…» en «Mi cuenta»', () => {
  it('en el servidor solo el enlace a la ayuda, con su ancla (los tutoriales se preguntan al abrir el menú)', () => {
    const html = renderToStaticMarkup(createElement(HelpMenuItems, { tours: [] }));
    expect(buttons(html)).toEqual(['Ayuda y guías']);
    expect(tag(html, /<a\b[^>]*>/)).toMatch(/^(?=.*href="\/ayuda")(?=.*data-tour="help-menu")/);
  });

  it('lista solo los que el motor dice que se pueden ver aquí, en su orden; uno solo: «de esta pantalla»', () => {
    const tours = ['bienvenida', 'hoy-redes', 'piezas'].map((id) => ({ id, title: `Título ${id}`, screen: '/hoy', roles: ['social'], steps: [] }) as Tour);
    const target = new EventTarget();
    // A fake engine: it answers each question at once, as tour-host.tsx does.
    target.addEventListener(TOUR_CAN_EVENT, (e) => {
      const id = (e as CustomEvent<{ id: string }>).detail.id;
      const order = { 'hoy-redes': 1, bienvenida: 0 }[id] ?? -1;
      target.dispatchEvent(new CustomEvent(TOUR_CAN_ANSWER_EVENT, { detail: { id, ok: order >= 0, order } }));
    });
    expect(tutorialsHere([...tours].reverse(), target)).toEqual([
      { id: 'bienvenida', title: 'Título bienvenida' },
      { id: 'hoy-redes', title: 'Título hoy-redes' },
    ]);
    // Without an engine nothing is listed.
    expect(tutorialsHere(tours, new EventTarget())).toEqual([]);
    expect(tutorialLabel('Bienvenida', 1)).toBe('Ver el tutorial de esta pantalla');
    expect(tutorialLabel('Bienvenida', 2)).toBe('Ver el tutorial: Bienvenida');
  });
});
