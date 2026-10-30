'use client';

import type { DragEvent } from 'react';
import Link from 'next/link';
import { Check, Film, GalleryHorizontal, Image as ImageIcon, ImagePlus, MoreHorizontal, Star } from 'lucide-react';
import { MediaThumb } from '@/components/media/media-thumb';
import type { FeedCell as Cell } from '@/lib/data/redes';
import { FORMAT, sectionHref, type Format } from '@/lib/domain/redes';
import { cn } from '@/lib/cn';
import { cellPieceName, feedCellId, optionsLabel } from './feed-core';

// One place of the feed (R4, D-69, F11), 4:5. Empty: «Elegir publicación · Espacio #NN» opens the picker. Filled: the
// piece's current cover (it changes on its own when a new one is uploaded), «#7» on the top right, the format's icon,
// «★ 7» at the bottom and, once published, a green frame with «✓ Publicado» (only ✓ on the phone, with its words for
// screen readers). Without a picture, its title on the brand's soft tone. With a mouse (fine pointer) the cell is a link
// to its card and a visible «⋯» opens its menu, and it can be dragged onto another place; with a finger the whole cell
// opens the menu. `data-cell-focus` is what gets the focus after a move.
const ICON: Record<Format, typeof Film> = { reel: Film, post: ImageIcon, carousel: GalleryHorizontal, story: Film, youtube: Film, month_end: GalleryHorizontal };

export type CellDrag = {
  onDragStart: (e: DragEvent, pieceId: string) => void;
  onDragEnd: () => void;
  onDragOver: (e: DragEvent, num: number) => void;
  onDragLeave: (num: number) => void;
  onDrop: (e: DragEvent, num: number) => void;
  over: number | null;
};

export function FeedCell({
  cell, monthId, fine, onPick, onMenu, drag, busy,
}: {
  cell: Cell;
  monthId: string | null;
  fine: boolean; // a mouse: link + «⋯» + drag; otherwise (finger, or before the page knows) the cell is a button
  onPick: (num: number) => void;
  onMenu: (pieceId: string) => void;
  drag: CellDrag;
  busy: boolean;
}) {
  const { num, piece } = cell;
  // The flash of a place someone jumped to or a piece just moved to is put on by the grid (FLASH_CLASSES).
  const box = cn(
    'relative aspect-[4/5] min-w-0 overflow-hidden rounded-[var(--radius-control)] scroll-mt-24 [&_img]:pointer-events-none',
    drag.over === num && 'outline outline-4 outline-offset-2 outline-info',
  );
  const dropProps = fine
    ? { onDragOver: (e: DragEvent) => drag.onDragOver(e, num), onDragLeave: () => drag.onDragLeave(num), onDrop: (e: DragEvent) => drag.onDrop(e, num) }
    : {};

  if (!piece) {
    return (
      <li id={feedCellId(num)} data-num={num} className={box} {...dropProps}>
        <button
          type="button"
          data-cell-focus=""
          disabled={busy}
          onClick={() => onPick(num)}
          className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-[var(--radius-control)] border border-dashed border-border bg-surface-2 p-1 text-center text-text-2 hover:border-accent hover:text-text disabled:opacity-60"
        >
          <ImagePlus className="h-5 w-5" aria-hidden />
          <span className="sr-only text-sm font-semibold sm:not-sr-only">Elegir publicación</span>
          <span className="sr-only"> · </span>
          <span className="text-xs font-semibold tabular">
            <span className="sr-only sm:not-sr-only">Espacio </span>#{String(num).padStart(2, '0')}
          </span>
        </button>
      </li>
    );
  }

  const Icon = ICON[piece.format];
  const visual = (
    <>
      <MediaThumb
        ids={piece.thumbIds}
        className="h-full w-full rounded-none [-webkit-touch-callout:none]"
        fallback={<span className="grid h-full w-full place-items-center bg-accent-soft p-2 text-center text-xs font-semibold leading-snug text-text [overflow-wrap:anywhere] sm:text-sm">{piece.title}</span>}
      />
      <span aria-hidden className="absolute right-1 top-1 rounded-full bg-slate px-2 py-0.5 text-xs font-bold tabular text-on-slate">
        #{num}
      </span>
      <span aria-hidden className="absolute left-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-surface text-text">
        <Icon className="h-3.5 w-3.5" />
      </span>
      {piece.rating ? (
        <span aria-hidden className="absolute bottom-1 left-1 inline-flex items-center gap-0.5 rounded-full bg-surface px-1.5 py-0.5 text-xs font-semibold tabular text-text">
          <Star className="h-3 w-3" /> {piece.rating}
        </span>
      ) : null}
      {piece.published ? (
        <span aria-hidden className="absolute inset-x-1 bottom-7 mx-auto flex w-fit items-center gap-1 rounded-full bg-ok-soft px-2 py-0.5 text-xs font-bold text-ok sm:bottom-8">
          <Check className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Publicado</span>
        </span>
      ) : null}
    </>
  );
  const name = cellPieceName(piece);
  return (
    <li
      id={feedCellId(num)}
      data-num={num}
      data-piece={piece.pieceId}
      className={cn(box, piece.published && 'ring-4 ring-ok', fine && 'cursor-grab')}
      draggable={fine && !busy}
      onDragStart={fine ? (e) => drag.onDragStart(e, piece.pieceId) : undefined}
      onDragEnd={fine ? drag.onDragEnd : undefined}
      {...dropProps}
    >
      {fine ? (
        <>
          <Link href={sectionHref(FORMAT[piece.format].slug, monthId, piece.pieceId)} aria-label={`${name}: abrir la tarjeta`} draggable={false} className="block h-full w-full">
            {visual}
          </Link>
          <button
            type="button"
            data-cell-focus=""
            aria-label={optionsLabel(num)}
            aria-haspopup="dialog"
            onClick={() => onMenu(piece.pieceId)}
            className="absolute bottom-1 right-1 grid h-11 w-11 place-items-center rounded-full bg-surface text-text shadow-sm hover:bg-surface-2"
          >
            <MoreHorizontal className="h-5 w-5" aria-hidden />
          </button>
        </>
      ) : (
        <button type="button" data-cell-focus="" aria-haspopup="dialog" aria-label={`${name}. Opciones`} onClick={() => onMenu(piece.pieceId)} className="block h-full w-full text-left">
          {visual}
        </button>
      )}
    </li>
  );
}
