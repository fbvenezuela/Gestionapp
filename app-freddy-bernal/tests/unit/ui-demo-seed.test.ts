// The demo data shows states the real flow can reach: a piece is sent to review only with its
// three copies (sendToReview refuses it otherwise), so the demo's pieces in review have them too.
import { describe, it, expect, beforeAll } from 'vitest';
import { makeTestDb, type TestDb } from '../rls/setup';

let t: TestDb;

beforeAll(async () => {
  t = await makeTestDb();
});

describe('datos de la demostración', () => {
  it('cada pieza en revisión o aprobada tiene sus tres copies (largo, medio y corto) con texto', async () => {
    const rows = await t.system((sql) =>
      sql.query<{ title: string; groups: string[] }>(
        `select p.title, coalesce(array_agg(c.length_group order by c.length_group) filter (where c.id is not null and c.body <> ''), '{}') as groups
           from public.pieces p left join public.copies c on c.piece_id = p.id
          where p.deleted_at is null and p.status in ('in_review', 'approved')
          group by p.id, p.title order by p.title`,
      ),
    );
    expect(rows.map((r) => r.title)).toContain('Avance del puente La Quebrada');
    for (const r of rows) expect([...r.groups].sort(), r.title).toEqual(['long', 'medium', 'short']);
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
