// A community report's papers and notes (20261028002300_report_files_notes.sql), straight against the database as
// each demo person (RLS on), as an API client would:
//   1. its documents (a denuncia, an acta: names and phones of the community) only for política, despacho and the boss;
//      Administración keeps its photos (before and after); Redes, Grabación and the IVT read none of its files;
//   2. only política, despacho and the boss upload to a report (Administración no longer does, D-41);
//   3. a phone never goes into its history: a note by hand, the reason of a change of state, the reason of «No va a la
//      agenda». An amount with dots still passes.
// All data here is invented.
import { describe, expect, it, beforeAll } from 'vitest';
import { makeTestDb, type TestDb } from './setup';
import type { DemoUserKey } from '@/lib/db/seed-demo';
import { friendlyDbError } from '@/lib/db/core';
import { fichaMedia } from '@/lib/data/fichas';
import { mediaDownloadRow } from '@/lib/data/media';
import { REPORT_KINDS } from '@/lib/domain/media-mime';

let t: TestDb;
let n = 0;
let report: string;
let files: Record<(typeof REPORT_KINDS)[number], string>;

const errorOf = async (p: Promise<unknown>): Promise<{ code?: string; message: string }> => {
  try {
    await p;
  } catch (e) {
    return e as { code?: string; message: string };
  }
  throw new Error('tenía que fallar');
};
const newReport = () =>
  t.as('politics', async (sql) =>
    (await sql.one<{ id: string }>(`insert into public.community_reports (title, municipality, type, wants_agenda) values ($1, 'Torbes', 'repair', true) returning id`, [
      `Reporte de los archivos ${++n} (demo)`,
    ]))!.id,
  );
// The insert rule alone (no RETURNING: whether the new row is readable afterwards does not count).
const insertOnly = (who: DemoUserKey, kind: string, reportId: string) =>
  t.as(who, (sql) =>
    sql.query(
      `insert into public.media_assets (community_report_id, kind, mime, storage_path, label, status, uploaded_by)
       values ($1, $2, $3, $4, $5, 'ready', auth.uid())`,
      [reportId, kind, kind === 'document' ? 'application/pdf' : 'image/jpeg', `reporte/${++n}-${crypto.randomUUID()}.bin`, `${kind} ${n} (demo)`],
    ),
  );
const kindsAs = async (who: DemoUserKey, reportId = report) =>
  (await t.as(who, (sql) => sql.query<{ kind: string }>(`select kind from public.media_assets where community_report_id = $1 order by kind`, [reportId]))).map((r) => r.kind);

beforeAll(async () => {
  t = await makeTestDb();
  report = await newReport();
  // One file of each kind, uploaded by política (a denuncia as the document).
  files = {} as typeof files;
  for (const kind of REPORT_KINDS) {
    files[kind] = (await t.as('politics', (sql) =>
      sql.one<{ id: string }>(
        `insert into public.media_assets (community_report_id, kind, mime, storage_path, label, status, uploaded_by)
         values ($1, $2, $3, $4, $5, 'ready', auth.uid()) returning id`,
        [report, kind, kind === 'document' ? 'application/pdf' : 'image/jpeg', `${report}/${kind}-demo.bin`, kind === 'document' ? 'Denuncia (demo)' : `Foto ${kind} (demo)`],
      )))!.id;
  }
}, 120_000);

