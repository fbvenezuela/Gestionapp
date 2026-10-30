'use client';

import { createContext, useContext } from 'react';
import type { CardData } from '@/lib/data/redes';
import type { ConfirmOptions } from '@/components/ui/confirm-dialog';
import type { CardSaver } from './use-card-saver';
import type { SectionCtx } from './card-core';

// What every part of one card shares: the card as the server sent it, its section and person, the saver of what is
// typed, the card's own confirmation dialog, whether «Editar (vuelve al jefe)» was already confirmed, and the live line
// of the section (moves and saves are said there too).
export type CardCtxValue = {
  card: CardData;
  ctx: SectionCtx;
  saver: CardSaver;
  confirm: (o: ConfirmOptions) => Promise<boolean>;
  unlocked: boolean;
  unlock: () => Promise<boolean>;
  announce: (text: string) => void;
};

export const CardContext = createContext<CardCtxValue | null>(null);

export function useCard(): CardCtxValue {
  const v = useContext(CardContext);
  if (!v) throw new Error('useCard: outside a PieceCard');
  return v;
}
