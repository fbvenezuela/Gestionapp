'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PieceCard } from '@/components/redes/card/piece-card';
import type { SectionCtx } from '@/components/redes/card/card-core';
import type { CardData } from '@/lib/data/redes';
import type { Level } from '@/lib/domain/review';
import { SendToReview } from './piece-client';

// The piece in big (R4, D-60, WP-C2): the same card as in its section (header, notices, the format's fields, design,
// receptivity and the review row), never folded at first, with the page's «Enviar a aprobación» and its «Nivel de
// aprobación» in the review row. The copies are written below in «Copies» (#copies). Deleted by the boss, it is gone:
// back to its section; moved to another month, it stays here with its new month.
export const DELETED = 'Pieza eliminada';

export function PieceBig({ card, ctx, sectionHref, level, sentBefore }: {
  card: CardData; ctx: Omit<SectionCtx, 'page'>; sectionHref: string; level: Level; sentBefore: boolean;
}) {
  const router = useRouter();
  const last = useRef('');
  const [live, setLive] = useState('');
  const announce = useCallback((text: string) => {
    last.current = text;
    setLive((t) => (t === text ? `${text}​` : text));
  }, []);
  const onGone = useCallback(() => {
    // Its section without the card's anchor (#pieza-<id> of a deleted piece would read as another server's, F3).
    if (last.current === DELETED) router.push(sectionHref.split('#')[0]);
    else router.refresh();
  }, [router, sectionHref]);
  const send = <SendToReview pieceId={card.id} level={level} locked={sentBefore} blockers={card.blockers} describedBy={`pieza-${card.id}-blockers`} />;
  return (
    <>
      <p role="status" aria-live="polite" className="sr-only">
        {live}
      </p>
      <PieceCard
        card={card}
        ctx={{ ...ctx, page: { send } }}
        first
        target={false}
        canUp={false}
        canDown={false}
        announce={announce}
        onGone={onGone}
        onDuplicated={(copy) => router.push(`/piezas/${copy.id}`)}
      />
    </>
  );
}
