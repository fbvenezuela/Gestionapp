'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FileText, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ADMIN_WEB } from '@/lib/web/cms/kinds';
import { UploadForm } from './upload-form';

/** The library's «Subir»: a photo or a PDF, then its own page (to see where it is used, or fix its words). */
export function LibraryUpload() {
  const router = useRouter();
  const [kind, setKind] = useState<'image' | 'document' | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Qué subir">
        <Button type="button" variant={kind === 'image' ? 'slate' : 'secondary'} aria-pressed={kind === 'image'} onClick={() => setKind(kind === 'image' ? null : 'image')}>
          <ImageIcon className="h-4 w-4" aria-hidden /> Subir una foto
        </Button>
        <Button type="button" variant={kind === 'document' ? 'slate' : 'secondary'} aria-pressed={kind === 'document'} onClick={() => setKind(kind === 'document' ? null : 'document')}>
          <FileText className="h-4 w-4" aria-hidden /> Subir un PDF
        </Button>
      </div>
      {kind ? (
        <UploadForm
          key={kind}
          kind={kind}
          onUploaded={(m) => {
            toast.success(kind === 'image' ? 'Foto subida a la biblioteca.' : 'PDF subido a la biblioteca.');
            setKind(null);
            router.push(ADMIN_WEB.mediaItem(m.id));
          }}
        />
      ) : null}
    </div>
  );
}
