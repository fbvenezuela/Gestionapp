// The server actions of Mensajes as channels (R5, design §5.3) against a real in-memory database with the same
// migrations and the demo seed. The session is mocked, and so is the push sender (pushNotice): what reaches it must
// never carry a message's text or a channel's name. Also: the input shapes, the boss's channel actions (only the boss),
// the questions before sending (a time code of Grabación, a relative word: E1), the refusals that keep the text out of
// the error, a send repeated with the same id, a person taken out of the channel meanwhile («gone»), and that sending
// refreshes nothing (no revalidatePath). No notice to accept anywhere. All data here is invented.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import type { Session } from '@/lib/auth/session';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import { CHAT_TEAM_ID, chatChannelId } from '@/lib/db/seed-parts/chat';
import { CHAT_NOT_IN_LIST, CHAT_PHONE_LINK_TEXT, CHAT_PHONE_TEXT, CHAT_TEXT_REFUSED } from '@/lib/domain/chat';
import { makeTestDb, type TestDb } from '../rls/setup';

const h = vi.hoisted(() => ({ session: null as unknown, pushes: [] as { recipients: { id: string }[]; n: Record<string, unknown> }[], revalidated: [] as string[] }));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn((p: string) => h.revalidated.push(p)) }));
vi.mock('@/lib/auth/session', () => ({ requireSession: vi.fn(async () => h.session) }));
vi.mock('@/lib/push/deliver', async (orig) => ({
  ...(await orig<typeof import('@/lib/push/deliver')>()),
  pushNotice: vi.fn(async (recipients: { id: string }[], n: Record<string, unknown>) => {
    h.pushes.push({ recipients, n });
  }),
}));

let t: TestDb;
let chat: typeof import('@/lib/actions/chat');
const uuid = () => crypto.randomUUID();
const C = chatChannelId('grabacion-y-redes');
const O = chatChannelId('obras-y-comunidad');
const J = chatChannelId('jefe-y-despacho');
const A = chatChannelId('jornada-de-salud');

beforeAll(async () => {
  t = await makeTestDb();
  (globalThis as { __fbBackend?: Promise<unknown> }).__fbBackend = Promise.resolve(t.backend);
  chat = await import('@/lib/actions/chat');
});

beforeEach(() => {
  h.pushes.length = 0;
  h.revalidated.length = 0;
});

function as(key: DemoUserKey, aal: 'aal1' | 'aal2' = 'aal2') {
  const u = DEMO_USERS.find((x) => x.key === key)!;
  h.session = {
    userId: t.ids[key], email: u.email, name: u.name, roles: [...u.roles], aal, mfaRequired: false, mfaOk: true,
    claims: { sub: t.ids[key], aal, role: 'authenticated' }, viewAs: null,
  } satisfies Session;
}
const rows = (id: string) => t.system((sql) => sql.query<{ id: string; body: string; agenda_clear: boolean }>(`select id, body, agenda_clear from public.chat_messages where id = $1`, [id]));
const send = (conversationId: string, body: string, extra: Record<string, unknown> = {}) => chat.sendMessage({ conversationId, clientId: uuid(), body, ...extra });
const ids = (...keys: DemoUserKey[]) => keys.map((k) => t.ids[k]);

