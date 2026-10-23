'use server';

import { z } from 'zod';
import { act, UserError } from './run';

const n = z.coerce.number().int().min(0).nullable().optional().transform((v) => (v === undefined ? null : v));

export async function addMetrics(raw: unknown) {
  return act(
    z.object({ publicationId: z.string().uuid(), views: n, reach: n, likes: n, comments: n, shares: n, saves: n }),
    raw,
    async (sql, i) => {
      if ([i.views, i.reach, i.likes, i.comments, i.shares, i.saves].every((v) => v === null)) throw new UserError('Escribe al menos un número.');
      await sql.query(
        `insert into public.publication_metrics (publication_id, views, reach, likes, comments, shares, saves, source) values ($1, $2, $3, $4, $5, $6, $7, 'manual')`,
        [i.publicationId, i.views, i.reach, i.likes, i.comments, i.shares, i.saves],
      );
    },
    { revalidate: ['/resultados', '/publicar'] },
  );
}

// CSV with columns: link (or url), vistas/views, alcance/reach, me_gusta/likes,
// comentarios/comments, compartidos/shares, guardados/saves. Rows are matched to
// publications by their link.
export async function importMetricsCsv(raw: unknown) {
  return act(z.object({ csv: z.string().max(2_000_000) }), raw, async (sql, i) => {
    const lines = i.csv.replace(/\r/g, '').split('\n').filter((l) => l.trim());
    if (lines.length < 2) throw new UserError('El archivo no tiene filas.');
    const sep = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ';' : ',';
    const split = (l: string) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));
    const head = split(lines[0]).map((h) => h.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_'));
    const col = (...names: string[]) => head.findIndex((h) => names.includes(h));
    const c = {
      url: col('link', 'url', 'enlace'),
      views: col('vistas', 'views', 'visualizaciones', 'reproducciones'),
      reach: col('alcance', 'reach'),
      likes: col('me_gusta', 'likes', 'reacciones'),
      comments: col('comentarios', 'comments'),
      shares: col('compartidos', 'shares', 'compartir'),
      saves: col('guardados', 'saves'),
    };
    if (c.url < 0) throw new UserError('Falta la columna «link».');
    let matched = 0;
    const unmatched: string[] = [];
    for (const l of lines.slice(1)) {
      const cells = split(l);
      const url = cells[c.url];
      if (!url) continue;
      const pub = await sql.one<{ id: string }>(`select id from public.publications where url = $1 and deleted_at is null`, [url]);
      if (!pub) {
        unmatched.push(url);
        continue;
      }
      const num = (k: keyof typeof c) => (c[k] >= 0 && cells[c[k]] ? Number(cells[c[k]].replace(/\./g, '').replace(',', '.')) || 0 : null);
      await sql.query(
        `insert into public.publication_metrics (publication_id, views, reach, likes, comments, shares, saves, source) values ($1, $2, $3, $4, $5, $6, $7, 'csv')`,
        [pub.id, num('views'), num('reach'), num('likes'), num('comments'), num('shares'), num('saves')],
      );
      matched++;
    }
    return { matched, unmatched: unmatched.slice(0, 10), unmatchedCount: unmatched.length };
  }, { revalidate: ['/resultados'] });
}
