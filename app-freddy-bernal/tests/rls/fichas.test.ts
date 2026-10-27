// Fichas (cambios del 27/10/2026, §4.1 and §4.2): the obra ficha (IVT) and the community report (política). Every
// «no puede» is tried against the database: Redes never reaches a report nor a contact, Grabación only the obra of
// its own visit, the IVT and política are mirror images, contacts need 2FA, soft delete is admin-only, and the
// history only grows and never carries a phone, a contact's name or the visit date. All data here is invented.
import { describe, it, expect, beforeAll } from 'vitest';
import { makeTestDb, type TestDb } from './setup';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';

let t: TestDb;
beforeAll(async () => {
  t = await makeTestDb();
});

const fails = async (p: Promise<unknown>, msg?: RegExp) => {
  if (msg) await expect(p).rejects.toThrow(msg);
  else await expect(p).rejects.toThrow();
};
const ALL: DemoUserKey[] = DEMO_USERS.map((u) => u.key);
const OBRA_ROLES = ['admin', 'boss', 'dispatch', 'ivt'] as const;
const REPORT_ROLES = ['admin', 'boss', 'dispatch', 'politics'] as const;

type Ficha = { id: string; code: string };
let n = 0;
const newObra = (who: DemoUserKey = 'ivt', municipality = 'Junín', parish = '') =>
  t.as(who, async (sql) =>
    (await sql.one<Ficha>(`insert into public.obra_fichas (name, municipality, parish) values ($1, $2, $3) returning id, code`, [
      `Obra de prueba ${++n} (demo)`,
      municipality,
      parish,
    ]))!,
  );
const newReport = (who: DemoUserKey = 'politics', municipality = 'Torbes', parish = '') =>
  t.as(who, async (sql) =>
    (await sql.one<Ficha>(`insert into public.community_reports (title, municipality, parish, type) values ($1, $2, $3, 'event') returning id, code`, [
      `Reporte de prueba ${++n} (demo)`,
      municipality,
      parish,
    ]))!,
  );
const count = async (who: DemoUserKey, q: string, params: unknown[] = [], aal: 'aal1' | 'aal2' = 'aal2') =>
  (await t.as(who, (sql) => sql.one<{ n: number }>(`select count(*)::int as n from (${q}) x`, params), aal))!.n;
// The demo events in seed order, and the ones assigned to each camera person.
const eventAt = async (i: number) => (await t.system((sql) => sql.one<{ id: string }>(`select id from public.events order by code offset $1 limit 1`, [i])))!.id;
const assignedTo = async (who: DemoUserKey) =>
  (await t.system((sql) =>
    sql.query<{ id: string }>(`select e.id from public.events e join public.event_assignments a on a.event_id = e.id where a.user_id = $1 order by e.code`, [t.ids[who]]),
  )).map((r) => r.id);
const linkObra = (fichaId: string, eventId: string) => t.system((sql) => sql.query(`update public.events set obra_ficha_id = $1 where id = $2`, [fichaId, eventId]));
const linkReport = (reportId: string, eventId: string) => t.system((sql) => sql.query(`update public.events set community_report_id = $1 where id = $2`, [reportId, eventId]));
const history = (where: string, id: string) =>
  t.system((sql) =>
    sql.query<{ kind: string; from_value: string | null; to_value: string | null; fields: string[]; changes: Record<string, unknown> | null; note: string | null; actor_id: string | null }>(
      `select kind, from_value, to_value, fields, changes, note, actor_id from public.ficha_updates where ${where} = $1 order by created_at, kind`,
      [id],
    ),
  );

