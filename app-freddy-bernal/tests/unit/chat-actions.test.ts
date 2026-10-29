// The server actions of Mensajes (R3, design §4.3 and §4.5) against a real in-memory database with the same migrations
// and the demo seed. The session is mocked, and so is the push sender (pushNotice): what reaches it must never carry a
// message's text or a group's name. Also: the input shapes, the questions before sending (a time code of Grabación, a
// relative word: E1), the refusals that keep the text out of the error, a send repeated with the same id, and that
// sending refreshes nothing (no revalidatePath). All data here is invented.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import type { Session } from '@/lib/auth/session';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import { CHAT_TEAM_ID, chatDirectId, chatGroupId } from '@/lib/db/seed-parts/chat';
import { CHAT_PHONE_LINK_TEXT, CHAT_PHONE_TEXT } from '@/lib/domain/chat';
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

beforeAll(async () => {
  t = await makeTestDb();
  (globalThis as { __fbBackend?: Promise<unknown> }).__fbBackend = Promise.resolve(t.backend);
  chat = await import('@/lib/actions/chat');
});

beforeEach(() => {
  h.pushes.length = 0;
  h.revalidated.length = 0;
});

function as(key: DemoUserKey) {
  const u = DEMO_USERS.find((x) => x.key === key)!;
  h.session = {
    userId: t.ids[key], email: u.email, name: u.name, roles: [...u.roles], aal: 'aal2', mfaRequired: false, mfaOk: true,
    claims: { sub: t.ids[key], aal: 'aal2', role: 'authenticated' }, viewAs: null,
  } satisfies Session;
}
async function accept(key: DemoUserKey) {
  as(key);
  expect((await chat.acceptNotice()).ok).toBe(true);
}
const direct = (a: DemoUserKey, b: DemoUserKey) => chatDirectId(t.ids[a], t.ids[b]);
const rows = (id: string) => t.system((sql) => sql.query<{ id: string; body: string; agenda_clear: boolean }>(`select id, body, agenda_clear from public.chat_messages where id = $1`, [id]));
const send = (conversationId: string, body: string, extra: Record<string, unknown> = {}) => chat.sendMessage({ conversationId, clientId: uuid(), body, ...extra });

describe('las formas de entrada', () => {
  it('sendMessage pide ids de verdad, un texto de 1 a 2000 letras y nada más que eso', async () => {
    await accept('social');
    expect(await chat.sendMessage({ conversationId: 'x', clientId: uuid(), body: 'Hola' })).toMatchObject({ ok: false });
    expect(await chat.sendMessage({ conversationId: direct('social', 'camera'), clientId: 'y', body: 'Hola' })).toMatchObject({ ok: false });
    expect(await send(direct('social', 'camera'), '   ')).toEqual({ ok: false, error: 'Escribe el mensaje.' });
    expect(await send(direct('social', 'camera'), 'a'.repeat(2001))).toEqual({ ok: false, error: 'El mensaje tiene que tener entre 1 y 2000 letras.' });
  });

  it('startConversation: una persona o un grupo de 3 a 12, con nombre', async () => {
    as('social');
    expect(await chat.startConversation({ kind: 'direct', memberIds: [] })).toEqual({ ok: false, error: 'Elige a alguien.' });
    expect(await chat.startConversation({ kind: 'group', memberIds: [t.ids.camera] })).toMatchObject({ ok: false, error: expect.stringContaining('Un grupo es de 3 a 12') });
    expect(await chat.startConversation({ kind: 'group', memberIds: [t.ids.camera, t.ids.camera2] })).toEqual({ ok: false, error: 'Ponle un nombre al grupo.' });
  });

  it('setRoleRule solo acepta una de las 10 parejas, en el orden de la base', async () => {
    as('boss');
    // The pair is (social, camera) in the enum's order: the other way round is not one of the 10.
    expect(await chat.setRoleRule({ roleA: 'camera', roleB: 'social', allowed: false })).toEqual({ ok: false, error: 'Esa pareja no existe.' });
    expect(await chat.setRoleRule({ roleA: 'boss', roleB: 'social', allowed: false })).toEqual({ ok: false, error: 'Esa pareja no existe.' });
  });
});

