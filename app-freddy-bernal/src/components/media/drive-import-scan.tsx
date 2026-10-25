'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { scanDriveImports } from '@/lib/actions/drive';
import { importSummary } from '@/lib/media/drive-picker-core';
import { Button } from '@/components/ui/button';
import { probeAdded, type PickedAsset } from './drive-picker';

// «Traer lo nuevo de Drive» (Administración): registers what the import script uploaded to the
// «Importado» folder, a batch at a time, until nothing new is left.
const MAX_ROUNDS = 100;

export function DriveImportScan() {
  const router = useRouter();
  const [progress, setProgress] = useState<string | null>(null);
  return (
    <Button
      type="button"
      variant="secondary"
      disabled={progress !== null}
      className="w-full sm:w-auto"
      onClick={async () => {
        setProgress('Revisando la carpeta «Importado»…');
        let added = 0;
        let failed = 0;
        let error: string | null = null;
        const items: PickedAsset[] = [];
        try {
          for (let round = 0; round < MAX_ROUNDS; round++) {
            const r = await scanDriveImports({});
            if (!r.ok || !r.data) {
              error ??= r.ok ? null : r.error;
              if (!added && !failed) failed = 1;
              break;
            }
            added += r.data.added;
            failed += r.data.failed;
            error ??= r.data.error;
            items.push(...r.data.items);
            // Stop when nothing is left, or when what is left keeps failing.
            if (!r.data.left || !r.data.added) break;
            setProgress(`Agregados ${added}; faltan ${r.data.left}…`);
          }
        } catch {
          error ??= 'No se pudo revisar Drive. Revisa la señal y vuelve a intentar.';
          if (!added) failed = Math.max(failed, 1);
        }
        setProgress(null);
        const sum = importSummary({ added, failed, error });
        if (sum.ok) toast.success(sum.text);
        else toast.error(sum.text);
        router.refresh();
        await probeAdded(items);
      }}
    >
      <RefreshCw className="h-4 w-4" aria-hidden /> {progress ?? 'Traer lo nuevo de Drive'}
    </Button>
  );
}
