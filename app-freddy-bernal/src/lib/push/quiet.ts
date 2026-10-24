import { DateTime } from 'luxon';

// Quiet hours: per person, stored in profiles.notify_prefs (quiet, quiet_from, quiet_to), read in
// the app timezone. On by default (21:00 to 07:00). During quiet hours only critical pushes go;
// the in-app notice is always created.

export const QUIET_DEFAULT = { on: true, from: '21:00', to: '07:00' } as const;
export const GROUP_MINUTES = 10;

export type QuietHours = { on: boolean; from: string; to: string };
export type NotifyPrefs = Record<string, unknown>;

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isHhmm(v: unknown): v is string {
  return typeof v === 'string' && HHMM.test(v);
}

export function quietHours(prefs: NotifyPrefs | null | undefined): QuietHours {
  const p = prefs ?? {};
  return {
    on: p.quiet !== false,
    from: isHhmm(p.quiet_from) ? p.quiet_from : QUIET_DEFAULT.from,
    to: isHhmm(p.quiet_to) ? p.quiet_to : QUIET_DEFAULT.to,
  };
}

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

// True when `now` falls inside the quiet window (which may cross midnight). from === to = never.
export function inQuietHours(now: Date, q: QuietHours, tz = 'America/Caracas'): boolean {
  if (!q.on) return false;
  const local = DateTime.fromJSDate(now).setZone(tz);
  const t = local.hour * 60 + local.minute;
  const a = minutes(q.from);
  const b = minutes(q.to);
  if (a === b) return false;
  return a < b ? t >= a && t < b : t >= a || t < b;
}

export type PushDecision = 'send' | 'kind_off' | 'quiet';

// Whether a notice of this kind may go to this person's phone right now (before grouping).
export function pushDecision(kind: string, prefs: NotifyPrefs | null | undefined, critical: boolean, now: Date, tz = 'America/Caracas'): PushDecision {
  if (critical) return 'send';
  if ((prefs ?? {})[kind] === false) return 'kind_off';
  if (inQuietHours(now, quietHours(prefs), tz)) return 'quiet';
  return 'send';
}
