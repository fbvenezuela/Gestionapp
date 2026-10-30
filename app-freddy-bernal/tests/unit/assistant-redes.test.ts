// 360 and Redes by format (R4, D-77, design §6): the questions of the new screens answer with their guide card and the
// button to their screen («¿cómo armo el feed?», «¿qué es fin de mes?», «¿quién borra una pieza?», «¿dónde están las
// piezas?»), `estado_pieza` says where a piece lives (its format, its month and its feed place), and `mis_pendientes`
// counts the open month's «Copy faltante» and «Imagen faltante» as the board does. Through the demo brain (no AI, as
// the real demo) on the demo database, every read as the person (RLS). Its own file: its own demo database and hourly
// limit. Invented data.
import { describe, expect, it } from 'vitest';
import type { Session } from '@/lib/auth/session';
import { withUser } from '@/lib/db';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import type { Role } from '@/lib/roles';
import { handleTurn } from '@/lib/assistant';
import { NOT_SURE } from '@/lib/assistant/local';
import { TOOLS, redesPlace, runTool } from '@/lib/assistant/tools';
import { escalate } from '@/lib/assistant/escalate';
import { FACTORY_KNOWLEDGE } from '@/lib/assistant/config';
import { getNavCounts, getRedesSettings, monthContext } from '@/lib/data/redes';
import { asksRedesSection, breaksAgendaRule } from '@/lib/assistant/brain';
import { screenFor } from '@/lib/assistant/screens';
import { redesSectionLabel } from '@/lib/redes-screens';

function sessionOf(key: DemoUserKey): Session {
  const u = DEMO_USERS.find((x) => x.key === key)!;
  return {
    userId: u.id, email: u.email, name: u.name, roles: [...u.roles] as Role[], aal: 'aal2', mfaRequired: false, mfaOk: true,
    claims: { sub: u.id, aal: 'aal2', role: 'authenticated' }, viewAs: null,
  };
}
const ctx = (key: DemoUserKey) => ({ session: sessionOf(key), conversationId: null, escalate });

// has: words the answer must carry; go: the «Ir a…» screen (null: no button); label: its button's name, when it says.
type Expect = { has: RegExp; go: string | null; label?: string };
const DELETE_RULE = /^Eliminar una pieza: solo el jefe, con el doble factor; no se borra de verdad/;
// Since the answers (D-89), the curated answer for each role may say it first: who deletes, in that role's words.
const DELETE_WHO = (who: RegExp) => new RegExp(`${DELETE_RULE.source}|${who.source}`);
const TABLE: Partial<Record<DemoUserKey, [string, Expect][]>> = {
  social: [
    // Redes' curated answer comes with the feed's tutorial (its button replaces «Ir a…»).
    ['¿cómo armo el feed?', { has: /^Para armar el feed del mes: Redes → Feed, tocas un espacio vacío|^Redes → «Feed», y el mes en las pestañas/, go: null }],
    // A section's button names the section itself («Ir a Fin de mes»), not the pattern of its screen.
    ['¿qué es fin de mes?', { has: /^Fin de mes es una sección de Redes sin cupo/, go: '/redes/fin-de-mes', label: 'Fin de mes' }],
    ['¿quién borra una pieza?', { has: DELETE_WHO(/^Solo el jefe, con el doble factor/), go: null }],
    ['¿dónde están las piezas?', { has: /^Redes: el tablero y una sección por formato/, go: '/redes', label: 'Redes' }],
    // The guide's task (D-89) says it too: «En una tarjeta: tres puntos → «Mover a otro mes»…».
    ['¿cómo muevo una pieza de mes?', { has: /^Para mover una pieza de mes: en su tarjeta, tres puntos → «Mover a otro mes»|tres puntos → «Mover a otro mes»/, go: '/redes' }],
    ['¿qué es un pilar?', { has: /pilares/, go: '/redes' }],
    ['¿dónde está el feed?', { has: /^El feed del mes: en Redes: los 24 espacios del mes/, go: '/redes/feed' }],
  ],
  boss: [
    ['¿quién borra una pieza?', { has: DELETE_WHO(/^Solo tú eliminas piezas/), go: '/redes' }],
    ['¿dónde están las piezas?', { has: /^Redes: el tablero/, go: '/redes' }],
    ['¿qué es fin de mes?', { has: /^Fin de mes es una sección de Redes sin cupo/, go: '/redes/fin-de-mes' }],
    // His curated answer (D-89): «Tu Inicio → botón Redes → «Resumen del mes», o Redes → «Fin de mes»…», with Redes' button.
    ['¿dónde veo el resumen del mes?', { has: /Resumen del mes/, go: '/redes' }],
  ],
  admin: [
    // Administración does not delete: it brings a piece back in Ajustes → Cupo y pilares.
    ['¿quién borra una pieza?', { has: DELETE_WHO(/^Solo el jefe elimina piezas/), go: '/ajustes/contenido' }],
    ['¿dónde cambio el cupo?', { has: /^Cupo y pilares: en Ajustes|^Ajustes → «Cupo y pilares»/, go: '/ajustes/contenido' }],
    ['¿cuánto es el cupo del mes?', { has: /^El cupo del mes|«Cupo del mes»/, go: '/ajustes/contenido' }],
  ],
};

