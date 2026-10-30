'use client';

import { Check } from 'lucide-react';
import { movePieceToMonth } from '@/lib/actions/redes';
import { useAction } from '@/lib/hooks/use-action';
import { Sheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { FEED_FORMATS, type Format } from '@/lib/domain/redes';
import { useCard } from './card-context';

// «Mover a otro mes» (D-67): the month it is in, marked «✓ Mes 1 — está aquí», and the others as buttons. Its feed place
// goes with it (to the first free number of that month, or «Sin programar» when that feed is full). The card leaves
// this month's list.
export function MoveMonthDialog({ open, onOpenChange, onMoved }: { open: boolean; onOpenChange: (o: boolean) => void; onMoved: () => void }) {
  const { card, ctx, announce } = useCard();
  const { run, pending } = useAction();
  const here = card.monthId ?? ctx.months[0]?.id ?? null;
  const inFeed = (FEED_FORMATS as readonly Format[]).includes(card.format);
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Mover a otro mes" description={`«${card.title}»`}>
      <ul className="flex flex-col gap-2">
        {ctx.months.map((m) =>
          m.id === here ? (
            <li key={m.id} className="flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] bg-surface-2 px-4 text-[15px] font-semibold">
              <Check className="h-4 w-4 text-ok" aria-hidden /> {m.label} — está aquí
            </li>
          ) : (
            <li key={m.id}>
              <Button
                type="button"
                variant="secondary"
                className="w-full justify-start"
                disabled={pending}
                onClick={() =>
                  void run(() => movePieceToMonth({ pieceId: card.id, monthId: m.id }), {
                    onOk: (r) => {
                      if (!r.ok) return;
                      announce(r.message ?? `Movida a ${m.label}`);
                      onOpenChange(false);
                      onMoved();
                    },
                  })
                }
              >
                {m.label}
              </Button>
            </li>
          ),
        )}
      </ul>
      {inFeed ? <p className="mt-4 text-sm text-text-2">Su espacio en el feed se va con ella.</p> : null}
    </Sheet>
  );
}
