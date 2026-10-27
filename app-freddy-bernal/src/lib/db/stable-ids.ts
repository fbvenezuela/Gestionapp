import type { Sql } from './core';

// Every server that runs the demo seeds its own in-memory database, and Vercel runs several: the
// page that lists an event and the page that opens it can come from different ones. With random
// ids the second one does not have that event and answers «not found». So while the demo seeds,
// uuid columns default to ids made from a counter (the same on every server, valid v4 uuids for
// zod); afterwards new rows get random ids again. Only for the demo database, never Supabase.
const UUID_DEFAULTS = `
  select n.nspname as schema, c.relname as tbl, a.attname as col
    from pg_attrdef d
    join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
    join pg_class c on c.oid = d.adrelid
    join pg_namespace n on n.oid = c.relnamespace
   where pg_get_expr(d.adbin, d.adrelid) = $1 and n.nspname in ('public', 'auth', 'demo_auth')`;

type Col = { schema: string; tbl: string; col: string };

const ident = (s: string) => `"${s.replace(/"/g, '""')}"`;

async function setDefault(sql: Sql, cols: Col[], expr: string) {
  for (const c of cols) await sql.query(`alter table ${ident(c.schema)}.${ident(c.tbl)} alter column ${ident(c.col)} set default ${expr}`);
}

export async function withStableIds<T>(sql: Sql, fn: () => Promise<T>): Promise<T> {
  await sql.query(`create sequence public.demo_id_seq`);
  await sql.query(
    `create function public.demo_id() returns uuid language sql as $f$
       select (substr(h, 1, 12) || '4' || substr(h, 14, 3) || '8' || substr(h, 18, 15))::uuid
         from md5('fb-demo:' || nextval('public.demo_id_seq')) h
     $f$`,
  );
  const cols = await sql.query<Col>(UUID_DEFAULTS, ['gen_random_uuid()']);
  await setDefault(sql, cols, 'public.demo_id()');
  // Rows the migrations already made (the assistant's first auto fichas) got random ids: renumber
  // them too, in the order they were written, unless another table already points at them.
  for (const c of cols) {
    const t = `${ident(c.schema)}.${ident(c.tbl)}`;
    const children = await sql.query<{ child: string }>(
      `select conrelid::regclass::text as child from pg_constraint where contype = 'f' and confrelid = $1::regclass`,
      [t],
    );
    let pointedAt = false;
    for (const { child } of children) pointedAt ||= !!(await sql.one<{ x: boolean }>(`select exists (select 1 from ${child}) as x`))?.x;
    if (!pointedAt) await sql.query(`update ${t} set ${ident(c.col)} = public.demo_id()`);
  }
  try {
    return await fn();
  } finally {
    await setDefault(sql, cols, 'gen_random_uuid()');
    await sql.query(`drop function public.demo_id()`);
    await sql.query(`drop sequence public.demo_id_seq`);
  }
}
