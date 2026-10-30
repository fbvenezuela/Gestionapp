'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { MediaThumb } from '@/components/media/media-thumb';
import type { PickerItem } from '@/lib/data/redes';
import { FEED_FORMATS, FORMAT } from '@/lib/domain/redes';
import { cn } from '@/lib/cn';
import { FeedSheet } from './feed-sheet';
import { PICKER_HINT, moveAsk, pickerTags, pickerTitle, titlesCount } from './feed-core';

// «Elegir publicación» (R4, D-69, A11): the sheet of an empty place. First the format (Posts, Reels, Carruseles, one
// group open at a time), then the title, each with its thumbnail or «Sin media», where it already is («Ya en Mes 1 ·
// #4») and whose month it is («De Mes 2»). A piece that already has a place is never in two: tapping it asks «¿La
// mueves a este espacio?» first.
type Group = (typeof FEED_FORMATS)[number];
export type PickerData = Record<Group, PickerItem[]>;

export function FeedPicker({
  open, onOpenChange, monthLabel, num, data, busy, onChoose, onClosed,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  monthLabel: string;
  num: number;
  data: PickerData;
  busy: boolean;
  onChoose: (item: PickerItem, allowMove: boolean) => void;
  onClosed: () => void;
}) {
  const [group, setGroup] = useState<Group | null>(null);
  const [asking, setAsking] = useState<PickerItem | null>(null);
  // Each time it opens for a place it starts again (closed groups, no question left from before).
  const [shownFor, setShownFor] = useState<number | null>(open ? num : null);
  const showing = open ? num : null;
  if (shownFor !== showing) {
    setShownFor(showing);
    setGroup(null);
    setAsking(null);
  }
  const here = { month: monthLabel, num };

  const change = (o: boolean) => {
    if (!o) {
      setAsking(null);
      setGroup(null);
    }
    onOpenChange(o);
  };

  const choose = (item: PickerItem) => {
    const t = pickerTags(item, here);
    if (t.some((x) => x.text === 'En este espacio')) return change(false);
    if (item.place) return setAsking(item);
    onChoose(item, false);
  };

  return (
    <FeedSheet open={open} onOpenChange={change} title={pickerTitle(monthLabel, num)} description={PICKER_HINT} onClosed={onClosed}>
      {asking && asking.place ? (
        <div role="group" aria-labelledby="feed-ask" className="flex flex-col gap-3">
          <p id="feed-ask" className="text-[15px] font-semibold">
            {moveAsk(asking.place.month, asking.place.num)}
          </p>
          <p className="text-sm text-text-2">«{asking.title}» deja su espacio de antes: nunca queda en dos.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" autoFocus disabled={busy} onClick={() => onChoose(asking, true)}>
              Sí, moverla aquí
            </Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => setAsking(null)}>
              Elegir otra
            </Button>
          </div>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {FEED_FORMATS.map((f) => {
            const items = data[f];
            const isOpen = group === f;
            return (
              <li key={f} className="rounded-[var(--radius-control)] border border-border">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={`feed-grupo-${f}`}
                  onClick={() => setGroup(isOpen ? null : f)}
                  className="flex min-h-14 w-full items-center justify-between gap-3 px-4 text-left hover:bg-surface-2"
                >
                  <span className="font-semibold">{FORMAT[f].plural}</span>
                  <span className="text-sm text-text-2">{titlesCount(items.length)}</span>
                </button>
                <div id={`feed-grupo-${f}`} hidden={!isOpen} className="border-t border-border p-2">
                  {items.length ? (
                    <ul className="flex flex-col gap-1">
                      {items.map((it) => {
                        const tags = pickerTags(it, here);
                        return (
                          <li key={it.id}>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => choose(it)}
                              className={cn('flex min-h-14 w-full min-w-0 items-center gap-3 rounded-[var(--radius-control)] px-2 py-1.5 text-left hover:bg-surface-2 disabled:opacity-60')}
                            >
                              <MediaThumb ids={it.thumbIds} className="h-11 w-11" />
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm text-text-2">{FORMAT[f].label}</span>
                                <span className="block font-semibold leading-snug [overflow-wrap:anywhere]">{it.title}</span>
                                {tags.length ? (
                                  <span className="mt-1 flex flex-wrap gap-1">
                                    {tags.map((t) => (
                                      <Chip key={t.text} tone={t.tone}>
                                        {t.text}
                                      </Chip>
                                    ))}
                                  </span>
                                ) : null}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="px-2 py-3 text-sm text-text-2">Todavía no hay piezas en este formato.</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </FeedSheet>
  );
}
