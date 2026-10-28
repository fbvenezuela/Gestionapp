// An obra's «Documentos» stay with the obra roles (revisión de la ola D, 20261027002100_obra_documents.sql): a
// denuncia or an acta carries the names, ID numbers and phones that the ficha keeps behind 2FA. Redes and the camera
// person of the live visit read the obra's before and progress photos, never its papers, and cannot change them.
// Against the demo: the visit to O-0001 with an invented paper added here. All data here is invented.
import { describe, expect, it, beforeAll } from 'vitest';
import { makeTestDb, type TestDb } from './setup';
import { linkedFicha } from '@/lib/data/events';
import type { DemoUserKey } from '@/lib/db/seed-demo';

let t: TestDb;
let visit: { id: string; obra_ficha_id: string; community_report_id: string | null };
let assigned: DemoUserKey;
let doc: string;

beforeAll(async () => {
  t = await makeTestDb();
  visit = (await t.system((sql) => sql.one(`select id, obra_ficha_id, community_report_id from public.events where obra_ficha_id is not null and deleted_at is null and cancelled_at is null limit 1`)))!;
  const cams = await t.system((sql) => sql.query<{ user_id: string }>(`select user_id from public.event_assignments where event_id = $1 and duty = 'camera'`, [visit.id]));
  assigned = cams.some((c) => c.user_id === t.ids.camera) ? 'camera' : 'camera2';
  doc = (await t.system((sql) =>
    sql.one<{ id: string }>(
      `insert into public.media_assets (obra_ficha_id, kind, storage_path, label, mime, size_bytes, status, uploaded_by)
       values ($1, 'document', $2, 'Documento 1', 'application/pdf', 1200, 'ready', $3) returning id`,
      [visit.obra_ficha_id, `${visit.obra_ficha_id}/denuncia-demo.pdf`, t.ids.ivt],
    ),
  ))!.id;
}, 120_000);

const kindsAs = (who: DemoUserKey) =>
  t.as(who, (sql) => sql.query<{ kind: string }>(`select kind from public.media_assets where obra_ficha_id = $1 order by kind`, [visit.obra_ficha_id]));

describe('los documentos de una obra', () => {
  it('Redes y quien graba la visita leen las fotos del antes y del avance, nunca los documentos', async () => {
    for (const who of ['social', 'social2', assigned] as const) {
      expect((await kindsAs(who)).map((r) => r.kind), who).toEqual(['before', 'progress']);
      expect(await t.as(who, (sql) => sql.one(`select id from public.media_assets where id = $1`, [doc])), who).toBeNull();
      // Not through the event's tab either (linkedFicha asks for every kind when the page wants the contacts).
      const f = await t.as(who, (sql) => linkedFicha(sql, visit, { contacts: true, media: true }));
      expect(f?.media.map((m) => m.kind).sort(), who).toEqual(['before', 'progress']);
    }
  });

  it('los roles de la obra (Administración, el jefe, el despacho y el IVT) sí los leen', async () => {
    for (const who of ['admin', 'boss', 'dispatch', 'ivt'] as const) {
      expect((await kindsAs(who)).map((r) => r.kind), who).toEqual(['before', 'document', 'progress']);
    }
  });

  it('la pestaña del evento los muestra solo con los contactos (doble factor)', async () => {
    const with2fa = await t.as('boss', (sql) => linkedFicha(sql, visit, { contacts: true, media: true }));
    expect(with2fa?.media.map((m) => m.kind).sort()).toEqual(['before', 'document', 'progress']);
    const without = await t.as('dispatch', (sql) => linkedFicha(sql, visit, { contacts: true, media: true }), 'aal1');
    expect(without?.priv).toBeNull();
    expect(without?.media.map((m) => m.kind).sort()).toEqual(['before', 'progress']);
  });

  it('Redes no cambia ni borra un documento; el jefe sí puede cambiar su nombre', async () => {
    const social = await t.as('social', (sql) => sql.query(`update public.media_assets set label = 'Cambiado (demo)' where id = $1 returning id`, [doc]));
    expect(social).toHaveLength(0);
    const gone = await t.as('social', (sql) => sql.query(`update public.media_assets set deleted_at = now() where id = $1 returning id`, [doc]));
    expect(gone).toHaveLength(0);
    const boss = await t.as('boss', (sql) => sql.query(`update public.media_assets set label = 'Denuncia (demo)' where id = $1 returning id`, [doc]));
    expect(boss).toHaveLength(1);
    expect(await t.system((sql) => sql.one(`select label, deleted_at from public.media_assets where id = $1`, [doc]))).toEqual({ label: 'Denuncia (demo)', deleted_at: null });
  });
});
