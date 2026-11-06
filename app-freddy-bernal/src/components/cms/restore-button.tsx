'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { restoreWebVersion } from '@/lib/actions/web';
import { ADMIN_WEB } from '@/lib/web/cms/kinds';

/** «Volver a esta versión»: it is copied into the draft as a new version; it reaches the web only after approval. */
export function RestoreButton({ id, version }: { id: string; version: number }) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [busy, setBusy] = useState(false);
  async function restore() {
    const ok = await confirm({
      title: `¿Volver a la versión ${version}?`,
      body: 'Se copia al borrador como una versión nueva (nada se pierde). Para que salga en la web hay que enviarla a aprobación y publicarla otra vez.',
      confirmLabel: 'Volver a esta versión',
    });
    if (!ok) return;
    setBusy(true);
    const r = await restoreWebVersion({ id, version });
    setBusy(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success(`Listo: el borrador es ahora la versión ${version} (como versión ${r.data?.draftVersion}).`);
    router.push(ADMIN_WEB.edit(id));
  }
  return (
    <>
      {dialog}
      <Button type="button" size="sm" variant="secondary" onClick={restore} disabled={busy}>
        <RotateCcw className="h-4 w-4" aria-hidden /> {busy ? 'Volviendo…' : 'Volver a esta versión'}
        <span className="sr-only"> {version}</span>
      </Button>
    </>
  );
}
