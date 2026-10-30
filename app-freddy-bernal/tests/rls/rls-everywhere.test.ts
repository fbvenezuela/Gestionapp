// RLS on every table (PROMPT §4 rule 3; design R4 §3.2 row 44): every table of the public schema has row level
// security on and at least one policy or no grant to the API roles, after all the migrations (the four of Redes por
// formato included: content_months, feed_slots, piece_details, piece_notices; R5's Mensajes as channels drops
// chat_rules and chat_notice_ack). A new table without RLS fails here before it reaches a database. Views are not
// tables: event_calendar runs as whoever reads it (por-rol.test.ts).
import { describe, expect, it, beforeAll } from 'vitest';
import { makeTestDb, type TestDb } from './setup';

let t: TestDb;
beforeAll(async () => {
  t = await makeTestDb();
}, 120_000);

type Table = { name: string; rls: boolean; policies: number; api: boolean };

describe('RLS en todas las tablas', () => {
  it('cada tabla de public tiene RLS (59 de 59: las cuatro de Redes por formato, sin las dos que Mensajes por canales quitó)', async () => {
    const rows = await t.system((sql) =>
      sql.query<Table>(
        `select c.relname as name, c.relrowsecurity as rls,
                (select count(*)::int from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies,
                (has_table_privilege('authenticated', c.oid, 'SELECT') or has_table_privilege('anon', c.oid, 'SELECT')) as api
           from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind in ('r', 'p') order by 1`,
      ),
    );
    expect(rows.length).toBeGreaterThanOrEqual(59);
    for (const gone of ['chat_rules', 'chat_notice_ack']) expect(rows.some((r) => r.name === gone), gone).toBe(false);
    expect(rows.filter((r) => !r.rls).map((r) => r.name)).toEqual([]);
    // A table the API can read has its policies (with RLS on and none, nobody would read it: still closed, but a
    // table opened to the API without a policy is a mistake to look at).
    expect(rows.filter((r) => r.api && r.policies === 0).map((r) => r.name)).toEqual([]);
    for (const name of ['content_months', 'feed_slots', 'piece_details', 'piece_notices']) {
      expect(rows.find((r) => r.name === name), name).toMatchObject({ rls: true, api: true });
    }
  });

  it('anon no lee ninguna tabla de public', async () => {
    const open = await t.system((sql) =>
      sql.query<{ name: string }>(
        `select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind in ('r', 'p', 'v')
            and (has_table_privilege('anon', c.oid, 'SELECT') or has_table_privilege('anon', c.oid, 'INSERT')
                 or has_table_privilege('anon', c.oid, 'UPDATE') or has_table_privilege('anon', c.oid, 'DELETE'))
          order by 1`,
      ),
    );
    expect(open.map((r) => r.name)).toEqual([]);
  });
});