describe('enviar', () => {
  it('sin aceptar el aviso no se escribe (la base lo dice en español, sin el texto)', async () => {
    as('social2');
    const r = await send(direct('boss', 'social2'), 'Un mensaje de prueba sin aviso aceptado (inventado)');
    expect(r).toEqual({ ok: false, error: 'Ya no puedes escribir en esta conversación.' });
  });

  it('se guarda una sola vez aunque se mande dos veces con el mismo id, y no refresca nada', async () => {
    await accept('social');
    h.revalidated.length = 0;
    const clientId = uuid();
    const input = { conversationId: direct('social', 'camera'), clientId, body: 'Prueba de envío repetido (inventada)' };
    const a = await chat.sendMessage(input);
    const b = await chat.sendMessage(input);
    expect(a).toMatchObject({ ok: true, data: { kind: 'sent', id: clientId, fresh: true } });
    expect(b).toMatchObject({ ok: true, data: { kind: 'sent', id: clientId, fresh: false } });
    expect((a as { data: { createdAt: string } }).data.createdAt).toBe((b as { data: { createdAt: string } }).data.createdAt);
    expect(await rows(clientId)).toHaveLength(1);
    // Only the first rang the other phone.
    expect(h.pushes).toHaveLength(1);
    // No toast, no page refresh.
    expect((a as { message?: string }).message).toBeUndefined();
    expect(h.revalidated).toEqual([]);
    // Writing marks what came before as read.
    const read = await t.system((sql) => sql.one<{ last_read_at: Date }>(`select last_read_at from public.chat_reads where conversation_id = $1 and user_id = $2`, [input.conversationId, t.ids.social]));
    expect(new Date(read!.last_read_at).toISOString()).toBe((a as { data: { createdAt: string } }).data.createdAt);
  });

  it('el aviso al teléfono dice quién, nunca qué ni el nombre del grupo, y no llega a quien escribió', async () => {
    await accept('dispatch');
    const body = 'Texto secreto del grupo para la prueba (inventado)';
    const r = await send(chatGroupId('obras-y-comunidad'), body);
    expect(r.ok).toBe(true);
    expect(h.pushes).toHaveLength(1);
    const [{ recipients, n }] = h.pushes;
    expect(new Set(recipients.map((x) => x.id))).toEqual(new Set([t.ids.politics, t.ids.ivt]));
    expect(n).toEqual({ kind: 'chat_message', title: 'Mensaje nuevo', body: 'De Rubén (Despacho)', link: `/mensajes/${chatGroupId('obras-y-comunidad')}` });
    const all = JSON.stringify(h.pushes);
    expect(all).not.toContain('secreto');
    expect(all).not.toContain('Obras y comunidad');
    // No row in «Avisos».
    expect(await t.system((sql) => sql.query(`select id from public.notifications where kind = 'chat_message'`))).toEqual([]);
  });

  it('en «Todo el equipo» suena para todo el equipo menos quien escribe, administración y quien lo silenció', async () => {
    await accept('camera2');
    await accept('ivt');
    as('ivt');
    expect((await chat.setMuted({ conversationId: CHAT_TEAM_ID, muted: true })).ok).toBe(true);
    as('camera2');
    expect((await send(CHAT_TEAM_ID, 'Para todo el equipo: ya está el material del parque (inventado)')).ok).toBe(true);
    const ids = new Set(h.pushes[0].recipients.map((x) => x.id));
    expect(ids).toEqual(new Set((['boss', 'dispatch', 'politics', 'social', 'social2', 'camera'] as const).map((k) => t.ids[k])));
    expect(h.pushes[0].n.body).toBe('De Mariela (Grabación)');
    as('ivt');
    await chat.setMuted({ conversationId: CHAT_TEAM_ID, muted: false });
  });

  it('el jefe sale como «Del jefe»', async () => {
    await accept('boss');
    expect((await send(direct('boss', 'dispatch'), 'Revisemos la ficha del puente (inventado)')).ok).toBe(true);
    expect(h.pushes[0]).toMatchObject({ recipients: [{ id: t.ids.dispatch }], n: { body: 'Del jefe' } });
  });
});

