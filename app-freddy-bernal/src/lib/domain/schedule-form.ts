import { DateTime } from 'luxon';
import { TZ } from '../time';

// The form values of an event's date, time, duration and place (Táchira time). Pure: used by the server pages and by
// the client editors (components/agenda/schedule-fields.tsx).
export type ScheduleValues = { date: string; time: string; durationMin: string; exactAddress?: string; directions?: string; siteContacts?: string };

export const DURATIONS = [30, 45, 60, 90, 120, 150, 180, 240, 300, 480];
export const durationLabel = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`);

export function scheduleValues(s: { starts_at: string | Date; ends_at: string | Date; exact_address?: string; directions?: string; site_contacts?: string }): ScheduleValues {
  const a = DateTime.fromJSDate(new Date(s.starts_at)).setZone(TZ);
  const b = DateTime.fromJSDate(new Date(s.ends_at)).setZone(TZ);
  return {
    date: a.toISODate()!,
    time: a.toFormat('HH:mm'),
    durationMin: String(Math.round(b.diff(a, 'minutes').minutes)),
    exactAddress: s.exact_address ?? '',
    directions: s.directions ?? '',
    siteContacts: s.site_contacts ?? '',
  };
}

// «Mover» changes only these.
export const whenOf = (v: ScheduleValues) => ({ date: v.date, time: v.time, durationMin: v.durationMin });
