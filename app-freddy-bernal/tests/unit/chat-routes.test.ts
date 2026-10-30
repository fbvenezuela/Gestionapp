// The two GET routes of Mensajes' loop (R3, D-56) and the reads behind them and behind the pages (src/lib/data/chat.ts),
// with channels (R5), against a real in-memory database with the demo seed. The session is mocked: no session → 401
// with no body; a bad id or a channel the person is not in → 404 (the same as one that does not exist; the screen keeps
// asking); 410 only when the database says the boss took the person out (the screen then says «Ya no estás en este
// canal.»); an account with Administración → 404 (Mensajes is not for it) and never a
// row; the answers are never stored (no-store). All data here is invented.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { Session } from '@/lib/auth/session';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import { CHAT_TEAM_ID, chatChannelId } from '@/lib/db/seed-parts/chat';
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
const C = chatChannelId('grabacion-y-redes');
const O = chatChannelId('obras-y-comunidad');
const J = chatChannelId('jefe-y-despacho');
const A = chatChannelId('jornada-de-salud');
const get = (id: string, qs = '') => nuevos.GET(new NextRequest(`http://localhost/api/mensajes/${id}/nuevos${qs}`), { params: Promise.resolve({ id }) });
const asUserDb = <T>(key: DemoUserKey, fn: (sql: import('@/lib/db').Sql) => Promise<T>) => t.as(key, fn);

