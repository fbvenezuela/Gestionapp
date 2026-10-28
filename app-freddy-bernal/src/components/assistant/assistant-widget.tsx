'use client';

import { Suspense, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowRight, PlayCircle, RotateCcw, Send, TriangleAlert, X } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { deviceStore } from '@/components/ui/device-store';
import { isEditing } from '@/components/shell/live-refresh-core';
import { NO_PERMISSION_PARAM } from '@/components/shell/no-permission';
import { TOUR_START_EVENT, TOUR_STATE_EVENT, parseScreen, type TourStartDetail, type TourStateDetail } from '@/components/tour/tour-core';
import { cn } from '@/lib/cn';
import {
  ASSISTANT_URL,
  COUNTER_FROM,
  DEMO_LABEL,
  MAX_QUESTION,
  NOTE,
  REQUEST_TIMEOUT_MS,
  THREAD_EVENT,
  addMessage,
  canSend,
  clearThread,
  faceOf,
  fromApi,
  goToText,
  inProgress,
  isDemo,
  liftFrom,
  panelNote,
  parseThread,
  readRaw,
  screenPattern,
  threadKey,
  tutorialHref,
  writeThread,
  type SessionKV,
  type StickyBox,
  type Thread,
} from './core';
import {
  OFFER_AUTO_HIDE_MS,
  OFFER_DELAY_MS,
  OFFER_LABEL,
  OFFER_NO,
  OFFER_OFF_HIDE_MS,
  OFFER_OFF_TEXT,
  OFFER_RECHECK_MS,
  OFFER_TEXT,
  OFFER_YES,
  WELCOME_TOUR,
  availableHere,
  dayOf,
  markShown,
  momentOk,
  offerAllowed,
  pickOffer,
  rememberAnswer,
  welcomeText,
  type OfferTour,
} from './offer-core';

// The team assistant's window (docs/ASISTENTE.md «La ventana», manual §12). Mounted once for
// every role by assistant-mount.tsx. It reads nobody's data: it only calls /api/asistente,
// which decides who asks, the scope and what each person may see. It sends the pattern of the
// screen the person is on (/eventos/[id], never the id) and offers that screen's tutorial with a
// one-line strip (offer-core.ts: R3, D-47). Not on a conversation of Mensajes (U11).

export type AssistantWidgetProps = {
  userId: string;
  profile: { name: string; emoji: string; intro: string };
  suggestions: string[];
  // The person's tutorials (the menu's, as the engine has them), without their steps: for the offer and the button of
  // a tutorial whose screen needs an id.
  tours?: OfferTour[];
};

// Where 360's button and panel are not drawn: a conversation of Mensajes fills the screen (U11).
const NO_ASSISTANT_SCREENS = ['/mensajes/[id]'];
// One empty list for every render (the offer's effect depends on the list).
const NO_TOURS: OfferTour[] = [];

function sessionStore(): SessionKV | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function subscribeThread(cb: () => void) {
  window.addEventListener(THREAD_EVENT, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(THREAD_EVENT, cb);
    window.removeEventListener('storage', cb);
  };
}

// How high the page's sticky bottom bars reach («Guardar» in forms), so the button sits above
// them. Measured after the DOM changes, on scroll and on resize (at most once a frame) and kept
// here: reading layout on every render would be wasteful.
let liftValue = 0;

// The button's own box, as its CSS below has it: h-12, 12 px over a bar, and its resting spot
// (`--asst-base`: 76 px up on a phone, over the bottom bar, and 24 px from lg up).
const BUTTON_H = 48;
const BUTTON_GAP = 12;

/**
 * A bar as liftFrom() reads it, from where it really is on the screen: stuck at the bottom, or
 * rising with the page at the end of the form (there the button rides on top of it instead of
 * covering its buttons). It counts only while it reaches the button's resting spot: once it
 * rests higher up, the button goes back down below it, where it covers no field. Half the gap
 * is enough room: at the end of the page the bar rests a whole gap above the button (main's
 * padding + the spacer), and scrolling in fractions of a pixel must not tip it back.
 */
