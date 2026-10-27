import type { Tone } from '@/components/ui/chip';

// Approval traffic light (D-23). The deadline is a reminder: when it passes, the piece
// is still NOT approved ("la falta de respuesta no es aprobación").

export type Level = 'verde' | 'amarillo' | 'rojo';
export type Deadlines = Record<Level, number>; // minutes

export const LEVELS: Record<Level, { label: string; who: string; hint: string; tone: Tone }> = {
// Every level is approved by the boss (Hillary, 27/10/2026); the level sets the deadline and lets the greens go
// all at once.
  verde: { label: 'Verde', who: 'el jefe', hint: 'Rutina. El jefe las aprueba todas de una vez, en el día.', tone: 'ok' },
  amarillo: { label: 'Amarillo', who: 'el jefe', hint: 'Normal. El jefe la revisa en 60 minutos.', tone: 'warn' },
  rojo: { label: 'Rojo', who: 'el jefe', hint: 'Sensible (política, crisis, aclaratorias). El jefe la revisa en 30 minutos.', tone: 'danger' },
};
export const LEVEL_ORDER: Level[] = ['rojo', 'amarillo', 'verde'];
export const DEFAULT_DEADLINES: Deadlines = { verde: 1440, amarillo: 60, rojo: 30 };

function span(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h} h` : `${Math.floor(h / 24)} d`;
}

export function reviewClock(level: Level, sentAt: Date | string | null, deadlines: Deadlines = DEFAULT_DEADLINES, now = Date.now()) {
  if (!sentAt) return { overdue: false, text: '' };
  const due = new Date(sentAt).getTime() + (deadlines[level] ?? DEFAULT_DEADLINES[level]) * 60_000;
  const left = Math.round((due - now) / 60_000);
  return left >= 0 ? { overdue: false, text: `Vence en ${span(Math.max(1, left))}` } : { overdue: true, text: `Venció hace ${span(-left)}` };
}