describe('GET /api/mensajes/sin-leer', () => {
  it('cada persona del equipo entra con un canal sin leer (la semilla, D-88)', async () => {
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

describe('GET /api/mensajes/[id]/nuevos', () => {
  it('sin sesión: 401 sin cuerpo; con un id malo: 404', async () => {
    as(null);
    const r = await get(C);
    expect(r.status).toBe(401);
    expect(await r.text()).toBe('');
    as('social');
    expect((await get('no-es-un-id')).status).toBe(404);
    expect((await get(C, '?despues=ayer&id=x')).status).toBe(404);
  });

  it('a Administración no le da nada (404), ni con «Ver como jefe»', async () => {
    as('admin');
    expect((await get(C)).status).toBe(404);
    as('admin', { viewAs: 'boss' });
    expect((await get(C)).status).toBe(404);
    expect((await sinLeer.GET()).status).toBe(404);
  });

  it('un canal donde no está es 404, como uno que no existe', async () => {
    as('social');
    expect((await get(J)).status).toBe(404);
    expect((await get(O)).status).toBe(404);
    expect((await get(crypto.randomUUID())).status).toBe(404);
  });

  it('un miembro lee lo de su canal, en orden, con quién lo escribió, y sin guardarse', async () => {
    as('camera');
    const r = await get(C);
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toMatch(/no-store/);
    const { items } = (await r.json()) as { items: { body: string; author: string; role: string; createdAt: string }[] };
    expect(items.map((i) => i.body).slice(0, 4)).toEqual([
      'Ya subí las tomas de la cancha de El Mirador, con la nota para el editor.',
      'Gracias. ¿Las del dron quedaron en la casilla de Dron?',
      'Sí, y las de apoyo en Tomas de apoyo.',
      'Buen trabajo. Daniela, me pasas la pieza cuando esté.',
    ]);
    expect(items[0]).toMatchObject({ author: 'Tú', role: 'Grabación' });
    expect(items[1]).toMatchObject({ author: 'Daniela Pernía', role: 'Redes' });
    expect(items[3]).toMatchObject({ author: 'Jefe (demo)', role: 'Jefe' });
    const last = items.at(-1)!;
    const later = new Date(new Date(last.createdAt).getTime() + 60_000).toISOString();
    const again = (await (await get(C, `?despues=${encodeURIComponent(later)}&id=${crypto.randomUUID()}`)).json()) as { items: unknown[] };
    expect(again.items).toEqual([]);
  });

  it('el jefe lee los suyos (todos los canales, como miembro), y en «Todo el equipo» cada mensaje dice quién', async () => {
    as('boss');
    for (const c of [C, O, J, A]) expect((await get(c)).status, c).toBe(200);
    const { items } = (await (await get(CHAT_TEAM_ID)).json()) as { items: { author: string; role: string }[] };
    expect(items.slice(0, 2)).toMatchObject([{ author: 'Tú', role: 'Jefe' }, { author: 'Daniela Pernía', role: 'Redes' }]);
  });

  it('quien el jefe saca del canal recibe 410 desde ese momento (la pantalla se lo dice y deja de preguntar); si vuelve, 200', async () => {
    const x = await t.as('boss', async (sql) => (await sql.one<{ id: string }>(`select public.chat_channel_create('Salida (prueba)', null, $1::uuid[]) as id`, [[t.ids.camera2, t.ids.social2]]))!.id);
    as('camera2');
    expect((await get(x)).status).toBe(200);
    await t.as('boss', (sql) => sql.query(`select public.chat_channel_set_members($1, $2::uuid[])`, [x, [t.ids.social2]]));
    const r = await get(x);
    expect(r.status).toBe(410);
    expect(r.headers.get('cache-control')).toMatch(/no-store/);
    expect(await r.text()).toBe('');
    // Someone who never was in it still gets 404 (nothing said about the channel).
    as('politics');
    expect((await get(x)).status).toBe(404);
    await t.as('boss', (sql) => sql.query(`select public.chat_channel_set_members($1, $2::uuid[])`, [x, [t.ids.social2, t.ids.camera2]]));
    as('camera2');
    expect((await get(x)).status).toBe(200);
  });

  it('en la demostración, un canal que este servidor no tiene es 404 (la pantalla sigue preguntando), nunca 410 (D-88)', async () => {
    as('boss');
    expect((await get(crypto.randomUUID())).status).toBe(404);
  });
});

describe('lo que leen las pantallas', () => {
  it('«Mensajes»: «Todo el equipo» arriba, mis canales, los archivados aparte, con cuántos están, lo último y lo sin leer', async () => {
    const { rows, archived } = await asUserDb('social', (sql) => data.myChannels(sql, session('social')));
    expect(rows.map((c) => c.title)).toEqual(['Todo el equipo', 'Grabación y Redes']);
    expect(rows[1]).toMatchObject({ kind: 'channel', description: 'Tomas, material y piezas', memberCount: 5, archived: false, unread: 2 });
    expect(rows[1].last).toMatchObject({ by: 'Jefe', hidden: false });
    expect(archived.map((c) => c.title)).toEqual(['Jornada de salud']);
    const kevin = await asUserDb('camera', (sql) => data.myChannels(sql, session('camera')));
    expect(kevin.archived.map((c) => [c.title, c.archived, c.memberCount])).toEqual([['Jornada de salud', true, 4]]);
    // The boss: every channel, «Todo el equipo» first.
    const boss = await asUserDb('boss', (sql) => data.myChannels(sql, session('boss')));
    expect(boss.rows[0].kind).toBe('team');
    expect(boss.rows.map((c) => c.id)).toEqual(expect.arrayContaining([C, O, J]));
    expect(boss.archived.map((c) => c.id)).toEqual([A]);
    // Daniela does not see «Jefe y despacho» or «Obras y comunidad», not even by name.
    const daniela = await asUserDb('social', (sql) => data.myChannels(sql, session('social')));
    expect(JSON.stringify(daniela)).not.toMatch(/Jefe y despacho|Obras y comunidad/);
  });

  it('un canal: quiénes están (el jefe primero), los mensajes, el primero sin leer y si se escribe', async () => {
    const c = (await asUserDb('social2', (sql) => data.channel(sql, session('social2'), C)))!;
    expect(c).toMatchObject({ kind: 'channel', title: 'Grabación y Redes', description: 'Tomas, material y piezas', hidesAgenda: true, agendaNote: false, readOnly: null, archived: false });
    expect(c.members[0]).toMatchObject({ name: 'Jefe (demo)', boss: true, current: true });
    expect(c.members.map((m) => m.name).slice(1)).toEqual(['Daniela Pernía', 'Kevin Sánchez', 'Mariela Ostos', 'Yorman Chacón']);
    expect(c.items.find((i) => i.id === c.firstUnreadId)?.body).toBe('Ya subí las tomas de la cancha de El Mirador, con la nota para el editor.');
    // Archived: read, no box.
    const a = (await asUserDb('camera', (sql) => data.channel(sql, session('camera'), A)))!;
    expect(a).toMatchObject({ archived: true, readOnly: { reason: 'archived' } });
    // Who is not in it gets nothing.
    expect(await asUserDb('social', (sql) => data.channel(sql, session('social'), J))).toBeNull();
    expect(await asUserDb('admin', (sql) => data.channel(sql, session('admin'), C))).toBeNull();
    // «Todo el equipo»: everyone of the team, never Administración.
    const team = (await asUserDb('social', (sql) => data.channel(sql, session('social'), CHAT_TEAM_ID)))!;
    expect(team.members.map((m) => m.name)).not.toContain('Carla Méndez');
    expect(team.members).toHaveLength(8);
  });

  it('«Editar canal» y «Nuevo canal»: la lista del jefe; nadie más la ve', async () => {
    const e = (await asUserDb('boss', (sql) => data.channelEditor(sql, C)))!;
    expect(e).toMatchObject({ id: C, title: 'Grabación y Redes', archived: false });
    expect(new Set(e.members)).toEqual(new Set((['boss', 'social', 'social2', 'camera', 'camera2'] as const).map((k) => t.ids[k])));
    expect(e.people.find((p) => p.id === t.ids.boss)).toMatchObject({ boss: true });
    expect(e.people.map((p) => p.name)).not.toContain('Carla Méndez');
    expect(await asUserDb('boss', (sql) => data.channelEditor(sql, CHAT_TEAM_ID))).toBeNull();
    expect(await asUserDb('social', (sql) => data.chatPeopleForBoss(sql))).toEqual([]);
  });

  it('«Mensaje oculto»: quien no conoce la agenda ve dónde está, nunca el texto', async () => {
    // The boss writes a time where only despacho reads (allowed, agenda_clear false); then the system gives Rubén the
    // role Redes: from then on he does not read it.
    await t.as('boss', (sql) => sql.query(`insert into public.chat_messages (conversation_id, author_id, body) values ($1, auth.uid(), 'El jueves a las 10 en la plaza')`, [J]));
    await t.system((sql) => sql.query(`insert into public.user_roles (user_id, role) values ($1, 'social')`, [t.ids.dispatch]));
    try {
      const ruben = session('dispatch', { roles: ['dispatch', 'social'] });
      const conv = (await asUserDb('dispatch', (sql) => data.channel(sql, ruben, J)))!;
      expect(conv.items.at(-1)).toMatchObject({ body: null, author: 'Jefe (demo)' });
      expect(JSON.stringify(conv)).not.toContain('plaza');
      const list = await asUserDb('dispatch', (sql) => data.myChannels(sql, ruben));
      expect(list.rows.find((x) => x.id === J)?.last).toMatchObject({ text: CHAT_HIDDEN, hidden: true });
      h.session = ruben;
      const { items } = (await (await get(J)).json()) as { items: { body: string | null }[] };
      expect(items.at(-1)).toEqual(expect.objectContaining({ body: null }));
    } finally {
      await t.system((sql) => sql.query(`delete from public.user_roles where user_id = $1 and role = 'social'`, [t.ids.dispatch]));
    }
  });

  it('un enlace de la plataforma lleva el título que ve quien lee, o «Algo que no puedes abrir»; un canal ajeno, también', async () => {
    const ev = (await t.system((sql) => sql.one<{ id: string; title: string }>(`select id, title from public.events where deleted_at is null order by title limit 1`)))!;
    const refs = [{ kind: 'event', id: ev.id, href: `/eventos/${ev.id}` }, { kind: 'event', id: '00000000-0000-4000-8000-0000000000ff', href: '/eventos/00000000-0000-4000-8000-0000000000ff' }];
    const links = await asUserDb('boss', (sql) => data.linkTitles(sql, refs));
    expect(links.get(`/eventos/${ev.id}`)).toEqual({ href: `/eventos/${ev.id}`, kind: 'Evento', title: ev.title });
    expect(links.get('/eventos/00000000-0000-4000-8000-0000000000ff')?.title).toBeNull();
    const chats = await asUserDb('social', (sql) => data.linkTitles(sql, [{ kind: 'chat', id: C, href: `/mensajes/${C}` }, { kind: 'chat', id: J, href: `/mensajes/${J}` }]));
    expect(chats.get(`/mensajes/${C}`)).toEqual({ href: `/mensajes/${C}`, kind: 'Canal', title: 'Grabación y Redes' });
    expect(chats.get(`/mensajes/${J}`)?.title).toBeNull();
  });
});
