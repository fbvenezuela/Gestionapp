// §8 of the change request of 27/10/2026 («Al terminar»): «Pruebas por rol que demuestren» five
// sentences. One block per sentence, with the spec's words as its name, each person of the demo trying straight
// against the database (RLS on, as an API client would) and, where it says «no ponen fecha», through the app's own
// actions too. Then the catalogue checks that keep the next migration honest: no policy or function names a retired
// role, and every grant to a team role is also the boss's, except the branches listed here by name.
//
// The decisions these proofs follow (docs/DECISIONES.md): only the boss and despacho write the agenda, with 2FA
// (can_manage_agenda()); the IVT reads the date of the visits born from its obra fichas only; política never reads a
// date; Redes keeps the day an event was done (D-06, D-40) and nothing else of the date; Grabación sees what it is
// assigned to, per person. The data is the demo's (invented) plus what each test adds. No event is added to the seed.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import type { Session } from '@/lib/auth/session';
import { makeTestDb, type TestDb } from './setup';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import { looksLikeDateTime } from '@/lib/push/text';
import { phonesIn } from '@/lib/domain/phones';

const h = vi.hoisted(() => ({ session: null as unknown }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/session', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/session')>()),
  requireSession: vi.fn(async () => h.session),
  getSession: vi.fn(async () => h.session),
}));
// The real notify() runs (the notices land in the database, as in the app). Nothing leaves the machine: the push
// service and the email provider are stubs (there are no keys in tests either).
vi.mock('web-push', () => ({ default: { sendNotification: vi.fn(async () => ({})), setVapidDetails: vi.fn() } }));
vi.mock('resend', () => ({ Resend: class { emails = { send: async () => ({ data: { id: 'stub' }, error: null }) }; } }));

let t: TestDb;
let agenda: typeof import('@/lib/actions/agenda');
let events: typeof import('@/lib/actions/events');
let recording: typeof import('@/lib/actions/recording');

type Aal = 'aal1' | 'aal2';
type Err = { code?: string; message: string };
// Everyone of the team but the two who write the agenda (Administración included: it reads the agenda, never writes it).
const NOT_MANAGERS: DemoUserKey[] = ['admin', 'social', 'social2', 'camera', 'camera2', 'politics', 'ivt'];
const CAMERAS = ['camera', 'camera2'] as const;
const REDES = ['social', 'social2'] as const;

// The demo's events by code (E-0001…), read as the system in beforeAll.
const ev: Record<string, string> = {};
let obraVisit: { id: string; obra: string }; // E-0002, born from the IVT's O-0001
let communityEv: { id: string; report: string }; // E-0003, born from a report of política
// What each camera person records, read when a test needs it (the tests above assign more as they go).
const assignedTo = async (who: (typeof CAMERAS)[number]) =>
  (await sys<{ event_id: string }>(`select event_id from public.event_assignments where user_id = $1 and duty = 'camera' order by event_id`, [t.ids[who]])).map((r) => r.event_id);

function as(key: DemoUserKey, aal: Aal = 'aal2') {
  const u = DEMO_USERS.find((x) => x.key === key)!;
  h.session = {
    userId: t.ids[key], email: u.email, name: u.name, roles: [...u.roles], aal, mfaRequired: false, mfaOk: aal === 'aal2',
    claims: { sub: t.ids[key], aal, role: 'authenticated' }, viewAs: null,
  } satisfies Session;
}

const errorOf = async (p: Promise<unknown>): Promise<Err | null> => {
  try {
    await p;
  } catch (e) {
    return e as Err;
  }
  return null;
};
// Refused by the database as not allowed (42501: a policy, a guard or a function), optionally with its message.
const denied = async (p: Promise<unknown>, label: string, msg?: RegExp) => {
  const e = await errorOf(p);
  expect(e, `${label}: tenía que fallar`).not.toBeNull();
  expect(e!.code, `${label}: ${e!.message}`).toBe('42501');
  if (msg) expect(e!.message, label).toMatch(msg);
};
const rows = <T = Record<string, unknown>>(who: DemoUserKey, q: string, params: unknown[] = [], aal: Aal = 'aal2') =>
  t.as(who, (sql) => sql.query<T>(q, params), aal);
const count = async (who: DemoUserKey, q: string, params: unknown[] = [], aal: Aal = 'aal2') =>
  (await t.as(who, (sql) => sql.one<{ n: number }>(`select count(*)::int as n from (${q}) x`, params), aal))!.n;
const sys = <T = Record<string, unknown>>(q: string, params: unknown[] = []) => t.system((sql) => sql.query<T>(q, params));
const sysOne = async <T = Record<string, unknown>>(q: string, params: unknown[] = []) => (await sys<T>(q, params))[0];

let n = 0;
const readyObra = () =>
  t.as('ivt', async (sql) =>
    (await sql.one<{ id: string }>(`insert into public.obra_fichas (name, municipality, stage) values ($1, 'Junín', 'to_schedule') returning id`, [
      `Obra de las pruebas por rol ${++n} (demo)`,
    ]))!.id,
  );
const agendaReport = () =>
  t.as('politics', async (sql) =>
    (await sql.one<{ id: string }>(`insert into public.community_reports (title, municipality, type, wants_agenda) values ($1, 'Torbes', 'event', true) returning id`, [
      `Asamblea de las pruebas por rol ${++n} (demo)`,
    ]))!.id,
  );
const SCHEDULE_FICHA = `select public.schedule_ficha($1, $2, $3, 'Sitio de prueba (demo)', now() + interval '20 days', now() + interval '20 days 1 hour',
  'Calle de prueba 1 (demo)', 'Al lado de la plaza (demo)', 'Vocera (demo) 0000-0000901', '{}'::jsonb) as id`;
const scheduleFicha = (who: DemoUserKey, kind: 'obra' | 'community', id: string, aal: Aal = 'aal2') =>
  t.as(who, async (sql) => (await sql.one<{ id: string }>(SCHEDULE_FICHA, [kind, id, `Visita de prueba ${++n}`]))!.id, aal);
const insertEvent = (who: DemoUserKey, aal: Aal = 'aal2') =>
  t.as(who, async (sql) =>
    (await sql.one<{ id: string }>(`insert into public.events (title, place_name, created_by) values ($1, 'Sitio de prueba (demo)', auth.uid()) returning id`, [
      `Evento de las pruebas por rol ${++n} (demo)`,
    ]))!.id,
  aal);
