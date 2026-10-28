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

/** My own note of that kind on the event (what the form starts from), or ''. */
export function myNote(h: Handoff, kind: NoteKind): string {
  return h.notes.find((n) => n.mine && n.kind === kind)?.body ?? '';
}
