'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowDownRight, ArrowUpLeft, CalendarRange, ExternalLink, Hash, X } from 'lucide-react';
import type { FeedCell, FeedPiece } from '@/lib/data/redes';
import { FEED_SIZE, FORMAT, sectionHref, type Month } from '@/lib/domain/redes';
import { cn } from '@/lib/cn';
import { FeedSheet } from './feed-sheet';
import { afterLabel, beforeLabel, canAfter, canBefore } from './feed-core';

// The menu of a filled place (R4, D-69, F11): «Abrir la tarjeta», «Publicar antes (#6)», «Publicar después (#8)»,
// «Cambiar de espacio» (the 24 numbers, the taken ones marked), «Mover a otro mes» and «Quitar del feed». It works
// without a mouse (finger and keyboard: the alternative to dragging) and it stays open on the piece after a move, so
// one can keep moving it; the focus goes to the cell where the piece now is and the live line says where. Nothing here
// deletes a piece.
const item =
  'flex min-h-12 w-full items-center gap-3 rounded-[var(--radius-control)] border border-border bg-surface px-3 text-left text-[15px] font-semibold hover:bg-surface-2 disabled:opacity-50';

export function FeedCellMenu({
  open, onOpenChange, piece, monthId, monthLabel, months, cells, busy, onSwap, onMoveMonth, onClear, onClosed,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  piece: FeedPiece | null; // where it is now (the menu follows it after a move)
  monthId: string | null;
  monthLabel: string;
  months: Month[];
  cells: FeedCell[];
  busy: boolean;
  onSwap: (num: number) => void;
  onMoveMonth: (monthId: string, label: string) => void;
  onClear: (num: number) => void;
  onClosed: () => void;
}) {
  const [panel, setPanel] = useState<'none' | 'place' | 'month'>('none');
  // Opened for another piece: its panels start closed (after a move it is the same piece, and they stay as they were).
  const showing = open && piece ? piece.pieceId : null;
  const [shownFor, setShownFor] = useState<string | null>(showing);
  if (shownFor !== showing) {
    setShownFor(showing);
    setPanel('none');
  }
  const change = (o: boolean) => {
    if (!o) setPanel('none');
    onOpenChange(o);
  };
  const num = piece?.num ?? 0;
  const byNum = new Map(cells.map((c) => [c.num, c.piece]));
  const others = months.filter((m) => m.id !== monthId);
  return (
    <FeedSheet
      open={open && !!piece}
      onOpenChange={change}
      modal={false}
      title={piece ? `${monthLabel} · #${num}` : monthLabel}
      description={piece ? `${FORMAT[piece.format].label} · «${piece.title}»` : undefined}
      onClosed={onClosed}
    >
      {piece ? (
        <div className="flex flex-col gap-2">
          <Link href={sectionHref(FORMAT[piece.format].slug, monthId, piece.pieceId)} className={item}>
            <ExternalLink className="h-5 w-5 shrink-0" aria-hidden /> Abrir la tarjeta
          </Link>
          <button type="button" className={item} disabled={busy || !canBefore(num)} onClick={() => onSwap(num - 1)}>
            <ArrowDownRight className="h-5 w-5 shrink-0" aria-hidden /> {canBefore(num) ? beforeLabel(num) : 'Publicar antes (ya es la primera)'}
          </button>
          <button type="button" className={item} disabled={busy || !canAfter(num)} onClick={() => onSwap(num + 1)}>
            <ArrowUpLeft className="h-5 w-5 shrink-0" aria-hidden /> {canAfter(num) ? afterLabel(num) : 'Publicar después (ya es la última)'}
          </button>
          <button type="button" className={item} aria-expanded={panel === 'place'} aria-controls="feed-cambiar" onClick={() => setPanel(panel === 'place' ? 'none' : 'place')}>
            <Hash className="h-5 w-5 shrink-0" aria-hidden /> Cambiar de espacio
          </button>
          <div id="feed-cambiar" hidden={panel !== 'place'} className="rounded-[var(--radius-control)] border border-border p-2">
            <p className="mb-2 text-sm text-text-2">El #1 es el primero que sale. Si el espacio está ocupado, las dos piezas cambian de lugar.</p>
            <ul className="grid grid-cols-6 gap-1">
              {Array.from({ length: FEED_SIZE }, (_, i) => i + 1).map((n) => {
                const there = byNum.get(n);
                const mine = n === num;
                return (
                  <li key={n}>
                    <button
                      type="button"
                      disabled={busy || mine}
                      aria-current={mine ? 'true' : undefined}
                      aria-label={mine ? `#${n}: está aquí` : there ? `#${n}: ocupado por «${there.title}»` : `#${n}: libre`}
                      onClick={() => onSwap(n)}
                      className={cn(
                        'grid h-11 w-full place-items-center rounded-[var(--radius-control)] text-sm font-bold tabular disabled:opacity-100',
                        mine ? 'bg-slate text-on-slate' : there ? 'bg-accent-soft text-accent-ink hover:ring-2 hover:ring-accent' : 'border border-dashed border-border bg-surface text-text hover:bg-surface-2',
                      )}
                    >
                      {n}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          <button type="button" className={item} aria-expanded={panel === 'month'} aria-controls="feed-mover" disabled={!others.length} onClick={() => setPanel(panel === 'month' ? 'none' : 'month')}>
            <CalendarRange className="h-5 w-5 shrink-0" aria-hidden /> Mover a otro mes
          </button>
          <div id="feed-mover" hidden={panel !== 'month'} className="rounded-[var(--radius-control)] border border-border p-2">
            <p className="mb-2 text-sm text-text-2">La pieza pasa a ese mes y toma el primer espacio libre de su feed; si está lleno, queda «Sin programar».</p>
            <ul className="flex flex-col gap-1">
              {others.map((m) => (
                <li key={m.id}>
                  <button type="button" disabled={busy} onClick={() => onMoveMonth(m.id, m.label)} className={item}>
                    {m.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <button type="button" className={cn(item, 'text-danger')} disabled={busy} onClick={() => onClear(num)}>
            <X className="h-5 w-5 shrink-0" aria-hidden /> Quitar del feed
          </button>
          <p className="text-sm text-text-2">Quitarla del feed no la borra: sigue en su sección, «Sin programar».</p>
        </div>
      ) : null}
    </FeedSheet>
  );
}
