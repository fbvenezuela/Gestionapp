'use client';

import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Downloads every file of an event, one after another (browsers allow this after a tap).
export function DownloadAll({ ids, label = 'Descargar todo' }: { ids: string[]; label?: string }) {
  if (!ids.length) return null;
  return (
    <Button
      variant="secondary"
      onClick={async () => {
        for (const id of ids) {
          const a = document.createElement('a');
          a.href = `/api/media/${id}`;
          a.download = '';
          document.body.appendChild(a);
          a.click();
          a.remove();
          await new Promise((r) => setTimeout(r, 800));
        }
      }}
    >
      <Download className="h-4 w-4" aria-hidden /> {label} ({ids.length})
    </Button>
  );
}