describe('la agenda y los teléfonos antes de enviar (D-52 con E1, D-53)', () => {
  it('el jefe a Redes: una hora concreta no se envía y el error no repite el texto', async () => {
    await accept('boss');
    const clientId = uuid();
    const r = await chat.sendMessage({ conversationId: direct('boss', 'social2'), clientId, body: 'Te espero a las 3 de la tarde en la plaza' });
    expect(r).toMatchObject({ ok: false });
    const error = (r as { error: string }).error;
    expect(error).toMatch(/^Aquí está Redes o política/);
    expect(error).not.toMatch(/plaza|a las 3/);
    expect(await rows(clientId)).toEqual([]);
    expect(h.pushes).toEqual([]);
  });

  it('el jefe a Redes: «mañana» pregunta primero y, con «Enviar igual», se guarda (la base deja pasar lo relativo)', async () => {
    await accept('boss');
    const clientId = uuid();
    const input = { conversationId: direct('boss', 'social2'), clientId, body: 'Mañana te mando la frase grabada' };
    expect(await chat.sendMessage(input)).toEqual({
      ok: true,
      data: { kind: 'confirm', confirm: 'relative', word: 'Mañana', question: '“Mañana”: ¿dice cuándo va el jefe? Si es de la agenda, no va aquí.' },
    });
    expect(await rows(clientId)).toEqual([]);
    expect(await chat.sendMessage({ ...input, relativeOk: true })).toMatchObject({ ok: true, data: { kind: 'sent', id: clientId } });
    expect(await rows(clientId)).toMatchObject([{ agenda_clear: true }]);
  });

  it('Grabación a Redes: «2:15» pregunta si es del video; con «Sí, es del video», se guarda', async () => {
    await accept('camera');
    const clientId = uuid();
    const input = { conversationId: direct('social', 'camera'), clientId, body: 'En el 2:15 está la toma del dron' };
    expect(await chat.sendMessage(input)).toMatchObject({ ok: true, data: { kind: 'confirm', confirm: 'timecode', word: '2:15', question: '¿2:15 es un tiempo del video? Si es una hora, no va aquí.' } });
    expect(await chat.sendMessage({ ...input, timecodeOk: true })).toMatchObject({ ok: true, data: { kind: 'sent' } });
    expect(await rows(clientId)).toHaveLength(1);
  });

  it('Redes escribe libre: no conoce la agenda, así que nada se le pregunta', async () => {
    await accept('social');
    expect(await send(direct('boss', 'social'), '¿Mañana grabamos la frase?')).toMatchObject({ ok: true, data: { kind: 'sent' } });
  });

  it('un teléfono nunca, en ninguna conversación; dentro de un enlace, lo dice', async () => {
    await accept('boss');
    expect(await send(direct('boss', 'dispatch'), 'Llámalo al 0414 555 12 34')).toEqual({ ok: false, error: CHAT_PHONE_TEXT });
    expect(await send(direct('boss', 'dispatch'), 'Mira https://wa.me/584145551234')).toEqual({ ok: false, error: CHAT_PHONE_LINK_TEXT });
  });

  it('el jefe al despacho (sin Redes ni política): la hora pasa y el mensaje queda sin «agenda limpia»', async () => {
    await accept('boss');
    const clientId = uuid();
    expect(await chat.sendMessage({ conversationId: direct('boss', 'dispatch'), clientId, body: 'Mañana a las 9 en la plaza' })).toMatchObject({ ok: true, data: { kind: 'sent' } });
    expect(await rows(clientId)).toMatchObject([{ agenda_clear: false }]);
  });
});

