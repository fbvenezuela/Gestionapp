// Six roles (20261027001500_roles_enum.sql + 20261027001600_six_roles.sql) on a database that already has
// Secretaría and Supervisión política in use: the retired roles go, the history stays. The database is built up to
// the migration before the enum, legacy data is written the way the old platform wrote it, and then the rest of the
// migrations run, as they would on a real project.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import postgres from 'postgres';
import { asSystem, asUser, type Backend, type Row, type Sql } from '@/lib/db/core';
import { pgliteBackend } from '@/lib/db/pglite';
import { readMigrations, readShim } from '@/lib/db/migrations';
import { EVENT_ORIGIN } from '@/lib/data/labels';
import fs from 'node:fs';
import path from 'node:path';

const FIRST_NEW = '20261027001500';
const KEY = 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM';
const AUTH = 'tBHItJI5svbpez7KI4CCXg';

type Fresh = { backend: Backend; exec: (text: string) => Promise<void>; close: () => Promise<void> };

// PGlite by default; a throwaway database on TEST_DATABASE_URL when given (as tests/rls/setup.ts does).
async function freshDb(): Promise<Fresh> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    const db = new PGlite();
    return { backend: pgliteBackend(db), exec: async (t) => void (await db.exec(t)), close: () => db.close() };
  }
  const admin = postgres(url, { max: 1, onnotice: () => {} });
  const name = `fb_retire_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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

const ID = {
  admin: '00000000-0000-4000-8000-0000000000a1',
  boss: '00000000-0000-4000-8000-0000000000a2',
  social: '00000000-0000-4000-8000-0000000000a3',
  secretary: '00000000-0000-4000-8000-0000000000a4',
  supervisor: '00000000-0000-4000-8000-0000000000a5',
  supSocial: '00000000-0000-4000-8000-0000000000a6',
} as const;
type Who = keyof typeof ID;

let f: Fresh;
const sys = <T>(fn: (sql: Sql) => Promise<T>) => asSystem(f.backend, fn);
const as = <T>(who: Who, fn: (sql: Sql) => Promise<T>, aal: 'aal1' | 'aal2' = 'aal2') => asUser(f.backend, { sub: ID[who], aal }, fn);
const legacy: { event?: string; piece?: string; tweet?: string; draftTweet?: string; greenPiece?: string } = {};

beforeAll(async () => {
  f = await freshDb();
  await f.exec(readShim());
  const migrations = readMigrations();
  for (const m of migrations.filter((x) => x.name < FIRST_NEW)) await f.exec(m.sql);

  // The old platform: people invited with the old roles, then signed up.
  await sys(async (sql) => {
    await sql.query(`insert into public.app_settings (key, value) values ('security.mfa_roles', '["admin","boss","dispatch","supervisor","complaints_operator"]')`);
    const people: [Who, string, string[]][] = [
      ['admin', 'Administración (prueba)', ['admin']],
      ['boss', 'Jefe (prueba)', ['boss']],
      ['social', 'Redes (prueba)', ['social']],
      ['secretary', 'Secretaría (prueba)', ['secretary']],
      ['supervisor', 'Supervisión (prueba)', ['supervisor']],
      ['supSocial', 'Supervisión y Redes (prueba)', ['supervisor', 'social']],
    ];
    for (const [who, name, roles] of people) {
      await sql.query(`insert into public.invitations (email, full_name, roles) values ($1, $2, $3::public.app_role[])`, [`${who}@prueba.test`, name, `{${roles.join(',')}}`]);
      await sql.query(`insert into auth.users (id, email) values ($1, $2)`, [ID[who], `${who}@prueba.test`]);
    }
    // Pending invitations: one keeps a team role, one had only a retired role.
    await sql.query(`insert into public.invitations (email, full_name, roles) values ('mixta@prueba.test', 'Mixta', '{secretary,social}'), ('solo@prueba.test', 'Solo', '{supervisor}')`);
    // The team's own assistant fichas.
    await sql.query(
      `insert into public.assistant_knowledge (key, roles, title, body, origin) values
         ('equipo:sup', '{supervisor}', 'Solo para supervisión', 'Texto de prueba.', 'equipo'),
         ('equipo:mix', '{supervisor,social}', 'Para supervisión y redes', 'Texto de prueba.', 'equipo')`,
    );
  });
  // Secretaría proposed an event; Supervisión approved a piece and a tweet, and left a green piece and a draft
  // tweet waiting; the ex-supervisor has a phone subscribed.
  legacy.event = (await as('secretary', (sql) =>
    sql.one<{ id: string }>(`insert into public.events (title, place_name, created_by) values ('Propuesta de Secretaría (prueba)', 'Sitio inventado', auth.uid()) returning id`),
  ))!.id;
  const piece = async (title: string, level: string) => {
    const id = (await as('social', (sql) => sql.one<{ id: string }>(`insert into public.pieces (kind, title, review_level) values ('video', $1, $2) returning id`, [title, level])))!.id;
    await as('social', async (sql) => {
      await sql.query(`insert into public.piece_versions (piece_id, version) values ($1, 1)`, [id]);
      await sql.query(`update public.pieces set current_version = 1 where id = $1`, [id]);
      await sql.query(`update public.pieces set status = 'in_review' where id = $1`, [id]);
    });
    return id;
  };
  legacy.piece = await piece('Pieza aprobada por Supervisión (prueba)', 'amarillo');
  await as('supervisor', (sql) => sql.query(`select public.review_piece($1, 'approved', 'Aprobada.')`, [legacy.piece]));
  legacy.greenPiece = await piece('Pieza verde que esperaba a Supervisión (prueba)', 'verde');
  await as('social', async (sql) => {
    const b = await sql.one<{ id: string }>(`insert into public.tweet_batches (title) values ('Tanda de prueba') returning id`);
    legacy.tweet = (await sql.one<{ id: string }>(`insert into public.tweets (batch_id, position, body) values ($1, 0, 'Tweet aprobado por Supervisión.') returning id`, [b!.id]))!.id;
    legacy.draftTweet = (await sql.one<{ id: string }>(`insert into public.tweets (batch_id, position, body) values ($1, 1, 'Tweet que esperaba a Supervisión.') returning id`, [b!.id]))!.id;
  });
  await as('supervisor', (sql) => sql.query(`update public.tweets set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = $1`, [legacy.tweet]));
  for (const who of ['supervisor', 'supSocial'] as const) {
    await as(who, (sql) => sql.query(`select public.save_push_subscription($1, $2, $3, '')`, [`https://fcm.googleapis.com/fcm/send/${who}`, KEY, AUTH]));
  }

  // Now the six roles arrive.
  for (const m of migrations.filter((x) => x.name >= FIRST_NEW)) await f.exec(m.sql);
}, 120_000);

