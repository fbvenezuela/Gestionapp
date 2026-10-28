import type { Sql } from '../db/core';

// A file to download, as THIS person may read it (RLS on media_assets decides), with the code its name starts with:
// E-0042 (event), O-0001 (obra ficha), R-0001 (report). An obra's code: its row for the obra roles,
// visit_obra_ficha() for Redes and Grabación (a live visit's before and progress photos). Never a date.
export type DownloadRow = { bucket: string; storage_path: string; label: string; mime: string; code: string | null };
export async function mediaDownloadRow(sql: Sql, id: string): Promise<DownloadRow | null> {
  return sql.one<DownloadRow>(
    `select m.bucket, m.storage_path, m.label, m.mime, coalesce(e.code, f.code, vf.code, r.code) as code
       from public.media_assets m
       left join public.events e on e.id = m.event_id
       left join public.obra_fichas f on f.id = m.obra_ficha_id
       left join lateral public.visit_obra_ficha(case when f.id is null then m.obra_ficha_id end) vf on true
       left join public.community_reports r on r.id = m.community_report_id
      where m.id = $1 and m.deleted_at is null and m.status = 'ready'`,
    [id],
  );
}
