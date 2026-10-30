// The grouped push (push/deliver.ts summaryPayload): a second notice of the same kind within 10 minutes quietly
// replaces the first in the tray. For Mensajes (R3, D-55) it counts the new MESSAGES (there is no row in «Avisos»),
// says «Tienes N mensajes nuevos» and opens Mensajes; never a message's text. Web Push is mocked. All data invented.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { CHAT_TEAM_ID, chatChannelId } from '@/lib/db/seed-parts/chat';
import { makeTestDb, type TestDb } from '../rls/setup';

const sendNotification = vi.fn();
vi.mock('web-push', () => ({ default: { sendNotification: (...a: unknown[]) => sendNotification(...a) } }));

let t: TestDb;
let deliver: typeof import('@/lib/push/deliver');

const KEY = 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM';
const AUTH = 'tBHItJI5svbpez7KI4CCXg';
const EP = 'https://fcm.googleapis.com/fcm/send/camera-phone';

beforeAll(async () => {
  t = await makeTestDb();
  (globalThis as { __fbBackend?: Promise<unknown> }).__fbBackend = Promise.resolve(t.backend);
  deliver = await import('@/lib/push/deliver');
});

describe('summaryPayload', () => {
  const latest = { title: 'Mensaje nuevo', body: 'De Daniela (Redes)', url: '/mensajes/x' };

  it('uno solo: el mismo aviso, sin sonar otra vez', () => {
    expect(deliver.summaryPayload(1, latest, 'chat_message')).toEqual({ ...latest, tag: 'chat_message', kind: 'chat_message', silent: true });
  });

  it('Mensajes: «Tienes N mensajes nuevos», abre Mensajes y dice solo quién escribió el último', () => {
    expect(deliver.summaryPayload(3, latest, 'chat_message')).toEqual({
      title: 'Tienes 3 mensajes nuevos', body: 'El último: De Daniela (Redes)', url: '/mensajes', tag: 'chat_message', kind: 'chat_message', silent: true,
    });
  });

  it('los demás avisos siguen igual: «Tienes N avisos nuevos» y abren Avisos', () => {
    expect(deliver.summaryPayload(2, { title: 'Llegó material', body: 'x', url: '/eventos/y' }, 'material_ready')).toEqual({
      title: 'Tienes 2 avisos nuevos', body: 'El último: Llegó material', url: '/avisos', tag: 'material_ready', kind: 'material_ready', silent: true,
    });
  });
});

describe('Mensajes agrupados en el teléfono', () => {
  it('el segundo mensaje en 10 minutos no suena: cuenta los mensajes nuevos de los demás, sin el texto', async () => {
    sendNotification.mockReset();
    sendNotification.mockResolvedValue({ statusCode: 201 });
    const c = chatChannelId('grabacion-y-redes');
    await t.system(async (sql) => {
      await sql.query(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, $3, $4)`, [t.ids.camera, EP, KEY, AUTH]);
    });
    const message = (body: string) =>
      t.system((sql) => sql.query(`insert into public.chat_messages (conversation_id, author_id, body) values ($1, $2, $3)`, [c, t.ids.social, body]));
    const n = { kind: 'chat_message', title: 'Mensaje nuevo', body: 'De Daniela (Redes)', link: `/mensajes/${c}` };
    const camera = [{ id: t.ids.camera, prefs: { quiet: false } }];

    await message('Primer mensaje secreto de la prueba (inventado)');
    await deliver.pushNotice(camera, n, false);
    await message('Segundo mensaje secreto de la prueba (inventado)');
    await deliver.pushNotice(camera, n, false);

    expect(sendNotification).toHaveBeenCalledTimes(2);
    const [first, second] = sendNotification.mock.calls.map((call) => JSON.parse(call[1] as string));
    expect(first).toMatchObject({ title: 'Mensaje nuevo', body: 'De Daniela (Redes)', url: `/mensajes/${c}`, tag: 'chat_message' });
    expect(first.silent).toBeUndefined();
    expect(second).toEqual({ title: 'Tienes 2 mensajes nuevos', body: 'El último: De Daniela (Redes)', url: '/mensajes', tag: 'chat_message', kind: 'chat_message', silent: true });
    expect(JSON.stringify(sendNotification.mock.calls)).not.toContain('secreto');
  });

  it('un canal del que lo sacaron no entra en la cuenta: «Tienes N mensajes nuevos» es solo de sus canales', async () => {
    sendNotification.mockReset();
    sendNotification.mockResolvedValue({ statusCode: 201 });
    const gone = chatChannelId('grabacion-y-redes');
    // A fresh window for this phone, and the boss takes Kevin (camera) out of «Grabación y Redes» (the system here).
    await t.system(async (sql) => {
      await sql.query(`delete from public.notify_throttle where user_id = $1`, [t.ids.camera]);
      await sql.query(`update public.chat_members set removed_at = now() where conversation_id = $1 and user_id = $2`, [gone, t.ids.camera]);
    });
    const message = (c: string, body: string) =>
      t.system((sql) => sql.query(`insert into public.chat_messages (conversation_id, author_id, body) values ($1, $2, $3)`, [c, t.ids.social, body]));
    const n = { kind: 'chat_message', title: 'Mensaje nuevo', body: 'De Daniela (Redes)', link: `/mensajes/${CHAT_TEAM_ID}` };
    const camera = [{ id: t.ids.camera, prefs: { quiet: false } }];

    await message(gone, 'En el canal de antes (inventado)');
    await message(CHAT_TEAM_ID, 'Para todo el equipo (inventado)');
    await deliver.pushNotice(camera, n, false);
    await message(gone, 'Otra vez en el canal de antes (inventado)');
    await message(CHAT_TEAM_ID, 'Otra vez para todo el equipo (inventado)');
    await deliver.pushNotice(camera, n, false);

    const second = JSON.parse(sendNotification.mock.calls[1][1] as string);
    expect(second.title).toBe('Tienes 2 mensajes nuevos');
  });
});
