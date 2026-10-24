import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import webpush from 'web-push';
import { DEMO_VAPID_INPUT, deriveVapidKeys, toScalar, validVapidKeys } from '@/lib/push/keys';
import { isAllowedEndpoint } from '@/lib/push/endpoint';

const N = BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');

describe('claves VAPID derivadas del secreto', () => {
  it('son estables: el mismo secreto da siempre las mismas claves', () => {
    const a = deriveVapidKeys('un-secreto-de-prueba');
    const b = deriveVapidKeys('un-secreto-de-prueba');
    expect(a).toEqual(b);
    expect(deriveVapidKeys('otro-secreto')).not.toEqual(a);
    expect(deriveVapidKeys(DEMO_VAPID_INPUT)).toEqual(deriveVapidKeys(DEMO_VAPID_INPUT));
  });

  it('son un par P-256 válido (pública sin comprimir de 65 bytes, privada de 32)', () => {
    for (const input of ['a', 'secreto largo de sesión', DEMO_VAPID_INPUT]) {
      const k = deriveVapidKeys(input);
      const pub = Buffer.from(k.publicKey, 'base64url');
      const priv = Buffer.from(k.privateKey, 'base64url');
      expect(pub.length).toBe(65);
      expect(pub[0]).toBe(4);
      expect(priv.length).toBe(32);
      expect(validVapidKeys(k)).toBe(true);
      const ecdh = crypto.createECDH('prime256v1');
      ecdh.setPrivateKey(priv);
      expect(ecdh.getPublicKey().equals(pub)).toBe(true);
      expect(k.publicKey).not.toMatch(/[=+/]/);
    }
  });

  it('web-push las acepta y firma con ellas', () => {
    const k = deriveVapidKeys('secreto');
    const h = webpush.getVapidHeaders('https://fcm.googleapis.com', 'mailto:avisos@example.test', k.publicKey, k.privateKey, 'aes128gcm');
    expect(h.Authorization).toMatch(/^vapid t=.+, k=/);
  });

  it('el escalar siempre cae en [1, n-1]', () => {
    const val = (b: Buffer) => BigInt(`0x${b.toString('hex')}`);
    expect(val(toScalar(new Uint8Array(48)))).toBe(BigInt(1));
    expect(val(toScalar(new Uint8Array(48).fill(255)))).toBeLessThan(N);
    const nMinus1 = Buffer.from((N - BigInt(1)).toString(16), 'hex');
    expect(val(toScalar(nMinus1))).toBe(BigInt(1));
    const nMinus2 = Buffer.from((N - BigInt(2)).toString(16), 'hex');
    expect(val(toScalar(nMinus2))).toBe(N - BigInt(1));
  });

  it('rechaza pares inválidos', () => {
    const k = deriveVapidKeys('x');
    expect(validVapidKeys({ publicKey: deriveVapidKeys('y').publicKey, privateKey: k.privateKey })).toBe(false);
    expect(validVapidKeys({ publicKey: 'abc', privateKey: k.privateKey })).toBe(false);
    expect(() => deriveVapidKeys('')).toThrow();
  });
});

describe('solo servicios de avisos reales', () => {
  it('acepta Chrome, Firefox, Apple y Windows', () => {
    for (const u of [
      'https://fcm.googleapis.com/fcm/send/abc',
      'https://updates.push.services.mozilla.com/wpush/v2/abc',
      'https://web.push.apple.com/QGx',
      'https://wns2-par02p.notify.windows.com/w/?token=abc',
    ]) expect(isAllowedEndpoint(u)).toBe(true);
  });

  it('rechaza direcciones internas, http y otros servidores', () => {
    for (const u of [
      'http://fcm.googleapis.com/fcm/send/abc',
      'https://169.254.169.254/latest/meta-data',
      'https://localhost/x',
      'https://fcm.googleapis.com.evil.test/x',
      'https://user:pw@fcm.googleapis.com/x',
      'https://fcm.googleapis.com:8443/x',
      'no es una url',
    ]) expect(isAllowedEndpoint(u)).toBe(false);
  });
});
