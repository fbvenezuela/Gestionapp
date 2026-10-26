// The code that arrives by email may have 6 to 10 digits (a Supabase project setting; new hosted
// projects may send 8). The authenticator app's code is always 6. Forms and server share the rule.
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { EMAIL_CODE, TOTP_CODE } from '@/lib/auth/code-format';
import { emailCodeSchema, totpCodeSchema } from '@/lib/auth/codes';

const ok = (s: { safeParse: (v: unknown) => { success: boolean } }, v: unknown) => s.safeParse(v).success;

describe('código del correo', () => {
  it('acepta de 6 a 10 números', () => {
    for (const code of ['123456', '1234567', '12345678', '123456789', '1234567890', ' 12345678 ']) expect(ok(emailCodeSchema, code), code).toBe(true);
    expect(emailCodeSchema.parse(' 01234567 ')).toBe('01234567');
  });
  it('rechaza menos de 6, más de 10, letras o espacios por dentro', () => {
    for (const code of ['', '12345', '12345678901', '12345a', '1234 5678', 'abcdefgh', null, undefined]) expect(ok(emailCodeSchema, code), String(code)).toBe(false);
    expect(emailCodeSchema.safeParse('123').error?.issues[0].message).toBe('Escribe el código completo que te llegó, solo con números.');
  });
  it('el formulario usa la misma regla que el servidor', () => {
    expect(EMAIL_CODE).toMatchObject({ min: 6, max: 10 });
    const re = new RegExp(`^(?:${EMAIL_CODE.pattern})$`);
    expect(re.test('12345678')).toBe(true);
    expect(re.test('12345')).toBe(false);
    expect(re.test('12345678901')).toBe(false);
    const form = fs.readFileSync(path.join(process.cwd(), 'src/app/(auth)/entrar/login-form.tsx'), 'utf8');
    expect(form).toContain('pattern={EMAIL_CODE.pattern} maxLength={EMAIL_CODE.max}');
    expect(form).toMatch(/inputMode="numeric" autoComplete="one-time-code"/);
    expect(form).not.toMatch(/6 números/);
  });
});

describe('código de la aplicación (doble factor)', () => {
  it('sigue siendo de 6 números exactos', () => {
    expect(ok(totpCodeSchema, '123456')).toBe(true);
    expect(ok(totpCodeSchema, ' 123456 ')).toBe(true);
    for (const code of ['12345', '1234567', '12345678', '12345a']) expect(ok(totpCodeSchema, code), code).toBe(false);
    expect(totpCodeSchema.safeParse('1234567').error?.issues[0].message).toBe('El código tiene 6 números.');
  });
  it('el formulario pide 6', () => {
    expect(TOTP_CODE.length).toBe(6);
    const form = fs.readFileSync(path.join(process.cwd(), 'src/app/(auth)/doble-factor/mfa-form.tsx'), 'utf8');
    expect(form).toContain('pattern={TOTP_CODE.pattern} maxLength={TOTP_CODE.length}');
  });
});