const insertSchedule = (who: DemoUserKey, id: string, startsIn = '9 days', aal: Aal = 'aal2') =>
  t.as(who, (sql) =>
    sql.query(`insert into public.event_schedule (event_id, starts_at, ends_at, exact_address) values ($1, now() + $2::interval, now() + $2::interval + interval '1 hour', 'Calle de prueba 2 (demo)') returning event_id`, [id, startsIn]),
  aal);
const moveSchedule = (who: DemoUserKey, id: string, aal: Aal = 'aal2') =>
  t.as(who, (sql) => sql.query(`update public.event_schedule set starts_at = starts_at + interval '1 day', ends_at = ends_at + interval '1 day' where event_id = $1 returning event_id`, [id]), aal);
const startsAt = async (id: string) => String((await sysOne<{ s: string }>(`select starts_at::text as s from public.event_schedule where event_id = $1`, [id]))?.s ?? '');
// An event of the boss's agenda with its date (as the boss, with 2FA): «in» from now.
const datedEvent = async (startsIn: string) => {
  const id = await insertEvent('boss');
  await insertSchedule('boss', id, startsIn);
  return id;
};
// What the agenda form sends for «Ponerle fecha» / «Nuevo evento» (src/lib/actions/agenda.ts, events.ts).
const day = (plus: number) => new Date(Date.now() + plus * 86400_000).toISOString().slice(0, 10);
const formFor = (id: string, extra: Record<string, unknown> = {}) => ({
  id, title: `Visita de las pruebas por rol ${++n}`, placeName: '', cameraUserId: '', allowOverlap: true, date: day(30), time: '10:40', durationMin: 60,
  exactAddress: 'Calle secreta 7 (demo)', directions: 'Detrás de la plaza secreta (demo)', siteContacts: 'Vocera secreta (demo) 0000-0000977', ...extra,
});
const newEventForm = (extra: Record<string, unknown> = {}) => ({
  title: `Rueda de prensa de las pruebas por rol ${++n}`, placeName: 'Gobernación (demo)', municipality: 'San Cristóbal', summary: '', categoryId: '',
  urgency: 2, cameraUserId: '', allowOverlap: true, kind: 'event', date: day(12), time: '15:50', durationMin: 60,
  exactAddress: 'Calle secreta 8 (demo)', directions: '', siteContacts: 'Enlace secreto (demo) 0000-0000978',
  workDescription: '', ledBy: '', inCharge: '', achievements: '', keyFacts: '', protocol: '', notes: '', ...extra,
});
// The secrets those forms carry: none may reach a notice.
const FORM_SECRETS = ['10:40', '15:50', '3:50', 'Calle secreta', 'plaza secreta', 'Vocera secreta', 'Enlace secreto', '0000-0000977', '0000-0000978', 'Lluvia secreta'];

beforeAll(async () => {
  t = await makeTestDb();
  (globalThis as { __fbBackend?: Promise<unknown> }).__fbBackend = Promise.resolve(t.backend);
  agenda = await import('@/lib/actions/agenda');
  events = await import('@/lib/actions/events');
  recording = await import('@/lib/actions/recording');
  for (const r of await sys<{ code: string; id: string }>(`select code, id from public.events order by code`)) ev[r.code] = r.id;
  obraVisit = (await sysOne<{ id: string; obra: string }>(`select id, obra_ficha_id as obra from public.events where obra_ficha_id is not null order by code limit 1`))!;
  communityEv = (await sysOne<{ id: string; report: string }>(`select id, community_report_id as report from public.events where community_report_id is not null order by code limit 1`))!;
  // Every business table has rows for «El jefe ve todo»: the demo has no review comment and no voice line yet.
  const piece = (await sysOne<{ id: string; v: number }>(`select id, current_version as v from public.pieces where current_version > 0 order by created_at limit 1`))!;
  await t.as('social', (sql) => sql.query(`insert into public.review_comments (piece_id, version, body) values ($1, $2, 'Subir el volumen del saludo (demo).')`, [piece.id, piece.v]));
  await t.as('social', (sql) => sql.query(`insert into public.voice_line_requests (piece_id, phrase) values ($1, 'Gracias a los clubes (demo).')`, [piece.id]));
}, 120_000);