describe('leer, silenciar, armar conversaciones', () => {
  it('el jefe que lee una conversación ajena no la marca como leída', async () => {
    as('boss');
    expect(await chat.markRead({ conversationId: direct('social', 'camera') })).toEqual({ ok: true, data: { marked: false } });
    expect(await t.system((sql) => sql.query(`select 1 from public.chat_reads where conversation_id = $1 and user_id = $2`, [direct('social', 'camera'), t.ids.boss]))).toEqual([]);
  });

  it('un miembro marca hasta lo que vio, y nunca hacia atrás', async () => {
    as('camera');
    const c = direct('social', 'camera');
    const before = await t.system((sql) => sql.one<{ last_read_at: Date | null }>(`select last_read_at from public.chat_reads where conversation_id = $1 and user_id = $2`, [c, t.ids.camera]));
    expect((await chat.markRead({ conversationId: c, upTo: '2001-01-01T00:00:00Z' })).ok).toBe(true);
    const same = await t.system((sql) => sql.one<{ last_read_at: Date }>(`select last_read_at from public.chat_reads where conversation_id = $1 and user_id = $2`, [c, t.ids.camera]));
    expect(new Date(same!.last_read_at).getTime()).toBeGreaterThanOrEqual(before?.last_read_at ? new Date(before.last_read_at).getTime() : 0);
    expect((await chat.markRead({ conversationId: c })).ok).toBe(true);
  });

  it('«Escribirle a alguien» abre la directa que ya existe (el mismo id en cada servidor de la demo)', async () => {
    as('social2');
    expect(await chat.startConversation({ kind: 'direct', memberIds: [t.ids.camera] })).toEqual({ ok: true, data: { id: direct('social2', 'camera') } });
  });

  it('el nombre de un grupo no lleva fecha ni teléfono, esté o no Redes (alguien puede pasar a Redes después)', async () => {
    as('dispatch');
    const r = await chat.startConversation({ kind: 'group', memberIds: [t.ids.social, t.ids.camera], title: 'Grupo del 12 de noviembre' });
    expect(r).toEqual({ ok: false, error: 'El nombre del grupo no lleva teléfonos, fechas, horas ni mapas: todos los del grupo lo leen siempre.' });
    const noRedes = await chat.startConversation({ kind: 'group', memberIds: [t.ids.ivt, t.ids.camera], title: 'Petare 12/11 9am' });
    expect(noRedes).toEqual({ ok: false, error: 'El nombre del grupo no lleva teléfonos, fechas, horas ni mapas: todos los del grupo lo leen siempre.' });
    const ok = await chat.startConversation({ kind: 'group', memberIds: [t.ids.social, t.ids.camera], title: 'Material del parque (prueba)' });
    expect(ok).toMatchObject({ ok: true, data: { id: expect.any(String) } });
  });

  it('solo el jefe cambia «Quién habla con quién» y «Solo el jefe escribe»; administración tampoco', async () => {
    as('dispatch');
    expect(await chat.setRoleRule({ roleA: 'politics', roleB: 'social', allowed: false })).toMatchObject({ ok: false });
    as('admin');
    expect(await chat.setRoleRule({ roleA: 'politics', roleB: 'social', allowed: false })).toMatchObject({ ok: false });
    as('boss');
    expect(await chat.setRoleRule({ roleA: 'politics', roleB: 'social', allowed: false })).toEqual({
      ok: true, data: { message: expect.any(String) }, message: 'Listo: Política y Redes ya no pueden escribirse. En Todo el equipo siguen escribiendo todos.',
    });
    expect(await chat.setRoleRule({ roleA: 'politics', roleB: 'social', allowed: true })).toMatchObject({ ok: true, message: 'Listo: Política y Redes ya pueden escribirse.' });
    expect(await chat.setOnlyBoss({ conversationId: 'team', value: true })).toMatchObject({ ok: true, message: 'Listo: en Todo el equipo solo escribe el jefe.' });
    await accept('social');
    expect(await send(CHAT_TEAM_ID, 'Prueba con solo el jefe (inventada)')).toEqual({ ok: false, error: 'Ya no puedes escribir en esta conversación.' });
    as('boss');
    expect(await chat.setOnlyBoss({ conversationId: 'team', value: false })).toMatchObject({ ok: true, message: 'Listo: en Todo el equipo escriben todos otra vez.' });
    as('dispatch');
    expect(await chat.setOnlyBoss({ conversationId: 'team', value: true })).toMatchObject({ ok: false });
  });
});
