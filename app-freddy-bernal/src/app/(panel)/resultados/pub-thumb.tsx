'use client';

import { Film, Image as ImageIcon, Layers, MessageSquareText } from 'lucide-react';
import { MediaThumb } from '@/components/media/media-thumb';
import type { PubThumb as PubThumbData, PubIcon } from '@/lib/domain/thumb-source';
import { cn } from '@/lib/cn';

const ICON: Record<PubIcon, typeof Film> = { video: Film, image: ImageIcon, carousel: Layers, text: MessageSquareText };

// The small picture of a publication (Resultados, the boss's Digital): the files chosen by thumbSources, tried in
// order through /api/media/<id>/thumb, or the format's icon when none has a picture. Decorative: the title is
// always written next to it. 4:5, like a post in the feed.
export function PubThumb({ t, className }: { t: PubThumbData; className?: string }) {
  const Icon = ICON[t.icon];
  return (
    <MediaThumb
      ids={t.ids}
      className={cn('h-20 w-16', className)}
      fallback={<Icon data-thumb-icon={t.icon} className="h-6 w-6 text-text-2" aria-hidden />}
    />
  );
}
