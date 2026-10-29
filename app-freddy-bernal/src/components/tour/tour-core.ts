// The tutorials' engine, its pure parts (R3, D-45, design §6.1): which tutorials go with a screen, which steps can be
// shown right now (counted once, when the tutorial starts, so «Paso n de N» never jumps), the text for the person's
// role, where the card goes so it never covers the ring, and what this phone remembers. No React and no real DOM:
// tests/unit/tour-core.test.ts runs it with a fake one. The client parts are tour-host.tsx and tour-card.tsx.
import { TEAM_ROLES, type Role } from '@/lib/roles';
import type { Tour, TourStep } from '@/lib/guides/types';
import { HOME_SCREEN } from '@/lib/guides/tours';
import { readKey, writeKey, type KV } from '@/components/ui/device-store';

// ── Events between the engine, «Mi cuenta» and 360 (window CustomEvents) ──────────────────────────────────────────

/** Start a tutorial of this screen: detail { id, opener? } (opener: where the focus goes back to). */
export const TOUR_START_EVENT = 'fb:tour:start';
/** Sent by the engine when a tutorial opens or closes: detail { state: 'open' | 'closed', id }. */
export const TOUR_STATE_EVENT = 'fb:tour:state';
/** «Can this tutorial run here, now?»: detail { id }. Answered at once with TOUR_CAN_ANSWER_EVENT. */
export const TOUR_CAN_EVENT = 'fb:tour:can';
/** detail { id, ok, order }: ok = it belongs to this screen and 2 or more of its steps are on screen now; order = its
 * place among this screen's tutorials (tourForPath), to list them in that order. */
export const TOUR_CAN_ANSWER_EVENT = 'fb:tour:can:answer';
/** ?tutorial=<id> on any screen starts that tutorial (from 360, from a link); the engine then drops it from the address. */
export const TOUR_PARAM = 'tutorial';

export type TourStartDetail = { id: string; opener?: unknown };
export type TourStateDetail = { state: 'open' | 'closed'; id: string };
export type TourCanDetail = { id: string };
export type TourCanAnswer = { id: string; ok: boolean; order: number };

// ── What the phone remembers (D-48): per person, never in the database ─────────────────────────────────────────────

export const tourKey = (userId: string, id: string) => `fb:tour:${userId}:${id}`;
export const offerKey = (userId: string, id: string) => `fb:360:oferta:${userId}:${id}`;
export const offerStateKey = (userId: string) => `fb:360:oferta:${userId}`;
// The phone's own switch, not the person's: 360 never offers help on this phone (the e2e suite sets it).
export const OFFER_DEVICE_OFF = 'fb:360:oferta:off';
// In sessionStorage: one offer per open tab.
export const OFFER_SESSION_KEY = 'fb:360:oferta-sesion';

export type TourProgress = 'seen' | 'done';

export function readProgress(store: KV, userId: string, id: string): TourProgress | null {
  const v = readKey(store, tourKey(userId, id));
  return v === 'seen' || v === 'done' ? v : null;
}

/** «done» (finished) stays: leaving it half-way later does not turn it back into «seen». */
export function saveProgress(store: KV, userId: string, id: string, p: TourProgress): void {
  if (p === 'seen' && readProgress(store, userId, id) === 'done') return;
  writeKey(store, tourKey(userId, id), p);
}

// ── Which tutorials go with this screen ─────────────────────────────────────────────────────────────────────────────

// The screens with tabs, and the tab their address shows without ?tab= (eventos/[id]/page.tsx, aprobar/page.tsx).
// Grabación lands on Material without ?tab=: the engine reads the tab the page marks as current when there is one.
export const FIRST_TAB: Record<string, string> = { '/eventos/[id]': 'ficha', '/aprobar': 'piezas' };

export type SearchLike = string | { get(name: string): string | null };

const searchTab = (search: SearchLike | null | undefined): string | null => {
  if (!search) return null;
  const p = typeof search === 'string' ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search) : search;
  return p.get('tab') || null;
};

export function parseScreen(screen: string): { path: string; tab: string | null } {
  const [path, query = ''] = screen.split('?');
  return { path, tab: new URLSearchParams(query).get('tab') || null };
}