describe('fichas de obra: quién las ve y quién las escribe', () => {
  it('el IVT, el jefe, el despacho y administración crean y ven fichas de obra; el director de política no ve ni crea ninguna', async () => {
    for (const who of OBRA_ROLES) {
      const f = await newObra(who);
      expect(f.code).toMatch(/^O-\d{4}$/);
      const row = await t.as(who, (sql) => sql.one<{ stage: string; rev: number; created_by: string }>(`select stage, rev, created_by from public.obra_fichas where id = $1`, [f.id]));
      expect(row).toEqual({ stage: 'draft', rev: 1, created_by: t.ids[who] });
    }
    expect(await count('politics', 'select 1 from public.obra_fichas')).toBe(0);
    await fails(newObra('politics'));
  });

  it('nadie crea una ficha a nombre de otro', async () => {
    await fails(t.as('ivt', (sql) => sql.query(`insert into public.obra_fichas (name, municipality, created_by) values ('Obra ajena (demo)', 'Junín', $1)`, [t.ids.boss])));
  });

  it('redes y grabación no crean ni cambian fichas de obra, ni la de su evento', async () => {
    const f = await newObra();
    const [camEvent] = await assignedTo('camera');
    await linkObra(f.id, camEvent);
    for (const who of ['social', 'social2', 'camera'] as const) {
      await fails(newObra(who));
      const upd = await t.as(who, (sql) => sql.query(`update public.obra_fichas set name = 'Cambiada por quien no debe' where id = $1 returning id`, [f.id]));
      expect(upd).toHaveLength(0);
    }
    await t.system((sql) => sql.query(`update public.events set obra_ficha_id = null where id = $1`, [camEvent]));
  });

  it('redes ve la parte principal de una obra solo cuando un evento vivo que ve la tiene; nunca los contactos, por ninguna vía', async () => {
    const f = await newObra();
    await t.as('ivt', (sql) => sql.query(`insert into public.obra_ficha_private (id, liaison_name, liaison_phone) values ($1, 'Enlace de prueba (demo)', '0000-0000301')`, [f.id]));
    expect(await count('social', 'select 1 from public.obra_fichas where id = $1', [f.id])).toBe(0);
    const ev = await eventAt(0);
    await linkObra(f.id, ev);
    expect(await count('social', 'select 1 from public.obra_fichas where id = $1', [f.id])).toBe(1);
    // The contacts: not directly, not by join, subquery or exists.
    expect(await count('social', 'select 1 from public.obra_ficha_private')).toBe(0);
    const j = await t.as('social', (sql) => sql.query<{ p: string | null }>(`select p.liaison_phone as p from public.obra_fichas f left join public.obra_ficha_private p on p.id = f.id`));
    expect(j.length).toBeGreaterThan(0);
    expect(j.every((r) => r.p === null)).toBe(true);
    const s = await t.as('social', (sql) => sql.query<{ p: string | null }>(`select (select liaison_name from public.obra_ficha_private p where p.id = f.id) as p from public.obra_fichas f`));
    expect(s.every((r) => r.p === null)).toBe(true);
    expect(await count('social', 'select 1 from public.obra_fichas f where exists (select 1 from public.obra_ficha_private p where p.id = f.id)')).toBe(0);
    expect(await count('social', `select 1 from public.events e join public.obra_ficha_private p on p.id = e.obra_ficha_id`)).toBe(0);
    // The event is deleted: the obra is gone for Redes again.
    await t.as('admin', (sql) => sql.query(`update public.events set deleted_at = now() where id = $1`, [ev]));
    expect(await count('social', 'select 1 from public.obra_fichas where id = $1', [f.id])).toBe(0);
    await t.as('admin', (sql) => sql.query(`update public.events set deleted_at = null where id = $1`, [ev]));
    expect(await count('social', 'select 1 from public.obra_fichas where id = $1', [f.id])).toBe(1);
  });

  it('grabación ve solo la obra de su visita asignada, y sin contactos', async () => {
    const a = await newObra();
    const b = await newObra();
    const cam = await assignedTo('camera');
    const cam2 = await assignedTo('camera2');
    await linkObra(a.id, cam[0]);
    await linkObra(b.id, cam2[cam2.length - 1]);
    await t.as('ivt', (sql) => sql.query(`insert into public.obra_ficha_private (id, engineer_phone) values ($1, '0000-0000302'), ($2, '0000-0000303')`, [a.id, b.id]));
    expect(await count('camera', 'select 1 from public.obra_fichas where id = $1', [a.id])).toBe(1);
    expect(await count('camera', 'select 1 from public.obra_fichas where id = $1', [b.id])).toBe(0);
    expect(await count('camera2', 'select 1 from public.obra_fichas where id = $1', [b.id])).toBe(1);
    expect(await count('camera2', 'select 1 from public.obra_fichas where id = $1', [a.id])).toBe(0);
    // Every obra camera sees is linked to one of its assigned events.
    const seen = await t.as('camera', (sql) => sql.query<{ id: string }>(`select id from public.obra_fichas`));
    const linked = await t.system((sql) => sql.query<{ id: string }>(`select obra_ficha_id as id from public.events where id = any($1::uuid[]) and obra_ficha_id is not null`, [cam]));
    expect(new Set(seen.map((r) => r.id))).toEqual(new Set(linked.map((r) => r.id)));
    for (const who of ['camera', 'camera2'] as const) expect(await count(who, 'select 1 from public.obra_ficha_private')).toBe(0);
  });

  it('el director de política no ve una obra ni enlazada a un evento', async () => {
    const f = await newObra();
    await linkObra(f.id, await eventAt(0));
    expect(await count('politics', 'select 1 from public.obra_fichas where id = $1', [f.id])).toBe(0);
    expect(await count('politics', 'select 1 from public.events e join public.obra_fichas f on f.id = e.obra_ficha_id')).toBe(0);
  });
});