describe('360 contesta lo de Redes por formato con su ficha y su botón (cerebro de demostración)', () => {
  for (const [role, rows] of Object.entries(TABLE) as [DemoUserKey, [string, Expect][]][]) {
    it(`${role}: cada pregunta, con su ficha y su pantalla`, async () => {
      for (const [q, e] of rows) {
        const r = await handleTurn(sessionOf(role), { question: q }, { chain: [] });
        const who = `${role}: ${q} → ${r.answer}`;
        expect(r.model, who).toBe('local');
        expect(r.answer, who).not.toBe(NOT_SURE);
        expect(r.answer, who).toMatch(e.has);
        expect(r.goTo?.href ?? null, who).toBe(e.go);
        if (e.label) expect(r.goTo?.label, who).toBe(e.label);
      }
    });
  }

  it('el botón a una sección dice su nombre; la pantalla de la sección, en las guías y en 360, sigue siendo «Una sección de Redes»', () => {
    expect(redesSectionLabel('/redes/reels')).toBe('Reels');
    expect(redesSectionLabel('/redes/fin-de-mes?mes=x#pieza-y')).toBe('Fin de mes');
    for (const href of ['/redes', '/redes/feed', '/redes/buscar', '/redes/nada', '/piezas/x']) expect(redesSectionLabel(href), href).toBeNull();
    expect(screenFor('/redes/historias')?.label).toBe('Una sección de Redes');
  });

  it('disparadores estrechos: «Pilar» como nombre o «cupo» de un evento no reciben la ficha del cupo', async () => {
    for (const q of ['¿Pilar ya mandó el material?', '¿hay cupo en el operativo?']) {
      const r = await handleTurn(sessionOf('social'), { question: q }, { chain: [] });
      expect(r.answer, q).not.toMatch(/^El cupo del mes|pilares/);
    }
  });

  it('un rol sin Redes no recibe esas fichas ni sus botones', async () => {
    for (const key of ['ivt', 'camera'] as DemoUserKey[]) {
      const r = await handleTurn(sessionOf(key), { question: '¿cómo armo el feed?' }, { chain: [] });
      expect(r.answer, key).not.toMatch(/Para armar el feed/);
      expect(r.goTo?.href ?? null, key).not.toBe('/redes/feed');
    }
  });

  it('las fichas de Redes son para Redes, el jefe y administración', () => {
    for (const key of ['redes-por-formato', 'feed', 'meses-cupo', 'revision-diseno', 'receptividad', 'avisos-cumplimiento', 'tablero-redes', 'fin-de-mes']) {
      const k = FACTORY_KNOWLEDGE.find((x) => x.key === key);
      expect(k, key).toBeDefined();
      expect([...(k!.roles ?? [])].sort(), key).toEqual(['admin', 'boss', 'social']);
    }
  });
});

describe('«Fin de mes» es una sección, pero «a fin de mes» sigue siendo la agenda', () => {
  it('solo el nombre de la sección deja de contar como una pregunta de eventos', () => {
    for (const q of ['¿qué es fin de mes?', '¿Qué va en Fin de mes?', '¿para qué sirve la sección fin de mes?', '¿dónde veo el resumen del mes?', '¿cómo va el mes de Redes?']) expect(asksRedesSection(q), q).toBe(true);
    for (const q of ['¿qué hay a fin de mes?', '¿cuándo es el evento de fin de mes?', '¿qué es fin de mes? ¿y la feria?', '¿cómo armo el feed?']) expect(asksRedesSection(q), q).toBe(false);
    // The net still checks an answer next to an event lookup, and any question about an event.
    const lookup = [{ tool: 'buscar_evento', ok: true, result: {} }];
    expect(breaksAgendaRule('La feria es a fin de mes.', '¿qué es fin de mes?', lookup, undefined, { sectionAsk: true })).toBe(true);
    expect(breaksAgendaRule('La feria es a fin de mes.', '¿cuándo es la feria?', [], undefined, { sectionAsk: false })).toBe(true);
    expect(breaksAgendaRule('Fin de mes es una sección de Redes sin cupo.', '¿qué es fin de mes?', [], undefined, { sectionAsk: true })).toBe(false);
  });

  it('en la conversación: una fecha del mes nunca recibe la ficha de la sección', async () => {
    for (const q of ['¿qué hay a fin de mes?', '¿cuándo es el evento de fin de mes?']) {
      const r = await handleTurn(sessionOf('social'), { question: q }, { chain: [] });
      expect(r.answer, q).not.toMatch(/Fin de mes es una sección/);
      expect(r.answer, q).toMatch(/no lo manejo|no la tengo|no los manejo/);
    }
  });
});

