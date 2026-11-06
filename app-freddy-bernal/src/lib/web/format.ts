import { DateTime } from 'luxon';
import { TZ } from '../time';

// How the public website writes dates, numbers and sizes: always in the Táchira's time zone (America/Caracas), in
// Spanish of Venezuela, with plain spaces (the same text on the server and in the browser). Pure.

const ODD_SPACES = /[  ]/g;
const out = (s: string) => s.replace(ODD_SPACES, ' ');

function parse(v: string): DateTime | null {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? DateTime.fromISO(v, { zone: TZ }) : DateTime.fromISO(v).setZone(TZ);
  return d.isValid ? d.setLocale('es') : null;
}

/** A day («2026-11-04» or a moment) as «4 de noviembre de 2026» (with the weekday: «miércoles 4 de noviembre de 2026»). */
export function fmtDay(v: string | null | undefined, opts: { weekday?: boolean } = {}): string {
  const d = v ? parse(v) : null;
  return d ? out(d.toFormat(opts.weekday ? "cccc d 'de' LLLL 'de' yyyy" : "d 'de' LLLL 'de' yyyy")) : '';
}

/** A short day for lists: «4 nov. 2026». */
export function fmtShortDay(v: string | null | undefined): string {
  const d = v ? parse(v) : null;
  return d ? out(d.toFormat('d LLL yyyy')) : '';
}

/** A moment with its hour, in Caracas: «4 de noviembre de 2026, 9:30 a. m.». */
export function fmtMoment(v: string | null | undefined): string {
  const d = v ? parse(v) : null;
  return d ? out(d.toFormat("d 'de' LLLL 'de' yyyy, h:mm a")) : '';
}

/** The day of a moment in Caracas, «YYYY-MM-DD» (for <time dateTime> and for grouping). */
export function dayOf(v: string | null | undefined): string {
  const d = v ? parse(v) : null;
  return d ? d.toISODate()! : '';
}

/** «noviembre de 2026» (the timeline's months). */
export function fmtMonth(v: string | null | undefined): string {
  const d = v ? parse(v) : null;
  return d ? out(d.toFormat("LLLL 'de' yyyy")) : '';
}

/** Today in Caracas, «YYYY-MM-DD». */
export function todayIso(): string {
  return DateTime.now().setZone(TZ).toISODate()!;
}

/** The current year in Caracas (the footer: it changes by itself, never «Copyright 2025» again). */
export function currentYear(): number {
  return DateTime.now().setZone(TZ).year;
}

const NUMBER = new Intl.NumberFormat('es-VE', { maximumFractionDigits: 1 });

/** 1200000 → «1.200.000»; 3.25 → «3,3». */
export function fmtNumber(n: number): string {
  return out(NUMBER.format(n));
}

/** An amount with its currency in words: «1.200.000 dólares (USD)». */
export function fmtMoney(amount: number, currency: 'USD' | 'VES'): string {
  return `${fmtNumber(amount)} ${currency === 'USD' ? 'dólares (USD)' : 'bolívares (VES)'}`;
}

/** A file's size: «12 KB», «1,4 MB». */
export function fmtBytes(n: number): string {
  if (n < 1024 * 1024) return `${fmtNumber(Math.max(1, Math.round(n / 1024)))} KB`;
  return `${fmtNumber(Math.round((n / (1024 * 1024)) * 10) / 10)} MB`;
}

/** An average time in hours, in the words people use: «5 horas», «3,5 días». */
export function fmtHours(h: number | null | undefined): string {
  if (h === null || h === undefined || !Number.isFinite(h)) return '—';
  if (h < 1) return 'menos de una hora';
  if (h < 48) return `${fmtNumber(Math.round(h * 10) / 10)} ${h === 1 ? 'hora' : 'horas'}`;
  return `${fmtNumber(Math.round((h / 24) * 10) / 10)} días`;
}

/** The days a period of the public figures covers (from null = since the start), in the Táchira's time zone. */
export function periodRange(period: 'todo' | 'anio' | '30d', today: string = todayIso()): { from: string | null; to: string } {
  const t = DateTime.fromISO(today, { zone: TZ });
  if (period === '30d') return { from: t.minus({ days: 29 }).toISODate()!, to: today };
  if (period === 'anio') return { from: `${t.year}-01-01`, to: today };
  return { from: null, to: today };
}
