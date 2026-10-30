'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type DragEvent, type ReactNode } from 'react';
import { Eraser } from 'lucide-react';
import { feedClear, feedPlace, feedSwap, movePieceToMonth } from '@/lib/actions/redes';
import { useAction } from '@/lib/hooks/use-action';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { FeedCell as Cell, PickerItem } from '@/lib/data/redes';
import { FEED_COLS, type Month } from '@/lib/domain/redes';
import { FeedCell, type CellDrag } from './feed-cell';
import { FeedPicker, type PickerData } from './feed-picker';
import { FeedCellMenu } from './feed-cell-menu';
import { FeedLive } from './feed-live';
import { FLASH_CLASSES, clearMonthText, feedCellId } from './feed-core';

// The feed of the month (R4, D-69, F11): 24 places, 3 columns × 8 rows, the #1 bottom right (the first to go out). An
// empty place opens «Elegir publicación»; a filled one, its menu (the way to move it with a finger or the keyboard);
// with a mouse, the cell opens its card, «⋯» its menu, and dragging a piece onto another place swaps them. After every
// move the focus goes to the place where the piece now is and the live line says it. «Vaciar este mes» asks first and
// deletes nothing. The database keeps one piece in one place and answers the truth when two people fill a place at
// once (feed_place); the page shows what it answers. A place named in the address (#espacio-7, from a card's «En
// Feed» chip) scrolls into view and flashes.
const FINE = '(hover: hover) and (pointer: fine)';

function subscribeFine(cb: () => void) {
  const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(FINE) : null;
  mq?.addEventListener('change', cb);
  return () => mq?.removeEventListener('change', cb);
}

function subscribeHash(cb: () => void) {
  window.addEventListener('hashchange', cb);
  window.addEventListener('popstate', cb);
  return () => {
    window.removeEventListener('hashchange', cb);
    window.removeEventListener('popstate', cb);
  };
}

/** A mouse or a trackpad (drag, link + «⋯»). False on the server and before the page knows: the finger's way works
 * for everyone. */
export function useFinePointer(): boolean {
  return useSyncExternalStore(subscribeFine, () => !!window.matchMedia?.(FINE).matches, () => false);
}

/** A place gets the focus (its button or its «⋯»), comes into view and flashes for a second (no flash and no smooth
 * scroll with reduced motion). Returns the flash's cleanup. */
function mark(el: HTMLElement, block: ScrollLogicalPosition): (() => void) | undefined {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ block, behavior: reduce ? 'auto' : 'smooth' });
  (el.querySelector<HTMLElement>('[data-cell-focus]') ?? el).focus({ preventScroll: true });
  if (reduce) return;
  el.classList.add(...FLASH_CLASSES);
  const t = setTimeout(() => el.classList.remove(...FLASH_CLASSES), 1100);
  return () => {
    clearTimeout(t);
    el.classList.remove(...FLASH_CLASSES);
  };
}

export type FeedGridProps = {
  monthId: string | null;
  monthLabel: string;
  months: Month[];
  cells: Cell[];
  filled: number;
  avg: number | null;
  picker: PickerData;
  profile: ReactNode; // the read-only profile header (a server component)
};

// Where the focus goes after an action: a place, holding that piece (or empty).
type Focus = { num: number; pieceId: string | null };

