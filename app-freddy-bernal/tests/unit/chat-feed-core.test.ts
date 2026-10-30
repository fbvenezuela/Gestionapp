// How messages arrive and leave in an open conversation (R3, D-56, src/components/chat/chat-feed-core.ts), with fake
// timers: the loop asks every 5 s only while the screen is in view and there is signal, gives up a request after 8 s,
// never sends two at once; sending is a queue in order that never waits for the loop; and what arrives is merged by
// id (the «Enviando…» bubble is replaced by the real message, nothing twice). All data invented.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CHAT_BADGE_MS, CHAT_FETCH_TIMEOUT_MS, CHAT_POLL_MS, FEED_GONE, createPoller, createSendQueue, cursorOf, getFeed, mergeItems, newFromOthers,
  sinceUrl, withTimeout, type FeedItem, type SendOutcome,
} from '@/components/chat/chat-feed-core';
import type { ChatItem } from '@/components/chat/chat-core';

const C = '0b6f3c2e-9d41-4a7b-8c55-2f1e6a9d3b70';
const msg = (id: string, at: string, authorId = 'otro', extra: Partial<FeedItem> = {}): FeedItem => ({
  id, authorId, author: 'Alguien', role: 'Redes', body: `Mensaje ${id} (inventado)`, createdAt: at, links: [], ...extra,
});

describe('los tiempos del lazo', () => {
  it('cada 5 s la conversación, cada 30 s el sobre, y nunca más de 8 s esperando', () => {
    expect(CHAT_POLL_MS).toBe(5_000);
    expect(CHAT_BADGE_MS).toBe(30_000);
    expect(CHAT_FETCH_TIMEOUT_MS).toBe(8_000);
  });
});

