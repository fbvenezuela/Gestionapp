// How messages arrive and leave in an open conversation (R3, D-56, U9), with no React and no network of its own, so
// the tests drive it with fake timers:
//   * the loop asks the GET route for what is new every CHAT_POLL_MS while the screen is in view and there is signal,
//     with a CHAT_FETCH_TIMEOUT_MS limit, never two requests at once;
//   * sending is a queue in order, apart from the loop: a send never waits for a poll and a poll never waits for a
//     send (Next sends server actions one at a time; the loop uses fetch, not an action);
//   * what arrives is merged by id: the bubble that said «Enviando…» is replaced by the real message, never doubled.
// No Realtime in v1 (D-56): LIVE_TABLES does not change.
import type { ChatItem } from './chat-core';

export const CHAT_POLL_MS = 5_000;
export const CHAT_BADGE_MS = 30_000;
export const CHAT_FETCH_TIMEOUT_MS = 8_000;
// A send that has not answered by then says «No se envió · Reintentar» (the same id is sent again: never twice).
export const CHAT_SEND_TIMEOUT_MS = 20_000;

// ---------------------------------------------------------------------------------------------------------------
// The list on screen
// ---------------------------------------------------------------------------------------------------------------
// A message on screen: one of the server's, or one of mine on its way (sending) or stopped by the signal (failed).
// `local`: mine, saved (the send said so) but not yet given by the loop: it is shown in its place, but the loop does
// not ask from it (a message of someone else saved before it could be skipped), and its server copy (with its link
// cards) replaces it when the loop brings it.
export type FeedItem = ChatItem & { state?: 'sending' | 'failed'; local?: true };

