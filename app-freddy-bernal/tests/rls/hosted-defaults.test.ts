import { describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readMigrations, readShim } from '@/lib/db/migrations';
import { ANON_COLUMNS, CITIZEN_FUNCTIONS } from './web-setup';

// Hosted Supabase grants the API roles ALL on whatever "postgres" creates in public (platform default privileges,
// seen on fb-dev). 20261023000000_hosted_defaults.sql takes that back first, so a hosted project ends up with the
// same privileges the shim-based tests check. Here a hosted project is simulated by adding those defaults before
// the migrations, and its effective privileges must equal the shim's: tables, columns (the public website reads with
// column privileges, D-96), sequences, functions of public, and the functions of the schema citizen.
const HOSTED_DEFAULTS = `
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;`;

const TABLE_PRIVS = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'];
const COLUMN_PRIVS = ['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'];

async function apiPrivileges(hosted: boolean): Promise<string[]> {
  const db = new PGlite();
  await db.exec(readShim());
  if (hosted) await db.exec(HOSTED_DEFAULTS);
  for (const m of readMigrations()) await db.exec(m.sql);
  const { rows } = await db.query<{ p: string }>(
    `select r.role || ' ' || x.priv || ' ' || c.relname as p
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       cross join (values ('anon'), ('authenticated')) r(role)
       cross join unnest($1::text[]) x(priv)
      where n.nspname = 'public' and c.relkind in ('r', 'v', 'p') and has_table_privilege(r.role, c.oid, x.priv)
     union all
     -- Column privileges where the whole table is not granted.
     select r.role || ' ' || x.priv || ' ' || c.relname || '.' || a.attname
       from pg_class c join pg_namespace n on n.oid = c.relnamespace join pg_attribute a on a.attrelid = c.oid
       cross join (values ('anon'), ('authenticated')) r(role)
       cross join unnest($2::text[]) x(priv)
      where n.nspname = 'public' and c.relkind in ('r', 'v', 'p') and a.attnum > 0 and not a.attisdropped
        and has_column_privilege(r.role, c.oid, a.attnum, x.priv) and not has_table_privilege(r.role, c.oid, x.priv)
     union all
     select r.role || ' ' || x.priv || ' ' || c.relname
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       cross join (values ('anon'), ('authenticated')) r(role)
       cross join (values ('USAGE'), ('SELECT'), ('UPDATE')) x(priv)
      where n.nspname = 'public' and c.relkind = 'S' and has_sequence_privilege(r.role, c.oid, x.priv)
     union all
     select r.role || ' EXECUTE ' || p.oid::regprocedure::text
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       cross join (values ('anon'), ('authenticated'), ('service_role')) r(role)
      where n.nspname in ('public', 'citizen') and (n.nspname = 'citizen' or r.role <> 'service_role')
        and has_function_privilege(r.role, p.oid, 'EXECUTE')
     order by 1`,
    [TABLE_PRIVS, COLUMN_PRIVS],
  );
  await db.close();
  return rows.map((r) => r.p);
}

describe('privilegios en un Supabase real (default privileges de la plataforma)', () => {
  it('quedan iguales a los de las pruebas', async () => {
    const [shim, hosted] = await Promise.all([apiPrivileges(false), apiPrivileges(true)]);
    expect(shim.length).toBeGreaterThan(0);
    expect(hosted).toEqual(shim);
  }, 60_000);

  it('anon solo lee las columnas públicas de lo publicado y llama las funciones ciudadanas; nadie trunca ni agrega triggers', async () => {
    const hosted = await apiPrivileges(true);
    const allowed = new Set([
      ...Object.entries(ANON_COLUMNS).flatMap(([table, cols]) => cols.map((c) => `anon SELECT ${table}.${c}`)),
      ...CITIZEN_FUNCTIONS.map((f) => `anon EXECUTE citizen.${f}`),
    ]);
    const anon = hosted.filter((p) => p.startsWith('anon '));
    expect(anon.map((p) => p.replace(/\(.*$/, '')).filter((p) => !allowed.has(p))).toEqual([]);
    expect(anon.filter((p) => p.startsWith('anon EXECUTE citizen.'))).toHaveLength(CITIZEN_FUNCTIONS.length);
    // Nobody with a session (nor the service key) calls a citizen function: only anon, from the app.
    expect(hosted.filter((p) => /^(authenticated|service_role) EXECUTE citizen\./.test(p))).toEqual([]);
    expect(hosted.filter((p) => / (TRUNCATE|TRIGGER|REFERENCES|MAINTAIN) /.test(p))).toEqual([]);
    expect(hosted.filter((p) => p.includes('wire_standard_triggers'))).toEqual([]);
  }, 60_000);
});
