import { DateTime } from 'luxon';

// All dates and times are shown in the app timezone (Táchira), wherever the viewer is.
export const TZ = process.env.APP_TZ ?? process.env.NEXT_PUBLIC_APP_TZ ?? 'America/Caracas';

export function dt(v: string | Date | null | undefined): DateTime | null {
  if (!v) return null;
  const d = typeof v === 'string' ? DateTime.fromISO(v) : DateTime.fromJSDate(v);
  return d.isValid ? d.setZone(TZ).setLocale('es') : null;
}

// ICU writes «a. m.» with a no-break space in Node (the server's HTML) and with a plain space in some browsers: the
// text then differs between the server and the phone, and React throws its hydration error (number 418) on the screen.
// Every formatted date and time goes out with plain spaces, on both sides.
const ODD_SPACES = /[\u00a0\u202f]/g;

/** `d.toFormat(format)` with plain spaces (the same text on the server and in the browser). */
export function fmtAt(d: DateTime | null | undefined, format: string): string {
  return d ? d.toFormat(format).replace(ODD_SPACES, ' ') : '';
}

export function fmtDate(v: string | Date | null | undefined, fmt = "ccc d 'de' LLL") {
  return fmtAt(dt(v), fmt);
}

export function fmtTime(v: string | Date | null | undefined) {
  return fmtAt(dt(v), 'h:mm a');
}

export function fmtDateTime(v: string | Date | null | undefined) {
  return fmtAt(dt(v), "ccc d 'de' LLL, h:mm a");
}

// Timestamps arrive as Date (pg drivers) or ISO strings; compare them as numbers.
export function ms(v: string | Date | null | undefined): number {
  return v ? new Date(v).getTime() : 0;
}

export function today() {
  return DateTime.now().setZone(TZ).setLocale('es').startOf('day');
}

// Postgres `date` columns come back as Date at UTC midnight (pglite) or 'YYYY-MM-DD'.
export function dayOnly(v: string | Date | null | undefined): DateTime | null {
  if (!v) return null;
  const iso = typeof v === 'string' ? v.slice(0, 10) : v.toISOString().slice(0, 10);
  return DateTime.fromISO(iso, { zone: TZ }).setLocale('es');
}

export function fmtDay(v: string | Date | null | undefined, fmt = "cccc d 'de' LLLL") {
  return fmtAt(dayOnly(v), fmt);
}
