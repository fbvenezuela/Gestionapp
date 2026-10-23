import { DateTime } from 'luxon';

// All dates and times are shown in the app timezone (Táchira), wherever the viewer is.
export const TZ = process.env.APP_TZ ?? process.env.NEXT_PUBLIC_APP_TZ ?? 'America/Caracas';

export function dt(v: string | Date | null | undefined): DateTime | null {
  if (!v) return null;
  const d = typeof v === 'string' ? DateTime.fromISO(v) : DateTime.fromJSDate(v);
  return d.isValid ? d.setZone(TZ).setLocale('es') : null;
}

export function fmtDate(v: string | Date | null | undefined, fmt = "ccc d 'de' LLL") {
  return dt(v)?.toFormat(fmt) ?? '';
}

export function fmtTime(v: string | Date | null | undefined) {
  return dt(v)?.toFormat('h:mm a') ?? '';
}

export function fmtDateTime(v: string | Date | null | undefined) {
  return dt(v)?.toFormat("ccc d 'de' LLL, h:mm a") ?? '';
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
  return dayOnly(v)?.toFormat(fmt) ?? '';
}
