// Fixes of the review of the fichas and the material (supabase/migrations/20261027001950_fichas_media_fixes.sql), tried
// against the database: nobody joins an event to a ficha by hand, a rejected visit closes the obra to Redes and
// Grabación again, the code and creation time of a ficha are the database's, «Lo que voy a decir» never lands in the
// history JSON, Redes changes only the files it can read, and política learns «Ya tiene fecha» without the date. All
// data here is invented.
import { describe, it, expect, beforeAll } from 'vitest';
import { makeTestDb, type TestDb } from './setup';
import type { DemoUserKey } from '@/lib/db/seed-demo';

let t: TestDb;
beforeAll(async () => {
  t = await makeTestDb();
});

const fails = async (p: Promise<unknown>, msg?: RegExp) => {
  if (msg) await expect(p).rejects.toThrow(msg);
  else await expect(p).rejects.toThrow();
};
const count = async (who: DemoUserKey, q: string, params: unknown[] = []) =>
  (await t.as(who, (sql) => sql.one<{ n: number }>(`select count(*)::int as n from (${q}) x`, params)))!.n;
let n = 0;
const newObra = (who: DemoUserKey = 'ivt') =>
  t.as(who, async (sql) =>
    (await sql.one<{ id: string; code: string }>(`insert into public.obra_fichas (name, municipality) values ($1, 'Junín') returning id, code`, [
      `Obra de revisión ${++n} (demo)`,
    ]))!,
  );
const newReport = (who: DemoUserKey = 'politics') =>
  t.as(who, async (sql) =>
    (await sql.one<{ id: string; code: string }>(`insert into public.community_reports (title, municipality, type) values ($1, 'Torbes', 'repair') returning id, code`, [
      `Reporte de revisión ${++n} (demo)`,
    ]))!,
  );
let pathN = 0;
const upload = (who: DemoUserKey, kind: string, where: { event?: string; obra?: string; report?: string }) =>
  t.as(who, async (sql) =>
    (await sql.one<{ id: string }>(
      `insert into public.media_assets (event_id, obra_ficha_id, community_report_id, kind, mime, storage_path, label, uploaded_by)
       values ($1, $2, $3, $4, 'image/jpeg', $5, 'Original (demo)', auth.uid()) returning id`,
      [where.event ?? null, where.obra ?? null, where.report ?? null, kind, `revision/${++pathN}-${crypto.randomUUID()}.jpg`],
    ))!.id,
  );
// An event assigned to camera2 and not to camera.
const cam2Event = async () =>
  (await t.system((sql) =>
    sql.one<{ id: string }>(
      `select e.id from public.events e join public.event_assignments a on a.event_id = e.id and a.user_id = $1
        where e.community_report_id is null
          and not exists (select 1 from public.event_assignments b where b.event_id = e.id and b.user_id = $2)
        order by e.code limit 1`,
      [t.ids.camera2, t.ids.camera],
    ),
  ))!.id;

describe('un evento se une a una ficha solo por el camino de confianza', () => {
  it('ni el despacho ni administración (ni nadie) unen o cambian a mano la ficha de un evento', async () => {
    const obra = await newObra();
    const report = await newReport();
    const ev = await cam2Event();
    for (const who of ['dispatch', 'admin', 'boss', 'social'] as const) {
      await fails(t.as(who, (sql) => sql.query(`update public.events set obra_ficha_id = $1 where id = $2`, [obra.id, ev])), /Ponerle fecha|No puedes cambiar/);
      await fails(t.as(who, (sql) => sql.query(`update public.events set community_report_id = $1 where id = $2`, [report.id, ev])), /Ponerle fecha|No puedes cambiar/);
    }
    // Grabación does not update events at all (the row is not even offered to it).
    expect(await t.as('camera2', (sql) => sql.query(`update public.events set obra_ficha_id = $1 where id = $2 returning id`, [obra.id, ev]))).toEqual([]);
    // Nor an event that is born joined to a ficha.
    for (const who of ['dispatch', 'admin'] as const) {
      await fails(
        t.as(who, (sql) =>
          sql.query(`insert into public.events (title, municipality, created_by, obra_ficha_id) values ('Visita a mano (demo)', 'Junín', auth.uid(), $1)`, [obra.id]),
        ),
        /Ponerle fecha/,
      );
    }
    // Redes and Grabación still do not see the draft obra.
    for (const who of ['social', 'camera2'] as const) expect(await count(who, 'select 1 from public.obra_fichas where id = $1', [obra.id]), who).toBe(0);
    // The other columns of the event still change as before.
    await t.as('dispatch', (sql) => sql.query(`update public.events set summary = 'Resumen corregido (demo)' where id = $1`, [ev]));
    // The system (the seed) and a trusted path (schedule_ficha) do join it, and undo it.
    await t.system((sql) => sql.query(`update public.events set obra_ficha_id = $1 where id = $2`, [obra.id, ev]));
    await t.as('dispatch', async (sql) => {
      await sql.query(`select set_config('app.trusted_update', 'on', true)`);
      await sql.query(`update public.events set obra_ficha_id = null where id = $1`, [ev]);
    });
    expect(await t.system((sql) => sql.one(`select obra_ficha_id from public.events where id = $1`, [ev]))).toEqual({ obra_ficha_id: null });
  });
});

