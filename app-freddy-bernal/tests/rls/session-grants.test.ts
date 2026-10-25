// Supabase mode with a DATABASE_URL role that is NOT a superuser and has no grant on auth.sessions
// (still «por confirmar» in fb-dev). getSession must keep working: the session's start comes from
// the SECURITY DEFINER function; and if even that call fails, the request is decided by the token's
// iat (logged), never a 500 on every page and never a token the iat check would refuse. And the
// admin's «Reiniciar doble factor» / «Cerrar sus sesiones» still do their part when that role
// cannot delete the Auth sessions.
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import type { Backend } from '@/lib/db/core';
import type { Session } from '@/lib/auth/session';
import { makeTestDb, type TestDb } from './setup';

const h = vi.hoisted(() => ({ claims: null as Record<string, unknown> | null, session: null as unknown, factorsDeleted: 0 }));

vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, getAll: () => [], set: () => {}, delete: () => {} }) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  supabaseServer: async () => ({ auth: { getClaims: async () => ({ data: h.claims ? { claims: h.claims } : null }) } }),
  supabaseAdmin: () => ({
    auth: {
      admin: {
        mfa: {
          listFactors: async () => ({ data: { factors: [{ id: 'factor-1' }] }, error: null }),
          deleteFactor: async () => {
            h.factorsDeleted++;
            return { error: null };
          },
        },
      },
    },
  }),
}));
// The actions' own session (act → requireSession); getSession stays the real one.
vi.mock('@/lib/auth/session', async (orig) => ({ ...(await orig<typeof import('@/lib/auth/session')>()), requireSession: vi.fn(async () => h.session) }));

let t: TestDb;
let getSession: typeof import('@/lib/auth/session').getSession;

// Every app transaction runs as `app_runtime`, like the app's connection role would.
function asRuntime(base: Backend): Backend {
  return {
    transaction: (fn) =>
      base.transaction(async (sql) => {
        await sql.query('set local role app_runtime');
        return fn(sql);
      }),
    exec: (text) => base.exec(text),
  };
}

beforeAll(async () => {
  t = await makeTestDb();
  await t.backend.exec(`
    do $$ begin
      -- Roles are server-wide and the RLS files run in parallel on a real Postgres.
      begin create role app_runtime nologin bypassrls; exception when duplicate_object or unique_violation then null; end;
    end $$;
    grant authenticated to app_runtime;
    grant all on all tables in schema public to app_runtime;
    grant usage, select on all sequences in schema public to app_runtime;
    -- It is not the function's owner here: it gets EXECUTE, as the migration says to do.
    grant execute on function public.auth_session_started(uuid) to app_runtime;`);
  (globalThis as { __fbBackend?: Promise<unknown> }).__fbBackend = Promise.resolve(asRuntime(t.backend));
  const { env } = await import('@/lib/env');
  env.dataMode = 'supabase';
  getSession = (await import('@/lib/auth/session')).getSession;
});
afterEach(() => vi.restoreAllMocks());

const now = () => Math.floor(Date.now() / 1000);
const token = (sessionId: string | undefined, iat: number) => {
  h.claims = { sub: t.ids.social2, email: 'redes2@demo.test', aal: 'aal2', role: 'authenticated', session_id: sessionId, iat };
};
const openSession = (ago: string) =>
  t.system(async (sql) => (await sql.one<{ id: string }>(`insert into auth.sessions (user_id, created_at) values ($1, now() - $2::interval) returning id`, [t.ids.social2, ago]))!.id);
const revokeNow = () =>
  t.as('admin', (sql) => sql.query(`update public.profiles set sessions_revoked_at = now() - interval '1 second' where id = $1`, [t.ids.social2]));

