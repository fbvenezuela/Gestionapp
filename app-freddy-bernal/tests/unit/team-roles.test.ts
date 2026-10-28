// Equipo (Ajustes): Administración gives the roles, never to itself, and never Administración together with the boss
// or despacho in one account (only the boss approves; only the boss and despacho put dates). The screen says why
// (roleGrantProblem), the action refuses in Spanish before the database does, and the database refuses too
// (20261028002200_round_review_fixes.sql). The actions run for real against the in-memory database; the session is
// mocked. All data here is invented.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import type { Session } from '@/lib/auth/session';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import { BOSS_GRANT_MESSAGE, ROLE_MIX_MESSAGE, SELF_GRANT_MESSAGE, roleGrantProblem } from '@/lib/roles';
import { makeTestDb, type TestDb } from '../rls/setup';

const h = vi.hoisted(() => ({ session: null as unknown }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ requireSession: vi.fn(async () => h.session) }));
vi.mock('resend', () => ({ Resend: class { emails = { send: async () => ({ data: { id: 'stub' }, error: null }) }; } }));

let t: TestDb;
let team: typeof import('@/lib/actions/team');

beforeAll(async () => {
  t = await makeTestDb();
  (globalThis as { __fbBackend?: Promise<unknown> }).__fbBackend = Promise.resolve(t.backend);
  team = await import('@/lib/actions/team');
});

function as(key: DemoUserKey) {
  const u = DEMO_USERS.find((x) => x.key === key)!;
  h.session = {
    userId: t.ids[key], email: u.email, name: u.name, roles: [...u.roles], aal: 'aal2', mfaRequired: false, mfaOk: true,
    claims: { sub: t.ids[key], aal: 'aal2', role: 'authenticated' }, viewAs: null,
  } satisfies Session;
}
const rolesOf = async (key: DemoUserKey) =>
  (await t.system((sql) => sql.query<{ role: string }>(`select role::text from public.user_roles where user_id = $1 order by 1`, [t.ids[key]]))).map((r) => r.role);

describe('roleGrantProblem: lo que la pantalla de Equipo desactiva y por qué', () => {
  it('tus propios roles no; Administración con el jefe o el despacho, tampoco; lo demás, sí', () => {
    expect(roleGrantProblem({ isSelf: true, roles: ['admin'], role: 'boss' })).toBe(SELF_GRANT_MESSAGE);
    expect(roleGrantProblem({ isSelf: true, roles: ['admin'], role: 'social' })).toBe(SELF_GRANT_MESSAGE);
    expect(roleGrantProblem({ isSelf: true, roles: ['admin'], role: 'admin' })).toBeNull(); // already held: nothing to give
    expect(roleGrantProblem({ isSelf: false, roles: ['admin'], role: 'boss' })).toBe(ROLE_MIX_MESSAGE);
    expect(roleGrantProblem({ isSelf: false, roles: ['admin'], role: 'dispatch' })).toBe(ROLE_MIX_MESSAGE);
    expect(roleGrantProblem({ isSelf: false, roles: ['boss'], role: 'admin' })).toBe(ROLE_MIX_MESSAGE);
    expect(roleGrantProblem({ isSelf: false, roles: ['dispatch', 'social'], role: 'admin' })).toBe(ROLE_MIX_MESSAGE);
    expect(roleGrantProblem({ isSelf: false, roles: ['admin'], role: 'social' })).toBeNull();
    expect(roleGrantProblem({ isSelf: false, roles: ['boss'], role: 'dispatch' })).toBeNull();
    expect(roleGrantProblem({ isSelf: false, roles: [], role: 'admin' })).toBeNull();
  });
});

