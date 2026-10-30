// The demo data shows states the real flow can reach: a piece is sent to review only with its
// three copies (sendToReview refuses it otherwise), so the demo's pieces in review have them too; a story, with its
// file and its on-screen text (R4, D-61).
import { describe, it, expect, beforeAll } from 'vitest';
import { makeTestDb, type TestDb } from '../rls/setup';

let t: TestDb;

beforeAll(async () => {
  t = await makeTestDb();
});

describe('datos de la demostración', () => {
  it('cada pieza en revisión o aprobada tiene sus tres copies (largo, medio y corto) con texto', async () => {
    // A story has no copy (D-61): what goes out is its on-screen text and its sticker (next test).
    const rows = await t.system((sql) =>
      sql.query<{ title: string; groups: string[] }>(
        `select p.title, coalesce(array_agg(c.length_group order by c.length_group) filter (where c.id is not null and c.body <> ''), '{}') as groups
           from public.pieces p left join public.copies c on c.piece_id = p.id
          where p.deleted_at is null and p.status in ('in_review', 'approved') and p.format <> 'story'
          group by p.id, p.title order by p.title`,
      ),
    );
    expect(rows.map((r) => r.title)).toEqual(expect.arrayContaining(['Avance del puente La Quebrada', 'La vecina que volvió a tener agua', 'Cómo pedir un operativo', 'Reporte semanal (demo)']));
    for (const r of rows) expect([...r.groups].sort(), r.title).toEqual(['long', 'medium', 'short']);
  });

  it('cada historia en revisión o aprobada tiene su archivo y su texto en pantalla', async () => {
    const rows = await t.system((sql) =>
      sql.query<{ title: string; current_version: number; on_screen: string | null }>(
        `select p.title, p.current_version, d.on_screen from public.pieces p left join public.piece_details d on d.piece_id = p.id
          where p.deleted_at is null and p.status in ('in_review', 'approved') and p.format = 'story' order by p.title`,
      ),
    );
    expect(rows.length).toBeGreaterThanOrEqual(6);
    for (const r of rows) {
      expect(r.current_version, r.title).toBeGreaterThan(0);
      expect(r.on_screen ?? '', r.title).not.toBe('');
    }
  });

  it('una imagen no tiene duración, fps ni códecs (la portada no muestra «1:35»)', async () => {
    const images = await t.system((sql) =>
      sql.query<{ label: string; duration_s: number | null; fps: number | null; video_codec: string | null; audio_codec: string | null; storage_path: string }>(
        `select label, duration_s, fps, video_codec, audio_codec, storage_path from public.media_assets where mime like 'image/%'`,
      ),
    );
    expect(images.map((m) => m.label)).toContain('Portada v1');
    for (const m of images) {
      expect([m.duration_s, m.fps, m.video_codec, m.audio_codec], m.label).toEqual([null, null, null, null]);
      expect(m.storage_path, m.label).toMatch(/\.jpg$/);
    }
  });
});
