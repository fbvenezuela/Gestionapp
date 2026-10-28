'use client';

import { useState } from 'react';
import { Ban, Undo2 } from 'lucide-react';
import { cancelEvent, restoreEvent } from '@/lib/actions/agenda';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Field, Textarea } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';

// «Cancelar»: the event stays (struck through), with who and why. Never deleting. A visit born from a ficha sends the
// ficha back to «Por ponerle fecha».
export function CancelButton({ id, fromFicha }: { id: string; fromFicha: boolean }) {
  const { run, pending } = useAction();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title="¿Cancelar este evento?"
      description={fromFicha ? 'Queda en la agenda tachado. Su ficha vuelve a «Por ponerle fecha».' : 'Queda en la agenda tachado, con quién lo canceló y por qué.'}
      trigger={
        <Button size="lg" variant="danger" data-tour="cancel">
          <Ban className="h-5 w-5" aria-hidden /> Cancelar
        </Button>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => cancelEvent({ id, reason }), { onOk: () => setOpen(false) });
        }}
      >
        <Field label="Motivo (opcional)" htmlFor={`cancel-${id.slice(0, 8)}`} hint="Lo ve todo el equipo, Redes también: sin fecha, hora ni teléfono.">
          <Textarea id={`cancel-${id.slice(0, 8)}`} rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <Button type="submit" size="lg" variant="danger" disabled={pending}>{pending ? 'Cancelando…' : 'Sí, cancelar el evento'}</Button>
      </form>
    </Sheet>
  );
}

export function RestoreButton({ id }: { id: string }) {
  const { run, pending } = useAction();
  return (
    <Button size="lg" variant="secondary" disabled={pending} onClick={() => run(() => restoreEvent({ id }))}>
      <Undo2 className="h-5 w-5" aria-hidden /> Volver a la agenda
    </Button>
  );
}
