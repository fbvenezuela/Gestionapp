// «La oficina» (06/11/2026) against the database: who writes the script and the two edits (event_office), that only
// the boss approves a script, that changing an approved one sends it back, that the final edit waits for the clean one,
// and that office_facts() places each activity the same for everyone who sees it (and gives nothing to who does not).
// All data here is invented.
import { describe, it, expect, beforeAll } from 'vitest';
import { makeTestDb, type TestDb } from './setup';
import { officeItems } from '@/lib/data/office';
import type { DemoUserKey } from '@/lib/db/seed-demo';

let t: TestDb;
let ev: string; // an accepted event with no office row
let ev2: string; // another accepted event with no office row, that nobody here writes
let scripted: string; // the demo event whose script waits for the boss

const row = (id: string) => t.system((sql) => sql.one<{ script_status: string; clean_done: boolean; brutal_done: boolean; script_approved_by: string | null }>(`select * from public.event_office where event_id = $1`, [id]));

beforeAll(async () => {
  t = await makeTestDb();
  scripted = (await t.system((sql) => sql.one<{ event_id: string }>(`select event_id from public.event_office where script_status = 'draft'`)))!.event_id;
  ev = (await t.system((sql) =>
    sql.one<{ id: string }>(
      `select e.id from public.events e where e.boss_decision = 'accepted' and e.deleted_at is null and e.cancelled_at is null
          and not exists (select 1 from public.event_office o where o.event_id = e.id) order by e.code limit 1`,
    ),
  ))!.id;
  ev2 = (await t.system((sql) =>
    sql.one<{ id: string }>(
      `select e.id from public.events e join public.event_assignments a on a.event_id = e.id and a.user_id = $2
        where e.boss_decision = 'accepted' and e.deleted_at is null and e.cancelled_at is null and e.id <> $1
          and not exists (select 1 from public.event_office o where o.event_id = e.id) order by e.code limit 1`,
      [ev, t.ids.camera],
    ),
  ))!.id;
}, 120_000);

describe('event_office: el guion', () => {
  it('Redes guarda un borrador; el jefe lo aprueba y queda su nombre', async () => {
    await t.as('social', (sql) => sql.query(`insert into public.event_office (event_id, script, script_status) values ($1, 'Toma 1: llegada (prueba)', 'draft')`, [ev]));
    expect((await row(ev))!.script_status).toBe('draft');
    await t.as('boss', (sql) => sql.query(`update public.event_office set script_status = 'approved' where event_id = $1`, [ev]));
    expect(await row(ev)).toMatchObject({ script_status: 'approved', script_approved_by: t.ids.boss });
  });

  it('Redes no aprueba un guion', async () => {
    await expect(t.as('social', (sql) => sql.query(`update public.event_office set script_status = 'approved' where event_id = $1`, [scripted]))).rejects.toThrow(/Solo el jefe/);
  });

  it('el jefe sin doble factor no aprueba', async () => {
    await expect(t.as('boss', (sql) => sql.query(`update public.event_office set script_status = 'approved' where event_id = $1`, [scripted]), 'aal1')).rejects.toThrow();
  });

  it('cambiar un guion aprobado lo devuelve al jefe', async () => {
    await t.as('social', (sql) => sql.query(`update public.event_office set script = 'Toma 1: llegada, otra vez (prueba)', script_status = 'approved' where event_id = $1`, [ev]));
    expect(await row(ev)).toMatchObject({ script_status: 'draft', script_approved_by: null });
    await t.as('boss', (sql) => sql.query(`update public.event_office set script_status = 'approved' where event_id = $1`, [ev]));
  });

  it('despacho, Grabación, política y el IVT no escriben en la oficina', async () => {
    for (const who of ['dispatch', 'camera', 'politics', 'ivt'] as DemoUserKey[]) {
      const n = await t.as(who, (sql) => sql.query(`update public.event_office set clean_done = true where event_id = $1 returning event_id`, [scripted]));
      expect(n, who).toHaveLength(0);
      // ev2 is accepted and assigned to «camera»: Grabación sees it, and still cannot write.
      await expect(t.as(who, (sql) => sql.query(`insert into public.event_office (event_id) values ($1)`, [ev2])), who).rejects.toThrow(/row-level security/);
    }
  });
});

describe('event_office: las dos ediciones', () => {
  it('solo el jefe marca el video limpio; la edición brutal lo espera', async () => {
    await expect(t.as('social', (sql) => sql.query(`update public.event_office set brutal_done = true where event_id = $1`, [ev]))).rejects.toThrow(/editor en línea/);
    await expect(t.as('social', (sql) => sql.query(`update public.event_office set clean_done = true where event_id = $1`, [ev]))).rejects.toThrow(/Solo el jefe/);
    await expect(t.as('boss', (sql) => sql.query(`update public.event_office set clean_done = true where event_id = $1`, [ev]), 'aal1')).rejects.toThrow();
    await t.as('boss', (sql) => sql.query(`update public.event_office set clean_done = true where event_id = $1`, [ev]));
    await t.as('social2', (sql) => sql.query(`update public.event_office set brutal_done = true where event_id = $1`, [ev]));
    expect(await row(ev)).toMatchObject({ clean_done: true, brutal_done: true });
  });
});

describe('office_facts: dónde está cada actividad', () => {
  it('la misma sala para el jefe, despacho y Redes; Grabación solo las suyas', async () => {
    const rooms = async (who: DemoUserKey) => Object.fromEntries((await t.as(who, (sql) => officeItems(sql))).map((i) => [i.id, i.room]));
    const boss = await rooms('boss');
    expect(boss[scripted]).toBe('script');
    expect(await rooms('dispatch')).toEqual(boss);
    expect(await rooms('social')).toEqual(boss);
    const cam = await rooms('camera');
    expect(Object.keys(cam).length).toBeGreaterThan(0);
    expect(Object.keys(cam).length).toBeLessThan(Object.keys(boss).length);
    for (const [id, r] of Object.entries(cam)) expect(r).toBe(boss[id]);
  });

  it('política y el IVT no ven actividades, ni la fila de la oficina', async () => {
    for (const who of ['politics', 'ivt'] as DemoUserKey[]) {
      expect(await t.as(who, (sql) => officeItems(sql)), who).toEqual([]);
      expect(await t.as(who, (sql) => sql.query(`select 1 from public.event_office`)), who).toEqual([]);
    }
  });

  it('no dice cuándo ni dónde: solo cuentas y sí/no', async () => {
    const cols = await t.system((sql) =>
      sql.query<{ name: string }>(`select unnest(proargnames) as name from pg_proc where proname = 'office_facts'`),
    );
    for (const c of cols.map((x) => x.name)) expect(c).not.toMatch(/start|end|date|time|place|address|_at$/);
  });
});
