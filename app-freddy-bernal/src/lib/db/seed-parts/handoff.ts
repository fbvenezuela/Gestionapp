import { demoThumbBytes } from './thumbs';
import type { SeedCtx } from './context';

// Grabación's handoff to the editor (cambios del 27/10/2026, §5), so Redes and the boss see it in the demo without
// waiting for someone to record: on the first demo event (the court, recorded by «camera», already done) the
// storyboard it recorded with (a picture: an INVENTED abstract sheet of three panels, no text, people or places,
// src/lib/db/demo-assets/storyboard.jpg) and its note for the editor. No new event (the counts of the tests stay).
// Like every part, the same rows in the same order on every demo server (stable ids, src/lib/db/stable-ids.ts).
export const DEMO_STORYBOARD = 'storyboard.jpg';
export const DEMO_EDITOR_NOTE =
  'Lo mejor del jefe está en el segundo clip, cuando saluda a los clubes. El dron tiene viento al final: usa solo el comienzo. Faltó la toma del corte de cinta de frente (demo).';

export async function seedHandoff(ctx: SeedCtx): Promise<void> {
  const { sql, ids, eventIds } = ctx;
  const eventId = eventIds[0];
  if (!eventId) return;
  const picture = demoThumbBytes(DEMO_STORYBOARD);
  const sb = await sql.one<{ id: string }>(
    `insert into public.media_assets (event_id, kind, storage_path, label, mime, size_bytes, width, height, status, uploaded_by)
     values ($1, 'storyboard', $2, 'Storyboard 1', 'image/jpeg', $3, 320, 240, 'ready', $4) returning id`,
    [eventId, `${eventId}/demo-storyboard-1.jpg`, picture.length, ids.camera],
  );
  // Its small picture, kept the way a phone keeps one at upload (the file itself has no bytes in the demo).
  await sql.query(`insert into public.media_thumbs (media_id, mime, bytes) values ($1, 'image/jpeg', $2) on conflict (media_id) do nothing`, [sb!.id, picture]);
  await sql.query(`insert into public.recording_notes (event_id, kind, body, author_id) values ($1, 'editor_note', $2, $3)`, [eventId, DEMO_EDITOR_NOTE, ids.camera]);
}
