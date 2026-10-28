// Grabación's handoff to the editor (cambios del 27/10/2026, §5): pure rules and texts, shared by the action, the
// page and the tests. The table is public.recording_notes (20261027001900_media_handoff.sql): one live note per
// person, event and kind, no date, time or address columns.

import { looksLikeDateTime } from '@/lib/push/text';
import { phonesIn } from './phones';
import { noticeEventTitle } from './agenda-notices';

export const NOTE_KINDS = ['editor_note', 'storyboard_text'] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

// The database's limit (recording_notes.body, char_length <= 5000).
export const NOTE_MAX = 5000;

export const NOTE_LABEL: Record<NoteKind, string> = {
  editor_note: 'Nota para el editor',
  storyboard_text: 'Storyboard escrito',
};

// Under the box, always: Redes reads it and never sees the agenda.
export const NOTE_HINT = 'No escribas hora, fecha ni dirección: Redes no las ve. Los tiempos del video (2:15) sí.';

/**
 * Why a note is not saved: a phone number (phonesIn, the app's one detector; the database checks the same rule,
 * recording_notes_no_phone). Redes reads the note and never a third party's phone. A timecode is never a phone.
 */
export function notePhoneProblem(body: string): string | null {
  const phones = phonesIn(body);
  return phones.length ? `No se guarda con un teléfono (${phones.join(', ')}): Redes lee esta nota. Quítalo; los tiempos del video (2:15) sí van.` : null;
}

/**
 * Under the box: a phone blocks the save (notePhoneProblem); a date or a time of day is only a soft warning, since a
 * timecode («en el 2:15») looks like a time too, and only the person knows which one it is.
 */
export function noteWarning(body: string): string | null {
  if (!body.trim()) return null;
  return notePhoneProblem(body)
    ?? (looksLikeDateTime(body) ? 'Parece que escribiste una hora o una fecha. Si es un tiempo del video, déjalo; si no, quítalo: Redes no ve la agenda.' : null);
}

export type RecordingNotice = { kind: 'recording_note'; title: string; body: string; link: string; key: string };

/**
 * The notice to Redes: that Grabación left its note (or its storyboard) on an event. Rule 4: the event's TITLE only
 * (scrubbed of anything that looks like a date or a time), never the note's text, the date, the place or the
 * address. One per event, kind and hour (`hour`, e.g. «2026-10-28T14»), however many times it is saved.
 */
export function recordingNotice(ev: { id: string; title: string }, what: 'note' | 'storyboard', hour: string): RecordingNotice {
  const t = noticeEventTitle(ev.title);
  return {
    kind: 'recording_note',
    title: what === 'note' ? 'Grabación dejó una nota para el editor' : 'Grabación subió el storyboard con el que grabó',
    body: t,
    link: `/eventos/${ev.id}?tab=material`,
    key: `recording_note:${what}:${ev.id}:${hour}`,
  };
}

/** The first name only, for «Kevin: …» next to a note (the team, never a third party). */
export function firstName(name: string | null | undefined): string {
  const n = (name ?? '').trim();
  if (!n) return 'Grabación';
  return n.includes('@') ? n.split('@')[0] : n.split(/\s+/)[0];
}
