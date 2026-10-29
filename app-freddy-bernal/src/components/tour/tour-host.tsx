'use client';

import { Suspense, useCallback, useEffect, useEffectEvent, useId, useRef, useState, useSyncExternalStore } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { homeFor, TEAM_ROLES, type Role } from '@/lib/roles';
import type { Tour } from '@/lib/guides/types';
import { GUIDE_SLUGS } from '@/lib/guides/slugs';
import { deviceStore } from '@/components/ui/device-store';
import {
  MIN_STEPS,
  TOUR_CAN_ANSWER_EVENT,
  TOUR_CAN_EVENT,
  TOUR_PARAM,
  TOUR_START_EVENT,
  TOUR_STATE_EVENT,
  cardSpot,
  firstVisible,
  isShown,
  planStep,
  resolveSteps,
  ringSpot,
  saveProgress,
  tourAvailable,
  tourForPath,
  type Bars,
  type Box,
  type Place,
  type TourCanAnswer,
  type TourDoc,
  type TourEl,
  type TourProgress,
  type TourStartDetail,
  type TourStateDetail,
} from './tour-core';
import { TourCard, type TourCardView } from './tour-card';

export type TourHostProps = {
  userId: string;
  // The menu roles (menuRoles: they follow «Ver como»), to pick each step's text.
  roles: Role[];
  // The tutorials of those roles, from toursForRoles() in the panel layout.
  tours: Tour[];
};

// The tutorials' engine (R3, D-45, design §6.1), mounted once by the panel layout next to 360 (the layout stays while
// the pages change). It starts only from ?tutorial=<id> or the window event `fb:tour:start`; never by itself. Nothing
// on the server and until it is mounted (like tip.tsx): no hydration differences.
const subscribeNothing = () => () => {};

export function TourHost(props: TourHostProps) {
  const mounted = useSyncExternalStore(subscribeNothing, () => true, () => false);
  if (!mounted) return null;
  return (
    // useSearchParams() needs a Suspense boundary (as no-permission-banner.tsx).
    <Suspense fallback={null}>
      <Host {...props} />
    </Suspense>
  );
}

type Step = { title: string; body: string; target: string[]; el: TourEl | null };
type Run = {
  seq: number;
  tour: Tour;
  steps: Step[];
  index: number;
  next: Tour | null; // the tutorial «Seguir» goes on to (bienvenida → the home's)
  where: string; // the screen and tab it started on: it closes when they change
  opener: HTMLElement | null; // where the focus goes back to
  changed: string | null; // fewer than 2 steps on screen: the card says so and links to this guide
};
type Spot = { seq: number; index: number; place: Place; card: { top: number; left: number }; ring: Box | null };

const doc = () => document as unknown as TourDoc;
const emit = (name: string, detail: unknown) => window.dispatchEvent(new CustomEvent(name, { detail }));
const box = (r: DOMRect | { top: number; left: number; width: number; height: number }): Box => ({ top: r.top, left: r.left, width: r.width, height: r.height });
const viewport = () => ({ width: document.documentElement.clientWidth || window.innerWidth, height: window.innerHeight });

// The top bar (sticky, 64 px) and the phone's bottom bar (with the safe area) as they are on screen now.
function readBars(): Bars {
  const vh = window.innerHeight;
  const header = document.querySelector('header.sticky');
  const nav = document.querySelector('nav[aria-label="Menú"]');
  const top = header && header.getClientRects().length ? Math.min(Math.max(header.getBoundingClientRect().bottom, 0), vh) : 0;
  const bottom = nav && nav.getClientRects().length ? Math.max(vh - nav.getBoundingClientRect().top, 0) : 0;
  return { top, bottom };
}

// It stays put when the page scrolls (the bars, 360's button, a sticky bar that is on screen).
function isPinned(el: Element): boolean {
  for (let x: Element | null = el; x && x !== document.body; x = x.parentElement) {
    const p = getComputedStyle(x).position;
    if (p === 'fixed' || p === 'sticky') {
      const r = el.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= window.innerHeight;
    }
  }
  return false;
}

