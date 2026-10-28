// The two GET routes of Mensajes' loop (R3, D-56) and the reads behind them and behind the pages (src/lib/data/chat.ts),
// against a real in-memory database with the demo seed. The session is mocked: no session → 401 with no body; a bad id
// or a conversation the person cannot read → 404 (the same as one that does not exist); an account with
// Administración → 404 (Mensajes is not for it) and never a row; the answers are never stored (no-store). All data
// here is invented.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { Session } from '@/lib/auth/session';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import { CHAT_TEAM_ID, chatDirectId, chatGroupId } from '@/lib/db/seed-parts/chat';
import { CHAT_HIDDEN } from '@/lib/domain/chat';
import { withUser } from '@/lib/db';
import { makeTestDb, type TestDb } from '../rls/setup';

const h = vi.hoisted(() => ({ session: null as unknown }));
vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(async () => h.session),
  db: (s: { claims: Parameters<typeof withUser>[0] }, fn: Parameters<typeof withUser>[1]) => withUser(s.claims, fn),
}));

let t: TestDb;
let nuevos: typeof import('@/app/api/mensajes/[id]/nuevos/route');
let sinLeer: typeof import('@/app/api/mensajes/sin-leer/route');
let data: typeof import('@/lib/data/chat');

beforeAll(async () => {
  t = await makeTestDb();
  (globalThis as { __fbBackend?: Promise<unknown> }).__fbBackend = Promise.resolve(t.backend);
  nuevos = await import('@/app/api/mensajes/[id]/nuevos/route');
  sinLeer = await import('@/app/api/mensajes/sin-leer/route');
  data = await import('@/lib/data/chat');
});

function session(key: DemoUserKey, over: Partial<Session> = {}): Session {
  const u = DEMO_USERS.find((x) => x.key === key)!;
  return {
    userId: t.ids[key], email: u.email, name: u.name, roles: [...u.roles], aal: 'aal2', mfaRequired: false, mfaOk: true,
    claims: { sub: t.ids[key], aal: 'aal2', role: 'authenticated' }, viewAs: null, ...over,
  };
}
const as = (key: DemoUserKey | null, over: Partial<Session> = {}) => {
  h.session = key ? session(key, over) : null;
};
const direct = (a: DemoUserKey, b: DemoUserKey) => chatDirectId(t.ids[a], t.ids[b]);
const get = (id: string, qs = '') => nuevos.GET(new NextRequest(`http://localhost/api/mensajes/${id}/nuevos${qs}`), { params: Promise.resolve({ id }) });
const asUserDb = <T>(key: DemoUserKey, fn: (sql: import('@/lib/db').Sql) => Promise<T>) => t.as(key, fn);

