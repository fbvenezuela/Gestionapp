// The shared agenda (supabase/migrations/20261027002000_shared_agenda.sql), tried against the database: the boss and
// despacho write the agenda together (and only they, with 2FA), what the boss creates is accepted at once and what
// despacho creates waits for him, «Ponerle fecha» is the only way a ficha becomes an event, the IVT sees the date of
// its obra visits only, política and Redes never see a date, cancelling puts the ficha back in «Por ponerle fecha»
// and the history is for the boss and despacho alone. All data here is invented.
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
const count = async (who: DemoUserKey, q: string, params: unknown[] = [], aal: 'aal1' | 'aal2' = 'aal2') =>
  (await t.as(who, (sql) => sql.one<{ n: number }>(`select count(*)::int as n from (${q}) x`, params), aal))!.n;
let n = 0;
const readyObra = () =>
  t.as('ivt', async (sql) =>
    (await sql.one<{ id: string }>(`insert into public.obra_fichas (name, municipality, stage) values ($1, 'Junín', 'to_schedule') returning id`, [
      `Obra de la agenda ${++n} (demo)`,
    ]))!.id,
  );
const agendaReport = () =>
  t.as('politics', async (sql) =>
    (await sql.one<{ id: string }>(`insert into public.community_reports (title, municipality, type, wants_agenda) values ($1, 'Torbes', 'event', true) returning id`, [
      `Asamblea de la agenda ${++n} (demo)`,
    ]))!.id,
  );
const SCHEDULE = `select public.schedule_ficha($1, $2, $3, 'Sitio de prueba (demo)', now() + interval '20 days', now() + interval '20 days 1 hour',
  'Calle de prueba 1 (demo)', 'Al lado de la plaza (demo)', 'Vocera (demo) 0000-0000901', $4::text::jsonb) as id`;
const schedule = (who: DemoUserKey, kind: 'obra' | 'community', id: string, aal: 'aal1' | 'aal2' = 'aal2') =>
  t.as(who, async (sql) => (await sql.one<{ id: string }>(SCHEDULE, [kind, id, `Visita de prueba ${++n}`, JSON.stringify({ work_description: 'Trabajos (demo)' })]))!.id, aal);
const insertEvent = (who: DemoUserKey, extra = '', aal: 'aal1' | 'aal2' = 'aal2') =>
  t.as(who, async (sql) =>
    (await sql.one<{ id: string; boss_decision: string; priority: number | null; origin: string; work_status: string }>(
      `insert into public.events (title, place_name, created_by${extra ? ', boss_decision, priority, work_status' : ''})
       values ($1, 'Sitio de prueba (demo)', auth.uid()${extra}) returning id, boss_decision, priority, origin, work_status`,
      [`Evento de la agenda ${++n} (demo)`],
    ))!,
  aal);
const event = (id: string) => t.system((sql) => sql.one<Record<string, unknown>>(`select * from public.events where id = $1`, [id]));

