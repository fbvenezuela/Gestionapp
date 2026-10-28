// The 360 assistant's guide cards (config/assistant/knowledge.json) say what the product does today (cambios del
// 27/10/2026, §3 and the decisions): the boss and despacho create, date, move and cancel events; Administración only
// reads the agenda; despacho's menu has Obras, Municipios and «Por ponerle fecha»; Grabación uploads the storyboard it
// recorded with and leaves a note for the editor; the boss edits storyboards and assigns who records; the IVT sees the
// date of the visits born from its fichas. Before this test, the assistant answered the pre-round rules (no cancel
// button, Administración creates and edits events).
import { describe, expect, it } from 'vitest';
import knowledge from '../../config/assistant/knowledge.json';
import roles from '../../config/assistant/roles.json';
import scripts from '../../config/assistant/scripts.json';

type Card = { key: string; roles: string[] | null; title: string; body: string; tags: string[] };
const CARDS = (knowledge as { knowledge: Card[] }).knowledge;
const card = (key: string) => {
  const c = CARDS.find((x) => x.key === key);
  if (!c) throw new Error(`no existe la ficha ${key}`);
  return c;
};
const sentences = (text: string) => text.split(/(?<=[.;])\s+/);
// Every text the assistant may say: the cards, the roles' «oficio» and the scripts with their notes.
const TEXTS: [where: string, text: string][] = [
  ...CARDS.map((c) => [`ficha ${c.key}`, `${c.title}. ${c.body}`] as [string, string]),
  ...Object.entries((roles as { roles: Record<string, { oficio: string }> }).roles).map(([k, r]) => [`oficio ${k}`, r.oficio] as [string, string]),
  ...((scripts as unknown as Record<string, { key: string; script: string; notes: string }[]>).scripts ?? []).map(
    (s) => [`guion ${s.key}`, `${s.script} ${s.notes}`] as [string, string],
  ),
];

describe('el asistente 360 dice las reglas de esta ronda', () => {
  it('ninguna ficha dice que Administración crea, cambia, mueve o cancela eventos', () => {
    const verb = /\b(crean?|cambian?|editan?|mueven?|cancelan?)\b/i;
    const offenders: string[] = [];
    for (const [where, text] of TEXTS) {
      for (const s of sentences(text)) {
        if (/Administraci[oó]n/i.test(s) && verb.test(s) && /\beventos?\b/i.test(s) && !/\bno\b|solo lee|nunca/i.test(s)) offenders.push(`${where}: ${s}`);
      }
      if (/Despacho y Administraci[oó]n (crean|cambian|editan)/i.test(text)) offenders.push(`${where}: «Despacho y Administración» escriben la agenda`);
      if (/Crear y editar eventos[^.]*Administraci[oó]n/i.test(text)) offenders.push(`${where}: «Crear y editar eventos … Administración»`);
    }
    expect(offenders).toEqual([]);
  });

  it('ninguna ficha dice que no hay botón para cancelar un evento; «cambiar-evento» explica Mover y Cancelar del jefe y Despacho', () => {
    for (const [where, text] of TEXTS) expect(text, where).not.toMatch(/(no|tampoco) hay bot[oó]n para cancelar/i);
    const c = card('cambiar-evento');
    expect(c.body).toMatch(/El jefe y Despacho/);
    expect(c.body).toMatch(/«Mover»/);
    expect(c.body).toMatch(/«Cancelar»/);
    expect(c.body).toMatch(/«Volver a la agenda»/);
    expect(c.roles).toEqual(expect.arrayContaining(['boss', 'dispatch']));
    expect(card('nuevo-evento').roles).toEqual(expect.arrayContaining(['boss', 'dispatch']));
    expect(card('nuevo-evento').body).toMatch(/Administración no crea eventos/);
  });

  it('el menú de Despacho trae Obras, Municipios y «Por ponerle fecha»', () => {
    const c = card('rol-despacho');
    expect(c.body).not.toMatch(/Menú: Hoy, Agenda y Biblioteca/);
    for (const x of ['Obras', 'Municipios', '«Por ponerle fecha»', '«Mover»', '«Cancelar»']) expect(c.body, x).toContain(x);
  });

  it('Grabación sube el storyboard con el que grabó y deja una nota para el editor (§5)', () => {
    for (const key of ['rol-grabacion', 'storyboard']) {
      const c = card(key);
      expect(c.body, key).toMatch(/storyboard con el que grabó/);
      expect(c.body, key).toMatch(/nota para el editor/);
    }
    expect(card('rol-grabacion').body).not.toMatch(/no edita ficha, fecha ni storyboard\.$/);
  });

  it('el jefe arma el storyboard y asigna quién graba; el IVT ve la fecha de sus visitas', () => {
    expect(card('storyboard').body).toMatch(/Lo arman Redes, el jefe y Administración/);
    expect(card('asignar-grabacion').body).toMatch(/Asignan el jefe, Despacho, Redes y Administración/);
    expect(card('asignar-grabacion').roles).toContain('boss');
    const permisos = card('permisos').body;
    expect(permisos).toMatch(/Asignar quién graba: el jefe/);
    expect(permisos).toMatch(/Armar el storyboard: Redes, el jefe/);
    expect(permisos).toMatch(/ponerles fecha y hora, moverlos y cancelarlos: el jefe y Despacho/);
    expect(card('agenda-privada').body).toMatch(/director del IVT, solo las visitas a sus obras/);
  });
});