describe('GET /api/mensajes/[id]/nuevos', () => {
  it('sin sesión: 401 sin cuerpo; con un id malo: 404', async () => {
    as(null);
    const r = await get(direct('social', 'camera'));
    expect(r.status).toBe(401);
    expect(await r.text()).toBe('');
    as('social');
    expect((await get('no-es-un-id')).status).toBe(404);
    expect((await get(direct('social', 'camera'), '?despues=ayer&id=x')).status).toBe(404);
  });

  it('a Administración no le da nada (404), ni con «Ver como jefe»', async () => {
    as('admin');
    expect((await get(direct('social', 'camera'))).status).toBe(404);
    as('admin', { viewAs: 'boss' });
    expect((await get(direct('social', 'camera'))).status).toBe(404);
    expect((await sinLeer.GET()).status).toBe(404);
  });

  it('una conversación ajena es 404, como una que no existe', async () => {
    as('social');
    expect((await get(direct('boss', 'dispatch'))).status).toBe(404);
    expect((await get(crypto.randomUUID())).status).toBe(404);
  });

  it('un miembro lee lo de su conversación, en orden, con quién lo escribió, y sin guardarse', async () => {
    as('camera');
    const r = await get(direct('social', 'camera'));
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toMatch(/no-store/);
    const { items } = (await r.json()) as { items: { body: string; author: string; role: string; createdAt: string }[] };
    expect(items.map((i) => i.body).slice(0, 4)).toEqual([
      'Ya subí las tomas de la cancha de El Mirador, con la nota para el editor.',
      'Gracias. ¿Las del dron quedaron en la casilla de Dron?',
      'Sí, y las de apoyo en Tomas de apoyo. El audio del jefe se oye bien.',
      'Perfecto, armo la pieza y te aviso si falta algo.',
    ]);
    expect(items[0]).toMatchObject({ author: 'Tú', role: 'Grabación' });
    expect(items[1]).toMatchObject({ author: 'Daniela Pernía', role: 'Redes' });
    // After the last one: nothing new except the overlap the phone drops by id.
    const last = items.at(-1)!;
    const later = new Date(new Date(last.createdAt).getTime() + 60_000).toISOString();
    const again = (await (await get(direct('social', 'camera'), `?despues=${encodeURIComponent(later)}&id=${crypto.randomUUID()}`)).json()) as { items: unknown[] };
    expect(again.items).toEqual([]);
  });

  it('el jefe lee cualquiera (solo lectura), y en «Todo el equipo» cada mensaje dice quién', async () => {
    as('boss');
    expect((await get(chatGroupId('obras-y-comunidad'))).status).toBe(200);
    const { items } = (await (await get(CHAT_TEAM_ID)).json()) as { items: { author: string; role: string }[] };
    expect(items.slice(0, 2)).toMatchObject([{ author: 'Tú', role: 'Jefe' }, { author: 'Daniela Pernía', role: 'Redes' }]);
  });
});

describe('GET /api/mensajes/sin-leer', () => {
  it('cada persona del equipo entra con lo suyo sin leer (la semilla, D-57)', async () => {
    for (const k of ['boss', 'dispatch', 'politics', 'ivt', 'social', 'social2', 'camera', 'camera2'] as const) {
      as(k);
      const r = await sinLeer.GET();
      expect(r.status, k).toBe(200);
      expect(((await r.json()) as { n: number }).n, k).toBe(1);
    }
    as(null);
    expect((await sinLeer.GET()).status).toBe(401);
  });
});