describe('las formas de entrada', () => {
  it('sendMessage pide ids de verdad, un texto de 1 a 2000 letras y nada más que eso', async () => {
    as('social');
    expect(await chat.sendMessage({ conversationId: 'x', clientId: uuid(), body: 'Hola' })).toMatchObject({ ok: false });
    expect(await chat.sendMessage({ conversationId: C, clientId: 'y', body: 'Hola' })).toMatchObject({ ok: false });
    expect(await send(C, '   ')).toEqual({ ok: false, error: 'Escribe el mensaje.' });
    expect(await send(C, 'a'.repeat(2001))).toEqual({ ok: false, error: 'El mensaje tiene que tener entre 1 y 2000 letras.' });
  });

  it('createChannel y saveChannel: nombre de 1 a 60, descripción hasta 140, al menos una persona; sin agenda ni teléfono', async () => {
    as('boss');
    expect(await chat.createChannel({ title: '', memberIds: ids('camera') })).toEqual({ ok: false, error: 'El nombre del canal va de 1 a 60 letras.' });
    expect(await chat.createChannel({ title: 'x'.repeat(61), memberIds: ids('camera') })).toEqual({ ok: false, error: 'El nombre del canal va de 1 a 60 letras.' });
    expect(await chat.createChannel({ title: 'Prueba', description: 'y'.repeat(141), memberIds: ids('camera') })).toEqual({ ok: false, error: 'La descripción va hasta 140 letras.' });
    expect(await chat.createChannel({ title: 'Prueba', memberIds: [] })).toEqual({ ok: false, error: 'Elige al menos a una persona.' });
    for (const [title, description] of [['Gira del 12 de noviembre', undefined], ['Gira', 'Salimos mañana temprano'], ['Gira', 'Llama al 0414-555-1234'], ['Plaza maps.google.com', undefined]]) {
      expect(await chat.createChannel({ title, description, memberIds: ids('camera') }), title).toEqual({ ok: false, error: CHAT_TEXT_REFUSED });
    }
    // Only the boss: the database answers the others (and the boss without 2FA) in Spanish.
    expect(await chat.createChannel({ title: 'Solo bosses', memberIds: ids('boss') })).toEqual({ ok: false, error: 'Elige al menos a una persona además de ti.' });
  });
});