describe('el jefe y el despacho comparten la agenda', () => {
  it('lo que crea el jefe queda aceptado y suyo; lo que crea el despacho espera al jefe, aunque diga «aceptado»', async () => {
    const b = await insertEvent('boss', `, 'pending', 9, 'published'`);
    expect(b).toMatchObject({ boss_decision: 'accepted', priority: 9, origin: 'boss', work_status: 'brief' });
    const d = await insertEvent('dispatch', `, 'accepted', 10, 'published'`);
    expect(d).toMatchObject({ boss_decision: 'pending', priority: null, origin: 'dispatch', work_status: 'brief' });
    // Nothing is born cancelled, done or as a community activity by hand.
    await fails(t.as('dispatch', (sql) => sql.query(`insert into public.events (title, created_by, kind) values ('Actividad a mano (demo)', auth.uid(), 'community')`)), /reporte/);
    const c = await t.as('dispatch', (sql) =>
      sql.one<Record<string, unknown>>(`insert into public.events (title, created_by, cancelled_at, cancel_reason, done_on) values ('Evento trampa (demo)', auth.uid(), now(), 'x', current_date) returning id, cancelled_at, cancel_reason`),
    );
    expect(c).toMatchObject({ cancelled_at: null, cancel_reason: '' });
    // done_on is not readable as a column (20261028002100_privacy_hardening.sql): the system reads it.
    expect((await event(String(c!.id)))!.done_on).toBeNull();
  });

  it('nadie más crea eventos: ni administración, ni Redes, ni Grabación, ni el IVT, ni política; el jefe sin doble factor tampoco', async () => {
    for (const who of ['admin', 'social', 'camera', 'ivt', 'politics'] as const) await fails(insertEvent(who), undefined);
    await fails(insertEvent('boss', '', 'aal1'));
    await fails(insertEvent('dispatch', '', 'aal1'));
  });

  it('el despacho no decide ni califica; el jefe sí, y los dos cambian los datos del evento (el último gana)', async () => {
    const { id } = await insertEvent('dispatch');
    await fails(t.as('dispatch', (sql) => sql.query(`update public.events set boss_decision = 'accepted' where id = $1`, [id])), /No puedes cambiar/);
    await fails(t.as('dispatch', (sql) => sql.query(`update public.events set priority = 5 where id = $1`, [id])), /No puedes cambiar/);
    expect(await t.as('boss', (sql) => sql.query(`update public.events set boss_decision = 'accepted', priority = 8 where id = $1 returning id`, [id]))).toHaveLength(1);
    expect(await t.as('boss', (sql) => sql.query(`update public.events set title = 'Título del jefe (demo)' where id = $1 returning id`, [id]))).toHaveLength(1);
    expect(await t.as('dispatch', (sql) => sql.query(`update public.events set title = 'Título del despacho (demo)', summary = 'Resumen (demo)' where id = $1 returning id`, [id]))).toHaveLength(1);
    const e = await event(id);
    expect(e).toMatchObject({ title: 'Título del despacho (demo)', boss_decision: 'accepted', priority: 8, updated_by: t.ids.dispatch });
  });

  it('nadie cambia quién lo propuso, quién lo creó, el día realizado ni el código', async () => {
    const { id } = await insertEvent('dispatch');
    for (const [who, set] of [
      ['boss', `origin = 'boss'`], ['dispatch', `created_by = '${t.ids.boss}'`], ['boss', `done_on = current_date`], ['dispatch', `code = 'E-9999'`],
    ] as const) {
      await fails(t.as(who, (sql) => sql.query(`update public.events set ${set} where id = $1`, [id])), /No puedes cambiar/);
    }
  });

  it('administración solo borra (lógico) y restaura; Redes solo el estado de trabajo', async () => {
    const { id } = await insertEvent('dispatch');
    await fails(t.as('admin', (sql) => sql.query(`update public.events set title = 'Título de administración (demo)' where id = $1`, [id])), /No puedes cambiar/);
    await fails(t.as('admin', (sql) => sql.query(`update public.events set cancelled_at = now() where id = $1`, [id])), /No puedes cambiar/);
    expect(await t.as('admin', (sql) => sql.query(`update public.events set deleted_at = now() where id = $1 returning id`, [id]))).toHaveLength(1);
    expect(await t.as('admin', (sql) => sql.query(`update public.events set deleted_at = null where id = $1 returning id`, [id]))).toHaveLength(1);
    expect(await t.as('social', (sql) => sql.query(`update public.events set work_status = 'storyboard' where id = $1 returning id`, [id]))).toHaveLength(1);
    await fails(t.as('social', (sql) => sql.query(`update public.events set title = 'x (demo)' where id = $1`, [id])), /No puedes cambiar/);
  });

  it('rev y quién guardó cambian con cada guardado de verdad; un cambio de fecha no toca el evento', async () => {
    const { id } = await insertEvent('dispatch');
    await t.as('dispatch', (sql) => sql.query(`insert into public.event_schedule (event_id, starts_at, ends_at) values ($1, now() + interval '9 days', now() + interval '9 days 1 hour')`, [id]));
    const before = await event(id);
    expect(before!.rev).toBe(1);
    await t.as('boss', (sql) => sql.query(`update public.events set summary = 'Cambio del jefe (demo)' where id = $1`, [id]));
    const after = await event(id);
    expect(after).toMatchObject({ rev: 2, updated_by: t.ids.boss });
    // Saving the same value again is not a change.
    await t.as('boss', (sql) => sql.query(`update public.events set summary = 'Cambio del jefe (demo)' where id = $1`, [id]));
    expect((await event(id))!.rev).toBe(2);
    // Nobody sets rev by hand.
    await t.as('boss', (sql) => sql.query(`update public.events set rev = 99 where id = $1`, [id]));
    expect((await event(id))!.rev).toBe(2);
    // Moving the date: the schedule's rev and author change; the event (which Redes reads, live) does not.
    const updatedAt = (await event(id))!.updated_at;
    await t.as('boss', (sql) => sql.query(`update public.event_schedule set starts_at = starts_at + interval '1 hour', ends_at = ends_at + interval '1 hour' where event_id = $1`, [id]));
    const sch = await t.system((sql) => sql.one(`select rev, updated_by from public.event_schedule where event_id = $1`, [id]));
    expect(sch).toEqual({ rev: 2, updated_by: t.ids.boss });
    const e = await event(id);
    expect(e!.rev).toBe(2);
    expect(e!.updated_at).toEqual(updatedAt);
  });

  it('lo que el sistema inserta (la demo, las tareas) conserva su decisión y su estado', async () => {
    const r = await t.system((sql) =>
      sql.one(`insert into public.events (title, boss_decision, priority, work_status) values ('Evento del sistema (demo)', 'accepted', 7, 'editing') returning boss_decision, priority, work_status, origin`),
    );
    expect(r).toEqual({ boss_decision: 'accepted', priority: 7, work_status: 'editing', origin: 'dispatch' });
    // The seed's six events keep theirs, and the obra and report links set their kind and origin.
    const seeded = await t.system((sql) => sql.query<{ kind: string; origin: string }>(`select kind, origin from public.events where obra_ficha_id is not null or community_report_id is not null order by code`));
    expect(seeded).toEqual([{ kind: 'obra_visit', origin: 'ivt' }, { kind: 'community', origin: 'politics' }]);
  });
});

