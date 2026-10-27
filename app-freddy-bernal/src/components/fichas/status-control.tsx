'use client';

import { useState } from 'react';
import { Archive, ArchiveRestore } from 'lucide-react';
import { setReportStatus } from '@/lib/actions/reports';
import { archiveObraFicha } from '@/lib/actions/obras';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, Select, Textarea } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { REPORT_STATUSES, REPORT_STATUS, type ReportStatus } from '@/lib/data/ficha-labels';

// The state of a community report, with the reason: both go into the history.
export function ReportStatusControl({ id, status }: { id: string; status: ReportStatus }) {
  const { run, pending } = useAction();
  const [next, setNext] = useState<ReportStatus>(status);
  const [note, setNote] = useState('');
  return (
    <Card>
      <CardHeader title="Estado" subtitle="Cada cambio queda en la historia con su motivo." />
      <CardBody>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => setReportStatus({ id, status: next, note }), { onOk: () => setNote('') });
          }}
        >
          <Field label="Nuevo estado" htmlFor={`st-${id}`}>
            <Select id={`st-${id}`} value={next} onChange={(e) => setNext(e.target.value as ReportStatus)}>
              {REPORT_STATUSES.map((s) => (
                <option key={s} value={s}>{REPORT_STATUS[s].label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Motivo o avance (opcional)" htmlFor={`stn-${id}`}>
            <Textarea id={`stn-${id}`} rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <Button type="submit" disabled={pending || next === status} className="self-start">
            Cambiar estado
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

// An obra that will not be visited is archived (with its reason); it can come back as a draft.
export function ObraArchiveControl({ id, stage }: { id: string; stage: string }) {
  const { run, pending } = useAction();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  if (stage === 'archived') {
    return (
      <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => archiveObraFicha({ id, archive: false }))}>
        <ArchiveRestore className="h-4 w-4" aria-hidden /> Sacar del archivo
      </Button>
    );
  }
  if (stage !== 'draft' && stage !== 'to_schedule') return null;
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title="Archivar la ficha"
      description="Sale de «Por ponerle fecha». La historia la guarda y se puede sacar del archivo."
      trigger={
        <Button variant="secondary" size="sm">
          <Archive className="h-4 w-4" aria-hidden /> Archivar
        </Button>
      }
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => archiveObraFicha({ id, archive: true, note }), { onOk: () => setOpen(false) });
        }}
      >
        <Field label="¿Por qué se archiva?" htmlFor={`arch-${id}`}>
          <Textarea id={`arch-${id}`} rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <Button type="submit" disabled={pending}>Archivar</Button>
      </form>
    </Sheet>
  );
}
