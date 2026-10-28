import type { Sql } from '../db/core';
import { mergeRow, overwrittenPeople, type Overwritten, type Row } from '../domain/agenda-merge';

// Saving one shared agenda row (an event's data, its schedule, its brief, its storyboard) AS THE PERSON (RLS and the
// column guards decide). The row is locked, this person's changes are merged over what is there now
// (domain/agenda-merge.ts: the schedule's start and end as the form shows them) and only those are written: what the
// other person changed in between stays. When both changed the same field, this save wins and the result names whom
// to tell: for each such field, the last person who changed it (lastWriters, from audit_log).
// Table and column names come from the constants below, never from the input.

const TABLES = {
  events: { key: 'id', cols: ['title', 'place_name', 'municipality', 'summary', 'category_id', 'urgency', 'kind'] },
  event_schedule: { key: 'event_id', cols: ['starts_at', 'ends_at', 'exact_address', 'directions', 'site_contacts'] },
  event_brief: { key: 'event_id', cols: ['work_description', 'led_by', 'in_charge', 'achievements', 'key_facts', 'protocol', 'notes'] },
  storyboards: { key: 'event_id', cols: ['speech'] },
} as const;
export type AgendaTable = keyof typeof TABLES;

export type SaveResult = {
  found: boolean;
  rev: number;
  changed: string[]; // what this save changed (the schedule: «Fecha y hora» / «Duración» as the form shows them)
  overlap: string[]; // fields someone else had changed too (this save won)
  overwritten: Overwritten[]; // whom to tell, with their fields
};

// For each key, the last person who changed it (null: the system). Keys are fields of `table`, or block ids for
// 'storyboard_blocks'. The database answers only whoever may save that part (agenda_last_writers()).
export async function lastWriters(sql: Sql, table: AgendaTable | 'storyboard_blocks', eventId: string, keys: string[]): Promise<Record<string, string | null>> {
  if (!keys.length) return {};
  const rows = await sql.query<{ key: string; actor_id: string | null }>(
    `select key, actor_id from public.agenda_last_writers($1, $2, $3::text[])`,
    [table, eventId, keys],
  );
  return Object.fromEntries(rows.map((r) => [r.key, r.actor_id]));
}

export async function saveWithRev(
  sql: Sql,
  o: {
    table: AgendaTable;
    id: string;
    rev?: number | null;
    base?: Row | null;
    mine: Row;
    me: string;
    // Checks on what is about to be written, with the row as it is now (the schedule: a clash, a dated title).
    beforeWrite?: (write: Row, current: Row) => Promise<void>;
  },
): Promise<SaveResult> {
  const t = TABLES[o.table];
  const cols = (t.cols as readonly string[]).filter((c) => c in o.mine);
  const row = await sql.one<Row & { rev: number }>(`select ${t.cols.join(', ')}, rev from public.${o.table} where ${t.key} = $1 for update`, [o.id]);
  if (!row) return { found: false, rev: 0, changed: [], overlap: [], overwritten: [] };
  const mine = Object.fromEntries(cols.map((c) => [c, o.mine[c]]));
  const merged = mergeRow(o.table, row, o.base ?? null, mine);
  const keys = Object.keys(merged.write);
  if (!keys.length) return { found: true, rev: row.rev, changed: [], overlap: [], overwritten: [] };
  await o.beforeWrite?.(merged.write, row);
  // Read before this save's own audit row exists. A field this same person changed last (another tab) is no overlap.
  const writers = o.rev !== null && o.rev !== undefined && o.rev !== row.rev ? await lastWriters(sql, o.table, o.id, merged.overlap) : {};
  const overlap = merged.overlap.filter((f) => writers[f] !== o.me);
  const saved = await sql.one<{ rev: number }>(
    `update public.${o.table} set ${keys.map((k, n) => `${k} = $${n + 2}`).join(', ')} where ${t.key} = $1 returning rev`,
    [o.id, ...keys.map((k) => merged.write[k])],
  );
  if (!saved) return { found: false, rev: row.rev, changed: [], overlap: [], overwritten: [] };
  return {
    found: true,
    rev: saved.rev,
    changed: merged.changed.length ? merged.changed : keys,
    overlap,
    overwritten: overwrittenPeople({ rowRev: row.rev, sentRev: o.rev, overlap, writers, me: o.me }),
  };
}
