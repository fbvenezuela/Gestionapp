import type { DateTime } from 'luxon';

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

const range = (w: Window) => `${w.from}–${w.to}`;

function days(list: number[]) {
  const names = list.map((d) => DAY[d]).filter(Boolean);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names.at(-1)}` : names[0] ?? '';
}

/** One line for the form: "Mejor 22:00–23:59 o 07:00–11:59 · jueves, miércoles y domingo. Evitar 12:00–16:59." */
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
  if (bad) out.push(`${label}: ${range(bad)} es de las horas que peor rinden.`);
  else if (w.best.length && !w.best.some((x) => inside(x, m))) out.push(`${label}: fuera de las mejores horas (${w.best.map(range).join(' o ')}).`);
  if (w.avoidDays.includes(at.weekday)) out.push(`${label}: el ${DAY[at.weekday]} es de los días que peor rinden.`);
  return out;
}
