'use client';

import { CheckCheck } from 'lucide-react';
import { approveGreen } from '@/lib/actions/pieces';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';

// Green = routine: supervision can approve all of them at once, after a look.
export function ApproveGreen({ ids }: { ids: string[] }) {
  const { run, pending } = useAction();
  return (
    <Button
      size="sm"
      disabled={pending}
      onClick={() => {
        if (!confirm(`¿Ya las revisaste? Se aprueban ${ids.length} ${ids.length === 1 ? 'pieza verde' : 'piezas verdes'}.`)) return;
        run(() => approveGreen({ pieceIds: ids }), { success: ids.length === 1 ? 'Aprobada.' : 'Aprobadas.' });
      }}
    >
      <CheckCheck className="h-4 w-4" aria-hidden /> Aprobar {ids.length === 1 ? 'la verde' : `las ${ids.length}`}
    </Button>
  );
}
