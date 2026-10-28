// What only the screens hid, the database closes (20261028002100_privacy_hardening.sql). Every probe goes straight
// to SQL as each demo person (RLS on), as an API client would, besides the app's own reads:
//   1. the two text rules are the app's, case by case and on thousands of generated texts;
//   2. Redes and the camera person of a live visit get from the obra only the «Ficha de obra» tab's columns, through
//      visit_obra_ficha(), and its before and progress photos; never the table, its days, its owner or its papers;
//   3. a phone in that text, or a date, a time or a phone in a cancel reason, is refused by the database itself;
//   4. events.done_on is closed as a column; event_done_on() gives the day to Redes (D-06) and to who reads the date,
//      never to política.
// Against the demo: the visit to the puente La Quebrada (O-0001). All data here is invented.
import { describe, expect, it, beforeAll } from 'vitest';
import { makeTestDb, type TestDb } from './setup';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import { friendlyDbError } from '@/lib/db/core';
import { getEvent, linkedFicha } from '@/lib/data/events';
import { mediaDownloadRow } from '@/lib/data/media';
import { FIELDS } from '@/lib/domain/ficha-fields';
import { HIDDEN_WITHOUT_CONTACTS } from '@/lib/domain/ficha-tab';
import { phonesIn } from '@/lib/domain/phones';
import { looksLikeDateTime } from '@/lib/push/text';
import { DATETIME_CASES, PHONE_CASES, generatedTexts } from '../unit/fixtures/privacy-text-cases';

let t: TestDb;
let visit: { id: string; obra_ficha_id: string; community_report_id: string | null };
let assigned: DemoUserKey;
let other: DemoUserKey;
let draft: string; // O-0003, a draft obra (no visit)
let waiting: string; // O-0002, waiting for a date (no visit)
let photo: string; // a before photo of O-0001
let doc: string; // a document of O-0001 (added here)

const ALL: DemoUserKey[] = DEMO_USERS.map((u) => u.key);
const OBRA_ROLES = ['admin', 'boss', 'dispatch', 'ivt'] as const;
// What visit_obra_ficha() gives: exactly the tab's columns (ficha-tab.ts without the contacts), the code and the
// obra's «Lo que voy a decir».
const SAFE = ['id', 'code', 'name', 'municipality', 'parish', 'sector', 'engineer_name', 'problem', 'problem_since', 'why_decided', 'works',
  'communities', 'people_count', 'families_count', 'benefits', 'executor', 'investment', 'currency', 'funding_source', 'work_state',
  'progress_pct', 'difficulties', 'solutions', 'other_aid', 'pending_needs', 'next_action', 'fab_dialog', 'marks'];
// The obra's main text Redes and Grabación read: a phone in any of them is refused (obra_fichas_main_no_phone).
const CHECKED = ['name', 'parish', 'sector', 'engineer_name', 'problem', 'problem_since', 'why_decided', 'works', 'communities', 'benefits',
  'executor', 'investment', 'funding_source', 'difficulties', 'solutions', 'other_aid', 'pending_needs', 'next_action', 'fab_dialog'];

const fails = async (p: Promise<unknown>, msg?: RegExp) => {
  if (msg) await expect(p).rejects.toThrow(msg);
  else await expect(p).rejects.toThrow();
};
const errorOf = async (p: Promise<unknown>): Promise<unknown> => {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error('expected an error');
};
const count = async (who: DemoUserKey, q: string, params: unknown[] = [], aal: 'aal1' | 'aal2' = 'aal2') =>
  (await t.as(who, (sql) => sql.one<{ n: number }>(`select count(*)::int as n from (${q}) x`, params), aal))!.n;
const visitRow = (who: DemoUserKey, id: string) => t.as(who, (sql) => sql.one<Record<string, unknown>>(`select * from public.visit_obra_ficha($1)`, [id]));
const obraKinds = async (who: DemoUserKey) =>
  (await t.as(who, (sql) => sql.query<{ kind: string }>(`select kind from public.media_assets where obra_ficha_id = $1 order by kind`, [visit.obra_ficha_id]))).map((r) => r.kind);