export function stickyBox(position: string, cssBottom: string, rect: { top: number; bottom: number }, viewport: number, base: number): StickyBox {
  const above = viewport - rect.bottom; // from the bottom of the screen to the bar's lower edge
  const height = rect.bottom - rect.top;
  return {
    position,
    // Only bars stuck to the bottom: one stuck to the top has bottom 'auto' and stays out.
    bottom: Number.isFinite(Number.parseFloat(cssBottom)) ? `${above}px` : cssBottom,
    height,
    visible: height > 0 && rect.top < viewport - base && above < base + BUTTON_H + BUTTON_GAP / 2,
  };
}

function readLift(): number {
  const vh = window.innerHeight;
  const base = window.matchMedia('(min-width: 1024px)').matches ? 24 : 76;
  const boxes = Array.from(document.querySelectorAll<HTMLElement>('main .sticky')).map((el) => {
    const cs = getComputedStyle(el);
    return stickyBox(cs.position, cs.bottom, el.getBoundingClientRect(), vh, base);
  });
  return liftFrom(boxes);
}

function subscribeLift(cb: () => void) {
  let frame = 0;
  const update = () => {
    frame = 0;
    const v = readLift();
    if (v !== liftValue) {
      liftValue = v;
      cb();
    }
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  const mo = new MutationObserver(schedule);
  mo.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('resize', schedule);
  window.addEventListener('scroll', schedule, { passive: true });
  schedule();
  return () => {
    cancelAnimationFrame(frame);
    mo.disconnect();
    window.removeEventListener('resize', schedule);
    window.removeEventListener('scroll', schedule);
  };
}

const getLift = () => liftValue;

export function AssistantWidget({ userId, profile, suggestions, tours = NO_TOURS }: AssistantWidgetProps) {
  const pathname = usePathname();
  const screen = screenPattern(pathname);
  const key = threadKey(userId);
  const raw = useSyncExternalStore(subscribeThread, () => readRaw(sessionStore(), key), () => null);
  const thread = useMemo(() => parseThread(raw, userId), [raw, userId]);
  const lift = useSyncExternalStore(subscribeLift, getLift, () => 0);

  const [open, setOpen] = useState(false);
  // How tall the offer strip is while it shows: the spacer grows by that much (it never covers the page's end).
  const [stripHeight, setStripHeight] = useState(0);
  const [text, setText] = useState('');
  const [waiting, setWaiting] = useState(false);
  const busy = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const ids = useId();

  const face = faceOf(profile);
  const going = inProgress(thread);
  const demo = isDemo(thread);

  // Keep the newest message in view.
  useEffect(() => {
    if (open && log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [open, thread.messages.length, waiting]);

  const save = (t: Thread) => {
    writeThread(sessionStore(), t);
    window.dispatchEvent(new Event(THREAD_EVENT));
  };

  const focusField = () => {
    // On a phone the keyboard would cover the thread: only on wider screens.
    if (window.matchMedia('(min-width: 640px)').matches) input.current?.focus();
  };

  async function send(question: string) {
    const q = question.trim().slice(0, MAX_QUESTION);
    if (busy.current || !canSend(q, false)) return;
    busy.current = true;
    setWaiting(true);
    setText('');
    const store = sessionStore();
    const before = parseThread(readRaw(store, key), userId);
    save(addMessage(before, { who: 'persona', text: q }));

    let status = 0;
    let body: unknown = null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(ASSISTANT_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pregunta: q, conversacion: before.conversationId, pantalla: screen }),
        credentials: 'same-origin',
        cache: 'no-store',
        signal: ctrl.signal,
      });
      status = res.status;
      body = await res.json().catch(() => null);
    } catch {
      status = 0; // no signal, timeout: the same notice as a degraded answer
    } finally {
      clearTimeout(timer);
    }

    const out = fromApi(status, body);
    const now = parseThread(readRaw(store, key), userId);
    if (out.ok) {
      save({
        ...addMessage(now, { who: 'asistente', text: out.text, degraded: out.degraded, goTo: out.goTo, tutorial: out.tutorial, model: out.model }),
        conversationId: out.conversationId ?? now.conversationId,
      });
    } else {
      save(addMessage(now, { who: 'asistente', text: out.text, degraded: out.degraded, goTo: out.goTo, ...(out.retry ? { retry: q } : {}) }));
    }
    busy.current = false;
    setWaiting(false);
    focusField();
  }

  const startOver = () => {
    clearThread(sessionStore(), userId);
    window.dispatchEvent(new Event(THREAD_EVENT));
    setText('');
    focusField();
  };

  const counter = text.length >= COUNTER_FROM;
  // A tutorial's button: its address, or (a screen with an id) this very screen when the person is on it.
  const tutorialLink = (t: NonNullable<Thread['messages'][number]['tutorial']>) => {
    const own = tours.find((x) => x.id === t.id);
    const search = typeof window === 'undefined' ? '' : window.location.search;
    return tutorialHref(t, pathname, search, own ? parseScreen(own.screen).path : null);
  };

  if (screen && NO_ASSISTANT_SCREENS.includes(screen)) return null;

  return (
    <>
    {/* Room at the end of the page so its last row can scroll out from under the button (the
        button reaches 124 px above the bottom on a phone; main's own padding is 72 px), and
        from under the offer strip while it shows. */}
    <div aria-hidden data-assistant-spacer="" className="h-16 shrink-0" style={stripHeight ? { height: 64 + stripHeight + 8 } : undefined} />
    <Suspense fallback={null}>
      <OfferStrip userId={userId} name={profile.name} tours={tours} panelOpen={open} lift={lift} onHeight={setStripHeight} />
    </Suspense>
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          data-assistant-button=""
          style={{ '--asst-lift': `${lift}px` } as CSSProperties}
          className={cn(
            'glass-pop fixed right-3 z-20 flex h-12 items-center gap-2 rounded-full py-1 pl-1 pr-3 text-text hover:bg-surface-2',
            // Above the phone's bottom bar (64 px + safe area) and above sticky action bars.
            '[--asst-base:calc(env(safe-area-inset-bottom)_+_76px)] bottom-[max(var(--asst-base),calc(var(--asst-lift)_+_12px))]',
            'lg:right-6 lg:[--asst-base:24px]',
          )}
        >
          <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-lg font-bold leading-none text-on-accent">
            {face}
          </span>
          <span className="max-w-[7rem] truncate text-sm font-semibold">{profile.name}</span>
          <span className="sr-only">: asistente del equipo{going ? '. Tienes una conversación a medias' : ''}</span>
          {going ? <span aria-hidden data-assistant-dot="" className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-surface bg-accent-ink" /> : null}
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-slate/50 glass-overlay" />
        <Dialog.Content
          onOpenAutoFocus={(e) => {
            if (window.matchMedia('(min-width: 640px)').matches) {
              e.preventDefault();
              input.current?.focus();
            }
          }}
          className="glass-sheet fixed inset-0 z-50 flex h-dvh flex-col border-0 text-text sm:left-auto sm:w-[420px] sm:border-l sm:border-border"
        >
          <header className="flex items-center gap-3 border-b border-border py-2 pl-4 pr-2">
            <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-lg font-bold leading-none text-on-accent">
              {face}
            </span>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="truncate text-base font-bold leading-tight">{profile.name}</Dialog.Title>
              <p className="truncate text-xs text-text-2">Asistente del equipo</p>
            </div>
            <Dialog.Close className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius-control)] hover:bg-surface-2" aria-label="Cerrar">
              <X className="h-5 w-5" aria-hidden />
            </Dialog.Close>
          </header>

          {demo || thread.messages.length ? (
            <div className="flex min-h-11 items-center justify-between gap-2 border-b border-border px-4">
              {demo ? (
                <span className="rounded-[var(--radius-chip)] bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent-ink">{DEMO_LABEL}</span>
              ) : (
                <span />
              )}
              {thread.messages.length ? (
                <button
                  type="button"
                  onClick={startOver}
                  disabled={waiting}
                  className="-mr-2 inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-control)] px-2 text-sm font-semibold text-text-2 hover:bg-surface-2 hover:text-text disabled:opacity-50"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden /> Empezar de nuevo
                </button>
              ) : null}
            </div>
          ) : null}

          <div ref={log} role="log" aria-live="polite" aria-label="Conversación" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 py-4">
            <Bubble who="asistente">{profile.intro}</Bubble>
            {!thread.messages.length && suggestions.length ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-semibold text-text-2" id={`${ids}-sug`}>Puedes preguntarme:</p>
                <ul aria-labelledby={`${ids}-sug`} className="flex flex-col items-start gap-2">
                  {suggestions.map((s) => (
                    <li key={s} className="max-w-full">
                      <button
                        type="button"
                        disabled={waiting}
                        onClick={() => send(s)}
                        className="min-h-11 max-w-full rounded-full border border-border bg-surface px-4 py-2 text-left text-[15px] text-text hover:bg-surface-2 disabled:opacity-50 [overflow-wrap:anywhere]"
                      >
                        {s}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {thread.messages.map((m) => (
              <div key={m.id} className={cn('flex max-w-full flex-col gap-2', m.who === 'persona' ? 'items-end' : 'items-start')}>
                <Bubble who={m.who} degraded={m.degraded}>{m.text}</Bubble>
                {m.tutorial && tutorialLink(m.tutorial) ? (
                  <Link href={tutorialLink(m.tutorial)!} onClick={() => setOpen(false)} className={buttonVariants({ size: 'md', className: 'max-w-full' })}>
                    <PlayCircle className="h-4 w-4 shrink-0" aria-hidden /> <span className="truncate">{m.tutorial.label}</span>
                  </Link>
                ) : null}
                {m.goTo ? (
                  <Link href={m.goTo.href} onClick={() => setOpen(false)} className={buttonVariants({ variant: 'secondary', size: 'md', className: 'max-w-full' })}>
                    <span className="truncate">{goToText(m.goTo.label)}</span> <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
                  </Link>
                ) : null}
                {m.retry ? (
                  <button type="button" disabled={waiting} onClick={() => send(m.retry!)} className={buttonVariants({ variant: 'ghost', size: 'md' })}>
                    <RotateCcw className="h-4 w-4" aria-hidden /> Volver a intentar
                  </button>
                ) : null}
              </div>
            ))}

            {waiting ? (
              <div className="flex items-start" data-assistant-typing="">
                <div className="flex items-center gap-1 rounded-[var(--radius-card)] rounded-bl-sm bg-surface-2 px-4 py-3">
                  <span className="sr-only">{profile.name} está escribiendo…</span>
                  {[0, 1, 2].map((i) => (
                    <span key={i} aria-hidden className="h-2 w-2 rounded-full bg-muted motion-safe:animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(text);
            }}
            className="border-t border-border px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          >
            <label htmlFor={`${ids}-q`} className="sr-only">Tu pregunta para {profile.name}</label>
            <div className="flex items-end gap-2">
              <textarea
                ref={input}
                id={`${ids}-q`}
                value={text}
                maxLength={MAX_QUESTION}
                rows={1}
                enterKeyHint="send"
                placeholder="Escribe tu pregunta"
                aria-describedby={`${ids}-note${counter ? ` ${ids}-count` : ''}`}
                onChange={(e) => setText(e.target.value.slice(0, MAX_QUESTION))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void send(text);
                  }
                }}
                className="min-h-11 max-h-36 min-w-0 flex-1 resize-none rounded-[var(--radius-control)] border border-border bg-surface px-3 py-2.5 text-base text-text placeholder:text-muted focus:border-accent [field-sizing:content]"
              />
              <button
                type="submit"
                disabled={!canSend(text, waiting)}
                aria-label={waiting ? 'Enviando…' : 'Enviar'}
                className={buttonVariants({ size: 'icon', className: 'shrink-0' })}
              >
                <Send className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <div className="mt-1.5 flex items-start justify-between gap-2">
              <Dialog.Description className="flex flex-col gap-0.5 text-xs text-text-2">
                <span id={`${ids}-note`}>{NOTE}</span>
                <span data-assistant-panel-note="">{panelNote(profile.name)}</span>
              </Dialog.Description>
              {counter ? (
                <span id={`${ids}-count`} aria-live="polite" className="shrink-0 text-xs tabular text-text-2">
                  {text.length}/{MAX_QUESTION}
                </span>
              ) : null}
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
    </>
  );
}

// ---------------------------------------------------------------------------
// The offer (R3, D-47; rules in offer-core.ts): a one-line strip above 360's button, after 4 s on a screen
// that has a tutorial the person has not seen. It never opens 360, never takes the focus and never calls
// /api/asistente. Its own component, under Suspense: useSearchParams() (the screen's tab, «sin permiso»).
// ---------------------------------------------------------------------------
function tabStore(): SessionKV | null {
  return sessionStore();
}

function tipShown(): boolean {
  return Array.from(document.querySelectorAll('aside[aria-label="Consejo"]')).some((el) => el.getClientRects().length > 0);
}

type Shown = { tour: OfferTour; text: string } | { off: true };

function OfferStrip({ userId, name, tours, panelOpen, lift, onHeight }: { userId: string; name: string; tours: OfferTour[]; panelOpen: boolean; lift: number; onHeight: (h: number) => void }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const where = `${pathname}?${params.toString()}`;
  const screen = screenPattern(pathname);
  const noPermission = params.get(NO_PERMISSION_PARAM) === '1';
  const [shown, setShown] = useState<Shown | null>(null);
  // Another screen or tab: the strip goes (reset while rendering, as tour-host.tsx). It counted as offered already.
  const [shownAt, setShownAt] = useState(where);
  if (shownAt !== where) {
    setShownAt(where);
    if (shown) setShown(null);
  }
  const box = useRef<HTMLElement>(null);
  const panel = useRef(panelOpen);
  const tourOpen = useRef(false);
  useEffect(() => {
    panel.current = panelOpen;
  }, [panelOpen]);

  // A tutorial running (from «Mi cuenta», a link or this strip): no strip meanwhile.
  useEffect(() => {
    const onState = (e: Event) => {
      tourOpen.current = (e as CustomEvent<TourStateDetail>).detail?.state === 'open';
      if (tourOpen.current) setShown((s) => (s && 'tour' in s ? null : s));
    };
    window.addEventListener(TOUR_STATE_EVENT, onState);
    return () => window.removeEventListener(TOUR_STATE_EVENT, onState);
  }, []);

  // 4 s after the screen shows, and then once a second while something else is going on (a field with the focus, a
  // dialog, 360 open, a tip, a tutorial), the first tutorial of this screen that may be offered.
  useEffect(() => {
    const since = Date.now();
    let timer = 0;
    const check = () => {
      const store = deviceStore();
      const today = dayOf(new Date());
      const tab = tabStore();
      if (!offerAllowed({ userId, store, tab, today })) return;
      const moment = {
        visibleMs: Date.now() - since,
        editing: isEditing(document.activeElement as HTMLInputElement | null),
        dialogOpen: !!document.querySelector('dialog[open], [role="dialog"], [role="alertdialog"]'),
        panelOpen: panel.current,
        tipVisible: tipShown(),
        noPermission,
        tourOpen: tourOpen.current || !!document.querySelector('[data-tour-dialog]'),
      };
      if (document.hidden || !momentOk(moment)) {
        timer = window.setTimeout(check, OFFER_RECHECK_MS);
        return;
      }
      const tour = pickOffer({ tours, here: availableHere(tours.map((t) => t.id), window), userId, store, screen });
      if (!tour) return;
      markShown({ tourId: tour.id, userId, store, tab, today });
      setShown({ tour, text: tour.id === WELCOME_TOUR ? welcomeText(name) : OFFER_TEXT });
    };
    timer = window.setTimeout(check, OFFER_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [where, userId, name, tours, screen, noPermission]);

  // Untouched, it goes away by itself (12 s; «Listo…», 6 s). Not while the focus is on it.
  useEffect(() => {
    if (!shown) return;
    let timer = 0;
    const hide = () => {
      if (box.current?.contains(document.activeElement)) {
        timer = window.setTimeout(hide, OFFER_RECHECK_MS);
        return;
      }
      if ('tour' in shown) rememberAnswer({ answer: 'ignored', tourId: shown.tour.id, userId, store: deviceStore(), today: dayOf(new Date()) });
      setShown(null);
    };
    timer = window.setTimeout(hide, 'tour' in shown ? OFFER_AUTO_HIDE_MS : OFFER_OFF_HIDE_MS);
    return () => window.clearTimeout(timer);
  }, [shown, userId]);

  // Its height, for the spacer at the end of the page.
  useEffect(() => {
    const el = box.current;
    if (!shown || !el) {
      onHeight(0);
      return;
    }
    onHeight(Math.ceil(el.getBoundingClientRect().height));
  }, [shown, onHeight]);

  if (!shown) return null;
  const button = () => document.querySelector<HTMLElement>('[data-assistant-button]');
  // The focus was on the strip: it goes to 360's button, not to nowhere.
  const leave = () => {
    if (box.current?.contains(document.activeElement)) button()?.focus();
  };
  const answer = (a: 'yes' | 'no') => {
    if (!('tour' in shown)) return;
    const { off } = rememberAnswer({ answer: a, tourId: shown.tour.id, userId, store: deviceStore(), today: dayOf(new Date()) });
    leave();
    if (a === 'yes') {
      setShown(null);
      window.dispatchEvent(new CustomEvent(TOUR_START_EVENT, { detail: { id: shown.tour.id, opener: button() } satisfies TourStartDetail }));
    } else setShown(off ? { off: true } : null);
  };

  return (
    <aside
      ref={box}
      aria-label={OFFER_LABEL}
      aria-live="polite"
      data-assistant-offer=""
      style={{ '--asst-lift': `${lift}px` } as CSSProperties}
      className={cn(
        'glass-pop fixed right-3 z-20 flex w-[min(20rem,calc(100vw-24px))] items-center gap-2 rounded-[var(--radius-card)] py-1.5 pl-3 pr-1.5 text-text',
        // 56 px above 360's button, which sits over the phone's bottom bar and any sticky action bar.
        '[--asst-base:calc(env(safe-area-inset-bottom)_+_76px)] bottom-[calc(max(var(--asst-base),calc(var(--asst-lift)_+_12px))_+_56px)]',
        'lg:right-6 lg:[--asst-base:24px]',
      )}
    >
      {'tour' in shown ? (
        <>
          <p className="min-w-0 flex-1 text-sm font-semibold leading-tight">{shown.text}</p>
          <button type="button" onClick={() => answer('yes')} className={buttonVariants({ size: 'md', className: 'shrink-0 px-3 text-sm' })}>
            {OFFER_YES}
          </button>
          <button type="button" onClick={() => answer('no')} aria-label={OFFER_NO} className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius-control)] text-text-2 hover:bg-surface-2 hover:text-text">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </>
      ) : (
        <p className="min-h-11 flex-1 py-3 text-sm font-semibold leading-tight">{OFFER_OFF_TEXT}</p>
      )}
    </aside>
  );
}

function Bubble({ who, degraded, children }: { who: 'persona' | 'asistente'; degraded?: boolean; children: React.ReactNode }) {
  return (
    <div
      data-who={who}
      className={cn(
        'max-w-[85%] whitespace-pre-wrap rounded-[var(--radius-card)] px-3 py-2 text-[15px] leading-snug text-text [overflow-wrap:anywhere]',
        who === 'persona' ? 'rounded-br-sm bg-accent-soft' : 'rounded-bl-sm bg-surface-2',
        degraded && 'flex items-start gap-2 border border-warn/40 bg-warn-soft',
      )}
    >
      {who === 'persona' ? <span className="sr-only">Tú: </span> : null}
      {degraded ? (
        <>
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />
          <span>
            <span className="sr-only">Aviso: </span>
            {children}
          </span>
        </>
      ) : (
        children
      )}
    </div>
  );
}
