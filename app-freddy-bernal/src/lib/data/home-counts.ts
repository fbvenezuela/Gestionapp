import type { Sql } from '../db/core';
import { tweetStock } from './tweets';
import { obraCounts, obraStageCounts } from './fichas';
import { FORMATS, type Format } from '../domain/redes';

// The live counters of the boss's Inicio (/jefe) and of the Redes hub (/redes). Everything runs AS THE PERSON (RLS):
// the boss sees everything, Redes only what its role reads. Each number is the same one the screen it links to shows,
// so a tap never lands on a different count. Cancelled events never count. No counter here reads a date of the
// agenda except «eventos hoy», which only the boss's Inicio asks for (and only the boss and administración open it).

export type FormatCount = { total: number; inReview: number; approved: number; published: number };

export type RedesCounts = {
  pieces: { active: number; changes: number; inReview: number; approved: number };
  // R4 (D-60, D-71): the open month's pieces by format (the boss's Redes tile, the board). `month` null: no month yet.
  month: { id: string; label: string } | null;
  byFormat: Record<Format, FormatCount>;
  tweets: { daysLeft: number; lowStock: boolean; upcoming: number; drafts: number };
  publish: { ready: number; scheduled: number; failed: number };
  results: { published30: number; withoutNumbers: number };
  library: { events: number };
};

/** `monthId`: the open month (?mes= or the person's choice); missing or gone = the first month. */
export async function redesCounts(sql: Sql, monthId?: string | null): Promise<RedesCounts> {
  // /piezas «En curso» (draft, changes requested, in review) and «Aprobadas»; /publicar «Aprobadas y sin publicar».
  const p = (await sql.one<{ active: number; changes: number; in_review: number; approved: number; ready: number }>(
    `select count(*) filter (where p.status in ('draft', 'changes_requested', 'in_review'))::int as active,
            count(*) filter (where p.status = 'changes_requested')::int as changes,
            count(*) filter (where p.status = 'in_review')::int as in_review,
            count(*) filter (where p.status = 'approved')::int as approved,
            count(*) filter (where p.status = 'approved'
                               and not exists (select 1 from public.publications x where x.piece_id = p.id and x.deleted_at is null))::int as ready
       from public.pieces p where p.deleted_at is null`,
  ))!;
  // /publicar (scheduled, failed) and /resultados over 30 days («Sin números»: the latest result has no views).
  const x = (await sql.one<{ scheduled: number; failed: number; published30: number; without_numbers: number }>(
    `select count(*) filter (where x.status = 'scheduled')::int as scheduled,
            count(*) filter (where x.status = 'failed')::int as failed,
            count(*) filter (where x.status = 'published' and x.published_at > now() - interval '30 days')::int as published30,
            count(*) filter (where x.status = 'published' and x.published_at > now() - interval '30 days' and m.views is null)::int as without_numbers
       from public.publications x
       left join lateral (select pm.views from public.publication_metrics pm where pm.publication_id = x.id order by pm.captured_at desc limit 1) m on true
      where x.deleted_at is null`,
  ))!;
  const stock = await tweetStock(sql);
  const drafts = (await sql.one<{ n: number }>(`select count(*)::int as n from public.tweets where status = 'draft' and deleted_at is null`))!.n;
  // /biblioteca: the events with material ready (a cancelled one keeps its material there, but does not count here).
  const library = (await sql.one<{ n: number }>(
    `select count(*)::int as n from public.events e
      where e.deleted_at is null and e.cancelled_at is null
        and exists (select 1 from public.media_assets m where m.event_id = e.id and m.deleted_at is null and m.status = 'ready')`,
  ))!.n;
  // The month by format: the same pieces the sections show (with no month: the first month), the same counts as the
  // board (approved = «Revisados», published = with a publication done).
  const month = await sql.one<{ id: string; label: string }>(
    `select id, label from public.content_months where deleted_at is null
      order by (id = $1::uuid) desc nulls last, ordinal limit 1`,
    [monthId && /^[0-9a-f-]{36}$/i.test(monthId) ? monthId : null],
  );
  const perFormat = month
    ? await sql.query<{ format: string; total: number; in_review: number; approved: number; published: number }>(
        `with first as (select id from public.content_months where deleted_at is null order by ordinal limit 1)
         select p.format, count(*)::int as total,
                count(*) filter (where p.status = 'in_review')::int as in_review,
                count(*) filter (where p.status = 'approved')::int as approved,
                count(*) filter (where exists (select 1 from public.publications x
                                                where x.piece_id = p.id and x.deleted_at is null and x.status = 'published'))::int as published
           from public.pieces p
          where p.deleted_at is null and coalesce(p.content_month_id, (select id from first)) = $1
          group by p.format`,
        [month.id],
      )
    : [];
  const byFormat = Object.fromEntries(
    FORMATS.map((f) => {
      const r = perFormat.find((x) => x.format === f);
      return [f, { total: r?.total ?? 0, inReview: r?.in_review ?? 0, approved: r?.approved ?? 0, published: r?.published ?? 0 }];
    }),
  ) as Record<Format, FormatCount>;
  return {
    pieces: { active: p.active, changes: p.changes, inReview: p.in_review, approved: p.approved },
    month,
    byFormat,
    tweets: { daysLeft: stock.daysLeft, lowStock: stock.lowStock, upcoming: stock.count, drafts },
    publish: { ready: p.ready, scheduled: x.scheduled, failed: x.failed },
    results: { published30: x.published30, withoutNumbers: x.without_numbers },
    library: { events: library },
  };
}