describe('la fecha: solo el jefe y el despacho la ponen', () => {
  it('nadie más inserta ni cambia event_schedule; sin doble factor tampoco ellos', async () => {
    const { id } = await insertEvent('dispatch');
    for (const who of ['admin', 'social', 'camera', 'ivt', 'politics'] as const) {
      await fails(t.as(who, (sql) => sql.query(`insert into public.event_schedule (event_id, starts_at, ends_at) values ($1, now(), now() + interval '1 hour')`, [id])));
    }
    await fails(t.as('boss', (sql) => sql.query(`insert into public.event_schedule (event_id, starts_at, ends_at) values ($1, now(), now() + interval '1 hour')`, [id]), 'aal1'));
    expect(await t.as('boss', (sql) => sql.query(`insert into public.event_schedule (event_id, starts_at, ends_at) values ($1, now() + interval '5 days', now() + interval '5 days 1 hour') returning event_id`, [id]))).toHaveLength(1);
    for (const who of ['admin', 'social', 'camera', 'ivt', 'politics'] as const) {
      expect(await t.as(who, (sql) => sql.query(`update public.event_schedule set exact_address = 'x' where event_id = $1 returning event_id`, [id])), who).toEqual([]);
    }
    expect(await t.as('dispatch', (sql) => sql.query(`update public.event_schedule set exact_address = 'Dirección nueva (demo)' where event_id = $1 returning event_id`, [id]))).toHaveLength(1);
  });

  it('la ficha técnica: la escriben el jefe y el despacho; administración ya no', async () => {
    const { id } = await insertEvent('boss');
    await fails(t.as('admin', (sql) => sql.query(`insert into public.event_brief (event_id, work_description) values ($1, 'x')`, [id])));
    expect(await t.as('boss', (sql) => sql.query(`insert into public.event_brief (event_id, work_description) values ($1, 'Del jefe (demo)') returning event_id`, [id]))).toHaveLength(1);
    expect(await t.as('dispatch', (sql) => sql.query(`update public.event_brief set work_description = 'Del despacho (demo)' where event_id = $1 returning rev`, [id]))).toEqual([{ rev: 2 }]);
    expect(await t.as('admin', (sql) => sql.query(`update public.event_brief set notes = 'x' where event_id = $1 returning event_id`, [id]))).toEqual([]);
  });

  it('«Ponerle fecha»: solo el jefe y el despacho (con doble factor); el IVT, política, Redes, Grabación y administración no', async () => {
    const obra = await readyObra();
    for (const who of ['ivt', 'politics', 'social', 'camera', 'admin'] as const) {
      await fails(schedule(who, 'obra', obra), /jefe o el despacho/);
    }
    await fails(schedule('boss', 'obra', obra, 'aal1'), /jefe o el despacho/);
    expect((await t.system((sql) => sql.one<{ stage: string }>(`select stage from public.obra_fichas where id = $1`, [obra])))!.stage).toBe('to_schedule');
  });

  it('el jefe le pone fecha a una obra: visita aceptada, con su ficha, su fecha y su ficha técnica; la historia lo dice sin la fecha', async () => {
    const obra = await readyObra();
    const ev = await schedule('boss', 'obra', obra);
    expect(await event(ev)).toMatchObject({ kind: 'obra_visit', origin: 'ivt', boss_decision: 'accepted', obra_ficha_id: obra, created_by: t.ids.boss });
    expect(await t.system((sql) => sql.one(`select exact_address from public.event_schedule where event_id = $1`, [ev]))).toEqual({ exact_address: 'Calle de prueba 1 (demo)' });
    expect(await t.system((sql) => sql.one(`select work_description from public.event_brief where event_id = $1`, [ev]))).toEqual({ work_description: 'Trabajos (demo)' });
    expect((await t.system((sql) => sql.one<{ stage: string }>(`select stage from public.obra_fichas where id = $1`, [obra])))!.stage).toBe('scheduled');
    const hist = await t.system((sql) => sql.query<{ kind: string; note: string | null }>(`select kind, note from public.ficha_updates where obra_ficha_id = $1 and kind = 'scheduled'`, [obra]));
    expect(hist).toHaveLength(1);
    const json = JSON.stringify(await t.system((sql) => sql.query(`select * from public.ficha_updates where obra_ficha_id = $1`, [obra])));
    for (const secret of ['Calle de prueba', '0000-0000901', 'plaza']) expect(json).not.toContain(secret);
    // A second «Ponerle fecha» for the same obra fails.
    await fails(schedule('dispatch', 'obra', obra), /ya tiene fecha/);
  });

  it('el despacho le pone fecha a un reporte: llega «por decidir», con una fila «scheduled» en su historia', async () => {
    const report = await agendaReport();
    const ev = await schedule('dispatch', 'community', report);
    expect(await event(ev)).toMatchObject({ kind: 'community', origin: 'politics', boss_decision: 'pending', community_report_id: report });
    const hist = await t.system((sql) => sql.query<{ kind: string; actor_id: string }>(`select kind, actor_id from public.ficha_updates where community_report_id = $1 and kind = 'scheduled'`, [report]));
    expect(hist).toEqual([{ kind: 'scheduled', actor_id: t.ids.dispatch }]);
    await fails(schedule('boss', 'community', report), /ya tiene fecha/);
    // A report that does not go to the agenda, or a draft obra, gets no date.
    const off = await t.as('politics', async (sql) => (await sql.one<{ id: string }>(`insert into public.community_reports (title, municipality, type) values ('Avance sin agenda (demo)', 'Torbes', 'repair') returning id`))!.id);
    await fails(schedule('boss', 'community', off), /no va a la agenda/);
    const draft = await t.as('ivt', async (sql) => (await sql.one<{ id: string }>(`insert into public.obra_fichas (name, municipality) values ('Obra en borrador (demo)', 'Junín') returning id`))!.id);
    await fails(schedule('boss', 'obra', draft), /borrador/);
  });
});

