// The flowchart as the app draws it (R3, D-44, map_ui §8): an ordered list with its name and number of steps, arrows
// hidden from screen readers, decisions as a list inside their card, «tú» on the reader's steps, and a link to a
// screen only when the reader can open it. Rendered here without a server.
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Flowchart } from '@/components/guides/flowchart';
import { TasksTab } from '@/components/guides/role-guide';
import { FLOWS, flowById, guideFor } from '@/lib/guides';

const html = (id: string, mine: Parameters<typeof Flowchart>[0]['mine'], roles: Parameters<typeof Flowchart>[0]['roles']) =>
  renderToStaticMarkup(createElement(Flowchart, { flow: flowById(id)!, mine, roles }));
const text = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('el flujograma en la app', () => {
  it('una lista ordenada con su nombre y cuántos pasos tiene', () => {
    const f = flowById('comunitario')!;
    const out = html('comunitario', ['politics'], ['politics']);
    expect(out.startsWith(`<ol aria-label="${f.title}, ${f.steps.length} pasos"`)).toBe(true);
    expect(out.match(/<li class="flex flex-col">/g)?.length).toBe(f.steps.length);
  });

  it('las flechas no se leen y usan el color del texto', () => {
    const out = html('evento', ['social'], ['social']);
    // The arrows between steps (the «Abrir» links carry an icon of their own).
    const svgs = [...out.matchAll(/<svg[^>]*viewBox="0 0 24 32"[^>]*>/g)].map((m) => m[0]);
    expect(svgs.length).toBe(flowById('evento')!.steps.length - 1);
    for (const s of svgs) {
      expect(s).toContain('aria-hidden="true"');
      expect(s).toContain('focusable="false"');
    }
    expect(out).toContain('stroke="currentColor"');
    expect(out).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
  });

  it('una decisión lleva su pregunta y sus respuestas como lista dentro de la tarjeta', () => {
    const out = html('comunitario', ['politics'], ['politics']);
    expect(out).toContain('¿Va a la agenda del jefe?');
    expect(out).toMatch(/<ul[^>]*aria-label="Respuestas a: ¿Va a la agenda del jefe\?"/);
    expect(text(out)).toContain('No → : «Guardar»: queda en el registro del municipio. Sigue en el paso 4.');
  });

  it('«tú» en los pasos de quien lee, con borde de acento', () => {
    const out = html('comunitario', ['politics'], ['politics']);
    const mine = flowById('comunitario')!.steps.filter((s) => s.roles.includes('politics')).length;
    expect(out.match(/ · tú/g)?.length).toBe(mine);
    expect(out.match(/Te toca a ti\./g)?.length).toBe(mine);
    expect(out.match(/border-2 border-accent/g)?.length).toBe(mine);
    // Someone not in the flow: no «tú».
    expect(html('comunitario', ['camera'], ['camera'])).not.toContain(' · tú');
  });

  it('en la guía de otro rol, «tú» marca los pasos de quien lee (el jefe, administración), nunca los del rol de la guía', () => {
    const guide = guideFor('social');
    const withFlow = guide.tasks.filter((t) => t.flow);
    const count = (role: 'boss' | 'social') => withFlow.reduce((n, t) => n + flowById(t.flow!)!.steps.filter((s) => s.roles.includes(role)).length, 0);
    // Redes has steps the boss does not: the test would see the difference.
    expect(count('social')).toBeGreaterThan(count('boss'));
    const tab = (roles: Parameters<typeof TasksTab>[0]['roles']) => renderToStaticMarkup(createElement(TasksTab, { guide, tours: [], home: '/jefe', roles }));
    expect(tab(['boss']).match(/ · tú/g)?.length ?? 0).toBe(count('boss'));
    expect(tab(['admin'])).not.toContain(' · tú');
    expect(tab(['admin'])).not.toContain('Te toca a ti.');
    // Redes reading its own guide: its steps.
    expect(tab(['social']).match(/ · tú/g)?.length ?? 0).toBe(count('social'));
  });

  it('el enlace a la pantalla solo si quien lee la puede abrir', () => {
    // «Por ponerle fecha» opens for the boss and despacho, never for política.
    expect(html('comunitario', ['politics'], ['politics'])).not.toContain('href="/agenda/por-fecha"');
    expect(html('comunitario', ['dispatch'], ['dispatch'])).toContain('href="/agenda/por-fecha"');
    expect(text(html('comunitario', ['dispatch'], ['dispatch']))).toContain('Abrir Por ponerle fecha');
  });

  it('los ocho flujos se dibujan, y cada rama que vuelve dice a qué paso', () => {
    expect(FLOWS.map((f) => f.id)).toEqual(['evento', 'obra', 'comunitario', 'tweets', 'aprobacion', 'entrega', 'mensajes', 'ayuda']);
    for (const f of FLOWS) {
      const ids = new Set(f.steps.map((s) => s.id));
      expect(ids.size, f.id).toBe(f.steps.length);
      for (const s of f.steps) {
        for (const b of s.branches ?? []) if (b.to) expect(ids.has(b.to), `${f.id}: ${b.to}`).toBe(true);
        expect(!!s.question, `${f.id}/${s.id}: pregunta y ramas van juntas`).toBe(!!s.branches?.length);
      }
      expect(() => html(f.id, ['boss'], ['boss'])).not.toThrow();
    }
  });
});
