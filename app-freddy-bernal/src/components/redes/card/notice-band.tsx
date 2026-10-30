'use client';

import { useState } from 'react';
import { CheckCircle2, Plus, TriangleAlert } from 'lucide-react';
import { addNotice, resolveNotice } from '@/lib/actions/redes';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Select, Textarea } from '@/components/ui/field';
import { NOTICE_KINDS } from '@/lib/domain/redes';
import { useCard } from './card-context';
import { fieldId } from './card-fields';

// «Antes de publicar:» (D-66): the piece's compliance notices as an amber band (a testimony that needs a written
// authorisation, a figure whose source and date must be checked…). Redes and the boss add them and mark them
// «Resuelto» (never deleted). A new notice on an approved piece sends it back to the boss (the database does it).
export function NoticeBand({ first = false }: { first?: boolean }) {
  const { card, ctx, announce } = useCard();
  const { run, pending } = useAction();
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState('written_consent');
  const [body, setBody] = useState('');
  const can = ctx.perms.mark;
  if (!card.notices.length && !can) return null;
  const kindId = fieldId(card.id, 'notice-kind');
  const bodyId = fieldId(card.id, 'notice-body');

  const form = adding ? (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => addNotice({ pieceId: card.id, kind, body }), {
          onOk: () => {
            setBody('');
            setAdding(false);
            announce('Aviso guardado');
          },
        });
      }}
    >
      <div className="flex flex-col gap-1">
        <label htmlFor={kindId} className="text-sm font-semibold">
          Tipo de aviso
        </label>
        <Select id={kindId} value={kind} onChange={(e) => setKind(e.target.value)}>
          {Object.entries(NOTICE_KINDS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={bodyId} className="text-sm font-semibold">
          Qué hay que cuidar
        </label>
        <Textarea id={bodyId} rows={2} maxLength={500} value={body} className="min-h-0" onChange={(e) => setBody(e.target.value)} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" className="min-h-11" disabled={pending || body.trim().length < 3}>
          Guardar aviso
        </Button>
        <Button type="button" variant="ghost" size="sm" className="min-h-11" onClick={() => setAdding(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  ) : null;

  const band = card.notices.length ? (
    <section aria-label="Antes de publicar" className="flex min-w-0 flex-col gap-2 rounded-[var(--radius-control)] border border-warn bg-warn-soft p-3 text-text">
      <p className="flex items-center gap-2 font-semibold text-warn">
        <TriangleAlert className="h-4 w-4" aria-hidden /> Antes de publicar:
      </p>
      <ul className="flex flex-col gap-2">
        {card.notices.map((n) => (
          <li key={n.id} className="flex flex-wrap items-start justify-between gap-2">
            <p className="min-w-0 flex-1 text-[15px]">
              <span className="font-semibold">{NOTICE_KINDS[n.kind] ?? 'Aviso'}:</span> {n.body}
              {n.by ? <span className="text-sm text-text-2"> · {n.by}</span> : null}
            </p>
            {can ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="min-h-11"
                disabled={pending}
                onClick={() => void run(() => resolveNotice({ noticeId: n.id }), { onOk: () => announce('Aviso resuelto') })}
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden /> Resuelto
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {can && !adding ? (
        <Button type="button" variant="ghost" size="sm" className="min-h-11 self-start" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" aria-hidden /> Agregar aviso
        </Button>
      ) : null}
      {form}
    </section>
  ) : (
    <div className="flex min-w-0 flex-col gap-2">
      {adding ? null : (
        <Button type="button" variant="ghost" size="sm" className="min-h-11 self-start" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" aria-hidden /> Agregar aviso
        </Button>
      )}
      {form ? <div className="rounded-[var(--radius-control)] border border-warn bg-warn-soft p-3">{form}</div> : null}
    </div>
  );
  return first ? <div data-tour="notice-band">{band}</div> : band;
}
