import { DateTime } from 'luxon';
import type { Sql } from '../db/core';
import { daysOfStock } from '../domain/tweets';
import { TZ } from '../time';

export async function tweetStock(sql: Sql) {
  const rows = await sql.query<{ scheduled_at: string }>(
    `select scheduled_at from public.tweets where status in ('scheduled', 'approved') and scheduled_at > now() and deleted_at is null`,
  );
  const setting = await sql.one<{ value: number }>(`select value from public.app_settings where key = 'tweets.low_stock_days'`);
  const threshold = Number(setting?.value ?? 6);
  const daysLeft = daysOfStock(
    rows.map((r) => new Date(r.scheduled_at).toISOString()),
    DateTime.now().setZone(TZ),
    TZ,
  );
  return { daysLeft, threshold, lowStock: daysLeft <= threshold, count: rows.length };
}
