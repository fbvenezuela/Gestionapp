'use client';

import { useId, useState } from 'react';
import { ListPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/field';
import { cn } from '@/lib/cn';
import { useCard } from './card-context';
import { LockEdit, LockedText } from './lock-edit';
import { COPY_LIMITS, plainLength, withCtaAndHashtags } from './card-core';
import { fieldId } from './card-fields';
import type { Group } from './use-card-saver';

// The card's copy (D-61, §2.1 of the request): the long copy is the caption that goes out on Instagram, Facebook and
// TikTok; the medium (Threads) and the short (X) stay folded under «Threads y X». The three FAB / PAS / AIDA copies
// written at /piezas/[id]#copies fill the same three boxes (one source: `copies`). «Poner en el copy» brings the CTA
// and the hashtags in (that changes the copy, so on an approved piece it goes back to the boss like any copy). On an
// approved piece the copy is read-only until «Editar (vuelve al jefe)».
const GROUP_TEXT: Record<Group, { label: string; networks: string }> = {
  long: { label: 'Copy largo', networks: 'Instagram, Facebook y TikTok' },
  medium: { label: 'Copy medio', networks: 'Threads' },
  short: { label: 'Copy corto', networks: 'X' },
};

export const CAPTION_LABEL = 'Caption (copy largo: Instagram, Facebook y TikTok)';

type Counter = (g: Group, s: string) => number;

function CopyBox({ g, label, count = (_g, s) => plainLength(s) }: { g: Group; label: string; count?: Counter }) {
  const { card, saver } = useCard();
  const id = fieldId(card.id, `copy-${g}`);
  const value = saver.copies[g];
  const len = count(g, value);
  const over = len > COPY_LIMITS[g];
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-semibold text-text">
          {label}
        </label>
        <span className={cn('font-mono text-xs tabular', over ? 'font-bold text-danger' : 'text-text-2')}>
          {len}/{COPY_LIMITS[g]}
        </span>
      </div>
      <Textarea
        id={id}
        rows={g === 'long' ? 6 : 3}
        value={value}
        maxLength={5000}
        aria-invalid={over}
        className={cn('min-h-0', over && 'border-danger')}
        onChange={(e) => saver.setCopy(g, e.target.value)}
        onBlur={() => void saver.flush()}
      />
      {over ? <p className="text-sm text-danger">Se pasa por {len - COPY_LIMITS[g]} caracteres.</p> : null}
    </div>
  );
}

export function CaptionField({ label = CAPTION_LABEL, withCta = false }: { label?: string; withCta?: boolean }) {
  const { saver } = useCard();
  const more = useId();
  // X counts links and emojis its own way (twitter-text): loaded the first time «Threads y X» opens.
  const [count, setCount] = useState<Counter | undefined>(undefined);
  const exact = () => {
    if (count) return;
    void import('@/lib/domain/copies').then((m) => setCount(() => m.copyLength));
  };
  const { cta, hashtags } = saver.details;
  const canBring = withCta && (cta.trim() || hashtags.trim()) && withCtaAndHashtags(saver.copies.long, cta, hashtags) !== saver.copies.long.trimEnd();
  return (
    <LockEdit part="copies" label={label} view={<LockedText text={saver.copies.long} />}>
      <div className="flex min-w-0 flex-col gap-2">
        <CopyBox g="long" label={label} />
        {withCta ? (
          <Button
            type="button"
            variant="secondary"
            size="md"
            className="self-start"
            disabled={!canBring}
            onClick={() => saver.setCopy('long', withCtaAndHashtags(saver.copies.long, cta, hashtags))}
          >
            <ListPlus className="h-4 w-4" aria-hidden /> Poner en el copy
          </Button>
        ) : null}
        <details className="rounded-[var(--radius-control)] border border-border" onToggle={(e) => e.currentTarget.open && exact()}>
          <summary id={more} className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-semibold">
            Threads y X
          </summary>
          <div className="flex flex-col gap-3 border-t border-border p-3" aria-labelledby={more}>
            <CopyBox g="medium" label={`${GROUP_TEXT.medium.label} (${GROUP_TEXT.medium.networks})`} count={count} />
            <CopyBox g="short" label={`${GROUP_TEXT.short.label} (${GROUP_TEXT.short.networks})`} count={count} />
          </div>
        </details>
      </div>
    </LockEdit>
  );
}
