'use client';

import { CheckCheck } from 'lucide-react';
import { toast } from 'sonner';
import { approveGreen } from '@/lib/actions/pieces';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';

// Green = routine: supervision can approve all of them at once, after a look.
export function ApproveGreen({ pieces }: { pieces: { id: string; revision: number }[] }) {
  const { run, pending } = useAction();
  const { confirm, dialog } = useConfirm();
  const n = pieces.length;
  return (
    <>
      {dialog}
      <Button
        size="sm"
        disabled={pending}
        onClick={async () => {
          const ok = await confirm({
            title: '¿Ya las revisaste?',
            body: `Se aprueban ${n} ${n === 1 ? 'pieza verde' : 'piezas verdes'} de una vez.`,
            confirmLabel: n === 1 ? 'Sí, aprobarla' : `Sí, aprobar las ${n}`,
          });
          if (!ok) return;
          run(() => approveGreen({ pieces }), {
            onOk: (r) => {
              if (!r.ok) return;
              toast.success(r.data!.n === 1 ? 'Aprobada.' : `Aprobadas ${r.data!.n}.`);
              if (r.data!.skipped) toast.info(`${r.data!.skipped} cambiaron mientras tanto: ábrelas para revisarlas.`);
            },
          });
        }}
      >
        <CheckCheck className="h-4 w-4" aria-hidden /> Aprobar {n === 1 ? 'la verde' : `las ${n}`}
      </Button>
    </>
  );
}
