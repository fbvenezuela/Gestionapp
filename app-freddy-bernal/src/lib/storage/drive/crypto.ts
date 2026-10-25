import crypto from 'node:crypto';

// AES-256-GCM for what the server keeps about Drive: the refresh token, the resumable upload
// session URLs and the OAuth state cookie. The key never touches the database. The AAD names
// the row a ciphertext belongs to, so it cannot be copied to another row and opened there.
//
// Sealed format: v1.<kid>.<iv>.<ciphertext>.<tag> (base64url). kid = first 8 hex characters of
// SHA-256(key), so a changed key is told apart from a damaged value.

const SALT = 'operaciones360/drive';
const INFO = 'drive-refresh-token/v1';

// Invented input used only with the in-memory demo database when no secret is set.
export const DEMO_DRIVE_KEY_INPUT = 'demo-only-drive-key-input-not-a-secret';

/** The key from DRIVE_TOKEN_KEY (32 bytes, base64 or base64url), or null when it is not that. */
export function parseKey(b64: string): Buffer | null {
  if (!b64) return null;
  const k = Buffer.from(b64.trim(), b64.includes('-') || b64.includes('_') ? 'base64url' : 'base64');
  return k.length === 32 ? k : null;
}

/** HKDF-SHA256 from the session secret, with its own salt and info (like the push keys). */
export function deriveKey(input: string): Buffer {
  if (!input) throw new Error('deriveKey needs a non-empty input');
  return Buffer.from(crypto.hkdfSync('sha256', input, SALT, INFO, 32));
}

export function keyId(key: Buffer): string {
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 8);
}

export function seal(plain: string, aad: string, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', keyId(key), iv.toString('base64url'), ct.toString('base64url'), c.getAuthTag().toString('base64url')].join('.');
}

export type Opened = { ok: true; value: string } | { ok: false; why: 'other_key' | 'damaged' };

/** Opens a sealed value. A different key or AAD, or any changed byte, never yields text. */
export function open(sealed: string, aad: string, key: Buffer): Opened {
  const parts = sealed.split('.');
  if (parts.length !== 5 || parts[0] !== 'v1') return { ok: false, why: 'damaged' };
  const [, kid, iv, ct, tag] = parts;
  if (kid !== keyId(key)) return { ok: false, why: 'other_key' };
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
    d.setAAD(Buffer.from(aad));
    const t = Buffer.from(tag, 'base64url');
    if (t.length !== 16) return { ok: false, why: 'damaged' };
    d.setAuthTag(t);
    return { ok: true, value: Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8') };
  } catch {
    return { ok: false, why: 'damaged' };
  }
}

// AAD per use.
export const AAD = {
  connection: 'drive_connection',
  upload: (mediaId: string) => `media_drive:${mediaId}`,
  oauthState: 'drive_oauth_state',
} as const;
