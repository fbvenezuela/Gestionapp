import type { Sql } from '../db/core';
import { officeRoom, ROOMS, type OfficeFacts, type Room, type ScriptStatus } from '../domain/office';

// «La oficina» (06/11/2026): where each activity is. The facts come from public.office_facts() (counts and yes/no,
// the same for everyone who sees the event); the title from events under the reader's RLS. Never a date, a time or a
// place: the whole team opens it.

export type OfficeItem = { id: string; code: string; title: string; room: Room; facts: OfficeFacts };

type FactsRow = {
  event_id: string; code: string; title: string; tracked: boolean; script_status: ScriptStatus; clean_done: boolean; brutal_done: boolean;
  shots: number; raw_media: number; pieces: number; pieces_in_review: number; pieces_approved: number; pieces_approved_with_copies: number; published: number;
};

const toItem = (r: FactsRow): OfficeItem => {
  const facts: OfficeFacts = {
    tracked: r.tracked,
    scriptStatus: r.script_status,
    cleanDone: r.clean_done,
    brutalDone: r.brutal_done,
    shots: r.shots,
    rawMedia: r.raw_media,
    pieces: r.pieces,
    piecesInReview: r.pieces_in_review,
    piecesApproved: r.pieces_approved,
    piecesApprovedWithCopies: r.pieces_approved_with_copies,
    published: r.published,
  };
  return { id: r.event_id, code: r.code, title: r.title, room: officeRoom(facts), facts };
};

// office_facts() already leaves cancelled events out; said again here, where the list is made.
const FACTS_SQL = `select f.*, e.code, e.title from public.office_facts() f join public.events e on e.id = f.event_id and e.cancelled_at is null`;

export async function officeItems(sql: Sql): Promise<OfficeItem[]> {
  return (await sql.query<FactsRow>(`${FACTS_SQL} order by e.code desc`)).map(toItem);
}

export async function officeItem(sql: Sql, id: string): Promise<OfficeItem | null> {
  const r = await sql.one<FactsRow>(`${FACTS_SQL} where f.event_id = $1`, [id]);
  return r ? toItem(r) : null;
}

export function byRoom(items: OfficeItem[]): Record<Room, OfficeItem[]> {
  const out = Object.fromEntries(ROOMS.map((r) => [r, [] as OfficeItem[]])) as Record<Room, OfficeItem[]>;
  for (const it of items) out[it.room].push(it);
  return out;
}

export type OfficeScript = { script: string; status: ScriptStatus };

export async function officeScript(sql: Sql, id: string): Promise<OfficeScript> {
  const r = await sql.one<{ script: string; script_status: ScriptStatus }>(`select script, script_status from public.event_office where event_id = $1`, [id]);
  return { script: r?.script ?? '', status: r?.script_status ?? 'none' };
}
