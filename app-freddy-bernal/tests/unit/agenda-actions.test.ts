// The shared agenda's server actions themselves (src/lib/actions/agenda.ts and events.ts), against a real in-memory
// database with the same migrations. The session and notify() are mocked: who gets each notice (never the person
// who acted), that no notice carries a date, time, address, phone or reason, the race on one ficha, the merge of
// two editors (the last one wins and the other is told, with field names only) and what ends up in the database.
// All data here is invented.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import type { Session } from '@/lib/auth/session';
import type { Notice } from '@/lib/notify';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import { looksLikeDateTime } from '@/lib/push/text';
import { makeTestDb, type TestDb } from '../rls/setup';

const h = vi.hoisted(() => ({ session: null as unknown, notices: [] as unknown[] }));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ requireSession: vi.fn(async () => h.session) }));
vi.mock('@/lib/notify', async (orig) => ({
  ...(await orig<typeof import('@/lib/notify')>()),
  notify: vi.fn(async (n: unknown) => {
    h.notices.push(n);
  }),
}));

let t: TestDb;
let agenda: typeof import('@/lib/actions/agenda');
let events: typeof import('@/lib/actions/events');

beforeAll(async () => {
  t = await makeTestDb();
  (globalThis as { __fbBackend?: Promise<unknown> }).__fbBackend = Promise.resolve(t.backend);
  agenda = await import('@/lib/actions/agenda');
  events = await import('@/lib/actions/events');
});

beforeEach(() => {
  h.notices.length = 0;
});

function as(key: DemoUserKey) {
  const u = DEMO_USERS.find((x) => x.key === key)!;
  h.session = {
    userId: t.ids[key], email: u.email, name: u.name, roles: [...u.roles], aal: 'aal2', mfaRequired: false, mfaOk: true,
    claims: { sub: t.ids[key], aal: 'aal2', role: 'authenticated' }, viewAs: null,
  } satisfies Session;
}

const notices = () => h.notices as Notice[];
const sent = (kind: string) => notices().filter((n) => n.kind === kind);
const SECRETS = ['Calle de prueba', 'plaza de prueba', '0000-0000123', '0000-0000777', 'Enlace secreto', '10:00', '15:30', '16:00', 'Lluvia'];
const noSecrets = () => {
  const out = JSON.stringify(notices().map((x) => [x.title, x.body, x.link, x.key]));
  for (const s of SECRETS) expect(out, s).not.toContain(s);
  for (const n of notices()) expect(looksLikeDateTime(`${n.title} ${n.body ?? ''}`), n.title).toBe(false);
};
let n = 0;
const day = (plus: number) => new Date(Date.now() + plus * 86400_000).toISOString().slice(0, 10);
const readyObra = () =>
  t.as('ivt', async (sql) => {
    const f = (await sql.one<{ id: string }>(`insert into public.obra_fichas (name, municipality, sector, engineer_name, works, people_count, stage) values ($1, 'Junín', 'Sector de prueba (demo)', 'Residente (demo)', 'Pilotes nuevos.', 900, 'to_schedule') returning id`, [
      `Obra de las acciones ${++n} (demo)`,
    ]))!;
    await sql.query(`insert into public.obra_ficha_private (id, liaison_name, liaison_phone) values ($1, 'Enlace secreto (demo)', '0000-0000777')`, [f.id]);
    return f.id;
  });
const agendaReport = () =>
  t.as('politics', async (sql) =>
    (await sql.one<{ id: string }>(`insert into public.community_reports (title, municipality, type, wants_agenda, in_charge) values ($1, 'Torbes', 'event', true, 'Encargada secreta (demo)') returning id`, [
      `Asamblea de las acciones ${++n} (demo)`,
    ]))!.id,
  );
const when = (plus = 30, time = '10:00') => ({ date: day(plus), time, durationMin: 60 });
const sched = (id: string, extra: Record<string, unknown> = {}) => ({
  id, title: `Visita de obra: prueba ${++n}`, placeName: '', cameraUserId: '', allowOverlap: true, ...when(),
  exactAddress: 'Calle de prueba 1 (demo)', directions: 'Al lado de la plaza de prueba', siteContacts: 'Vocera 0000-0000123', ...extra,
});
const dataOf = <T,>(r: unknown) => (r as { data: T }).data;

