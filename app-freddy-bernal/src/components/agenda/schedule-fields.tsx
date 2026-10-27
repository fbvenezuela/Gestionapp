'use client';

import { DateTime } from 'luxon';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { TZ } from '@/lib/time';
import { cn } from '@/lib/cn';
import { DURATIONS, durationLabel, type ScheduleValues } from '@/lib/domain/schedule-form';

// Date, time, duration and (optionally) the exact place of an event, big enough for a finger on the iPad and the
// phone, with «Hoy» and «Mañana». Private: only the boss, despacho, administración and whoever records it see them
// (and the IVT, for the visits of its obras).
export type { ScheduleValues };

export function ScheduleFields({
  idPrefix,
  values,
  onChange,
  place = true,
}: {
  idPrefix: string;
  values: ScheduleValues;
  onChange: (k: keyof ScheduleValues, v: string) => void;
  place?: boolean;
}) {
  const now = DateTime.now().setZone(TZ);
  const quick = [
    { label: 'Hoy', date: now.toISODate()! },
    { label: 'Mañana', date: now.plus({ days: 1 }).toISODate()! },
  ];
  const durations = DURATIONS.includes(Number(values.durationMin)) || !values.durationMin ? DURATIONS : [...DURATIONS, Number(values.durationMin)].sort((a, b) => a - b);
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="flex flex-wrap gap-2 sm:col-span-3" role="group" aria-label="Atajos de fecha">
        {quick.map((q) => (
          <button
            key={q.label}
            type="button"
            aria-pressed={values.date === q.date}
            onClick={() => onChange('date', q.date)}
            className={cn(
              'min-h-11 rounded-full border px-4 text-[15px] font-semibold',
              values.date === q.date ? 'border-accent bg-accent text-on-accent' : 'border-border bg-surface text-text hover:bg-surface-2',
            )}
          >
            {q.label}
          </button>
        ))}
      </div>
      <Field label="Fecha" htmlFor={`${idPrefix}-date`}>
        <Input id={`${idPrefix}-date`} type="date" required className="min-h-14 text-lg" value={values.date} onChange={(e) => onChange('date', e.target.value)} />
      </Field>
      <Field label="Hora (Táchira)" htmlFor={`${idPrefix}-time`}>
        <Input id={`${idPrefix}-time`} type="time" required className="min-h-14 text-lg" value={values.time} onChange={(e) => onChange('time', e.target.value)} />
      </Field>
      <Field label="Duración" htmlFor={`${idPrefix}-dur`}>
        <Select id={`${idPrefix}-dur`} className="min-h-14 text-lg" value={values.durationMin} onChange={(e) => onChange('durationMin', e.target.value)}>
          {durations.map((m) => (
            <option key={m} value={m}>{durationLabel(m)}</option>
          ))}
        </Select>
      </Field>
      {place ? (
        <>
          <Field label="Dirección exacta" htmlFor={`${idPrefix}-addr`} className="sm:col-span-3">
            <Input id={`${idPrefix}-addr`} value={values.exactAddress ?? ''} onChange={(e) => onChange('exactAddress', e.target.value)} />
          </Field>
          <Field label="Cómo se llega" htmlFor={`${idPrefix}-dir`} className="sm:col-span-3">
            <Textarea id={`${idPrefix}-dir`} rows={2} value={values.directions ?? ''} onChange={(e) => onChange('directions', e.target.value)} />
          </Field>
          <Field label="Contactos del sitio" htmlFor={`${idPrefix}-contacts`} className="sm:col-span-3">
            <Textarea id={`${idPrefix}-contacts`} rows={2} value={values.siteContacts ?? ''} onChange={(e) => onChange('siteContacts', e.target.value)} />
          </Field>
        </>
      ) : null}
    </div>
  );
}
