'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import { Star } from 'lucide-react';
import { setRating } from '@/lib/actions/redes';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { receptivityLabel } from '@/lib/domain/redes';
import { cn } from '@/lib/cn';
import { useCard } from './card-context';

// «Receptividad del público (1 a 10)» (D-65): posts, reels and carousels only. Ten stars as one radio group («7 de
// 10»), moved with the arrows too, and «Quitar». 44 px each: two rows of five under 600 px (F9), one row from there.
// Redes and the boss rate; the others read it. It never counts as 0 when it was not rated.
export const RATING_LABEL = 'Receptividad del público (1 a 10)';
export const RATING_HELP = 'Cómo la recibió la gente en redes (comentarios, reacciones). No mide apoyo político.';

export function Rating({ first = false }: { first?: boolean }) {
  const { card, ctx, announce } = useCard();
  const { run, pending } = useAction();
  const [value, setValue] = useState<number | null>(card.rating);
  const [seen, setSeen] = useState(card.rating);
  if (seen !== card.rating) {
    // The server's value wins when it changes (another person rated it).
    setSeen(card.rating);
    setValue(card.rating);
  }
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const canEdit = ctx.perms.mark;
  const labelId = `pieza-${card.id}-rating-label`;

  const save = (r: number | null) => {
    setValue(r);
    void run(() => setRating({ pieceId: card.id, rating: r }), { onOk: () => announce(r ? `Receptividad: ${r} de 10` : 'Receptividad quitada') });
  };
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, n: number) => {
    const next = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? n + 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? n - 1 : e.key === 'Home' ? 1 : e.key === 'End' ? 10 : null;
    if (next === null) return;
    e.preventDefault();
    const to = Math.min(10, Math.max(1, next));
    refs.current[to - 1]?.focus();
    save(to);
  };
  // The one that takes the Tab: the chosen star, or the first.
  const tabStop = value ?? 1;

  const box = (
    <section aria-labelledby={labelId} className="flex min-w-0 flex-col gap-2 rounded-[var(--radius-control)] border border-border p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p id={labelId} className="text-sm font-semibold">
          {RATING_LABEL}
        </p>
        <p className="text-sm text-text-2">
          <span className="font-bold tabular text-text">{value ? `${value}/10` : '—'}</span> · {receptivityLabel(value)}
        </p>
      </div>
      <div role="radiogroup" aria-labelledby={labelId} className="grid w-fit grid-cols-5 gap-1 min-[600px]:grid-cols-10">
        {Array.from({ length: 10 }, (_, i) => {
          const n = i + 1;
          const on = value !== null && n <= value;
          return (
            <button
              key={n}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={value === n}
              aria-label={`${n} de 10`}
              tabIndex={n === tabStop ? 0 : -1}
              disabled={!canEdit || pending}
              onClick={() => save(n)}
              onKeyDown={(e) => onKey(e, n)}
              className="grid h-11 w-11 place-items-center rounded-[var(--radius-control)] hover:bg-surface-2 disabled:cursor-default disabled:hover:bg-transparent"
            >
              <Star className={cn('h-6 w-6', on ? 'fill-warn text-warn' : 'text-text-2')} aria-hidden />
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-text-2">{RATING_HELP}</p>
        {canEdit && value !== null ? (
          <Button type="button" variant="ghost" size="sm" className="min-h-11" disabled={pending} onClick={() => save(null)}>
            Quitar
          </Button>
        ) : null}
      </div>
    </section>
  );
  return first ? <div data-tour="rating">{box}</div> : box;
}