describe('Redes y Grabación leen una obra solo mientras su visita está viva', () => {
  it('cuando el jefe rechaza la visita, la obra y sus fotos se cierran para ellos; si la acepta, se abren otra vez', async () => {
    const obra = await newObra();
    const ev = await cam2Event();
    await t.system((sql) => sql.query(`update public.events set obra_ficha_id = $1, boss_decision = 'accepted' where id = $2`, [obra.id, ev]));
    const photo = await upload('ivt', 'before', { obra: obra.id });
    // The obra: its row for its roles, visit_obra_ficha() (the tab's columns) for Redes and Grabación.
    const sees = async (who: DemoUserKey) => [
      await count(who, 'select 1 where exists (select 1 from public.obra_fichas where id = $1) or exists (select 1 from public.visit_obra_ficha($1))', [obra.id]),
      await count(who, 'select 1 from public.media_assets where obra_ficha_id = $1', [obra.id]),
    ];
    for (const who of ['social', 'camera2'] as const) expect(await sees(who), who).toEqual([1, 1]);
    expect(await sees('camera')).toEqual([0, 0]);
    await t.as('boss', (sql) => sql.query(`update public.events set boss_decision = 'rejected' where id = $1`, [ev]));
    // A document added after the rejection stays closed too.
    const doc = await upload('ivt', 'document', { obra: obra.id });
    for (const who of ['social', 'social2', 'camera2'] as const) {
      expect(await sees(who), who).toEqual([0, 0]);
      expect(await count(who, 'select 1 from public.media_assets where id = any($1::uuid[])', [[photo, doc]]), who).toBe(0);
    }
    // The obra's own roles keep everything.
    for (const who of ['ivt', 'boss', 'dispatch'] as const) expect(await sees(who), who).toEqual([1, 2]);
    await t.as('boss', (sql) => sql.query(`update public.events set boss_decision = 'accepted' where id = $1`, [ev]));
    // The photo again, never the document (20261027002100_obra_documents.sql: papers stay with the obra roles).
    for (const who of ['social', 'camera2'] as const) expect(await sees(who), who).toEqual([1, 1]);
  });
});

