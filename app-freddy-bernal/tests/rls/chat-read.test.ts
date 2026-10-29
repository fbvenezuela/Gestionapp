// Reading clears what is new, on a real Postgres too (TEST_DATABASE_URL): Postgres keeps created_at in microseconds,
// the screen sends back the newest time it has in milliseconds (toISOString), and markRead() must still count the
// message read. The in-memory database keeps milliseconds, so this only bites there. Through the action path, as the
// screen does it: sendMessage() as Redes, then Grabación opens the conversation (conversation() + cursorOf()) and
// markRead() with that time. The session and the push sender are mocked. All data here is invented.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import type { Session } from '@/lib/auth/session';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import { chatDirectId } from '@/lib/db/seed-parts/chat';
import { conversation, myConversations, unreadConversations } from '@/lib/data/chat';
import { cursorOf } from '@/components/chat/chat-feed-core';
import { makeTestDb, type TestDb } from './setup';

const h = vi.hoisted(() => ({ session: null as unknown }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ requireSession: vi.fn(async () => h.session) }));
vi.mock('@/lib/push/deliver', async (orig) => ({
  ...(await orig<typeof import('@/lib/push/deliver')>()),
  pushNotice: vi.fn(async () => {}),
}));

let t: TestDb;
let chat: typeof import('@/lib/actions/chat');

const sessionOf = (key: DemoUserKey): Session => {
  const u = DEMO_USERS.find((x) => x.key === key)!;
  return {
    userId: t.ids[key], email: u.email, name: u.name, roles: [...u.roles], aal: 'aal2', mfaRequired: false, mfaOk: true,
    claims: { sub: t.ids[key], aal: 'aal2', role: 'authenticated' }, viewAs: null,
  } satisfies Session;
};
const as = (key: DemoUserKey) => {
  h.session = sessionOf(key);
};
const unread = (key: DemoUserKey) => t.as(key, (sql) => unreadConversations(sql));
const rowOf = async (key: DemoUserKey, id: string) => (await t.as(key, (sql) => myConversations(sql, sessionOf(key)))).find((c) => c.id === id);

beforeAll(async () => {
  t = await makeTestDb();
  (globalThis as { __fbBackend?: Promise<unknown> }).__fbBackend = Promise.resolve(t.backend);
  chat = await import('@/lib/actions/chat');
  for (const key of ['social', 'camera'] as const) {
    as(key);
    expect((await chat.acceptNotice()).ok).toBe(true);
  }
}, 120_000);

describe('leer deja de contar como nuevo (con la hora en microsegundos de Postgres)', () => {
  it('Redes escribe, Grabación abre la conversación: el sobre y la fila vuelven a cero', async () => {
    const id = chatDirectId(t.ids.social, t.ids.camera);
    // What the seed left unread for Grabación here is read first, so the count below is only the new message.
    as('camera');
    expect((await chat.markRead({ conversationId: id })).ok).toBe(true);
    const before = await unread('camera');

    as('social');
    const sent = await chat.sendMessage({ conversationId: id, clientId: crypto.randomUUID(), body: '¿Viste la toma del parque? (prueba)' });
    expect(sent).toMatchObject({ ok: true, data: { kind: 'sent' } });
    expect(await unread('camera')).toBe(before + 1);
    expect((await rowOf('camera', id))?.unread).toBe(1);

    // Grabación opens it: the screen marks read up to its newest message, in milliseconds.
    as('camera');
    const c = await t.as('camera', (sql) => conversation(sql, sessionOf('camera'), id));
    const upTo = cursorOf(c!.items)!.at;
    expect(upTo).toMatch(/\.\d{3}Z$/);
    expect((await chat.markRead({ conversationId: id, upTo })).ok).toBe(true);
    expect(await unread('camera')).toBe(before);
    expect((await rowOf('camera', id))?.unread).toBe(0);
    // And it never goes past what was on the screen: a later message is still new.
    as('social');
    await chat.sendMessage({ conversationId: id, clientId: crypto.randomUUID(), body: 'Te mando la otra más tarde. (prueba)' });
    as('camera');
    expect((await chat.markRead({ conversationId: id, upTo })).ok).toBe(true);
    expect((await rowOf('camera', id))?.unread).toBe(1);
  });

  it('quien escribe deja leído lo anterior, y su propio mensaje no le cuenta', async () => {
    const id = chatDirectId(t.ids.social, t.ids.camera);
    as('camera');
    const sent = await chat.sendMessage({ conversationId: id, clientId: crypto.randomUUID(), body: 'Listo, la reviso. (prueba)' });
    expect(sent).toMatchObject({ ok: true, data: { kind: 'sent' } });
    expect((await rowOf('camera', id))?.unread).toBe(0);
  });
});
