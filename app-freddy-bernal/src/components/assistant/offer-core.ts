// When 360 offers a tutorial, its pure rules (R3, D-47, D-48; design §8.6). The widget draws a one-line strip next to
// its button: «¿Te muestro esta pantalla?» with «Sí, muéstrame» and an X («Ahora no»). Without nagging:
//  - only a tutorial of this screen for the person, with 2 steps or more on screen now (the engine says so), never on
//    a form screen or one with a fixed action bar;
//  - each tutorial once per person (its key, not the screen's), at most one strip per open tab and one a day;
//  - after the second X (anywhere) it stops for good on this phone for this person, and says so once; «Ayuda y guías»
//    turns it back on (offer-reset.tsx);
//  - after 4 s on the screen, never while typing, with a dialog open, with 360 open, with «Esa pantalla no es de tu
//    rol», with a tutorial running or while a tip shows; untouched, it goes away by itself after 12 s (that is no «no»);
//  - never opens 360, never takes the focus, never calls /api/asistente.
// What it remembers lives on the phone (device-store), per person; the phone's own switch (OFFER_DEVICE_OFF, set by
// the e2e suite) turns it off for everyone on it. No React and no real storage here (assistant-offer-core.test.ts).
import { readKey, writeKey, type KV } from '@/components/ui/device-store';
import { OFFER_DEVICE_OFF, OFFER_SESSION_KEY, TOUR_CAN_ANSWER_EVENT, TOUR_CAN_EVENT, offerKey, offerStateKey, readProgress, type TourCanAnswer } from '@/components/tour/tour-core';

export const OFFER_DELAY_MS = 4_000;
export const OFFER_RECHECK_MS = 1_000;
export const OFFER_AUTO_HIDE_MS = 12_000;
export const OFFER_OFF_HIDE_MS = 6_000;
// After this many «Ahora no», 360 stops offering on this phone for this person.
export const OFFER_MAX_NO = 2;

export const OFFER_LABEL = '360 te ofrece ayuda';
export const OFFER_TEXT = '¿Te muestro esta pantalla?';
export const OFFER_YES = 'Sí, muéstrame';
export const OFFER_NO = 'Ahora no';
export const OFFER_OFF_TEXT = 'Listo. La ayuda está en Mi cuenta → Ayuda y guías.';
export const WELCOME_TOUR = 'bienvenida';
export const welcomeText = (name: string) => `Hola, soy ${name.trim() || 'el asistente'}. ¿Te muestro cómo empezar?`;

// Form screens and screens with a fixed action bar (as screen patterns): the strip would cover what is being filled.
export const NO_OFFER_SCREENS = ['/agenda/nuevo', '/publicar/nueva', '/tweets/nueva', '/obras/nueva', '/reportes/nuevo', '/mensajes/canales/nuevo', '/mensajes/[id]', '/mensajes/[id]/editar', '/aprobar/[id]'];

/** What the widget gets of each of the person's tutorials (assistant-mount.tsx): never their steps. */
export type OfferTour = { id: string; screen: string; title: string; form?: boolean };

// ── The person's state on this phone: { no, off, dia } ─────────────────────────────────────────────────────────────

export type OfferState = { no: number; off: boolean; dia: string | null };

export function readOfferState(store: KV, userId: string): OfferState {
  const raw = readKey(store, offerStateKey(userId));
  try {
    const x = raw ? (JSON.parse(raw) as Partial<OfferState>) : {};
    return { no: Number.isFinite(x.no) && Number(x.no) > 0 ? Math.floor(Number(x.no)) : 0, off: x.off === true, dia: typeof x.dia === 'string' ? x.dia : null };
  } catch {
    return { no: 0, off: false, dia: null };
  }
}

function writeOfferState(store: KV, userId: string, s: OfferState): void {
  writeKey(store, offerStateKey(userId), JSON.stringify(s));
}