beforeAll(async () => {
  t = await makeTestDb();
  visit = (await t.system((sql) => sql.one(`select id, obra_ficha_id, community_report_id from public.events where obra_ficha_id is not null and deleted_at is null and cancelled_at is null limit 1`)))!;
  const cams = await t.system((sql) => sql.query<{ user_id: string }>(`select user_id from public.event_assignments where event_id = $1 and duty = 'camera'`, [visit.id]));
  assigned = cams.some((c) => c.user_id === t.ids.camera) ? 'camera' : 'camera2';
  other = assigned === 'camera' ? 'camera2' : 'camera';
  draft = (await t.system((sql) => sql.one<{ id: string }>(`select id from public.obra_fichas where stage = 'draft' order by code limit 1`)))!.id;
  waiting = (await t.system((sql) => sql.one<{ id: string }>(`select id from public.obra_fichas where stage = 'to_schedule' order by code limit 1`)))!.id;
  photo = (await t.system((sql) => sql.one<{ id: string }>(`select id from public.media_assets where obra_ficha_id = $1 and kind = 'before' limit 1`, [visit.obra_ficha_id])))!.id;
  doc = (await t.system((sql) =>
    sql.one<{ id: string }>(
      `insert into public.media_assets (obra_ficha_id, kind, storage_path, label, mime, size_bytes, status, uploaded_by)
       values ($1, 'document', $2, 'Documento 1', 'application/pdf', 1200, 'ready', $3) returning id`,
      [visit.obra_ficha_id, `${visit.obra_ficha_id}/acta-demo.pdf`, t.ids.ivt],
    ),
  ))!.id;
}, 120_000);

// ---------------------------------------------------------------------------
// 1. The text rules: the database's copy is the app's
// ---------------------------------------------------------------------------
describe('las reglas de texto de la base son las de la app', () => {
  it('teléfonos: text_has_phone() da lo mismo que phonesIn(), caso por caso', async () => {
    const rows = await t.as('social', (sql) =>
      sql.query<{ s: string; v: boolean }>(`select s, public.text_has_phone(s) as v from unnest($1::text[]) s`, [PHONE_CASES.map((c) => c.text)]),
    );
    expect(rows.map((r) => r.v)).toEqual(PHONE_CASES.map((c) => c.phone));
    expect(await t.as('social', (sql) => sql.one<{ v: boolean }>(`select public.text_has_phone(null) as v`))).toEqual({ v: false });
  });

  it('fecha, hora o teléfono: text_has_datetime() da lo mismo que looksLikeDateTime(), caso por caso', async () => {
    const rows = await t.as('social', (sql) =>
      sql.query<{ v: boolean }>(`select public.text_has_datetime(s) as v from unnest($1::text[]) s`, [DATETIME_CASES.map((c) => c.text)]),
    );
    expect(rows.map((r) => r.v)).toEqual(DATETIME_CASES.map((c) => c.datetime));
  });

  it('y en 6000 textos generados (montos, fechas, horas, IDs, acentos, mayúsculas) las dos dan lo mismo que la app', async () => {
    const texts = generatedTexts(6000);
    const rows = await t.as('social', (sql) =>
      sql.query<{ s: string; ph: boolean; dt: boolean }>(
        `select s, public.text_has_phone(s) as ph, public.text_has_datetime(s) as dt from unnest($1::text[]) with ordinality as x(s, n) order by n`,
        [texts],
      ),
    );
    expect(rows).toHaveLength(texts.length);
    const phoneOff = rows.filter((r) => r.ph !== phonesIn(r.s).length > 0).map((r) => r.s);
    const dateOff = rows.filter((r) => r.dt !== looksLikeDateTime(r.s)).map((r) => r.s);
    expect(phoneOff).toEqual([]);
    expect(dateOff).toEqual([]);
    // Both sides of each rule are exercised.
    expect(rows.filter((r) => r.ph).length).toBeGreaterThan(300);
    expect(rows.filter((r) => r.dt).length).toBeGreaterThan(300);
  });

  it('las funciones nuevas: nadie anónimo las ejecuta', async () => {
    const rows = await t.system((sql) =>
      sql.query<{ f: string; anon: boolean; auth: boolean }>(
        `select p.oid::regprocedure::text as f, has_function_privilege('anon', p.oid, 'EXECUTE') as anon, has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname in ('text_has_phone', 'datetime_patterns', 'text_has_datetime', 'obra_visit_visible', 'visit_obra_ficha', 'event_done_on')
          order by 1`,
      ),
    );
    expect(rows).toHaveLength(6);
    for (const r of rows) expect(r, r.f).toMatchObject({ anon: false, auth: true });
  });
});

