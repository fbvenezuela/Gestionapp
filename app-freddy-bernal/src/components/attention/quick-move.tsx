'use client';

import Link from 'next/link';
import { changeRequestState } from '@/lib/actions/attention';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { REQUEST_STATE_LABEL, nextStates, quickMoves, type RequestState } from '@/lib/domain/attention';

// The board's buttons (design §5: «drag optional; buttons to move are enough on the phone»): the moves that need no
// reason, one tap each; anything that needs a reason or a message for the person opens the case at its state form.
export function QuickMove({ id, reference, state }: { id: string; reference: string; state: RequestState }) {
  const { run, pending } = useAction();
  const quick = quickMoves(state);
  const more = nextStates(state).length > quick.length;
  if (!quick.length && !more) return null;
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={`Mover ${reference}`}>
      {quick.map((n) => (
        <Button
          key={n.state}
          type="button"
          variant="secondary"
          size="sm"
          className="min-h-11"
          disabled={pending}
          aria-label={`Pasar ${reference} a ${REQUEST_STATE_LABEL[n.state]}`}
          onClick={() => run(() => changeRequestState({ id, state: n.state }))}
        >
          → {n.label}
        </Button>
      ))}
      {more ? (
        <Link href={`/admin/atencion/${id}#estado`} className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-accent-ink">
          Otro estado…
        </Link>
      ) : null}
    </div>
  );
}