describe('el jefe arma los canales (D-80 a D-86)', () => {
  it('crea un canal, queda dentro sin marcarse, y nadie más puede crear (ni el jefe sin doble factor)', async () => {
    as('boss');
    const r = await chat.createChannel({ title: 'Material del parque (prueba)', description: 'Las tomas del parque', memberIds: ids('camera', 'camera2') });
    expect(r).toMatchObject({ ok: true, message: 'Listo: se creó el canal.', data: { id: expect.any(String) } });
    const id = (r as { data: { id: string } }).data.id;
    const members = await t.system((sql) => sql.query<{ user_id: string; via: string }>(`select user_id, via from public.chat_members where conversation_id = $1 and removed_at is null`, [id]));
    expect(new Set(members.map((m) => `${m.user_id}:${m.via}`))).toEqual(new Set([`${t.ids.boss}:boss`, `${t.ids.camera}:picked`, `${t.ids.camera2}:picked`]));
    expect(h.revalidated).toContain('/mensajes');
    for (const who of ['dispatch', 'social', 'admin'] as const) {
      as(who);
      expect(await chat.createChannel({ title: 'Mío (prueba)', memberIds: ids('camera') }), who).toEqual({ ok: false, error: 'Para esto necesitas entrar con el doble factor.' });
    }
    as('boss', 'aal1');
    expect(await chat.createChannel({ title: 'Sin doble factor (prueba)', memberIds: ids('camera') })).toEqual({ ok: false, error: 'Para esto necesitas entrar con el doble factor.' });
  });

  it('saveChannel guarda nombre, descripción y miembros juntos; quien sale ya no lee ni recibe; quien entra lee lo anterior', async () => {
    as('boss');
    const id = ((await chat.createChannel({ title: 'Visitas (prueba)', memberIds: ids('ivt', 'camera') })) as { data: { id: string } }).data.id;
    as('camera');
    expect((await send(id, 'Ya subí las fotos de la visita (prueba)')).ok).toBe(true);
    as('boss');
    expect(await chat.saveChannel({ id, title: 'Visitas de obra (prueba)', description: 'Fotos y notas', memberIds: ids('ivt', 'dispatch') })).toMatchObject({ ok: true, message: 'Listo: se guardó el canal.' });
    expect(await t.system((sql) => sql.query(`select title, description from public.chat_conversations where id = $1`, [id]))).toEqual([{ title: 'Visitas de obra (prueba)', description: 'Fotos y notas' }]);
    // Kevin left: nothing of it, and his send says «gone» (the screen stops); Rubén entered: he reads what came before.
    as('camera');
    expect(await send(id, 'Hola (prueba)')).toEqual({ ok: true, data: { kind: 'gone' } });
    expect((await chat.setMuted({ conversationId: id, muted: true }))).toEqual({ ok: false, error: 'Solo silencias tus canales.' });
    h.pushes.length = 0;
    as('ivt');
    expect((await send(id, 'Rubén, ya está la ficha (prueba)')).ok).toBe(true);
    expect(new Set(h.pushes[0].recipients.map((x) => x.id))).toEqual(new Set(ids('boss', 'dispatch')));
    // Only the boss.
    as('dispatch');
    expect(await chat.saveChannel({ id, title: 'Mío (prueba)', memberIds: ids('dispatch') })).toEqual({ ok: false, error: 'Para esto necesitas entrar con el doble factor.' });
  });

  it('archivar: se lee, no se escribe, no cambian los miembros; sacar del archivo lo devuelve', async () => {
    as('boss');
    const id = ((await chat.createChannel({ title: 'Para archivar (prueba)', memberIds: ids('social') })) as { data: { id: string } }).data.id;
    expect(await chat.archiveChannel({ id, archived: true })).toMatchObject({ ok: true, message: 'Listo: el canal quedó archivado.' });
    as('social');
    expect(await send(id, 'Hola (prueba)')).toEqual({ ok: false, error: 'Ya no puedes escribir en este canal.' });
    as('boss');
    expect(await chat.saveChannel({ id, title: 'Para archivar (prueba)', memberIds: ids('social', 'camera') })).toEqual({ ok: false, error: 'Este canal está archivado: sácalo del archivo para cambiar quién está.' });
    // The name alone can still change.
    expect(await chat.saveChannel({ id, title: 'Archivado (prueba)' })).toMatchObject({ ok: true });
    expect(await chat.archiveChannel({ id, archived: false })).toMatchObject({ ok: true, message: 'Listo: el canal volvió a la lista.' });
    as('social');
    expect((await send(id, 'Ya se puede (prueba)')).ok).toBe(true);
    as('social');
    expect(await chat.archiveChannel({ id, archived: true })).toEqual({ ok: false, error: 'Para esto necesitas entrar con el doble factor.' });
  });

  it('«Solo el jefe escribe» en un canal y en «Todo el equipo»; administración y despacho no lo cambian', async () => {
    as('boss');
    expect(await chat.setOnlyBoss({ conversationId: 'team', value: true })).toMatchObject({ ok: true, message: 'Listo: en Todo el equipo solo escribe el jefe.' });
    as('social');
    expect(await send(CHAT_TEAM_ID, 'Prueba con solo el jefe (inventada)')).toEqual({ ok: false, error: 'Ya no puedes escribir en este canal.' });
    as('boss');
    expect(await chat.setOnlyBoss({ conversationId: 'team', value: false })).toMatchObject({ ok: true, message: 'Listo: en Todo el equipo escriben todos otra vez.' });
    expect(await chat.setOnlyBoss({ conversationId: C, value: true })).toMatchObject({ ok: true, message: 'Listo: en este canal solo escribe el jefe.' });
    expect(await chat.setOnlyBoss({ conversationId: C, value: false })).toMatchObject({ ok: true });
    for (const who of ['dispatch', 'admin'] as const) {
      as(who);
      expect(await chat.setOnlyBoss({ conversationId: 'team', value: true }), who).toMatchObject({ ok: false });
    }
  });
});

