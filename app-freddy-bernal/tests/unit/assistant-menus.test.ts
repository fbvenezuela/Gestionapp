// What 360 says of each menu is the menu each role has (navFor, src/lib/roles.ts), with «Oficina» where it is (13/11:
// every menu answer and role card left it out). The bar and «Más» of the phone too: «Más» lists exactly what does not
// fit in the bar, and a role with nothing more hears that it has no «Más».
import { describe, it, expect } from 'vitest';
import { navFor, type Role } from '@/lib/roles';
import { ANSWERS } from '@/lib/assistant/answers';
import { textFor } from '@/lib/assistant/answers/engine';
import knowledge from '../../config/assistant/knowledge.json';

const ROLES: Role[] = ['boss', 'dispatch', 'politics', 'ivt', 'camera', 'social', 'admin'];
const answer = (id: string) => ANSWERS.find((a) => a.id === id)!;
const says = (text: string, label: string) => new RegExp(`(?<![\\p{L}])${label}(?![\\p{L}])`, 'u').test(text);
// The labels after «Más» in a text («… «Más» (Oficina, Obras y Web)…», «adentro están Oficina y Biblioteca.»).
const moreOf = (text: string) => {
  const m = /«Más»(?: con el resto)? \(([^)]*)\)|adentro (?:de «Más» )?están ([^.]*)\./.exec(text);
  return (m?.[1] ?? m?.[2] ?? '').split(/, | y /).map((x) => x.trim()).filter(Boolean);
};

describe('los menús que dice 360 son los de cada rol', () => {
  it('«¿qué hay en la barra de abajo?»: cada pantalla del menú, y en «Más» lo que no cabe', () => {
    for (const role of ROLES) {
      const { visible, more } = navFor([role]);
      const text = textFor(answer('todo-menu-telefono').a, [role]);
      for (const n of visible) expect(says(text, n.label), `${role}: ${n.label} :: ${text}`).toBe(true);
      expect(moreOf(text), `${role} :: ${text}`).toEqual(more.map((n) => n.label));
    }
  });

  it('«¿qué hay en «Más»?»: lo que no cabe, o que no hay «Más»', () => {
    for (const role of ROLES) {
      const { more } = navFor([role]);
      const text = textFor(answer('todo-mas').a, [role]);
      if (more.length) expect(moreOf(text), `${role} :: ${text}`).toEqual(more.map((n) => n.label));
      else expect(text, role).toMatch(/no tienes «Más»/);
    }
  });

  it('las respuestas del menú de cada rol y su ficha nombran todas sus pantallas', () => {
    const own: [Role, string][] = [['boss', 'jefe-menu-telefono'], ['dispatch', 'desp-menu'], ['social', 'red-pantallas'], ['camera', 'gra-menu'], ['ivt', 'ivt-menu']];
    for (const [role, id] of own) {
      const text = textFor(answer(id).a, [role]);
      const labels = navFor([role]).visible.map((n) => n.label).filter((l) => !(role === 'boss' && l === 'Inicio'));
      for (const l of role === 'boss' ? navFor([role]).more.map((n) => n.label) : labels) expect(says(text, l), `${id}: ${l} :: ${text}`).toBe(true);
    }
    const cards: [Role, string][] = [['boss', 'rol-jefe'], ['dispatch', 'rol-despacho'], ['politics', 'rol-politica'], ['ivt', 'rol-ivt'], ['social', 'rol-redes'], ['camera', 'rol-grabacion'], ['admin', 'rol-administracion']];
    for (const [role, key] of cards) {
      const card = (knowledge as { knowledge: { key: string; body: string }[] }).knowledge.find((c) => c.key === key)!;
      for (const n of navFor([role]).visible) expect(says(card.body, n.label), `${key}: ${n.label}`).toBe(true);
    }
  });
});
