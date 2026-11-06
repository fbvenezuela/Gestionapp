// RLS on every table (PROMPT §4 rule 3; design R4 §3.2 row 44): every table of the public schema has row level
// security on and at least one policy or no grant to the API roles, after all the migrations (the four of Redes por
// formato included: content_months, feed_slots, piece_details, piece_notices; R5's Mensajes as channels drops
// chat_rules and chat_notice_ack; the public website's seventeen, 20261106000110 to 20261106000300). A new table without
// RLS fails here before it reaches a database. Views are not tables: event_calendar runs as whoever reads it
// (por-rol.test.ts).
import { describe, expect, it, beforeAll } from 'vitest';
import { makeTestDb, type TestDb } from './setup';
import { ANON_COLUMNS } from './web-setup';

let t: TestDb;
beforeAll(async () => {
  t = await makeTestDb();
}, 120_000);

type Table = { name: string; rls: boolean; policies: number; api: boolean };

const WEB_TABLES = ['territories', 'web_items', 'web_versions', 'web_media', 'web_settings', 'web_redirects', 'areas', 'area_members',
  'request_categories', 'requests', 'request_supports', 'request_contacts', 'request_events', 'request_messages', 'request_attachments',
  'attended_publications', 'rate_limits',
  // The attention desk's administrator (20261106100100_atencion_admin.sql).
  'request_reply_templates', 'request_alerts',
  // Where the importer of the old site took each draft and photo from (20261106300100_web_importador.sql).
  'web_import_items', 'web_import_media'];

describe('RLS en todas las tablas', () => {
  it('cada tabla de public tiene RLS (76: las cuatro de Redes por formato y las diecisiete de la web, sin las dos que Mensajes por canales quitó)', async () => {
    const rows = await t.system((sql) =>
      sql.query<Table>(
        `select c.relname as name, c.relrowsecurity as rls,
                (select count(*)::int from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies,
                (has_any_column_privilege('authenticated', c.oid, 'SELECT') or has_any_column_privilege('anon', c.oid, 'SELECT')) as api
           from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind in ('r', 'p') order by 1`,
      ),
    );
    expect(rows.length).toBeGreaterThanOrEqual(76);
    for (const gone of ['chat_rules', 'chat_notice_ack']) expect(rows.some((r) => r.name === gone), gone).toBe(false);
    expect(rows.filter((r) => !r.rls).map((r) => r.name)).toEqual([]);
    // A table the API can read has its policies (with RLS on and none, nobody would read it: still closed, but a
    // table opened to the API without a policy is a mistake to look at).
    expect(rows.filter((r) => r.api && r.policies === 0).map((r) => r.name)).toEqual([]);
    for (const name of ['content_months', 'feed_slots', 'piece_details', 'piece_notices']) {
      expect(rows.find((r) => r.name === name), name).toMatchObject({ rls: true, api: true });
    }
    for (const name of WEB_TABLES) expect(rows.find((r) => r.name === name), name).toMatchObject({ rls: true });
    // The contact and the rate limits: no API role touches them at all (only the definer functions).
    for (const name of ['request_contacts', 'rate_limits', 'request_alerts']) expect(rows.find((r) => r.name === name), name).toMatchObject({ api: false, policies: 0 });
  });

  it('anon no tiene privilegios de tabla en public ni escribe nada; solo lee, columna por columna, lo publicado (D-96)', async () => {
    const open = await t.system((sql) =>
      sql.query<{ name: string }>(
        `select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind in ('r', 'p', 'v')
            and (has_table_privilege('anon', c.oid, 'SELECT') or has_table_privilege('anon', c.oid, 'INSERT')
                 or has_table_privilege('anon', c.oid, 'UPDATE') or has_table_privilege('anon', c.oid, 'DELETE')
                 or has_any_column_privilege('anon', c.oid, 'INSERT') or has_any_column_privilege('anon', c.oid, 'UPDATE')
                 or has_any_column_privilege('anon', c.oid, 'REFERENCES'))
          order by 1`,
      ),
    );
    expect(open.map((r) => r.name)).toEqual([]);
    const cols = await t.system((sql) =>
      sql.query<{ name: string; col: string }>(
        `select c.relname as name, a.attname as col
           from pg_class c join pg_namespace n on n.oid = c.relnamespace join pg_attribute a on a.attrelid = c.oid
          where n.nspname = 'public' and c.relkind in ('r', 'p', 'v') and a.attnum > 0 and not a.attisdropped
            and has_column_privilege('anon', c.oid, a.attnum, 'SELECT')
          order by 1, 2`,
      ),
    );
    const got: Record<string, string[]> = {};
    for (const r of cols) (got[r.name] ??= []).push(r.col);
    expect(got).toEqual(ANON_COLUMNS);
    // Each of those tables answers anon through a policy of its own.
    const policies = await t.system((sql) =>
      sql.query<{ name: string }>(`select distinct tablename as name from pg_policies where schemaname = 'public' and 'anon' = any (roles) order by 1`),
    );
    expect(policies.map((p) => p.name)).toEqual(Object.keys(ANON_COLUMNS).sort());
  });
});
