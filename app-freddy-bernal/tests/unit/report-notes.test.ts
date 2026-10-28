// A community report's history and files after the audit of 28/10 (20261028002300_report_files_notes.sql): the app
// refuses a phone in a note or in the reason of a change of state before the database does (the history is read
// without 2FA; the phones go in the contacts), and the gallery tells whoever uploads who sees each kind (a report's
// documents: política, the boss and despacho, never Administración). The actions run for real against the in-memory
// database; the session is mocked. All data here is invented.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Session } from '@/lib/auth/session';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import { PhotoGallery } from '@/components/fichas/photo-gallery';
import { REPORT_KINDS } from '@/lib/domain/media-mime';
import { makeTestDb, type TestDb } from '../rls/setup';

const h = vi.hoisted(() => ({ session: null as unknown }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ requireSession: vi.fn(async () => h.session) }));
// The uploader needs the app router; here only the words around it matter.
vi.mock('@/components/media/uploader', () => ({ Uploader: () => null }));

let t: TestDb;
let reports: typeof import('@/lib/actions/reports');
let report: string;

function as(key: DemoUserKey) {
  const u = DEMO_USERS.find((x) => x.key === key)!;
  h.session = {
    userId: t.ids[key], email: u.email, name: u.name, roles: [...u.roles], aal: 'aal1', mfaRequired: true, mfaOk: false,
    claims: { sub: t.ids[key], aal: 'aal1', role: 'authenticated' }, viewAs: null,
  } satisfies Session;
}
const history = () =>
  t.system((sql) => sql.query<{ kind: string; note: string | null }>(`select kind, note from public.ficha_updates where community_report_id = $1 and note is not null order by created_at, id`, [report]));
const PHONE_ERROR = /^No se guardó: la nota tiene algo que parece un teléfono \(0414 555 0123\), y la historia del reporte se lee sin doble factor\. Los teléfonos van en «Teléfono» de la persona que reporta\./;

beforeAll(async () => {
  t = await makeTestDb();
  (globalThis as { __fbBackend?: Promise<unknown> }).__fbBackend = Promise.resolve(t.backend);
  reports = await import('@/lib/actions/reports');
  report = (await t.as('politics', (sql) =>
    sql.one<{ id: string }>(`insert into public.community_reports (title, municipality, type) values ('Bote de agua de las notas (demo)', 'Torbes', 'repair') returning id`)))!.id;
}, 120_000);

describe('la historia de un reporte no lleva teléfonos', () => {
  it('una nota con un teléfono se rechaza en español, antes de la base; sin teléfono se guarda', async () => {
    for (const who of ['politics', 'dispatch', 'boss'] as const) {
      as(who);
      const r = await reports.addReportNote({ id: report, note: 'La vocera (demo) pide que la llamen al 0414 555 0123.' });
      expect(r.ok, who).toBe(false);
      expect((r as { error: string }).error, who).toMatch(PHONE_ERROR);
    }
    expect(await history()).toEqual([]);
    as('politics');
    expect((await reports.addReportNote({ id: report, note: 'Se entregaron 1.500.000 litros (demo).' })).ok).toBe(true);
    expect(await history()).toEqual([{ kind: 'note', note: 'Se entregaron 1.500.000 litros (demo).' }]);
  });

  it('el motivo de un cambio de estado tampoco: el estado no cambia; sin teléfono, sí, con su motivo', async () => {
    as('politics');
    const r = await reports.setReportStatus({ id: report, status: 'in_progress', note: 'Llamar al 0414 555 0123 para la cuadrilla.' });
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toMatch(PHONE_ERROR);
    expect(await t.system((sql) => sql.one('select status from public.community_reports where id = $1', [report]))).toEqual({ status: 'planned' });
    expect((await reports.setReportStatus({ id: report, status: 'in_progress', note: 'Ya empezó la cuadrilla (demo).' })).ok).toBe(true);
    expect((await history()).at(-1)).toEqual({ kind: 'status', note: 'Ya empezó la cuadrilla (demo).' });
  });
});

describe('quién ve los archivos de un reporte, dicho a quien sube', () => {
  it('las fotos: política, el jefe, el despacho y Administración; los documentos: solo política, el jefe y el despacho', () => {
    const out = renderToStaticMarkup(createElement(PhotoGallery, { target: { reportId: report }, kinds: REPORT_KINDS, media: [], canUpload: true, title: 'Evidencias' }));
    expect(out).toContain('Los ven política, el jefe, el despacho y Administración. Redes y Grabación nunca ven un reporte.');
    expect(out).toContain('Los ven solo política, el jefe y el despacho: nunca Administración, Redes ni Grabación.');
  });
});
