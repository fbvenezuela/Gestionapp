'use client';

import { CheckCheck } from 'lucide-react';
import { toast } from 'sonner';
import { approveGreen } from '@/lib/actions/pieces';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';

// Green = routine: supervision can approve all of them at once, after a look.
export function ApproveGreen({ pieces }: { pieces: { id: string; revision: number }[] }) {
  const { run, pending } = useAction();
  return (
    <Button
      size="sm"
      disabled={pending}
      onClick={() => {
        if (!confirm(`¿Ya las revisaste? Se aprueban ${pieces.length} ${pieces.length === 1 ? 'pieza verde' : 'piezas verdes'}.`)) return;
        run(() => approveGreen({ pieces }), {
          onOk: (r) => {
            if (!r.ok) return;
            toast.success(r.data!.n === 1 ? 'Aprobada.' : `Aprobadas ${r.data!.n}.`);
            if (r.data!.skipped) toast.info(`${r.data!.skipped} cambiaron mientras tanto: ábrelas para revisarlas.`);
          },
        });
      }}
    >
      <CheckCheck className="h-4 w-4" aria-hidden /> Aprobar {pieces.length === 1 ? 'la verde' : `las ${pieces.length}`}
    </Button>
  );
}
