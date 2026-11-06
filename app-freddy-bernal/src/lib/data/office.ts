import type { Sql } from '../db/core';
import { officeRoom, ROOMS, type Brief, type OfficeFacts, type Reception, type Room, type ScriptStatus } from '../domain/office';

// «La oficina» (06/11/2026): where each activity is. The facts come from public.office_facts() (counts and yes/no,
// the same for everyone who sees the event); the title from events under the reader's RLS. Never a date, a time or a
// place: the whole team opens it.

export type OfficeItem = { id: string; code: string; title: string; room: Room; facts: OfficeFacts };

type FactsRow = {
  event_id: string; code: string; title: string; tracked: boolean; reception_status: ScriptStatus; script_status: ScriptStatus; clean_done: boolean; brutal_done: boolean;
  shots: number; raw_media: number; pieces: number; pieces_in_review: number; pieces_approved: number; pieces_approved_with_copies: number; published: number;
};

const toItem = (r: FactsRow): OfficeItem => {
  const facts: OfficeFacts = {
    tracked: r.tracked,
    receptionStatus: r.reception_status,
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

export type OfficeReception = { brief: Brief; reception: Reception; status: ScriptStatus };

/** The ficha (as the reader may see it, event_brief under RLS) and the reception's answers and research. */
export async function officeReception(sql: Sql, id: string): Promise<OfficeReception> {
  const b = await sql.one<{ work: string | null; led_by: string | null; in_charge: string | null; achievements: string | null; key_facts: string | null }>(
    `select work_description as work, led_by, in_charge, achievements, key_facts from public.event_brief where event_id = $1`,
    [id],
  );
  const r = await sql.one<{ rx_what: string; rx_beneficiaries: string; rx_responsible: string; rx_research: string; reception_status: ScriptStatus }>(
    `select rx_what, rx_beneficiaries, rx_responsible, rx_research, reception_status from public.event_office where event_id = $1`,
    [id],
  );
  return {
    brief: { work: b?.work ?? '', ledBy: b?.led_by ?? '', inCharge: b?.in_charge ?? '', achievements: b?.achievements ?? '', keyFacts: b?.key_facts ?? '' },
    reception: { what: r?.rx_what ?? '', beneficiaries: r?.rx_beneficiaries ?? '', responsible: r?.rx_responsible ?? '', research: r?.rx_research ?? '' },
    status: r?.reception_status ?? 'none',
  };
}
