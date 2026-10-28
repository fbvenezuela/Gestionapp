'use client';

import { useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { moveEvent } from '@/lib/actions/agenda';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { ScheduleFields, type ScheduleValues } from './schedule-fields';
import { ConflictBanner } from './conflict-banner';
import { useEditDraft } from './use-edit-draft';

const LABELS = { date: 'Fecha', time: 'Hora', durationMin: 'Duración' };

// «Mover»: only the date, the time and the duration (the place stays). Whoever records it and the IVT (an obra visit)
// get «Cambió la fecha u hora», without the new one.
export function MoveSheet({ id, current, rev }: { id: string; current: Pick<ScheduleValues, 'date' | 'time' | 'durationMin'>; rev: number }) {
  const { run, pending } = useAction();
  const [open, setOpen] = useState(false);
  const [allowOverlap, setAllowOverlap] = useState(false);
  const d = useEditDraft(`mover:${id}`, current, rev);
  const v = d.values as Pick<ScheduleValues, 'date' | 'time' | 'durationMin'>;
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title="Mover"
      description="Otra fecha u hora. Le avisamos a quien graba (sin la fecha)."
      trigger={
        <Button size="lg" variant="secondary" data-tour="move">
          <CalendarClock className="h-5 w-5" aria-hidden /> Mover
        </Button>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const p = d.payload();
          run(() => moveEvent({ id, ...v, rev: p.rev, base: p.base as { date: string; time: string; durationMin: string }, allowOverlap }), {
            onOk: () => {
              d.clear();
              setOpen(false);
            },
          });
        }}
      >
        <ConflictBanner conflicts={d.conflicts} theirs={d.theirs} onTheirs={d.takeTheirs} onMine={d.keepMine} labels={LABELS} />
        <ScheduleFields idPrefix={`mv-${id.slice(0, 8)}`} values={v} onChange={(k, val) => d.set(k, val)} place={false} />
        <label className="flex min-h-11 items-center gap-2 text-[15px]">
          <input type="checkbox" className="h-5 w-5 accent-accent" checked={allowOverlap} onChange={(e) => setAllowOverlap(e.target.checked)} />
          Guardar aunque choque con otro evento
        </label>
        <Button type="submit" size="lg" disabled={pending}>{pending ? 'Guardando…' : 'Guardar la nueva fecha'}</Button>
      </form>
    </Sheet>
  );
}