describe('reportes comunitarios: solo política, despacho, el jefe y administración', () => {
  it('política, el jefe, el despacho y administración crean y ven reportes; el IVT, redes y grabación no ven ni crean ninguno', async () => {
    for (const who of REPORT_ROLES) {
      const r = await newReport(who);
      expect(r.code).toMatch(/^R-\d{4}$/);
      const row = await t.as(who, (sql) => sql.one<{ status: string; rev: number; wants_agenda: boolean }>(`select status, rev, wants_agenda from public.community_reports where id = $1`, [r.id]));
      expect(row).toEqual({ status: 'planned', rev: 1, wants_agenda: false });
    }
    for (const who of ['ivt', 'social', 'social2', 'camera', 'camera2'] as const) {
      expect(await count(who, 'select 1 from public.community_reports'), who).toBe(0);
      await fails(newReport(who));
    }
  });

  it('redes no llega a un reporte por join, subconsulta ni exists, aunque un evento que ve lo tenga', async () => {
    const r = await newReport();
    await t.as('politics', (sql) => sql.query(`insert into public.community_report_private (id, reporter_name, reporter_phone) values ($1, 'Persona de prueba (demo)', '0000-0000401')`, [r.id]));
    const ev = await eventAt(4);
    await linkReport(r.id, ev);
    for (const who of ['social', 'social2'] as const) {
      expect(await count(who, 'select 1 from public.community_reports')).toBe(0);
      expect(await count(who, 'select 1 from public.community_report_private')).toBe(0);
      const j = await t.as(who, (sql) =>
        sql.query<{ title: string | null; phone: string | null }>(
          `select r.title, p.reporter_phone as phone from public.events e
             left join public.community_reports r on r.id = e.community_report_id
             left join public.community_report_private p on p.id = e.community_report_id`,
        ),
      );
      expect(j.length).toBeGreaterThan(0);
      expect(j.every((x) => x.title === null && x.phone === null)).toBe(true);
      const s = await t.as(who, (sql) =>
        sql.query<{ t: string | null }>(`select (select title from public.community_reports r where r.id = e.community_report_id) as t from public.events e`),
      );
      expect(s.every((x) => x.t === null)).toBe(true);
      expect(await count(who, 'select 1 from public.events e where exists (select 1 from public.community_reports r where r.id = e.community_report_id)')).toBe(0);
      expect(await count(who, 'select 1 from public.ficha_updates where community_report_id is not null')).toBe(0);
    }
  });

  it('grabación tampoco, ni el reporte de su evento asignado', async () => {
    const r = await newReport();
    const cam = await assignedTo('camera');
    const target = cam[cam.length - 1];
    await t.system((sql) => sql.query(`update public.events set community_report_id = coalesce(community_report_id, $1) where id = $2 and obra_ficha_id is null`, [r.id, target]));
    expect(await t.system((sql) => sql.one(`select community_report_id from public.events where id = $1`, [target]))).not.toEqual({ community_report_id: null });
    expect(await count('camera', 'select 1 from public.community_reports')).toBe(0);
    expect(await count('camera', 'select 1 from public.community_report_private')).toBe(0);
  });
});

describe('contactos: solo los roles de cada ficha, y con doble factor', () => {
  it('IVT, jefe, despacho y administración leen y escriben los contactos de una obra', async () => {
    const f = await newObra();
    await t.as('ivt', (sql) =>
      sql.query(`insert into public.obra_ficha_private (id, engineer_phone, reporter_attends, marks) values ($1, '0000-0000501', 'to_confirm', '{"liaison_name": "to_confirm"}')`, [f.id]),
    );
    for (const who of OBRA_ROLES) {
      const p = await t.as(who, (sql) => sql.one<{ engineer_phone: string }>(`select engineer_phone from public.obra_ficha_private where id = $1`, [f.id]));
      expect(p, who).toEqual({ engineer_phone: '0000-0000501' });
      const u = await t.as(who, (sql) => sql.query(`update public.obra_ficha_private set boss_should_know = $2 where id = $1 returning id`, [f.id, `Nota de ${who}`]));
      expect(u, who).toHaveLength(1);
    }
  });

  it('el IVT y el director de política son espejo: cada uno su ficha, sus contactos y su historia, y nada de la otra', async () => {
    const obra = await newObra('ivt');
    const rep = await newReport('politics');
    await t.as('ivt', (sql) => sql.query(`insert into public.obra_ficha_private (id, liaison_phone) values ($1, '0000-0000502')`, [obra.id]));
    await t.as('politics', (sql) => sql.query(`insert into public.community_report_private (id, reporter_phone) values ($1, '0000-0000503')`, [rep.id]));
    // IVT: the obra, its contacts and its history; nothing of the report.
    expect(await count('ivt', 'select 1 from public.obra_ficha_private where id = $1', [obra.id])).toBe(1);
    expect(await count('ivt', 'select 1 from public.ficha_updates where obra_ficha_id = $1', [obra.id])).toBeGreaterThan(0);
    expect(await count('ivt', 'select 1 from public.community_report_private')).toBe(0);
    expect(await count('ivt', 'select 1 from public.ficha_updates where community_report_id is not null')).toBe(0);
    const otherReport = await newReport('boss');
    await fails(t.as('ivt', (sql) => sql.query(`insert into public.community_report_private (id) values ($1)`, [otherReport.id])));
    expect(await t.as('ivt', (sql) => sql.query(`update public.community_reports set title = 'Cambiado por el IVT' where id = $1 returning id`, [rep.id]))).toHaveLength(0);
    // Política: the mirror image.
    expect(await count('politics', 'select 1 from public.community_report_private where id = $1', [rep.id])).toBe(1);
    expect(await count('politics', 'select 1 from public.ficha_updates where community_report_id = $1', [rep.id])).toBeGreaterThan(0);
    expect(await count('politics', 'select 1 from public.obra_ficha_private')).toBe(0);
    expect(await count('politics', 'select 1 from public.ficha_updates where obra_ficha_id is not null')).toBe(0);
    const otherObra = await newObra('boss');
    await fails(t.as('politics', (sql) => sql.query(`insert into public.obra_ficha_private (id) values ($1)`, [otherObra.id])));
    const upd = await t.as('politics', (sql) => sql.query(`update public.obra_fichas set name = 'Cambiada por política' where id = $1 returning id`, [obra.id]));
    expect(upd).toHaveLength(0);
  });

  it('sin doble factor (aal1) nadie ve ni escribe contactos, aunque vea la ficha', async () => {
    const obra = await newObra('ivt');
    const rep = await newReport('politics');
    await t.as('ivt', (sql) => sql.query(`insert into public.obra_ficha_private (id, liaison_phone) values ($1, '0000-0000504')`, [obra.id]));
    await t.as('politics', (sql) => sql.query(`insert into public.community_report_private (id, reporter_phone) values ($1, '0000-0000505')`, [rep.id]));
    for (const who of OBRA_ROLES) {
      expect(await count(who, 'select 1 from public.obra_fichas where id = $1', [obra.id], 'aal1'), who).toBe(1);
      expect(await count(who, 'select 1 from public.obra_ficha_private', [], 'aal1'), who).toBe(0);
      const u = await t.as(who, (sql) => sql.query(`update public.obra_ficha_private set liaison_phone = '0000-0000999' returning id`), 'aal1');
      expect(u, who).toHaveLength(0);
    }
    for (const who of REPORT_ROLES) {
      expect(await count(who, 'select 1 from public.community_report_private', [], 'aal1'), who).toBe(0);
    }
    const bareObra = await newObra('ivt');
    const bareReport = await newReport('politics');
    await fails(t.as('ivt', (sql) => sql.query(`insert into public.obra_ficha_private (id) values ($1)`, [bareObra.id]), 'aal1'));
    await fails(t.as('politics', (sql) => sql.query(`insert into public.community_report_private (id) values ($1)`, [bareReport.id]), 'aal1'));
  });

  it('el que guardó queda como autor aunque escriba otro, y los contactos no se pasan a otra ficha', async () => {
    const a = await newObra();
    const b = await newObra();
    await t.as('ivt', (sql) => sql.query(`insert into public.obra_ficha_private (id, updated_by) values ($1, $2)`, [a.id, t.ids.boss]));
    expect(await t.system((sql) => sql.one(`select updated_by from public.obra_ficha_private where id = $1`, [a.id]))).toEqual({ updated_by: t.ids.ivt });
    await t.as('dispatch', (sql) => sql.query(`update public.obra_ficha_private set reported_via = 'Llamada', updated_by = $2 where id = $1`, [a.id, t.ids.ivt]));
    expect(await t.system((sql) => sql.one(`select updated_by from public.obra_ficha_private where id = $1`, [a.id]))).toEqual({ updated_by: t.ids.dispatch });
    await fails(t.as('ivt', (sql) => sql.query(`update public.obra_ficha_private set id = $2 where id = $1`, [a.id, b.id])), /no se pasan a otra ficha/);
  });
});