describe('quién ve la fecha', () => {
  it('el IVT ve la fecha de sus visitas de obra, nunca su ficha técnica, su storyboard ni sus cámaras; sin doble factor nada', async () => {
    const obra = await readyObra();
    const ev = await schedule('dispatch', 'obra', obra);
    await t.as('boss', (sql) => sql.query(`insert into public.storyboards (event_id, speech) values ($1, 'Discurso (demo)')`, [ev]));
    await t.as('dispatch', (sql) => sql.query(`insert into public.event_assignments (event_id, user_id) values ($1, $2)`, [ev, t.ids.camera2]));
    expect(await count('ivt', 'select 1 from public.events where id = $1', [ev])).toBe(1);
    expect(await count('ivt', 'select 1 from public.event_schedule where event_id = $1', [ev])).toBe(1);
    expect(await count('ivt', 'select 1 from public.event_schedule where event_id = $1', [ev], 'aal1')).toBe(0);
    for (const q of ['select 1 from public.event_brief where event_id = $1', 'select 1 from public.storyboards where event_id = $1', 'select 1 from public.event_assignments where event_id = $1']) {
      expect(await count('ivt', q, [ev]), q).toBe(0);
    }
    // A visit created by hand (no IVT ficha) and every other event stay closed to the IVT.
    const { id: plain } = await insertEvent('boss');
    expect(await count('ivt', 'select 1 from public.events where id = $1', [plain])).toBe(0);
    expect(await count('ivt', 'select 1 from public.events where obra_ficha_id is null')).toBe(0);
    expect(await count('ivt', 'select 1 from public.event_schedule s join public.events e on e.id = s.event_id where e.obra_ficha_id is null')).toBe(0);
  });

  it('política ve las actividades de sus reportes, nunca una fecha; Redes ve los eventos y ninguna fecha', async () => {
    const report = await agendaReport();
    const ev = await schedule('boss', 'community', report);
    expect(await count('politics', 'select 1 from public.events where id = $1', [ev])).toBe(1);
    expect(await count('politics', 'select 1 from public.events where community_report_id is null')).toBe(0);
    for (const who of ['politics', 'social'] as const) {
      expect(await count(who, 'select 1 from public.event_schedule'), who).toBe(0);
      expect(await count(who, 'select 1 from public.event_calendar'), who).toBe(0);
      expect(await count(who, 'select 1 from public.event_brief where event_id = $1', [ev]), who).toBe(who === 'social' ? 1 : 0);
    }
  });

  it('«Por ponerle fecha»: el jefe, el despacho y administración ven todo; el IVT sus obras; política sus reportes; Redes y Grabación nada', async () => {
    const obra = await readyObra();
    const report = await agendaReport();
    const q = `select kind, id from public.agenda_to_schedule where id = any($1::uuid[])`;
    for (const who of ['boss', 'dispatch', 'admin'] as const) expect(await count(who, q, [[obra, report]]), who).toBe(2);
    expect(await t.as('ivt', (sql) => sql.query(q, [[obra, report]]))).toEqual([{ kind: 'obra', id: obra }]);
    expect(await t.as('politics', (sql) => sql.query(q, [[obra, report]]))).toEqual([{ kind: 'report', id: report }]);
    for (const who of ['social', 'camera'] as const) expect(await count(who, 'select 1 from public.agenda_to_schedule'), who).toBe(0);
    // The view has no date column.
    const cols = await t.system((sql) => sql.query<{ column_name: string; data_type: string }>(
      `select column_name, data_type from information_schema.columns where table_schema = 'public' and table_name = 'agenda_to_schedule'`,
    ));
    expect(cols.map((c) => c.column_name)).not.toContain('starts_at');
    expect(cols.filter((c) => /time|date/.test(c.data_type)).map((c) => c.column_name)).toEqual(['waiting_since']);
  });
});

