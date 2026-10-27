import { describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readMigrations, readShim } from '@/lib/db/migrations';
import * as L from '@/lib/data/ficha-labels';

// The screens' value lists and the database CHECK lists of the fichas must be the same: a value the database
// refuses would fail on save, and one without a label would show raw English.
const LISTS: [table: string, column: string, values: readonly string[], labels: Record<string, unknown>, empty?: boolean][] = [
  ['obra_fichas', 'stage', L.OBRA_STAGES, L.OBRA_STAGE],
  ['obra_fichas', 'work_state', L.WORK_STATES, L.WORK_STATE],
  ['obra_fichas', 'currency', L.CURRENCIES, L.CURRENCY, true],
  ['obra_fichas', 'fab_generated_by', L.FAB_GENERATED_BY_VALUES, L.FAB_GENERATED_BY],
  ['obra_ficha_private', 'reporter_attends', L.REPORTER_ATTENDS_VALUES, L.REPORTER_ATTENDS],
  ['community_reports', 'type', L.REPORT_TYPES, L.REPORT_TYPE],
  ['community_reports', 'status', L.REPORT_STATUSES, L.REPORT_STATUS],
  ['community_reports', 'priority', L.PRIORITIES, L.PRIORITY],
  ['community_reports', 'figures_kind', L.FIGURES_KINDS, L.FIGURES_KIND],
  ['ficha_updates', 'kind', L.FICHA_UPDATE_KINDS, L.FICHA_UPDATE_KIND],
];

async function checks(): Promise<Map<string, string>> {
  const db = new PGlite();
  await db.exec(readShim());
  for (const m of readMigrations()) await db.exec(m.sql);
  const { rows } = await db.query<{ k: string; def: string }>(
    `select c.conrelid::regclass::text || '.' || a.attname as k, pg_get_constraintdef(c.oid) as def
       from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      where c.contype = 'c' and cardinality(c.conkey) = 1
        and c.conrelid::regclass::text in ('obra_fichas', 'obra_ficha_private', 'community_reports', 'community_report_private', 'ficha_updates')`,
  );
  await db.close();
  return new Map(rows.map((r) => [r.k, r.def]));
}

describe('valores de las fichas: pantalla y base iguales', () => {
  it('cada lista es exactamente la de su CHECK, y cada valor tiene su nombre en español', async () => {
    const defs = await checks();
    for (const [table, column, values, labels, empty] of LISTS) {
      const def = defs.get(`${table}.${column}`);
      expect(def, `${table}.${column}`).toBeTruthy();
      const inDb = [...def!.matchAll(/'([^']*)'::text/g)].map((m) => m[1]);
      expect(inDb.sort(), `${table}.${column}`).toEqual([...values, ...(empty ? [''] : [])].sort());
      expect(Object.keys(labels).sort(), `${table}.${column}`).toEqual([...values].sort());
      for (const v of values) {
        const l = labels[v] as string | { label: string };
        expect((typeof l === 'string' ? l : l.label).length, v).toBeGreaterThan(1);
      }
    }
  }, 60_000);

  it('las marcas «No aplica» y «Por confirmar» son las que la base acepta en las cuatro tablas', async () => {
    const defs = await checks();
    for (const table of ['obra_fichas', 'obra_ficha_private', 'community_reports', 'community_report_private']) {
      const def = defs.get(`${table}.marks`)!;
      const inDb = [...def.matchAll(/@ != \\?"([a-z_]+)\\?"/g)].map((m) => m[1]);
      expect(inDb.sort(), table).toEqual([...L.MARKS].sort());
    }
    expect(Object.keys(L.MARK).sort()).toEqual([...L.MARKS].sort());
  }, 60_000);
});
