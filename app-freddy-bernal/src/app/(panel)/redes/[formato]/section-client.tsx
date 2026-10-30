'use client';

import { useCallback, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { LayoutGrid, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useTransition } from 'react';
import { quickCreate } from '@/lib/actions/redes';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/field';
import { EmptyState } from '@/components/ui/page';
import { PieceCard } from '@/components/redes/card/piece-card';
import type { SectionCtx } from '@/components/redes/card/card-core';
import type { CardData, SectionSort } from '@/lib/data/redes';
import { DEMO_OTHER_SERVER_PIECE, FEED_FORMATS, FORMAT, sectionHref, type Format } from '@/lib/domain/redes';
import { cn } from '@/lib/cn';

// The cards of one section in one month (R4, D-60, D-70): «+ Nuevo reel» puts a draft on top, open, with its title
// ready to type, from the action's answer (no other address, F3), the order («A mano» with «Subir» / «Bajar» in each
// card's menu, the feed's order, newest, oldest), and the live line that says every move. The card the address names
// (#pieza-<id>: from the board, the feed, the search, the boss coming back from «Revisar») opens and takes the focus;
// in the demo, one kept on another server says so instead of nothing.
const NOUN: Record<Format, string> = { reel: 'reels', post: 'posts', carousel: 'carruseles', story: 'historias', youtube: 'videos de YouTube', month_end: 'piezas de fin de mes' };

export const SORT_LABEL: Record<SectionSort, string> = { manual: 'A mano', feed: 'Orden del feed', newest: 'Más recientes', oldest: 'Más antiguas' };

function subscribeHash(cb: () => void) {
  window.addEventListener('hashchange', cb);
  window.addEventListener('popstate', cb);
  return () => {
    window.removeEventListener('hashchange', cb);
    window.removeEventListener('popstate', cb);
  };
}

type Extra = { card: CardData; after: string | null };

export function SectionClient({ format, cards, ctx, sort }: { format: Format; cards: CardData[]; ctx: SectionCtx; sort: SectionSort }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [extra, setExtra] = useState<Extra[]>([]);
  const [gone, setGone] = useState<string[]>([]);
  const [fresh, setFresh] = useState<string | null>(null);
  const [live, setLive] = useState('');
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash, () => '');
  const f = FORMAT[format];
  const inFeed = (FEED_FORMATS as readonly Format[]).includes(format);

  // What the server sent, plus what was just created or duplicated here that it does not have yet (another demo
  // server, or the answer still on its way), minus what was deleted or moved away.
  const onServer = new Set(cards.map((c) => c.id));
  const list = cards.filter((c) => !gone.includes(c.id));
  for (const x of extra) {
    if (onServer.has(x.card.id) || gone.includes(x.card.id) || list.some((c) => c.id === x.card.id)) continue;
    const at = x.after ? list.findIndex((c) => c.id === x.after) : -1;
    if (at >= 0) list.splice(at + 1, 0, x.card);
    else list.unshift(x.card);
  }
  const named = hash.startsWith('#pieza-') ? hash.slice('#pieza-'.length) : null;
  const missing = ctx.demo && named && !list.some((c) => c.id === named) && !gone.includes(named);

  const announce = useCallback((text: string) => setLive((t) => (t === text ? `${text}​` : text)), []);
  const onGone = useCallback((id: string) => setGone((g) => [...g, id]), []);
  const onDuplicated = useCallback(
    (card: CardData, after: string) => {
      setExtra((x) => [...x, { card, after }]);
      setFresh(card.id);
      announce('Duplicada: la copia está debajo.');
    },
    [announce],
  );

  const create = () =>
    start(async () => {
      const r = await quickCreate({ format, monthId: ctx.monthId });
      if (!r.ok) return void toast.error(r.error);
      setExtra((x) => [...x, { card: r.data!.card, after: null }]);
      setFresh(r.data!.card.id);
      announce(r.message ?? 'Pieza creada');
      toast.success(r.message ?? 'Pieza creada');
    });

  const sortHref = (s: string) => {
    const base = sectionHref(f.slug, ctx.monthId);
    return s === 'manual' ? base : `${base}${base.includes('?') ? '&' : '?'}orden=${s}`;
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Button type="button" data-tour="new-piece" disabled={pending} onClick={create} className="w-full sm:w-auto">
          <Plus className="h-4 w-4" aria-hidden /> {f.newLabel}
        </Button>
        <div data-tour="section-sort" className="flex w-full min-w-0 items-center gap-2 sm:ml-auto sm:w-auto">
          <label htmlFor="redes-orden" className="shrink-0 text-sm font-semibold">
            Orden
          </label>
          <Select id="redes-orden" value={sort} onChange={(e) => router.push(sortHref(e.target.value))} className="min-w-0 flex-1 sm:w-56">
            {(['manual', ...(inFeed ? (['feed'] as const) : []), 'newest', 'oldest'] as SectionSort[]).map((s) => (
              <option key={s} value={s}>
                {SORT_LABEL[s]}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {live}
      </p>
      {missing ? (
        <p role="note" className="rounded-[var(--radius-control)] bg-info-soft px-3 py-2 text-[15px] text-text">
          {DEMO_OTHER_SERVER_PIECE}
        </p>
      ) : null}
      {list.length ? (
        <div className={cn('grid min-w-0 grid-cols-1 gap-4', format === 'story' && 'min-[600px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4')}>
          {list.map((c, i) => (
            <PieceCard
              key={c.id}
              card={c}
              ctx={ctx}
              first={i === 0}
              target={c.id === named || c.id === fresh}
              focusTitle={c.id === fresh}
              canUp={i > 0}
              canDown={i < list.length - 1}
              announce={announce}
              onGone={onGone}
              onDuplicated={onDuplicated}
            />
          ))}
        </div>
      ) : (
        <EmptyState icon={<LayoutGrid className="h-8 w-8" />} title={`Todavía no hay ${NOUN[format]} en ${ctx.monthLabel || 'este mes'}. Toca «${f.newLabel}» para empezar.`} />
      )}
    </div>
  );
}