describe('cancelar no es borrar', () => {
  it('el jefe o el despacho cancelan: queda quién y cuándo; la obra vuelve a «Por ponerle fecha» con el motivo en su historia', async () => {
    const obra = await readyObra();
    const ev = await schedule('boss', 'obra', obra);
    await fails(t.as('social', (sql) => sql.query(`update public.events set cancelled_at = now() where id = $1`, [ev])), /No puedes cambiar/);
    // Whoever cancels is stamped by the database, whatever is sent.
    await t.as('dispatch', (sql) => sql.query(`update public.events set cancelled_at = now() - interval '9 days', cancelled_by = $2, cancel_reason = 'Lluvia fuerte (demo)' where id = $1`, [ev, t.ids.boss]));
    const e = await event(ev);
    expect(e).toMatchObject({ cancelled_by: t.ids.dispatch, cancel_reason: 'Lluvia fuerte (demo)' });
    expect(new Date(e!.cancelled_at as string).getTime()).toBeGreaterThan(Date.now() - 60_000);
    expect((await t.system((sql) => sql.one<{ stage: string }>(`select stage from public.obra_fichas where id = $1`, [obra])))!.stage).toBe('to_schedule');
    const note = await t.system((sql) => sql.one<{ note: string; actor_id: string }>(
      `select note, actor_id from public.ficha_updates where obra_ficha_id = $1 and kind = 'status' order by created_at desc limit 1`, [obra]));
    expect(note).toEqual({ note: 'Se canceló la visita: Lluvia fuerte (demo)', actor_id: t.ids.dispatch });
    expect(await count('boss', `select 1 from public.agenda_to_schedule where id = $1`, [obra])).toBe(1);
    expect(await count('boss', `select 1 from public.agenda_to_schedule where id = $1 and had_cancelled`, [obra])).toBe(1);
    // Redes stops reading the obra; the event itself stays (struck through on the screens).
    expect(await count('social', 'select 1 from public.obra_fichas where id = $1', [obra])).toBe(0);
    expect(await count('social', 'select 1 from public.events where id = $1', [ev])).toBe(1);
    // A cancelled event is not marked done, and a new date can be put to the obra.
    await fails(t.as('boss', (sql) => sql.query(`select public.mark_event_done($1)`, [ev])), /cancelado/);
    const again = await schedule('dispatch', 'obra', obra);
    expect(again).not.toBe(ev);
    // The first one cannot come back while the new one is live (one live visit per obra).
    await fails(t.as('boss', (sql) => sql.query(`update public.events set cancelled_at = null where id = $1`, [ev])));
  });

  it('un reporte cancelado vuelve a «Por ponerle fecha», con una nota sin el motivo', async () => {
    const report = await agendaReport();
    const ev = await schedule('boss', 'community', report);
    expect(await count('boss', `select 1 from public.agenda_to_schedule where id = $1`, [report])).toBe(0);
    await t.as('boss', (sql) => sql.query(`update public.events set cancelled_at = now(), cancel_reason = 'Motivo privado (demo)' where id = $1`, [ev]));
    expect(await count('boss', `select 1 from public.agenda_to_schedule where id = $1`, [report])).toBe(1);
    expect(await t.as('politics', (sql) => sql.one<{ x: boolean }>(`select public.report_has_live_event($1) as x`, [report]))).toEqual({ x: false });
    const notes = JSON.stringify(await t.system((sql) => sql.query(`select note from public.ficha_updates where community_report_id = $1`, [report])));
    expect(notes).toContain('salió de la agenda');
    expect(notes).not.toContain('Motivo privado');
    // Back on the agenda: «Ya tiene fecha» again; the boss restores it.
    await t.as('boss', (sql) => sql.query(`update public.events set cancelled_at = null where id = $1`, [ev]));
    expect(await event(ev)).toMatchObject({ cancelled_at: null, cancelled_by: null, cancel_reason: '' });
    expect(await t.as('politics', (sql) => sql.one<{ x: boolean }>(`select public.report_has_live_event($1) as x`, [report]))).toEqual({ x: true });
  });

  it('lo realizado no se cancela; marcarlo realizado pone la obra en «realizada»', async () => {
    const obra = await readyObra();
    const ev = await schedule('boss', 'obra', obra);
    await t.as('boss', (sql) => sql.query(`update public.event_schedule set starts_at = now() - interval '2 days', ends_at = now() - interval '2 days' + interval '1 hour' where event_id = $1`, [ev]));
    await t.as('dispatch', (sql) => sql.query(`select public.mark_event_done($1)`, [ev]));
    expect((await t.system((sql) => sql.one<{ stage: string }>(`select stage from public.obra_fichas where id = $1`, [obra])))!.stage).toBe('done');
    await fails(t.as('boss', (sql) => sql.query(`update public.events set cancelled_at = now() where id = $1`, [ev])), /ya se realizó/);
  });
});