describe('los archivos de un reporte comunitario', () => {
  it('Administración ve las fotos del antes y del después, nunca los documentos (tampoco por la descarga ni por id)', async () => {
    expect(await kindsAs('admin')).toEqual(['after', 'before']);
    expect(await t.as('admin', (sql) => sql.one('select id from public.media_assets where id = $1', [files.document]))).toBeNull();
    // What the report page and /api/media/<id> read, as Administración.
    expect((await t.as('admin', (sql) => fichaMedia(sql, 'report', report))).map((m) => m.kind).sort()).toEqual(['after', 'before']);
    expect(await t.as('admin', (sql) => mediaDownloadRow(sql, files.document))).toBeNull();
    expect(await t.as('admin', (sql) => mediaDownloadRow(sql, files.before))).toMatchObject({ label: 'Foto before (demo)' });
    // Nor can it rename or soft-delete a paper it does not see.
    expect(await t.as('admin', (sql) => sql.query(`update public.media_assets set label = 'Cambiado (demo)' where id = $1 returning id`, [files.document]))).toEqual([]);
    expect(await t.as('admin', (sql) => sql.query(`update public.media_assets set deleted_at = now() where id = $1 returning id`, [files.document]))).toEqual([]);
    expect(await t.system((sql) => sql.one('select label, deleted_at from public.media_assets where id = $1', [files.document]))).toEqual({ label: 'Denuncia (demo)', deleted_at: null });
  });

  it('política, el despacho y el jefe ven las fotos y los documentos, con un factor o con dos', async () => {
    for (const who of ['politics', 'dispatch', 'boss'] as const) {
      for (const aal of ['aal1', 'aal2'] as const) {
        expect(await t.as(who, (sql) => sql.query<{ kind: string }>(`select kind from public.media_assets where community_report_id = $1 order by kind`, [report]), aal).then((r) => r.map((x) => x.kind)), `${who} ${aal}`).toEqual(['after', 'before', 'document']);
      }
      expect(await t.as(who, (sql) => mediaDownloadRow(sql, files.document)), who).toMatchObject({ label: 'Denuncia (demo)' });
    }
  });

  it('Redes, Grabación y el IVT no ven ningún archivo de un reporte', async () => {
    for (const who of ['social', 'social2', 'camera', 'camera2', 'ivt'] as const) {
      expect(await kindsAs(who), who).toEqual([]);
      expect(await t.as(who, (sql) => sql.query('select id from public.media_assets where community_report_id is not null')), who).toEqual([]);
      for (const id of Object.values(files)) expect(await t.as(who, (sql) => mediaDownloadRow(sql, id)), who).toBeNull();
    }
  });

  it('solo política, el despacho y el jefe suben a un reporte; Administración ya no', async () => {
    const fresh = await newReport();
    for (const kind of REPORT_KINDS) {
      const e = await errorOf(insertOnly('admin', kind, fresh));
      expect(e.message, kind).toMatch(/row-level security/);
      expect(friendlyDbError(e)).toBe('No tienes permiso para hacer esto.');
      for (const who of ['social', 'camera', 'ivt'] as const) await expect(insertOnly(who, kind, fresh), `${who} ${kind}`).rejects.toThrow(/row-level security/);
    }
    for (const who of ['politics', 'dispatch', 'boss'] as const) {
      for (const kind of REPORT_KINDS) await insertOnly(who, kind, fresh);
    }
    expect(await kindsAs('boss', fresh)).toEqual(['after', 'after', 'after', 'before', 'before', 'before', 'document', 'document', 'document']);
    expect(await kindsAs('admin', fresh)).toEqual(['after', 'after', 'after', 'before', 'before', 'before']);
    // Administración still uploads where it did: the content team's files (no parent).
    await t.as('admin', (sql) =>
      sql.query(`insert into public.media_assets (kind, mime, storage_path, uploaded_by) values ('evidence', 'image/jpeg', $1, auth.uid())`, [`evidencia/${crypto.randomUUID()}.jpg`]));
  });
});

describe('la historia de un reporte no lleva teléfonos', () => {
  const PHONE = 'Llamar a la vocera (demo) al 0414-5550123 para la cuadrilla.';

  it('una nota escrita a mano: con teléfono no entra, con una cifra con puntos sí', async () => {
    for (const who of ['politics', 'dispatch', 'boss', 'admin'] as const) {
      const e = await errorOf(t.as(who, (sql) => sql.query(`insert into public.ficha_updates (community_report_id, kind, note) values ($1, 'note', $2)`, [report, PHONE]), 'aal1'));
      expect(e.code, who).toBe('23514');
      expect(e.message, who).toContain('ficha_updates_report_note_no_phone');
      expect(friendlyDbError(e)).toMatch(/teléfono/);
    }
    await t.as('politics', (sql) => sql.query(`insert into public.ficha_updates (community_report_id, kind, note) values ($1, 'note', 'Se entregaron 1.500.000 litros de agua (demo).')`, [report]));
    expect(await t.system((sql) => sql.query(`select 1 from public.ficha_updates where community_report_id = $1 and note ~ '0414'`, [report]))).toEqual([]);
  });

  it('el motivo de un cambio de estado y el de «No va a la agenda» tampoco (los escribe la base desde app.history_note)', async () => {
    const status = await errorOf(t.as('politics', async (sql) => {
      await sql.query(`select set_config('app.history_note', $1, true)`, [PHONE]);
      await sql.query(`update public.community_reports set status = 'in_progress' where id = $1`, [report]);
    }));
    expect(status.message).toContain('ficha_updates_report_note_no_phone');
    const dismiss = await errorOf(t.as('dispatch', async (sql) => {
      await sql.query(`select set_config('app.history_note', $1, true)`, [`No va a la agenda: ${PHONE}`]);
      await sql.query(`update public.community_reports set wants_agenda = false where id = $1`, [report]);
    }));
    expect(dismiss.message).toContain('ficha_updates_report_note_no_phone');
    // Nothing changed; without the phone it goes through, reason and all.
    expect(await t.system((sql) => sql.one('select status, wants_agenda from public.community_reports where id = $1', [report]))).toEqual({ status: 'planned', wants_agenda: true });
    await t.as('politics', async (sql) => {
      await sql.query(`select set_config('app.history_note', 'Ya empezó la cuadrilla (demo).', true)`);
      await sql.query(`update public.community_reports set status = 'in_progress' where id = $1`, [report]);
    });
    expect(await t.system((sql) => sql.one(`select note from public.ficha_updates where community_report_id = $1 and kind = 'status' order by created_at desc limit 1`, [report]))).toEqual({
      note: 'Ya empezó la cuadrilla (demo).',
    });
  });
});