const byTime = (a: FeedItem, b: FeedItem) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * `current` with `incoming` (the server's) merged in by id: a server copy replaces a bubble of mine with the same id
 * (its clientId), nothing appears twice, the server's are in time order and mine on their way stay at the end, in the
 * order they were written.
 */
export function mergeItems(current: readonly FeedItem[], incoming: readonly ChatItem[]): FeedItem[] {
  const map = new Map<string, FeedItem>();
  for (const it of current) map.set(it.id, it);
  for (const it of incoming) map.set(it.id, { ...it });
  const all = [...map.values()];
  const confirmed = all.filter((it) => !it.state).sort(byTime);
  const pending = current.filter((it) => it.state && !incoming.some((x) => x.id === it.id)).map((it) => map.get(it.id)!);
  return [...confirmed, ...pending];
}

/** Where the loop asks from: the newest message the loop or the page already gave (mine on their way, and mine the send
 * confirmed, do not count). */
export function cursorOf(items: readonly FeedItem[]): { at: string; id: string } | null {
  const confirmed = items.filter((it) => !it.state && !it.local);
  if (!confirmed.length) return null;
  const last = [...confirmed].sort(byTime).at(-1)!;
  return { at: last.createdAt, id: last.id };
}

/** The URL of the loop for a conversation, from a cursor. */
export function sinceUrl(conversationId: string, cursor: { at: string; id: string } | null): string {
  const base = `/api/mensajes/${conversationId}/nuevos`;
  return cursor ? `${base}?despues=${encodeURIComponent(cursor.at)}&id=${cursor.id}` : base;
}

/** Whether something in `incoming` is new and written by someone else (to say «Hay mensajes nuevos» and mark read). */
export function newFromOthers(current: readonly FeedItem[], incoming: readonly ChatItem[], me: string): boolean {
  const seen = new Set(current.map((it) => it.id));
  return incoming.some((it) => !seen.has(it.id) && it.authorId !== me);
}

// ---------------------------------------------------------------------------------------------------------------
// The loop
// ---------------------------------------------------------------------------------------------------------------
export type Timers = {
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (h: unknown) => void;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (h: unknown) => void;
};
const realTimers: Timers = {
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export type Poller = {
  start: () => void;
  stop: () => void;
  /** Asks now (on coming back to the screen or to the signal), unless a request is already on its way. */
  tick: () => Promise<boolean>;
  /** Whether a request is on its way. */
  busy: () => boolean;
};

/**
 * Asks with `run` every `everyMs` while `visible()` and `online()`, aborting a request after `timeoutMs`, never two at
 * once (a slow answer makes the next turns wait, it never piles them up). `run` errors are swallowed: the next turn
 * tries again.
 */
export function createPoller(o: {
  run: (signal: AbortSignal) => Promise<void>;
  everyMs: number;
  timeoutMs: number;
  visible: () => boolean;
  online: () => boolean;
  timers?: Timers;
}): Poller {
  const t = o.timers ?? realTimers;
  let inFlight = false;
  let handle: unknown = null;
  let stopped = false;
  const tick = async () => {
    if (stopped || inFlight || !o.visible() || !o.online()) return false;
    inFlight = true;
    const ac = new AbortController();
    const limit = t.setTimeout(() => ac.abort(), o.timeoutMs);
    try {
      await o.run(ac.signal);
    } catch {
      /* no signal, a timeout, a server error: the next turn tries again */
    } finally {
      t.clearTimeout(limit);
      inFlight = false;
    }
    return true;
  };
  return {
    start() {
      stopped = false;
      if (handle === null) handle = t.setInterval(() => void tick(), o.everyMs);
    },
    stop() {
      stopped = true;
      if (handle !== null) t.clearInterval(handle);
      handle = null;
    },
    tick,
    busy: () => inFlight,
  };
}

/** fetch() of a JSON GET route as the person (cookies), never stored by the browser or the service worker. */
export async function getJson<T>(url: string, signal: AbortSignal, f: typeof fetch = fetch): Promise<T | null> {
  const res = await f(url, { signal, cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json' } });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

// What the loop gets when the channel is no longer the person's (404: the boss took them out meanwhile).
export const FEED_GONE = 'gone' as const;

/** Like getJson(), but a 404 says the channel is not the person's any more (the screen stops and says so); any other
 * failure is only «nothing this time». */
export async function getFeed<T>(url: string, signal: AbortSignal, f: typeof fetch = fetch): Promise<T | typeof FEED_GONE | null> {
  const res = await f(url, { signal, cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json' } });
  if (res.status === 404) return FEED_GONE;
  if (!res.ok) return null;
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------------------------------------------
// Sending, in order
// ---------------------------------------------------------------------------------------------------------------
// What became of one send: saved; refused by the rules (the text goes back to the box); or stopped by the signal or
// the time limit (the bubble offers «Reintentar» with the same id).
export type SendOutcome<R = unknown> = { kind: 'sent'; result: R } | { kind: 'refused'; error: string } | { kind: 'failed' };

export type SendQueue<J> = {
  push: (job: J) => void;
  /** Sends again, first and in order, the jobs held after a failure (`jobs` only when none is held). */
  retry: (jobs: J[]) => void;
  pending: () => number;
};

/**
 * One send at a time, in the order they were written. A send stopped by the signal stops the line: it and every one
 * after it are «failed» and held (sending the next one first would change the order); one written while some are held
 * is held too («failed» at once), and «Reintentar» puts the held ones back at the front of the line, in order.
 */
export function createSendQueue<J, R = unknown>(o: {
  send: (job: J) => Promise<SendOutcome<R>>;
  onOutcome: (job: J, outcome: SendOutcome<R>) => void;
}): SendQueue<J> {
  const line: J[] = [];
  const held: J[] = [];
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      while (line.length) {
        const job = line[0];
        let outcome: SendOutcome<R>;
        try {
          outcome = await o.send(job);
        } catch {
          outcome = { kind: 'failed' };
        }
        if (outcome.kind === 'failed') {
          const stopped = line.splice(0, line.length);
          held.push(...stopped);
          for (const j of stopped) o.onOutcome(j, { kind: 'failed' });
          break;
        }
        line.splice(line.indexOf(job), 1);
        o.onOutcome(job, outcome);
      }
    } finally {
      running = false;
    }
  };
  return {
    push(job) {
      if (held.length) {
        held.push(job);
        o.onOutcome(job, { kind: 'failed' });
        return;
      }
      line.push(job);
      void run();
    },
    retry(jobs) {
      // While some are held nothing else is in the line (push holds too), so they go first.
      if (held.length) line.unshift(...held.splice(0, held.length));
      else line.push(...jobs.filter((j) => !line.includes(j)));
      void run();
    },
    pending: () => line.length + held.length,
  };
}

/** `p`, or 'timeout' after `ms`. */
export function withTimeout<T>(p: Promise<T>, ms: number, timers: Pick<Timers, 'setTimeout' | 'clearTimeout'> = realTimers): Promise<T | 'timeout'> {
  let h: unknown;
  const limit = new Promise<'timeout'>((resolve) => {
    h = timers.setTimeout(() => resolve('timeout'), ms);
  });
  return Promise.race([p, limit]).finally(() => timers.clearTimeout(h));
}
