// The fichas' server actions themselves (§4.1 and §4.2), against a real in-memory database with the same
// migrations. The session and notify() are mocked: who gets «Por ponerle fecha» (the boss and despacho, never the
// person who saved it), that it never carries a date, that a draft sends nothing, and what ends up in the database.
// All data here is invented.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import type { Session } from '@/lib/auth/session';
import type { Notice } from '@/lib/notify';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import { looksLikeDateTime } from '@/lib/push/text';
import { OBRA_FIELDS } from '@/lib/domain/ficha-fields';
import { buildObraDialog, dialogInput } from '@/lib/domain/obra-dialog';
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
let obras: typeof import('@/lib/actions/obras');
let reports: typeof import('@/lib/actions/reports');

beforeAll(async () => {
  t = await makeTestDb();
  (globalThis as { __fbBackend?: Promise<unknown> }).__fbBackend = Promise.resolve(t.backend);
  obras = await import('@/lib/actions/obras');
  reports = await import('@/lib/actions/reports');
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
let n = 0;

// A complete obra ficha: every field answered (a few on purpose with «No aplica» / «Por confirmar»).
function fullObra(over: Record<string, string> = {}) {
  const values: Record<string, string> = {
    name: `Asfaltado de prueba ${++n} (demo)`, municipality: 'Junín', parish: 'Parroquia de prueba (demo)', sector: 'Sector de prueba (demo)',
    engineer_name: 'Ingeniero de prueba (demo)', engineer_phone: '0000-0000901', problem: 'La vía tiene huecos.', problem_since: 'hace tres años',
    why_decided: 'La pidió la comunidad.', works: 'Asfaltado de 2 km de vía.', communities: 'el sector de prueba (demo)', people_count: '1.200',
    families_count: '300', benefits: 'Llega el transporte.', reporter_name: 'Vecina que denunció (demo)', reported_when: 'el mes pasado',
    reported_via: 'Asamblea', reporter_attends: 'no', representative: 'Su hijo (demo)', liaison_name: 'Enlace de prueba (demo)',
    liaison_phone: '0000-0000902', executor: 'Contratista de prueba (demo)', investment: '1.500.000', currency: 'VES', funding_source: 'Fondo de prueba (demo)',
    work_state: 'in_progress', progress_pct: '40', started_on: '2026-09-01', due_on: '2027-02-01', difficulties: 'Lluvias.', solutions: 'Dos turnos.',
    other_aid: '', pending_needs: 'Alumbrado.', boss_should_know: 'La comunidad pide reductores (demo).', next_action: 'Revisar el avance.',
    follow_up_owner: 'Ingeniero de prueba (demo)', follow_up_due: '2026-11-15', ...over,
  };
  return { values, marks: { other_aid: 'not_applicable' } as Record<string, string> };
}

describe('ficha de obra: «Guardar borrador» no avisa', () => {
  it('el IVT guarda un borrador a medias: queda en borrador y nadie recibe aviso', async () => {
    as('ivt');
    const r = await obras.saveObraFicha({ submit: false, values: { name: 'Borrador de prueba (demo)', municipality: 'Torbes', works: 'Muro.' }, marks: {} });
    expect(r.ok).toBe(true);
    expect(notices()).toHaveLength(0);
    const id = (r as { data: { id: string } }).data.id;
    const row = await t.system((sql) => sql.one<{ stage: string; created_by: string }>(`select stage, created_by from public.obra_fichas where id = $1`, [id]));
    expect(row).toEqual({ stage: 'draft', created_by: t.ids.ivt });
  });

  it('«Guardar y avisar» con algo sin responder no guarda ni avisa, y dice qué falta', async () => {
    as('ivt');
    const before = (await t.system((sql) => sql.one<{ n: number }>(`select count(*)::int as n from public.obra_fichas`)))!.n;
    const { values, marks } = fullObra({ problem: '' });
    const r = await obras.saveObraFicha({ submit: true, values, marks });
    expect(r).toEqual({ ok: false, error: 'Falta «Qué problema resuelve»: escríbelo o marca «No aplica» o «Por confirmar».' });
    expect(notices()).toHaveLength(0);
    expect((await t.system((sql) => sql.one<{ n: number }>(`select count(*)::int as n from public.obra_fichas`)))!.n).toBe(before);
  });

  it('un nombre con fecha u hora se rechaza (la fecha la pone el jefe o el despacho)', async () => {
    as('ivt');
    const { values, marks } = fullObra({ name: 'Visita al puente el 28/10 a las 9:30' });
    expect(await obras.saveObraFicha({ submit: true, values, marks })).toEqual({ ok: false, error: 'El título no lleva fecha ni hora: eso va en sus campos.' });
    expect(notices()).toHaveLength(0);
  });
});

describe('ficha de obra: «Guardar y avisar» → «Por ponerle fecha»', () => {
  it('le llega al jefe y al despacho, no a quien la guardó, con nombre y municipio y sin fecha', async () => {
    as('ivt');
    const { values, marks } = fullObra();
    const r = await obras.saveObraFicha({ submit: true, values, marks });
    expect(r.ok).toBe(true);
    const id = (r as { data: { id: string } }).data.id;
    const [notice, ...rest] = sent('to_schedule');
    expect(rest).toHaveLength(0);
    expect(new Set(notice.userIds)).toEqual(new Set([t.ids.boss, t.ids.dispatch]));
    expect(notice.userIds).not.toContain(t.ids.ivt);
    expect(notice.title).toBe(`Por ponerle fecha: ${values.name} (Junín)`);
    expect(notice.link).toBe(`/obras/${id}`);
    expect(notice.key).toBe(`to_schedule:obra:${id}:1`);
    expect(looksLikeDateTime(`${notice.title} ${notice.body ?? ''}`)).toBe(false);
    const out = JSON.stringify(notices());
    for (const secret of ['0000-0000901', '0000-0000902', 'Vecina que denunció', 'Enlace de prueba', '2027-02-01', '2026-11-15', 'reductores']) expect(out).not.toContain(secret);

    // In the database: ready, numbers as numbers, marks kept, contacts apart, the history with field names only.
    const row = await t.system((sql) =>
      sql.one<{ stage: string; people_count: number; progress_pct: number; other_aid: string; marks: Record<string, string>; rev: number }>(
        `select stage, people_count, progress_pct, other_aid, marks, rev from public.obra_fichas where id = $1`,
        [id],
      ),
    );
    expect(row).toEqual({ stage: 'to_schedule', people_count: 1200, progress_pct: 40, other_aid: '', marks: { other_aid: 'not_applicable' }, rev: 1 });
    const priv = await t.system((sql) => sql.one<{ liaison_phone: string; reporter_attends: string }>(`select liaison_phone, reporter_attends from public.obra_ficha_private where id = $1`, [id]));
    expect(priv).toEqual({ liaison_phone: '0000-0000902', reporter_attends: 'no' });
    const hist = await t.system((sql) => sql.query<{ kind: string; fields: string[] }>(`select kind, fields from public.ficha_updates where obra_ficha_id = $1 order by kind`, [id]));
    expect(hist.map((x) => x.kind)).toEqual(['contact', 'created']);
    expect(JSON.stringify(hist)).not.toContain('0000-0000902');

    // Saving it again does not ring again.
    h.notices.length = 0;
    const again = await obras.saveObraFicha({ id, rev: 1, submit: false, values: { ...values, sector: 'Sector cambiado (demo)' }, marks });
    expect(again.ok).toBe(true);
    expect(sent('to_schedule')).toHaveLength(0);
  });

  it('el despacho la manda: le llega solo al jefe', async () => {
    as('dispatch');
    const { values, marks } = fullObra();
    expect((await obras.saveObraFicha({ submit: true, values, marks })).ok).toBe(true);
    expect(sent('to_schedule').flatMap((x) => x.userIds)).toEqual([t.ids.boss]);
  });

  it('un borrador que se completa y se manda avisa una vez', async () => {
    as('ivt');
    const { values, marks } = fullObra();
    const draft = await obras.saveObraFicha({ submit: false, values: { name: values.name, municipality: values.municipality }, marks: {} });
    const id = (draft as { data: { id: string } }).data.id;
    expect(notices()).toHaveLength(0);
    const r = await obras.saveObraFicha({ id, submit: true, values, marks });
    expect(r.ok).toBe(true);
    expect(sent('to_schedule')).toHaveLength(1);
    expect((await t.system((sql) => sql.one<{ stage: string }>(`select stage from public.obra_fichas where id = $1`, [id])))!.stage).toBe('to_schedule');
  });

  it('lo marcado se guarda vacío aunque traiga algo escrito', async () => {
    as('ivt');
    const { values } = fullObra({ investment: 'algo que quedó escrito', progress_pct: '999' });
    const r = await obras.saveObraFicha({ submit: true, values, marks: { investment: 'to_confirm', progress_pct: 'to_confirm', other_aid: 'not_applicable' } });
    expect(r.ok).toBe(true);
    const id = (r as { data: { id: string } }).data.id;
    const row = await t.system((sql) => sql.one(`select investment, progress_pct, marks from public.obra_fichas where id = $1`, [id]));
    expect(row).toEqual({ investment: '', progress_pct: null, marks: { investment: 'to_confirm', progress_pct: 'to_confirm', other_aid: 'not_applicable' } });
  });

  it('política, redes y grabación no guardan fichas de obra', async () => {
    for (const who of ['politics', 'social', 'camera'] as const) {
      as(who);
      const { values, marks } = fullObra();
      const r = await obras.saveObraFicha({ submit: true, values, marks });
      expect(r.ok, who).toBe(false);
    }
    expect(notices()).toHaveLength(0);
  });

  it('con el doble factor pendiente, los contactos ni se piden ni se guardan', async () => {
    as('ivt');
    (h.session as Session).mfaOk = false;
    (h.session as Session).claims = { sub: t.ids.ivt, aal: 'aal1', role: 'authenticated' };
    const { values, marks } = fullObra();
    const r = await obras.saveObraFicha({ submit: true, values, marks });
    expect(r.ok).toBe(true);
    const id = (r as { data: { id: string } }).data.id;
    expect(await t.system((sql) => sql.one(`select id from public.obra_ficha_private where id = $1`, [id]))).toBeNull();
  });
});

describe('«Lo que voy a decir»', () => {
  it('el texto de la plantilla queda como plantilla; uno cambiado con una cifra nueva se guarda con aviso', async () => {
    as('ivt');
    const { values, marks } = fullObra();
    const id = ((await obras.saveObraFicha({ submit: true, values, marks })) as { data: { id: string } }).data.id;
    const row = await t.system((sql) => sql.one<Record<string, unknown>>(`select * from public.obra_fichas where id = $1`, [id]));
    const tpl = buildObraDialog(dialogInput(row!), { greeting: '¡Saludos, Táchira!', closings: ['Seguimos trabajando', 'Por amor al Táchira'] }).text;
    expect(tpl).toContain('Ya vamos en 40 % de avance.');
    const a = await obras.saveObraDialog({ id, text: tpl });
    expect(a).toMatchObject({ ok: true, message: 'Guardado: «Lo que voy a decir» quedó en la ficha.' });
    expect(await t.system((sql) => sql.one(`select fab_generated_by from public.obra_fichas where id = $1`, [id]))).toEqual({ fab_generated_by: 'template' });
    const b = await obras.saveObraDialog({ id, text: `${tpl}\n\nY ya son 75 kilómetros.` });
    expect(b).toMatchObject({ ok: true, message: 'Guardado. Ojo: estas cifras no están en la ficha: 75. Revísalas antes de leerlo.' });
    expect(await t.system((sql) => sql.one(`select fab_generated_by from public.obra_fichas where id = $1`, [id]))).toEqual({ fab_generated_by: 'manual' });
    as('politics');
    expect((await obras.saveObraDialog({ id, text: 'Otro texto.' })).ok).toBe(false);
  });
});

describe('archivar', () => {
  it('se archiva con su motivo (queda en la historia) y vuelve a borrador', async () => {
    as('ivt');
    const id = ((await obras.saveObraFicha({ submit: false, values: { name: 'Obra que no va (demo)', municipality: 'Torbes' }, marks: {} })) as { data: { id: string } }).data.id;
    expect((await obras.archiveObraFicha({ id, archive: true, note: 'Ya la hizo la alcaldía (demo).' })).ok).toBe(true);
    const hist = await t.system((sql) => sql.query<{ kind: string; to_value: string; note: string | null }>(`select kind, to_value, note from public.ficha_updates where obra_ficha_id = $1 and kind = 'status'`, [id]));
    expect(hist).toEqual([{ kind: 'status', to_value: 'archived', note: 'Ya la hizo la alcaldía (demo).' }]);
    expect((await obras.archiveObraFicha({ id, archive: false })).ok).toBe(true);
    expect(OBRA_FIELDS.length).toBeGreaterThan(30);
  });
});

describe('reporte comunitario', () => {
  const report = (over: Record<string, string> = {}) => ({
    values: {
      title: `Reporte de prueba ${++n} (demo)`, type: 'event', municipality: 'Torbes', parish: '', community: 'Sector de prueba (demo)',
      reported_at: '2026-10-27T09:00', status: 'planned', reporter_name: 'Vocera de prueba (demo)', reporter_phone: '0000-0000911',
      address: 'Casa comunal de prueba (demo)', activity_at: '2026-11-03T10:00', description: 'Asamblea con los voceros.', ...over,
    },
    marks: {},
  });

  it('«¿Va a la agenda del jefe?»: avisa al jefe y al despacho, con municipio y sin fecha, una sola vez', async () => {
    as('politics');
    const r = await reports.saveReport({ ...report(), wantsAgenda: true });
    expect(r.ok).toBe(true);
    const id = (r as { data: { id: string } }).data.id;
    const [notice, ...rest] = sent('to_schedule');
    expect(rest).toHaveLength(0);
    expect(new Set(notice.userIds)).toEqual(new Set([t.ids.boss, t.ids.dispatch]));
    expect(notice.title).toMatch(/^Por ponerle fecha: Reporte de prueba \d+ \(demo\) \(Torbes\)$/);
    expect(notice.link).toBe(`/reportes/${id}`);
    expect(looksLikeDateTime(notice.title)).toBe(false);
    for (const secret of ['0000-0000911', 'Vocera de prueba', 'Casa comunal', '2026-11-03', '10:00']) expect(JSON.stringify(notices())).not.toContain(secret);
    h.notices.length = 0;
    expect((await reports.saveReport({ id, ...report(), wantsAgenda: true })).ok).toBe(true);
    expect(sent('to_schedule')).toHaveLength(0);
  });

  it('sin agenda queda en el registro y no avisa; si después se prende, avisa', async () => {
    as('politics');
    const first = report({ type: 'incident' });
    const r = await reports.saveReport({ ...first, wantsAgenda: false });
    expect(r.ok).toBe(true);
    expect(notices()).toHaveLength(0);
    const id = (r as { data: { id: string } }).data.id;
    expect((await reports.saveReport({ id, ...first, wantsAgenda: true })).ok).toBe(true);
    expect(sent('to_schedule')).toHaveLength(1);
  });

  it('un reporte ya finalizado no va a la agenda aunque se marque', async () => {
    as('politics');
    expect((await reports.saveReport({ ...report({ status: 'finished' }), wantsAgenda: true })).ok).toBe(true);
    expect(notices()).toHaveLength(0);
  });

  it('el cambio de estado guarda su motivo en la historia', async () => {
    as('politics');
    const id = ((await reports.saveReport({ ...report(), wantsAgenda: false })) as { data: { id: string } }).data.id;
    expect((await reports.setReportStatus({ id, status: 'in_progress', note: 'Ya empezó la cuadrilla.' })).ok).toBe(true);
    expect(await reports.setReportStatus({ id, status: 'in_progress' })).toEqual({ ok: false, error: 'Ya está en ese estado.' });
    expect((await reports.addReportNote({ id, note: 'Volver a pasar por el sector.' })).ok).toBe(true);
    const hist = await t.system((sql) =>
      sql.query<{ kind: string; note: string | null; actor_id: string }>(`select kind, note, actor_id from public.ficha_updates where community_report_id = $1 and kind in ('status', 'note') order by kind desc`, [id]),
    );
    expect(hist).toEqual([
      { kind: 'status', note: 'Ya empezó la cuadrilla.', actor_id: t.ids.politics },
      { kind: 'note', note: 'Volver a pasar por el sector.', actor_id: t.ids.politics },
    ]);
  });

  it('el IVT, redes y grabación no guardan reportes', async () => {
    for (const who of ['ivt', 'social', 'camera'] as const) {
      as(who);
      expect((await reports.saveReport({ ...report(), wantsAgenda: true })).ok, who).toBe(false);
    }
    expect(notices()).toHaveLength(0);
  });

  it('un teléfono con letras o un enlace sin https se rechazan en español', async () => {
    as('politics');
    expect(await reports.saveReport({ ...report({ reporter_phone: 'llamar a la vecina' }), wantsAgenda: false })).toEqual({
      ok: false,
      error: '«Teléfono»: solo números, espacios, +, guiones y paréntesis.',
    });
    expect(await reports.saveReport({ ...report({ evidence_url: 'http://ejemplo.test/fotos' }), wantsAgenda: false })).toEqual({
      ok: false,
      error: '«Enlace al material (fotos, videos o documentos)»: el enlace empieza con https://',
    });
  });
});

// ---------------------------------------------------------------------------
// Fixes of the review of wave B.
// ---------------------------------------------------------------------------
describe('parroquias en texto libre: una sola parroquia aunque se escriba distinto', () => {
  const T0 = '2026-10-27';
  const rep = (title: string, parish: string, follow_up_due = '', reported_at = '2026-10-20T09:00') => ({
    values: {
      title, type: 'incident', municipality: 'Ayacucho', parish, community: 'Sector de prueba (demo)', reported_at,
      status: 'pending', follow_up_due, description: 'Revisión de prueba.',
    },
    marks: {},
    wantsAgenda: false,
  });

  it('el filtro por parroquia trae todas las formas de escribirla, también las vencidas, y lo vencido va primero', async () => {
    const { listReports, listObraFichas, municipalityTimeline } = await import('@/lib/data/fichas');
    as('politics');
    const id = async (p: Promise<unknown>) => ((await p) as { data: { id: string } }).data.id;
    const a = await id(reports.saveReport(rep('Jornada de revisión en la cancha (demo)', 'Parroquia Demo Uno')));
    const b = await id(reports.saveReport(rep('Fuga de agua de revisión (demo)', 'PARROQUIA  demo uno', '2026-10-01')));
    const other = await id(reports.saveReport(rep('Reporte de otra parroquia (demo)', 'Parroquia Demo Dos')));
    for (const typed of ['Parroquia Demo Uno', 'parroquia demo uno', '  PARROQUIA DEMO UNO ']) {
      const rows = await t.as('politics', (sql) => listReports(sql, T0, { municipality: 'Ayacucho', parish: typed }));
      expect(rows.map((r) => r.id), typed).toEqual([b, a]);
      expect(rows.map((r) => r.overdue)).toEqual([true, false]);
      expect(rows.map((r) => r.id)).not.toContain(other);
    }
    const line = await t.as('politics', (sql) => municipalityTimeline(sql, 'Ayacucho', T0, { parish: 'parroquia demo uno' }));
    expect(line.map((x) => x.id)).toEqual([b, a]);
    // The same for the obras of the IVT.
    as('ivt');
    const o1 = await id(obras.saveObraFicha({ submit: false, values: { name: 'Obra de parroquia uno (demo)', municipality: 'Ayacucho', parish: 'Parroquia Demo Uno' }, marks: {} }));
    const o2 = await id(obras.saveObraFicha({ submit: false, values: { name: 'Obra de parroquia uno bis (demo)', municipality: 'Ayacucho', parish: 'parroquia demo UNO' }, marks: {} }));
    const found = await t.as('ivt', (sql) => listObraFichas(sql, { municipality: 'Ayacucho', parish: 'PARROQUIA DEMO UNO' }));
    expect(new Set(found.map((r) => r.id))).toEqual(new Set([o1, o2]));
  });

  it('un reporte sin fecha de seguimiento no es «vencido» ni sale antes de los vencidos', async () => {
    const { listReports } = await import('@/lib/data/fichas');
    as('politics');
    const late = ((await reports.saveReport(rep('Vencida de orden (demo)', 'Parroquia Orden (demo)', '2026-09-01'))) as { data: { id: string } }).data.id;
    // Newer than the overdue one, and with no follow-up date: it used to sort first (NULL).
    const none = ((await reports.saveReport(rep('Sin seguimiento de orden (demo)', 'Parroquia Orden (demo)', '', '2026-10-26T09:00'))) as { data: { id: string } }).data.id;
    const rows = await t.as('politics', (sql) => listReports(sql, T0, { municipality: 'Ayacucho', parish: 'Parroquia Orden (demo)' }));
    expect(rows.map((r) => [r.id, r.overdue])).toEqual([[late, true], [none, false]]);
  });
});

describe('«Por ponerle fecha» se manda otra vez cuando de verdad se manda otra vez', () => {
  it('una obra archivada, sacada del archivo y mandada de nuevo avisa otra vez (con otra clave)', async () => {
    as('ivt');
    const { values, marks } = fullObra();
    const id = ((await obras.saveObraFicha({ submit: true, values, marks })) as { data: { id: string } }).data.id;
    expect((await obras.archiveObraFicha({ id, archive: true, note: 'Se pospone (demo).' })).ok).toBe(true);
    expect((await obras.archiveObraFicha({ id, archive: false })).ok).toBe(true);
    const again = await obras.saveObraFicha({ id, submit: true, values, marks });
    expect(again).toMatchObject({ ok: true, message: 'Guardada. Le avisamos al jefe y al despacho: «Por ponerle fecha».' });
    const keys = sent('to_schedule').map((n) => n.key);
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(2);
    for (const k of keys) expect(k).toMatch(new RegExp(`^to_schedule:obra:${id}:\\d+$`));
  });

  it('un reporte con «¿Va a la agenda?» apagado y prendido otra vez avisa otra vez', async () => {
    as('politics');
    const values = { title: `Reporte de reenvío ${++n} (demo)`, type: 'event', municipality: 'Torbes', reported_at: '2026-10-27T09:00', status: 'planned' };
    const id = ((await reports.saveReport({ values, marks: {}, wantsAgenda: true })) as { data: { id: string } }).data.id;
    expect((await reports.saveReport({ id, values, marks: {}, wantsAgenda: false })).ok).toBe(true);
    expect((await reports.saveReport({ id, values, marks: {}, wantsAgenda: true })).ok).toBe(true);
    const keys = sent('to_schedule').map((x) => x.key);
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(2);
  });
});

describe('contactos: lo que otra persona guardó mientras yo escribía no se borra', () => {
  it('el despacho cambia un teléfono; el IVT, con el formulario viejo abierto, guarda otro campo: el teléfono se queda y se le avisa', async () => {
    as('ivt');
    const { values, marks } = fullObra();
    const id = ((await obras.saveObraFicha({ submit: true, values, marks })) as { data: { id: string } }).data.id;
    const privRev = async () => (await t.system((sql) => sql.one<{ rev: number }>(`select rev from public.obra_ficha_private where id = $1`, [id])))!.rev;
    const opened = await privRev();
    // Despacho saves a new phone for the liaison.
    as('dispatch');
    const d = await obras.saveObraFicha({ id, submit: false, privRev: opened, privChanged: ['liaison_phone'], values: { ...values, liaison_phone: '0000-9999999' }, marks });
    expect(d).toMatchObject({ ok: true, message: 'Cambios guardados.' });
    // The IVT (form opened before) changes only «Sector».
    as('ivt');
    const r = await obras.saveObraFicha({ id, submit: false, privRev: opened, privChanged: [], values: { ...values, sector: 'Sector cambiado (demo)' }, marks });
    expect(r.ok).toBe(true);
    expect((r as { message: string }).message).toContain('Ojo: alguien cambió los contactos mientras escribías.');
    const row = await t.system((sql) => sql.one(`select f.sector, p.liaison_phone, p.engineer_phone from public.obra_fichas f join public.obra_ficha_private p on p.id = f.id where f.id = $1`, [id]));
    expect(row).toEqual({ sector: 'Sector cambiado (demo)', liaison_phone: '0000-9999999', engineer_phone: '0000-0000901' });
    // A contact the IVT did change is written; the rest stays as despacho left it.
    const r2 = await obras.saveObraFicha({ id, submit: false, privRev: opened, privChanged: ['engineer_phone'], values: { ...values, engineer_phone: '0000-0000999' }, marks });
    expect(r2.ok).toBe(true);
    expect(await t.system((sql) => sql.one(`select liaison_phone, engineer_phone from public.obra_ficha_private where id = $1`, [id]))).toEqual({
      liaison_phone: '0000-9999999',
      engineer_phone: '0000-0000999',
    });
    // With the current version, nothing is said.
    const r3 = await obras.saveObraFicha({ id, submit: false, privRev: await privRev(), privChanged: [], values: { ...values, liaison_phone: '0000-9999999', engineer_phone: '0000-0000999' }, marks });
    expect((r3 as { message: string }).message).toBe('Cambios guardados.');
  });

  it('en el reporte comunitario, lo mismo', async () => {
    as('politics');
    const values = { title: `Reporte de contactos ${++n} (demo)`, type: 'incident', municipality: 'Torbes', reported_at: '2026-10-27T09:00', status: 'planned', reporter_name: 'Vocera de prueba (demo)', reporter_phone: '0000-0000921' };
    const id = ((await reports.saveReport({ values, marks: {}, wantsAgenda: false })) as { data: { id: string } }).data.id;
    as('dispatch');
    expect((await reports.saveReport({ id, privRev: 1, privChanged: ['reporter_phone'], values: { ...values, reporter_phone: '0000-0000922' }, marks: {}, wantsAgenda: false })).ok).toBe(true);
    as('politics');
    const r = await reports.saveReport({ id, privRev: 1, privChanged: [], values: { ...values, community: 'Sector nuevo (demo)' }, marks: {}, wantsAgenda: false });
    expect((r as { message: string }).message).toContain('Ojo: alguien cambió los contactos');
    expect(await t.system((sql) => sql.one(`select reporter_phone from public.community_report_private where id = $1`, [id]))).toEqual({ reporter_phone: '0000-0000922' });
  });
});

describe('«Lo que voy a decir» no lleva contactos ni teléfonos', () => {
  it('se rechaza con el nombre de un contacto de la ficha o con algo que parece un teléfono; nada queda guardado', async () => {
    as('ivt');
    const { values, marks } = fullObra();
    const id = ((await obras.saveObraFicha({ submit: true, values, marks })) as { data: { id: string } }).data.id;
    const before = await t.system((sql) => sql.one(`select fab_dialog from public.obra_fichas where id = $1`, [id]));
    const name = await obras.saveObraDialog({ id, text: 'Saludos. Gracias a Enlace de prueba (demo) por acompañarnos.' });
    expect(name).toEqual({
      ok: false,
      error: 'No se guardó: «Lo que voy a decir» lo leen Redes y Grabación, y tiene un dato de los contactos de la ficha («Nombre del enlace comunitario»). Quítalo y guarda otra vez.',
    });
    const phone = await obras.saveObraDialog({ id, text: 'Saludos. Para más información llamen al 0414 555 1234.' });
    expect(phone).toEqual({
      ok: false,
      error: 'No se guardó: «Lo que voy a decir» lo leen Redes y Grabación, y tiene algo que parece un teléfono (0414 555 1234). Quítalo y guarda otra vez.',
    });
    const own = await obras.saveObraDialog({ id, text: 'Saludos. El teléfono del enlace es 0000-0000902.' });
    expect(own.ok).toBe(false);
    expect(await t.system((sql) => sql.one(`select fab_dialog from public.obra_fichas where id = $1`, [id]))).toEqual(before);
    // The figures of the ficha itself are not phones: «1.500.000» of the investment goes through.
    const ok = await obras.saveObraDialog({ id, text: 'Saludos. La inversión es de 1.500.000 bolívares y son 1.200 personas.' });
    expect(ok.ok).toBe(true);
  });
});

// Redes and Grabación read an obra's main part as stored while its visit is live: a phone there (even written with
// dots) is refused, with the field and where phones go; a report's main part too (it is read without 2FA).
describe('la parte principal de una ficha no se guarda con un teléfono (revisión de la ola D)', () => {
  it('la ficha de obra: «0414.555.0199» en «Próxima acción» no se guarda; la misma ficha sin él, sí', async () => {
    as('ivt');
    const { values, marks } = fullObra({ next_action: 'Coordinar con la vocera, que atiende al 0414.555.0199 (demo).' });
    const r = await obras.saveObraFicha({ submit: false, values, marks });
    expect(r.ok).toBe(false);
    const error = (r as { error: string }).error;
    expect(error).toContain('«Próxima acción o compromiso» tiene algo que parece un teléfono (0414.555.0199)');
    expect(error).toContain('«Teléfono del enlace comunitario»');
    expect((await t.system((sql) => sql.one<{ n: number }>(`select count(*)::int as n from public.obra_fichas where name = $1`, [values.name])))!.n).toBe(0);
    expect((await obras.saveObraFicha({ submit: false, values: { ...values, next_action: 'Coordinar con la vocera (demo).' }, marks })).ok).toBe(true);
    // «1.500.000» of the investment and a date are not phones.
    expect((await obras.saveObraFicha({ submit: false, values: { ...fullObra().values, problem_since: 'desde el 15/03/2024' }, marks })).ok).toBe(true);
  });

  it('el reporte comunitario: «0276.555.0101» en «Observaciones» no se guarda', async () => {
    as('politics');
    const r = await reports.saveReport({
      values: { title: `Reporte con teléfono ${++n} (demo)`, type: 'incident', municipality: 'Torbes', reported_at: '2026-10-27T09:00', status: 'planned', observations: 'Contacto: 0276.555.0101' },
      marks: {}, wantsAgenda: false,
    });
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toContain('«Observaciones» tiene algo que parece un teléfono (0276.555.0101)');
  });
});

describe('«Ya tiene fecha» para política', () => {
  it('política lee el evento de su reporte sin su fecha, y la base le dice que ya tiene fecha', async () => {
    const { getReport } = await import('@/lib/data/fichas');
    const linked = (await t.system((sql) => sql.one<{ id: string }>(`select community_report_id as id from public.events where community_report_id is not null order by code limit 1`)))!.id;
    const forPolitics = await t.as('politics', (sql) => getReport(sql, linked));
    // The activity born from its report (the shared agenda, 27/10/2026), never its date.
    expect(forPolitics!.event?.live).toBe(true);
    expect(forPolitics!.event?.starts_at).toBeNull();
    expect(forPolitics!.event?.ends_at).toBeNull();
    expect(forPolitics!.scheduled).toBe(true);
    const forBoss = await t.as('boss', (sql) => getReport(sql, linked));
    expect(forBoss!.event?.starts_at).toBeTruthy();
    expect(forBoss!.scheduled).toBe(true);
    const plain = (await t.system((sql) => sql.one<{ id: string }>(`select r.id from public.community_reports r where not exists (select 1 from public.events e where e.community_report_id = r.id) limit 1`)))!.id;
    expect((await t.as('politics', (sql) => getReport(sql, plain)))!.scheduled).toBe(false);
  });
});
