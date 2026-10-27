import type { Sql } from '../db/core';
import { DEFAULT_DEADLINES, type Deadlines, type Level } from '../domain/review';

export async function getDeadlines(sql: Sql): Promise<Deadlines> {
  const v = (await sql.one<{ value: Partial<Deadlines> }>(`select value from public.app_settings where key = 'review.deadlines_min'`))?.value;
  return { ...DEFAULT_DEADLINES, ...(v ?? {}) };
}

// The one approval gate, asked to the database (public.can_approve(): the boss with 2FA). The screens follow it, so
// a future delegation changes one SQL function and nothing here.
export async function canApprove(sql: Sql): Promise<boolean> {
  return !!(await sql.one<{ ok: boolean }>(`select public.can_approve() as ok`))?.ok;
}

export type ReviewRow = { id: string; title: string; kind: string; current_version: number; review_level: Level; sent_to_review_at: string | null; revision: number; event_title: string | null };

// Pieces waiting for a decision, red first, oldest first.
export async function piecesInReview(sql: Sql, limit = 100): Promise<ReviewRow[]> {
  return sql.query<ReviewRow>(
    `select p.id, p.title, p.kind, p.current_version, p.review_level, p.sent_to_review_at, p.revision, e.title as event_title
       from public.pieces p left join public.events e on e.id = p.event_id
      where p.status = 'in_review' and p.deleted_at is null
      order by case p.review_level when 'rojo' then 0 when 'amarillo' then 1 else 2 end, p.sent_to_review_at nulls last
      limit $1`,
    [limit],
  );
}