describe('borrado lógico: solo administración', () => {
  it('una ficha de obra: el IVT, el jefe y el despacho no la borran; administración sí, y la restaura', async () => {
    const f = await newObra();
    for (const who of ['ivt', 'boss', 'dispatch'] as const) {
      await fails(t.as(who, (sql) => sql.query(`update public.obra_fichas set deleted_at = now() where id = $1`, [f.id])), /Solo un administrador/);
    }
    await t.as('admin', (sql) => sql.query(`update public.obra_fichas set deleted_at = now() where id = $1`, [f.id]));
    for (const who of ['ivt', 'boss', 'dispatch'] as const) expect(await count(who, 'select 1 from public.obra_fichas where id = $1', [f.id]), who).toBe(0);
    expect(await count('admin', 'select 1 from public.obra_fichas where id = $1', [f.id])).toBe(1);
    expect(await t.as('ivt', (sql) => sql.query(`update public.obra_fichas set deleted_at = null where id = $1 returning id`, [f.id]))).toHaveLength(0);
    await t.as('admin', (sql) => sql.query(`update public.obra_fichas set deleted_at = null where id = $1`, [f.id]));
    expect(await count('ivt', 'select 1 from public.obra_fichas where id = $1', [f.id])).toBe(1);
    expect((await history('obra_ficha_id', f.id)).map((h) => [h.kind, h.actor_id])).toEqual(
      expect.arrayContaining([['deleted', t.ids.admin], ['restored', t.ids.admin]]),
    );
  });

  it('un reporte: política, el jefe y el despacho no lo borran; administración sí', async () => {
    const r = await newReport();
    for (const who of ['politics', 'boss', 'dispatch'] as const) {
      await fails(t.as(who, (sql) => sql.query(`update public.community_reports set deleted_at = now() where id = $1`, [r.id])), /Solo un administrador/);
    }
    await t.as('admin', (sql) => sql.query(`update public.community_reports set deleted_at = now() where id = $1`, [r.id]));
    expect(await count('politics', 'select 1 from public.community_reports where id = $1', [r.id])).toBe(0);
    expect(await count('politics', 'select 1 from public.ficha_updates where community_report_id = $1', [r.id])).toBe(0);
  });

  it('nadie borra de verdad una ficha, un contacto ni la historia', async () => {
    for (const table of ['obra_fichas', 'obra_ficha_private', 'community_reports', 'community_report_private', 'ficha_updates']) {
      for (const who of ['admin', 'boss'] as const) await fails(t.as(who, (sql) => sql.query(`delete from public.${table}`)), /permission denied/);
    }
  });
});

