'use client';

import { useState } from 'react';
import { Film, Image as ImageIcon, Music, FileText } from 'lucide-react';
import { cn } from '@/lib/cn';

// Small picture of a file kept in Google Drive, always through the platform
// (/api/media/<id>/thumb checks permissions first; never a Google link). When Drive has none yet
// (a video just uploaded takes a while), the type icon shows instead.
// Decorative: the file's name is always written next to it.
export function DriveThumb({ id, mime, className }: { id: string; mime: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const Icon = mime.startsWith('image/') ? ImageIcon : mime.startsWith('audio/') ? Music : mime.startsWith('video/') ? Film : FileText;
  return (
    <span className={cn('relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-[var(--radius-control)] bg-surface-2', className)}>
      {failed ? (
        <Icon className="h-5 w-5 text-text-2" aria-hidden />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/media/${id}/thumb`} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" onError={() => setFailed(true)} />
      )}
    </span>
  );
}
