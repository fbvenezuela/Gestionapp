import type { Sql } from '../db/core';
import { firstName, type NoteKind } from '../domain/recording';

// Grabación's handoff on an event (§5), as the CURRENT USER may read it. RLS decides: rn_select gives the notes to
// admin, the boss and Redes (with the event) and to the camera person assigned to it; despacho, the IVT and política
// get none. Storyboard files follow media_select. No timestamps are read: Redes never gets a time from here.

export type HandoffNote = { id: string; kind: NoteKind; body: string; author_id: string; author: string; mine: boolean };
export type HandoffFile = {
  id: string; kind: string; label: string; size_bytes: number; duration_s: number | null; width: number | null; height: number | null;
  status: string; mime: string; bucket: string;
};
export type Handoff = { notes: HandoffNote[]; storyboards: HandoffFile[] };

export async function getHandoff(sql: Sql, eventId: string): Promise<Handoff> {
  const rows = await sql.query<{ id: string; kind: NoteKind; body: string; author_id: string; name: string | null; mine: boolean }>(
    `select n.id, n.kind, n.body, n.author_id, coalesce(nullif(p.full_name, ''), p.email) as name, n.author_id = auth.uid() as mine
       from public.recording_notes n left join public.profiles p on p.id = n.author_id
      where n.event_id = $1 and n.deleted_at is null
      order by n.kind, n.created_at`,
    [eventId],
  );
  const storyboards = await sql.query<HandoffFile>(
    `select m.id, m.kind, m.label, m.size_bytes, m.duration_s, m.width, m.height, m.status, m.mime, m.bucket
       from public.media_assets m
      where m.event_id = $1 and m.kind = 'storyboard' and m.deleted_at is null
      order by m.created_at desc`,
    [eventId],
  );
  return {
    notes: rows.map((r) => ({ id: r.id, kind: r.kind, body: r.body, author_id: r.author_id, author: firstName(r.name), mine: r.mine })),
    storyboards,
  };
}

// «Notas de Grabación nuevas»: how long a note someone else left (or changed) stays new, on Hoy and on the boss's Inicio.
export const FRESH_NOTE_DAYS = 3;

export type FreshNotes = { total: number; events: { id: string; title: string }[] };

/**
 * The events where someone else left (or changed) a Grabación note in the last FRESH_NOTE_DAYS days, newest code first:
 * Redes' and the boss's «Notas de Grabación nuevas» (Hoy and the Redes tile of /jefe, so both count the same). RLS
 * decides whose notes count (rn_select). The event's id and title only: never when the note was written, nor the
 * agenda's date. `total` counts them all, `events` brings the first `limit`.
 */
export async function freshNoteEvents(sql: Sql, limit = 10): Promise<FreshNotes> {
  const rows = await sql.query<{ id: string; title: string; total: number }>(
    `select e.id, e.title, count(*) over ()::int as total
       from public.events e
      where e.deleted_at is null and e.cancelled_at is null
        and exists (select 1 from public.recording_notes n
                     where n.event_id = e.id and n.deleted_at is null and n.body <> '' and n.author_id <> auth.uid()
                       and n.updated_at > now() - make_interval(days => $2::int))
      order by e.code desc
      limit $1`,
    [limit, FRESH_NOTE_DAYS],
  );
  return { total: rows[0]?.total ?? 0, events: rows.map((r) => ({ id: r.id, title: r.title })) };
}

/** My own note of that kind on the event (what the form starts from), or ''. */
export function myNote(h: Handoff, kind: NoteKind): string {
  return h.notes.find((n) => n.mine && n.kind === kind)?.body ?? '';
}