describe('el historial del evento', () => {
  it('lo leen el jefe y el despacho (con doble factor); Redes, Grabación, el IVT, política y administración no', async () => {
    const obra = await readyObra();
    const ev = await schedule('dispatch', 'obra', obra);
    await t.as('boss', (sql) => sql.query(`update public.event_schedule set exact_address = 'Dirección del jefe (demo)' where event_id = $1`, [ev]));
    await t.as('dispatch', (sql) => sql.query(`insert into public.event_assignments (event_id, user_id) values ($1, $2)`, [ev, t.ids.camera]));
    const rows = await t.as('dispatch', (sql) => sql.query<{ actor_name: string; table_name: string; action: string; changes: Record<string, { before: unknown; after: unknown }> }>(
      `select actor_name, table_name, action, changes from public.event_history($1)`, [ev]));
    const moved = rows.find((r) => r.table_name === 'event_schedule' && r.action === 'update')!;
    expect(moved.changes.exact_address).toEqual({ before: 'Calle de prueba 1 (demo)', after: 'Dirección del jefe (demo)' });
    expect(Object.keys(moved.changes)).not.toContain('rev');
    expect(rows.some((r) => r.table_name === 'event_assignments')).toBe(true);
    for (const who of ['social', 'camera', 'ivt', 'politics', 'admin'] as const) {
      expect(await count(who, 'select * from public.event_history($1)', [ev]), who).toBe(0);
    }
    expect(await count('boss', 'select * from public.event_history($1)', [ev], 'aal1')).toBe(0);
  });
});

describe('quién graba: los nombres para asignar', () => {
  it('el jefe, el despacho, Redes y administración ven quién es de Grabación; los demás no', async () => {
    for (const who of ['boss', 'dispatch', 'social', 'admin'] as const) expect(await count(who, 'select * from public.camera_people()'), who).toBe(2);
    for (const who of ['ivt', 'politics', 'camera'] as const) expect(await count(who, 'select * from public.camera_people()'), who).toBe(0);
  });
});