// ---------------------------------------------------------------------------
// 2. The obra for Redes and Grabación: the tab's columns, through the function
// ---------------------------------------------------------------------------
describe('la ficha de obra para Redes y Grabación: solo lo que muestra la pestaña', () => {
  it('la tabla: solo los roles de la obra (Administración, el jefe, el despacho y el IVT), para cada persona', async () => {
    for (const who of ALL) {
      const n = await count(who, 'select 1 from public.obra_fichas where id = $1', [visit.obra_ficha_id]);
      expect(n, who).toBe((OBRA_ROLES as readonly string[]).includes(who) ? 1 : 0);
    }
  });

  it('visit_obra_ficha(): quien ve la visita viva (no el IVT ni política, ni quien no la graba), con las columnas de la pestaña y nada más', async () => {
    const sees: DemoUserKey[] = ['admin', 'boss', 'dispatch', 'social', 'social2', assigned];
    for (const who of ALL) {
      const row = await visitRow(who, visit.obra_ficha_id);
      if (!sees.includes(who)) {
        expect(row, who).toBeNull();
        continue;
      }
      expect(row?.code, who).toBe('O-0001');
      expect(Object.keys(row!).sort(), who).toEqual([...SAFE].sort());
    }
    // The tab's own rule and the database agree: every field the tab shows without the contacts is there, and none of
    // the ones it hides (people's names, the obra's own days) nor anything private.
    const keys = Object.keys((await visitRow('social', visit.obra_ficha_id))!);
    for (const d of FIELDS.obra) {
      const shown = !d.private && !HIDDEN_WITHOUT_CONTACTS.obra.includes(d.key);
      expect(keys.includes(d.key), d.key).toBe(shown);
    }
    for (const k of ['stage', 'started_on', 'due_on', 'follow_up_owner', 'follow_up_due', 'created_at', 'updated_at', 'created_by', 'rev', 'fab_generated_by', 'deleted_at']) {
      expect(keys, k).not.toContain(k);
    }
  });

  it('sus marcas «Por confirmar» / «No aplica» solo de esas columnas', async () => {
    await t.system((sql) =>
      sql.query(`update public.obra_fichas set marks = $2::text::jsonb where id = $1`, [
        visit.obra_ficha_id,
        JSON.stringify({ sector: 'to_confirm', started_on: 'to_confirm', due_on: 'to_confirm', follow_up_owner: 'not_applicable', follow_up_due: 'not_applicable' }),
      ]),
    );
    for (const who of ['social', assigned] as const) expect((await visitRow(who, visit.obra_ficha_id))?.marks, who).toEqual({ sector: 'to_confirm' });
    await t.system((sql) => sql.query(`update public.obra_fichas set marks = '{}' where id = $1`, [visit.obra_ficha_id]));
  });

  it('una obra sin visita viva no sale para nadie por la función (la de borrador, la que espera fecha)', async () => {
    for (const who of ALL) for (const id of [draft, waiting]) expect(await visitRow(who, id), who).toBeNull();
  });

  it('por SQL directo tampoco: ni join, ni subconsulta, ni la vista «Por ponerle fecha», ni la historia', async () => {
    for (const who of ['social', 'social2', 'camera', 'camera2', 'politics'] as const) {
      expect(await count(who, 'select f.* from public.events e join public.obra_fichas f on f.id = e.obra_ficha_id'), who).toBe(0);
      const sub = await t.as(who, (sql) =>
        sql.query<{ d: unknown; o: unknown }>(
          `select (select f.due_on from public.obra_fichas f where f.id = e.obra_ficha_id) as d,
                  (select f.follow_up_owner from public.obra_fichas f where f.id = e.obra_ficha_id) as o
             from public.events e where e.obra_ficha_id is not null`,
        ),
      );
      expect(sub.every((r) => r.d === null && r.o === null), who).toBe(true);
      // (Política reads its own reports there; never an obra.)
      expect(await count(who, `select 1 from public.agenda_to_schedule where kind = 'obra'`), who).toBe(0);
      expect(await count(who, 'select 1 from public.ficha_updates where obra_ficha_id is not null'), who).toBe(0);
      expect(await count(who, 'select 1 from public.obra_ficha_private'), who).toBe(0);
    }
  });

  it('la pestaña del evento (linkedFicha) les da la ficha por la función, con su código y sus fotos', async () => {
    for (const who of ['social', 'social2', assigned] as const) {
      const f = await t.as(who, (sql) => linkedFicha(sql, visit, { contacts: true, media: true }));
      expect(f?.code, who).toBe('O-0001');
      expect(Object.keys(f!.row).sort(), who).toEqual([...SAFE].sort());
      expect(f?.priv, who).toBeNull();
      expect(f?.fab, who).toMatch(/\S/);
      expect(f?.media.map((m) => m.kind).sort(), who).toEqual(['before', 'progress']);
    }
    expect(await t.as(other, (sql) => linkedFicha(sql, visit, { contacts: false, media: true }))).toBeNull();
  });

  it('las fotos: Redes y quien graba, el antes y el avance; los documentos y todo lo demás, los roles de la obra', async () => {
    for (const who of ['social', 'social2', assigned] as const) {
      expect(await obraKinds(who), who).toEqual(['before', 'progress']);
      expect(await t.as(who, (sql) => sql.one(`select id from public.media_assets where id = $1`, [doc])), who).toBeNull();
    }
    for (const who of OBRA_ROLES) expect(await obraKinds(who), who).toEqual(['before', 'document', 'progress']);
    for (const who of [other, 'politics'] as const) expect(await obraKinds(who), who).toEqual([]);
  });

  it('la descarga lleva el código de la obra para Redes y quien graba; nada para quien no ve la foto', async () => {
    for (const who of ['social', assigned, 'boss', 'ivt'] as const) expect((await t.as(who, (sql) => mediaDownloadRow(sql, photo)))?.code, who).toBe('O-0001');
    for (const who of [other, 'politics'] as const) expect(await t.as(who, (sql) => mediaDownloadRow(sql, photo)), who).toBeNull();
    expect(await t.as('social', (sql) => mediaDownloadRow(sql, doc))).toBeNull();
  });

  it('Redes cambia el nombre de una foto que ve, nunca el de un documento; quien graba no cambia lo que no subió', async () => {
    expect(await t.as('social', (sql) => sql.query(`update public.media_assets set label = 'Antes 1 (demo)' where id = $1 returning id`, [photo]))).toHaveLength(1);
    expect(await t.as('social', (sql) => sql.query(`update public.media_assets set label = 'Cambiado (demo)' where id = $1 returning id`, [doc]))).toHaveLength(0);
    expect(await t.as(assigned, (sql) => sql.query(`update public.media_assets set label = 'Cambiado (demo)' where id = $1 returning id`, [photo]))).toHaveLength(0);
  });

  it('si la visita se cancela, la ficha y sus fotos se cierran para ellos; si vuelve, se abren', async () => {
    await t.system((sql) => sql.query(`update public.events set cancelled_at = now() where id = $1`, [visit.id]));
    for (const who of ['social', assigned] as const) {
      expect(await visitRow(who, visit.obra_ficha_id), who).toBeNull();
      expect(await obraKinds(who), who).toEqual([]);
    }
    await t.system((sql) => sql.query(`update public.events set cancelled_at = null where id = $1`, [visit.id]));
    for (const who of ['social', assigned] as const) expect((await visitRow(who, visit.obra_ficha_id))?.code, who).toBe('O-0001');
  });
});

