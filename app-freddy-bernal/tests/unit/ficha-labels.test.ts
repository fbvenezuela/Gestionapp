import { describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readMigrations, readShim } from '@/lib/db/migrations';
import * as L from '@/lib/data/ficha-labels';
import { describeUpdate } from '@/components/fichas/history-timeline';
import { fieldLabel } from '@/lib/domain/ficha-fields';

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

describe('la historia de una ficha: palabras de obra y de reporte', () => {
  it('una obra tiene visita; un reporte, actividad. Sin la fecha', () => {
    const line = (kind: L.FichaUpdateKind) => ({ kind, from_value: null, to_value: null, fields: [] });
    expect(describeUpdate('obra', line('scheduled'))).toBe('le puso fecha a la visita');
    expect(describeUpdate('report', line('scheduled'))).toBe('le puso fecha a la actividad');
    expect(describeUpdate('obra', line('done'))).toBe('marcó la visita como realizada');
    expect(describeUpdate('report', line('done'))).toBe('marcó la actividad como realizada');
    // The rest is the same for both.
    for (const k of ['note', 'deleted', 'restored'] as const) expect(describeUpdate('report', line(k)), k).toBe(describeUpdate('obra', line(k)));
    for (const k of Object.keys(L.REPORT_UPDATE_KIND)) expect(L.FICHA_UPDATE_KINDS, k).toContain(k);
  });
});

describe('la historia de una ficha: los campos que cambiaron (APP-04)', () => {
  const contact = (kind: 'obra' | 'report', fields: string[]) => describeUpdate(kind, { kind: 'contact', from_value: null, to_value: null, fields });
  it('en el orden del formulario, tres nombres y cuántos más', () => {
    // The database lists them alphabetically: the form's order puts the person first.
    expect(contact('report', ['activity_at', 'address', 'reference', 'reporter_name', 'reporter_phone', 'reporter_role'])).toBe(
      'actualizó los contactos: Nombre y apellido, Cargo o función, Teléfono y 3 más',
    );
    expect(contact('report', ['reporter_phone', 'reporter_name'])).toBe('actualizó los contactos: Nombre y apellido, Teléfono');
    expect(describeUpdate('obra', { kind: 'update', from_value: null, to_value: null, fields: ['investment', 'currency', 'progress_pct', 'executor'] })).toBe(
      'actualizó datos: Organismo o empresa que ejecuta, Inversión, Moneda y 1 más',
    );
  });

  it('una clave sin nombre nunca sale, y si no queda ninguna dice solo qué hizo', () => {
    const line = contact('report', ['reporter_name', 'some_internal_column', 'updated_by']);
    expect(line).toBe('actualizó los contactos: Nombre y apellido');
    expect(line).not.toMatch(/some_internal_column|updated_by/);
    expect(contact('obra', ['some_internal_column'])).toBe('actualizó los contactos');
    expect(fieldLabel('obra', 'some_internal_column')).toBeNull();
  });

  it('una fecha dice de qué grupo es', () => {
    expect(fieldLabel('report', 'activity_at')).toBe('Fecha y hora de la actividad o situación');
    expect(fieldLabel('report', 'reported_at')).toBe('Fecha y hora del reporte');
    // The rest keep the form's label.
    expect(fieldLabel('report', 'reporter_phone')).toBe('Teléfono');
    expect(fieldLabel('obra', 'fab_dialog')).toBe('Lo que voy a decir');
  });
});
