import 'server-only';
import { env, isDemo } from '../env';
import { DEMO_VAPID_INPUT, deriveVapidKeys, validVapidKeys, type VapidKeys } from './keys';

export type VapidConfig = VapidKeys & { subject: string };

let cached: VapidConfig | null | undefined;

// The keys in use: VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY when both are set and valid; otherwise
// derived from SESSION_SECRET (or a fixed demo input with the in-memory demo database).
// null = push cannot work here (real data without SESSION_SECRET nor keys) or is turned off.
export function vapidConfig(): VapidConfig | null {
  if (!env.push.enabled) return null;
  if (cached !== undefined) return cached;
  let keys: VapidKeys | null = null;
  if (env.push.publicKey && env.push.privateKey) {
    const given = { publicKey: env.push.publicKey, privateKey: env.push.privateKey };
    if (validVapidKeys(given)) keys = given;
    else console.warn('[push] VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY are not a valid P-256 pair; deriving instead');
  }
  if (!keys) {
    const input = env.sessionSecret || (isDemo() ? DEMO_VAPID_INPUT : '');
    keys = input ? deriveVapidKeys(input) : null;
  }
  cached = keys ? { ...keys, subject: vapidSubject() } : null;
  return cached;
}

// Apple rejects placeholder contacts; fall back to the app's https address.
function vapidSubject(): string {
  const s = env.push.subject;
  if (/^(mailto:|https:\/\/)/.test(s) && !/\.invalid\b/.test(s)) return s;
  return env.appUrl.startsWith('https://') ? env.appUrl : s;
}

// Public key for the browser (rendered by the server into the page; not a NEXT_PUBLIC var).
export function vapidPublicKey(): string | null {
  return vapidConfig()?.publicKey ?? null;
}