describe('«Ponerle fecha»', () => {
  it('el jefe: la visita queda aceptada; le llega «Ya tiene fecha» al IVT (para verla) y al despacho, y a quien graba su asignación', async () => {
    const obra = await readyObra();
    as('boss');
    const r = await agenda.scheduleObraFicha(sched(obra, { cameraUserId: t.ids.camera }));
    expect(r.ok, JSON.stringify(r)).toBe(true);
    const ev = dataOf<{ eventId: string }>(r).eventId;
    const row = await t.system((sql) => sql.one(`select kind, origin, boss_decision, obra_ficha_id from public.events where id = $1`, [ev]));
    expect(row).toEqual({ kind: 'obra_visit', origin: 'ivt', boss_decision: 'accepted', obra_ficha_id: obra });
    // The brief takes the ficha's main fields, never a contact.
    const brief = await t.system((sql) => sql.one<Record<string, string>>(`select * from public.event_brief where event_id = $1`, [ev]));
    expect(brief!.work_description).toBe('Pilotes nuevos.');
    expect(brief!.in_charge).toBe('Residente (demo)');
    expect(JSON.stringify(brief)).not.toMatch(/Enlace secreto|0000-0000777/);
    const scheduled = sent('agenda_scheduled');
    expect(scheduled.map((x) => x.userIds)).toEqual([[t.ids.ivt], [t.ids.dispatch]]);
    expect(scheduled[0].link).toBe(`/eventos/${ev}`);
    expect(sent('event_assigned')[0].userIds).toEqual([t.ids.camera]);
    expect(sent('event_new')).toHaveLength(0);
    noSecrets();
  });

  it('el despacho, un reporte: llega «por decidir» al jefe; política recibe «Ya tiene fecha» en su reporte, sin la fecha', async () => {
    const report = await agendaReport();
    as('dispatch');
    const r = await agenda.scheduleReport(sched(report, { title: 'Asamblea con los voceros' }));
    expect(r.ok, JSON.stringify(r)).toBe(true);
    const ev = dataOf<{ eventId: string }>(r).eventId;
    expect(await t.system((sql) => sql.one(`select kind, boss_decision from public.events where id = $1`, [ev]))).toEqual({ kind: 'community', boss_decision: 'pending' });
    const brief = await t.system((sql) => sql.one<Record<string, string>>(`select * from public.event_brief where event_id = $1`, [ev]));
    expect(JSON.stringify(brief)).not.toContain('Encargada secreta');
    const [p] = sent('agenda_scheduled');
    expect(p.userIds).toEqual([t.ids.politics]);
    expect(p.link).toBe(`/reportes/${report}`);
    expect(p.title).toBe('Ya tiene fecha: Asamblea con los voceros');
    expect(sent('event_new')[0].userIds).toEqual([t.ids.boss]);
    noSecrets();
  });

  it('dos personas le ponen fecha a la misma ficha: la segunda no puede, la primera queda, y lo escrito no se pierde', async () => {
    const obra = await readyObra();
    as('boss');
    const first = await agenda.scheduleObraFicha(sched(obra));
    expect(first.ok).toBe(true);
    as('dispatch');
    const second = await agenda.scheduleObraFicha(sched(obra));
    expect(second).toEqual({ ok: false, error: 'Esta obra ya tiene fecha: la pusieron mientras tanto.' });
    const live = await t.system((sql) => sql.query(`select id from public.events where obra_ficha_id = $1 and cancelled_at is null`, [obra]));
    expect(live).toEqual([{ id: dataOf<{ eventId: string }>(first).eventId }]);
  });

  it('nadie más: el IVT, política, Redes y administración no le ponen fecha; un título con la fecha no pasa', async () => {
    const obra = await readyObra();
    for (const who of ['ivt', 'politics', 'social', 'admin'] as const) {
      as(who);
      expect((await agenda.scheduleObraFicha(sched(obra))).ok, who).toBe(false);
    }
    as('boss');
    expect(await agenda.scheduleObraFicha(sched(obra, { title: 'Visita el viernes a las 9' }))).toEqual({ ok: false, error: 'El título no lleva fecha ni hora: eso va en sus campos.' });
    expect(notices()).toHaveLength(0);
  });
});

