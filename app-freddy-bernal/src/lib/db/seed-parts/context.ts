import type { DateTime } from 'luxon';
import type { Sql } from '../core';
import type { DemoUserKey } from '../seed-demo';

// What every part of the demo seed shares. Parts run in a fixed order (src/lib/db/seed-demo.ts) and each new
// part is appended at the end, so the stable demo ids (stable-ids.ts) of the earlier rows keep their values.
export type SeedCtx = {
  sql: Sql;
  tz: string;
  ids: Record<DemoUserKey, string>;
  today: DateTime;
  // A moment `dayOffset` days from today at that local hour, as ISO UTC.
  at: (dayOffset: number, hour: number, minute?: number) => string | null;
  // The id of a content subcategory by name (null if the client config has no such name).
  cat: (name: string) => Promise<string | null>;
  // Filled by core.ts, in this order: the six demo events and the main pieces.
  eventIds: string[];
  pieceIds: Record<string, string>;
};

// Runs `fn` as that person (their claims, 2FA verified), the way the platform's own functions see a person
// (review_piece, guard_tweet). Back to the system user afterwards.
export async function asPerson<T>(sql: Sql, userId: string, fn: () => Promise<T>): Promise<T> {
  await sql.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId, aal: 'aal2', role: 'authenticated' })]);
  try {
    return await fn();
  } finally {
    await sql.query(`select set_config('request.jwt.claims', '', true)`);
  }
}
