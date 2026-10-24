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
});