describe('municipio, parroquia, marcas y estados', () => {
  it('un municipio que no está en la lista no entra; mientras no hay lista, la parroquia es texto libre (sin espacios de más)', async () => {
    await fails(newObra('ivt', 'Municipio Inventado'), /no está en la lista/);
    await fails(newReport('politics', 'Otro Municipio Inventado'), /no está en la lista/);
    const f = await newObra('ivt', 'Junín', '  Parroquia   escrita a mano (demo) ');
    expect(await t.system((sql) => sql.one(`select parish from public.obra_fichas where id = $1`, [f.id]))).toEqual({ parish: 'Parroquia escrita a mano (demo)' });
    await fails(t.as('ivt', (sql) => sql.query(`update public.obra_fichas set municipality = 'Municipio Inventado' where id = $1`, [f.id])), /no está en la lista/);
  });

  it('con la lista de parroquias de un municipio, solo esas o en blanco; los demás municipios siguen libres', async () => {
    const setParishes = (v: unknown) => t.system((sql) => sql.query(`update public.app_settings set value = $1::text::jsonb where key = 'parishes'`, [JSON.stringify(v)]));
    expect(await t.system((sql) => sql.one(`select value from public.app_settings where key = 'parishes'`))).toEqual({ value: {} });
    await setParishes({ Junín: ['Parroquia Uno (demo)', 'Parroquia Dos (demo)'] });
    try {
      await fails(newObra('ivt', 'Junín', 'Parroquia Tres (demo)'), /no está en la lista de Junín/);
      await fails(newReport('politics', 'Junín', 'Parroquia Tres (demo)'), /no está en la lista de Junín/);
      await newObra('ivt', 'Junín', '');
      await newObra('ivt', 'Junín', 'Parroquia Uno (demo)');
      await newReport('politics', 'Junín', 'Parroquia Dos (demo)');
      await newObra('ivt', 'Torbes', 'Cualquier parroquia (demo)');
      const f = await newObra('ivt', 'Junín', 'Parroquia Uno (demo)');
      await fails(t.as('ivt', (sql) => sql.query(`update public.obra_fichas set parish = 'Parroquia Tres (demo)' where id = $1`, [f.id])), /no está en la lista/);
    } finally {
      await setParishes({});
    }
  });

  it('las marcas solo aceptan «No aplica» y «Por confirmar», con nombres de campo', async () => {
    const f = await newObra();
    const r = await newReport();
    const bad = [{ parish: 'otro' }, { parish: 1 }, { parish: ['to_confirm'] }, { Parish: 'to_confirm' }, { 'parish; drop': 'to_confirm' }];
    for (const marks of bad) {
      await fails(t.as('ivt', (sql) => sql.query(`update public.obra_fichas set marks = $2::text::jsonb where id = $1`, [f.id, JSON.stringify(marks)])));
      await fails(t.as('politics', (sql) => sql.query(`update public.community_reports set marks = $2::text::jsonb where id = $1`, [r.id, JSON.stringify(marks)])));
    }
    await fails(t.as('ivt', (sql) => sql.query(`update public.obra_fichas set marks = '[]' where id = $1`, [f.id])));
    await fails(t.as('ivt', (sql) => sql.query(`insert into public.obra_ficha_private (id, marks) values ($1, '{"liaison_phone": "quizas"}')`, [f.id])));
    await fails(t.as('politics', (sql) => sql.query(`insert into public.community_report_private (id, marks) values ($1, '{"address": true}')`, [r.id])));
    await t.as('ivt', (sql) => sql.query(`update public.obra_fichas set marks = '{"parish": "to_confirm", "people_count": "not_applicable"}' where id = $1`, [f.id]));
    await t.as('ivt', (sql) => sql.query(`insert into public.obra_ficha_private (id, marks) values ($1, '{"liaison_phone": "to_confirm"}')`, [f.id]));
    await t.as('politics', (sql) => sql.query(`update public.community_reports set marks = '{"figures_kind": "to_confirm"}' where id = $1`, [r.id]));
    await t.as('politics', (sql) => sql.query(`insert into public.community_report_private (id, marks) values ($1, '{"activity_at": "not_applicable"}')`, [r.id]));
  });

  it('nadie agenda una obra a mano: no nace «con fecha», no pasa a «con fecha» ni a «realizada», y no sale de ahí', async () => {
    await fails(t.as('ivt', (sql) => sql.query(`insert into public.obra_fichas (name, municipality, stage) values ('Obra que nace agendada (demo)', 'Junín', 'scheduled')`)));
    const f = await newObra();
    const setStage = (who: DemoUserKey, stage: string) => t.as(who, (sql) => sql.query(`update public.obra_fichas set stage = $2 where id = $1 returning stage`, [f.id, stage]));
    expect(await setStage('ivt', 'to_schedule')).toEqual([{ stage: 'to_schedule' }]);
    for (const who of ['ivt', 'boss', 'dispatch', 'admin'] as const) {
      await fails(setStage(who, 'scheduled'), /Ponerle fecha/);
      await fails(setStage(who, 'done'), /Ponerle fecha/);
    }
    // The trusted path (schedule_ficha, 20261027001800) and the system do it.
    await t.as('dispatch', async (sql) => {
      await sql.query(`select set_config('app.trusted_update', 'on', true)`);
      await sql.query(`update public.obra_fichas set stage = 'scheduled' where id = $1`, [f.id]);
    });
    for (const who of ['ivt', 'boss', 'dispatch'] as const) {
      await fails(setStage(who, 'to_schedule'), /Ponerle fecha/);
      await fails(setStage(who, 'archived'), /Ponerle fecha/);
    }
    await t.system((sql) => sql.query(`update public.obra_fichas set stage = 'done' where id = $1`, [f.id]));
    // Outside scheduled/done, the IVT moves it freely (archive instead of delete).
    const g = await newObra();
    const setG = (stage: string) => t.as('ivt', (sql) => sql.query(`update public.obra_fichas set stage = $2 where id = $1 returning stage`, [g.id, stage]));
    expect(await setG('archived')).toEqual([{ stage: 'archived' }]);
    expect(await setG('draft')).toEqual([{ stage: 'draft' }]);
  });

  it('el código, el autor y la fecha de creación de una ficha no cambian, ni para el sistema', async () => {
    const f = await newObra();
    const r = await newReport();
    for (const [who, q] of [
      ['ivt', `update public.obra_fichas set code = 'O-9999' where id = $1`],
      ['boss', `update public.obra_fichas set created_by = '${t.ids.boss}' where id = $1`],
      ['admin', `update public.obra_fichas set created_at = now() - interval '1 day' where id = $1`],
    ] as const) {
      await fails(t.as(who, (sql) => sql.query(q, [f.id])), /no se cambian/);
    }
    await fails(t.as('politics', (sql) => sql.query(`update public.community_reports set code = 'R-9999' where id = $1`, [r.id])), /no se cambian/);
    await fails(t.system((sql) => sql.query(`update public.obra_fichas set code = 'O-9999' where id = $1`, [f.id])), /no se cambian/);
  });

  it('rev sube con cada cambio de verdad, y nadie lo pone a mano', async () => {
    const f = await t.as('ivt', async (sql) => (await sql.one<{ id: string; rev: number }>(`insert into public.obra_fichas (name, municipality, rev) values ('Obra con rev (demo)', 'Junín', 50) returning id, rev`))!);
    expect(f.rev).toBe(1);
    const rev = async () => (await t.system((sql) => sql.one<{ rev: number }>(`select rev from public.obra_fichas where id = $1`, [f.id])))!.rev;
    await t.as('ivt', (sql) => sql.query(`update public.obra_fichas set works = 'Pilotes y losa (demo)' where id = $1`, [f.id]));
    expect(await rev()).toBe(2);
    await t.as('ivt', (sql) => sql.query(`update public.obra_fichas set works = works where id = $1`, [f.id]));
    expect(await rev()).toBe(2);
    await t.as('ivt', (sql) => sql.query(`update public.obra_fichas set rev = 99 where id = $1`, [f.id]));
    expect(await rev()).toBe(2);
    await t.as('ivt', (sql) => sql.query(`insert into public.obra_ficha_private (id) values ($1)`, [f.id]));
    await t.as('dispatch', (sql) => sql.query(`update public.obra_ficha_private set liaison_name = 'Enlace (demo)' where id = $1`, [f.id]));
    expect(await t.system((sql) => sql.one(`select rev from public.obra_ficha_private where id = $1`, [f.id]))).toEqual({ rev: 2 });
  });

  it('un evento nace de una sola ficha, y un archivo tiene un solo dueño', async () => {
    const f = await newObra();
    const r = await newReport();
    const ev = await eventAt(5);
    await fails(t.system((sql) => sql.query(`update public.events set obra_ficha_id = $1, community_report_id = $2 where id = $3`, [f.id, r.id, ev])), /events_one_source/);
    await fails(
      t.system((sql) =>
        sql.query(`insert into public.media_assets (event_id, obra_ficha_id, kind, storage_path) values ($1, $2, 'other', 'prueba/dos-duenos.jpg')`, [ev, f.id]),
      ),
      /media_assets_one_parent/,
    );
    await fails(
      t.system((sql) =>
        sql.query(`insert into public.media_assets (obra_ficha_id, community_report_id, kind, storage_path) values ($1, $2, 'other', 'prueba/dos-fichas.jpg')`, [f.id, r.id]),
      ),
      /media_assets_one_parent/,
    );
  });
});

