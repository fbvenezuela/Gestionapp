// The internal notes beside the site's accounts and channels («quién la verificó y cuándo»): the settings screen shows
// each note next to its address, but the note is kept apart, in a setting that is not public. The public rows of
// web_settings are readable by anyone (anon, also straight from the database's API), so a note never goes inside them.
// Pure.

export const NOTES_KEY = 'site.internal_notes';
export const NOTED_KEYS = ['site.social_accounts', 'site.whatsapp_channel', 'site.institutional_portal', 'site.youtube_channel'] as const;
export type NotedKey = (typeof NOTED_KEYS)[number];
/** One note per channel; for the accounts, one per account in the order of the list. */
export type Notes = string | string[];

export const isNoted = (key: string): key is NotedKey => (NOTED_KEYS as readonly string[]).includes(key);

const clean = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 300) : '');
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function withoutNote(v: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...v };
  delete rest.note;
  return rest;
}

/** The value without its notes (what the public reads) and the notes apart. */
export function splitNotes(key: NotedKey, value: unknown): { value: unknown; notes: Notes; empty: boolean } {
  if (key === 'site.social_accounts') {
    const list = Array.isArray(value) ? value : [];
    const notes = list.map((a) => (isObj(a) ? clean(a.note) : ''));
    return { value: list.map((a) => (isObj(a) ? withoutNote(a) : a)), notes, empty: notes.every((n) => !n) };
  }
  if (!isObj(value)) return { value, notes: '', empty: true };
  const note = clean(value.note);
  return { value: withoutNote(value), notes: note, empty: !note };
}

/** The value with its notes back, for the settings screen. A note still inside a value (the client's starting values)
 * shows until the next save moves it apart. */
export function joinNotes(key: NotedKey, value: unknown, notes: unknown): unknown {
  if (key === 'site.social_accounts') {
    if (!Array.isArray(value)) return value;
    const list = Array.isArray(notes) ? notes : [];
    return value.map((a, i) => (isObj(a) && clean(list[i]) ? { ...a, note: clean(list[i]) } : a));
  }
  return isObj(value) && clean(notes) ? { ...value, note: clean(notes) } : value;
}
