'use client';

import { CheckCheck } from 'lucide-react';
import { toast } from 'sonner';
import { approveGreen } from '@/lib/actions/pieces';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';

// Green = routine: the boss approves all of them in one tap (cambios del 27/10/2026). Each one still goes through
// review_piece, and a piece that changed since this list loaded is skipped, never approved blind.
export function ApproveGreen({ pieces }: { pieces: { id: string; revision: number }[] }) {
  const { run, pending } = useAction();
  const n = pieces.length;
  return (
    <Button
      size="lg"
      data-tour="approve-green"
      className="w-full sm:w-auto sm:self-start"
      disabled={pending}
      onClick={() =>
        run(() => approveGreen({ pieces }), {
          onOk: (r) => {
            if (!r.ok) return;
            toast.success(r.data!.n === 1 ? 'Aprobada la verde.' : `Aprobadas ${r.data!.n} verdes.`);
            if (r.data!.skipped) toast.info(`${r.data!.skipped} cambiaron mientras tanto: ábrelas para revisarlas.`);
          },
        })
      }
    >
      <CheckCheck className="h-5 w-5" aria-hidden /> {pending ? 'Aprobando…' : `Aprobar todas las verdes (${n})`}
    </Button>
  );
}
