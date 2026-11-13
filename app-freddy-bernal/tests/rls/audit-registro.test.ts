// «Registro de cambios» (APP-05) against the database: the count of the fields that changed, as Administración reads
// it. The bookkeeping (when, who saved, the concurrency token) does not count; the private tables, which keep the
// names of the fields instead of their values, count each name; and it counts only for a change. All data invented.
import { describe, it, expect, beforeAll } from 'vitest';
import { makeTestDb, type TestDb } from './setup';
import { AUDIT_CHANGED_COUNT_SQL } from '@/lib/domain/audit-log';

let t: TestDb;
beforeAll(async () => {
  t = await makeTestDb();
}, 120_000);

const last = (table: string, rowId: string) =>
  t.as('admin', (sql) =>
    sql.one<{ action: string; changed: number | null }>(
      `select a.action, ${AUDIT_CHANGED_COUNT_SQL} as changed from public.audit_log a
        where a.table_name = $1 and a.row_id = $2 order by a.id desc limit 1`,
      [table, rowId],
    ),
  );

describe('«Registro de cambios»: los datos que cambiaron', () => {
  it('un evento: cuenta el título y el resumen, no la versión, quién guardó ni cuándo', async () => {
    const ev = (await t.system((sql) => sql.one<{ id: string }>(`select id from public.events where deleted_at is null and boss_decision = 'accepted' order by code limit 1`)))!.id;
    await t.as('boss', (sql) => sql.query(`update public.events set title = 'Título cambiado (prueba)', summary = 'Resumen cambiado (prueba)' where id = $1`, [ev]));
    expect(await last('events', ev)).toEqual({ action: 'update', changed: 2 });
  });

  it('los contactos de una ficha de obra: cuenta los campos por su nombre, sin guardar lo que dicen', async () => {
    const f = (await t.system((sql) => sql.one<{ id: string }>(`select id from public.obra_ficha_private order by id limit 1`)))!.id;
    await t.as('dispatch', (sql) => sql.query(`update public.obra_ficha_private set boss_should_know = 'Nota de prueba', reported_via = 'Visita (prueba)' where id = $1`, [f]));
    expect(await last('obra_ficha_private', f)).toEqual({ action: 'update', changed: 2 });
  });

  it('crear no cuenta datos', async () => {
    const ev = (await t.system((sql) => sql.one<{ id: string }>(`select id from public.events order by code limit 1`)))!.id;
    const created = await t.as('admin', (sql) =>
      sql.one<{ changed: number | null }>(`select ${AUDIT_CHANGED_COUNT_SQL} as changed from public.audit_log a where a.table_name = 'events' and a.row_id = $1 and a.action = 'insert'`, [ev]),
    );
    expect(created?.changed ?? null).toBeNull();
  });
});