describe('dos personas editan el mismo evento: gana el último, con aviso al otro', () => {
  const newEvent = async () => {
    as('dispatch');
    const r = await events.createEvent({
      title: `Evento compartido ${++n}`, placeName: 'Sitio de prueba', municipality: '', summary: 'Resumen inicial', categoryId: '', urgency: 2, cameraUserId: t.ids.camera,
      allowOverlap: true, ...when(40), exactAddress: 'Calle de prueba 2 (demo)', directions: '', siteContacts: '',
      workDescription: 'Obra (demo)', ledBy: '', inCharge: '', achievements: '', keyFacts: '', protocol: '', notes: '',
    });
    h.notices.length = 0;
    return dataOf<{ id: string }>(r).id;
  };
  const schedRev = (id: string) => t.system(async (sql) => (await sql.one<{ rev: number }>(`select rev from public.event_schedule where event_id = $1`, [id]))!.rev);

  it('el jefe cambia la hora y el despacho la dirección: quedan las dos y nadie recibe «cambió lo mismo»', async () => {
    const id = await newEvent();
    const rev = await schedRev(id);
    const base = { ...when(40), exactAddress: 'Calle de prueba 2 (demo)', directions: '', siteContacts: '' };
    as('boss');
    expect((await events.updateSchedule({ id, ...base, time: '15:30', rev, base })).ok).toBe(true);
    as('dispatch');
    const r = await events.updateSchedule({ id, ...base, exactAddress: 'Calle de prueba 3 (demo)', rev, base });
    expect(r.ok).toBe(true);
    const row = await t.system((sql) => sql.one<{ starts_at: Date; exact_address: string; updated_by: string }>(`select starts_at, exact_address, updated_by from public.event_schedule where event_id = $1`, [id]));
    expect(row!.exact_address).toBe('Calle de prueba 3 (demo)');
    expect(new Date(row!.starts_at).toISOString()).toBe(new Date(`${day(40)}T19:30:00Z`).toISOString()); // 15:30 in Táchira (UTC-4)
    expect(sent('agenda_overwritten')).toHaveLength(0);
    noSecrets();
  });

  it('los dos cambian la hora: gana el último y el otro recibe el aviso, solo con los nombres de los campos', async () => {
    const id = await newEvent();
    const rev = await schedRev(id);
    const base = { ...when(40), exactAddress: 'Calle de prueba 2 (demo)', directions: '', siteContacts: '' };
    as('boss');
    expect((await events.updateSchedule({ id, ...base, time: '15:30', rev, base })).ok).toBe(true);
    // The boss moved it: Grabación learns, critically, without the new time.
    const [moved] = sent('event_moved');
    expect(moved.userIds).toEqual([t.ids.camera]);
    h.notices.length = 0;
    as('dispatch');
    const r = await events.updateSchedule({ id, ...base, time: '16:00', rev, base });
    expect(r.ok).toBe(true);
    expect((r as { message?: string }).message).toMatch(/^Guardado\. Jefe \(demo\) también había cambiado Fecha y hora y Duración|^Guardado\. Jefe \(demo\) también había cambiado Fecha y hora/);
    const [o, ...rest] = sent('agenda_overwritten');
    expect(rest).toHaveLength(0);
    expect(o.userIds).toEqual([t.ids.boss]);
    expect(o.title).toMatch(/^Rubén Contreras cambió lo mismo que tú en Evento compartido/);
    expect(o.body).toMatch(/^Fecha y hora/);
    expect(o.body).toContain('Lo tuyo quedó en el historial del evento.');
    // The boss does not also get the optional «cambió».
    expect(sent('agenda_changed').flatMap((x) => x.userIds)).not.toContain(t.ids.boss);
    noSecrets();
  });

  it('los datos del evento: el jefe cambia el título, el despacho el resumen con lo viejo de base; quedan los dos', async () => {
    const id = await newEvent();
    const rev = (await t.system((sql) => sql.one<{ rev: number }>(`select rev from public.events where id = $1`, [id])))!.rev;
    const base = { title: `Evento compartido ${n}`, placeName: 'Sitio de prueba', municipality: '', summary: 'Resumen inicial', categoryId: '', urgency: '2' };
    as('boss');
    expect((await events.updateEvent({ id, ...base, title: 'Título del jefe', urgency: 2, rev, base })).ok).toBe(true);
    as('dispatch');
    expect((await events.updateEvent({ id, ...base, summary: 'Resumen del despacho', urgency: 2, rev, base })).ok).toBe(true);
    const row = await t.system((sql) => sql.one(`select title, summary, updated_by from public.events where id = $1`, [id]));
    expect(row).toEqual({ title: 'Título del jefe', summary: 'Resumen del despacho', updated_by: t.ids.dispatch });
    expect(sent('agenda_overwritten')).toHaveLength(0);
  });

  it('el storyboard: dos de Redes cambian el discurso; gana el último y el otro recibe el aviso', async () => {
    const id = await newEvent();
    as('social');
    expect((await events.saveStoryboard({ eventId: id, speech: 'Saludo inicial.', blocks: [] })).ok).toBe(true);
    const base = { speech: 'Saludo inicial.', blocks: [] };
    const rev = (await t.system((sql) => sql.one<{ rev: number }>(`select rev from public.storyboards where event_id = $1`, [id])))!.rev;
    as('social2');
    expect((await events.saveStoryboard({ eventId: id, speech: 'Versión de Yorman.', blocks: [], rev, base })).ok).toBe(true);
    h.notices.length = 0;
    as('social');
    const r = await events.saveStoryboard({ eventId: id, speech: 'Versión de Daniela.', blocks: [], rev, base });
    expect(r.ok).toBe(true);
    const [o] = sent('agenda_overwritten');
    expect(o.userIds).toEqual([t.ids.social2]);
    expect(o.body).toMatch(/^Lo que va a decir\./);
    expect((await t.system((sql) => sql.one<{ speech: string }>(`select speech from public.storyboards where event_id = $1`, [id])))!.speech).toBe('Versión de Daniela.');
    // A block list one did not touch stays as the other one saved it.
    as('social2');
    await events.saveStoryboard({ eventId: id, speech: 'Versión de Daniela.', blocks: [{ shot: 'General', angle: '', bossLine: 'Hola', broll: '', fact: '', factSource: '' }], base: { speech: 'Versión de Daniela.', blocks: [] } });
    as('social');
    await events.saveStoryboard({ eventId: id, speech: 'Versión final.', blocks: [], base: { speech: 'Versión de Daniela.', blocks: [] } });
    const blocks = await t.system((sql) => sql.query(`select b.boss_line from public.storyboard_blocks b join public.storyboards s on s.id = b.storyboard_id where s.event_id = $1 and b.deleted_at is null`, [id]));
    expect(blocks).toEqual([{ boss_line: 'Hola' }]);
  });
});

