import 'server-only';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from '../env';
import { ParticipationConfigError } from './keys';

// The citizen's contact (name, email, phone) is encrypted HERE, before it reaches the database (D-96, design §4):
// AES-256-GCM with PARTICIPATION_DATA_KEY, each field as «<key id>:<iv>:<ciphertext + tag>» (base64url, the shape
// request_contacts checks, at most 3000 characters). The field's name goes in the authenticated data, so a name can
// never be read back as an email. Only who works on the case gets the ciphertext (request_contact(), audited) and
// decrypts it here. Key rotation: PARTICIPATION_DATA_KEY="<id>:<key>" is the one that encrypts;
// PARTICIPATION_DATA_KEYS_PREVIOUS="<id>:<key>,…" still decrypt. Demo mode: a FIXED demo key (id «demo»), only there;
// with DATABASE_URL and no key, a contact is refused (the person can still send without one).

export type ContactField = 'name' | 'email' | 'phone';
export type Keyring = { current: { id: string; key: Buffer } | null; keys: Map<string, Buffer> };
export type DataKeyConfig = { mode: 'demo' | 'supabase'; key: string; previous: string };

const DEMO_KEY_ID = 'demo';
const DEMO_KEY = createHash('sha256').update('fb-demo-clave-de-contactos-no-es-secreta').digest();
const SEALED = /^([a-z0-9]{1,16}):([A-Za-z0-9_-]{16}):([A-Za-z0-9_-]{22,})$/;
export const SEALED_MAX = 3000;

const keyConfigFromEnv = (): DataKeyConfig => ({
  mode: env.dataMode,
  key: env.participation.dataKey,
  previous: env.participation.previousDataKeys,
});

// «<id>:<32 bytes in base64, base64url or hex>» or just the key (id «k1»).
function parseKey(spec: string, needId: boolean): { id: string; key: Buffer } {
  const m = /^([a-z0-9]{1,16}):(.+)$/.exec(spec.trim());
  if (!m && needId) throw new ParticipationConfigError('Cada clave anterior va como «id:clave».');
  const id = m ? m[1] : 'k1';
  const raw = (m ? m[2] : spec).trim();
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new ParticipationConfigError('PARTICIPATION_DATA_KEY tiene que ser de 32 bytes (base64 o hex).');
  if (id === DEMO_KEY_ID) throw new ParticipationConfigError('El id «demo» es solo de la demostración: usa otro, por ejemplo k1.');
  return { id, key };
}

/** The keys in use. Demo mode always reads its demo key too (the demo's seeded contacts); production never does. */
export function contactKeyring(cfg: DataKeyConfig = keyConfigFromEnv()): Keyring {
  const keys = new Map<string, Buffer>();
  let current: Keyring['current'] = null;
  if (cfg.key) {
    current = parseKey(cfg.key, false);
    keys.set(current.id, current.key);
  }
  for (const spec of cfg.previous.split(',').map((x) => x.trim()).filter(Boolean)) {
    const k = parseKey(spec, true);
    if (!keys.has(k.id)) keys.set(k.id, k.key);
  }
  if (cfg.mode === 'demo') {
    keys.set(DEMO_KEY_ID, DEMO_KEY);
    current ??= { id: DEMO_KEY_ID, key: DEMO_KEY };
  }
  return { current, keys };
}

const aad = (field: ContactField) => Buffer.from(`fb-contacto:${field}`);

/** One field, encrypted with the current key. Throws ParticipationConfigError when there is no key (production). */
export function sealField(plain: string, field: ContactField, ring: Keyring = contactKeyring()): string {
  if (!ring.current) throw new ParticipationConfigError('Falta PARTICIPATION_DATA_KEY: el contacto no se guarda sin cifrar.');
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', ring.current.key, iv);
  c.setAAD(aad(field));
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final(), c.getAuthTag()]);
  const out = `${ring.current.id}:${iv.toString('base64url')}:${body.toString('base64url')}`;
  if (out.length > SEALED_MAX) throw new Error('sealField: too long');
  return out;
}

/** The field back, or null when it is not ours to read (unknown key, wrong field, tampered or damaged). */
export function openField(sealed: string | null | undefined, field: ContactField, ring: Keyring = contactKeyring()): string | null {
  const m = SEALED.exec(sealed ?? '');
  if (!m) return null;
  const key = ring.keys.get(m[1]);
  if (!key) return null;
  try {
    const body = Buffer.from(m[3], 'base64url');
    if (body.length < 16) return null;
    const d = createDecipheriv('aes-256-gcm', key, Buffer.from(m[2], 'base64url'));
    d.setAAD(aad(field));
    d.setAuthTag(body.subarray(body.length - 16));
    return Buffer.concat([d.update(body.subarray(0, body.length - 16)), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}

export type ContactInput = { name?: string | null; email?: string | null; phone?: string | null; channel?: 'email' | 'phone' | 'whatsapp' | 'none' | null };
export type SealedContact = { name: string | null; email: string | null; phone: string | null; channel: 'email' | 'phone' | 'whatsapp' | 'none' };

/** What citizen.submit_request takes (p_contact_*): each given field sealed, nulls for the rest. No key needed when the
 * person left no contact. */
export function sealContact(c: ContactInput, ring?: Keyring): SealedContact {
  const val = (v: string | null | undefined) => (v ?? '').trim() || null;
  const [name, email, phone] = [val(c.name), val(c.email), val(c.phone)];
  const r = name || email || phone ? (ring ?? contactKeyring()) : undefined;
  return {
    name: name && sealField(name, 'name', r),
    email: email && sealField(email, 'email', r),
    phone: phone && sealField(phone, 'phone', r),
    channel: name || email || phone ? (c.channel ?? 'none') : 'none',
  };
}

/** request_contact()'s row, readable (each field null when absent or not ours to read). */
export function openContact(
  row: { name_enc: string | null; email_enc: string | null; phone_enc: string | null; preferred_channel: string },
  ring: Keyring = contactKeyring(),
) {
  return {
    name: openField(row.name_enc, 'name', ring),
    email: openField(row.email_enc, 'email', ring),
    phone: openField(row.phone_enc, 'phone', ring),
    preferredChannel: row.preferred_channel,
  };
}
