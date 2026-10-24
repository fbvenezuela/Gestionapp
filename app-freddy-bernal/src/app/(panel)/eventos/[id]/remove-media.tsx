'use client';

import { Trash2 } from 'lucide-react';
import { removeMedia } from '@/lib/actions/media';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';

// Admin only: takes out a file uploaded by mistake (it stays in the audit trail). The server
// refuses files that are part of an approved piece.
export function RemoveMedia({ id, label }: { id: string; label: string }) {
  const { run, pending } = useAction();
  const { confirm, dialog } = useConfirm();
  return (
    <>
      {dialog}
      <Button
        variant="ghost"
        size="sm"
        className="min-h-11 text-danger"
        disabled={pending}
        aria-label={`Quitar ${label}`}
        onClick={async () => {
          const ok = await confirm({
            title: `¿Quitar «${label}»?`,
            body: 'Deja de verse en el evento y en la biblioteca. Queda anotado en el registro de cambios.',
            confirmLabel: 'Quitar',
            tone: 'danger',
          });
          if (ok) run(() => removeMedia({ id }), { success: 'Archivo quitado.' });
        }}
      >
        <Trash2 className="h-4 w-4" aria-hidden /> Quitar
      </Button>
    </>
  );
}