afterAll(async () => {
  await f?.close();
});

describe('se retiran Secretaría y Supervisión política sin perder historia', () => {
  it('nadie queda con un rol retirado, y cada rol quitado queda en el registro', async () => {
    const left = await sys((sql) => sql.query(`select user_id, role::text from public.user_roles where role::text in ('secretary', 'supervisor')`));
    expect(left).toEqual([]);
    const deleted = await sys((sql) =>
      sql.query<{ who: string; role: string }>(
        `select old_data ->> 'user_id' as who, old_data ->> 'role' as role from public.audit_log
          where table_name = 'user_roles' and action = 'delete' order by 1, 2`,
      ),
    );
    expect(deleted).toEqual(
      [
        { who: ID.secretary, role: 'secretary' },
        { who: ID.supervisor, role: 'supervisor' },
        { who: ID.supSocial, role: 'supervisor' },
      ].sort((a, b) => a.who.localeCompare(b.who)),
    );
    const summary = await sys((sql) => sql.one<{ new_data: Record<string, unknown> }>(`select new_data from public.audit_log where action = 'roles_retired'`));
    expect(summary!.new_data).toMatchObject({ roles: ['secretary', 'supervisor'], role_rows: 3, people_left_without_role: 2, pending_invitations: 2 });
  });

  it('quien tenía otro rol lo conserva', async () => {
    const roles = await sys((sql) => sql.query<{ role: string }>(`select role::text from public.user_roles where user_id = $1`, [ID.supSocial]));
    expect(roles).toEqual([{ role: 'social' }]);
  });

  it('lo que propuso Secretaría sigue nombrando a quien lo propuso', async () => {
    const ev = await sys((sql) => sql.one<{ created_by: string; deleted_at: unknown }>(`select created_by, deleted_at from public.events where id = $1`, [legacy.event]));
    expect(ev).toEqual({ created_by: ID.secretary, deleted_at: null });
  });

  // Spec §2: what Secretaría proposed reads «propuesto por Despacho». events.origin (default 'dispatch',
  // 20261027002000_shared_agenda.sql) says it, while created_by keeps the real author; the screens read origin.
  it('lo que propuso Secretaría se lee «propuesto por Despacho» (events.origin = dispatch)', async () => {
    const ev = await sys((sql) => sql.one<{ origin: string; created_by: string; kind: string }>(`select origin, created_by, kind from public.events where id = $1`, [legacy.event]));
    expect(ev).toEqual({ origin: 'dispatch', created_by: ID.secretary, kind: 'event' });
    expect(EVENT_ORIGIN[ev!.origin]).toBe('Propuesto por Despacho');
    // The event page shows the origin label, never who created it.
    const page = fs.readFileSync(path.join('src', 'app', '(panel)', 'eventos', '[id]', 'page.tsx'), 'utf8');
    expect(page).toContain('EVENT_ORIGIN[ev.origin]');
    expect(page).not.toMatch(/created_by(_name)?\b(?!:)/);
  });

  it('lo que aprobó Supervisión queda con su autor, y el jefe y Redes ven su nombre', async () => {
    const p = await sys((sql) => sql.one<{ status: string; approved_by: string }>(`select status, approved_by from public.pieces where id = $1`, [legacy.piece]));
    expect(p).toEqual({ status: 'approved', approved_by: ID.supervisor });
    const r = await sys((sql) => sql.query<{ reviewer_id: string }>(`select reviewer_id from public.reviews where piece_id = $1`, [legacy.piece]));
    expect(r).toEqual([{ reviewer_id: ID.supervisor }]);
    const tw = await sys((sql) => sql.one<{ approved_by: string }>(`select approved_by from public.tweets where id = $1`, [legacy.tweet]));
    expect(tw!.approved_by).toBe(ID.supervisor);
    for (const who of ['boss', 'social'] as const) {
      const name = await as(who, (sql) => sql.one<{ full_name: string }>(`select full_name from public.profiles where id = $1`, [ID.supervisor]));
      expect(name?.full_name, who).toBe('Supervisión (prueba)');
    }
  });

  it('las invitaciones pendientes pierden el rol retirado; la que quedó vacía se anula; las usadas no cambian', async () => {
    const inv = await sys((sql) =>
      sql.query<{ email: string; roles: string; revoked: boolean; accepted: boolean }>(
        `select email, roles::text as roles, revoked_at is not null as revoked, accepted_at is not null as accepted from public.invitations order by email`,
      ),
    );
    const by = Object.fromEntries(inv.map((i) => [i.email, i]));
    expect(by['mixta@prueba.test']).toMatchObject({ roles: '{social}', revoked: false });
    expect(by['solo@prueba.test']).toMatchObject({ revoked: true });
    expect(by['secretary@prueba.test']).toMatchObject({ roles: '{secretary}', accepted: true, revoked: false });
  });

  it('a quien se quedó sin rol se le cierran las sesiones y se le quitan los teléfonos', async () => {
    const p = await sys((sql) =>
      sql.query<{ id: string; closed: boolean; active: boolean }>(
        `select id, sessions_revoked_at is not null as closed, active from public.profiles where id = any($1::uuid[]) order by id`,
        [[ID.secretary, ID.supervisor, ID.supSocial]],
      ),
    );
    expect(p).toEqual([
      { id: ID.secretary, closed: true, active: true },
      { id: ID.supervisor, closed: true, active: true },
      { id: ID.supSocial, closed: false, active: true },
    ]);
    const phones = await sys((sql) => sql.query<{ user_id: string }>(`select user_id from public.push_subscriptions order by user_id`));
    expect(phones).toEqual([{ user_id: ID.supSocial }]);
  });

  it('lo que esperaba a Supervisión ahora lo aprueba el jefe', async () => {
    await expect(as('supSocial', (sql) => sql.query(`select public.review_piece($1, 'approved')`, [legacy.greenPiece]))).rejects.toThrow();
    await as('boss', (sql) => sql.query(`select public.review_piece($1, 'approved')`, [legacy.greenPiece]));
    const p = await sys((sql) => sql.one<{ status: string; approved_by: string }>(`select status, approved_by from public.pieces where id = $1`, [legacy.greenPiece]));
    expect(p).toEqual({ status: 'approved', approved_by: ID.boss });
    const ok = await as('boss', (sql) => sql.query(`update public.tweets set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = $1 returning id`, [legacy.draftTweet]));
    expect(ok).toHaveLength(1);
  });

  it('el doble factor pide política e IVT, ya no supervisión, en el ajuste que ya existía', async () => {
    const v = await sys((sql) => sql.one<{ value: string[] }>(`select value from public.app_settings where key = 'security.mfa_roles'`));
    expect([...v!.value].sort()).toEqual(['admin', 'boss', 'complaints_operator', 'dispatch', 'ivt', 'politics']);
  });

  it('las fichas del asistente pierden los roles retirados; la que quedó sin nadie se apaga, no se borra', async () => {
    const k = await sys((sql) =>
      sql.query<{ key: string; roles: string; active: boolean }>(`select key, roles::text as roles, active from public.assistant_knowledge where key like 'equipo:%' order by key`),
    );
    expect(k).toEqual([
      { key: 'equipo:mix', roles: '{social}', active: true },
      { key: 'equipo:sup', roles: '{}', active: false },
    ]);
  });
});