describe('el código y la fecha de creación de una ficha los pone la base', () => {
  it('nadie elige el código de una ficha: ni el de un evento, ni uno con fecha, ni el número que sigue', async () => {
    const e = await t.as('ivt', (sql) => sql.one<{ code: string }>(`insert into public.obra_fichas (code, name, municipality) values ('E-0002', 'Obra con código ajeno (demo)', 'Junín') returning code`));
    expect(e!.code).toMatch(/^O-\d{4}$/);
    const r = await t.as('politics', (sql) =>
      sql.one<{ code: string }>(`insert into public.community_reports (code, title, municipality, type) values ('R-2026-10-30', 'Reporte con fecha en el código (demo)', 'Torbes', 'other') returning code`),
    );
    expect(r!.code).toMatch(/^R-\d{4}$/);
    // Taking «the next number» does not break the next person's save.
    const next = `O-${String(Number(e!.code.slice(2)) + 1).padStart(4, '0')}`;
    const squat = await t.as('ivt', (sql) => sql.one<{ code: string }>(`insert into public.obra_fichas (code, name, municipality) values ($1, 'Obra que aparta un número (demo)', 'Junín') returning code`, [next]));
    expect(squat!.code).toBe(next); // it got that number because it was its turn, not because it asked
    const after = await newObra('boss');
    expect(after.code).toMatch(/^O-\d{4}$/);
    expect(after.code).not.toBe(next);
    // Numbers are not skipped: each insert takes exactly one.
    expect(Number(after.code.slice(2))).toBe(Number(next.slice(2)) + 1);
  });

  it('nadie pone una ficha con fecha de creación vieja', async () => {
    const f = await t.as('ivt', (sql) =>
      sql.one<{ created_at: Date; updated_at: Date }>(
        `insert into public.obra_fichas (name, municipality, created_at, updated_at) values ('Obra con fecha vieja (demo)', 'Junín', '2020-01-01', '2020-01-01') returning created_at, updated_at`,
      ),
    );
    const r = await t.as('politics', (sql) =>
      sql.one<{ created_at: Date }>(`insert into public.community_reports (title, municipality, type, created_at) values ('Reporte con fecha vieja (demo)', 'Torbes', 'other', '2020-01-01') returning created_at`),
    );
    for (const d of [f!.created_at, f!.updated_at, r!.created_at]) expect(new Date(d).getFullYear()).toBeGreaterThan(2020);
  });

  it('las secuencias de los códigos no las usa nadie de la API; el sistema pone un código solo si tiene la forma O-0001 / R-0001', async () => {
    for (const who of ['ivt', 'politics', 'admin'] as const) {
      await fails(t.as(who, (sql) => sql.query(`select nextval('public.obra_code_seq')`)), /permission denied/);
      await fails(t.as(who, (sql) => sql.query(`select nextval('public.report_code_seq')`)), /permission denied/);
    }
    const sys = await t.system((sql) => sql.one<{ code: string }>(`insert into public.obra_fichas (name, municipality) values ('Obra del sistema (demo)', 'Junín') returning code`));
    expect(sys!.code).toMatch(/^O-\d{4}$/);
    await fails(t.system((sql) => sql.query(`insert into public.obra_fichas (code, name, municipality) values ('E-0002', 'Obra mal numerada (demo)', 'Junín')`)), /obra_fichas_code_shape/);
    await fails(
      t.system((sql) => sql.query(`insert into public.community_reports (code, title, municipality, type) values ('R-2026-10-30', 'Reporte mal numerado (demo)', 'Torbes', 'other')`)),
      /community_reports_code_shape/,
    );
  });
});

describe('«Lo que voy a decir» en la historia', () => {
  it('queda el nombre del campo, nunca el texto (por si alguien escribió un dato de más)', async () => {
    const f = await newObra();
    // A phone is refused by the database itself (obra_fichas_main_no_phone, 20261028002100_privacy_hardening.sql).
    await expect(t.as('ivt', (sql) => sql.query(`update public.obra_fichas set fab_dialog = 'Llamen al enlace al 0000-0000777 (demo).' where id = $1`, [f.id]))).rejects.toThrow(/obra_fichas_main_no_phone/);
    const text = 'Saludos. Gracias al enlace ZQSECRETO777 (demo).';
    await t.as('ivt', (sql) => sql.query(`update public.obra_fichas set fab_dialog = $2, fab_generated_by = 'manual', works = 'Pilotes (demo)' where id = $1`, [f.id, text]));
    const rows = await t.system((sql) =>
      sql.query<{ fields: string[]; changes: Record<string, unknown> }>(`select fields, changes from public.ficha_updates where obra_ficha_id = $1 and kind = 'update'`, [f.id]),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].fields).toEqual(['fab_dialog', 'fab_generated_by', 'works']);
    expect(Object.keys(rows[0].changes).sort()).toEqual(['fab_generated_by', 'works']);
    expect(JSON.stringify(rows)).not.toContain('ZQSECRETO777');
    // Only the dialog changed: still one row, with an empty changes object.
    await t.as('ivt', (sql) => sql.query(`update public.obra_fichas set fab_dialog = 'Saludos (demo).' where id = $1`, [f.id]));
    const last = await t.system((sql) =>
      sql.query<{ fields: string[]; changes: unknown }>(`select fields, changes from public.ficha_updates where obra_ficha_id = $1 and kind = 'update' order by created_at desc, id`, [f.id]),
    );
    expect(last.some((r) => r.fields.length === 1 && r.fields[0] === 'fab_dialog' && JSON.stringify(r.changes) === '{}')).toBe(true);
  });
});