// The tab the page marks as current (the event's tabs): Grabación lands on Material without ?tab= in the address.
function currentTab(): string | null {
  const a = document.querySelector('nav[aria-label="Secciones del evento"] a[aria-current="page"]');
  const href = a?.getAttribute('href');
  if (!href) return null;
  try {
    return new URL(href, window.location.origin).searchParams.get('tab');
  } catch {
    return null;
  }
}

// Waits until the page stopped loading (the skeleton of loading.tsx is aria-busy), at most `ms`.
function whenIdle(ms = 4000): Promise<void> {
  const busy = () => !!document.querySelector('main [aria-busy="true"]');
  if (!busy()) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      mo.disconnect();
      window.clearTimeout(timer);
      resolve();
    };
    const mo = new MutationObserver(() => {
      if (!busy()) done();
    });
    const timer = window.setTimeout(done, ms);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-busy'] });
  });
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

// A dialog of the page itself is open, or is about to open on its own (Mensajes' notice, marked data-blocks-tour until
// the person closes it once: its effect may run after the tutorial's): the tutorial would ring what sits under it.
// The tutorial's own card does not count.
const pageDialogOpen = () => !!document.querySelector('dialog[open]:not([data-tour-dialog]), dialog[data-blocks-tour]');

// Waits until no dialog of the page is open (closed with its button or Escape), at most `ms`.
function whenNoDialog(ms = 10 * 60_000): Promise<void> {
  if (!pageDialogOpen()) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      mo.disconnect();
      window.clearTimeout(timer);
      resolve();
    };
    const mo = new MutationObserver(() => {
      if (!pageDialogOpen()) done();
    });
    const timer = window.setTimeout(done, ms);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open', 'data-blocks-tour'] });
  });
}

// Where the focus goes back to: the element given, or the one that had it; inside a menu (which closes when the focus
// leaves it, as «Mi cuenta»), that menu's button.
function openerFrom(given: unknown): HTMLElement | null {
  if (given instanceof HTMLElement) return given;
  const at = document.activeElement;
  if (!(at instanceof HTMLElement) || at === document.body) return null;
  const menu = at.closest('details');
  return menu?.querySelector('summary') ?? at;
}