export function FeedGrid({ monthId, monthLabel, months, cells, filled, avg, picker, profile }: FeedGridProps) {
  const { run, pending } = useAction();
  const { confirm, dialog } = useConfirm();
  const fine = useFinePointer();
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash, () => '');
  const [said, setSaid] = useState('');
  const [pickNum, setPickNum] = useState<number | null>(null);
  const [menuPiece, setMenuPiece] = useState<string | null>(null);
  const [over, setOver] = useState<number | null>(null);
  // The focus waits for the page to show what the database answered; `tick` asks to look again after each action.
  const want = useRef<Focus | null>(null);
  const [tick, setTick] = useState(0);
  // The place of what is being worked on: where the focus goes back when a sheet closes.
  const lastNum = useRef<number | null>(null);
  const dragged = useRef<string | null>(null);

  const say = useCallback((t: string) => setSaid((s) => (s === t ? `${t}​` : t)), []);
  const menuOf = menuPiece ? (cells.find((c) => c.piece?.pieceId === menuPiece)?.piece ?? null) : null;

  // The refreshed grid arrives after the action's answer: the focus moves once the place shows it, never before.
  useEffect(() => {
    const f = want.current;
    if (!f) return;
    const el = document.getElementById(feedCellId(f.num));
    if (!el || (el.getAttribute('data-piece') ?? null) !== f.pieceId) return;
    want.current = null;
    return mark(el, 'nearest');
  }, [cells, tick, fine]);

  // A place named in the address (#espacio-7, the card's «En Feed» chip).
  const named = /^#espacio-(\d{1,2})$/.exec(hash)?.[1];
  useEffect(() => {
    const el = named ? document.getElementById(feedCellId(Number(named))) : null;
    return el ? mark(el, 'center') : undefined;
  }, [named]);

  const done = (message: string | undefined, next: Focus | null) => {
    if (message) say(message);
    if (!next) return;
    lastNum.current = next.num;
    want.current = next;
    setTick((t) => t + 1);
  };
  const openPicker = (num: number) => {
    lastNum.current = num;
    setPickNum(num);
  };
  const openMenu = (pieceId: string) => {
    lastNum.current = cells.find((c) => c.piece?.pieceId === pieceId)?.num ?? null;
    setMenuPiece(pieceId);
  };

  const choose = (item: PickerItem, allowMove: boolean) => {
    const num = pickNum;
    if (!monthId || num === null) return;
    void run(() => feedPlace({ monthId, num, pieceId: item.id, allowMove }), {
      onOk: (r) => {
        if (!r.ok) return;
        setPickNum(null);
        done(r.message, { num, pieceId: item.id });
      },
    });
  };

  const swap = (pieceId: string, num: number) =>
    void run(() => feedSwap({ pieceId, num }), {
      onOk: (r) => {
        if (r.ok) done(r.message, { num: r.data?.num ?? num, pieceId });
      },
    });

  const moveMonth = (pieceId: string, from: number, to: string) =>
    void run(() => movePieceToMonth({ pieceId, monthId: to }), {
      onOk: (r) => {
        if (!r.ok) return;
        setMenuPiece(null);
        done(r.message, { num: from, pieceId: null });
      },
    });

  const clearOne = (num: number) => {
    if (!monthId) return;
    void run(() => feedClear({ monthId, num }), {
      onOk: (r) => {
        if (!r.ok) return;
        setMenuPiece(null);
        done(r.message, { num, pieceId: null });
      },
    });
  };

  const clearMonth = async () => {
    if (!monthId) return;
    const yes = await confirm({ title: 'Vaciar este mes', body: clearMonthText(monthLabel, filled), confirmLabel: 'Vaciar este mes', tone: 'danger' });
    if (!yes) return;
    await run(() => feedClear({ monthId, num: null }), {
      onOk: (r) => {
        if (r.ok) done(r.message, null);
      },
    });
  };

  // Dragging with a mouse (fine pointer only): a piece dropped on another place swaps with what is there.
  const drag: CellDrag = {
    over,
    onDragStart: (e: DragEvent, pieceId: string) => {
      dragged.current = pieceId;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', pieceId);
    },
    onDragEnd: () => {
      dragged.current = null;
      setOver(null);
    },
    onDragOver: (e: DragEvent, num: number) => {
      if (!dragged.current) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (over !== num) setOver(num);
    },
    onDragLeave: (num: number) => setOver((o) => (o === num ? null : o)),
    onDrop: (e: DragEvent, num: number) => {
      e.preventDefault();
      const id = dragged.current;
      dragged.current = null;
      setOver(null);
      if (!id || cells.find((c) => c.num === num)?.piece?.pieceId === id) return;
      swap(id, num);
    },
  };

  // After the menu or the picker closes, the focus goes back to the place of what was being worked on.
  const refocus = () => {
    const num = lastNum.current;
    if (num === null) return;
    const el = document.getElementById(feedCellId(num));
    (el?.querySelector<HTMLElement>('[data-cell-focus]') ?? el)?.focus({ preventScroll: true });
  };

  return (
    <>
      {dialog}
      <div className="mb-3 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <FeedLive filled={filled} avg={avg} said={said} />
        <Button type="button" variant="secondary" data-tour="feed-clear-month" disabled={pending || !monthId || !filled} onClick={() => void clearMonth()} className="w-full shrink-0 sm:w-auto">
          <Eraser className="h-4 w-4" aria-hidden /> Vaciar este mes
        </Button>
      </div>
      <Card solid className="mx-auto w-full max-w-[540px] p-3 sm:p-4">
        {profile}
        <ol
          aria-label={`Feed de ${monthLabel || 'este mes'}: el #1, abajo a la derecha, es el primero que sale`}
          data-tour="feed-grid"
          className="grid gap-1 sm:gap-2"
          style={{ gridTemplateColumns: `repeat(${FEED_COLS}, minmax(0, 1fr))` }}
        >
          {cells.map((c) => (
            <FeedCell key={c.num} cell={c} monthId={monthId} fine={fine} busy={pending} onPick={openPicker} onMenu={openMenu} drag={drag} />
          ))}
        </ol>
      </Card>
      <FeedPicker
        open={pickNum !== null}
        onOpenChange={(o) => !o && setPickNum(null)}
        monthLabel={monthLabel}
        num={pickNum ?? 0}
        data={picker}
        busy={pending}
        onChoose={choose}
        onClosed={refocus}
      />
      <FeedCellMenu
        open={!!menuOf}
        onOpenChange={(o) => !o && setMenuPiece(null)}
        piece={menuOf}
        monthId={monthId}
        monthLabel={monthLabel}
        months={months}
        cells={cells}
        busy={pending}
        onSwap={(n) => menuOf && swap(menuOf.pieceId, n)}
        onMoveMonth={(to) => menuOf && moveMonth(menuOf.pieceId, menuOf.num, to)}
        onClear={clearOne}
        onClosed={refocus}
      />
    </>
  );
}