describe('enviar', () => {
  it('sin aviso que aceptar: Yorman escribe en su canal la primera vez', async () => {
    as('social2');
    expect(await send(C, 'Mi primer mensaje en el canal (inventado)')).toMatchObject({ ok: true, data: { kind: 'sent' } });
  });

  it('se guarda una sola vez aunque se mande dos veces con el mismo id, y no refresca nada', async () => {
    as('social');
    const clientId = uuid();
    const input = { conversationId: C, clientId, body: 'Prueba de envío repetido (inventada)' };
    const a = await chat.sendMessage(input);
    const b = await chat.sendMessage(input);
    expect(a).toMatchObject({ ok: true, data: { kind: 'sent', id: clientId, fresh: true } });
    expect(b).toMatchObject({ ok: true, data: { kind: 'sent', id: clientId, fresh: false } });
    expect(await rows(clientId)).toHaveLength(1);
    expect(h.pushes).toHaveLength(1);
    expect((a as { message?: string }).message).toBeUndefined();
    expect(h.revalidated).toEqual([]);
    const read = await t.system((sql) => sql.one<{ last_read_at: Date }>(`select last_read_at from public.chat_reads where conversation_id = $1 and user_id = $2`, [C, t.ids.social]));
    expect(new Date(read!.last_read_at).toISOString()).toBe((a as { data: { createdAt: string } }).data.createdAt);
  });

  it('el aviso al teléfono va a los que están en el canal, dice quién, nunca qué ni el nombre del canal', async () => {
    as('dispatch');
    const body = 'Texto secreto del canal para la prueba (inventado)';
    expect((await send(O, body)).ok).toBe(true);
    expect(h.pushes).toHaveLength(1);
    const [{ recipients, n }] = h.pushes;
    expect(new Set(recipients.map((x) => x.id))).toEqual(new Set(ids('boss', 'politics', 'ivt')));
    expect(n).toEqual({ kind: 'chat_message', title: 'Mensaje nuevo', body: 'De Rubén (Despacho)', link: `/mensajes/${O}` });
    const all = JSON.stringify(h.pushes);
    expect(all).not.toContain('secreto');
    expect(all).not.toContain('Obras y comunidad');
    expect(await t.system((sql) => sql.query(`select id from public.notifications where kind = 'chat_message'`))).toEqual([]);
  });

  it('en «Todo el equipo» suena para todo el equipo menos quien escribe, administración y quien lo silenció', async () => {
    as('ivt');
    expect(await chat.setMuted({ conversationId: CHAT_TEAM_ID, muted: true })).toMatchObject({ ok: true, message: 'Listo: este canal ya no suena en tu teléfono.' });
    as('camera2');
    expect((await send(CHAT_TEAM_ID, 'Para todo el equipo: ya está el material del parque (inventado)')).ok).toBe(true);
    expect(new Set(h.pushes[0].recipients.map((x) => x.id))).toEqual(new Set(ids('boss', 'dispatch', 'politics', 'social', 'social2', 'camera')));
    expect(h.pushes[0].n.body).toBe('De Mariela (Grabación)');
    as('ivt');
    expect(await chat.setMuted({ conversationId: CHAT_TEAM_ID, muted: false })).toMatchObject({ ok: true, message: 'Listo: este canal vuelve a sonar.' });
  });

  it('el jefe sale como «Del jefe»', async () => {
    as('boss');
    expect((await send(J, 'Revisemos la ficha del puente (inventado)')).ok).toBe(true);
    expect(h.pushes[0]).toMatchObject({ recipients: [{ id: t.ids.dispatch }], n: { body: 'Del jefe' } });
  });

  it('en un canal archivado no se escribe y nadie recibe nada', async () => {
    as('dispatch');
    expect(await send(A, 'Hola (inventado)')).toEqual({ ok: false, error: 'Ya no puedes escribir en este canal.' });
    expect(h.pushes).toEqual([]);
  });

  it('en un canal donde nunca estuvo: no es «gone» (la pantalla no se cierra) y no dice nada del canal', async () => {
    // R5 review 2, point 1: in the demo the channel may live on another server (D-88); only a person the database says
    // was taken out gets «gone». The text goes back to the box with the demo's neutral line.
    as('social');
    expect(await send(J, 'el jueves a las 10')).toEqual({ ok: false, error: CHAT_NOT_IN_LIST });
    expect(await send(crypto.randomUUID(), 'Hola (prueba)')).toEqual({ ok: false, error: CHAT_NOT_IN_LIST });
  });
});

