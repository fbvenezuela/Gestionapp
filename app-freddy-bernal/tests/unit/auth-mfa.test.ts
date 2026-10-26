// /doble-factor must never enroll while it is drawn: with Supabase, enrolling drops the factor the
// person scanned a moment ago, so a reload made their codes fail. Only the «Mostrar el código QR»
// button (mfaEnroll) enrolls. Also: the email code takes 6 to 10 digits, the app code exactly 6.
// Supabase is a fake here; the demo part runs for real against the in-memory database.
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import type { Session } from '@/lib/auth/session';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import { makeTestDb, type TestDb } from '../rls/setup';

const h = vi.hoisted(() => ({ session: null as unknown, supabase: null as unknown }));

vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ get: () => undefined, getAll: () => [], set: vi.fn(), delete: vi.fn() })) }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT ${to}`);
  }),
}));
vi.mock('@/lib/auth/session', () => ({ getSession: vi.fn(async () => h.session) }));
vi.mock('@/lib/supabase/server', () => ({ supabaseServer: vi.fn(async () => h.supabase) }));

type Factor = { id: string; status: 'verified' | 'unverified'; factor_type: string };

// The part of the Supabase Auth client these actions use, recording every call.
function fakeSupabase(factors: Factor[], opts: { enrollError?: boolean; listError?: boolean } = {}) {
  const calls = { list: 0, unenroll: [] as string[], enroll: 0, verifyOtp: [] as { token: string; type: string }[], challenge: [] as { factorId: string; code: string }[] };
  const auth = {
    mfa: {
      listFactors: async () => {
        calls.list++;
        if (opts.listError) return { data: null, error: { message: 'red' } };
        return { data: { all: factors, totp: factors.filter((f) => f.factor_type === 'totp' && f.status === 'verified'), phone: [] }, error: null };
      },
      unenroll: async ({ factorId }: { factorId: string }) => {
        calls.unenroll.push(factorId);
        return { data: { id: factorId }, error: null };
      },
      enroll: async () => {
        calls.enroll++;
        if (opts.enrollError) return { data: null, error: { message: 'no' } };
        return { data: { id: 'factor-nuevo', type: 'totp', totp: { qr_code: '<svg/>', secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/FB:persona?secret=JBSWY3DPEHPK3PXP&issuer=FB' } }, error: null };
      },
      challengeAndVerify: async (p: { factorId: string; code: string }) => {
        calls.challenge.push(p);
        return { data: {}, error: null };
      },
    },
    verifyOtp: async (p: { token: string; type: string }) => {
      calls.verifyOtp.push(p);
      return { data: {}, error: null };
    },
  };
  return { calls, client: { auth } };
}

function sessionFor(id: string, key: DemoUserKey, mfaOk = false): Session {
  const u = DEMO_USERS.find((x) => x.key === key)!;
  return {
    userId: id, email: u.email, name: u.name, roles: [...u.roles], aal: mfaOk ? 'aal2' : 'aal1', mfaRequired: true, mfaOk,
    claims: { sub: id, aal: mfaOk ? 'aal2' : 'aal1', role: 'authenticated' }, viewAs: null,
  };
}

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

it('la página usa la lectura (mfaStatus), nunca la acción que inscribe', () => {
  const page = fs.readFileSync(path.join(process.cwd(), 'src/app/(auth)/doble-factor/page.tsx'), 'utf8');
  expect(page).toContain('mfaStatus(');
  expect(page).not.toMatch(/mfaEnroll|mfaStart|@\/lib\/auth\/actions/);
});

describe('con Supabase', () => {
  let actions: typeof import('@/lib/auth/actions');
  let mfa: typeof import('@/lib/auth/mfa');

  beforeAll(async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://u:p@db.example.com:6543/postgres');
    vi.resetModules();
    actions = await import('@/lib/auth/actions');
    mfa = await import('@/lib/auth/mfa');
  });
  afterAll(() => {
    vi.unstubAllEnvs();
  });
  beforeEach(() => {
    h.session = sessionFor('00000000-0000-4000-8000-000000000002', 'boss');
  });

  it('dibujar la página solo lee: nunca inscribe ni borra factores', async () => {
    const fresh = fakeSupabase([{ id: 'a-medias', status: 'unverified', factor_type: 'totp' }]);
    h.supabase = fresh.client;
    expect(await mfa.mfaStatus('x')).toEqual({ enrolled: false });
    expect(await mfa.mfaStatus('x')).toEqual({ enrolled: false });
    expect(fresh.calls).toMatchObject({ unenroll: [], enroll: 0 });

    const done = fakeSupabase([{ id: 'listo', status: 'verified', factor_type: 'totp' }]);
    h.supabase = done.client;
    expect(await mfa.mfaStatus('x')).toEqual({ enrolled: true, factorId: 'listo' });
    expect(done.calls).toMatchObject({ unenroll: [], enroll: 0 });
  });

  it('el botón quita lo que quedó a medias, inscribe uno nuevo y devuelve el QR y la clave', async () => {
    const f = fakeSupabase([
      { id: 'viejo-1', status: 'unverified', factor_type: 'totp' },
      { id: 'viejo-2', status: 'unverified', factor_type: 'totp' },
    ]);
    h.supabase = f.client;
    const r = await actions.mfaEnroll();
    expect(f.calls.unenroll).toEqual(['viejo-1', 'viejo-2']);
    expect(f.calls.enroll).toBe(1);
    expect(r).toMatchObject({ factorId: 'factor-nuevo', secret: 'JBSWY3DPEHPK3PXP' });
    expect(r.qr).toMatch(/^data:image\/png;base64,/);
    expect(r.error).toBeUndefined();
  });

  it('con un factor ya activo el botón no toca nada', async () => {
    const f = fakeSupabase([
      { id: 'activo', status: 'verified', factor_type: 'totp' },
      { id: 'a-medias', status: 'unverified', factor_type: 'totp' },
    ]);
    h.supabase = f.client;
    expect(await actions.mfaEnroll()).toEqual({ enrolled: true });
    expect(f.calls).toMatchObject({ unenroll: [], enroll: 0 });
  });

  it('si Supabase falla, avisa en español y no inscribe a ciegas', async () => {
    const list = fakeSupabase([], { listError: true });
    h.supabase = list.client;
    expect((await actions.mfaEnroll()).error).toMatch(/No se pudo preparar el código QR/);
    expect(list.calls).toMatchObject({ unenroll: [], enroll: 0 });

    const enroll = fakeSupabase([], { enrollError: true });
    h.supabase = enroll.client;
    const r = await actions.mfaEnroll();
    expect(r.error).toMatch(/No se pudo preparar el código QR/);
    expect(r.qr).toBeUndefined();
  });

  it('sin sesión manda a entrar; con el doble factor hecho, al inicio', async () => {
    const f = fakeSupabase([]);
    h.supabase = f.client;
    h.session = null;
    await expect(actions.mfaEnroll()).rejects.toThrow('REDIRECT /entrar');
    h.session = sessionFor('00000000-0000-4000-8000-000000000002', 'boss', true);
    await expect(actions.mfaEnroll()).rejects.toThrow('REDIRECT /');
    expect(f.calls).toMatchObject({ list: 0, enroll: 0 });
  });

  it('el código del correo de 8 números llega a Supabase; uno de 5 no', async () => {
    const f = fakeSupabase([]);
    h.supabase = f.client;
    await expect(actions.verifyCode({}, form({ email: 'persona@ejemplo.test', code: '12345678' }))).rejects.toThrow('REDIRECT /');
    await expect(actions.verifyCode({}, form({ email: 'persona@ejemplo.test', code: '1234567890' }))).rejects.toThrow('REDIRECT /');
    expect(f.calls.verifyOtp).toMatchObject([
      { token: '12345678', type: 'email' },
      { token: '1234567890', type: 'email' },
    ]);
    expect(await actions.verifyCode({}, form({ email: 'persona@ejemplo.test', code: '12345' }))).toEqual({ error: 'Escribe el código completo que te llegó, solo con números.' });
    expect(await actions.verifyCode({}, form({ email: 'persona@ejemplo.test', code: '12345678901' }))).toMatchObject({ error: expect.any(String) });
    expect(f.calls.verifyOtp).toHaveLength(2);
  });

  it('el código de la aplicación sigue siendo de 6 números exactos', async () => {
    const f = fakeSupabase([]);
    h.supabase = f.client;
    expect(await actions.mfaVerify({}, form({ factorId: 'listo', code: '12345678' }))).toEqual({ error: 'El código tiene 6 números.' });
    expect(f.calls.challenge).toEqual([]);
    await expect(actions.mfaVerify({}, form({ factorId: 'listo', code: '123456' }))).rejects.toThrow('REDIRECT /');
    expect(f.calls.challenge).toEqual([{ factorId: 'listo', code: '123456' }]);
  });
});

describe('en la demostración', () => {
  let t: TestDb;
  let actions: typeof import('@/lib/auth/actions');
  let mfa: typeof import('@/lib/auth/mfa');
  const factors = (id: string) =>
    t.system((sql) => sql.query<{ secret: string; verified: boolean }>(`select secret, verified from demo_auth.totp_factors where user_id = $1`, [id]));

  beforeAll(async () => {
    vi.stubEnv('DATABASE_URL', '');
    vi.resetModules();
    t = await makeTestDb();
    (globalThis as { __fbBackend?: Promise<unknown> }).__fbBackend = Promise.resolve(t.backend);
    actions = await import('@/lib/auth/actions');
    mfa = await import('@/lib/auth/mfa');
  });
  afterAll(() => {
    vi.unstubAllEnvs();
    delete (globalThis as { __fbBackend?: Promise<unknown> }).__fbBackend;
  });

  it('dibujar la página no crea nada; el botón crea un factor y repite la misma clave hasta confirmarlo', async () => {
    const id = t.ids.dispatch;
    h.session = sessionFor(id, 'dispatch');
    expect(await mfa.mfaStatus(id)).toEqual({ enrolled: false });
    expect(await factors(id)).toEqual([]);

    const first = await actions.mfaEnroll();
    expect(first.secret).toMatch(/^[A-Z2-7]+$/);
    expect(first.qr).toMatch(/^data:image\/png;base64,/);
    expect(await factors(id)).toEqual([{ secret: first.secret, verified: false }]);
    expect((await actions.mfaEnroll()).secret).toBe(first.secret);
    expect(await mfa.mfaStatus(id)).toEqual({ enrolled: false });

    await t.system((sql) => sql.query(`update demo_auth.totp_factors set verified = true where user_id = $1`, [id]));
    expect(await mfa.mfaStatus(id)).toEqual({ enrolled: true });
    expect(await actions.mfaEnroll()).toEqual({ enrolled: true });
    expect(await factors(id)).toEqual([{ secret: first.secret, verified: true }]);
  });
});
