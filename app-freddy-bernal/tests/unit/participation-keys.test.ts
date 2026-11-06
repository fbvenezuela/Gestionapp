// The citizen's receipt and the keys around it (D-96, design §4): the secret (80 bits, four groups of Crockford
// base32, read back whatever way it is typed), the reference, the HMAC of both with the pepper (demo pepper only in the
// demo), the rate limit's device and network keys, the lookup cookie (encrypted, 30 minutes) and Turnstile (off
// without its keys, a fake Cloudflare here: nothing goes out).
import { describe, expect, it } from 'vitest';
import { CROCKFORD, REFERENCE_PATTERN, SECRET_PATTERN, crockfordFromBytes, generateSecret, newReference, normalizeReference, normalizeSecret } from '@/lib/participation/receipt-code';
import { ParticipationConfigError, clientIp, deviceKey, ipKey, isDeviceId, networkOf, newDeviceId, participationPepper, secretDigest } from '@/lib/participation/keys';
import { openLookup, sealLookup, LOOKUP_MINUTES, lookupCookieOptions } from '@/lib/participation/lookup-cookie';
import { turnstileEnabled, verifyTurnstile } from '@/lib/participation/turnstile';

const DEMO = { mode: 'demo' as const, pepper: '' };
const PROD = { mode: 'supabase' as const, pepper: 'p'.repeat(40) };

describe('la clave del comprobante', () => {
  it('80 bits al azar en cuatro grupos de cuatro, del alfabeto de Crockford (sin I, L, O ni U)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const s = generateSecret();
      expect(s).toMatch(SECRET_PATTERN);
      expect(s).not.toMatch(/[ILOU]/);
      seen.add(s);
    }
    expect(seen.size).toBe(200);
    // Fixed bytes give a fixed secret (the demo's receipts): 0x00… is all zeros, 0xff… all Z.
    expect(generateSecret(new Uint8Array(10))).toBe('0000-0000-0000-0000');
    expect(generateSecret(new Uint8Array(10).fill(255))).toBe('ZZZZ-ZZZZ-ZZZZ-ZZZZ');
    expect(crockfordFromBytes(Uint8Array.from([0b00001000, 0b01000000]), 3)).toBe('110');
    expect(() => crockfordFromBytes(new Uint8Array(1), 2)).toThrow();
    expect(CROCKFORD).toHaveLength(32);
  });

  it('se lee como la escriba la persona: minúsculas, espacios, sin guiones, O por 0, I o L por 1', () => {
    expect(normalizeSecret('k7qm 2hxp 9wrt 4bne')).toBe('K7QM-2HXP-9WRT-4BNE');
    expect(normalizeSecret('K7QM2HXP9WRT4BNE')).toBe('K7QM-2HXP-9WRT-4BNE');
    expect(normalizeSecret(' K7QM-2HXP-9WRT-4BNE ')).toBe('K7QM-2HXP-9WRT-4BNE');
    expect(normalizeSecret('OOOO-IIII-LLLL-0000')).toBe('0000-1111-1111-0000');
    // U is not in the alphabet; too short or too long is not a secret.
    expect(normalizeSecret('UUUU-2HXP-9WRT-4BNE')).toBeNull();
    expect(normalizeSecret('K7QM-2HXP-9WRT')).toBeNull();
    expect(normalizeSecret('K7QM-2HXP-9WRT-4BNE-A')).toBeNull();
    expect(normalizeSecret(null)).toBeNull();
  });
});

describe('el código (referencia)', () => {
  it('AC-año-6 caracteres, como los hace la base; se lee aunque venga mal escrito', () => {
    for (let i = 0; i < 50; i++) expect(newReference(2026)).toMatch(REFERENCE_PATTERN);
    expect(newReference(2026, new Uint8Array(4))).toBe('AC-2026-000000');
    expect(() => newReference(26)).toThrow();
    expect(normalizeReference('ac 2026 k7qm2h')).toBe('AC-2026-K7QM2H');
    expect(normalizeReference('AC2026-K7QM2H')).toBe('AC-2026-K7QM2H');
    expect(normalizeReference('AC-2O26-K7QMIL')).toBe('AC-2026-K7QM11');
    expect(normalizeReference('AC-2026-K7QM2')).toBeNull();
    expect(normalizeReference('XY-2026-K7QM2H')).toBeNull();
    expect(normalizeReference('AC-2026-K7QMU2')).toBeNull();
  });
});

describe('la huella (HMAC) y la pimienta', () => {
  it('la misma clave escrita de cualquier forma da la misma huella; otra pimienta, otra huella', () => {
    const a = secretDigest('K7QM-2HXP-9WRT-4BNE', DEMO);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(secretDigest('k7qm2hxp9wrt4bne', DEMO)).toBe(a);
    expect(secretDigest('K7QM-2HXP-9WRT-4BNE', PROD)).not.toBe(a);
    expect(() => secretDigest('no es una clave', DEMO)).toThrow();
  });

  it('en la demo hay una pimienta fija; con la base real, sin pimienta (o corta) no se guarda nada', () => {
    expect(participationPepper(DEMO)).toMatch(/demo/);
    expect(() => participationPepper({ mode: 'supabase', pepper: '' })).toThrow(ParticipationConfigError);
    expect(() => participationPepper({ mode: 'supabase', pepper: 'corta' })).toThrow(/32 caracteres/);
    expect(participationPepper(PROD)).toBe(PROD.pepper);
  });

  it('cada tipo de llave es distinto: la clave, el dispositivo y la red nunca valen la una por la otra', () => {
    const id = newDeviceId();
    expect(isDeviceId(id)).toBe(true);
    expect(isDeviceId('corto')).toBe(false);
    expect(isDeviceId(`${id}x`)).toBe(false);
    const dk = deviceKey(id, DEMO);
    expect(dk).toMatch(/^[0-9a-f]{64}$/);
    expect(deviceKey(id, DEMO)).toBe(dk);
    expect(ipKey('190.0.2.10', DEMO)).toMatch(/^[0-9a-f]{64}$/);
    expect(ipKey('190.0.2.10', DEMO)).not.toBe(dk);
    expect(() => deviceKey('no-es-un-dispositivo', DEMO)).toThrow();
  });
});

