import { DateTime } from 'luxon';

// «Programar» (design §3): the publisher picks a day and an hour in the Táchira's time zone (America/Caracas, the app's
// TZ) and the database gets the moment in UTC; a moment comes back as the day and hour of the form. Pure.

export type LocalMoment = { date: string; time: string };

/** «2026-11-07» + «08:30» in `tz` → ISO in UTC, or null when it is not a real moment. */
export function localToUtc(m: LocalMoment, tz: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(m.date) || !/^\d{2}:\d{2}$/.test(m.time)) return null;
  const d = DateTime.fromISO(`${m.date}T${m.time}`, { zone: tz });
  if (!d.isValid) return null;
  // A time that does not exist that day (a jump of the clock) comes back moved: refuse it instead of guessing.
  if (d.toFormat('yyyy-MM-dd') !== m.date || d.toFormat('HH:mm') !== m.time) return null;
  return d.toUTC().toISO();
}

/** A moment → the day and hour of the form in `tz`. */
export function utcToLocal(iso: string | Date, tz: string): LocalMoment {
  const d = (typeof iso === 'string' ? DateTime.fromISO(iso) : DateTime.fromJSDate(iso)).setZone(tz);
  return { date: d.toFormat('yyyy-MM-dd'), time: d.toFormat('HH:mm') };
}

/** «Mañana a las 8:00 a. m.» is the usual choice: the next day at 8 in `tz`. */
export function suggestedMoment(tz: string, now: Date = new Date()): LocalMoment {
  const d = DateTime.fromJSDate(now).setZone(tz).plus({ days: 1 }).set({ hour: 8, minute: 0, second: 0, millisecond: 0 });
  return { date: d.toFormat('yyyy-MM-dd'), time: '08:00' };
}

/** A notice's «Actualizado» / «Vence» as the datetime-local input writes it («2026-11-07T08:30») in `tz`, both ways. */
export function inputToIso(v: string, tz: string): string | null {
  const [date, time] = v.split('T');
  return date && time ? localToUtc({ date, time: time.slice(0, 5) }, tz) : null;
}

export function isoToInput(v: string | null | undefined, tz: string): string {
  if (!v) return '';
  const d = DateTime.fromISO(v).setZone(tz);
  return d.isValid ? d.toFormat("yyyy-MM-dd'T'HH:mm") : '';
}
