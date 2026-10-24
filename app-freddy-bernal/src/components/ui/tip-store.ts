import { readKey, writeKey, type KV } from './device-store';

// Contextual tips: a tip shows the first times someone opens a screen, until they tap
// «Entendido» or have seen it TIP_MAX_VIEWS times (a view counts when they stay a few seconds).
// Stored per phone as null (never seen), "1".."n" (views) or "done".

export const TIP_MAX_VIEWS = 3;
export const TIP_MIN_VIEW_MS = 3000;
const DONE = 'done';

export const tipKey = (id: string) => `fb:tip:${id}`;

export function isTipVisible(raw: string | null): boolean {
  if (raw === null) return true;
  if (raw === DONE) return false;
  const n = Number.parseInt(raw, 10);
  return !Number.isFinite(n) || n < TIP_MAX_VIEWS;
}

export function afterView(raw: string | null): string {
  if (raw === DONE) return DONE;
  const n = (Number.parseInt(raw ?? '0', 10) || 0) + 1;
  return n >= TIP_MAX_VIEWS ? DONE : String(n);
}

export function readTip(store: KV, id: string) {
  return readKey(store, tipKey(id));
}

export function dismissTip(store: KV, id: string) {
  writeKey(store, tipKey(id), DONE);
}

export function countTipView(store: KV, id: string, shownForMs: number) {
  if (shownForMs < TIP_MIN_VIEW_MS) return;
  writeKey(store, tipKey(id), afterView(readTip(store, id)));
}
