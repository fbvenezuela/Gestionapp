'use client';

import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { OutgoingPart } from '@/lib/domain/redes';
import { useCard } from './card-context';
import { LOCK_BUTTON, isLocked } from './card-core';

// What goes out of an approved piece (OUTGOING: the copies, a reel's or YouTube's title, the files, the slides, a
// story's on-screen text and sticker) is read here with «Editar (vuelve al jefe)» (F7, D-61): it asks once («Si lo
// cambias, la pieza vuelve al jefe para aprobar.») and then the field opens and saves on its own, with no dialog while
// typing. Anything else on the card is never locked: script and planning do not go back to the boss.
export function LockEdit({ part, label, view, children }: { part: OutgoingPart; label: string; view: ReactNode; children: ReactNode }) {
  const { card, ctx, unlocked, unlock } = useCard();
  if (unlocked || !isLocked(card.status, ctx.format, part)) return <>{children}</>;
  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-border bg-surface-2 p-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-text">
        <Lock className="h-4 w-4 text-text-2" aria-hidden /> {label}
      </p>
      <div className="min-w-0 text-[15px]">{view}</div>
      <p className="text-sm text-text-2">Ya lo aprobó el jefe: esto es lo que sale.</p>
      <Button type="button" variant="secondary" size="md" className="self-start" onClick={() => void unlock()}>
        {LOCK_BUTTON}
      </Button>
    </div>
  );
}

/** A locked text as it reads: what is written, or «Vacío». */
export function LockedText({ text }: { text: string }) {
  return text.trim() ? <p className="whitespace-pre-wrap break-words">{text}</p> : <p className="text-text-2">Vacío</p>;
}
