'use client';

import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { downloadDriveFile, type DriveFileRef } from './drive-download';

// Downloads every file of an event, one after another (browsers allow this after a tap).
// Files kept in Google Drive (`drive`) go in pieces that survive a dropped signal.
export function DownloadAll({ ids, label = 'Descargar todo', drive = [] }: { ids: string[]; label?: string; drive?: DriveFileRef[] }) {
  if (!ids.length) return null;
  return (
    <Button
      variant="secondary"
      onClick={async () => {
        for (const [n, id] of ids.entries()) {
          const d = drive.find((f) => f.id === id);
          if (d) {
            await downloadDriveFile(d, ids.length > 1 ? `${n + 1} de ${ids.length} · ` : '');
            continue;
          }
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
