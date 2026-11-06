import 'server-only';
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { env } from '../env';
import { participationPepper, type PepperConfig } from './keys';
import { REFERENCE_PATTERN } from './receipt-code';

// «Consultar mi solicitud» (design §4): the reference and the secret go by POST, never in the address; after a lookup
// that found the request, the page keeps a short cookie so the person can add information or confirm without typing
// them again. The cookie carries the reference and the secret's DIGEST, encrypted and authenticated (AES-256-GCM with a
// key derived from the pepper), for 30 minutes, httpOnly, SameSite=Strict and only under /atencion/consultar.

export const LOOKUP_COOKIE = 'fb_consulta';
export const LOOKUP_MINUTES = 30;
export type LookupGrant = { reference: string; digest: string };

const key = (cfg?: PepperConfig) =>
  Buffer.from(hkdfSync('sha256', participationPepper(cfg), Buffer.alloc(0), 'fb-consulta-cookie', 32));

export function sealLookup(g: LookupGrant, now = Date.now(), cfg?: PepperConfig): string {
  if (!REFERENCE_PATTERN.test(g.reference) || !/^[0-9a-f]{64}$/.test(g.digest)) throw new Error('sealLookup: bad grant');
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(cfg), iv);
  const body = Buffer.concat([c.update(JSON.stringify({ r: g.reference, d: g.digest, e: now + LOOKUP_MINUTES * 60_000 }), 'utf8'), c.final()]);
  return Buffer.concat([iv, body, c.getAuthTag()]).toString('base64url');
}

/** The grant inside a cookie, or null (tampered, from another pepper, expired, malformed). */
export function openLookup(value: string | null | undefined, now = Date.now(), cfg?: PepperConfig): LookupGrant | null {
  try {
    const raw = Buffer.from(value ?? '', 'base64url');
    if (raw.length < 12 + 16 + 2) return null;
    const d = createDecipheriv('aes-256-gcm', key(cfg), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(raw.length - 16));
    const p = JSON.parse(Buffer.concat([d.update(raw.subarray(12, raw.length - 16)), d.final()]).toString('utf8')) as { r: string; d: string; e: number };
    if (typeof p.e !== 'number' || p.e < now) return null;
    if (!REFERENCE_PATTERN.test(p.r) || !/^[0-9a-f]{64}$/.test(p.d)) return null;
    return { reference: p.r, digest: p.d };
  } catch {
    return null;
  }
}

export function lookupCookieOptions(secure = env.appUrl.startsWith('https://')) {
  return { httpOnly: true, sameSite: 'strict' as const, secure, path: '/atencion/consultar', maxAge: LOOKUP_MINUTES * 60 };
}