describe('getSession sin permiso directo sobre auth.sessions', () => {
  it('sin la tabla de sesiones (como la demo), entra con su token y decide la hora del token', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    token(crypto.randomUUID(), now());
    expect((await getSession())?.userId).toBe(t.ids.social2);
    expect(err).not.toHaveBeenCalled();
  });

  it('con la tabla y sin permiso: la función lee el inicio de la sesión y el token renovado de la sesión vieja no entra', async () => {
    await t.backend.exec(`create table auth.sessions (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references auth.users (id) on delete cascade,
      created_at timestamptz default now()
    )`);
    // The role really cannot read the table.
    expect(await t.system((sql) => sql.one<{ ok: boolean }>(`select has_table_privilege('app_runtime', 'auth.sessions', 'SELECT') as ok`))).toEqual({ ok: false });
    await expect(t.backend.transaction(async (sql) => {
      await sql.query('set local role app_runtime');
      return sql.query('select 1 from auth.sessions');
    })).rejects.toThrow(/permission denied/);

    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const old = await openSession('2 hours');
    token(old, now() - 60);
    expect((await getSession())?.userId).toBe(t.ids.social2);
    await revokeNow();
    token(old, now() + 5); // renewed: fresh iat, same session
    expect(await getSession()).toBeNull();
    const fresh = await openSession('0 seconds');
    token(fresh, now());
    expect((await getSession())?.userId).toBe(t.ids.social2);
    expect(err).not.toHaveBeenCalled();
  });

  it('si la consulta del inicio falla, decide la hora del token (y lo anota): ni caída ni un token viejo adentro', async () => {
    await t.backend.exec(`revoke execute on function public.auth_session_started(uuid) from app_runtime`);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await revokeNow();
    const old = await openSession('2 hours');
    // A token issued before the cut: the iat check refuses it.
    token(old, now() - 3600);
    expect(await getSession()).toBeNull();
    // A token issued after the cut gets in (the renewed-token case needs the lookup: logged).
    token(old, now() + 5);
    expect((await getSession())?.userId).toBe(t.ids.social2);
    expect(err).toHaveBeenCalledWith(expect.stringContaining('[session]'), expect.stringMatching(/permission denied/));
  });
});

describe('acciones de administración sin DELETE sobre auth.sessions', () => {
  const PARTIAL = 'No se pudieron borrar sus sesiones en Supabase, pero la app ya no las acepta.';

  it('«Reiniciar doble factor» quita el doble factor igual y anota el error; «Cerrar sus sesiones» dice que se hizo', async () => {
    const team = await import('@/lib/actions/team');
    h.session = {
      userId: t.ids.admin, email: 'admin@demo.test', name: 'Admin', roles: ['admin'], aal: 'aal2', mfaRequired: true, mfaOk: true,
      claims: { sub: t.ids.admin, aal: 'aal2', role: 'authenticated' }, viewAs: null,
    } satisfies Session;
    await openSession('1 hour');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const reset = await team.resetTwoFactor({ userId: t.ids.social2 });
    expect(reset).toEqual({ ok: true, message: `Listo. La próxima vez que entre, tendrá que activar el doble factor otra vez. ${PARTIAL}` });
    expect(h.factorsDeleted).toBe(1);
    const audit = await t.system((sql) =>
      sql.one<{ new_data: Record<string, unknown> }>(`select new_data from public.audit_log where table_name = 'two_factor' and row_id = $1 order by id desc limit 1`, [t.ids.social2]),
    );
    expect(audit?.new_data).toMatchObject({ factors_removed: 1, auth_sessions_ended: null, auth_sessions_error: expect.stringMatching(/permission denied/) });

    expect(await team.revokeSessions({ userId: t.ids.social2 })).toEqual({ ok: true, data: undefined, message: `Listo. ${PARTIAL}` });
    const left = await t.system((sql) => sql.one<{ n: number }>(`select count(*)::int as n from auth.sessions where user_id = $1`, [t.ids.social2]));
    expect(left?.n).toBeGreaterThan(0); // they really could not be deleted
  });
});
