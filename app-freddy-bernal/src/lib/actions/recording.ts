'use server';

import { z } from 'zod';
import { act, UserError } from './run';
import { notify, usersWithRole } from '../notify';
import { NOTE_KINDS, NOTE_MAX, recordingNotice } from '../domain/recording';
import { noticeRecipients } from '../domain/agenda-notices';

// Grabación's handoff (cambios del 27/10/2026, §5): the note for the editor and the storyboard it typed, one per
// person, event and kind. The database decides who writes (rn_insert / rn_update: the camera person assigned to the
// event, or the boss, each their own) and keeps every save in the change log; only admin removes one.

const schema = z.object({
  eventId: z.string().uuid(),
  kind: z.enum(NOTE_KINDS),
  body: z.string().trim().max(NOTE_MAX, `La nota llega hasta ${NOTE_MAX} letras.`),
});

/**
 * Saves (or saves again) my note of that kind on the event. A note for the editor with text tells Redes, with the
 * event's title only (never the note, the date or the place); once per event and hour, however many saves.
 */
export async function saveRecordingNote(raw: unknown) {
  const res = await act(schema, raw, async (sql, i, s) => {
    const row = await sql.one<{ id: string }>(
      `insert into public.recording_notes (event_id, kind, body) values ($1, $2, $3)
       on conflict (event_id, author_id, kind) where deleted_at is null do update set body = excluded.body
       returning id`,
      [i.eventId, i.kind, i.body],
    );
    if (!row) throw new UserError('No puedes dejar notas en este evento.');
    const ev = await sql.one<{ title: string }>(`select title from public.events where id = $1`, [i.eventId]);
    return { id: row.id, eventId: i.eventId, title: ev?.title ?? '', kind: i.kind, body: i.body, by: s.userId };
  }, { revalidate: ['/eventos', '/hoy'] });
  if (!res.ok || !res.data) return res;
  const { id, eventId, title, kind, body, by } = res.data;
  if (kind === 'editor_note' && body) {
    const n = recordingNotice({ id: eventId, title }, 'note', new Date().toISOString().slice(0, 13));
    try {
      await notify({ ...n, userIds: noticeRecipients(await usersWithRole('social'), by) });
    } catch (e) {
      // Saved is saved: a notice that failed never undoes the note.
      console.error('[recording] notice:', (e as Error).message);
    }
  }
  return { ok: true as const, data: { id }, message: kind === 'editor_note' ? 'Nota guardada. Redes ya la ve.' : 'Storyboard guardado. Redes ya lo ve.' };
}