describe('cambiar un archivo: solo lo que cada quien puede ver', () => {
  it('Redes no le cambia el nombre a la evidencia de un reporte ni a las fotos de una obra que no ve, ni con un UPDATE sin WHERE', async () => {
    const report = await newReport();
    const obra = await newObra();
    const evidence = await upload('politics', 'document', { report: report.id });
    const photo = await upload('ivt', 'before', { obra: obra.id });
    expect(await count('social', 'select 1 from public.media_assets where id = any($1::uuid[])', [[evidence, photo]])).toBe(0);
    await t.as('social', (sql) => sql.query(`update public.media_assets set label = 'Cambiado por redes'`));
    const labels = await t.system((sql) => sql.query<{ label: string }>(`select label from public.media_assets where id = any($1::uuid[])`, [[evidence, photo]]));
    expect(labels.map((r) => r.label)).toEqual(['Original (demo)', 'Original (demo)']);
    // What Redes does see (an event's material) it can still name.
    const ev = await cam2Event();
    const raw = await upload('camera2', 'broll', { event: ev });
    expect(await t.as('social', (sql) => sql.query(`update public.media_assets set label = 'Tomas de apoyo (demo)' where id = $1 returning id`, [raw]))).toHaveLength(1);
    // The boss, admin and the uploader keep their rights.
    expect(await t.as('boss', (sql) => sql.query(`update public.media_assets set label = 'Del jefe (demo)' where id = $1 returning id`, [evidence]))).toHaveLength(1);
    expect(await t.as('admin', (sql) => sql.query(`update public.media_assets set label = 'De administración (demo)' where id = $1 returning id`, [photo]))).toHaveLength(1);
    expect(await t.as('politics', (sql) => sql.query(`update public.media_assets set label = 'De política (demo)' where id = $1 returning id`, [evidence]))).toHaveLength(1);
  });
});

describe('«Ya tiene fecha» para política, sin la fecha', () => {
  it('política sabe si su reporte ya tiene una visita con fecha, sin leer el evento; los demás roles no preguntan', async () => {
    const linked = (await t.system((sql) =>
      sql.one<{ id: string; ev: string }>(`select community_report_id as id, id as ev from public.events where community_report_id is not null order by code limit 1`),
    ))!;
    const other = await newReport();
    const ask = (who: DemoUserKey, id: string) => t.as(who, async (sql) => (await sql.one<{ x: boolean }>(`select public.report_has_live_event($1) as x`, [id]))!.x);
    for (const who of ['politics', 'boss', 'dispatch', 'admin'] as const) {
      expect(await ask(who, linked.id), who).toBe(true);
      expect(await ask(who, other.id), who).toBe(false);
    }
    for (const who of ['social', 'camera', 'ivt'] as const) expect(await ask(who, linked.id), who).toBe(false);
    // Política reads only the activities born from its reports, and never a schedule.
    const fromReports = (await t.system((sql) => sql.one<{ n: number }>(`select count(*)::int as n from public.events where community_report_id is not null and deleted_at is null`)))!.n;
    expect(await count('politics', 'select 1 from public.events')).toBe(fromReports);
    expect(await count('politics', 'select 1 from public.events where community_report_id is null')).toBe(0);
    expect(await count('politics', 'select 1 from public.event_schedule')).toBe(0);
    // A rejected visit is not «Ya tiene fecha».
    await t.as('boss', (sql) => sql.query(`update public.events set boss_decision = 'rejected' where id = $1`, [linked.ev]));
    expect(await ask('politics', linked.id)).toBe(false);
    await t.as('boss', (sql) => sql.query(`update public.events set boss_decision = 'accepted' where id = $1`, [linked.ev]));
  });
});
