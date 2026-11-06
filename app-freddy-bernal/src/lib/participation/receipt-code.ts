// The citizen's receipt (D-96, design §4): the reference «AC-2026-K7QM2H» (public, printed everywhere) and the secret
// «K7QM-2HXP-9WRT-4BNE» (80 bits, shown once; only its HMAC is stored, src/lib/participation/keys.ts). Both in
// Crockford's base32: no I, L, O or U, so a code read aloud or copied by hand survives; the look-alikes a person types
// (O for 0, I or L for 1) are read as what they meant. No Node imports: the browser makes the secret when the form
// starts (it keeps it in sessionStorage with the form's key, so a retry gets the same receipt), and the server checks
// and normalizes it the same way before the HMAC, at submit and at lookup.

export const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const LOOK_ALIKES: Record<string, string> = { O: '0', I: '1', L: '1' };

/** Upper case, without spaces, dashes or dots, and the look-alikes read as Crockford's (O→0, I→1, L→1). */
function canonicalChars(input: string): string {
  return input
    .toUpperCase()
    .replace(/[\s\-_.·]/g, '')
    .replace(/[OIL]/g, (c) => LOOK_ALIKES[c]);
}

/** `count` Crockford characters from the bits of `bytes` (5 bits each, most significant first). */
export function crockfordFromBytes(bytes: Uint8Array, count: number): string {
  if (bytes.length * 8 < count * 5) throw new Error('not enough random bytes');
  let out = '';
  for (let i = 0; i < count; i++) {
    let v = 0;
    for (let b = 0; b < 5; b++) {
      const bit = i * 5 + b;
      v = (v << 1) | ((bytes[bit >> 3] >> (7 - (bit & 7))) & 1);
    }
    out += CROCKFORD[v];
  }
  return out;
}

function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  globalThis.crypto.getRandomValues(b);
  return b;
}

// --- The secret --------------------------------------------------------------------------------------------------
export const SECRET_PATTERN = /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/;

/** A new secret: 80 random bits (10 bytes from the platform's strong source) as four groups of four. */
export function generateSecret(bytes: Uint8Array = randomBytes(10)): string {
  return formatSecret(crockfordFromBytes(bytes, 16));
}

/** «K7QM2HXP9WRT4BNE» → «K7QM-2HXP-9WRT-4BNE». */
function formatSecret(chars: string): string {
  return chars.match(/.{4}/g)!.join('-');
}

/**
 * The secret as stored and compared (its canonical form, «XXXX-XXXX-XXXX-XXXX»), whatever way the person typed it
 * (small letters, spaces, no dashes, O for 0…), or null when it cannot be one.
 */
export function normalizeSecret(input: string | null | undefined): string | null {
  const chars = canonicalChars(String(input ?? ''));
  if (chars.length !== 16 || ![...chars].every((c) => CROCKFORD.includes(c))) return null;
  return formatSecret(chars);
}

// --- The reference -----------------------------------------------------------------------------------------------
export const REFERENCE_PATTERN = /^AC-[0-9]{4}-[0-9A-HJKMNP-TV-Z]{6}$/;

/**
 * A reference in the database's shape (request_new_reference(), 20261106000200_participacion.sql, which makes the real
 * ones): «AC-», the year and 6 Crockford characters from 30 random bits. Here for the demo's seed (fixed bytes, the same
 * receipt on every server) and the tests.
 */
export function newReference(year: number, bytes: Uint8Array = randomBytes(4)): string {
  if (!Number.isInteger(year) || year < 2000 || year > 9999) throw new Error('bad year');
  return `AC-${year}-${crockfordFromBytes(bytes, 6)}`;
}

/** «ac 2026 k7qm2h», «AC2026-K7QM2H» or «AC-2O26-K7QM2H» (a letter O) as typed → «AC-2026-K7QM2H»; null when it cannot be one. */
export function normalizeReference(input: string | null | undefined): string | null {
  const raw = String(input ?? '')
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '');
  if (!raw.startsWith('AC') || raw.length !== 12) return null;
  const rest = raw.slice(2).replace(/[OIL]/g, (c) => LOOK_ALIKES[c]);
  const ref = `AC-${rest.slice(0, 4)}-${rest.slice(4)}`;
  return REFERENCE_PATTERN.test(ref) ? ref : null;
}