// ---------------------------------------------------------------------------
// 1. «Redes no ve fecha ni hora»
// ---------------------------------------------------------------------------
describe('Redes no ve fecha ni hora', () => {
  it('ni la agenda, ni el calendario, ni «Por ponerle fecha», ni el historial de la fecha; tampoco por join, subconsulta o función', async () => {
    const all = Object.values(ev);
    for (const who of REDES) {
      expect(await count(who, 'select 1 from public.event_schedule'), who).toBe(0);
      expect(await count(who, 'select 1 from public.event_calendar'), who).toBe(0);
      expect(await count(who, 'select 1 from public.agenda_to_schedule'), who).toBe(0);
      expect(await count(who, 'select 1 from public.events e join public.event_schedule s on s.event_id = e.id'), who).toBe(0);
      expect(await count(who, 'select 1 from public.events e where exists (select 1 from public.event_schedule s where s.event_id = e.id)'), who).toBe(0);
      expect(await count(who, 'select 1 from public.events e where public.can_see_schedule(e.id)'), who).toBe(0);
      expect(await count(who, `select 1 from public.audit_log where table_name in ('event_schedule', 'events')`), who).toBe(0);
      // Writing teaches it nothing either: the same refusal whether the event already has a date or not, and a
      // change that names a date touches no row.
      const bare = await insertEvent('boss');
      for (const id of [bare, ev['E-0004']]) await denied(insertSchedule(who, id), `${who} insert ${id}`);
      expect(await rows(who, `update public.event_schedule set exact_address = 'x' where starts_at > now() returning event_id`), who).toEqual([]);
      // It sees every event (the content is its work), never when: the event's history gives it the storyboard part only.
      expect(await count(who, 'select 1 from public.events where id = any($1::uuid[])', [all]), who).toBe(all.length);
      for (const id of all) {
        const hist = await rows<{ table_name: string; changes: Record<string, unknown> | null }>(who, 'select table_name, changes from public.event_history($1)', [id]);
        for (const r of hist) {
          expect(['storyboards', 'storyboard_blocks'], `${who} ${id}`).toContain(r.table_name);
          for (const k of ['starts_at', 'ends_at', 'exact_address', 'directions', 'site_contacts']) expect(Object.keys(r.changes ?? {}), k).not.toContain(k);
        }
      }
    }
  });

  it('nada de los reportes comunitarios ni de lo privado de las fichas, ni la tabla de la obra: solo la pestaña, por la función', async () => {
    for (const who of REDES) {
      for (const table of ['community_reports', 'community_report_private', 'obra_fichas', 'obra_ficha_private', 'ficha_updates']) {
        expect(await count(who, `select 1 from public.${table}`), `${who} ${table}`).toBe(0);
      }
      expect(await count(who, 'select 1 from public.media_assets where community_report_id is not null'), who).toBe(0);
      expect(await count(who, `select 1 from public.media_assets where obra_ficha_id is not null and kind not in ('before', 'progress')`), who).toBe(0);
      expect(await count(who, 'select 1 from public.events e join public.community_reports r on r.id = e.community_report_id'), who).toBe(0);
      // The community activity itself is there (without its report); the obra visit's tab comes from visit_obra_ficha().
      expect(await count(who, 'select 1 from public.events where id = $1', [communityEv.id]), who).toBe(1);
      expect((await rows<{ code: string }>(who, 'select code from public.visit_obra_ficha($1)', [obraVisit.obra]))[0]?.code, who).toBe('O-0001');
    }
  });

  it('ningún nombre ni teléfono de terceros en lo que lee de los eventos y de la obra', async () => {
    // What only the boss's agenda and the fichas' contacts hold (invented): who to call, where exactly, the reporters.
    // A site contact's name alone is not one of them: the brief may name the same person as in charge (the demo's
    // «Enlace agrícola»), and the brief is Redes' to read. Its phone is.
    const secrets = new Set<string>();
    const add = (v: string | null) => {
      if (v) secrets.add(v);
    };
    for (const r of await sys<{ a: string; d: string; c: string }>(`select exact_address as a, directions as d, site_contacts as c from public.event_schedule`)) {
      add(r.a);
      add(r.d);
      for (const p of phonesIn(r.c)) add(p);
    }
    for (const r of await sys<{ v: string }>(`select unnest(array[engineer_phone, reporter_name, liaison_name, liaison_phone, representative]) as v from public.obra_ficha_private`)) add(r.v);
    for (const r of await sys<{ v: string }>(`select unnest(array[reporter_name, reporter_phone]) as v from public.community_report_private`)) add(r.v);
    expect(secrets.size).toBeGreaterThan(10);
    // Every text column Redes reads about an event and its obra (ids and times left out: they are digits, not phones).
    const texts = (rs: Record<string, unknown>[]) => rs.flatMap((r) => Object.values(r).filter((v): v is string => typeof v === 'string'));
    for (const who of REDES) {
      const seen = [
        ...texts(await rows(who, 'select title, place_name, municipality, summary, cancel_reason from public.events')),
        ...texts(await rows(who, 'select work_description, led_by, in_charge, achievements, key_facts, protocol, notes from public.event_brief')),
        ...texts(await rows(who, 'select speech from public.storyboards')),
        ...texts(await rows(who, 'select shot, angle, boss_line, broll, fact, fact_source from public.storyboard_blocks')),
        ...texts(await rows(who, 'select body from public.recording_notes')),
        ...texts(await rows(who, 'select label from public.media_assets')),
        ...texts(await rows(who, 'select code, name, municipality, parish, sector, engineer_name, problem, problem_since, why_decided, works, communities, benefits, executor, investment, funding_source, difficulties, solutions, other_aid, pending_needs, next_action, fab_dialog from public.visit_obra_ficha($1)', [obraVisit.obra])),
      ];
      expect(seen.length, who).toBeGreaterThan(50);
      const all = seen.join('\n');
      for (const s of secrets) expect(all, `${who}: ${s}`).not.toContain(s);
      expect(seen.flatMap((x) => phonesIn(x)), who).toEqual([]);
    }
  });

  it('el día realizado: solo el día y por event_done_on() (D-06, D-40); la columna, nunca', async () => {
    const done = await sys<{ id: string; d: string }>(`select id, done_on::text as d from public.events where done_on is not null and deleted_at is null order by code`);
    expect(done.length).toBeGreaterThan(0);
    for (const who of REDES) {
      await denied(rows(who, 'select done_on from public.events'), `${who} done_on`);
      const got = await rows<{ id: string; d: string | null; ty: string }>(who, `select id, public.event_done_on(id)::text as d, pg_typeof(public.event_done_on(id))::text as ty from public.events order by code`);
      expect(got.filter((r) => r.d).map((r) => ({ id: r.id, d: r.d })), who).toEqual(done);
      // A day (a date, no time), and nothing for what has not been done.
      expect(new Set(got.map((r) => r.ty)), who).toEqual(new Set(['date']));
      for (const r of got.filter((x) => x.d)) expect(r.d, who).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('no le saca a la base si un evento ya empezó: marcar realizado responde lo mismo para todo', async () => {
    const past = await datedEvent('-2 days');
    const soon = await datedEvent('2 hours');
    const later = await datedEvent('12 days');
    for (const who of REDES) {
      for (const id of [past, soon, later, ev['E-0001'], '00000000-0000-4000-8000-00000000dead']) {
        await denied(rows(who, 'select public.mark_event_done($1)', [id]), `${who} mark ${id}`, /^No autorizado$/);
      }
    }
    for (const id of [past, soon, later]) expect((await sysOne<{ d: string | null }>(`select done_on as d from public.events where id = $1`, [id]))!.d).toBeNull();
  });

  it('sus avisos no traen fecha ni hora: una semana de agenda con las acciones de la app (crear, ponerle fecha, mover, cancelar, volver, notas)', async () => {
    const before = await count('social', 'select 1 from public.notifications');
    // The boss creates an event with its camera person; despacho proposes one and the boss accepts it.
    as('boss');
    const mine = await events.createEvent(newEventForm({ cameraUserId: t.ids.camera }));
    expect(mine.ok, JSON.stringify(mine)).toBe(true);
    const mineId = (mine as { data: { id: string } }).data.id;
    as('dispatch');
    const proposed = await events.createEvent(newEventForm());
    expect(proposed.ok, JSON.stringify(proposed)).toBe(true);
    as('boss');
    expect((await events.bossDecide({ id: (proposed as { data: { id: string } }).data.id, priority: 6, decision: 'accepted' })).ok).toBe(true);
    // «Ponerle fecha» to an obra (with Grabación) and to a report.
    const visit = await agenda.scheduleObraFicha(formFor(await readyObra(), { cameraUserId: t.ids.camera2 }));
    expect(visit.ok, JSON.stringify(visit)).toBe(true);
    const visitId = (visit as { data: { eventId: string } }).data.eventId;
    as('dispatch');
    expect((await agenda.scheduleReport(formFor(await agendaReport()))).ok).toBe(true);
    // Moved, cancelled with a reason, back on the agenda.
    expect((await agenda.moveEvent({ id: visitId, date: day(31), time: '11:20', durationMin: 90, allowOverlap: true })).ok).toBe(true);
    as('boss');
    const cancelled = await agenda.cancelEvent({ id: mineId, reason: 'Lluvia secreta (demo)' });
    expect(cancelled.ok, JSON.stringify(cancelled)).toBe(true);
    expect((await agenda.restoreEvent({ id: mineId })).ok).toBe(true);
    // Grabación leaves its note for the editor (Redes is told).
    as('camera');
    expect((await recording.saveRecordingNote({ eventId: mineId, kind: 'editor_note', body: 'El mejor clip es el segundo (demo).' })).ok).toBe(true);

    const secrets = [...FORM_SECRETS, '11:20'];
    for (const who of REDES) {
      const mineNotes = await rows<{ kind: string; title: string; body: string }>(who, 'select kind, title, body from public.notifications order by created_at');
      expect(mineNotes.length, who).toBeGreaterThanOrEqual((who === 'social' ? before : 0) + 3);
      expect(new Set(mineNotes.map((x) => x.kind)), who).toEqual(new Set(['event_cancelled', 'recording_note']));
      for (const x of mineNotes) {
        expect(looksLikeDateTime(`${x.title} ${x.body}`), `${who}: ${x.title} ${x.body}`).toBe(false);
        for (const s of secrets) expect(`${x.title} ${x.body}`, `${who}: ${s}`).not.toContain(s);
      }
      // Its own notices only (RLS).
      expect(await count(who, 'select 1 from public.notifications where user_id <> auth.uid()'), who).toBe(0);
    }
    // Rule 4 holds for everyone else's notices too (Grabación, the IVT, política, the boss, despacho): read as the system.
    const every = await sys<{ title: string; body: string }>(`select title, body from public.notifications`);
    expect(every.length).toBeGreaterThan(8);
    for (const x of every) {
      expect(looksLikeDateTime(`${x.title} ${x.body}`), `${x.title} ${x.body}`).toBe(false);
      for (const s of secrets) expect(`${x.title} ${x.body}`, s).not.toContain(s);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. «El IVT y el director de política no ponen fecha»
// ---------------------------------------------------------------------------
describe('El IVT y el director de política no ponen fecha', () => {
  // Each one's own: the IVT's obra visit (it reads that date) and política's community activity (it reads that event).
  const own = () => ({ ivt: obraVisit.id, politics: communityEv.id }) as const;

  it('event_schedule: insertar falla y cambiar o borrar no toca ninguna fila, ni la de su propia visita', async () => {
    const bare = await insertEvent('boss');
    for (const who of ['ivt', 'politics'] as const) {
      await denied(insertSchedule(who, bare), `${who} insert schedule`);
      const mine = own()[who];
      const was = await startsAt(mine);
      expect(await moveSchedule(who, mine), who).toEqual([]);
      expect(await rows(who, `update public.event_schedule set exact_address = 'Otra (demo)' returning event_id`), who).toEqual([]);
      const del = await errorOf(rows(who, 'delete from public.event_schedule where event_id = $1 returning event_id', [mine]));
      if (del) expect(del.code, who).toBe('42501');
      expect(await startsAt(mine), who).toBe(was);
    }
    // The IVT does read the date of its visit (2FA); política never.
    expect(await count('ivt', 'select 1 from public.event_schedule where event_id = $1', [obraVisit.id])).toBe(1);
    expect(await count('politics', 'select 1 from public.event_schedule where event_id = $1', [communityEv.id])).toBe(0);
  });

  it('«Ponerle fecha» (schedule_ficha) responde 42501 aunque la ficha sea suya', async () => {
    const obra = await readyObra();
    const report = await agendaReport();
    for (const who of ['ivt', 'politics'] as const) {
      await denied(scheduleFicha(who, 'obra', obra), `${who} obra`, /jefe o el despacho/);
      await denied(scheduleFicha(who, 'community', report), `${who} report`, /jefe o el despacho/);
    }
    expect((await sysOne<{ stage: string }>(`select stage from public.obra_fichas where id = $1`, [obra]))!.stage).toBe('to_schedule');
    expect(await count('boss', 'select 1 from public.agenda_to_schedule where id = any($1::uuid[])', [[obra, report]])).toBe(2);
  });

  it('events: no crean ninguno, y cambiar o cancelar el suyo no toca ninguna fila', async () => {
    for (const who of ['ivt', 'politics'] as const) {
      await denied(insertEvent(who), `${who} insert event`);
      const mine = own()[who];
      expect(await count(who, 'select 1 from public.events where id = $1', [mine]), who).toBe(1);
      for (const set of [`title = 'Otro título (demo)'`, `cancelled_at = now()`, `boss_decision = 'accepted'`, `work_status = 'editing'`]) {
        expect(await rows(who, `update public.events set ${set} where id = $1 returning id`, [mine]), `${who} ${set}`).toEqual([]);
      }
      await denied(rows(who, `select public.mark_event_done($1)`, [mine]), `${who} mark done`, /^No autorizado$/);
      // Nor the brief that goes with the date.
      await denied(rows(who, `insert into public.event_brief (event_id, work_description) values ($1, 'x')`, [await insertEvent('boss')]), `${who} brief`);
    }
    expect((await sysOne<{ c: string | null }>(`select cancelled_at::text as c from public.events where id = $1`, [obraVisit.id]))!.c).toBeNull();
  });

  it('la ficha no pasa a «con fecha» a mano: ni al crearla, ni al cambiarla; política ni la ve', async () => {
    const obra = await readyObra();
    await denied(t.as('ivt', (sql) => sql.query(`update public.obra_fichas set stage = 'scheduled' where id = $1`, [obra])), 'ivt stage', /Ponerle fecha/);
    await denied(t.as('ivt', (sql) => sql.query(`insert into public.obra_fichas (name, municipality, stage) values ('Obra con fecha a mano (demo)', 'Junín', 'scheduled')`)), 'ivt insert scheduled');
    expect(await rows('politics', `update public.obra_fichas set stage = 'scheduled' where id = $1 returning id`, [obra])).toEqual([]);
    // Neither links a ficha to an event by hand (that is «Ponerle fecha»).
    expect(await rows('politics', `update public.events set community_report_id = $2 where id = $1 returning id`, [communityEv.id, await agendaReport()])).toEqual([]);
    expect(await rows('ivt', `update public.events set obra_ficha_id = $2 where id = $1 returning id`, [obraVisit.id, obra])).toEqual([]);
    expect((await sysOne<{ stage: string }>(`select stage from public.obra_fichas where id = $1`, [obra]))!.stage).toBe('to_schedule');
  });

  it('las acciones de la app también se lo niegan, en español', async () => {
    const obra = await readyObra();
    const report = await agendaReport();
    for (const who of ['ivt', 'politics'] as const) {
      as(who);
      for (const [label, r] of [
        ['obra', await agenda.scheduleObraFicha(formFor(obra))],
        ['reporte', await agenda.scheduleReport(formFor(report))],
        ['nuevo evento', await events.createEvent(newEventForm())],
        ['mover', await agenda.moveEvent({ id: own()[who], date: day(40), time: '09:10', durationMin: 60, allowOverlap: true })],
        ['cancelar', await agenda.cancelEvent({ id: own()[who], reason: '' })],
      ] as const) {
        expect(r.ok, `${who} ${label}`).toBe(false);
        expect((r as { error: string }).error, `${who} ${label}`).toMatch(/jefe o el despacho|crean el jefe y el despacho|Cancelan el jefe o el despacho/);
      }
    }
    expect(await count('boss', 'select 1 from public.agenda_to_schedule where id = any($1::uuid[])', [[obra, report]])).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 3. «Solo jefe y despacho la ponen»
// ---------------------------------------------------------------------------
describe('Solo jefe y despacho la ponen', () => {
  it('con doble factor, los dos crean el evento, le ponen la fecha y la mueven', async () => {
    for (const who of ['boss', 'dispatch'] as const) {
      const id = await insertEvent(who);
      expect(await insertSchedule(who, id), who).toHaveLength(1);
      const was = await startsAt(id);
      expect(await moveSchedule(who, id), who).toHaveLength(1);
      expect(await startsAt(id), who).not.toBe(was);
      expect((await t.as(who, (sql) => sql.one<{ ok: boolean }>('select public.can_manage_agenda() as ok')))!.ok, who).toBe(true);
    }
  });

  it('con doble factor, los dos le ponen fecha a una obra y a un reporte', async () => {
    for (const who of ['boss', 'dispatch'] as const) {
      const obra = await scheduleFicha(who, 'obra', await readyObra());
      const report = await scheduleFicha(who, 'community', await agendaReport());
      for (const id of [obra, report]) expect(await count('boss', 'select 1 from public.event_schedule where event_id = $1', [id]), who).toBe(1);
    }
  });

  it('Administración, Redes, Grabación, política y el IVT no: ni insertar, ni mover (tampoco lo que ven), ni «Ponerle fecha», ni crear', async () => {
    const bare = await insertEvent('boss');
    const dated = await datedEvent('6 days');
    // Grabación reads the date of its own events: it still cannot move it.
    const camEvent = (await assignedTo('camera'))[0];
    const obra = await readyObra();
    const report = await agendaReport();
    for (const who of NOT_MANAGERS) {
      await denied(insertSchedule(who, bare), `${who} insert schedule`);
      for (const id of [dated, camEvent, obraVisit.id]) expect(await moveSchedule(who, id), `${who} move ${id}`).toEqual([]);
      await denied(scheduleFicha(who, 'obra', obra), `${who} obra`, /jefe o el despacho/);
      await denied(scheduleFicha(who, 'community', report), `${who} report`, /jefe o el despacho/);
      await denied(insertEvent(who), `${who} insert event`);
      expect((await t.as(who, (sql) => sql.one<{ ok: boolean }>('select public.can_manage_agenda() as ok')))!.ok, who).toBe(false);
    }
    expect(await count('boss', 'select 1 from public.event_schedule where event_id = $1', [bare])).toBe(0);
  });

  it('sin doble factor (aal1) tampoco el jefe ni el despacho', async () => {
    const bare = await insertEvent('boss');
    const dated = await datedEvent('7 days');
    const obra = await readyObra();
    for (const who of ['boss', 'dispatch'] as const) {
      await denied(insertSchedule(who, bare, '9 days', 'aal1'), `${who} aal1 insert schedule`);
      expect(await moveSchedule(who, dated, 'aal1'), who).toEqual([]);
      await denied(scheduleFicha(who, 'obra', obra, 'aal1'), `${who} aal1 obra`, /jefe o el despacho/);
      await denied(insertEvent(who, 'aal1'), `${who} aal1 insert event`);
      expect((await t.as(who, (sql) => sql.one<{ ok: boolean }>('select public.can_manage_agenda() as ok'), 'aal1'))!.ok, who).toBe(false);
    }
  });

  it('las acciones de la app: el jefe y el despacho sí; Administración, Redes y Grabación reciben un no en español', async () => {
    for (const who of ['boss', 'dispatch'] as const) {
      as(who);
      const r = await events.createEvent(newEventForm());
      expect(r.ok, `${who}: ${JSON.stringify(r)}`).toBe(true);
    }
    for (const who of ['admin', 'social', 'camera'] as const) {
      as(who);
      const r = await events.createEvent(newEventForm());
      expect(r.ok, who).toBe(false);
      expect((r as { error: string }).error, who).toBe('Los eventos los crean el jefe y el despacho.');
      const m = await agenda.moveEvent({ id: (await assignedTo('camera'))[0], date: day(41), time: '09:10', durationMin: 60, allowOverlap: true });
      expect((m as { error: string }).error, who).toBe('La fecha la ponen el jefe o el despacho.');
    }
  });
});

// ---------------------------------------------------------------------------
// 4. «El jefe ve todo»
// ---------------------------------------------------------------------------
// Every business table, the two agenda views and «Por ponerle fecha». The key says which rows (a subset check per role).
const BUSINESS: [table: string, key: string][] = [
  ['events', 'id'], ['event_schedule', 'event_id'], ['event_brief', 'event_id'], ['event_assignments', `event_id || ':' || user_id || ':' || duty`],
  ['storyboards', 'id'], ['storyboard_blocks', 'id'], ['media_assets', 'id'], ['pieces', 'id'], ['piece_versions', 'id'], ['copies', 'id'],
  ['reviews', 'id'], ['review_comments', 'id'], ['voice_line_requests', 'id'], ['tweet_batches', 'id'], ['tweets', 'id'], ['publications', 'id'],
  ['publication_metrics', 'id'], ['obra_fichas', 'id'], ['obra_ficha_private', 'id'], ['community_reports', 'id'], ['community_report_private', 'id'],
  ['ficha_updates', 'id'], ['recording_notes', 'id'], ['agenda_to_schedule', `kind || ':' || id`], ['event_calendar', 'id'],
];
const TEAM_OTHERS: DemoUserKey[] = ['dispatch', 'politics', 'ivt', 'social', 'social2', 'camera', 'camera2'];

describe('El jefe ve todo', () => {
  // A soft-deleted row is Administración's trash (only it deletes and restores: SEGURIDAD.md), so «todo» is every
  // live row: the system's count of rows with no deleted_at.
  const live = async (table: string) => {
    const soft = await sysOne<{ x: boolean }>(
      `select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = $1 and column_name = 'deleted_at') as x`, [table]);
    return soft!.x ? ' where deleted_at is null' : '';
  };

  it('en cada tabla del negocio, lo que cuenta el jefe es lo que cuenta la base (y ninguna está vacía)', async () => {
    for (const [table] of BUSINESS) {
      const all = (await sysOne<{ n: number }>(`select count(*)::int as n from public.${table}${await live(table)}`))!.n;
      expect(all, `${table}: la demo no tiene filas`).toBeGreaterThan(0);
      expect(await count('boss', `select 1 from public.${table}`), table).toBe(all);
    }
  });

  it('lo que ve cualquier rol del equipo, lo ve el jefe (fila por fila)', async () => {
    for (const [table, key] of BUSINESS) {
      const boss = new Set((await rows<{ k: string }>('boss', `select (${key})::text as k from public.${table}`)).map((r) => r.k));
      for (const who of TEAM_OTHERS) {
        const theirs = (await rows<{ k: string }>(who, `select (${key})::text as k from public.${table}`)).map((r) => r.k);
        expect(theirs.filter((k) => !boss.has(k)), `${table}: ${who} ve filas que el jefe no`).toEqual([]);
      }
    }
  });

  it('y lo que dan las funciones: la ficha de la visita, el día realizado, quién graba, el historial', async () => {
    expect((await rows<{ code: string }>('boss', 'select code from public.visit_obra_ficha($1)', [obraVisit.obra]))[0]?.code).toBe('O-0001');
    const days = await sys<{ id: string; d: string | null }>(`select id, done_on::text as d from public.events where deleted_at is null order by code`);
    expect(await rows('boss', `select id, public.event_done_on(id)::text as d from public.events order by code`)).toEqual(days);
    const cams = await sys<{ id: string }>(`select user_id as id from public.user_roles where role = 'camera' order by 1`);
    expect((await rows<{ id: string }>('boss', 'select id from public.camera_people() order by 1')).map((r) => r.id)).toEqual(cams.map((r) => r.id));
    // The event's history: the boss reads every part of it (Redes the storyboard only, Administración too).
    const parts = new Set((await rows<{ table_name: string }>('boss', 'select table_name from public.event_history($1)', [ev['E-0001']])).map((r) => r.table_name));
    for (const p of ['events', 'event_schedule', 'event_brief']) expect(parts).toContain(p);
  });

  it('sin doble factor, la fecha y los contactos no (la base lo pide también al jefe)', async () => {
    for (const table of ['event_schedule', 'event_calendar', 'obra_ficha_private', 'community_report_private']) {
      expect(await count('boss', `select 1 from public.${table}`, [], 'aal1'), table).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. «Grabación solo ve lo suyo»
// ---------------------------------------------------------------------------
describe('Grabación solo ve lo suyo', () => {
  const ids = async (who: DemoUserKey, q: string, params: unknown[] = []) => (await rows<{ id: string }>(who, q, params)).map((r) => r.id).sort();
  const assignments = async () => ({ camera: await assignedTo('camera'), camera2: await assignedTo('camera2') });
  // The obras whose live visit (not cancelled, rejected or deleted) this person records.
  const recordedObras = async (who: (typeof CAMERAS)[number]) =>
    (await sys<{ id: string }>(
      `select distinct e.obra_ficha_id as id from public.events e join public.event_assignments a on a.event_id = e.id and a.user_id = $1 and a.duty = 'camera'
        where e.obra_ficha_id is not null and e.deleted_at is null and e.cancelled_at is null and e.boss_decision <> 'rejected' order by 1`,
      [t.ids[who]],
    )).map((r) => r.id);

  it('cada persona de Grabación: los eventos, la fecha, la ficha técnica y el storyboard de lo que le asignaron, y nada más', async () => {
    const assigned = await assignments();
    expect(assigned.camera.length).toBeGreaterThan(0);
    expect(assigned.camera2.length).toBeGreaterThan(0);
    expect(assigned.camera.filter((x) => assigned.camera2.includes(x))).toEqual([]);
    for (const who of CAMERAS) {
      const mine = [...assigned[who]].sort();
      expect(await ids(who, 'select id from public.events'), who).toEqual(mine);
      expect(await ids(who, 'select event_id as id from public.event_schedule'), who).toEqual(mine);
      expect(await ids(who, 'select id from public.event_calendar'), who).toEqual(mine);
      for (const q of ['select event_id as id from public.event_brief', 'select event_id as id from public.storyboards',
        'select s.event_id as id from public.storyboard_blocks b join public.storyboards s on s.id = b.storyboard_id']) {
        for (const id of await ids(who, q)) expect(mine, `${who}: ${q}`).toContain(id);
      }
      // Who else records it is not its business: its own assignment rows only.
      expect(await count(who, 'select 1 from public.event_assignments where user_id <> auth.uid()'), who).toBe(0);
    }
  });

  it('las notas de la otra persona de Grabación no le llegan, ni puede escribir en su evento', async () => {
    const assigned = await assignments();
    const a = assigned.camera[0];
    const b = assigned.camera2[0];
    await t.as('camera2', (sql) => sql.query(`insert into public.recording_notes (event_id, kind, body) values ($1, 'editor_note', 'Nota de la otra cámara (demo).')`, [b]));
    expect(await count('camera', 'select 1 from public.recording_notes where author_id = $1', [t.ids.camera2])).toBe(0);
    expect(await count('camera2', 'select 1 from public.recording_notes where author_id = $1', [t.ids.camera])).toBe(0);
    for (const who of CAMERAS) {
      for (const id of await ids(who, 'select event_id as id from public.recording_notes')) expect(assigned[who], who).toContain(id);
    }
    await denied(t.as('camera', (sql) => sql.query(`insert into public.recording_notes (event_id, kind, body) values ($1, 'editor_note', 'Intento (demo).')`, [b])), 'camera note on camera2');
    await denied(t.as('camera2', (sql) => sql.query(`insert into public.recording_notes (event_id, kind, body) values ($1, 'editor_note', 'Intento (demo).')`, [a])), 'camera2 note on camera');
  });

  it('el material: solo el de sus eventos y las fotos de la obra de su visita; nada de otro evento, de un reporte ni de las piezas', async () => {
    const assigned = await assignments();
    const everyEvent = (await sys<{ id: string }>(`select id from public.events`)).map((r) => r.id);
    for (const who of CAMERAS) {
      const obras = await recordedObras(who);
      const media = await rows<{ event_id: string | null; obra_ficha_id: string | null; kind: string }>(who, 'select event_id, obra_ficha_id, kind from public.media_assets');
      for (const m of media) {
        if (m.event_id) expect(assigned[who], who).toContain(m.event_id);
        else if (m.obra_ficha_id) {
          expect(['before', 'progress'], who).toContain(m.kind);
          expect(obras, who).toContain(m.obra_ficha_id);
        } else throw new Error(`${who} lee un archivo sin evento ni obra: ${JSON.stringify(m)}`);
      }
      expect(media.some((m) => m.event_id), who).toBe(true);
      const others = everyEvent.filter((id) => !assigned[who].includes(id));
      expect(await count(who, 'select 1 from public.media_assets where event_id = any($1::uuid[])', [others]), who).toBe(0);
      // Its material goes into its own events only.
      await denied(t.as(who, (sql) => sql.query(`insert into public.media_assets (event_id, kind, mime, storage_path, uploaded_by) values ($1, 'broll', 'video/mp4', $2, auth.uid())`, [others[0], `prueba/por-rol-${++n}.mp4`])), `${who} upload elsewhere`);
      for (const table of ['pieces', 'piece_versions', 'copies', 'tweets', 'publications', 'publication_metrics', 'review_comments']) {
        expect(await count(who, `select 1 from public.${table}`), `${who} ${table}`).toBe(0);
      }
    }
  });

  it('la obra: solo la de su visita asignada y por el camino seguro (la función); nunca la tabla, sus contactos ni su historia', async () => {
    const assigned = await assignments();
    const recorder = CAMERAS.find((c) => assigned[c].includes(obraVisit.id))!;
    const notRecorder = CAMERAS.find((c) => c !== recorder)!;
    expect(recorder).toBeDefined();
    expect((await rows<{ code: string }>(recorder, 'select code from public.visit_obra_ficha($1)', [obraVisit.obra]))[0]?.code).toBe('O-0001');
    expect(await rows(notRecorder, 'select * from public.visit_obra_ficha($1)', [obraVisit.obra])).toEqual([]);
    // Every obra of the base (the demo's draft and the one waiting for a date, and those these tests dated): the
    // function answers exactly for the obras whose live visit this person records.
    const everyObra = (await sys<{ id: string }>(`select id from public.obra_fichas order by id`)).map((r) => r.id);
    for (const who of CAMERAS) {
      const opened: string[] = [];
      for (const id of everyObra) if ((await rows(who, 'select id from public.visit_obra_ficha($1)', [id])).length) opened.push(id);
      expect(opened, who).toEqual(await recordedObras(who));
      for (const table of ['obra_fichas', 'obra_ficha_private', 'ficha_updates']) expect(await count(who, `select 1 from public.${table}`), `${who} ${table}`).toBe(0);
    }
  });

  it('ningún reporte, ni el de la actividad comunitaria que graba', async () => {
    const assigned = await assignments();
    const recorder = CAMERAS.find((c) => assigned[c].includes(communityEv.id))!;
    expect(recorder).toBeDefined();
    expect(await count(recorder, 'select 1 from public.events where id = $1', [communityEv.id])).toBe(1);
    for (const who of CAMERAS) {
      for (const table of ['community_reports', 'community_report_private']) expect(await count(who, `select 1 from public.${table}`), `${who} ${table}`).toBe(0);
      expect(await count(who, 'select 1 from public.media_assets where community_report_id is not null'), who).toBe(0);
      expect(await rows(who, 'select public.report_has_live_event($1) as x', [communityEv.report]), who).toEqual([{ x: false }]);
      for (const q of ['select 1 from public.agenda_to_schedule', 'select * from public.camera_people()', 'select 1 from public.audit_log']) {
        expect(await count(who, q), `${who}: ${q}`).toBe(0);
      }
      for (const id of assigned[who]) expect(await count(who, 'select * from public.event_history($1)', [id]), `${who} history`).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// The catalogue: what the next migration must not undo
// ---------------------------------------------------------------------------
type Policy = { tablename: string; policyname: string; expr: string };
const TEAM_ROLE_NAMES = ['social', 'dispatch', 'camera', 'politics', 'ivt'];
const ROLE = (r: string) => String.raw`'${r}'(?:::(?:public\.)?app_role)?`;
const HAS_ROLE = (r: string) => String.raw`(?:public\.)?has_role\(${ROLE(r)}\)`;
// has_any_role(ARRAY['a'::app_role, …]) in a policy, has_any_role(array['a', …]::public.app_role[]) in a function.
const ARRAYS = /has_any_role\(\s*(?:ARRAY|array)\[([^\]]*)\]/g;
const SINGLES = /has_role\(\s*'([a-z_]+)'/g;
const rolesIn = (list: string) => [...list.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);

// The only grants to ONE team role that are not also the boss's, each with the branch it must keep. In a policy:
// Grabación on what it is assigned to; the IVT on the events born from its obras; política on those born from its
// reports (the boss reads all of these through the same policy's other branch). In a function: the same branches of
// the helpers, and the guards that tell the roles apart without leaving the boss out.
const POLICY_BRANCHES: Record<string, Record<string, RegExp>> = {
  'events.events_select': {
    camera: new RegExp(`${HAS_ROLE('camera')} AND is_assigned\\(id\\)`),
    ivt: new RegExp(`${HAS_ROLE('ivt')} AND \\(obra_ficha_id IS NOT NULL\\)`),
    politics: new RegExp(`${HAS_ROLE('politics')} AND \\(community_report_id IS NOT NULL\\)`),
  },
  'media_assets.media_insert': { camera: new RegExp(`${HAS_ROLE('camera')} AND \\(event_id IS NOT NULL\\) AND is_assigned\\(event_id\\)`) },
  'recording_notes.rn_insert': { camera: new RegExp(`${HAS_ROLE('camera')} AND is_assigned\\(event_id\\)`) },
  'recording_notes.rn_select': { camera: new RegExp(`${HAS_ROLE('camera')} AND is_assigned\\(event_id\\)`) },
};
const FUNCTION_BRANCHES: Record<string, Record<string, RegExp>> = {
  can_see_event: { camera: new RegExp(`${HAS_ROLE('camera')} and public\\.is_assigned\\(e\\)`) },
  can_see_schedule: {
    camera: new RegExp(`${HAS_ROLE('camera')} and public\\.is_assigned\\(e\\)`),
    ivt: new RegExp(`${HAS_ROLE('ivt')} and exists \\(select 1 from public\\.events ev\\s+where ev\\.id = e and ev\\.obra_ficha_id is not null`),
  },
  mark_event_done: { camera: new RegExp(`${HAS_ROLE('camera')} and public\\.is_assigned\\(e\\)`) },
  // What the boss creates is accepted at once; despacho's waits for him (someone with both roles is despacho).
  guard_event_insert: { dispatch: new RegExp(`${HAS_ROLE('boss')} and not ${HAS_ROLE('dispatch')}`) },
  schedule_ficha: { dispatch: new RegExp(`${HAS_ROLE('boss')} and not ${HAS_ROLE('dispatch')}`) },
  // Redes moves «¿En qué va?» (work_status, urgency); the boss has the same line.
  guard_event_update: { social: new RegExp(`if ${HAS_ROLE('social')} then allowed := allowed \\|\\| array\\['work_status', 'urgency'\\]`) },
};

describe('el catálogo de la base', () => {
  let policies: Policy[];
  let functions: { name: string; src: string }[];
  // The helpers a policy may call in place of naming the boss: every public function whose body grants the boss.
  let bossHelpers: string[];
  beforeAll(async () => {
    policies = await sys<Policy>(
      `select tablename, policyname, coalesce(qual, '') || ' ' || coalesce(with_check, '') as expr from pg_policies where schemaname = 'public' order by 1, 2`,
    );
    functions = await sys<{ name: string; src: string }>(
      `select p.proname as name, p.prosrc as src from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' order by 1`,
    );
    const grantsBoss = new RegExp(`${HAS_ROLE('boss')}|has_any_role\\(\\s*(?:ARRAY|array)\\[[^\\]]*'boss'`);
    bossHelpers = functions.filter((f) => grantsBoss.test(f.src)).map((f) => f.name);
  });

  it('ninguna política, función ni vista nombra Secretaría ni Supervisión', async () => {
    expect(policies.length).toBeGreaterThan(80);
    expect(policies.filter((p) => /secretary|supervisor/.test(p.expr)).map((p) => `${p.tablename}.${p.policyname}`)).toEqual([]);
    expect(functions.filter((f) => /secretary|supervisor/.test(f.src)).map((f) => f.name)).toEqual([]);
    const views = await sys<{ viewname: string }>(`select viewname from pg_views where schemaname = 'public' and definition ~ '(secretary|supervisor)'`);
    expect(views).toEqual([]);
  });

  it('cada lista de roles que nombra a Redes, despacho, Grabación, política o el IVT nombra también al jefe', () => {
    const offenders: string[] = [];
    for (const [where, text] of [
      ...policies.map((p) => [`${p.tablename}.${p.policyname}`, p.expr] as const),
      ...functions.map((f) => [`${f.name}()`, f.src] as const),
    ]) {
      for (const m of text.matchAll(ARRAYS)) {
        const list = rolesIn(m[1]);
        if (list.some((r) => TEAM_ROLE_NAMES.includes(r)) && !list.includes('boss')) offenders.push(`${where}: [${list.join(', ')}]`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('un rol del equipo solo (has_role) aparece únicamente en las ramas de esta lista, y cada una sigue igual', () => {
    const check = (where: string, text: string, allowed: Record<string, RegExp> | undefined, offenders: string[]) => {
      const singles = [...text.matchAll(SINGLES)].map((m) => m[1]).filter((r) => TEAM_ROLE_NAMES.includes(r));
      for (const r of new Set(singles)) {
        const branch = allowed?.[r];
        if (!branch) offenders.push(`${where}: has_role('${r}') sin rama permitida`);
        else if (!branch.test(text)) offenders.push(`${where}: la rama de '${r}' cambió`);
      }
    };
    const offenders: string[] = [];
    for (const p of policies) check(`${p.tablename}.${p.policyname}`, p.expr, POLICY_BRANCHES[`${p.tablename}.${p.policyname}`], offenders);
    for (const f of functions) check(`${f.name}()`, f.src, FUNCTION_BRANCHES[f.name], offenders);
    expect(offenders).toEqual([]);
    // The list names only what exists: a branch that was dropped leaves the list too.
    for (const key of Object.keys(POLICY_BRANCHES)) expect(policies.map((p) => `${p.tablename}.${p.policyname}`), key).toContain(key);
    for (const key of Object.keys(FUNCTION_BRANCHES)) expect(functions.map((f) => f.name), key).toContain(key);
  });

  it('cada política que nombra un rol del equipo nombra al jefe o llama a una función que lo incluye', () => {
    expect(bossHelpers).toEqual(expect.arrayContaining(['can_see_event', 'can_see_schedule', 'can_manage_agenda', 'is_content_team', 'can_approve']));
    const callsHelper = (expr: string) => bossHelpers.some((f) => new RegExp(`(?:public\\.)?${f}\\(`).test(expr));
    const offenders = policies
      .filter((p) => TEAM_ROLE_NAMES.some((r) => new RegExp(ROLE(r)).test(p.expr)))
      .filter((p) => !new RegExp(ROLE('boss')).test(p.expr) && !callsHelper(p.expr))
      .map((p) => `${p.tablename}.${p.policyname}`);
    expect(offenders).toEqual([]);
    // Every helper that grants one team role on its own grants the boss as well (the functions in FUNCTION_BRANCHES).
    for (const name of Object.keys(FUNCTION_BRANCHES)) expect(bossHelpers, name).toContain(name);
  });

  it('la fecha, la hora y la dirección viven en una sola tabla (y la vista del calendario que la lee)', async () => {
    const cols = await sys<{ table_name: string; column_name: string }>(
      `select table_name, column_name from information_schema.columns where table_schema = 'public'
          and column_name in ('starts_at', 'ends_at', 'exact_address', 'directions', 'site_contacts') order by 1, 2`,
    );
    expect(new Set(cols.map((c) => c.table_name))).toEqual(new Set(['event_schedule', 'event_calendar']));
    // The view runs as whoever reads it (security_invoker), so its rows are event_schedule's (RLS).
    const opts = await sysOne<{ o: string[] | null }>(`select reloptions as o from pg_class where oid = 'public.event_calendar'::regclass`);
    expect(opts!.o ?? []).toContain('security_invoker=true');
  });
});