describe('registro de cambios', () => {
  it('cada tabla nueva queda en el registro; administración con doble factor lo lee y redes no', async () => {
    const f = await newObra();
    const r = await newReport();
    await t.as('ivt', (sql) => sql.query(`insert into public.obra_ficha_private (id, engineer_phone) values ($1, '0000-0000601')`, [f.id]));
    await t.as('politics', (sql) => sql.query(`insert into public.community_report_private (id, reporter_phone) values ($1, '0000-0000602')`, [r.id]));
    await t.as('ivt', (sql) => sql.query(`update public.obra_fichas set sector = 'Sector de prueba (demo)' where id = $1`, [f.id]));
    const tables = ['obra_fichas', 'obra_ficha_private', 'community_reports', 'community_report_private', 'ficha_updates'];
    for (const table of tables) {
      const a = await t.system((sql) => sql.query<{ actor_id: string | null }>(`select actor_id from public.audit_log where table_name = $1`, [table]));
      expect(a.length, table).toBeGreaterThan(0);
    }
    const mine = await t.system((sql) =>
      sql.query<{ action: string; actor_id: string }>(`select action, actor_id from public.audit_log where table_name = 'obra_fichas' and row_id = $1 order by id`, [f.id]),
    );
    expect(mine).toEqual([{ action: 'insert', actor_id: t.ids.ivt }, { action: 'update', actor_id: t.ids.ivt }]);
    for (const who of ['social', 'camera', 'ivt', 'politics'] as const) {
      expect(await count(who, 'select 1 from public.audit_log where table_name = any($1::text[])', [tables]), who).toBe(0);
    }
    expect(await count('admin', 'select 1 from public.audit_log where table_name = any($1::text[])', [tables])).toBeGreaterThan(0);
  });
});

