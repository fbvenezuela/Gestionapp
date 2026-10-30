'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, CalendarDays, CalendarRange, ChevronDown, Copy, ExternalLink, LayoutGrid, MoreHorizontal, Trash2 } from 'lucide-react';
import { duplicatePiece, removePiece, reorderPiece, setPillar } from '@/lib/actions/redes';
import { useAction } from '@/lib/hooks/use-action';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { menuPanelClass } from '@/components/ui/menu-panel';
import { MenuDetails } from '@/components/shell/menu-details';
import { MediaThumb } from '@/components/media/media-thumb';
import { deviceStore, notifyDevice, readKey, subscribeDevice, writeKey } from '@/components/ui/device-store';
import { DEMO_OTHER_SERVER_THUMB, FEED_FORMATS, FORMAT, feedChip, pieceAnchor, type Format } from '@/lib/domain/redes';
import type { CardData } from '@/lib/data/redes';
import { cn } from '@/lib/cn';
import { CardContext, useCard, type CardCtxValue } from './card-context';
import { LOCK_CONFIRM, PHONE_QUERY, feedCellHref, foldKey, numberChip, type SectionCtx } from './card-core';
import { useCardSaver } from './use-card-saver';
import { useLocked } from './card-fields';
import { NoticeBand } from './notice-band';
import { DesignChecks } from './design-checks';
import { Rating } from './rating';
import { ReviewRow } from './review-row';
import { MoveMonthDialog } from './move-month-dialog';
import { FieldsReel } from './fields-reel';
import { FieldsPost } from './fields-post';
import { FieldsCarousel } from './fields-carousel';
import { FieldsStory } from './fields-story';
import { FieldsYoutube } from './fields-youtube';
import { FieldsMonthEnd } from './fields-month-end';

// One piece as a card of its section (R4, D-61, D-62, D-70, §5.2): the same header in the six formats (its 44 px
// thumbnail, which stays visible folded; «Reel #7» or «Reel · Sin programar»; the title, edited in place; the state
// chip; the day it was made, never an hour; the pillar; «En Feed · Mes 1 #7» that jumps to its cell), «Plegar» and
// the «⋯» menu; then the band of notices, the format's fields, the design marks, the receptivity and the review row.
// Everything typed saves on its own. On the phone cards start folded except the first one of the section (so the
// tutorials always find it); the card someone jumps to (#pieza-<id>) opens, scrolls into view, takes the focus and
// flashes for a second (no flash with reduced motion).
const FIELDS: Record<Format, () => React.JSX.Element> = {
  reel: FieldsReel,
  post: FieldsPost,
  carousel: FieldsCarousel,
  story: FieldsStory,
  youtube: FieldsYoutube,
  month_end: FieldsMonthEnd,
};

const PILLAR_TONE: Record<string, string> = {
  neutral: 'bg-surface-2 text-text-2',
  info: 'bg-info-soft text-info',
  accent: 'bg-accent-soft text-accent-ink',
  ok: 'bg-ok-soft text-ok',
};

function subscribeFold(cb: () => void) {
  const off = subscribeDevice(cb);
  const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(PHONE_QUERY) : null;
  mq?.addEventListener('change', cb);
  return () => {
    off();
    mq?.removeEventListener('change', cb);
  };
}

/** Folded or not, as this phone remembers it for this person; null on the server (the CSS decides: folded on a phone
 * except the first card). */
function useFolded(userId: string, pieceId: string, first: boolean): boolean | null {
  const key = foldKey(userId, pieceId);
  const snap = useSyncExternalStore(
    subscribeFold,
    () => `${readKey(deviceStore(), key) ?? ''}|${typeof window !== 'undefined' && window.matchMedia?.(PHONE_QUERY).matches ? 1 : 0}`,
    () => null,
  );
  if (snap === null) return null;
  const [stored, phone] = snap.split('|');
  if (stored === '1') return true;
  if (stored === '0') return false;
  return phone === '1' && !first;
}

export type PieceCardProps = {
  card: CardData;
  ctx: SectionCtx;
  first: boolean;
  target: boolean; // the address names it (#pieza-<id>) or it was just created here
  focusTitle?: boolean; // just created: the title is ready to type
  canUp: boolean;
  canDown: boolean;
  announce: (text: string) => void;
  onGone: (id: string) => void; // deleted or moved to another month: it leaves this list
  onDuplicated: (card: CardData, after: string) => void;
};

export function PieceCard(props: PieceCardProps) {
  const { card, ctx, announce } = props;
  const saver = useCardSaver(card, ctx.userId);
  const { confirm, dialog } = useConfirm();
  const [unlocked, setUnlocked] = useState(false);
  const unlock = useCallback(async () => {
    const yes = await confirm({ title: '¿Editar lo aprobado?', body: LOCK_CONFIRM, confirmLabel: 'Editar' });
    if (yes) setUnlocked(true);
    return yes;
  }, [confirm]);
  const value: CardCtxValue = { card, ctx, saver, confirm, unlocked: unlocked && card.status === 'approved', unlock, announce };
  return (
    <CardContext.Provider value={value}>
      {dialog}
      <CardBody {...props} />
    </CardContext.Provider>
  );
}

