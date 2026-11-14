import { DateTime } from 'luxon';
import { TZ, fmtAt } from '../time';

// Best and worst hours per network, from the client's own measurements
// (config/clients/<brand>.json → setting `publishing.windows`). Advice only: it never
// blocks a publication. Days use ISO numbering (1 = lunes … 7 = domingo).

export type Window = { from: string; to: string };
export type NetworkWindows = { best: Window[]; avoid: Window[]; bestDays: number[]; avoidDays: number[]; note: string };
export type PublishingWindows = Partial<Record<string, NetworkWindows>>;

const DAY = ['', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

function minutes(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function inside(w: Window, m: number) {
  return m >= minutes(w.from) && m <= minutes(w.to);
}

/** «2 p. m.», «11:59 p. m.»: an hour as every other time in the app says it (R27, like the agenda's «6 a. m.»). */
function clock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return fmtAt(DateTime.fromObject({ hour: h, minute: m }, { zone: TZ, locale: 'es' }), m ? 'h:mm a' : 'h a');
}
const MERIDIEM = / [ap]\. m\.$/;
/** «de 12 a 2 p. m.», «de 6 a. m. a 1 p. m.»: the «a. m.» or «p. m.» once when both ends share it. */
function range(w: Window): string {
  const [a, b] = [clock(w.from), clock(w.to)];
  const same = MERIDIEM.exec(a)?.[0] === MERIDIEM.exec(b)?.[0];
  return `de ${same ? a.replace(MERIDIEM, '') : a} a ${b}`;
}

function days(list: number[]) {
  const names = list.map((d) => DAY[d]).filter(Boolean);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names.at(-1)}` : names[0] ?? '';
}

/** One line for the form: "Mejor de 10 a 11:59 p. m. o de 7 a 11:59 a. m. · jueves, miércoles y domingo. Evitar de 12 a 4:59 p. m." */
export function windowHint(w: NetworkWindows | undefined): string {
  if (!w) return '';
  const parts: string[] = [];
  if (w.best.length || w.bestDays.length) {
    parts.push(`Mejor ${[w.best.map(range).join(' o '), days(w.bestDays)].filter(Boolean).join(' · ')}.`);
  }
  const avoid = [w.avoid.map(range).join(' o '), days(w.avoidDays)].filter(Boolean).join(' · ');
  if (avoid) parts.push(`Evitar ${avoid}.`);
  return parts.join(' ');
}

/** Warnings for a chosen day and hour (Táchira time). Empty when nothing to say. */
export function windowWarnings(label: string, w: NetworkWindows | undefined, at: DateTime): string[] {
  if (!w) return [];
  const m = at.hour * 60 + at.minute;
  const out: string[] = [];
  const bad = w.avoid.find((x) => inside(x, m));
  if (bad) out.push(`${label}: la franja ${range(bad)} es de las que peor rinden.`);
  else if (w.best.length && !w.best.some((x) => inside(x, m))) out.push(`${label}: fuera de las mejores horas (${w.best.map(range).join(' o ')}).`);
  if (w.avoidDays.includes(at.weekday)) out.push(`${label}: el ${DAY[at.weekday]} es de los días que peor rinden.`);
  return out;
}
