// Closing someone's sessions must also kill their Supabase refresh tokens and their phones'
// notices (lost phone). The actions run for real against the in-memory database; the session
// is mocked. The demo shim has no auth.sessions: first we check that the step is a no-op there,
// then we add the two Supabase Auth tables (same shape and cascade) and check what goes.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import type { Session } from '@/lib/auth/session';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import { makeTestDb, type TestDb } from '../rls/setup';

const h = vi.hoisted(() => ({ session: null as unknown }));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ requireSession: vi.fn(async () => h.session) }));

let t: TestDb;
let team: typeof import('@/lib/actions/team');
let revoke: typeof import('@/lib/auth/revoke');

beforeAll(async () => {
  t = await makeTestDb();
  (globalThis as { __fbBackend?: Promise<unknown> }).__fbBackend = Promise.resolve(t.backend);
  team = await import('@/lib/actions/team');
  revoke = await import('@/lib/auth/revoke');
});

function as(key: DemoUserKey) {
  const u = DEMO_USERS.find((x) => x.key === key)!;
  h.session = {
    userId: t.ids[key], email: u.email, name: u.name, roles: [...u.roles], aal: 'aal2', mfaRequired: false, mfaOk: true,
    claims: { sub: t.ids[key], aal: 'aal2', role: 'authenticated' }, viewAs: null,
  } satisfies Session;
}

// The part of Supabase Auth's schema this code touches.
const AUTH_TABLES = `
  create table auth.sessions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    created_at timestamptz default now()
  );
  create table auth.refresh_tokens (
    id bigserial primary key,
    token varchar(255) unique,
    user_id varchar(255),
    revoked boolean default false,
    session_id uuid references auth.sessions (id) on delete cascade
  );`;

const KEY = 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM';
const AUTH = 'tBHItJI5svbpez7KI4CCXg';

// A signed-in phone: an Auth session with its refresh token, plus its push subscription.
async function signedInPhone(key: DemoUserKey, name: string) {
  await t.system(async (sql) => {
    const s = await sql.one<{ id: string }>(`insert into auth.sessions (user_id, created_at) values ($1, now() - interval '2 hours') returning id`, [t.ids[key]]);
    await sql.query(`insert into auth.refresh_tokens (token, user_id, session_id) values ($1, $2, $3)`, [`rt-${name}`, t.ids[key], s!.id]);
  });
  await t.as(key, (sql) => sql.query(`select public.save_push_subscription($1, $2, $3, '')`, [`https://fcm.googleapis.com/fcm/send/${name}`, KEY, AUTH]));
}

const left = (key: DemoUserKey) =>
  t.system((sql) =>
    sql.one<{ sessions: number; tokens: number; phones: number }>(
      `select (select count(*)::int from auth.sessions where user_id = $1) as sessions,
              (select count(*)::int from auth.refresh_tokens where user_id = $1::text) as tokens,
              (select count(*)::int from public.push_subscriptions where user_id = $1) as phones`,
      [t.ids[key]],
    ),
  );