describe('administración en la agenda: lee y borra, no la mueve', () => {
  it('su pieza y su storyboard de un evento se guardan sin mover el estado del evento (eso es de Redes y del jefe)', async () => {
    const pieces = await import('@/lib/actions/pieces');
    const id = (await t.system((sql) => sql.one<{ id: string }>(`insert into public.events (title, boss_decision, work_status) values ('Evento con material de prueba', 'accepted', 'material') returning id`)))!.id;
    as('admin');
    expect((await pieces.createPiece({ eventId: id, kind: 'video', title: 'Pieza de administración (demo)', categoryId: '' })).ok).toBe(true);
    expect((await events.saveStoryboard({ eventId: id, speech: 'Discurso de prueba.', blocks: [] })).ok).toBe(true);
    expect(await t.system((sql) => sql.one(`select work_status from public.events where id = $1`, [id]))).toEqual({ work_status: 'material' });
    as('social');
    expect((await pieces.createPiece({ eventId: id, kind: 'short', title: 'Pieza de Redes (demo)', categoryId: '' })).ok).toBe(true);
    expect(await t.system((sql) => sql.one(`select work_status from public.events where id = $1`, [id]))).toEqual({ work_status: 'editing' });
  });
});

describe('Mover y Cancelar', () => {
  it('mover una visita de obra: Grabación y el IVT reciben «Cambió la fecha u hora» (crítico), sin la nueva', async () => {
    const obra = await readyObra();
    as('boss');
    const ev = dataOf<{ eventId: string }>(await agenda.scheduleObraFicha(sched(obra, { cameraUserId: t.ids.camera2 }))).eventId;
    h.notices.length = 0;
    const rev = (await t.system((sql) => sql.one<{ rev: number }>(`select rev from public.event_schedule where event_id = $1`, [ev])))!.rev;
    as('dispatch');
    const r = await agenda.moveEvent({ id: ev, ...when(31, '15:30'), rev, base: when(30) });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    const [m] = sent('event_moved');
    expect(new Set(m.userIds)).toEqual(new Set([t.ids.camera2, t.ids.ivt]));
    expect(m.title).toMatch(/^Cambió la fecha u hora: Visita de obra: prueba/);
    // The place did not move.
    expect((await t.system((sql) => sql.one<{ exact_address: string }>(`select exact_address from public.event_schedule where event_id = $1`, [ev])))!.exact_address).toBe('Calle de prueba 1 (demo)');
    noSecrets();
  });

  it('cancelar: el motivo no lleva fecha; avisa a quien graba, a Redes, al IVT y al jefe; la obra vuelve con un «Por ponerle fecha» nuevo', async () => {
    const obra = await readyObra();
    as('boss');
    const first = dataOf<{ eventId: string }>(await agenda.scheduleObraFicha(sched(obra, { cameraUserId: t.ids.camera }))).eventId;
    h.notices.length = 0;
    as('dispatch');
    expect(await agenda.cancelEvent({ id: first, reason: 'Lluvia del jueves' })).toEqual({ ok: false, error: 'El motivo lo leen todos (Redes también): escríbelo sin fecha, hora ni teléfono.' });
    const r = await agenda.cancelEvent({ id: first, reason: 'Lluvia fuerte en la zona' });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    const [c] = sent('event_cancelled');
    expect(new Set(c.userIds)).toEqual(new Set([t.ids.camera, t.ids.social, t.ids.social2, t.ids.ivt, t.ids.boss]));
    expect(JSON.stringify(c)).not.toContain('Lluvia');
    const [again] = sent('to_schedule');
    expect(again.userIds).toEqual([t.ids.boss]);
    expect(again.link).toBe(`/obras/${obra}`);
    expect(again.key).toContain(`cancel-${first}`);
    expect(await t.system((sql) => sql.one(`select stage from public.obra_fichas where id = $1`, [obra]))).toEqual({ stage: 'to_schedule' });
    expect(await agenda.cancelEvent({ id: first, reason: '' })).toEqual({ ok: false, error: 'Este evento ya estaba cancelado.' });
    // A second visit, and the first cannot come back while it lives.
    as('boss');
    const second = await agenda.scheduleObraFicha(sched(obra));
    expect(second.ok).toBe(true);
    expect(await agenda.restoreEvent({ id: first })).toEqual({ ok: false, error: 'Esa ficha ya tiene otra visita con fecha: cancela esa primero.' });
    noSecrets();
  });

  it('volver a la agenda: avisa que ya no está cancelado', async () => {
    as('dispatch');
    const r = await events.createEvent({
      title: `Evento que vuelve ${++n}`, placeName: '', municipality: '', summary: '', categoryId: '', urgency: 2, cameraUserId: '', allowOverlap: true, ...when(50),
      exactAddress: '', directions: '', siteContacts: '', workDescription: '', ledBy: '', inCharge: '', achievements: '', keyFacts: '', protocol: '', notes: '',
    });
    const id = dataOf<{ id: string }>(r).id;
    expect((await agenda.cancelEvent({ id, reason: '' })).ok).toBe(true);
    h.notices.length = 0;
    as('boss');
    expect((await agenda.restoreEvent({ id })).ok).toBe(true);
    const [b] = sent('event_cancelled');
    expect(b.title).toMatch(/^Volvió a la agenda: Evento que vuelve/);
    expect(b.userIds).toContain(t.ids.dispatch);
    expect(b.userIds).not.toContain(t.ids.boss);
  });

  it('«No va»: la obra se archiva y el reporte deja de ir a la agenda, con el motivo en su historia', async () => {
    const obra = await readyObra();
    const report = await agendaReport();
    as('dispatch');
    expect((await agenda.dismissFromAgenda({ kind: 'obra', id: obra, note: 'Ya la visitó el año pasado' })).ok).toBe(true);
    expect((await agenda.dismissFromAgenda({ kind: 'report', id: report, note: 'Es solo un avance' })).ok).toBe(true);
    expect(await t.system((sql) => sql.one(`select stage from public.obra_fichas where id = $1`, [obra]))).toEqual({ stage: 'archived' });
    expect(await t.system((sql) => sql.one(`select wants_agenda from public.community_reports where id = $1`, [report]))).toEqual({ wants_agenda: false });
    const notes = await t.system((sql) => sql.query<{ note: string }>(`select note from public.ficha_updates where (obra_ficha_id = $1 or community_report_id = $2) and note is not null`, [obra, report]));
    expect(notes.map((x) => x.note).sort()).toEqual(['No va a la agenda: Es solo un avance', 'No va a la agenda: Ya la visitó el año pasado']);
    expect((await agenda.dismissFromAgenda({ kind: 'obra', id: obra, note: 'Otra vez' })).ok).toBe(false);
    as('ivt');
    expect((await agenda.dismissFromAgenda({ kind: 'obra', id: await readyObra(), note: 'No quiero' })).ok).toBe(false);
  });
});
