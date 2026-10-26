import { describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readMigrations, readShim } from '@/lib/db/migrations';

// Hosted Supabase grants the API roles ALL on whatever "postgres" creates in public (platform default privileges,
// seen on fb-dev). 20261023000000_hosted_defaults.sql takes that back first, so a hosted project ends up with the
// same privileges the shim-based tests check. Here a hosted project is simulated by adding those defaults before
// the migrations, and its effective privileges must equal the shim's.
const HOSTED_DEFAULTS = `
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;`;

const TABLE_PRIVS = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'];

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
     select r.role || ' ' || x.priv || ' ' || c.relname
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       cross join (values ('anon'), ('authenticated')) r(role)
       cross join (values ('USAGE'), ('SELECT'), ('UPDATE')) x(priv)
      where n.nspname = 'public' and c.relkind = 'S' and has_sequence_privilege(r.role, c.oid, x.priv)
     union all
     select r.role || ' EXECUTE ' || p.oid::regprocedure::text
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       cross join (values ('anon'), ('authenticated')) r(role)
      where n.nspname = 'public' and has_function_privilege(r.role, p.oid, 'EXECUTE')
     order by 1`,
    [TABLE_PRIVS],
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

  it('anon no toca ninguna tabla y nadie puede truncar ni agregar triggers', async () => {
    const hosted = await apiPrivileges(true);
    expect(hosted.filter((p) => p.startsWith('anon ') && !p.includes(' EXECUTE '))).toEqual([]);
    expect(hosted.filter((p) => / (TRUNCATE|TRIGGER|REFERENCES|MAINTAIN) /.test(p))).toEqual([]);
    expect(hosted.filter((p) => p.includes('wire_standard_triggers'))).toEqual([]);
  }, 60_000);
});
