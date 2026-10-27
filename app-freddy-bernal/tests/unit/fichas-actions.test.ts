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
    expect(notice.key).toBe(`to_schedule:obra:${id}`);
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
