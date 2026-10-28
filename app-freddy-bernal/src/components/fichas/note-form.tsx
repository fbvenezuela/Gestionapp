'use client';

import { useState } from 'react';
import { addObraNote } from '@/lib/actions/obras';
import { addReportNote } from '@/lib/actions/reports';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/field';

// A note in the ficha's history («quedó en llamar al vocero»…). Nobody edits or deletes it afterwards.
export function NoteForm({ kind, id }: { kind: 'obra' | 'report'; id: string }) {
  const { run, pending } = useAction();
  const [note, setNote] = useState('');
  return (
    <form
      className="flex flex-col gap-2"
      data-tour="note"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => (kind === 'obra' ? addObraNote({ id, note }) : addReportNote({ id, note })), { onOk: () => setNote('') });
      }}
    >
      <label htmlFor={`note-${id}`} className="text-sm font-semibold">Agregar una nota</label>
      <Textarea id={`note-${id}`} rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Sin teléfonos ni nombres de quien reporta: esos van en los contactos." />
      <Button type="submit" variant="secondary" size="sm" disabled={pending || note.trim().length < 2} className="self-start">
        Guardar nota
      </Button>
    </form>
  );
}
