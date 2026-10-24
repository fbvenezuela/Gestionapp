import crypto from 'node:crypto';

// VAPID keys (P-256) for Web Push. When no keys are configured they are DERIVED from the
// session secret, so there is no extra secret to keep: same secret = same keys forever, and
// phones stay subscribed across deploys. HKDF with its own info string keeps the push key
// independent from every other use of the secret.

// Order of the P-256 group.
const N = BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');
const SALT = 'operaciones360/web-push';
const INFO = 'vapid-p256-private-key/v1';

// Invented input used only with the in-memory demo database when SESSION_SECRET is empty.
export const DEMO_VAPID_INPUT = 'demo-only-vapid-input-not-a-secret';

export type VapidKeys = { publicKey: string; privateKey: string };

// Maps any bytes to a valid private scalar in [1, n-1].
export function toScalar(bytes: Uint8Array): Buffer {
  const x = BigInt(`0x${Buffer.from(bytes).toString('hex') || '0'}`);
  const d = (x % (N - BigInt(1))) + BigInt(1);
  return Buffer.from(d.toString(16).padStart(64, '0'), 'hex');
}

export function deriveVapidKeys(input: string): VapidKeys {
  if (!input) throw new Error('deriveVapidKeys needs a non-empty input');
  // 48 bytes (> 32) so the modular reduction has negligible bias.
  const okm = new Uint8Array(crypto.hkdfSync('sha256', input, SALT, INFO, 48));
  const priv = toScalar(okm);
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.setPrivateKey(priv);
  return { publicKey: ecdh.getPublicKey().toString('base64url'), privateKey: priv.toString('base64url') };
}

// True when the pair is a usable P-256 VAPID pair (uncompressed public key matching the private one).
export function validVapidKeys(k: VapidKeys): boolean {
  try {
    const pub = Buffer.from(k.publicKey, 'base64url');
    const priv = Buffer.from(k.privateKey, 'base64url');
    if (pub.length !== 65 || pub[0] !== 4 || priv.length !== 32) return false;
    const d = BigInt(`0x${priv.toString('hex')}`);
    if (d < BigInt(1) || d >= N) return false;
    const ecdh = crypto.createECDH('prime256v1');
    ecdh.setPrivateKey(priv);
    return ecdh.getPublicKey().equals(pub);
  } catch {
    return false;
  }
}