describe('la red del visitante', () => {
  it('la dirección que da el proxy de la plataforma; IPv6 por su /64; IPv4 dentro de IPv6 como IPv4', () => {
    expect(clientIp(new Headers({ 'x-real-ip': '190.0.2.10', 'x-forwarded-for': '1.1.1.1' }))).toBe('190.0.2.10');
    expect(clientIp(new Headers({ 'x-forwarded-for': '190.0.2.10, 10.0.0.1' }))).toBe('190.0.2.10');
    expect(clientIp(new Headers())).toBe('');
    expect(networkOf('190.0.2.10')).toBe('190.0.2.10');
    expect(networkOf('::ffff:190.0.2.10')).toBe('190.0.2.10');
    expect(networkOf('2001:db8:1:2:3:4:5:6')).toBe('2001:db8:1:2::/64');
    expect(networkOf('2001:db8:1:2::9')).toBe('2001:db8:1:2::/64');
    expect(networkOf('[2001:DB8::1]')).toBe('2001:db8:0:0::/64');
    expect(networkOf('')).toBe('desconocida');
    // Two addresses of the same phone line share the limit.
    expect(ipKey('2001:db8:1:2::9', DEMO)).toBe(ipKey('2001:db8:1:2:aaaa::1', DEMO));
  });
});

describe('la galleta de la consulta', () => {
  const g = { reference: 'AC-2026-K7QM2H', digest: 'a'.repeat(64) };

  it('cifrada y firmada, 30 minutos, solo bajo /atencion/consultar', () => {
    const now = Date.UTC(2026, 10, 6, 12);
    const c = sealLookup(g, now, DEMO);
    expect(c).not.toContain('AC-2026');
    expect(c).not.toContain('aaaa');
    expect(openLookup(c, now + 60_000, DEMO)).toEqual(g);
    expect(openLookup(c, now + LOOKUP_MINUTES * 60_000 + 1, DEMO)).toBeNull();
    expect(openLookup(c, now, PROD)).toBeNull();
    const bytes = Buffer.from(c, 'base64url');
    bytes[14] ^= 1;
    expect(openLookup(bytes.toString('base64url'), now, DEMO)).toBeNull();
    expect(openLookup('basura', now, DEMO)).toBeNull();
    expect(openLookup(undefined, now, DEMO)).toBeNull();
    expect(() => sealLookup({ reference: 'otra cosa', digest: g.digest }, now, DEMO)).toThrow();
    expect(lookupCookieOptions(true)).toEqual({ httpOnly: true, sameSite: 'strict', secure: true, path: '/atencion/consultar', maxAge: 1800 });
  });
});

describe('Turnstile', () => {
  it('apagado sin sus dos claves; con ellas, lo que diga Cloudflare (sin respuesta = no)', async () => {
    expect(turnstileEnabled({ siteKey: '', secretKey: '' })).toBe(false);
    expect(turnstileEnabled({ siteKey: 'sitio', secretKey: '' })).toBe(false);
    expect(turnstileEnabled({ siteKey: 'sitio', secretKey: 'secreto' })).toBe(true);
    const calls: URLSearchParams[] = [];
    const fake = (ok: boolean, success: unknown) =>
      (async (_url: string | URL | Request, init?: RequestInit) => {
        calls.push(init!.body as URLSearchParams);
        return new Response(JSON.stringify({ success }), { status: ok ? 200 : 500 });
      }) as typeof fetch;
    expect(await verifyTurnstile('token', '190.0.2.10', { secretKey: 's', fetchImpl: fake(true, true) })).toBe(true);
    expect(calls[0].get('secret')).toBe('s');
    expect(calls[0].get('response')).toBe('token');
    expect(calls[0].get('remoteip')).toBe('190.0.2.10');
    expect(await verifyTurnstile('token', '', { secretKey: 's', fetchImpl: fake(true, false) })).toBe(false);
    expect(await verifyTurnstile('token', '', { secretKey: 's', fetchImpl: fake(false, true) })).toBe(false);
    expect(await verifyTurnstile('', '', { secretKey: 's', fetchImpl: fake(true, true) })).toBe(false);
    expect(await verifyTurnstile('token', '', { secretKey: '', fetchImpl: fake(true, true) })).toBe(false);
    const broken = (async () => {
      throw new Error('sin red');
    }) as typeof fetch;
    expect(await verifyTurnstile('token', '', { secretKey: 's', fetchImpl: broken })).toBe(false);
  });
});
