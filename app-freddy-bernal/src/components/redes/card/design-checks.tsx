'use client';

import { useState } from 'react';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { reviewPiece } from '@/lib/actions/pieces';
import { setDesign } from '@/lib/actions/redes';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/field';
import { cn } from '@/lib/cn';
import { useCard } from './card-context';
import { agoText } from './card-core';
import { fieldId } from './card-fields';

// «Diseño aprobado» / «Diseño desaprobado» with its note (D-64): one excludes the other and tapping the active one
// clears it. Redes and the boss mark it; it is never the approval (it does not change the state), but a design the boss
// disapproves after approving does not go out until he approves again. When the boss marked it disapproved, only he
// lifts it: Redes reads it («Desaprobó: el jefe»). The boss disapproving an approved piece first writes his note (the
// mark is saved with «Guardar nota»), then is asked «¿Pedir cambios también?», which sends that note as changes asked
// (the review of always).
export const DESIGN_NOTE_LABEL = '¿Qué no le gustó del diseño?';

export function DesignChecks({ first = false }: { first?: boolean }) {
  const { card, ctx, confirm, announce } = useCard();
  const { run, pending } = useAction();
  const status = card.design.status;
  const [note, setNote] = useState(card.design.note);
  const [seenNote, setSeenNote] = useState(card.design.note);
  if (seenNote !== card.design.note) {
    // Another person (or this one, saved) changed the note: the server's wins.
    setSeenNote(card.design.note);
    setNote(card.design.note);
  }
  const [noteOpen, setNoteOpen] = useState(false);
  // The boss tapped «Diseño desaprobado» on an approved piece: the mark waits for his note.
  const [asking, setAsking] = useState(false);
  const bossMark = card.design.byBoss && status === 'disapproved' && !ctx.perms.boss;
  const canEdit = ctx.perms.mark && !bossMark;
  const who = card.design.byBoss ? 'el jefe' : card.design.by;
  const noteId = fieldId(card.id, 'design-note');
  const showNote = status === 'disapproved' || noteOpen || asking || !!card.design.note;
  const askFirst = ctx.perms.boss && card.status === 'approved';

  const mark = (next: 'approved' | 'disapproved' | null, text = note) =>
    run(() => setDesign({ pieceId: card.id, status: next, note: next === 'disapproved' ? text : next === null ? '' : text }), {
      onOk: async (r) => {
        if (!r.ok) return;
        announce(r.message ?? 'Marca de diseño guardada');
        setAsking(false);
        if (next === 'disapproved') setNoteOpen(true);
        if (r.data?.askChanges) {
          const yes = await confirm({
            title: '¿Pedir cambios también?',
            body: 'La pieza ya estaba aprobada y así no sale. Si pides cambios, vuelve a Redes con tu nota.',
            confirmLabel: 'Sí, pedir cambios',
            cancelLabel: 'No, solo marcar',
          });
          if (yes) {
            await run(() => reviewPiece({ pieceId: card.id, decision: 'changes_requested', comment: text.trim() || 'Diseño desaprobado.', revision: card.revision }), {
              success: 'Pediste cambios.',
            });
          }
        }
      },
    });

  const box = (
    <section aria-label="Diseño" className="flex min-w-0 flex-col gap-2 rounded-[var(--radius-control)] border border-border p-3">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          size="md"
          aria-pressed={status === 'approved'}
          disabled={!canEdit || pending}
          className={cn(status === 'approved' && 'border-ok bg-ok-soft text-ok')}
          onClick={() => {
            setAsking(false);
            void mark(status === 'approved' ? null : 'approved');
          }}
        >
          <ThumbsUp className="h-4 w-4" aria-hidden /> Diseño aprobado
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="md"
          aria-pressed={status === 'disapproved'}
          disabled={!canEdit || pending}
          className={cn(status === 'disapproved' && 'border-danger bg-danger-soft text-danger')}
          onClick={() => {
            if (status !== 'disapproved' && askFirst) {
              // His reason goes with the mark and, if he asks for changes, to Redes: the note comes first.
              setAsking(true);
              announce('Escribe qué no le gustó del diseño y toca «Guardar nota».');
              requestAnimationFrame(() => document.getElementById(noteId)?.focus());
              return;
            }
            setAsking(false);
            void mark(status === 'disapproved' ? null : 'disapproved');
          }}
        >
          <ThumbsDown className="h-4 w-4" aria-hidden /> Diseño desaprobado
        </Button>
      </div>
      {status && who ? (
        <p className="text-sm text-text-2" suppressHydrationWarning>
          {status === 'disapproved' ? 'Desaprobó' : 'Aprobó el diseño'}: {who}
          {card.design.at ? `, ${agoText(card.design.at)}` : ''}
        </p>
      ) : null}
      {showNote ? (
        canEdit ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={noteId} className="text-sm font-semibold">
              {DESIGN_NOTE_LABEL}
            </label>
            <Textarea id={noteId} rows={2} maxLength={1000} value={note} className="min-h-0" onChange={(e) => setNote(e.target.value)} />
            <Button
              type="button"
              variant="secondary"
              size="md"
              className="self-start"
              disabled={pending || (!asking && note === card.design.note)}
              onClick={() => void mark(asking ? 'disapproved' : (status ?? 'disapproved'), note)}
            >
              Guardar nota
            </Button>
          </div>
        ) : card.design.note ? (
          <p className="whitespace-pre-wrap rounded-[var(--radius-control)] bg-surface-2 p-2 text-[15px]">
            <span className="font-semibold">{DESIGN_NOTE_LABEL}</span> {card.design.note}
          </p>
        ) : null
      ) : null}
      {bossMark ? <p className="text-sm text-text-2">Esta marca la puso el jefe: solo él la quita.</p> : null}
    </section>
  );
  return first ? <div data-tour="design-checks">{box}</div> : box;
}