describe('el lazo', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('pregunta cada 5 s mientras la pantalla está a la vista y hay señal; si no, espera', async () => {
    let visible = true;
    let online = true;
    const run = vi.fn(async () => {});
    const p = createPoller({ run, everyMs: CHAT_POLL_MS, timeoutMs: CHAT_FETCH_TIMEOUT_MS, visible: () => visible, online: () => online });
    p.start();
    await vi.advanceTimersByTimeAsync(4_999);
    expect(run).toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(1);
    visible = false;
    await vi.advanceTimersByTimeAsync(15_000);
    expect(run).toHaveBeenCalledTimes(1);
    visible = true;
    online = false;
    await vi.advanceTimersByTimeAsync(15_000);
    expect(run).toHaveBeenCalledTimes(1);
    online = true;
    // Coming back to the screen or to the signal: at once.
    expect(await p.tick()).toBe(true);
    expect(run).toHaveBeenCalledTimes(2);
    p.stop();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('nunca dos pedidos a la vez, y corta el que tarda más de 8 s', async () => {
    const signals: AbortSignal[] = [];
    const run = vi.fn((signal: AbortSignal) => {
      signals.push(signal);
      return new Promise<void>((_, reject) => signal.addEventListener('abort', () => reject(new Error('abort'))));
    });
    const p = createPoller({ run, everyMs: CHAT_POLL_MS, timeoutMs: CHAT_FETCH_TIMEOUT_MS, visible: () => true, online: () => true });
    p.start();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(run).toHaveBeenCalledTimes(1);
    expect(p.busy()).toBe(true);
    // The 10 s turn finds the first still on its way: it waits.
    await vi.advanceTimersByTimeAsync(5_000);
    expect(run).toHaveBeenCalledTimes(1);
    expect(await p.tick()).toBe(false);
    // At 13 s (8 s after it left) it is cut; the 15 s turn asks again.
    await vi.advanceTimersByTimeAsync(3_000);
    expect(signals[0].aborted).toBe(true);
    expect(p.busy()).toBe(false);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(run).toHaveBeenCalledTimes(2);
    p.stop();
  });

  it('un error del servidor o sin señal no para el lazo', async () => {
    const run = vi.fn(async () => {
      throw new Error('sin señal');
    });
    const p = createPoller({ run, everyMs: CHAT_POLL_MS, timeoutMs: CHAT_FETCH_TIMEOUT_MS, visible: () => true, online: () => true });
    p.start();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(run).toHaveBeenCalledTimes(3);
    p.stop();
  });
});

describe('enviar en orden', () => {
  it('uno a la vez, en el orden en que se escribieron', async () => {
    const order: string[] = [];
    const outcomes: string[] = [];
    const gates: Record<string, () => void> = {};
    const q = createSendQueue<{ id: string }>({
      send: (job) => {
        order.push(`sale ${job.id}`);
        return new Promise<SendOutcome>((resolve) => {
          gates[job.id] = () => resolve({ kind: 'sent', result: job.id });
        });
      },
      onOutcome: (job, o) => outcomes.push(`${job.id}:${o.kind}`),
    });
    q.push({ id: 'a' });
    q.push({ id: 'b' });
    await Promise.resolve();
    expect(order).toEqual(['sale a']);
    gates.a();
    await vi.waitFor(() => expect(order).toEqual(['sale a', 'sale b']));
    gates.b();
    await vi.waitFor(() => expect(outcomes).toEqual(['a:sent', 'b:sent']));
    expect(q.pending()).toBe(0);
  });

  it('un envío nunca espera al lazo (aunque el lazo esté colgado sin señal)', async () => {
    const poll = createPoller({ run: () => new Promise<void>(() => {}), everyMs: 10, timeoutMs: 60_000, visible: () => true, online: () => true });
    void poll.tick();
    expect(poll.busy()).toBe(true);
    const done: string[] = [];
    const q = createSendQueue<{ id: string }>({ send: async (job) => ({ kind: 'sent', result: job.id }), onOutcome: (job) => done.push(job.id) });
    q.push({ id: 'a' });
    await vi.waitFor(() => expect(done).toEqual(['a']));
    expect(poll.busy()).toBe(true);
    poll.stop();
  });

  it('sin señal: ese y los que vienen detrás quedan «No se envió» (no se adelanta ninguno), y «Reintentar» los manda en orden', async () => {
    let signal = false;
    const sent: string[] = [];
    const outcomes: string[] = [];
    const q = createSendQueue<{ id: string }>({
      send: async (job) => {
        if (!signal) return { kind: 'failed' };
        sent.push(job.id);
        return { kind: 'sent', result: job.id };
      },
      onOutcome: (job, o) => outcomes.push(`${job.id}:${o.kind}`),
    });
    q.push({ id: 'a' });
    q.push({ id: 'b' });
    q.push({ id: 'c' });
    await vi.waitFor(() => expect(outcomes).toEqual(['a:failed', 'b:failed', 'c:failed']));
    signal = true;
    q.retry([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    await vi.waitFor(() => expect(sent).toEqual(['a', 'b', 'c']));
  });

  it('lo que se escribe después de un «No se envió» no se adelanta: espera a «Reintentar», y sale detrás', async () => {
    let signal = false;
    const sent: string[] = [];
    const outcomes: string[] = [];
    const q = createSendQueue<{ id: string }>({
      send: async (job) => {
        if (!signal) return { kind: 'failed' };
        sent.push(job.id);
        return { kind: 'sent', result: job.id };
      },
      onOutcome: (job, o) => outcomes.push(`${job.id}:${o.kind}`),
    });
    const a = { id: 'a' };
    const b = { id: 'b' };
    q.push(a);
    await vi.waitFor(() => expect(outcomes).toEqual(['a:failed']));
    // The signal comes back and the person writes b before tapping «Reintentar».
    signal = true;
    q.push(b);
    await Promise.resolve();
    expect(sent).toEqual([]);
    expect(outcomes).toEqual(['a:failed', 'b:failed']);
    expect(q.pending()).toBe(2);
    q.retry([a, b]);
    await vi.waitFor(() => expect(sent).toEqual(['a', 'b']));
    expect(q.pending()).toBe(0);
  });

  it('un rechazo de la base sigue con el siguiente; un error al enviar cuenta como sin señal', async () => {
    const outcomes: string[] = [];
    const q = createSendQueue<{ id: string }>({
      send: async (job) => {
        if (job.id === 'x') throw new Error('red');
        return job.id === 'a' ? { kind: 'refused', error: 'Aquí está Redes o política…' } : { kind: 'sent', result: job.id };
      },
      onOutcome: (job, o) => outcomes.push(`${job.id}:${o.kind}`),
    });
    q.push({ id: 'a' });
    q.push({ id: 'b' });
    await vi.waitFor(() => expect(outcomes).toEqual(['a:refused', 'b:sent']));
    q.push({ id: 'x' });
    await vi.waitFor(() => expect(outcomes.at(-1)).toBe('x:failed'));
  });

  it('withTimeout: lo que no contesta a tiempo es «timeout»', async () => {
    vi.useFakeTimers();
    try {
      const slow = withTimeout(new Promise(() => {}), 20_000);
      await vi.advanceTimersByTimeAsync(20_000);
      expect(await slow).toBe('timeout');
      expect(await withTimeout(Promise.resolve('ok'), 20_000)).toBe('ok');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('lo que hay en la pantalla', () => {
  it('sin repetidos: la burbuja «Enviando…» se cambia por el mensaje del servidor, en orden de hora', () => {
    const mine = msg('m1', '2026-10-28T15:00:05.000Z', 'yo', { state: 'sending' });
    const cur = [msg('a', '2026-10-28T15:00:00.000Z'), mine];
    const real: ChatItem = { ...mine, createdAt: '2026-10-28T15:00:04.000Z' };
    delete (real as FeedItem).state;
    const next = mergeItems(cur, [msg('b', '2026-10-28T15:00:06.000Z'), real, msg('a', '2026-10-28T15:00:00.000Z')]);
    expect(next.map((i) => i.id)).toEqual(['a', 'm1', 'b']);
    expect(next.find((i) => i.id === 'm1')!.state).toBeUndefined();
  });

  it('lo mío que va en camino queda al final, en el orden en que lo escribí', () => {
    const cur = [msg('a', '2026-10-28T15:00:00.000Z'), msg('m2', '2026-10-28T15:01:00.000Z', 'yo', { state: 'sending' }), msg('m3', '2026-10-28T15:00:30.000Z', 'yo', { state: 'failed' })];
    expect(mergeItems(cur, [msg('b', '2026-10-28T15:05:00.000Z')]).map((i) => i.id)).toEqual(['a', 'b', 'm2', 'm3']);
  });

  it('el lazo pregunta desde lo último del servidor (no desde lo mío en camino)', () => {
    const cur = [msg('a', '2026-10-28T15:00:00.000Z'), msg('b', '2026-10-28T15:02:00.000Z'), msg('m', '2026-10-28T15:09:00.000Z', 'yo', { state: 'sending' })];
    expect(cursorOf(cur)).toEqual({ at: '2026-10-28T15:02:00.000Z', id: 'b' });
    expect(cursorOf([])).toBeNull();
    expect(sinceUrl(C, cursorOf(cur))).toBe(`/api/mensajes/${C}/nuevos?despues=2026-10-28T15%3A02%3A00.000Z&id=b`);
    expect(sinceUrl(C, null)).toBe(`/api/mensajes/${C}/nuevos`);
  });

  it('lo mío que el envío confirmó no mueve el lazo: lo de otro guardado antes llega igual, y la copia del servidor lo reemplaza', () => {
    // Weak signal: the polls fail, my send gets through at 15:05; Kevin's message of 15:01 was never fetched.
    const cur = [msg('a', '2026-10-28T15:00:00.000Z'), msg('m', '2026-10-28T15:05:00.000Z', 'yo', { local: true })];
    expect(cursorOf(cur)).toEqual({ at: '2026-10-28T15:00:00.000Z', id: 'a' });
    const server = msg('m', '2026-10-28T15:05:00.000Z', 'yo', { links: [{ href: `/eventos/${C}`, kind: 'event', title: 'Visita (inventada)' }] });
    const next = mergeItems(cur, [msg('k', '2026-10-28T15:01:00.000Z', 'kevin'), server]);
    expect(next.map((i) => i.id)).toEqual(['a', 'k', 'm']);
    expect(next.find((i) => i.id === 'm')!.local).toBeUndefined();
    expect(next.find((i) => i.id === 'm')!.links).toHaveLength(1);
    expect(cursorOf(next)).toEqual({ at: '2026-10-28T15:05:00.000Z', id: 'm' });
  });

  it('«Hay mensajes nuevos» solo por lo nuevo de los demás', () => {
    const cur = [msg('a', '2026-10-28T15:00:00.000Z')];
    expect(newFromOthers(cur, [msg('a', '2026-10-28T15:00:00.000Z')], 'yo')).toBe(false);
    expect(newFromOthers(cur, [msg('m', '2026-10-28T15:01:00.000Z', 'yo')], 'yo')).toBe(false);
    expect(newFromOthers(cur, [msg('b', '2026-10-28T15:01:00.000Z')], 'yo')).toBe(true);
  });
});

// R5 (D-85): the boss takes the person out of the channel while it is open. The loop gets a 404 and the screen stops and
// says «Ya no estás en este canal.»; any other failure is only «nothing this time».
describe('cuando ya no está en el canal', () => {
  const res = (status: number, body: unknown = {}) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it('un 404 dice que el canal ya no es suyo; un 401 o un 500 no', async () => {
    const signal = new AbortController().signal;
    expect(await getFeed('/api/mensajes/x/nuevos', signal, res(404))).toBe(FEED_GONE);
    expect(await getFeed('/api/mensajes/x/nuevos', signal, res(401))).toBeNull();
    expect(await getFeed('/api/mensajes/x/nuevos', signal, res(500))).toBeNull();
    expect(await getFeed('/api/mensajes/x/nuevos', signal, res(200, { items: [] }))).toEqual({ items: [] });
  });
});
