// The boss's role is given only by the system (20261028002350_boss_grant.sql, D-58): the boss reads every conversation
// in Mensajes and approves everything, so Administración no longer gives the role to another account, invites one as
// the boss, or changes an invitation that names the boss (other than revoking it). And every team role a person
// gives reaches the boss's bell, with the name and the role, never the email. Straight SQL as each demo person (RLS
// on), as an API client would. All data here is invented.
import { describe, expect, it, beforeAll } from 'vitest';
import { makeTestDb, type TestDb } from './setup';
import { friendlyDbError } from '@/lib/db/core';
import { ROLE_LABEL, type Role } from '@/lib/roles';

let t: TestDb;

const errorOf = async (p: Promise<unknown>): Promise<Error & { code?: string }> => {
  try {
    await p;
  } catch (e) {
    return e as Error & { code?: string };
  }
  throw new Error('expected an error');
};
const rolesOf = async (userId: string) =>
  (await t.system((sql) => sql.query<{ role: string }>(`select role::text from public.user_roles where user_id = $1 order by 1`, [userId]))).map((r) => r.role);
const bossNotices = () =>
  t.system((sql) =>
    sql.query<{ user_id: string; title: string; body: string; link: string }>(
      `select user_id, title, body, link from public.notifications where kind = 'team_role_granted' order by created_at, body`,
    ),
  );
// A person signs up (Supabase Auth inserts into auth.users without a session): the trigger copies the invitation.
const signUp = (email: string) => t.system((sql) => sql.one<{ id: string }>(`insert into auth.users (email) values ($1) returning id`, [email]));

beforeAll(async () => {
  t = await makeTestDb();
}, 120_000);

