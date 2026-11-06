// The citizen's contact, encrypted before it reaches the database (D-96, design §4): AES-256-GCM with
// PARTICIPATION_DATA_KEY in request_contacts' shape; a field cannot be read as another; a changed byte is refused; the
// old keys still decrypt after a rotation; the fixed demo key exists only in the demo; production refuses to store a
// contact without its key (a request without contact needs none). Invented values on the .test domain.
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { contactKeyring, openContact, openField, sealContact, sealField } from '@/lib/participation/contact-crypto';
import { ParticipationConfigError } from '@/lib/participation/keys';

// request_contacts' own check (20261106000200_participacion.sql).
const DB_SHAPE = /^[a-z0-9]{1,16}:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{22,}$/;
const key = () => randomBytes(32).toString('base64');

describe('el contacto cifrado', () => {
  it('va y vuelve, con la forma que pide la base, y cada vez distinto', () => {
    const ring = contactKeyring({ mode: 'supabase', key: `k1:${key()}`, previous: '' });
    const a = sealField('Vecina de prueba (demo)', 'name', ring);
    const b = sealField('Vecina de prueba (demo)', 'name', ring);
    expect(a).toMatch(DB_SHAPE);
    expect(a.startsWith('k1:')).toBe(true);
    expect(a).not.toBe(b);
    expect(a).not.toContain('Vecina');
    expect(openField(a, 'name', ring)).toBe('Vecina de prueba (demo)');
    expect(openField(sealField('ñandú áéíóú 😀', 'name', ring), 'name', ring)).toBe('ñandú áéíóú 😀');
    // Even an empty text has its tag: still the shape.
    expect(sealField('', 'phone', ring)).toMatch(DB_SHAPE);
  });

  it('un nombre no se lee como correo; un byte cambiado, otra clave o basura no se leen', () => {
    const ring = contactKeyring({ mode: 'supabase', key: key(), previous: '' });
    const s = sealField('vecina@demo.test', 'email', ring);
    expect(s.startsWith('k1:')).toBe(true);
    expect(openField(s, 'name', ring)).toBeNull();
    const [id, iv, body] = s.split(':');
    const flipped = Buffer.from(body, 'base64url');
    flipped[0] ^= 1;
    expect(openField(`${id}:${iv}:${flipped.toString('base64url')}`, 'email', ring)).toBeNull();
    expect(openField(s, 'email', contactKeyring({ mode: 'supabase', key: key(), previous: '' }))).toBeNull();
    expect(openField('k1:corto:corto', 'email', ring)).toBeNull();
    expect(openField(null, 'email', ring)).toBeNull();
  });

  it('rotación: la clave nueva cifra, las anteriores siguen leyendo lo viejo', () => {
    const old = key();
    const before = contactKeyring({ mode: 'supabase', key: `k1:${old}`, previous: '' });
    const s = sealField('+58 000 000 0001', 'phone', before);
    const after = contactKeyring({ mode: 'supabase', key: `k2:${key()}`, previous: `k1:${old}` });
    expect(openField(s, 'phone', after)).toBe('+58 000 000 0001');
    expect(sealField('x', 'phone', after).startsWith('k2:')).toBe(true);
    expect(() => contactKeyring({ mode: 'supabase', key: key(), previous: old })).toThrow(/id:clave/);
    expect(() => contactKeyring({ mode: 'supabase', key: 'k1:corta', previous: '' })).toThrow(/32 bytes/);
    expect(() => contactKeyring({ mode: 'supabase', key: `demo:${key()}`, previous: '' })).toThrow(/solo de la demostración/);
    // Hex works too.
    expect(contactKeyring({ mode: 'supabase', key: randomBytes(32).toString('hex'), previous: '' }).current?.id).toBe('k1');
  });

  it('la clave fija de la demo solo en la demo; con la base real y sin clave, no se guarda un contacto', () => {
    const demo = contactKeyring({ mode: 'demo', key: '', previous: '' });
    const s = sealField('Vecina de prueba (demo)', 'name', demo);
    expect(s.startsWith('demo:')).toBe(true);
    // Production never reads the demo key, even with its own key.
    expect(openField(s, 'name', contactKeyring({ mode: 'supabase', key: key(), previous: '' }))).toBeNull();
    // A local demo with its own key still reads the seeded contacts.
    const local = contactKeyring({ mode: 'demo', key: key(), previous: '' });
    expect(openField(s, 'name', local)).toBe('Vecina de prueba (demo)');
    expect(sealField('x', 'name', local).startsWith('k1:')).toBe(true);
    const prod = contactKeyring({ mode: 'supabase', key: '', previous: '' });
    expect(prod.current).toBeNull();
    expect(() => sealField('x', 'name', prod)).toThrow(ParticipationConfigError);
    expect(() => sealContact({ name: 'Vecina (demo)', channel: 'email' }, prod)).toThrow(/PARTICIPATION_DATA_KEY/);
    // No contact, no key needed.
    expect(sealContact({ name: '  ', email: '', phone: null }, prod)).toEqual({ name: null, email: null, phone: null, channel: 'none' });
  });

  it('sealContact y openContact: lo que toma la función y lo que devuelve request_contact()', () => {
    const ring = contactKeyring({ mode: 'demo', key: '', previous: '' });
    const c = sealContact({ name: ' Vecina de prueba (demo) ', email: 'vecina@demo.test', phone: '', channel: 'email' }, ring);
    expect(c.phone).toBeNull();
    expect(c.channel).toBe('email');
    expect(openContact({ name_enc: c.name, email_enc: c.email, phone_enc: c.phone, preferred_channel: c.channel }, ring)).toEqual({
      name: 'Vecina de prueba (demo)',
      email: 'vecina@demo.test',
      phone: null,
      preferredChannel: 'email',
    });
  });
});
