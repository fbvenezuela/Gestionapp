// What «Borrar este mes» says before asking (R4, WP-C1, D-67): getMonthTotals, read as the person (RLS). Its piece
// count is the very number delete_content_month checks, so the confirmation never lies; who does not work on Redes reads
// no month at all. Invented demo data.
import { describe, it, expect, beforeAll } from 'vitest';
import { makeTestDb, type TestDb } from './setup';
import { getMonthTotals, getMonths } from '@/lib/data/redes';

let t: TestDb;
beforeAll(async () => {
  t = await makeTestDb();
});

describe('los números de «Borrar este mes»', () => {
  it('por mes: sus piezas vivas de todos los formatos y sus espacios llenos del feed, como la base', async () => {
    const months = await t.as('social', (sql) => getMonths(sql));
    expect(months.map((m) => m.label)).toEqual(['Mes 1', 'Mes 2', 'Mes 3']);
    const totals = await t.as('social', (sql) => getMonthTotals(sql));
    for (const m of months) {
      const truth = await t.system(async (sql) => ({
        pieces: (await sql.one<{ n: number }>(`select count(*)::int as n from public.pieces where content_month_id = $1 and deleted_at is null`, [m.id]))!.n,
        placed: (await sql.one<{ n: number }>(`select count(*)::int as n from public.feed_slots where month_id = $1 and piece_id is not null`, [m.id]))!.n,
      }));
      expect(totals[m.id], m.label).toEqual(truth);
    }
    // The demo's Mes 1 is full (21 of 24 places), Mes 2 has two drafts and Mes 3 is empty.
    expect(totals[months[0].id].placed).toBe(21);
    expect(totals[months[1].id]).toEqual({ pieces: 2, placed: 0 });
    expect(totals[months[2].id]).toEqual({ pieces: 0, placed: 0 });
    // The boss and administración read the same.
    expect(await t.as('boss', (sql) => getMonthTotals(sql))).toEqual(totals);
    expect(await t.as('admin', (sql) => getMonthTotals(sql))).toEqual(totals);
  });

  it('el número que dice es el que la base acepta al borrar (y no deja borrar con otro)', async () => {
    const [, m2] = await t.as('social', (sql) => getMonths(sql));
    const said = (await t.as('social', (sql) => getMonthTotals(sql)))[m2.id];
    await expect(t.as('social', (sql) => sql.one(`select public.delete_content_month($1, $2) as n`, [m2.id, said.pieces + 1]))).rejects.toThrow(/El mes cambió/);
    const n = await t.as('social', async (sql) => (await sql.one<{ n: number }>(`select public.delete_content_month($1, $2) as n`, [m2.id, said.pieces]))!.n);
    expect(n).toBe(said.pieces);
    expect(Object.keys(await t.as('social', (sql) => getMonthTotals(sql)))).not.toContain(m2.id);
  });

  it('quien no trabaja en Redes no lee ningún mes', async () => {
    for (const who of ['politics', 'ivt', 'camera', 'dispatch'] as const) {
      expect(await t.as(who, (sql) => getMonthTotals(sql)), who).toEqual({});
    }
  });
});