function CardBody({ card, ctx, first, target, focusTitle, canUp, canDown, announce, onGone, onDuplicated }: PieceCardProps) {
  const { run, pending } = useAction();
  const { confirm, saver } = useCard();
  const titleLocked = useLocked('title');
  const folded = useFolded(ctx.userId, card.id, first);
  const [manual, setManual] = useState<boolean | null>(null);
  const [seenTarget, setSeenTarget] = useState(target);
  if (seenTarget !== target) {
    // A new jump to this card opens it again, whatever was tapped before.
    setSeenTarget(target);
    if (target) setManual(null);
  }
  const [moving, setMoving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const expanded = manual ?? (target ? true : folded === null ? true : !folded);
  const cssDefault = manual === null && !target && folded === null && !first;

  const anchor = pieceAnchor(card.id);
  const titleId = `${anchor}-title`;
  const bodyId = `${anchor}-body`;
  const published = card.displayState === 'published';
  const inFeed = (FEED_FORMATS as readonly Format[]).includes(card.format);
  const Fields = FIELDS[card.format];

  // The card someone jumps to: into view, the focus on its title, a short flash (none with reduced motion).
  useEffect(() => {
    if (!target) return;
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
    (titleRef.current ?? el).focus({ preventScroll: true });
    if (focusTitle) titleRef.current?.select();
    if (reduce) return;
    el.classList.add('ring-4', 'ring-accent');
    const t = setTimeout(() => el.classList.remove('ring-4', 'ring-accent'), 1000);
    return () => clearTimeout(t);
  }, [target, focusTitle]);

  const toggle = () => {
    const next = !expanded;
    setManual(next);
    writeKey(deviceStore(), foldKey(ctx.userId, card.id), next ? '0' : '1');
    notifyDevice();
  };

  const remove = async () => {
    if (!(await confirm({ title: '¿Eliminar esta pieza?', body: `«${card.title}» sale de su sección y del feed. Administración puede recuperarla.`, confirmLabel: 'Eliminar', tone: 'danger' }))) return;
    await run(() => removePiece({ pieceId: card.id }), {
      onOk: (r) => {
        if (!r.ok) return;
        announce('Pieza eliminada');
        onGone(card.id);
      },
    });
  };

  const pillar = ctx.pillars.find((p) => p.key === card.pillar) ?? null;
  const pillarId = `${anchor}-pillar`;
  const item = 'flex min-h-11 w-full items-center gap-2 rounded-[var(--radius-control)] px-3 text-left text-[15px] hover:bg-surface-2 disabled:opacity-50';

  const article = (
    <Card solid ref={ref} className={cn('scroll-mt-20 transition-shadow', published && 'ring-2 ring-ok')}>
      <article id={anchor} aria-labelledby={titleId} tabIndex={-1} className="outline-none">
        <header className={cn('flex min-w-0 flex-col gap-2 p-3 sm:p-4', published && 'rounded-t-[var(--radius-card)] bg-ok-soft')}>
          <div className="flex min-w-0 items-center gap-2">
            <MediaThumb
              ids={card.thumbIds}
              className="h-11 w-11"
              fallback={ctx.demo && card.thumbIds.length ? <span className="sr-only">{DEMO_OTHER_SERVER_THUMB}</span> : undefined}
            />
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
              <Chip tone={inFeed && card.feed ? 'accent' : 'neutral'}>{numberChip(card.format, card.feed)}</Chip>
              <Chip tone={card.chip.tone}>{card.chip.label}</Chip>
            </div>
            <div className="ml-auto flex shrink-0 items-center">
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={bodyId}
                onClick={toggle}
                className={buttonVariants({ variant: 'ghost', size: 'icon' })}
                aria-label={expanded ? 'Plegar' : 'Desplegar'}
              >
                <ChevronDown className={cn('h-5 w-5 transition-transform', expanded && 'rotate-180')} aria-hidden />
              </button>
              <MenuDetails className="relative">
                <summary className={buttonVariants({ variant: 'ghost', size: 'icon', className: 'list-none cursor-pointer [&::-webkit-details-marker]:hidden' })} aria-label="Opciones de la pieza">
                  <MoreHorizontal className="h-5 w-5" aria-hidden />
                </summary>
                <div className={cn(menuPanelClass, 'absolute right-0 z-30 mt-2 w-64 max-w-[calc(100vw-2rem)]')}>
                  <Link href={`/piezas/${card.id}`} className={item}>
                    <ExternalLink className="h-4 w-4" aria-hidden /> Abrir la pieza
                  </Link>
                  <button
                    type="button"
                    className={item}
                    disabled={pending}
                    onClick={() =>
                      void run(() => duplicatePiece({ pieceId: card.id }), {
                        onOk: (r) => {
                          if (r.ok && r.data) onDuplicated(r.data.card, card.id);
                        },
                      })
                    }
                  >
                    <Copy className="h-4 w-4" aria-hidden /> Duplicar
                  </button>
                  {ctx.manualOrder ? (
                    <>
                      <button type="button" className={item} disabled={pending || !canUp} onClick={() => void run(() => reorderPiece({ pieceId: card.id, dir: 'up' }), { onOk: (r) => r.ok && r.data?.moved && announce(`Subió al lugar ${r.data.position}`) })}>
                        <ArrowUp className="h-4 w-4" aria-hidden /> Subir
                      </button>
                      <button type="button" className={item} disabled={pending || !canDown} onClick={() => void run(() => reorderPiece({ pieceId: card.id, dir: 'down' }), { onOk: (r) => r.ok && r.data?.moved && announce(`Bajó al lugar ${r.data.position}`) })}>
                        <ArrowDown className="h-4 w-4" aria-hidden /> Bajar
                      </button>
                    </>
                  ) : null}
                  {ctx.months.length > 1 ? (
                    <button type="button" className={item} onClick={() => setMoving(true)}>
                      <CalendarRange className="h-4 w-4" aria-hidden /> Mover a otro mes
                    </button>
                  ) : null}
                  {ctx.perms.boss ? (
                    <button type="button" className={cn(item, 'text-danger')} disabled={pending} onClick={() => void remove()}>
                      <Trash2 className="h-4 w-4" aria-hidden /> Eliminar
                    </button>
                  ) : null}
                </div>
              </MenuDetails>
            </div>
          </div>
          <h3 id={titleId} className="sr-only">
            {saver.title}
          </h3>
          <input
            ref={titleRef}
            aria-label="Título"
            value={saver.title}
            maxLength={140}
            readOnly={titleLocked}
            onChange={(e) => saver.setTitle(e.target.value)}
            onBlur={() => void saver.flush()}
            className={cn(
              'min-h-11 w-full min-w-0 rounded-[var(--radius-control)] border border-transparent bg-transparent px-2 text-lg font-semibold text-text hover:border-border focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30',
              titleLocked && 'cursor-default hover:border-transparent',
            )}
          />
          {saver.title.trim().length < 3 ? <p className="px-2 text-sm text-warn">El título va de 3 a 140 letras.</p> : null}
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-sm text-text-2">
              <CalendarDays className="h-4 w-4" aria-hidden />
              <span className="sr-only">Creada el </span>
              {card.createdDay}
            </span>
            {ctx.pillars.length ? (
              <>
                <label htmlFor={pillarId} className="sr-only">
                  Pilar
                </label>
                <select
                  id={pillarId}
                  value={card.pillar ?? ''}
                  disabled={pending}
                  onChange={(e) => void run(() => setPillar({ pieceId: card.id, pillar: e.target.value || null }), { onOk: () => announce('Pilar guardado') })}
                  className={cn('min-h-11 max-w-full rounded-full border-0 px-3 text-xs font-semibold', PILLAR_TONE[pillar?.tone ?? 'neutral'])}
                >
                  <option value="">Sin pilar</option>
                  {ctx.pillars.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <Chip>Sin pilar</Chip>
            )}
            {inFeed && card.feed ? (
              <Link href={feedCellHref(card.feed.monthId, card.feed.num)} className="inline-flex min-h-11 items-center gap-1 rounded-full bg-accent-soft px-3 text-xs font-semibold text-accent-ink">
                <LayoutGrid className="h-3.5 w-3.5" aria-hidden /> {feedChip(card.feed.month, card.feed.num)}
              </Link>
            ) : null}
            {card.event ? (
              <Link href={`/eventos/${card.event.id}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-ink">
                Ver evento
              </Link>
            ) : null}
          </div>
        </header>
        <div id={bodyId} hidden={!expanded} className={cn('flex min-w-0 flex-col gap-4 border-t border-border p-3 sm:p-4', cssDefault && 'max-[599px]:hidden')}>
          <NoticeBand first={first} />
          <Fields />
          <DesignChecks first={first} />
          {inFeed ? <Rating first={first} /> : null}
          <ReviewRow first={first} />
          <p className="text-xs text-text-2">
            {saver.state === 'saving' ? 'Guardando…' : saver.state === 'saved' ? 'Guardado' : saver.state === 'error' ? 'No se guardó: mira el aviso.' : `Se guarda solo. ${FORMAT[card.format].label} de ${ctx.monthLabel}.`}
          </p>
        </div>
        {moving ? <MoveMonthDialog open={moving} onOpenChange={setMoving} onMoved={() => onGone(card.id)} /> : null}
      </article>
    </Card>
  );
  // The tutorials point at the first card only (each anchor once on the page).
  return first ? <div data-tour="piece-card">{article}</div> : article;
}