describe('el rol de jefe solo lo da el sistema', () => {
  it('B1: administración no le da el rol de jefe a otra cuenta, ni en la tabla', async () => {
    const e = await errorOf(t.as('admin', (sql) => sql.query(`insert into public.user_roles (user_id, role, granted_by) values ($1, 'boss', auth.uid())`, [t.ids.camera2])));
    expect(e.message).toMatch(/^El rol de jefe lo da el comando de instalación/);
    expect(friendlyDbError(e)).toMatch(/^El rol de jefe lo da el comando de instalación/);
    expect(await rolesOf(t.ids.camera2)).toEqual(['camera']);
    // What the policies already refused still reads as their refusal (the guard runs after them).
    const self = await errorOf(t.as('admin', (sql) => sql.query(`insert into public.user_roles (user_id, role) values (auth.uid(), 'boss')`)));
    expect(self.message).toMatch(/row-level security/);
    // Nobody else either.
    for (const who of ['boss', 'dispatch', 'social'] as const) {
      await expect(t.as(who, (sql) => sql.query(`insert into public.user_roles (user_id, role) values ($1, 'boss')`, [t.ids.camera2]))).rejects.toThrow();
    }
  });

  it('B2: ni invita como jefe, ni le suma el jefe a una invitación pendiente, ni cambia una que ya lo tenía', async () => {
    const insert = await errorOf(
      t.as('admin', (sql) => sql.query(`insert into public.invitations (email, full_name, roles, invited_by) values ('otro.jefe@demo.test', 'Otro Jefe', '{boss}', auth.uid())`)),
    );
    expect(insert.message).toMatch(/^El rol de jefe lo da el comando de instalación, no una invitación/);
    const mixed = await errorOf(
      t.as('admin', (sql) => sql.query(`insert into public.invitations (email, full_name, roles, invited_by) values ('otro.jefe@demo.test', 'Otro Jefe', '{boss,social}', auth.uid())`)),
    );
    expect(mixed.message).toMatch(/^El rol de jefe/);
    const pending = (await t.as('admin', (sql) =>
      sql.one<{ id: string }>(`insert into public.invitations (email, full_name, roles, invited_by) values ('pendiente.redes@demo.test', 'Pendiente Redes', '{social}', auth.uid()) returning id`),
    ))!.id;
    const add = await errorOf(t.as('admin', (sql) => sql.query(`update public.invitations set roles = '{social,boss}' where id = $1`, [pending])));
    expect(add.message).toMatch(/^Una invitación con el rol de jefe solo se anula/);
    // One the system made (the installation command): its email, its roles, its expiry, bringing it back: no.
    const sys = (await t.system((sql) => sql.one<{ id: string }>(`insert into public.invitations (email, full_name, roles) values ('jefe.sistema@demo.test', 'Jefe Sistema', '{boss}') returning id`)))!.id;
    for (const q of [
      `update public.invitations set email = 'amigo@demo.test' where id = $1`,
      `update public.invitations set roles = '{social}' where id = $1`,
      `update public.invitations set expires_at = now() + interval '60 days' where id = $1`,
    ]) {
      const e = await errorOf(t.as('admin', (sql) => sql.query(q, [sys])));
      expect(e.message, q).toMatch(/^Una invitación con el rol de jefe solo se anula/);
    }
    // Revoking it: yes, once.
    expect(await t.as('admin', (sql) => sql.query(`update public.invitations set revoked_at = now() where id = $1 returning id`, [sys]))).toHaveLength(1);
    const back = await errorOf(t.as('admin', (sql) => sql.query(`update public.invitations set revoked_at = null where id = $1`, [sys])));
    expect(back.message).toMatch(/^Una invitación con el rol de jefe solo se anula/);
    const row = await t.system((sql) => sql.one<{ email: string; roles: string[]; revoked: boolean }>(
      `select email, roles::text[] as roles, revoked_at is not null as revoked from public.invitations where id = $1`, [sys]));
    expect(row).toEqual({ email: 'jefe.sistema@demo.test', roles: ['boss'], revoked: true });
  });

  it('B3: el sistema sí: da el rol, y una invitación de jefe del sistema da el rol al darse de alta', async () => {
    await t.system((sql) => sql.query(`insert into public.invitations (email, full_name, roles) values ('jefe.alta@demo.test', 'Jefe Alta (demo)', '{boss}')`));
    const u = (await signUp('jefe.alta@demo.test'))!;
    expect(await rolesOf(u.id)).toEqual(['boss']);
    const other = (await signUp('jefe.directo@demo.test'))!;
    await t.system((sql) => sql.query(`insert into public.user_roles (user_id, role) values ($1, 'boss')`, [other.id]));
    expect(await rolesOf(other.id)).toEqual(['boss']);
  });

  it('B4: el sistema cambia una invitación que ya tenía el jefe (los roles no cambian)', async () => {
    const id = (await t.system((sql) => sql.one<{ id: string }>(`insert into public.invitations (email, full_name, roles) values ('jefe.vence@demo.test', 'Jefe Vence', '{boss}') returning id`)))!.id;
    await t.system((sql) => sql.query(`update public.invitations set expires_at = now() + interval '30 days' where id = $1`, [id]));
    const r = await t.system((sql) => sql.one<{ roles: string[]; ok: boolean }>(`select roles::text[] as roles, expires_at > now() + interval '20 days' as ok from public.invitations where id = $1`, [id]));
    expect(r).toEqual({ roles: ['boss'], ok: true });
  });

  it('quitarle el rol de jefe sigue siendo de administración (cerrar no abre nada)', async () => {
    const u = (await signUp('jefe.quitar@demo.test'))!;
    await t.system((sql) => sql.query(`insert into public.user_roles (user_id, role) values ($1, 'boss')`, [u.id]));
    expect(await t.as('admin', (sql) => sql.query(`delete from public.user_roles where user_id = $1 and role = 'boss' returning user_id`, [u.id]))).toHaveLength(1);
    expect(await rolesOf(u.id)).toEqual([]);
  });
});