// Review of the shared agenda (20261027002050_agenda_fixes.sql).
describe('marcar realizado no revela el día ni lo adelanta', () => {
  const withSchedule = async (startsIn: string) => {
    const { id } = await insertEvent('boss');
    await t.as('boss', (sql) => sql.query(`insert into public.event_schedule (event_id, starts_at, ends_at) values ($1, now() + $2::interval, now() + $2::interval + interval '1 hour')`, [id, startsIn]));
    await t.as('boss', (sql) => sql.query(`insert into public.event_assignments (event_id, user_id) values ($1, $2)`, [id, t.ids.camera]));
    return id;
  };
  const mark = (who: DemoUserKey, id: string, aal: 'aal1' | 'aal2' = 'aal2') => t.as(who, (sql) => sql.one<{ d: string }>(`select public.mark_event_done($1)::text as d`, [id]), aal);

  it('sin doble factor, el jefe, el despacho y administración reciben «No autorizado», sea el día que sea', async () => {
    const future = await withSchedule('9 days');
    const later = await withSchedule('1 hour');
    const past = await withSchedule('-1 day');
    for (const id of [future, later, past]) {
      for (const who of ['boss', 'dispatch', 'admin'] as const) await fails(mark(who, id, 'aal1'), /No autorizado/);
    }
    // Administración reads the agenda and does not mark it, with 2FA either; nor do Redes, the IVT, política or a
    // camera person who does not record it.
    for (const who of ['admin', 'social', 'ivt', 'politics', 'camera2'] as const) await fails(mark(who, past), /No autorizado/);
    // An id that does not exist reads the same.
    await fails(mark('social', '00000000-0000-4000-8000-00000000dead'), /No autorizado/);
    for (const id of [future, later, past]) expect((await event(id))!.done_on, id).toBeNull();
  });

  it('un evento que todavía no empezó (aunque sea hoy) no se marca; uno que ya empezó sí, también por quien lo graba', async () => {
    const later = await withSchedule('1 hour');
    await fails(mark('dispatch', later), /todavía no ha empezado/);
    expect((await event(later))!).toMatchObject({ done_on: null, work_status: 'brief' });
    const started = await withSchedule('-5 minutes');
    expect((await mark('camera', started))!.d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect((await event(started))!).toMatchObject({ work_status: 'material' });
    expect((await event(started))!.done_on).not.toBeNull();
  });
});

describe('decidir y borrar piden doble factor', () => {
  it('el jefe sin doble factor no acepta, no rechaza ni califica; sí mueve el estado de trabajo (como Redes)', async () => {
    const { id } = await insertEvent('dispatch');
    for (const set of [`boss_decision = 'accepted'`, `boss_decision = 'rejected'`, `priority = 9`]) {
      await fails(t.as('boss', (sql) => sql.query(`update public.events set ${set} where id = $1`, [id]), 'aal1'), /No puedes cambiar/);
    }
    expect(await t.as('boss', (sql) => sql.query(`update public.events set work_status = 'storyboard', urgency = 1 where id = $1 returning id`, [id]), 'aal1')).toHaveLength(1);
    expect(await event(id)).toMatchObject({ boss_decision: 'pending', priority: null, work_status: 'storyboard' });
    // A visit born from an obra stays on the agenda (rejecting it would send the obra back).
    const obra = await readyObra();
    const ev = await schedule('dispatch', 'obra', obra);
    await fails(t.as('boss', (sql) => sql.query(`update public.events set boss_decision = 'rejected' where id = $1`, [ev]), 'aal1'), /No puedes cambiar/);
    expect((await t.system((sql) => sql.one<{ stage: string }>(`select stage from public.obra_fichas where id = $1`, [obra])))!.stage).toBe('scheduled');
    // With 2FA he decides.
    expect(await t.as('boss', (sql) => sql.query(`update public.events set boss_decision = 'accepted', priority = 6 where id = $1 returning id`, [ev]))).toHaveLength(1);
  });

  it('administración sin doble factor no borra ni restaura un evento', async () => {
    const obra = await readyObra();
    const ev = await schedule('boss', 'obra', obra);
    await fails(t.as('admin', (sql) => sql.query(`update public.events set deleted_at = now() where id = $1`, [ev]), 'aal1'), /No puedes cambiar/);
    expect((await t.system((sql) => sql.one<{ stage: string }>(`select stage from public.obra_fichas where id = $1`, [obra])))!.stage).toBe('scheduled');
    expect(await t.as('admin', (sql) => sql.query(`update public.events set deleted_at = now() where id = $1 returning id`, [ev]))).toHaveLength(1);
    await fails(t.as('admin', (sql) => sql.query(`update public.events set deleted_at = null where id = $1`, [ev]), 'aal1'), /No puedes cambiar/);
    expect((await event(ev))!.deleted_at).not.toBeNull();
  });
});

describe('a quién se le avisa que su valor se reemplazó', () => {
  const writers = (who: DemoUserKey, table: string, id: string, keys: string[], aal: 'aal1' | 'aal2' = 'aal2') =>
    t.as(who, (sql) => sql.query<{ key: string; actor_id: string | null }>(`select key, actor_id from public.agenda_last_writers($1, $2, $3::text[]) order by key`, [table, id, keys]), aal);

  it('a quien cambió ese campo, no a quien guardó el evento por último (Redes moviendo «¿En qué va?»)', async () => {
    const { id } = await insertEvent('dispatch');
    await t.as('boss', (sql) => sql.query(`update public.events set title = 'Título del jefe (demo)' where id = $1`, [id]));
    await t.as('social', (sql) => sql.query(`update public.events set work_status = 'storyboard' where id = $1`, [id]));
    expect((await event(id))!.updated_by).toBe(t.ids.social);
    expect(await writers('dispatch', 'events', id, ['title', 'summary'])).toEqual([{ key: 'summary', actor_id: t.ids.dispatch }, { key: 'title', actor_id: t.ids.boss }]);
  });

  it('la duración es fin menos inicio: mover el evento no la cambia', async () => {
    const { id } = await insertEvent('dispatch');
    await t.as('dispatch', (sql) => sql.query(`insert into public.event_schedule (event_id, starts_at, ends_at) values ($1, now() + interval '9 days', now() + interval '9 days 1 hour')`, [id]));
    await t.as('dispatch', (sql) => sql.query(`update public.event_schedule set ends_at = ends_at + interval '30 minutes' where event_id = $1`, [id]));
    await t.as('boss', (sql) => sql.query(`update public.event_schedule set starts_at = starts_at + interval '2 hours', ends_at = ends_at + interval '2 hours' where event_id = $1`, [id]));
    expect(await writers('dispatch', 'event_schedule', id, ['starts_at', 'ends_at'])).toEqual([{ key: 'ends_at', actor_id: t.ids.dispatch }, { key: 'starts_at', actor_id: t.ids.boss }]);
  });

  it('lo preguntan quienes guardan esa parte: la agenda el jefe y el despacho (con doble factor); el storyboard también Redes', async () => {
    const { id } = await insertEvent('boss');
    await t.as('social', (sql) => sql.query(`insert into public.storyboards (event_id, speech) values ($1, 'Discurso de Redes (demo)')`, [id]));
    for (const who of ['social', 'camera', 'ivt', 'politics', 'admin'] as const) expect(await writers(who, 'events', id, ['title']), who).toEqual([]);
    expect(await writers('boss', 'events', id, ['title'], 'aal1')).toEqual([]);
    expect(await writers('social', 'storyboards', id, ['speech'])).toEqual([{ key: 'speech', actor_id: t.ids.social }]);
    for (const who of ['camera', 'ivt', 'politics'] as const) expect(await writers(who, 'storyboards', id, ['speech']), who).toEqual([]);
    expect(await writers('boss', 'nothing', id, ['speech'])).toEqual([]);
  });
});

describe('el historial del storyboard', () => {
  it('Redes, el jefe y administración (con doble factor) leen la parte del storyboard, con el contenido de cada bloque; nunca la de la fecha', async () => {
    const obra = await readyObra();
    const ev = await schedule('dispatch', 'obra', obra);
    const sb = await t.as('social', async (sql) => (await sql.one<{ id: string }>(`insert into public.storyboards (event_id, speech) values ($1, 'Saludo (demo)') returning id`, [ev]))!.id);
    const block = await t.as('social', async (sql) =>
      (await sql.one<{ id: string }>(`insert into public.storyboard_blocks (storyboard_id, position, shot, boss_line) values ($1, 0, 'Plano de Redes (demo)', 'Frase de Redes (demo)') returning id`, [sb]))!.id);
    await t.as('boss', (sql) => sql.query(`update public.storyboard_blocks set deleted_at = now() where id = $1`, [block]));
    type H = { table_name: string; action: string; block: Record<string, string> | null };
    const q = `select table_name, action, block from public.event_history($1)`;
    for (const who of ['social', 'admin', 'boss'] as const) {
      const rows = await t.as(who, (sql) => sql.query<H>(q, [ev]));
      expect(new Set(rows.map((r) => r.table_name)), who).toEqual(new Set(who === 'boss' ? ['events', 'event_schedule', 'event_brief', 'storyboards', 'storyboard_blocks'] : ['storyboards', 'storyboard_blocks']));
      const gone = rows.find((r) => r.table_name === 'storyboard_blocks' && r.action === 'soft_delete')!;
      expect(gone.block, who).toEqual({ shot: 'Plano de Redes (demo)', boss_line: 'Frase de Redes (demo)' });
      expect(rows.find((r) => r.table_name === 'storyboard_blocks' && r.action === 'insert')!.block, who).toEqual({ shot: 'Plano de Redes (demo)', boss_line: 'Frase de Redes (demo)' });
      if (who !== 'boss') expect(JSON.stringify(rows), who).not.toContain('Calle de prueba');
    }
    for (const who of ['camera', 'ivt', 'politics'] as const) expect(await count(who, 'select * from public.event_history($1)', [ev]), who).toBe(0);
    expect(await count('admin', 'select * from public.event_history($1)', [ev], 'aal1')).toBe(0);
  });
});
