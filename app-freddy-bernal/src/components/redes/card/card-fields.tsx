'use client';

import type { ReactNode } from 'react';
import { addVersion } from '@/lib/actions/pieces';
import { useAction } from '@/lib/hooks/use-action';
import { Input, Textarea } from '@/components/ui/field';
import type { OutgoingPart } from '@/lib/domain/redes';
import { useCard } from './card-context';
import { isLocked } from './card-core';
import type { DetailKey } from './use-card-saver';

// The free text fields of a card (piece_details), with the database's limits: each one saves on its own 1,2 s after
// the last key (use-card-saver.ts). Labels and hints are the exact ones of D-61.
export const DETAIL_MAX: Record<Exclude<DetailKey, 'sticker' | 'post_ratio' | 'reference_asset_id'>, number> = {
  art_overline: 200, art_headline: 200, art_seals: 300, art_fine_print: 600, visual_concept: 2000, hook: 300, cta: 300,
  hashtags: 500, publication_notes: 2000, on_screen: 500, follow_up: 1000, sticker_text: 300, idea: 2000, links: 2000,
  sticker_url: 500,
};
type TextKey = keyof typeof DETAIL_MAX;

export function fieldId(pieceId: string, key: string) {
  return `pieza-${pieceId}-${key}`;
}

export function CardText({
  k, label, hint, rows = 0, placeholder, inputMode, type,
}: { k: TextKey; label: ReactNode; hint?: ReactNode; rows?: number; placeholder?: string; inputMode?: 'url' | 'text'; type?: 'url' | 'text' }) {
  const { card, saver } = useCard();
  const id = fieldId(card.id, k);
  const value = saver.details[k] ?? '';
  const common = {
    id,
    value,
    maxLength: DETAIL_MAX[k],
    placeholder,
    'aria-describedby': hint ? `${id}-hint` : undefined,
    onBlur: () => void saver.flush(),
  };
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-text">
        {label}
      </label>
      {rows > 0 ? (
        <Textarea {...common} rows={rows} className="min-h-0" onChange={(e) => saver.setField(k, e.target.value)} />
      ) : (
        <Input {...common} type={type ?? 'text'} inputMode={inputMode} onChange={(e) => saver.setField(k, e.target.value)} />
      )}
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-text-2">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** A group of fields with its small title («Texto del arte»). */
export function FieldGroup({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-3 rounded-[var(--radius-control)] border border-border p-3">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      {hint ? <p className="-mt-1 text-sm text-text-2">{hint}</p> : null}
      {children}
    </fieldset>
  );
}

/** A new file of the piece is its next version (as at /piezas/[id]): the file itself, or its cover (D-61). An approved
 * piece goes back to the boss (the database does it); on screen that is behind «Editar (vuelve al jefe)». */
export function useVersion() {
  const { card } = useCard();
  const { run } = useAction();
  return {
    media: (id: string, success: string) => run(() => addVersion({ pieceId: card.id, mediaId: id, coverId: null }), { success }),
    cover: (id: string, success: string) => run(() => addVersion({ pieceId: card.id, mediaId: null, coverId: id, notes: 'Portada nueva' }), { success }),
  };
}

/** Whether this outgoing part is read-only now (an approved piece, «Editar (vuelve al jefe)» not confirmed yet). */
export function useLocked(part: OutgoingPart): boolean {
  const { card, ctx, unlocked } = useCard();
  return !unlocked && isLocked(card.status, ctx.format, part);
}