/** A SCREENS pattern against a real path: '[id]' (any '[name]') stands for one segment. */
export function pathMatches(pattern: string, pathname: string): boolean {
  const clean = (p: string) => p.replace(/\/+$/, '') || '/';
  const a = clean(pattern).split('/');
  const b = clean(pathname).split('/');
  return a.length === b.length && a.every((seg, i) => (/^\[[^\]]+\]$/.test(seg) ? b[i] !== '' : seg === b[i]));
}

/**
 * The tutorials of this screen (`tours` are already the person's, toursForRoles), in the order they are listed and
 * offered: the person's home first with `bienvenida` (screen '@home', on `home`) and then the home's own; then the
 * ones for fewer roles before the shared ones; catalogue order otherwise. A tutorial with ?tab= goes only with that
 * tab; one without goes with the first tab. `tab` is the tab the page marks as current, when it marks one. A screen
 * with a tutorial of its own is not another screen's [param] too: /redes/feed is the feed, never a section of
 * /redes/[formato] (R4), as /obras/nueva is never an obra's /obras/[id].
 */
export function tourForPath(
  pathname: string,
  search: SearchLike | null | undefined,
  tours: readonly Tour[],
  opts: { home?: string | null; tab?: string | null } = {},
): Tour[] {
  const own = tours.some((t) => t.screen !== HOME_SCREEN && !parseScreen(t.screen).path.includes('[') && pathMatches(parseScreen(t.screen).path, pathname));
  const found = tours.flatMap((t, i) => {
    if (t.screen === HOME_SCREEN) return opts.home && pathMatches(opts.home, pathname) ? [{ t, i, home: true }] : [];
    const { path, tab } = parseScreen(t.screen);
    if (!pathMatches(path, pathname) || (own && path.includes('['))) return [];
    const first = FIRST_TAB[path] ?? null;
    const here = opts.tab ?? searchTab(search) ?? first;
    return (tab ?? first) === here ? [{ t, i, home: false }] : [];
  });
  found.sort((x, y) => Number(y.home) - Number(x.home) || x.t.roles.length - y.t.roles.length || x.i - y.i);
  return found.map((f) => f.t);
}

// ── The text of a step for this person ──────────────────────────────────────────────────────────────────────────────

/** The step's text for these roles: its only text, or the one of the person's role (the roles in the team's order:
 * the boss's before despacho's…). A step with texts per role and none for this person is not shown (null). */
export function bodyFor(step: TourStep, roles: readonly Role[]): string | null {
  const b = step.body;
  if (typeof b === 'string') return b;
  for (const r of TEAM_ROLES) if (roles.includes(r) && b[r]) return b[r]!;
  return null;
}

// ── Which steps are on screen (a fake DOM in the tests) ────────────────────────────────────────────────────────────

export type BoxLike = { top: number; left: number; width: number; height: number };
export type TourEl = {
  getClientRects(): { length: number };
  getBoundingClientRect(): BoxLike;
  closest(selector: string): TourEl | null;
};
export type TourDoc = { querySelectorAll(selector: string): ArrayLike<TourEl> };

/** Drawn on screen: it has a box, is not hidden from screen readers, is not the engine's own dialog, and is not inside
 * a closed <details> (a menu's items; its <summary> does count: the engine points at «Más», never opens it). */
export function isShown(el: TourEl): boolean {
  if (el.getClientRects().length === 0) return false;
  const r = el.getBoundingClientRect();
  if (r.width <= 0 && r.height <= 0) return false;
  if (el.closest('[aria-hidden="true"]') || el.closest('[data-tour-dialog]')) return false;
  const closed = el.closest('details:not([open])');
  if (closed) {
    const summary = el.closest('summary');
    if (!summary || summary.closest('details') !== closed) return false;
  }
  return true;
}

/** The first shown element of the first selector that has one (selectors in order of preference). */
export function firstVisible(selectors: readonly string[], doc: TourDoc): TourEl | null {
  for (const sel of selectors) {
    let list: ArrayLike<TourEl>;
    try {
      list = doc.querySelectorAll(sel);
    } catch {
      continue; // a selector the browser does not understand: as if nothing matched
    }
    for (let i = 0; i < list.length; i++) if (isShown(list[i])) return list[i];
  }
  return null;
}

