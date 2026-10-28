'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock } from 'lucide-react';
import { scheduleObraFicha, scheduleReport } from '@/lib/actions/agenda';
import { useAction } from '@/lib/hooks/use-action';
import { useDraft } from '@/lib/hooks/use-draft';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { ScheduleFields, type ScheduleValues } from './schedule-fields';

// «Ponerle fecha» (§4.1, §4.2): the boss or despacho turn a ficha into an event of the agenda. What is typed stays
// in the phone (per person) until it is saved: if someone else put the date in the meantime, nothing typed is lost.
type Form = ScheduleValues & { title: string; placeName: string; cameraUserId: string };

// Who reads the date, the time and the exact address (can_see_schedule()): an obra visit's also reaches the IVT (it is
// his visit); a report's activity never reaches política. «A dónde se va» (events.place_name) is the whole team's.
const WHO_SEES = {
  obra: 'Se convierte en un evento de la agenda. La fecha, la hora y la dirección exacta solo las ven el jefe, el despacho, administración, quien graba y el IVT (es su visita de obra).',
  report: 'Se convierte en un evento de la agenda. La fecha, la hora y la dirección exacta solo las ven el jefe, el despacho, administración y quien graba.',
};

export function ScheduleSheet({
  kind,
  fichaId,
  defaultTitle,
  defaultPlace,
  cameras,
  size = 'lg',
  label = 'Ponerle fecha',
}: {
  kind: 'obra' | 'report';
  fichaId: string;
  defaultTitle: string;
  defaultPlace: string;
  cameras: { id: string; full_name: string }[];
  size?: 'md' | 'lg';
  label?: string;
}) {
  const router = useRouter();
  const { run, pending } = useAction();
  const [open, setOpen] = useState(false);
  const [allowOverlap, setAllowOverlap] = useState(false);
  const empty: Form = { title: defaultTitle, placeName: defaultPlace, cameraUserId: '', date: '', time: '09:00', durationMin: '60', exactAddress: '', directions: '', siteContacts: '' };
  const { value: f, setValue, restored, clear } = useDraft<Form>(`ponerle-fecha:${kind}:${fichaId}`, empty);
  const set = (k: keyof Form, v: string) => setValue((x) => ({ ...x, [k]: v }));
  const id = `pf-${fichaId.slice(0, 8)}`;
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title="Ponerle fecha"
      description={WHO_SEES[kind]}
      trigger={
        <Button size={size} className="w-full sm:w-auto" data-tour="schedule-ficha">
          <CalendarClock className="h-5 w-5" aria-hidden /> {label}
        </Button>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const action = kind === 'obra' ? scheduleObraFicha : scheduleReport;
          run(() => action({ id: fichaId, ...f, allowOverlap }), {
            refresh: false,
            onOk: (r) => {
              clear();
              setOpen(false);
              const ev = (r as { data?: { eventId?: string } }).data?.eventId;
              if (ev) router.push(`/eventos/${ev}`);
            },
          });
        }}
      >
        {restored ? (
          <p className="rounded-[var(--radius-control)] bg-info-soft px-3 py-2 text-sm text-info" role="status">
            Recuperamos lo que estabas escribiendo.
          </p>
        ) : null}
        <Field label="Título del evento" htmlFor={`${id}-title`} hint="Lo ve todo el equipo: sin fecha ni hora.">
          <Input id={`${id}-title`} required maxLength={140} className="min-h-14 text-lg" value={f.title} onChange={(e) => set('title', e.target.value)} />
        </Field>
        <Field label="A dónde se va" htmlFor={`${id}-place`} hint="El nombre del sitio (lo ve todo el equipo)">
          <Input id={`${id}-place`} maxLength={200} value={f.placeName} onChange={(e) => set('placeName', e.target.value)} />
        </Field>
        <ScheduleFields idPrefix={id} values={f} onChange={(k, v) => set(k, v)} />
        {cameras.length ? (
          <Field label="Quién graba" htmlFor={`${id}-cam`}>
            <Select id={`${id}-cam`} value={f.cameraUserId} onChange={(e) => set('cameraUserId', e.target.value)}>
              <option value="">Sin asignar</option>
              {cameras.map((c) => (
                <option key={c.id} value={c.id}>{c.full_name}</option>
              ))}
            </Select>
          </Field>
        ) : null}
        <label className="flex min-h-11 items-center gap-2 text-[15px]">
          <input type="checkbox" className="h-5 w-5 accent-accent" checked={allowOverlap} onChange={(e) => setAllowOverlap(e.target.checked)} />
          Guardar aunque choque con otro evento
        </label>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? 'Guardando…' : 'Guardar la fecha'}
        </Button>
      </form>
    </Sheet>
  );
}
