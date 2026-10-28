import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createMemoryDb } from '@/lib/db/pglite';
import { asSystem } from '@/lib/db/core';
import { seedClient } from '@/lib/db/seed-client';
import { seedDemo } from '@/lib/db/seed-demo';
import { withStableIds } from '@/lib/db/stable-ids';

// Two demo servers (two Vercel instances) each seed their own database. Every id must match, or a
// link from one («La ficha completa del evento… da error», 27/10) opens «not found» on the other.
async function seededIds(): Promise<{ ids: string[]; defaults: string[] }> {
  const { db, backend } = await createMemoryDb();
  await asSystem(backend, (sql) =>
    withStableIds(sql, async () => {
      await seedClient(sql);
      await seedDemo(sql);
    }),
  );
  const tables = await db.query<{ t: string }>(
    `select table_schema || '.' || table_name as t from information_schema.columns
      where table_schema in ('public', 'demo_auth') and column_name = 'id' and data_type = 'uuid' order by 1`,
  );
  const ids: string[] = [];
  for (const { t } of tables.rows) {
    const r = await db.query<{ id: string }>(`select id::text as id from ${t} order by id`);
    ids.push(...r.rows.map((x) => `${t}:${x.id}`));
  }
  const defaults = await db.query<{ d: string }>(
    `select pg_get_expr(d.adbin, d.adrelid) as d from pg_attrdef d where pg_get_expr(d.adbin, d.adrelid) like '%demo_id%'`,
  );
  await db.close();
  return { ids, defaults: defaults.rows.map((r) => r.d) };
}

describe('la demo tiene los mismos ids en todos los servidores', () => {
  it('dos bases sembradas por separado quedan con los mismos ids, válidos para zod', async () => {
    const [a, b] = await Promise.all([seededIds(), seededIds()]);
    expect(a.ids.length).toBeGreaterThan(100);
    expect(a.ids.some((x) => x.startsWith('public.events:'))).toBe(true);
    // The fichas part of the seed (obras, reports, their contacts and history) too.
    // ... and Grabación's handoff (its note for the editor, §5).
    for (const t of ['obra_fichas', 'obra_ficha_private', 'community_reports', 'community_report_private', 'ficha_updates', 'recording_notes']) {
      expect(a.ids.some((x) => x.startsWith(`public.${t}:`)), t).toBe(true);
    }
    expect(b.ids).toEqual(a.ids);
    for (const x of a.ids) expect(z.string().uuid().safeParse(x.split(':')[1]).success, x).toBe(true);
  }, 120_000);

  it('al terminar, lo nuevo vuelve a tener ids al azar', async () => {
    const a = await seededIds();
    expect(a.defaults).toEqual([]);
  }, 120_000);
});