export type ResolvedStep = { step: TourStep; el: TourEl | null; body: string };

// Fewer than this many steps on screen: the tutorial is not offered (and «Ver el tutorial» does not list it).
export const MIN_STEPS = 2;

/** The steps that can be shown now, each with its element and its text: done ONCE when the tutorial starts (after
 * the page stopped loading). A step without a shown target is not counted (unless it is a centered one). */
export function resolveSteps(tour: Tour, doc: TourDoc, roles: readonly Role[]): ResolvedStep[] {
  return tour.steps.flatMap((step) => {
    const body = bodyFor(step, roles);
    if (!body) return [];
    const el = firstVisible(step.target, doc);
    if (!el && step.placement !== 'center') return [];
    return [{ step, el, body }];
  });
}

export function tourAvailable(tour: Tour, doc: TourDoc, roles: readonly Role[]): boolean {
  return resolveSteps(tour, doc, roles).length >= MIN_STEPS;
}

// ── Where the card goes (U5): never over the ring ──────────────────────────────────────────────────────────────────

export type Box = { top: number; left: number; width: number; height: number };
export type Size = { width: number; height: number };
// The parts of the screen the bars cover: the top bar (64 px) and the phone's bottom bar with the safe area.
export type Bars = { top: number; bottom: number };
export type Place = 'top' | 'bottom' | 'beside-left' | 'beside-right' | 'center';

export const EDGE = 12; // from the screen's edges and from the bars (the card is 100vw - 24 px wide on a phone)
export const BESIDE_GAP = 16; // between the target and a card beside it
export const RING_PAD = 4; // the ring goes this much outside the target
export const RING_GAP = 8; // between the ring and the card
export const TALL = 0.45; // a target taller than this share of the screen: its top goes under the bar, the card below

const bottomOf = (b: Box) => b.top + b.height;
const rightOf = (b: Box) => b.left + b.width;
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

export function ringOf(target: Box): Box {
  return { top: target.top - RING_PAD, left: target.left - RING_PAD, width: target.width + 2 * RING_PAD, height: target.height + 2 * RING_PAD };
}

function besideSide(target: Box, card: Size, vp: Size, bars: Bars): Place | null {
  if (vp.height - bars.top - bars.bottom < card.height + 2 * EDGE) return null;
  const need = card.width + BESIDE_GAP + EDGE;
  const right = vp.width - rightOf(target);
  const left = target.left;
  if (right >= need && right >= left) return 'beside-right';
  if (left >= need) return 'beside-left';
  return right >= need ? 'beside-right' : null;
}

/** Where the card sits for a place: the card's top and left corner. */
export function cardSpot(place: Place, target: Box | null, card: Size, vp: Size, bars: Bars): { top: number; left: number } {
  const minTop = bars.top + EDGE;
  const maxTop = vp.height - bars.bottom - EDGE - card.height;
  const centerLeft = clamp(target ? target.left + target.width / 2 - card.width / 2 : (vp.width - card.width) / 2, EDGE, vp.width - EDGE - card.width);
  switch (place) {
    case 'top':
      return { top: minTop, left: centerLeft };
    case 'bottom':
      return { top: Math.max(minTop, maxTop), left: centerLeft };
    case 'beside-right':
      return { top: clamp(target!.top, minTop, maxTop), left: rightOf(target!) + BESIDE_GAP };
    case 'beside-left':
      return { top: clamp(target!.top, minTop, maxTop), left: target!.left - BESIDE_GAP - card.width };
    default:
      return { top: clamp(bars.top + (vp.height - bars.top - bars.bottom - card.height) / 2, EDGE, maxTop), left: clamp((vp.width - card.width) / 2, EDGE, vp.width - EDGE - card.width) };
  }
}