export type BossCounts = {
  politics: { today: number; pending: number; toSchedule: number };
  obras: { stages: Record<string, number>; municipalities: { municipality: string; total: number; to_schedule: number }[] };
  digital: { published7: number; upcoming: number; views7: number };
};

// The four tiles of the boss's Inicio, except Redes (redesCounts). dayStart/dayEnd: today in the Táchira, as instants.
export async function bossCounts(sql: Sql, dayStart: string, dayEnd: string): Promise<BossCounts> {
  // Política: the same numbers as /agenda (day), /jefe/politica («Esperan tu decisión») and /agenda/por-fecha.
  const pol = (await sql.one<{ today: number; pending: number; to_schedule: number }>(
    `select (select count(*)::int from public.event_calendar c
              where c.starts_at >= $1 and c.starts_at < $2 and c.boss_decision <> 'rejected' and c.cancelled_at is null) as today,
            (select count(*)::int from public.events e
              where e.boss_decision = 'pending' and e.deleted_at is null and e.cancelled_at is null) as pending,
            (select count(*)::int from public.agenda_to_schedule) as to_schedule`,
    [dayStart, dayEnd],
  ))!;
  // Obras: the IVT's fichas by stage (the chips of /obras) and by municipality (the ones with most waiting first).
  const stages = await obraStageCounts(sql);
  const municipalities = (await obraCounts(sql)).sort(
    (a, b) => b.to_schedule - a.to_schedule || b.total - a.total || a.municipality.localeCompare(b.municipality, 'es'),
  );
  // Digital: /jefe/digital (published this week, what comes) and the week's views (latest result of each one).
  const dig = (await sql.one<{ published7: number; upcoming: number; views7: number }>(
    `select count(*) filter (where x.status = 'published' and x.published_at > now() - interval '7 days')::int as published7,
            count(*) filter (where x.status = 'scheduled' and x.scheduled_at > now())::int as upcoming,
            coalesce(sum(m.views) filter (where x.status = 'published' and x.published_at > now() - interval '7 days'), 0)::int as views7
       from public.publications x
       left join lateral (select pm.views from public.publication_metrics pm where pm.publication_id = x.id order by pm.captured_at desc limit 1) m on true
      where x.deleted_at is null`,
  ))!;
  return {
    politics: { today: pol.today, pending: pol.pending, toSchedule: pol.to_schedule },
    obras: { stages, municipalities },
    digital: dig,
  };
}