describe('setRole e inviteUser', () => {
  it('Administración no se da el rol del jefe ni del despacho (ni ningún otro): un no en español, y la base igual', async () => {
    as('admin');
    for (const role of ['boss', 'dispatch', 'social'] as const) {
      const r = await team.setRole({ userId: t.ids.admin, role, on: true });
      expect(r, role).toEqual({ ok: false, error: SELF_GRANT_MESSAGE });
    }
    // Nor through «Invitar» with its own email.
    const inv = await team.inviteUser({ email: 'admin@demo.test', fullName: 'Administración (demo)', role: 'boss' });
    expect(inv).toEqual({ ok: false, error: SELF_GRANT_MESSAGE });
    expect(await rolesOf('admin')).toEqual(['admin']);
  });

  it('no junta Administración con el jefe o el despacho en otra cuenta', async () => {
    as('admin');
    for (const who of ['boss', 'dispatch'] as const) {
      expect(await team.setRole({ userId: t.ids[who], role: 'admin', on: true }), who).toEqual({ ok: false, error: ROLE_MIX_MESSAGE });
      expect(await team.inviteUser({ email: DEMO_USERS.find((u) => u.key === who)!.email, fullName: 'Prueba (demo)', role: 'admin' }), who)
        .toEqual({ ok: false, error: ROLE_MIX_MESSAGE });
      expect(await rolesOf(who), who).toEqual([who]);
    }
  });

  it('lo demás sigue igual: dar y quitar Redes a Grabación, y quitar tu propio rol de Redes no se bloquea', async () => {
    as('admin');
    expect(await team.setRole({ userId: t.ids.camera2, role: 'social', on: true })).toMatchObject({ ok: true });
    expect(await rolesOf('camera2')).toEqual(['camera', 'social']);
    expect(await team.setRole({ userId: t.ids.camera2, role: 'social', on: false })).toMatchObject({ ok: true });
    expect(await rolesOf('camera2')).toEqual(['camera']);
    // Giving a role the person already has is not an error (the screen never sends it, a double tap might).
    expect(await team.setRole({ userId: t.ids.camera2, role: 'camera', on: true })).toMatchObject({ ok: true });
  });
});

// R3 (D-58): the boss reads every conversation and approves everything, so the role is given only by the system
// (the installation command, `npm run db:first-admin -- … --jefe`), never from «Equipo» or «Invitar».
describe('el rol de jefe solo lo da el comando de instalación', () => {
  it('roleGrantProblem: el jefe a otra cuenta, nunca; quien ya lo tiene, nada que dar; los motivos de antes, primero', () => {
    expect(roleGrantProblem({ isSelf: false, roles: ['camera'], role: 'boss' })).toBe(BOSS_GRANT_MESSAGE);
    expect(roleGrantProblem({ isSelf: false, roles: [], role: 'boss' })).toBe(BOSS_GRANT_MESSAGE);
    expect(roleGrantProblem({ isSelf: false, roles: ['boss'], role: 'boss' })).toBeNull();
    expect(roleGrantProblem({ isSelf: false, roles: ['camera'], role: 'social' })).toBeNull();
  });

  it('setRole e inviteUser dicen que no en español, antes que la base, y nada cambia', async () => {
    as('admin');
    expect(await team.setRole({ userId: t.ids.camera2, role: 'boss', on: true })).toEqual({ ok: false, error: BOSS_GRANT_MESSAGE });
    expect(await rolesOf('camera2')).toEqual(['camera']);
    // An existing account and a new one.
    expect(await team.inviteUser({ email: 'grabacion2@demo.test', fullName: 'Mariela Ostos', role: 'boss' })).toEqual({ ok: false, error: BOSS_GRANT_MESSAGE });
    expect(await team.inviteUser({ email: 'nuevo.jefe@demo.test', fullName: 'Jefe Inventado', role: 'boss' })).toEqual({ ok: false, error: BOSS_GRANT_MESSAGE });
    const inv = await t.system((sql) => sql.query(`select 1 from public.invitations where email = 'nuevo.jefe@demo.test'`));
    expect(inv).toEqual([]);
  });

  it('quitarle el rol de jefe a alguien sigue siendo de administración', async () => {
    as('admin');
    try {
      expect(await team.setRole({ userId: t.ids.boss, role: 'boss', on: false })).toMatchObject({ ok: true });
      expect(await rolesOf('boss')).toEqual([]);
      // And giving it back from «Equipo» is the command's, not the screen's.
      expect(await team.setRole({ userId: t.ids.boss, role: 'boss', on: true })).toEqual({ ok: false, error: BOSS_GRANT_MESSAGE });
    } finally {
      await t.system((sql) => sql.query(`insert into public.user_roles (user_id, role) values ($1, 'boss') on conflict do nothing`, [t.ids.boss]));
    }
    expect(await rolesOf('boss')).toEqual(['boss']);
  });
});