describe('cerrar sesiones', () => {
  it('sin las tablas de Supabase Auth (demo) el paso no hace nada y la acción sigue igual', async () => {
    expect(await revoke.endAuthSessions(t.ids.social2)).toBe(0);
    as('admin');
    expect(await team.revokeSessions({ userId: t.ids.social2 })).toEqual({ ok: true, data: undefined });
  });

  it('borra las sesiones y los tokens de renovación de esa persona, y nada de las demás', async () => {
    await t.backend.exec(AUTH_TABLES);
    await signedInPhone('social2', 'lost');
    await signedInPhone('social2', 'tablet');
    await signedInPhone('social', 'other');
    expect(await revoke.endAuthSessions(t.ids.social2)).toBe(2);
    expect(await left('social2')).toMatchObject({ sessions: 0, tokens: 0 });
    expect(await left('social')).toMatchObject({ sessions: 1, tokens: 1 });
  });

  it('«Cerrar sus sesiones»: sin sesiones, sin tokens y sin avisos en el teléfono perdido', async () => {
    await signedInPhone('social2', 'lost-2');
    as('admin');
    expect((await team.revokeSessions({ userId: t.ids.social2 })).ok).toBe(true);
    expect(await left('social2')).toEqual({ sessions: 0, tokens: 0, phones: 0 });
    expect(await left('social')).toEqual({ sessions: 1, tokens: 1, phones: 1 });
  });

  it('si no le toca (redes), no se cierra nada', async () => {
    await signedInPhone('social2', 'kept');
    as('social');
    expect((await team.revokeSessions({ userId: t.ids.social2 })).ok).toBe(false);
    expect(await left('social2')).toEqual({ sessions: 1, tokens: 1, phones: 1 });
  });

  it('«Reiniciar doble factor» también cierra sus sesiones y quita sus teléfonos', async () => {
    await t.system((sql) => sql.query(`insert into demo_auth.totp_factors (user_id, secret, verified) values ($1, 'SECRETODEPRUEBA', true) on conflict do nothing`, [t.ids.social2]));
    as('admin');
    expect((await team.resetTwoFactor({ userId: t.ids.social2 })).ok).toBe(true);
    expect(await left('social2')).toEqual({ sessions: 0, tokens: 0, phones: 0 });
    const audit = await t.system((sql) =>
      sql.one<{ new_data: { auth_sessions_ended: number } }>(`select new_data from public.audit_log where table_name = 'two_factor' and row_id = $1 order by id desc limit 1`, [t.ids.social2]),
    );
    expect(audit?.new_data.auth_sessions_ended).toBe(1);
  });

  it('desactivar a alguien también le cierra las sesiones (si vuelve, el token viejo no sirve)', async () => {
    await signedInPhone('social2', 'off');
    as('admin');
    try {
      expect((await team.setActive({ userId: t.ids.social2, active: false })).ok).toBe(true);
      expect(await left('social2')).toEqual({ sessions: 0, tokens: 0, phones: 0 });
    } finally {
      expect((await team.setActive({ userId: t.ids.social2, active: true })).ok).toBe(true);
    }
  });

  it('si no le toca (redes), desactivar a otra persona no le cierra nada', async () => {
    await signedInPhone('boss', 'boss');
    await signedInPhone('social2', 'kept-2');
    as('social');
    expect(await team.setActive({ userId: t.ids.boss, active: false })).toEqual({ ok: false, error: 'No autorizado.' });
    expect(await left('boss')).toEqual({ sessions: 1, tokens: 1, phones: 1 });
    expect(await team.setActive({ userId: t.ids.social2, active: false })).toEqual({ ok: false, error: 'No autorizado.' });
    expect(await left('social2')).toEqual({ sessions: 1, tokens: 1, phones: 1 });
    const off = await t.system((sql) => sql.one<{ n: number }>(`select count(*)::int as n from public.profiles where id in ($1, $2) and not active`, [t.ids.boss, t.ids.social2]));
    expect(off?.n).toBe(0);
  });
});

describe('revokedSession', () => {
  const cut = '2026-10-24T12:00:00Z';
  const at = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);
  it('sin cierre, todo vale', () => {
    expect(revoke.revokedSession(null, at('2026-10-24T10:00:00Z'), '2026-10-24T09:00:00Z')).toBe(false);
  });
  it('un token renovado después del cierre (iat nuevo) de una sesión vieja no vale', () => {
    expect(revoke.revokedSession(cut, at('2026-10-24T12:30:00Z'), '2026-10-24T09:00:00Z')).toBe(true);
  });
  it('una sesión abierta después del cierre vale', () => {
    expect(revoke.revokedSession(cut, at('2026-10-24T12:31:00Z'), '2026-10-24T12:30:00Z')).toBe(false);
  });
  it('sin la sesión, decide la hora del token', () => {
    expect(revoke.revokedSession(cut, at('2026-10-24T11:00:00Z'), null)).toBe(true);
    expect(revoke.revokedSession(cut, at('2026-10-24T12:30:00Z'), null)).toBe(false);
  });
});