// ---------------------------------------------------------------------------
// 3. Phones in what Redes reads, and dates in a cancel reason: the database refuses them
// ---------------------------------------------------------------------------
describe('la base rechaza teléfonos en lo que leen Redes y Grabación', () => {
  it('cada campo de texto de la ficha de obra que leen, para cada rol de la obra, y también al crearla', async () => {
    for (const col of CHECKED) {
      await fails(t.as('ivt', (sql) => sql.query(`update public.obra_fichas set ${col} = 'Dato de prueba 0414.555.0199' where id = $1`, [draft])), /obra_fichas_main_no_phone/);
      // An amount with dots is a figure, not a phone.
      expect(await t.as('ivt', (sql) => sql.query(`update public.obra_fichas set ${col} = 'Dato de prueba 1.500.000' where id = $1 returning id`, [draft])), col).toHaveLength(1);
    }
    for (const who of OBRA_ROLES) {
      await fails(t.as(who, (sql) => sql.query(`update public.obra_fichas set next_action = 'Llamar al (0276) 555-0101' where id = $1`, [draft])), /obra_fichas_main_no_phone/);
    }
    await fails(t.as('ivt', (sql) => sql.query(`insert into public.obra_fichas (name, municipality, works) values ('Obra de prueba (demo)', 'Junín', 'Avisar al +58 414 555 0199')`)), /obra_fichas_main_no_phone/);
    // «Lo que voy a decir» too, even «1200 300» (two figures that read as a phone).
    await fails(t.as('boss', (sql) => sql.query(`update public.obra_fichas set fab_dialog = 'Son 1200 300 familias.' where id = $1`, [draft])), /obra_fichas_main_no_phone/);
  });

  it('la regla es de la tabla: tampoco pasa el sistema ni un camino de confianza', async () => {
    await fails(t.system((sql) => sql.query(`update public.obra_fichas set works = 'Llamar al 0414-555.01.99' where id = $1`, [draft])), /obra_fichas_main_no_phone/);
    await fails(
      t.as('dispatch', async (sql) => {
        await sql.query(`select set_config('app.trusted_update', 'on', true)`);
        await sql.query(`update public.obra_fichas set sector = 'Sector 0414/555/0199' where id = $1`, [draft]);
      }),
      /obra_fichas_main_no_phone/,
    );
  });

  it('la persona lee por qué, en español', async () => {
    const e = await errorOf(t.as('ivt', (sql) => sql.query(`update public.obra_fichas set benefits = 'Llamar al 0414.555.0199' where id = $1`, [draft])));
    expect(friendlyDbError(e)).toContain('parece un teléfono');
  });

  it('el motivo de una cancelación: sin fecha, hora ni teléfono, aunque se escriba por SQL; un motivo normal sí', async () => {
    for (const who of ['boss', 'dispatch'] as const) {
      const ev = (await t.as(who, (sql) => sql.one<{ id: string }>(`insert into public.events (title, created_by) values ('Evento para cancelar (demo)', auth.uid()) returning id`)))!.id;
      for (const reason of ['Se pasa para el lunes', 'Queda a las 3 de la tarde', 'Nueva fecha 24/10', 'Llamar al 555.0199', 'Vocera 0414-1234567']) {
        await fails(t.as(who, (sql) => sql.query(`update public.events set cancelled_at = now(), cancel_reason = $2 where id = $1`, [ev, reason])), /events_cancel_reason_private/);
      }
      expect(await t.as(who, (sql) => sql.query(`update public.events set cancelled_at = now(), cancel_reason = 'Lluvia fuerte en la zona' where id = $1 returning id`, [ev]))).toHaveLength(1);
    }
    // Not the system either; and the person reads why.
    const ev = (await t.system((sql) => sql.one<{ id: string }>(`select id from public.events where cancelled_at is null and deleted_at is null order by code limit 1`)))!.id;
    const e = await errorOf(t.system((sql) => sql.query(`update public.events set cancelled_at = now(), cancel_reason = 'mañana a las 9' where id = $1`, [ev])));
    expect(friendlyDbError(e)).toBe('El motivo lo leen todos (Redes también): escríbelo sin fecha, hora ni teléfono.');
  });
});

