import type { Sql } from '../db/core';
import { mergePatch, overwrittenUser, type Row } from '../domain/agenda-merge';

// Saving one shared agenda row (an event's data, its schedule, its brief, its storyboard) AS THE PERSON (RLS and the
// column guards decide). The row is locked, this person's changes are merged over what is there now
// (domain/agenda-merge.ts) and only those are written: what the other person changed in between stays. When both
// changed the same field, this save wins and the result names whom to tell (the last person who saved it).
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
  changed: string[]; // fields written
  overlap: string[]; // fields the other person had changed too (this save won)
  overwrittenUserId: string | null;
};

export async function saveWithRev(
  sql: Sql,
  o: { table: AgendaTable; id: string; rev?: number | null; base?: Row | null; mine: Row; me: string },
): Promise<SaveResult> {
  const t = TABLES[o.table];
  const cols = (t.cols as readonly string[]).filter((c) => c in o.mine);
  const row = await sql.one<Row & { rev: number; updated_by: string | null }>(
    `select ${t.cols.join(', ')}, rev, updated_by from public.${o.table} where ${t.key} = $1 for update`,
    [o.id],
  );
  if (!row) return { found: false, rev: 0, changed: [], overlap: [], overwrittenUserId: null };
  const mine = Object.fromEntries(cols.map((c) => [c, o.mine[c]]));
  const { write, overlap } = mergePatch(row, o.base ?? null, mine);
  const keys = Object.keys(write);
  if (!keys.length) return { found: true, rev: row.rev, changed: [], overlap: [], overwrittenUserId: null };
  const saved = await sql.one<{ rev: number }>(
    `update public.${o.table} set ${keys.map((k, n) => `${k} = $${n + 2}`).join(', ')} where ${t.key} = $1 returning rev`,
    [o.id, ...keys.map((k) => write[k])],
  );
  if (!saved) return { found: false, rev: row.rev, changed: [], overlap: [], overwrittenUserId: null };
  return {
    found: true,
    rev: saved.rev,
    changed: keys,
    overlap,
    overwrittenUserId: overwrittenUser({ rowRev: row.rev, sentRev: o.rev, overlap, lastBy: row.updated_by, me: o.me }),
  };
}