describe('la agenda y los teléfonos antes de enviar (D-52 con E1, D-53)', () => {
  it('el jefe donde está Redes: una hora concreta no se envía y el error no repite el texto', async () => {
    as('boss');
    const clientId = uuid();
    const r = await chat.sendMessage({ conversationId: C, clientId, body: 'Te espero a las 3 de la tarde en la plaza' });
    expect(r).toMatchObject({ ok: false });
    const error = (r as { error: string }).error;
    expect(error).toMatch(/^Aquí está Redes o política/);
    expect(error).not.toMatch(/plaza|a las 3/);
    expect(await rows(clientId)).toEqual([]);
    expect(h.pushes).toEqual([]);
  });

  it('el jefe donde está Redes: «mañana» pregunta primero y, con «Enviar igual», se guarda', async () => {
    as('boss');
    const clientId = uuid();
    const input = { conversationId: C, clientId, body: 'Mañana te mando la frase grabada' };
    expect(await chat.sendMessage(input)).toEqual({
      ok: true,
      data: { kind: 'confirm', confirm: 'relative', word: 'Mañana', question: '“Mañana”: ¿dice cuándo va el jefe? Si es de la agenda, no va aquí.' },
    });
    expect(await rows(clientId)).toEqual([]);
    expect(await chat.sendMessage({ ...input, relativeOk: true })).toMatchObject({ ok: true, data: { kind: 'sent', id: clientId } });
    expect(await rows(clientId)).toMatchObject([{ agenda_clear: true }]);
  });

  it('Grabación donde está Redes: «2:15» pregunta si es del video; con «Sí, es del video», se guarda', async () => {
    as('camera');
    const clientId = uuid();
    const input = { conversationId: C, clientId, body: 'En el 2:15 está la toma del dron' };
    expect(await chat.sendMessage(input)).toMatchObject({ ok: true, data: { kind: 'confirm', confirm: 'timecode', word: '2:15' } });
    expect(await chat.sendMessage({ ...input, timecodeOk: true })).toMatchObject({ ok: true, data: { kind: 'sent' } });
  });

  it('Redes escribe libre: no conoce la agenda, así que nada se le pregunta', async () => {
    as('social');
    expect(await send(C, '¿Mañana grabamos la frase?')).toMatchObject({ ok: true, data: { kind: 'sent' } });
  });

  it('un teléfono nunca, en ningún canal; dentro de un enlace, lo dice', async () => {
    as('boss');
    expect(await send(J, 'Llámalo al 0414 555 12 34')).toEqual({ ok: false, error: CHAT_PHONE_TEXT });
    expect(await send(J, 'Mira https://wa.me/584145551234')).toEqual({ ok: false, error: CHAT_PHONE_LINK_TEXT });
  });

  it('el jefe al despacho (sin Redes ni política): la hora y «mañana» pasan sin preguntar, guardados de quien entre después', async () => {
    as('boss');
    for (const body of ['Mañana a las 9 en la plaza', 'Mañana lo vemos']) {
      const clientId = uuid();
      expect(await chat.sendMessage({ conversationId: J, clientId, body })).toMatchObject({ ok: true, data: { kind: 'sent' } });
      expect(await rows(clientId), body).toMatchObject([{ agenda_clear: false }]);
    }
  });
});

describe('leer y silenciar', () => {
  it('un miembro marca hasta lo que vio, y nunca hacia atrás; quien no está no marca nada', async () => {
    as('camera');
    const before = await t.system((sql) => sql.one<{ last_read_at: Date | null }>(`select last_read_at from public.chat_reads where conversation_id = $1 and user_id = $2`, [C, t.ids.camera]));
    expect((await chat.markRead({ conversationId: C, upTo: '2001-01-01T00:00:00Z' })).ok).toBe(true);
    const same = await t.system((sql) => sql.one<{ last_read_at: Date }>(`select last_read_at from public.chat_reads where conversation_id = $1 and user_id = $2`, [C, t.ids.camera]));
    expect(new Date(same!.last_read_at).getTime()).toBeGreaterThanOrEqual(before?.last_read_at ? new Date(before.last_read_at).getTime() : 0);
    as('social');
    expect(await chat.markRead({ conversationId: J })).toEqual({ ok: true, data: { marked: false } });
  });
});
