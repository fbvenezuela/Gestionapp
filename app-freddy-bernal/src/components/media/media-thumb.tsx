'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Film, Image as ImageIcon, Music, FileText } from 'lucide-react';
import { cn } from '@/lib/cn';

// Small picture of a file, whatever its storage, always through the platform (/api/media/<id>/thumb checks
// permissions first; never a storage or Google link). `ids`: the files that could show it, tried in order (for a
// publication: its cover, the approved image, the screenshot...); when none has a picture, `fallback` or the type
// icon shows. Decorative: the file's name is always written next to it.
export function MediaThumb({
  ids, mime = '', className, fallback,
}: { ids: readonly (string | null | undefined)[]; mime?: string; className?: string; fallback?: ReactNode }) {
  const list = ids.filter((x): x is string => !!x);
  const key = list.join(',');
  // How many failed for THIS list (a new list starts again from the first).
  const [failed, setFailed] = useState<{ key: string; n: number }>({ key, n: 0 });
  const n = failed.key === key ? failed.n : 0;
  const id = list[n];
  const img = useRef<HTMLImageElement>(null);
  // A picture that failed before the page came alive (server-rendered, then hydrated) never reaches onError:
  // check it once mounted, so a file without a thumbnail shows its icon and never a broken picture.
  useEffect(() => {
    const el = img.current;
    if (el && el.complete && el.naturalWidth === 0) setFailed({ key, n: n + 1 });
  }, [key, n, id]);
  const Icon = mime.startsWith('image/') ? ImageIcon : mime.startsWith('audio/') ? Music : mime.startsWith('video/') ? Film : FileText;
  return (
    <span className={cn('relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-[var(--radius-control)] bg-surface-2', className)}>
      {id ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={img}
          key={id}
          src={`/api/media/${id}/thumb`}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          onError={() => setFailed({ key, n: n + 1 })}
        />
      ) : (
        fallback ?? <Icon className="h-5 w-5 text-text-2" aria-hidden />
      )}
    </span>
  );
}
