'use client';

import { useId } from 'react';
import { saveRecordingNote } from '@/lib/actions/recording';
import { useAction } from '@/lib/hooks/use-action';
import { useDraft } from '@/lib/hooks/use-draft';
import { Button } from '@/components/ui/button';
import { Field, Textarea } from '@/components/ui/field';
import { DICTATE_HINT } from '@/lib/data/labels';
import { NOTE_HINT, NOTE_MAX, noteWarning, type NoteKind } from '@/lib/domain/recording';

// Grabación's note for the editor, or the storyboard it recorded with written out (§5). One per person, event and
// kind: saving again replaces it. What is typed stays in the phone until it is saved (a dropped signal at the event
// loses nothing). A soft warning when it looks like a date or a time of day, never a block (timecodes look alike).
export function RecordingNoteForm({
  eventId, kind, initial, label, placeholder, button,
}: { eventId: string; kind: NoteKind; initial: string; label: string; placeholder: string; button: string }) {
  const id = useId();
  const { run, pending } = useAction();
  const d = useDraft(`recording:${eventId}:${kind}`, { body: initial });
  const body = d.value.body;
  const warning = noteWarning(body);
  const changed = body.trim() !== initial.trim();
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const text = body.trim();
        // The page stays open after saving: the next save starts from what was just saved.
        run(() => saveRecordingNote({ eventId, kind, body: text }), { onOk: () => d.reset({ body: text }) });
      }}
    >
      <Field label={label} htmlFor={id} hint={`${NOTE_HINT} ${DICTATE_HINT}`}>
        <Textarea
          id={id}
          value={body}
          maxLength={NOTE_MAX}
          rows={4}
          placeholder={placeholder}
          onChange={(e) => d.setValue({ body: e.target.value })}
        />
      </Field>
      {warning ? <p className="rounded-[var(--radius-control)] bg-warn-soft px-3 py-2 text-sm text-warn">{warning}</p> : null}
      {d.restored ? <p className="text-sm text-text-2">Recuperamos lo que estabas escribiendo; todavía no está guardado.</p> : null}
      <div>
        <Button type="submit" disabled={pending || !changed}>{pending ? 'Guardando…' : button}</Button>
      </div>
    </form>
  );
}
