// An invitation naming the boss that Administración made BEFORE 20261028002350_boss_grant.sql (it could until then)
// is revoked by that migration: otherwise the person signing up with it would still get the boss's role, since the
// sign-up runs without a session and the guard lets the system through (D-58). The database is built up to the
// migration before it, the old invitations are written as the old screen wrote them, and then the rest run, as on a
// real project. All data here is invented.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import postgres from 'postgres';
import { asSystem, type Backend, type Row, type Sql } from '@/lib/db/core';
import { pgliteBackend } from '@/lib/db/pglite';
import { readMigrations, readShim } from '@/lib/db/migrations';

const FIRST_NEW = '20261028002350';

type Fresh = { backend: Backend; exec: (text: string) => Promise<void>; close: () => Promise<void> };

// PGlite by default; a throwaway database on TEST_DATABASE_URL when given (as tests/rls/retire-roles.test.ts does).
async function freshDb(): Promise<Fresh> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    const db = new PGlite();
    return { backend: pgliteBackend(db), exec: async (t) => void (await db.exec(t)), close: () => db.close() };
  }
  const admin = postgres(url, { max: 1, onnotice: () => {} });
  const name = `fb_bossinv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await admin.unsafe(`create database ${name}`);
  await admin.end();
  const u = new URL(url);
  u.pathname = `/${name}`;
  const client = postgres(u.toString(), { max: 2, onnotice: () => {} });
  const wrap = (tx: postgres.TransactionSql): Sql => ({
    query: async <T = Row>(t: string, p: unknown[] = []) => (await tx.unsafe(t, p as never[])) as unknown as T[],
    one: async <T = Row>(t: string, p: unknown[] = []) => ((await tx.unsafe(t, p as never[])) as unknown as T[])[0] ?? null,
  });
  return {
    backend: {
      transaction: (fn) => client.begin((tx) => fn(wrap(tx))) as Promise<never>,
      exec: async (t) => void (await client.unsafe(t)),
    },
    exec: async (t) => void (await client.unsafe(t)),
    close: () => client.end(),
  };
}

const ADMIN = '00000000-0000-4000-8000-0000000000b1';
let f: Fresh;
const sys = <T>(fn: (sql: Sql) => Promise<T>) => asSystem(f.backend, fn);
const rolesOf = async (email: string) =>
  (
    await sys((sql) =>
      sql.query<{ role: string }>(
        `select ur.role::text from public.user_roles ur join public.profiles p on p.id = ur.user_id where p.email = $1 order by 1`,
        [email],
      ),
    )
  ).map((r) => r.role);

beforeAll(async () => {
  f = await freshDb();
  await f.exec(readShim());
  const migrations = readMigrations();
  for (const m of migrations.filter((x) => x.name < FIRST_NEW)) await f.exec(m.sql);
  await sys(async (sql) => {
    // Administración, then what the old «Equipo» screen let it write: a boss invitation (alone and mixed), a team one;
    // and the system's own boss invitation (db:first-admin -- … --jefe, invited_by null).
    await sql.query(`insert into public.invitations (email, full_name, roles) values ('tecnica@prueba.test', 'Técnica (prueba)', '{admin}')`);
    await sql.query(`insert into auth.users (id, email) values ($1, 'tecnica@prueba.test')`, [ADMIN]);
    await sql.query(
      `insert into public.invitations (email, full_name, roles, invited_by) values
         ('otro.jefe@prueba.test', 'Otro Jefe (prueba)', '{boss}', $1),
         ('jefe.redes@prueba.test', 'Jefe y Redes (prueba)', '{boss,social}', $1),
         ('redes@prueba.test', 'Redes (prueba)', '{social}', $1)`,
      [ADMIN],
    );
    await sql.query(`insert into public.invitations (email, full_name, roles) values ('jefe@prueba.test', 'Jefe (prueba)', '{boss}')`);
  });
  for (const m of migrations.filter((x) => x.name >= FIRST_NEW)) await f.exec(m.sql);
}, 120_000);

afterAll(async () => {
  await f?.close();
});

describe('las invitaciones de jefe que hizo una persona antes de D-58', () => {
  it('quedan anuladas: quien entra con ellas no es el jefe; la del sistema y las del equipo siguen', async () => {
    const rows = await sys((sql) =>
      sql.query<{ email: string; revoked: boolean }>(`select email, revoked_at is not null as revoked from public.invitations order by email`),
    );
    expect(Object.fromEntries(rows.map((r) => [r.email, r.revoked]))).toEqual({
      'jefe.redes@prueba.test': true,
      'jefe@prueba.test': false,
      'otro.jefe@prueba.test': true,
      'redes@prueba.test': false,
      'tecnica@prueba.test': false,
    });
    for (const email of ['otro.jefe@prueba.test', 'jefe.redes@prueba.test', 'redes@prueba.test', 'jefe@prueba.test']) {
      await sys((sql) => sql.query(`insert into auth.users (email) values ($1)`, [email]));
    }
    expect(await rolesOf('otro.jefe@prueba.test')).toEqual([]);
    expect(await rolesOf('jefe.redes@prueba.test')).toEqual([]);
    expect(await rolesOf('redes@prueba.test')).toEqual(['social']);
    expect(await rolesOf('jefe@prueba.test')).toEqual(['boss']);
  });
});
