// Browser-side helpers for phone notifications (used by client components only).
import { removePushSubscription } from '../actions/profile';

export function keyBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const b64 = (b64url + '='.repeat((4 - (b64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a) return false;
  const x = new Uint8Array(a);
  return x.length === b.length && x.every((v, i) => v === b[i]);
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

// Call BEFORE signing out: this phone stops getting the person's notices, and the next person
// who signs in here has to turn them on for themselves. Never throws and never takes long, so
// signing out always goes ahead.
export async function releaseThisPhone(timeoutMs = 3000): Promise<void> {
  const work = (async () => {
    const sub = await currentSubscription();
    if (!sub) return;
    await removePushSubscription({ endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  })().catch(() => {});
  await Promise.race([work, new Promise<void>((r) => setTimeout(r, timeoutMs))]);
}