describe('lo que leen las pantallas', () => {
  it('«Mensajes»: «Todo el equipo» arriba, sin las directas que no tienen mensajes, con lo último y lo sin leer', async () => {
    const list = await asUserDb('camera', (sql) => data.myConversations(sql, session('camera')));
    expect(list[0]).toMatchObject({ kind: 'team', title: 'Todo el equipo', unread: 0 });
    expect(list.map((c) => c.title)).toEqual(['Todo el equipo', 'Daniela Pernía', 'Mariela Ostos']);
    expect(list[1]).toMatchObject({ kind: 'direct', roles: 'Redes', unread: 1, last: { by: 'Daniela', text: 'Perfecto, armo la pieza y te aviso si falta algo.', hidden: false } });
    expect(list[2]).toMatchObject({ unread: 0, last: { by: 'Mariela' } });
  });

  it('una conversación: miembros, mensajes, el primero sin leer, y quién puede escribir', async () => {
    const c = (await asUserDb('camera', (sql) => data.conversation(sql, session('camera'), direct('social', 'camera'))))!;
    expect(c).toMatchObject({ kind: 'direct', title: 'Daniela Pernía', isMember: true, hidesAgenda: true, agendaNote: true, more: false });
    // Nobody of the demo accepted the notice yet.
    expect(c.readOnly).toEqual({ reason: 'needs-ack' });
    expect(c.items.find((i) => i.id === c.firstUnreadId)?.body).toBe('Perfecto, armo la pieza y te aviso si falta algo.');
    // The boss reads it, without the box and without a «new» mark.
    const boss = (await asUserDb('boss', (sql) => data.conversation(sql, session('boss'), direct('social', 'camera'))))!;
    expect(boss).toMatchObject({ isMember: false, readOnly: { reason: 'boss-reader' }, firstUnreadId: null, title: 'Daniela y Kevin' });
    // Who cannot read it gets nothing.
    expect(await asUserDb('social2', (sql) => data.conversation(sql, session('social2'), direct('social', 'camera')))).toBeNull();
    expect(await asUserDb('admin', (sql) => data.conversation(sql, session('admin'), direct('social', 'camera')))).toBeNull();
  });

  it('«Mensaje oculto»: quien no conoce la agenda ve dónde está, nunca el texto', async () => {
    // Despacho writes a time to Grabación (no Redes nor política: allowed, agenda_clear false); then the system gives
    // Grabación the role Redes: from then on Kevin does not read it.
    await t.as('dispatch', (sql) => sql.query(`insert into public.chat_notice_ack (user_id) values (auth.uid()) on conflict do nothing`));
    const c = direct('dispatch', 'camera');
    await t.as('dispatch', (sql) => sql.query(`insert into public.chat_messages (conversation_id, author_id, body) values ($1, auth.uid(), 'El jueves a las 10 en la plaza')`, [c]));
    await t.system((sql) => sql.query(`insert into public.user_roles (user_id, role) values ($1, 'social')`, [t.ids.camera]));
    try {
      const kevin = session('camera', { roles: ['camera', 'social'] });
      const conv = (await asUserDb('camera', (sql) => data.conversation(sql, kevin, c)))!;
      expect(conv.items).toHaveLength(1);
      expect(conv.items[0]).toMatchObject({ body: null, author: 'Rubén Contreras' });
      expect(JSON.stringify(conv)).not.toContain('plaza');
      const list = await asUserDb('camera', (sql) => data.myConversations(sql, kevin));
      expect(list.find((x) => x.id === c)?.last).toMatchObject({ text: CHAT_HIDDEN, hidden: true });
      h.session = kevin;
      const { items } = (await (await get(c)).json()) as { items: { body: string | null }[] };
      expect(items).toEqual([expect.objectContaining({ body: null })]);
    } finally {
      await t.system((sql) => sql.query(`delete from public.user_roles where user_id = $1 and role = 'social'`, [t.ids.camera]));
    }
  });

  it('un enlace de la plataforma lleva el título que ve quien lee, o «Algo que no puedes abrir»', async () => {
    const ev = (await t.system((sql) => sql.one<{ id: string; title: string }>(`select id, title from public.events where deleted_at is null order by title limit 1`)))!;
    const refs = [{ kind: 'event', id: ev.id, href: `/eventos/${ev.id}` }, { kind: 'event', id: '00000000-0000-4000-8000-0000000000ff', href: '/eventos/00000000-0000-4000-8000-0000000000ff' }];
    const links = await asUserDb('boss', (sql) => data.linkTitles(sql, refs));
    expect(links.get(`/eventos/${ev.id}`)).toEqual({ href: `/eventos/${ev.id}`, kind: 'Evento', title: ev.title });
    expect(links.get('/eventos/00000000-0000-4000-8000-0000000000ff')?.title).toBeNull();
  });

  it('«Quién habla con quién»: las 10 parejas con los nombres de cada rol', async () => {
    const r = await asUserDb('boss', (sql) => data.chatRules(sql));
    expect(r.pairs).toHaveLength(10);
    expect(r.pairs.find((p) => p.roleA === 'social' && p.roleB === 'camera')).toMatchObject({ label: 'Redes ↔ Grabación', allowed: true, namesA: ['Daniela', 'Yorman'], namesB: ['Kevin', 'Mariela'] });
    expect(r.team).toMatchObject({ id: CHAT_TEAM_ID, onlyBoss: false });
  });

  it('«Todas» para el jefe: lo que tuvo movimiento, con cuántos mensajes y si es parte', async () => {
    const { rows } = await asUserDb('boss', (sql) => data.allConversations(sql, session('boss')));
    expect(rows.length).toBeGreaterThanOrEqual(8);
    expect(rows.find((x) => x.id === direct('social', 'camera'))).toMatchObject({ title: 'Daniela y Kevin', mine: false, count: 4 });
    expect(rows.find((x) => x.id === CHAT_TEAM_ID)).toMatchObject({ mine: true });
    expect(rows.some((x) => x.kind === 'direct' && x.count === 0)).toBe(false);
  });
});