// ---------------------------------------------------------------------------
// 4. The day an event happened
// ---------------------------------------------------------------------------
describe('el día realizado (events.done_on): Redes sí (D-06), política nunca', () => {
  let reportEvent: string;
  let doneRows: { id: string; d: string; obra: boolean; report: boolean }[];
  const dayAs = (who: DemoUserKey, aal: 'aal1' | 'aal2' = 'aal2') =>
    t.as(who, (sql) => sql.query<{ id: string; d: string | null }>(`select id, public.event_done_on(id)::text as d from public.events order by id`), aal);

  beforeAll(async () => {
    // A done visit born from an obra and a done activity born from a report, besides the demo's done events.
    reportEvent = (await t.system((sql) => sql.one<{ id: string }>(`select id from public.events where community_report_id is not null and deleted_at is null limit 1`)))!.id;
    await t.system((sql) => sql.query(`update public.events set done_on = current_date - 1 where id = any($1::uuid[]) and done_on is null`, [[visit.id, reportEvent]]));
    doneRows = await t.system((sql) =>
      sql.query(`select id, done_on::text as d, obra_ficha_id is not null as obra, community_report_id is not null as report from public.events where done_on is not null and deleted_at is null order by id`),
    );
  });

  it('la columna está cerrada para todos los roles de la API: ni directa, ni *, ni en un WHERE, ni la fila entera, ni en RETURNING', async () => {
    for (const who of ALL) {
      for (const q of [
        'select done_on from public.events',
        'select * from public.events',
        'select id from public.events where done_on is not null',
        'select to_jsonb(e) from public.events e',
        'select e from public.events e',
      ]) {
        await fails(t.as(who, (sql) => sql.query(q)), /permission denied/);
      }
    }
    await fails(t.as('social', (sql) => sql.query(`update public.events set work_status = work_status where id = $1 returning done_on`, [visit.id])), /permission denied/);
  });

  it('authenticated lee todas las columnas de events menos done_on (una columna nueva se concede a propósito)', async () => {
    const closed = await t.system((sql) =>
      sql.query<{ c: string }>(
        `select attname as c from pg_attribute
          where attrelid = 'public.events'::regclass and attnum > 0 and not attisdropped
            and not has_column_privilege('authenticated', attrelid, attname, 'SELECT') order by 1`,
      ),
    );
    expect(closed.map((r) => r.c)).toEqual(['done_on']);
  });

  it('event_done_on(): Administración, el jefe, el despacho y Redes, el día de todo lo realizado', async () => {
    expect(doneRows.length).toBeGreaterThanOrEqual(3);
    for (const who of ['admin', 'boss', 'dispatch', 'social', 'social2'] as const) {
      const got = new Map((await dayAs(who)).map((r) => [r.id, r.d]));
      for (const r of doneRows) expect(got.get(r.id), `${who} ${r.id}`).toBe(r.d);
    }
  });

  it('quien graba, solo el de sus eventos; el IVT, solo el de las visitas de sus obras y con doble factor', async () => {
    for (const who of ['camera', 'camera2'] as const) {
      const mine = new Set(
        (await t.system((sql) => sql.query<{ event_id: string }>(`select event_id from public.event_assignments where user_id = $1`, [t.ids[who]]))).map((r) => r.event_id),
      );
      const got = new Map((await t.as(who, (sql) => sql.query<{ id: string; d: string | null }>(`select e.id, public.event_done_on(e.id)::text as d from unnest($1::uuid[]) as e(id)`, [doneRows.map((r) => r.id)]))).map((r) => [r.id, r.d]));
      for (const r of doneRows) expect(got.get(r.id), `${who} ${r.id}`).toBe(mine.has(r.id) ? r.d : null);
    }
    const ivt = new Map((await t.as('ivt', (sql) => sql.query<{ id: string; d: string | null }>(`select e.id, public.event_done_on(e.id)::text as d from unnest($1::uuid[]) as e(id)`, [doneRows.map((r) => r.id)]))).map((r) => [r.id, r.d]));
    for (const r of doneRows) expect(ivt.get(r.id), `ivt ${r.id}`).toBe(r.obra ? r.d : null);
    const aal1 = await t.as('ivt', (sql) => sql.query<{ d: string | null }>(`select public.event_done_on(e.id)::text as d from unnest($1::uuid[]) as e(id)`, [doneRows.map((r) => r.id)]), 'aal1');
    expect(aal1.every((r) => r.d === null)).toBe(true);
  });

  it('política: nunca el día, ni el de la actividad que nació de su reporte; el resto de esa fila sí', async () => {
    expect(doneRows.some((r) => r.id === reportEvent && r.report)).toBe(true);
    const got = await t.as('politics', (sql) => sql.query<{ d: string | null }>(`select public.event_done_on(e.id)::text as d from unnest($1::uuid[]) as e(id)`, [doneRows.map((r) => r.id)]));
    expect(got.every((r) => r.d === null)).toBe(true);
    for (const aal of ['aal1', 'aal2'] as const) {
      expect(await count('politics', `select 1 from public.events where id = $1 and public.event_done_on(id) is not null`, [reportEvent], aal)).toBe(0);
    }
    const row = await t.as('politics', (sql) => sql.one<{ title: string; kind: string }>(`select title, kind from public.events where id = $1`, [reportEvent]));
    expect(row?.kind).toBe('community');
    // The app's read of the event (the page política opens) carries no day either; Redes' does.
    expect((await t.as('politics', (sql) => getEvent(sql, reportEvent)))?.done_on).toBeNull();
    expect((await t.as('social', (sql) => getEvent(sql, reportEvent)))?.done_on).not.toBeNull();
  });

  it('un evento borrado: su día solo para Administración', async () => {
    const id = doneRows[0].id;
    await t.system((sql) => sql.query(`update public.events set deleted_at = now() where id = $1`, [id]));
    for (const who of ['boss', 'dispatch', 'social'] as const) {
      expect(await t.as(who, (sql) => sql.one<{ d: string | null }>(`select public.event_done_on($1)::text as d`, [id])), who).toEqual({ d: null });
    }
    expect((await t.as('admin', (sql) => sql.one<{ d: string | null }>(`select public.event_done_on($1)::text as d`, [id])))?.d).toBe(doneRows[0].d);
    await t.system((sql) => sql.query(`update public.events set deleted_at = null where id = $1`, [id]));
  });
});