function Host({ userId, roles, tours }: TourHostProps) {
  const pathname = usePathname();
  const params = useSearchParams();
  const where = `${pathname}|${params.get('tab') ?? ''}`;
  const wanted = params.get(TOUR_PARAM);

  const [run, setRun] = useState<Run | null>(null);
  const [spot, setSpot] = useState<Spot | null>(null);
  // Another screen or tab (the phone's back button while it runs): the tutorial is over (the effect below records it
  // as seen). Reset while rendering, React's way of adjusting state to a change of props.
  const [shownAt, setShownAt] = useState(where);
  if (shownAt !== where) {
    setShownAt(where);
    if (run) setRun(null);
    if (spot) setSpot(null);
  }
  const whereNow = useRef(where);
  // The latest run for the listeners (kept in step by the handlers that change it, and by the effect below).
  const live = useRef<Run | null>(null);
  const place = useRef<{ seq: number; index: number; place: Place } | null>(null);
  const seq = useRef(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const primary = useRef<HTMLElement | null>(null);
  const setPrimary = useCallback((el: HTMLElement | null) => {
    primary.current = el;
  }, []);
  const titleId = useId();
  const bodyId = useId();

  const active = run && run.where === where ? run : null;

  const home = homeFor(roles);
  const here = useEffectEvent((): Tour[] => tourForPath(pathname, params, tours, { home, tab: currentTab() }));

  const guideFor = (tour: Tour) => {
    const role = TEAM_ROLES.find((r) => roles.includes(r) && tour.roles.includes(r));
    return role ? `/ayuda/${GUIDE_SLUGS[role]}?ver=pantallas` : '/ayuda';
  };
  const stepsOf = (tour: Tour): Step[] =>
    resolveSteps(tour, doc(), roles).map((s) => ({ title: s.step.title, body: s.body, target: s.step.target, el: s.el }));

  const begin = (r: Run) => {
    live.current = r;
    setRun(r);
    setSpot(null);
    if (!r.changed) saveProgress(deviceStore(), userId, r.tour.id, 'seen');
    emit(TOUR_STATE_EVENT, { state: 'open', id: r.tour.id } satisfies TourStateDetail);
  };

  // The tutorial «Seguir» goes on to, when it can run here now (2 steps or more on screen).
  const chainOf = useEffectEvent((tour: Tour): Tour | null => {
    if (!tour.next) return null;
    const next = here().find((t) => t.id === tour.next);
    return next && tourAvailable(next, doc(), roles) ? next : null;
  });

  const start = useEffectEvent(async (id: string, given: unknown) => {
    if (live.current) return;
    const opener = openerFrom(given);
    const at = whereNow.current;
    await whenIdle();
    await nextFrame();
    // Mensajes' notice first: the tutorial starts once it is closed (accepted or not), still on this screen.
    if (pageDialogOpen()) {
      await whenNoDialog();
      await nextFrame();
    }
    if (live.current || at !== whereNow.current || pageDialogOpen()) return;
    const tour = here().find((t) => t.id === id);
    if (!tour) return; // not a tutorial of this screen for this person: nothing happens
    const steps = stepsOf(tour);
    const enough = steps.length >= MIN_STEPS;
    begin({ seq: ++seq.current, tour, steps, index: 0, next: enough ? chainOf(tour) : null, where: at, opener, changed: enough ? null : guideFor(tour) });
  });

  function close(progress: TourProgress) {
    const r = live.current;
    if (!r) return;
    live.current = null;
    place.current = null;
    if (!r.changed) saveProgress(deviceStore(), userId, r.tour.id, progress);
    dialog.current?.close();
    setRun(null);
    setSpot(null);
    emit(TOUR_STATE_EVENT, { state: 'closed', id: r.tour.id } satisfies TourStateDetail);
    if (r.opener?.isConnected) r.opener.focus();
  }

  function go(index: number) {
    const r = live.current;
    if (!r) return;
    const n = { ...r, index };
    live.current = n;
    setRun(n);
  }

  function onPrimary() {
    const r = live.current;
    if (!r) return;
    if (r.index < r.steps.length - 1) return go(r.index + 1);
    saveProgress(deviceStore(), userId, r.tour.id, 'done');
    const next = r.next;
    const steps = next ? stepsOf(next) : [];
    if (!next || steps.length < MIN_STEPS) return close('done');
    // «Seguir»: the home's tutorial in the same dialog, from its first step.
    emit(TOUR_STATE_EVENT, { state: 'closed', id: r.tour.id } satisfies TourStateDetail);
    begin({ ...r, seq: ++seq.current, tour: next, steps, index: 0, next: null });
  }

  // The person left the screen or the tab: it counts as seen (the dialog already went away with the render above).
  useEffect(() => {
    whereNow.current = where;
    const r = live.current;
    if (!r || r.where === where) return;
    live.current = null;
    place.current = null;
    if (!r.changed) saveProgress(deviceStore(), userId, r.tour.id, 'seen');
    emit(TOUR_STATE_EVENT, { state: 'closed', id: r.tour.id } satisfies TourStateDetail);
  }, [where, userId]);

  // ?tutorial=<id>: start it and take it out of the address (a reload must not start it again). The browser's own
  // history call: Next.js keeps usePathname/useSearchParams in step without asking the server for the page again.
  useEffect(() => {
    if (!wanted) return;
    const rest = new URLSearchParams(params.toString());
    rest.delete(TOUR_PARAM);
    const qs = rest.toString();
    window.history.replaceState(window.history.state, '', `${pathname}${qs ? `?${qs}` : ''}${window.location.hash}`);
    void start(wanted, null);
  }, [wanted, params, pathname]);

  // The window events: «Ver el tutorial…» in «Mi cuenta» starts one; 360 and «Mi cuenta» ask whether one can run.
  useEffect(() => {
    const onStart = (e: Event) => {
      const d = (e as CustomEvent<TourStartDetail>).detail;
      if (d && typeof d.id === 'string') void start(d.id, d.opener);
    };
    const onCan = (e: Event) => {
      const id = (e as CustomEvent<{ id?: unknown }>).detail?.id;
      if (typeof id !== 'string') return;
      const list = here();
      const order = list.findIndex((t) => t.id === id);
      const ok = order >= 0 && tourAvailable(list[order], doc(), roles);
      emit(TOUR_CAN_ANSWER_EVENT, { id, ok, order } satisfies TourCanAnswer);
    };
    window.addEventListener(TOUR_START_EVENT, onStart);
    window.addEventListener(TOUR_CAN_EVENT, onCan);
    return () => {
      window.removeEventListener(TOUR_START_EVENT, onStart);
      window.removeEventListener(TOUR_CAN_EVENT, onCan);
    };
  }, [roles]);

  // Open the dialog (top layer) and put the focus on the main button, at every step.
  useEffect(() => {
    if (!active) return;
    const d = dialog.current;
    if (d && !d.open) d.showModal();
    primary.current?.focus({ preventScroll: true });
  }, [active]);

  // Measures where the card and the ring go now (the place of the step stays; the target may move).
  const measure = useEffectEvent(() => {
    const r = live.current;
    const p = place.current;
    const c = card.current;
    if (!r || !p || !c || p.seq !== r.seq || p.index !== r.index) return;
    const step = r.steps[r.index];
    const el = step.el && (step.el as unknown as Element).isConnected && isShown(step.el) ? step.el : firstVisible(step.target, doc());
    const size = { width: c.offsetWidth, height: c.offsetHeight };
    const vp = viewport();
    const bars = readBars();
    const target = el ? box(el.getBoundingClientRect()) : null;
    const at = cardSpot(p.place, target, size, vp, bars);
    const ring = target ? ringSpot(target, p.place, at.top, size, vp) : null;
    const next: Spot = { seq: p.seq, index: p.index, place: p.place, card: at, ring };
    setSpot((prev) => (prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  });

  // Each step: where the card goes, scroll the page there (instantly with «Menos movimiento»), then draw.
  useEffect(() => {
    if (!active || active.changed) return;
    const frame = requestAnimationFrame(() => {
      const c = card.current;
      if (!c) return;
      const step = active.steps[active.index];
      const el = step.el && (step.el as unknown as Element).isConnected && isShown(step.el) ? step.el : firstVisible(step.target, doc());
      const target = el ? box(el.getBoundingClientRect()) : null;
      const plan = planStep(target, { width: c.offsetWidth, height: c.offsetHeight }, viewport(), readBars(), el ? isPinned(el as unknown as Element) : false);
      place.current = { seq: active.seq, index: active.index, place: plan.place };
      if (Math.abs(plan.scrollBy) >= 1) {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        window.scrollBy({ top: plan.scrollBy, behavior: reduce ? 'auto' : 'smooth' });
      }
      measure();
    });
    return () => cancelAnimationFrame(frame);
  }, [active]);

  // While it is open: measure again on scroll, resize and changes in the page, at most once a frame.
  useEffect(() => {
    if (!active || active.changed) return;
    let frame = 0;
    const schedule = () => {
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          measure();
        });
    };
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true });
    const ro = new ResizeObserver(schedule);
    if (card.current) ro.observe(card.current);
    for (const s of active.steps) if (s.el) ro.observe(s.el as unknown as Element);
    window.addEventListener('scroll', schedule, { capture: true, passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      mo.disconnect();
      ro.disconnect();
      window.removeEventListener('scroll', schedule, { capture: true });
      window.removeEventListener('resize', schedule);
    };
  }, [active]);

  if (!active) return null;
  const view: TourCardView = active.changed
    ? { kind: 'changed', title: active.tour.title, guideHref: active.changed }
    : {
        kind: 'step',
        index: active.index,
        total: active.steps.length,
        title: active.steps[active.index].title,
        body: active.steps[active.index].body,
        primary: active.index < active.steps.length - 1 ? 'next' : active.next ? 'continue' : 'finish',
      };
  const shown = active.changed ? null : spot && spot.seq === active.seq && spot.index === active.index ? spot : null;
  return (
    <TourCard
      view={view}
      // The «screen changed» card goes in the center at once; a step's card waits until it has been measured.
      spot={active.changed ? 'center' : (shown?.card ?? null)}
      ring={shown?.ring ?? null}
      ids={{ title: titleId, body: bodyId }}
      dialogRef={dialog}
      cardRef={card}
      primaryRef={setPrimary}
      onBack={() => go(Math.max(0, active.index - 1))}
      onPrimary={onPrimary}
      onClose={() => close('seen')}
    />
  );
}