/** Today on the phone, as AAAA-MM-DD (one strip a day). */
export function dayOf(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

// ── One strip per open tab (sessionStorage) ─────────────────────────────────────────────────────────────────────────

export type TabKV = { getItem(k: string): string | null; setItem(k: string, v: string): void };
const tabMemory = new Map<string, string>();

// Without sessionStorage (private mode, blocked site data) the tab is remembered in memory until the page reloads.
function tabShown(tab: TabKV | null): boolean {
  try {
    if (tab) return tab.getItem(OFFER_SESSION_KEY) === '1';
  } catch {
    /* blocked: memory below */
  }
  return tabMemory.get(OFFER_SESSION_KEY) === '1';
}

function markTab(tab: TabKV | null): void {
  try {
    if (tab) {
      tab.setItem(OFFER_SESSION_KEY, '1');
      return;
    }
  } catch {
    /* blocked: memory below */
  }
  tabMemory.set(OFFER_SESSION_KEY, '1');
}

// ── The rules ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** Whether 360 may offer anything to this person on this phone today (the rules that do not depend on the moment). */
export function offerAllowed(o: { userId: string; store: KV; tab: TabKV | null; today: string }): boolean {
  if (readKey(o.store, OFFER_DEVICE_OFF) === '1') return false;
  const s = readOfferState(o.store, o.userId);
  if (s.off || s.dia === o.today) return false;
  return !tabShown(o.tab);
}

/** Whether this tutorial may still be offered to this person: never offered, never seen, not a form, not on a form. */
export function tourOfferable(o: { tour: OfferTour; userId: string; store: KV; screen: string | null }): boolean {
  if (o.tour.form || (o.screen && NO_OFFER_SCREENS.includes(o.screen))) return false;
  if (readKey(o.store, offerKey(o.userId, o.tour.id))) return false;
  return readProgress(o.store, o.userId, o.tour.id) === null;
}

/** What is going on on the screen right now: the strip waits while any of it holds. */
export type OfferMoment = {
  visibleMs: number; // how long this screen has been on display
  editing: boolean; // a field has the focus
  dialogOpen: boolean; // a dialog of the page is open
  panelOpen: boolean; // 360's panel is open
  tipVisible: boolean; // a tip («Consejo») shows: first the tip
  noPermission: boolean; // «Esa pantalla no es de tu rol» shows
  tourOpen: boolean; // a tutorial is running
};

export function momentOk(m: OfferMoment): boolean {
  return m.visibleMs >= OFFER_DELAY_MS && !m.editing && !m.dialogOpen && !m.panelOpen && !m.tipVisible && !m.noPermission && !m.tourOpen;
}

/** Everything at once (design §8.6): may this tutorial be offered right now? `available`: the engine says 2 steps or
 * more of it are on screen. */
export function shouldOffer(o: { tour: OfferTour; userId: string; store: KV; tab: TabKV | null; today: string; screen: string | null; available: boolean } & OfferMoment): boolean {
  return o.available && offerAllowed(o) && tourOfferable(o) && momentOk(o);
}

/** The strip went up: this tutorial counts as offered, today's strip is used and so is this tab's. */
export function markShown(o: { tourId: string; userId: string; store: KV; tab: TabKV | null; today: string }): void {
  writeKey(o.store, offerKey(o.userId, o.tourId), o.today);
  writeOfferState(o.store, o.userId, { ...readOfferState(o.store, o.userId), dia: o.today });
  markTab(o.tab);
}

/**
 * What the person did with the strip. «no» (the X) counts; with the second one 360 stops offering on this phone for
 * this person (`off`: the strip then says OFFER_OFF_TEXT once). «ignored» (it went away by itself) and «yes» do not
 * count. All of them leave the tutorial offered and today's strip used.
 */
export function rememberAnswer(o: { answer: 'yes' | 'no' | 'ignored'; tourId: string; userId: string; store: KV; today: string }): { off: boolean } {
  writeKey(o.store, offerKey(o.userId, o.tourId), o.today);
  const s = readOfferState(o.store, o.userId);
  const no = o.answer === 'no' ? s.no + 1 : s.no;
  const off = s.off || no >= OFFER_MAX_NO;
  writeOfferState(o.store, o.userId, { no, off, dia: o.today });
  return { off: off && !s.off };
}

// ── Which tutorial: the engine knows the screen and what is on it ───────────────────────────────────────────────────

type EventTarget = Pick<Window, 'addEventListener' | 'removeEventListener' | 'dispatchEvent'>;

/** The ids among `ids` that the tutorials' engine (tour-host.tsx) says belong to this screen and can run now, in its
 * order. It answers at once; with no engine mounted, none. */
export function availableHere(ids: readonly string[], target: EventTarget): string[] {
  const answers: TourCanAnswer[] = [];
  const onAnswer = (e: Event) => {
    const d = (e as CustomEvent<TourCanAnswer>).detail;
    if (d?.ok && ids.includes(d.id)) answers.push(d);
  };
  target.addEventListener(TOUR_CAN_ANSWER_EVENT, onAnswer);
  try {
    for (const id of ids) target.dispatchEvent(new CustomEvent(TOUR_CAN_EVENT, { detail: { id } }));
  } finally {
    target.removeEventListener(TOUR_CAN_ANSWER_EVENT, onAnswer);
  }
  return answers.sort((a, b) => a.order - b.order).map((a) => a.id);
}

/** The tutorial to offer now, if any: the first of this screen (engine order) that may be offered. */
export function pickOffer(o: { tours: readonly OfferTour[]; here: readonly string[]; userId: string; store: KV; screen: string | null }): OfferTour | null {
  for (const id of o.here) {
    const tour = o.tours.find((t) => t.id === id);
    if (tour && tourOfferable({ tour, userId: o.userId, store: o.store, screen: o.screen })) return tour;
  }
  return null;
}
