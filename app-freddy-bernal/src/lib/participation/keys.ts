import 'server-only';
import { createHmac, randomBytes } from 'node:crypto';
import { env } from '../env';
import { normalizeSecret } from './receipt-code';

// The keys the citizen functions take (20261106000300_citizen.sql, D-96), all made here, on the server, with the pepper
// PARTICIPATION_PEPPER (HMAC-SHA256, hex, 64): the receipt's secret digest (the secret itself never reaches the
// database) and the rate limit's device and network keys (never the IP or the cookie itself). Each kind of key has its
// own prefix, so one can never stand for another. Demo mode uses a fixed demo pepper (every demo server computes the
// same digests: the demo's receipts in docs/DEMO.md); with DATABASE_URL a missing or short pepper stops the citizen's
// send and lookup with ParticipationConfigError (never a receipt keyed with a known value).

export class ParticipationConfigError extends Error {}

const DEMO_PEPPER = 'fb-demo-pimienta-de-la-participacion-no-es-secreta';

export type PepperConfig = { mode: 'demo' | 'supabase'; pepper: string };
const pepperFromEnv = (): PepperConfig => ({ mode: env.dataMode, pepper: env.participation.pepper });

export function participationPepper(cfg: PepperConfig = pepperFromEnv()): string {
  if (cfg.pepper) {
    if (cfg.pepper.length < 32) throw new ParticipationConfigError('PARTICIPATION_PEPPER es muy corta: usa al menos 32 caracteres al azar.');
    return cfg.pepper;
  }
  if (cfg.mode === 'demo') return DEMO_PEPPER;
  throw new ParticipationConfigError('Falta PARTICIPATION_PEPPER: sin ella no se guarda ni se consulta ningún comprobante.');
}

const hmac = (kind: string, value: string, cfg?: PepperConfig) =>
  createHmac('sha256', participationPepper(cfg)).update(`${kind}:${value}`).digest('hex');

/** What the database stores and compares for a receipt's secret: the HMAC of its canonical form. */
export function secretDigest(secret: string, cfg?: PepperConfig): string {
  const s = normalizeSecret(secret);
  if (!s) throw new Error('secretDigest: not a receipt secret');
  return hmac('secret', s, cfg);
}

// --- The first-party device cookie (the rate limit per device; never used for anything else) -----------------------
export const DEVICE_COOKIE = 'fb_dispositivo';
const DEVICE_ID = /^[A-Za-z0-9_-]{22}$/;

/** 128 random bits, base64url (22 characters). */
export function newDeviceId(): string {
  return randomBytes(16).toString('base64url');
}

export function isDeviceId(v: string | null | undefined): v is string {
  return DEVICE_ID.test(v ?? '');
}

/** The cookie's options: one year, the whole site, never readable by scripts. */
export function deviceCookieOptions(secure = env.appUrl.startsWith('https://')) {
  return { httpOnly: true, sameSite: 'lax' as const, secure, path: '/', maxAge: 60 * 60 * 24 * 365 };
}

export function deviceKey(deviceId: string, cfg?: PepperConfig): string {
  if (!isDeviceId(deviceId)) throw new Error('deviceKey: not a device id');
  return hmac('device', deviceId, cfg);
}

// --- The network key ------------------------------------------------------------------------------------------------
/**
 * The visitor's address as the platform's proxy reports it (Vercel sets x-real-ip and the first x-forwarded-for entry
 * itself; elsewhere these headers can be forged, so the network limit is a second line after the device one). '' when
 * there is none.
 */
export function clientIp(headers: Pick<Headers, 'get'>): string {
  const real = headers.get('x-real-ip')?.trim();
  if (real) return real;
  return headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '';
}

/** IPv4 as is; IPv4 inside IPv6 as IPv4; IPv6 by its /64 (one home or phone line can change the rest freely). */
export function networkOf(ip: string): string {
  const s = ip.trim().toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (mapped) return mapped[1];
  if (/^\d+\.\d+\.\d+\.\d+$/.test(s)) return s;
  if (!s.includes(':')) return s ? 'otro' : 'desconocida';
  const [head, tail = ''] = s.split('::');
  const left = head ? head.split(':') : [];
  const right = s.includes('::') && tail ? tail.split(':') : [];
  const groups = s.includes('::') ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right] : left;
  return groups
    .slice(0, 4)
    .map((g) => (parseInt(g || '0', 16) || 0).toString(16))
    .join(':') + '::/64';
}

export function ipKey(ip: string, cfg?: PepperConfig): string {
  return hmac('ip', networkOf(ip), cfg);
}
