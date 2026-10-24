// Live screens: when something changes, the page asks the server for fresh data. Pure logic
// here (tested in tests/unit/ui-live-refresh.test.ts); the browser wiring is in live-refresh.tsx.

// Tables watched through Supabase Realtime (RLS applies: each person only hears about rows they
// can read). NEVER add event_schedule: the boss's agenda does not travel over Realtime.
export const LIVE_TABLES = ['pieces', 'tweets', 'publications', 'notifications'] as const;

export const DEBOUNCE_MS = 5_000; // at most one refresh every 5 s, however many changes arrive
export const POLL_MS = 60_000; // demo (no Realtime): look again every minute
export const RESUME_MS = 1_500; // after leaving a field or coming back to the tab

type Focusable = { tagName?: string; type?: string; isContentEditable?: boolean } | null | undefined;

const NOT_TYPING = new Set(['button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'color', 'file', 'image']);

// True while someone is writing or choosing in a field: refreshing then could undo what they type.
export function isEditing(el: Focusable): boolean {
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = (el.tagName ?? '').toUpperCase();
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') return !NOT_TYPING.has((el.type ?? 'text').toLowerCase());
  return false;
}

export type Timers = {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
};

// Coalesces change signals into one refresh: waits at least `delayMs` after a change and keeps
// `delayMs` between refreshes. When `canRefresh()` says no (typing, tab hidden, a dialog open),
// the refresh stays pending until `resume()` is called.
export function createRefresher(opts: { refresh: () => void; canRefresh: () => boolean; timers: Timers; delayMs?: number; resumeMs?: number }) {
  const { refresh, canRefresh, timers } = opts;
  const delayMs = opts.delayMs ?? DEBOUNCE_MS;
  const resumeMs = opts.resumeMs ?? RESUME_MS;
  let timer: unknown = null;
  let pending = false;
  let last = timers.now();

  const flush = () => {
    timer = null;
    if (!pending || !canRefresh()) return;
    pending = false;
    last = timers.now();
    refresh();
  };
  const schedule = (minWait: number) => {
    if (timer !== null) return;
    timer = timers.setTimeout(flush, Math.max(minWait, last + delayMs - timers.now()));
  };

  return {
    // Something changed (Realtime) — or `minWait` 0 for a poll tick.
    request(minWait = delayMs) {
      pending = true;
      schedule(minWait);
    },
    resume() {
      if (pending) schedule(resumeMs);
    },
    get pending() {
      return pending;
    },
    get lastRefresh() {
      return last;
    },
    dispose() {
      if (timer !== null) timers.clearTimeout(timer);
      timer = null;
      pending = false;
    },
  };
}
