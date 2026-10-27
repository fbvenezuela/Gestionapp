'use client';

import { useState } from 'react';
import { dismissFromAgenda } from '@/lib/actions/agenda';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Field, Textarea } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';

// «No va»: the ficha leaves «Por ponerle fecha» with its reason in the history (an obra is archived; a report stays in
// the register without going to the agenda).
export function DismissButton({ kind, id }: { kind: 'obra' | 'report'; id: string }) {
  const { run, pending } = useAction();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title="No va a la agenda"
      description={kind === 'obra' ? 'La obra queda archivada (se puede traer de vuelta desde su ficha).' : 'El reporte queda en el registro del municipio.'}
      trigger={<Button variant="ghost">No va</Button>}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => dismissFromAgenda({ kind, id, note }), { onOk: () => setOpen(false) });
        }}
      >
        <Field label="Por qué no va" htmlFor={`nova-${id.slice(0, 8)}`} hint="Queda en la historia de la ficha.">
          <Textarea id={`nova-${id.slice(0, 8)}`} rows={3} required minLength={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <Button type="submit" disabled={pending}>Guardar</Button>
      </form>
    </Sheet>
  );
}