describe('cada rol del equipo que da una persona le llega al jefe', () => {
  it('team_role_label() da los mismos nombres que la app (ROLE_LABEL)', async () => {
    const roles: Role[] = ['boss', 'dispatch', 'politics', 'ivt', 'camera', 'social', 'admin'];
    const rows = await t.as('boss', (sql) => sql.query<{ r: string; l: string }>(`select r, public.team_role_label(r) as l from unnest($1::text[]) r`, [roles]));
    expect(Object.fromEntries(rows.map((x) => [x.r, x.l]))).toEqual(Object.fromEntries(roles.map((r) => [r, ROLE_LABEL[r]])));
  });

  it('B5: administración da Grabación a una cuenta e invita a alguien como Redes: el jefe tiene los dos avisos, sin correo', async () => {
    const before = (await bossNotices()).length;
    await t.as('admin', (sql) => sql.query(`insert into public.user_roles (user_id, role, granted_by) values ($1, 'camera', auth.uid())`, [t.ids.social2]));
    await t.as('admin', (sql) =>
      sql.query(`insert into public.invitations (email, full_name, roles, invited_by) values ('redes.nueva@demo.test', 'Persona Nueva (demo)', '{social}', auth.uid())`),
    );
    const notes = (await bossNotices()).slice(before);
    expect(notes).toEqual(
      expect.arrayContaining([
        { user_id: t.ids.boss, title: 'Un rol nuevo en el equipo', body: 'Administración le dio el rol Grabación a Yorman Chacón.', link: '/mensajes/permisos' },
        { user_id: t.ids.boss, title: 'Alguien nuevo en el equipo', body: 'Administración invitó a Persona Nueva (demo) como Redes.', link: '/mensajes/permisos' },
      ]),
    );
    // Only to the boss, and never an email (not even the part before the @).
    const boss = new Set([t.ids.boss, ...(await t.system((sql) => sql.query<{ user_id: string }>(`select user_id from public.user_roles where role = 'boss'`))).map((r) => r.user_id)]);
    for (const n of notes) {
      expect(boss.has(n.user_id)).toBe(true);
      expect(JSON.stringify(n)).not.toMatch(/@|redes\.nueva|redes2/);
    }
    // Administración itself (a technical role, not of the team) gives no notice.
    const quiet = (await bossNotices()).length;
    const x = (await signUp('tecnico.nuevo@demo.test'))!;
    await t.as('admin', (sql) => sql.query(`insert into public.user_roles (user_id, role) values ($1, 'admin')`, [x.id]));
    expect((await bossNotices()).length).toBe(quiet);
    await t.system((sql) => sql.query(`delete from public.user_roles where user_id = $1 and role = 'camera'`, [t.ids.social2]));
  });

  it('B6: lo que da el sistema (la semilla, el alta de una invitación) no avisa', async () => {
    // The seed gave every demo role: none of it reached the bell.
    const fresh = await makeTestDb();
    const n = await fresh.system((sql) => sql.one<{ n: number }>(`select count(*)::int as n from public.notifications where kind = 'team_role_granted'`));
    expect(n!.n).toBe(0);
    const before = (await bossNotices()).length;
    await t.system((sql) => sql.query(`insert into public.invitations (email, full_name, roles) values ('sistema.redes@demo.test', 'Sistema Redes', '{social}')`));
    await signUp('sistema.redes@demo.test');
    expect((await bossNotices()).length).toBe(before);
  }, 120_000);

  it('B7: administración no lee los avisos del jefe', async () => {
    expect((await bossNotices()).length).toBeGreaterThan(0);
    expect(await t.as('admin', (sql) => sql.query(`select 1 from public.notifications where kind = 'team_role_granted'`))).toEqual([]);
    expect((await t.as('boss', (sql) => sql.query(`select 1 from public.notifications where kind = 'team_role_granted'`))).length).toBeGreaterThan(0);
  });

  it('las funciones nuevas: nadie anónimo las ejecuta, y los disparadores nadie', async () => {
    const rows = await t.system((sql) =>
      sql.query<{ f: string; anon: boolean; auth: boolean }>(
        `select p.proname as f, has_function_privilege('anon', p.oid, 'EXECUTE') as anon, has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname in ('guard_boss_grant', 'notify_team_role_grant', 'team_role_label') order by 1`,
      ),
    );
    expect(rows).toEqual([
      { f: 'guard_boss_grant', anon: false, auth: false },
      { f: 'notify_team_role_grant', anon: false, auth: false },
      { f: 'team_role_label', anon: false, auth: true },
    ]);
  });
});
