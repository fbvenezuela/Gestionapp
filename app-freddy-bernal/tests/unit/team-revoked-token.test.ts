// With Supabase Auth, an access token is renewed from the refresh-token cookie and the new one
// has a fresh iat. getSession must still refuse it when its Auth session was opened before
// «Cerrar sus sesiones». Real getSession in Supabase mode against the in-memory database, with
// Supabase Auth's sessions table added and the token claims mocked.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { makeTestDb, type TestDb } from '../rls/setup';

const h = vi.hoisted(() => ({ claims: null as Record<string, unknown> | null }));

vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, getAll: () => [], set: () => {}, delete: () => {} }) }));
vi.mock('@/lib/supabase/server', () => ({ supabaseServer: async () => ({ auth: { getClaims: async () => ({ data: h.claims ? { claims: h.claims } : null }) } }) }));

let t: TestDb;
let getSession: typeof import('@/lib/auth/session').getSession;

beforeAll(async () => {
  t = await makeTestDb();
  (globalThis as { __fbBackend?: Promise<unknown> }).__fbBackend = Promise.resolve(t.backend);
  const { env } = await import('@/lib/env');
  env.dataMode = 'supabase';
  getSession = (await import('@/lib/auth/session')).getSession;
  await t.backend.exec(`create table auth.sessions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    created_at timestamptz default now()
  )`);
});

const now = () => Math.floor(Date.now() / 1000);
const openSession = (ago: string) =>
  t.system(async (sql) => (await sql.one<{ id: string }>(`insert into auth.sessions (user_id, created_at) values ($1, now() - $2::interval) returning id`, [t.ids.social2, ago]))!.id);
const token = (sessionId: string | undefined, iat: number) => {
  h.claims = { sub: t.ids.social2, email: 'redes2@demo.test', aal: 'aal2', role: 'authenticated', session_id: sessionId, iat };
};

describe('getSession con Supabase Auth', () => {
  it('después de «Cerrar sus sesiones», un token renovado de la sesión vieja no entra; una sesión nueva sí', async () => {
    const old = await openSession('2 hours');
    token(old, now() - 60);
    expect((await getSession())?.userId).toBe(t.ids.social2);

    await t.as('admin', (sql) => sql.query(`update public.profiles set sessions_revoked_at = now() - interval '1 second' where id = $1`, [t.ids.social2]));
    // The thief's phone renews its token: fresh iat, same session.
    token(old, now() + 5);
    expect(await getSession()).toBeNull();

    // The owner signs in again on the new phone: a new session.
    const fresh = await openSession('0 seconds');
    token(fresh, now());
    expect((await getSession())?.userId).toBe(t.ids.social2);
  });

  it('sin la sesión en la base, un token de antes del cierre no entra y uno de después sí', async () => {
    token(undefined, now() - 3600);
    expect(await getSession()).toBeNull();
    token('not-a-uuid', now() + 5);
    expect((await getSession())?.userId).toBe(t.ids.social2);
  });
});