describe('historia de la ficha: solo se agrega', () => {
  it('crear, cambiar el estado, actualizar y cambiar contactos deja cada paso con su autor', async () => {
    const f = await newObra();
    await t.as('ivt', async (sql) => {
      await sql.query(`select set_config('app.history_note', 'Lista para el jefe (demo)', true)`);
      await sql.query(`update public.obra_fichas set stage = 'to_schedule' where id = $1`, [f.id]);
    });
    await t.as('dispatch', (sql) => sql.query(`update public.obra_fichas set works = 'Losa nueva (demo)', progress_pct = 40 where id = $1`, [f.id]));
    await t.as('ivt', (sql) => sql.query(`insert into public.obra_ficha_private (id, liaison_name, liaison_phone) values ($1, 'Enlace de historia (demo)', '0000-0000701')`, [f.id]));
    await t.as('boss', (sql) => sql.query(`update public.obra_ficha_private set liaison_phone = '0000-0000702' where id = $1`, [f.id]));
    await t.system((sql) => sql.query(`update public.obra_fichas set stage = 'scheduled' where id = $1`, [f.id]));
    await t.system((sql) => sql.query(`update public.obra_fichas set stage = 'done' where id = $1`, [f.id]));
    const h = await history('obra_ficha_id', f.id);
    expect(h).toEqual([
      { kind: 'created', from_value: null, to_value: 'draft', fields: [], changes: null, note: null, actor_id: t.ids.ivt },
      { kind: 'status', from_value: 'draft', to_value: 'to_schedule', fields: [], changes: null, note: 'Lista para el jefe (demo)', actor_id: t.ids.ivt },
      { kind: 'update', from_value: null, to_value: null, fields: ['progress_pct', 'works'], changes: { progress_pct: [null, 40], works: ['', 'Losa nueva (demo)'] }, note: null, actor_id: t.ids.dispatch },
      { kind: 'contact', from_value: null, to_value: null, fields: ['liaison_name', 'liaison_phone'], changes: null, note: null, actor_id: t.ids.ivt },
      { kind: 'contact', from_value: null, to_value: null, fields: ['liaison_phone'], changes: null, note: null, actor_id: t.ids.boss },
      { kind: 'scheduled', from_value: 'to_schedule', to_value: 'scheduled', fields: [], changes: null, note: null, actor_id: null },
      { kind: 'done', from_value: 'scheduled', to_value: 'done', fields: [], changes: null, note: null, actor_id: null },
    ]);
    // The note is used once: the next change in the same transaction does not repeat it.
    const r = await newReport();
    await t.as('politics', async (sql) => {
      await sql.query(`select set_config('app.history_note', 'Arrancó la jornada (demo)', true)`);
      await sql.query(`update public.community_reports set status = 'in_progress', results = 'Primeras entregas (demo)' where id = $1`, [r.id]);
      await sql.query(`update public.community_reports set status = 'finished' where id = $1`, [r.id]);
    });
    const hr = await history('community_report_id', r.id);
    const rows = (x: unknown[][]) => x.map((y) => JSON.stringify(y)).sort();
    expect(rows(hr.map((x) => [x.kind, x.from_value, x.to_value, x.fields, x.note, x.actor_id]))).toEqual(
      rows([
        ['created', null, 'planned', [], null, t.ids.politics],
        ['status', 'planned', 'in_progress', [], 'Arrancó la jornada (demo)', t.ids.politics],
        ['update', null, null, ['results'], null, t.ids.politics],
        ['status', 'in_progress', 'finished', [], null, t.ids.politics],
      ]),
    );
  });

  it('la historia no se cambia ni se borra: ningún rol, ni el dueño de la tabla, ni el sistema', async () => {
    const f = await newObra();
    for (const who of ALL) {
      await fails(t.as(who, (sql) => sql.query(`update public.ficha_updates set note = 'reescrita' where obra_ficha_id = $1`, [f.id])), /permission denied/);
      await fails(t.as(who, (sql) => sql.query(`delete from public.ficha_updates where obra_ficha_id = $1`, [f.id])), /permission denied/);
    }
    await fails(t.system((sql) => sql.query(`update public.ficha_updates set note = 'reescrita' where obra_ficha_id = $1`, [f.id])), /no se borra ni se cambia/);
    await fails(t.system((sql) => sql.query(`delete from public.ficha_updates where obra_ficha_id = $1`, [f.id])), /no se borra ni se cambia/);
    await fails(t.system((sql) => sql.query(`truncate public.ficha_updates`)), /no se borra ni se cambia/);
    expect(await count('ivt', 'select 1 from public.ficha_updates where obra_ficha_id = $1', [f.id])).toBe(1);
  });

  it('a mano solo se agrega una nota, propia y de ahora, en una ficha de su rol', async () => {
    const f = await newObra();
    const r = await newReport();
    const note = (who: DemoUserKey, cols: string, vals: string, params: unknown[]) =>
      t.as(who, (sql) => sql.query(`insert into public.ficha_updates (${cols}) values (${vals}) returning kind, actor_id`, params));
    expect(await note('ivt', 'obra_ficha_id, kind, note', `$1, 'note', 'Llamé al residente (demo)'`, [f.id])).toEqual([{ kind: 'note', actor_id: t.ids.ivt }]);
    expect(await note('politics', 'community_report_id, kind, note', `$1, 'note', 'Pendiente la segunda entrega (demo)'`, [r.id])).toEqual([{ kind: 'note', actor_id: t.ids.politics }]);
    expect(await note('boss', 'obra_ficha_id, kind, note', `$1, 'note', 'Visto (demo)'`, [f.id])).toHaveLength(1);
    await fails(note('ivt', 'obra_ficha_id, kind, from_value, to_value', `$1, 'status', 'draft', 'done'`, [f.id]));
    await fails(note('ivt', 'obra_ficha_id, kind, note', `$1, 'scheduled', 'Agendada (falso)'`, [f.id]));
    await fails(note('ivt', 'obra_ficha_id, kind, note, actor_id', `$1, 'note', 'A nombre de otro', $2`, [f.id, t.ids.boss]));
    await fails(note('ivt', 'obra_ficha_id, kind, note, fields', `$1, 'note', 'Con campos', '{works}'`, [f.id]));
    await fails(note('ivt', 'obra_ficha_id, kind, note, changes', `$1, 'note', 'Con cambios', '{"works": ["a", "b"]}'`, [f.id]));
    await fails(note('ivt', 'obra_ficha_id, kind, note, created_at', `$1, 'note', 'Con fecha vieja', now() - interval '1 day'`, [f.id]));
    await fails(note('ivt', 'obra_ficha_id, kind', `$1, 'note'`, [f.id]));
    await fails(note('ivt', 'community_report_id, kind, note', `$1, 'note', 'Nota del IVT en un reporte'`, [r.id]));
    await fails(note('politics', 'obra_ficha_id, kind, note', `$1, 'note', 'Nota de política en una obra'`, [f.id]));
    await linkObra(f.id, (await assignedTo('camera'))[0]);
    for (const who of ['social', 'camera'] as const) {
      await fails(note(who, 'obra_ficha_id, kind, note', `$1, 'note', 'Nota de quien no debe'`, [f.id]));
    }
  });

  it('redes y grabación no leen la historia, ni la de una obra que sí ven', async () => {
    const f = await newObra();
    await linkObra(f.id, (await assignedTo('camera'))[0]);
    expect(await count('camera', 'select 1 from public.obra_fichas where id = $1', [f.id])).toBe(1);
    expect(await count('social', 'select 1 from public.obra_fichas where id = $1', [f.id])).toBe(1);
    for (const who of ['social', 'social2', 'camera', 'camera2'] as const) expect(await count(who, 'select 1 from public.ficha_updates'), who).toBe(0);
  });

  it('en la historia no queda ningún teléfono, ningún nombre de contacto ni la fecha o el lugar de la visita', async () => {
    const f = await newObra();
    const secrets = ['0000-0000801', '0000-0000802', '0000-0000803', 'Enlace secreto (demo)', 'Persona que denunció (demo)', 'Representante (demo)', 'Lo que el jefe debe saber (demo)'];
    await t.as('ivt', (sql) =>
      sql.query(
        `insert into public.obra_ficha_private (id, engineer_phone, liaison_phone, liaison_name, reporter_name, representative, boss_should_know) values ($1, $2, $3, $4, $5, $6, $7)`,
        [f.id, secrets[0], secrets[1], secrets[3], secrets[4], secrets[5], secrets[6]],
      ),
    );
    await t.as('dispatch', (sql) => sql.query(`update public.obra_ficha_private set liaison_phone = $2 where id = $1`, [f.id, secrets[2]]));
    // The visit: an event with its date and place, linked as schedule_ficha does.
    const ev = (await assignedTo('camera'))[0];
    const sch = (await t.system((sql) =>
      sql.one<{ day: string; hm: string; address: string; contacts: string }>(
        `select to_char(starts_at, 'YYYY-MM-DD') as day, to_char(starts_at at time zone 'America/Caracas', 'HH24:MI') as hm, exact_address as address, site_contacts as contacts
           from public.event_schedule where event_id = $1`,
        [ev],
      ),
    ))!;
    await linkObra(f.id, ev);
    await t.system((sql) => sql.query(`update public.obra_fichas set stage = 'scheduled' where id = $1`, [f.id]));
    const r = await newReport();
    const rSecrets = ['0000-0000804', 'Persona del reporte (demo)', 'Calle de prueba 1 (demo)', 'Frente a la plaza (demo)'];
    await t.as('politics', (sql) =>
      sql.query(
        `insert into public.community_report_private (id, reporter_phone, reporter_name, address, reference, activity_at) values ($1, $2, $3, $4, $5, '2026-11-03T14:30:00Z')`,
        [r.id, ...rSecrets],
      ),
    );
    const json = await t.system((sql) =>
      sql.query<{ j: string }>(
        `select jsonb_build_object('fields', fields, 'changes', changes, 'note', note, 'from', from_value, 'to', to_value)::text as j
           from public.ficha_updates where obra_ficha_id = $1 or community_report_id = $2`,
        [f.id, r.id],
      ),
    );
    const all = json.map((x) => x.j).join('\n');
    expect(json.length).toBeGreaterThanOrEqual(5);
    for (const s of [...secrets, ...rSecrets, '2026-11-03', '14:30', sch.day, sch.hm, sch.address, sch.contacts].filter(Boolean)) expect(all, s).not.toContain(s);
    // The contact rows name the fields, never their values.
    const contacts = await t.system((sql) =>
      sql.query<{ fields: string[]; changes: unknown }>(`select fields, changes from public.ficha_updates where kind = 'contact' and community_report_id = $1`, [r.id]),
    );
    expect(contacts).toEqual([{ fields: ['activity_at', 'address', 'reference', 'reporter_name', 'reporter_phone'], changes: null }]);
  });
});