describe('estado_pieza dice dónde vive la pieza en Redes', () => {
  it('su formato, su mes y su espacio del feed (o «sin programar»); solo posts, reels y carruseles van en el feed', () => {
    expect(redesPlace({ format: 'reel', month: 'Mes 1', feed_num: 7, feed_month: 'Mes 1' })).toEqual({ formato: 'Reel', mes: 'Mes 1', espacio_feed: '#7 del feed' });
    expect(redesPlace({ format: 'post', month: 'Mes 2', feed_num: 3, feed_month: 'Mes 1' })).toEqual({ formato: 'Post', mes: 'Mes 2', espacio_feed: '#3 del feed de Mes 1' });
    expect(redesPlace({ format: 'carousel', month: 'Mes 1', feed_num: null, feed_month: null }).espacio_feed).toBe('sin programar');
    expect(redesPlace({ format: 'story', month: 'Mes 1', feed_num: null, feed_month: null })).toEqual({ formato: 'Historia', mes: 'Mes 1', espacio_feed: null });
    expect(redesPlace({ format: 'nada', month: null, feed_num: null, feed_month: null })).toEqual({ formato: null, mes: null, espacio_feed: null });
  });

  it('en la demo: un post de Mes 1 puesto en el feed, y una pieza sin espacio', async () => {
    const r = await runTool('estado_pieza', { titulo: 'Tips para ahorrar agua' }, TOOLS, ctx('social'));
    expect(r.ok, JSON.stringify(r)).toBe(true);
    const [p] = (r.result as { piezas: Record<string, unknown>[] }).piezas;
    expect(p).toMatchObject({ formato: 'Post', mes: 'Mes 1' });
    expect(String(p.espacio_feed)).toMatch(/^#\d{1,2} del feed$/);
    // The answer says it in words, and never an hour or a date.
    const t = await handleTurn(sessionOf('boss'), { question: '¿Cómo va la pieza «Tips para ahorrar agua»?' }, { chain: [] });
    expect(t.answer).toMatch(/Es un post de Mes 1, #\d{1,2} del feed\./);
    expect(t.answer).not.toMatch(/\d{1,2}:\d{2}|\d{1,2}\/\d{1,2}/);
  });
});

describe('mis_pendientes: «Copy faltante» e «Imagen faltante» del mes abierto, como el tablero', () => {
  it('Redes ve las mismas cuentas del tablero; el jefe no (lo suyo es aprobar)', async () => {
    const board = await withUser(sessionOf('social').claims, async (sql) => {
      const mc = await monthContext(sql, null);
      const counts = Object.values(await getNavCounts(sql, mc.active!.id, (await getRedesSettings(sql)).quotas));
      return { label: mc.active!.label, copy: counts.reduce((n, c) => n + c.copyMissing, 0), image: counts.reduce((n, c) => n + c.imageMissing, 0) };
    });
    expect(board.copy).toBeGreaterThan(0);
    expect(board.image).toBeGreaterThan(0);
    const pieces = (n: number) => `${n} ${n === 1 ? 'pieza' : 'piezas'} de ${board.label}`;
    const social = await runTool('mis_pendientes', {}, TOOLS, ctx('social'));
    const list = (social.result as { pendientes: { que: string; titulo: string }[] }).pendientes;
    expect(list.filter((x) => x.que === 'Copy faltante').map((x) => x.titulo)).toEqual([pieces(board.copy)]);
    expect(list.filter((x) => x.que === 'Imagen faltante').map((x) => x.titulo)).toEqual([pieces(board.image)]);
    const boss = await runTool('mis_pendientes', {}, TOOLS, ctx('boss'));
    expect((boss.result as { pendientes: { que: string }[] }).pendientes.some((x) => /faltante/.test(x.que))).toBe(false);
  });
});