// The band of the screen a target's ring may use with the card at `place`. A target that stays put (the bars, 360's
// button) may sit under the bars; one in the page may not (the top bar is drawn over the page).
function band(place: 'top' | 'bottom', card: Size, vp: Size, bars: Bars, pinned: boolean): [number, number] {
  const spot = cardSpot(place, null, card, vp, bars);
  const lo = pinned ? 0 : bars.top;
  const hi = pinned ? vp.height : vp.height - bars.bottom;
  return place === 'top' ? [spot.top + card.height + RING_GAP, hi] : [lo, spot.top - RING_GAP];
}

/** How far to scroll so the ring sits in [lo, hi]: 0 when it already does; centered in it otherwise; its top at `lo`
 * when it is taller than the band. */
function scrollInto(ring: Box, lo: number, hi: number): number {
  if (ring.top >= lo && bottomOf(ring) <= hi) return 0;
  if (ring.height > hi - lo) return ring.top - lo;
  return ring.top + ring.height / 2 - (lo + hi) / 2;
}

export type Plan = { place: Place; scrollBy: number };

/**
 * Where the card goes for this step and how far to scroll the page first (`pinned`: the target does not move when the
 * page scrolls, such as the bars and 360's button). Beside the target when there is room on that side; otherwise
 * above it when the target is in the lower half, below it when in the upper half. A target taller than TALL of the
 * screen has its top brought under the bar, with the card below (the ring then shows its upper part, ringSpot). When
 * nothing fits, a pinned target gets the card in the center with the ring drawn over it.
 */
export function planStep(target: Box | null, card: Size, vp: Size, bars: Bars, pinned = false): Plan {
  if (!target) return { place: 'center', scrollBy: 0 };
  const full = ringOf(target);
  // A pinned target is measured as the ring will be drawn: cut at the screen's edges (the phone's bar touches them).
  const top = pinned ? Math.max(full.top, 0) : full.top;
  const ring = pinned ? { ...full, top, height: Math.min(bottomOf(full), vp.height) - top } : full;
  const beside = besideSide(target, card, vp, bars);
  if (beside) return { place: beside, scrollBy: pinned ? 0 : scrollInto(ring, bars.top + EDGE, vp.height - bars.bottom - EDGE) };
  if (!pinned && target.height > TALL * vp.height) return { place: 'bottom', scrollBy: ring.top - (bars.top + EDGE) };
  const first: 'top' | 'bottom' = target.top + target.height / 2 > vp.height / 2 ? 'top' : 'bottom';
  for (const place of [first, first === 'top' ? 'bottom' : 'top'] as const) {
    const [lo, hi] = band(place, card, vp, bars, pinned);
    if (pinned ? ring.top >= lo && bottomOf(ring) <= hi : ring.height <= hi - lo) return { place, scrollBy: pinned ? 0 : scrollInto(ring, lo, hi) };
  }
  return pinned ? { place: 'center', scrollBy: 0 } : { place: 'bottom', scrollBy: ring.top - (bars.top + EDGE) };
}

/** The place alone (design §6.1): `planStep(...).place`. */
export function placeCard(target: Box | null, card: Size, vp: Size, bars: Bars, pinned = false): Place {
  return planStep(target, card, vp, bars, pinned).place;
}

/**
 * The ring for the target where it is now, on the screen and never over the card: cut at the screen's edges and, with
 * the card above or below, at the card (a tall target shows its upper part). Null when nothing of it is left to show.
 * In the center (no room anywhere) it is not cut: it is drawn over the card.
 */
export function ringSpot(target: Box, place: Place, cardTop: number, card: Size, vp: Size): Box | null {
  const r = ringOf(target);
  let top = Math.max(r.top, 0);
  let bottom = Math.min(bottomOf(r), vp.height);
  const left = Math.max(r.left, 0);
  const right = Math.min(rightOf(r), vp.width);
  if (place === 'bottom') bottom = Math.min(bottom, cardTop - RING_GAP / 2);
  if (place === 'top') top = Math.max(top, cardTop + card.height + RING_GAP / 2);
  if (bottom - top < 4 || right - left < 4) return null;
  return { top, left, width: right - left, height: bottom - top };
}

/** Whether two boxes overlap (the e2e and the unit tests check card and ring never do). */
export function overlaps(a: Box, b: Box): boolean {
  return a.left < rightOf(b) && b.left < rightOf(a) && a.top < bottomOf(b) && b.top < bottomOf(a);
}
