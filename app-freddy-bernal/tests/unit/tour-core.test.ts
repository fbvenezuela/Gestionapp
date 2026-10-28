// The tutorials' engine, its pure parts (R3, D-45, design §6.1): what is on screen (a fake DOM, as ui-phone.test.ts),
// which steps count when it starts (N never jumps), the text per role, which tutorials go with a screen and its tab,
// where the card goes (beside only with room, above or below, a tall target) and that the ring and the card never
// overlap. The real pixels are checked by tests/e2e/tours.spec.ts. All data here is invented.
import { describe, it, expect } from 'vitest';
import type { Tour, TourStep } from '@/lib/guides/types';
import { TOURS } from '@/lib/guides/tours';
import { toursForRoles } from '@/lib/guides';
import {
  EDGE,
  FIRST_TAB,
  MIN_STEPS,
  OFFER_DEVICE_OFF,
  RING_GAP,
  RING_PAD,
  TALL,
  bodyFor,
  cardSpot,
  firstVisible,
  offerKey,
  offerStateKey,
  overlaps,
  pathMatches,
  placeCard,
  planStep,
  readProgress,
  resolveSteps,
  ringOf,
  ringSpot,
  saveProgress,
  tourAvailable,
  tourForPath,
  tourKey,
  type Box,
  type TourDoc,
  type TourEl,
} from '@/components/tour/tour-core';

// ── A fake DOM: an element knows the selectors it matches itself (`is`) and its parent ──────────────────────────────

type Fake = TourEl & { is: string[]; parent: Fake | null };

function el(o: { is?: string[]; parent?: Fake | null; rect?: Partial<Box>; rects?: number } = {}): Fake {
  const rect = { top: 100, left: 20, width: 120, height: 40, ...o.rect };
  const me: Fake = {
    is: o.is ?? [],
    parent: o.parent ?? null,
    getClientRects: () => ({ length: o.rects ?? 1 }),
    getBoundingClientRect: () => rect,
    closest(sel: string) {
      for (let x: Fake | null = me; x; x = x.parent) if (x.is.includes(sel)) return x;
      return null;
    },
  };
  return me;
}

function fakeDoc(map: Record<string, Fake[]>): TourDoc {
  return {
    querySelectorAll(sel: string) {
      if (sel.includes('((')) throw new SyntaxError('not a selector');
      return map[sel] ?? [];
    },
  };
}

const step = (target: string[], body: TourStep['body'] = 'Un texto de prueba.', extra: Partial<TourStep> = {}): TourStep => ({ target, title: 'Paso', body, ...extra });
const tour = (over: Partial<Tour> = {}): Tour => ({ id: 'prueba', screen: '/hoy', roles: ['social'], title: 'Cómo se usa Hoy', steps: [], ...over });

describe('lo que está en la pantalla (firstVisible)', () => {
  it('toma el primero que se ve, en el orden de los selectores', () => {
    const hidden = el({ rects: 0 });
    const shown = el();
    const other = el();
    const doc = fakeDoc({ '[data-tour="a"]': [hidden], '[data-tour="b"]': [shown], '[data-tour="c"]': [other] });
    expect(firstVisible(['[data-tour="a"]', '[data-tour="b"]', '[data-tour="c"]'], doc)).toBe(shown);
    // Among several matches of one selector (a list of cards), the first one shown.
    expect(firstVisible(['x'], fakeDoc({ x: [hidden, other, shown] }))).toBe(other);
  });

  it('no cuenta lo que no tiene caja, lo de tamaño cero ni lo oculto a los lectores de pantalla', () => {
    const veiled = el({ is: ['[aria-hidden="true"]'] });
    const doc = fakeDoc({
      a: [el({ rects: 0 })],
      b: [el({ rect: { width: 0, height: 0 } })],
      c: [el({ parent: veiled })],
      d: [el({ parent: el({ is: ['[data-tour-dialog]'] }) })],
    });
    for (const s of ['a', 'b', 'c', 'd']) expect(firstVisible([s], doc), s).toBeNull();
  });

  it('salta lo que está dentro de un <details> cerrado, pero cuenta su <summary> (señala «Más», nunca lo abre)', () => {
    const menu = el({ is: ['details', 'details:not([open])'] });
    const summary = el({ is: ['summary'], parent: menu });
    const label = el({ parent: summary });
    const item = el({ parent: menu });
    const doc = fakeDoc({ item: [item], summary: [summary], label: [label] });
    expect(firstVisible(['item'], doc)).toBeNull();
    expect(firstVisible(['summary'], doc)).toBe(summary);
    expect(firstVisible(['label'], doc)).toBe(label);
    // A summary of ANOTHER menu inside the closed one is still inside it.
    const inner = el({ is: ['details'], parent: menu });
    const innerSummary = el({ is: ['summary'], parent: inner });
    expect(firstVisible(['inner'], fakeDoc({ inner: [innerSummary] }))).toBeNull();
    // Open: everything inside counts.
    const open = el({ is: ['details'] });
    expect(firstVisible(['x'], fakeDoc({ x: [el({ parent: open })] }))).not.toBeNull();
  });

  it('un selector que el navegador no entiende cuenta como que no encontró nada', () => {
    const ok = el();
    expect(firstVisible(['((roto', 'ok'], fakeDoc({ ok: [ok] }))).toBe(ok);
  });
});

describe('los pasos que se muestran: se cuentan una vez, al empezar', () => {
  const doc = fakeDoc({ a: [el()], b: [el({ rects: 0 })], c: [el()] });

  it('un paso sin objetivo a la vista no se cuenta; N = los que quedaron', () => {
    const t = tour({ steps: [step(['a']), step(['b']), step(['missing', 'c'])] });
    const got = resolveSteps(t, doc, ['social']);
    expect(got).toHaveLength(2);
    expect(got.map((s) => s.step.target)).toEqual([['a'], ['missing', 'c']]);
    expect(tourAvailable(t, doc, ['social'])).toBe(true);
  });

  it('con menos de 2 pasos a la vista no está disponible', () => {
    expect(MIN_STEPS).toBe(2);
    expect(tourAvailable(tour({ steps: [step(['a']), step(['b'])] }), doc, ['social'])).toBe(false);
    expect(tourAvailable(tour({ steps: [] }), doc, ['social'])).toBe(false);
  });

  it('un paso centrado cuenta aunque no tenga objetivo', () => {
    const t = tour({ steps: [step(['a']), step(['nada'], 'Centrado.', { placement: 'center' })] });
    const got = resolveSteps(t, doc, ['social']);
    expect(got).toHaveLength(2);
    expect(got[1].el).toBeNull();
  });

  it('el texto por rol: el del rol de la persona (en el orden del equipo); sin texto para su rol, el paso no sale', () => {
    const s = step(['a'], { boss: 'Lo tuyo nace aceptado.', dispatch: 'Le llega al jefe como «Por decidir».' });
    expect(bodyFor(s, ['dispatch'])).toBe('Le llega al jefe como «Por decidir».');
    expect(bodyFor(s, ['boss'])).toBe('Lo tuyo nace aceptado.');
    // Two roles: the boss's text first (the team's order), whatever order the session lists them in.
    expect(bodyFor(s, ['dispatch', 'boss'])).toBe('Lo tuyo nace aceptado.');
    expect(bodyFor(s, ['social'])).toBeNull();
    expect(bodyFor(step(['a'], 'Igual para todos.'), ['camera'])).toBe('Igual para todos.');
    const t = tour({ roles: ['boss', 'dispatch', 'social'], steps: [s, step(['c'])] });
    expect(resolveSteps(t, doc, ['social']).map((x) => x.body)).toEqual(['Un texto de prueba.']);
    expect(resolveSteps(t, doc, ['dispatch']).map((x) => x.body)).toEqual(['Le llega al jefe como «Por decidir».', 'Un texto de prueba.']);
  });
});

describe('qué tutoriales van con la pantalla (tourForPath)', () => {
  it('[id] es un segmento: ni más ni menos', () => {
    expect(pathMatches('/eventos/[id]', '/eventos/ab12')).toBe(true);
    expect(pathMatches('/eventos/[id]', '/eventos/ab12/')).toBe(true);
    expect(pathMatches('/eventos/[id]', '/eventos')).toBe(false);
    expect(pathMatches('/eventos/[id]', '/eventos/ab12/lectura')).toBe(false);
    expect(pathMatches('/eventos/[id]/lectura', '/eventos/ab12/lectura')).toBe(true);
    expect(pathMatches('/hoy', '/hoyy')).toBe(false);
  });

  const event = tour({ id: 'evento-redes', screen: '/eventos/[id]', roles: ['social'] });
  const board = tour({ id: 'evento-redes-storyboard', screen: '/eventos/[id]?tab=storyboard', roles: ['social'] });
  const material = tour({ id: 'evento-redes-material', screen: '/eventos/[id]?tab=material', roles: ['social'] });
  const all = [event, board, material];
  const ids = (list: Tour[]) => list.map((t) => t.id);

  it('un tutorial con ?tab= va solo con esa pestaña; uno sin tab, con la primera (sin tab en la dirección)', () => {
    expect(FIRST_TAB['/eventos/[id]']).toBe('ficha');
    expect(ids(tourForPath('/eventos/ab12', '', all))).toEqual(['evento-redes']);
    expect(ids(tourForPath('/eventos/ab12', '?tab=ficha', all))).toEqual(['evento-redes']);
    expect(ids(tourForPath('/eventos/ab12', '?tab=storyboard', all))).toEqual(['evento-redes-storyboard']);
    expect(ids(tourForPath('/eventos/ab12', new URLSearchParams('tab=material&x=1'), all))).toEqual(['evento-redes-material']);
    expect(ids(tourForPath('/eventos/ab12', '?tab=piezas', all))).toEqual([]);
    // The tab the page marks as current wins over the address (Grabación lands on Material without ?tab=).
    expect(ids(tourForPath('/eventos/ab12', '', all, { tab: 'material' }))).toEqual(['evento-redes-material']);
    expect(ids(tourForPath('/eventos/ab12/lectura', '', all))).toEqual([]);
  });

  it('/aprobar sin tab es la de piezas; ?tab=tweets, la de tweets', () => {
    const pieces = tour({ id: 'aprobar', screen: '/aprobar', roles: ['boss'] });
    const tweets = tour({ id: 'aprobar-tweets', screen: '/aprobar?tab=tweets', roles: ['boss'] });
    expect(ids(tourForPath('/aprobar', null, [pieces, tweets]))).toEqual(['aprobar']);
    expect(ids(tourForPath('/aprobar', '?tab=tweets', [pieces, tweets]))).toEqual(['aprobar-tweets']);
  });

  it('en el inicio, bienvenida primero y después el del inicio del rol; en el resto, los de menos roles primero', () => {
    const mine = toursForRoles(['social']);
    expect(ids(tourForPath('/hoy', '', mine, { home: '/hoy' }))).toEqual(['bienvenida', 'hoy-redes']);
    // Without a home (or on another screen), bienvenida does not go.
    expect(ids(tourForPath('/hoy', '', mine))).toEqual(['hoy-redes']);
    expect(ids(tourForPath('/agenda', '', mine, { home: '/hoy' }))).toEqual([]);
    // The catalogue order does not matter: the shared one goes after the role's own.
    const shared = tour({ id: 'compartido', screen: '/biblioteca', roles: ['dispatch', 'social', 'boss'] });
    const own = tour({ id: 'propio', screen: '/biblioteca', roles: ['social'] });
    expect(ids(tourForPath('/biblioteca', '', [shared, own]))).toEqual(['propio', 'compartido']);
  });

  it('bienvenida encadena el tutorial del inicio del rol (toursForRoles), y solo si existe', () => {
    expect(toursForRoles(['social']).find((t) => t.id === 'bienvenida')?.next).toBe('hoy-redes');
    expect(TOURS.find((t) => t.id === 'bienvenida')?.next).toBe('@home');
  });
});

describe('dónde va la tarjeta (U5)', () => {
  const phone = { width: 360, height: 640 };
  const bars = { top: 64, bottom: 64 };
  const card = { width: 336, height: 210 };

  it('sin objetivo, al centro', () => {
    expect(placeCard(null, card, phone, bars)).toBe('center');
  });

  it('en el teléfono: objetivo en la mitad de abajo → arriba, bajo la barra; en la de arriba → abajo, sobre la barra', () => {
    expect(placeCard({ top: 420, left: 16, width: 328, height: 80 }, card, phone, bars)).toBe('top');
    expect(placeCard({ top: 90, left: 16, width: 328, height: 80 }, card, phone, bars)).toBe('bottom');
    expect(cardSpot('top', null, card, phone, bars).top).toBe(64 + EDGE);
    expect(cardSpot('bottom', null, card, phone, bars).top).toBe(640 - 64 - EDGE - 210);
    expect(cardSpot('bottom', null, card, phone, bars).left).toBe(12);
    // The bars themselves (they stay put): the phone's bar → card above; the top bar's buttons → card below.
    expect(planStep({ top: 576, left: 0, width: 360, height: 64 }, card, phone, bars, true)).toEqual({ place: 'top', scrollBy: 0 });
    expect(planStep({ top: 10, left: 300, width: 44, height: 44 }, card, phone, bars, true)).toEqual({ place: 'bottom', scrollBy: 0 });
  });

  it('«al lado» solo si a ese lado cabe la tarjeta más 16 px', () => {
    const desk = { width: 1024, height: 768 };
    const deskBars = { top: 64, bottom: 0 };
    const wide = { width: 352, height: 210 };
    // The side menu of a computer: room on its right.
    expect(placeCard({ top: 80, left: 16, width: 216, height: 320 }, wide, desk, deskBars)).toBe('beside-right');
    // The bell, right in the top bar of an iPad: room on its left only.
    expect(placeCard({ top: 10, left: 700, width: 44, height: 44 }, wide, { width: 810, height: 1080 }, deskBars)).toBe('beside-left');
    // A card of the page in the middle: no room on either side.
    expect(placeCard({ top: 300, left: 264, width: 430, height: 120 }, wide, desk, deskBars)).toBe('bottom');
    // On a phone it never fits beside.
    expect(placeCard({ top: 300, left: 300, width: 40, height: 40 }, card, phone, bars)).not.toMatch(/^beside/);
  });

  it('un objetivo más alto que el 45 % de la pantalla: su borde de arriba bajo la barra y la tarjeta abajo', () => {
    const t = { top: 300, left: 16, width: 328, height: TALL * 640 + 10 };
    const plan = planStep(t, card, phone, bars);
    expect(plan.place).toBe('bottom');
    expect(t.top - RING_PAD - plan.scrollBy).toBe(64 + EDGE);
  });

  it('un objetivo de la página fuera de la vista se trae a la franja libre (centrado en ella)', () => {
    const plan = planStep({ top: 1500, left: 16, width: 328, height: 100 }, card, phone, bars);
    expect(plan.place).toBe('top');
    const after = 1500 - plan.scrollBy;
    const lo = 64 + EDGE + 210 + RING_GAP;
    const hi = 640 - 64;
    expect(after - RING_PAD).toBeGreaterThanOrEqual(lo);
    expect(after + 100 + RING_PAD).toBeLessThanOrEqual(hi);
    // Already in its band: no scroll.
    expect(planStep({ top: 90, left: 16, width: 328, height: 100 }, card, phone, bars).scrollBy).toBe(0);
  });

  it('un objetivo fijo que no cabe ni arriba ni abajo de la tarjeta: tarjeta al centro y el anillo encima', () => {
    expect(planStep({ top: 150, left: 16, width: 328, height: 400 }, card, phone, bars, true).place).toBe('center');
  });

  // Many targets, the way the host uses it: plan, scroll (a target in the page moves), then card and ring.
  it('el anillo y la tarjeta nunca se cruzan (salvo al centro, donde el anillo va encima)', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const screens = [
      { vp: { width: 360, height: 640 }, bars: { top: 64, bottom: 64 }, card: { width: 336, height: 230 } },
      { vp: { width: 360, height: 760 }, bars: { top: 64, bottom: 64 }, card: { width: 336, height: 190 } },
      { vp: { width: 810, height: 1080 }, bars: { top: 64, bottom: 64 }, card: { width: 352, height: 200 } },
      { vp: { width: 1024, height: 768 }, bars: { top: 64, bottom: 0 }, card: { width: 352, height: 200 } },
    ];
    let checked = 0;
    let whole = 0;
    for (const s of screens) {
      for (let i = 0; i < 400; i++) {
        const width = 20 + rnd() * (s.vp.width - 40);
        const height = 20 + rnd() * s.vp.height * 0.9;
        const pinned = rnd() < 0.3;
        const top = pinned ? rnd() * (s.vp.height - height) : -800 + rnd() * 2400;
        // In the page, at least 8 px from the sides (main has 16 px of padding): the ring is not cut there.
        const t0 = { top, left: 8 + rnd() * (s.vp.width - width - 16), width, height };
        const plan = planStep(t0, s.card, s.vp, s.bars, pinned);
        const t = { ...t0, top: t0.top - plan.scrollBy };
        const spot = cardSpot(plan.place, t, s.card, s.vp, s.bars);
        const cardBox = { ...spot, ...s.card };
        // The card stays on the screen, off the bars.
        expect(cardBox.left).toBeGreaterThanOrEqual(0);
        expect(cardBox.left + cardBox.width).toBeLessThanOrEqual(s.vp.width);
        expect(cardBox.top).toBeGreaterThanOrEqual(s.bars.top);
        expect(cardBox.top + cardBox.height).toBeLessThanOrEqual(s.vp.height - s.bars.bottom);
        const ring = ringSpot(t, plan.place, spot.top, s.card, s.vp);
        if (!ring || plan.place === 'center') continue;
        expect(overlaps(ring, cardBox), JSON.stringify({ s, t0, plan })).toBe(false);
        checked++;
        // A target of the page that fits whole beside the card is ringed whole: target + 4 px all around.
        const band = s.vp.height - s.bars.top - s.bars.bottom - EDGE - s.card.height - RING_GAP;
        if (!pinned && (plan.place === 'top' || plan.place === 'bottom') && height + 2 * RING_PAD <= band && height <= TALL * s.vp.height) {
          const want = ringOf(t);
          for (const k of ['top', 'left', 'width', 'height'] as const) expect(ring[k], `${k} ${JSON.stringify({ s, t0, plan })}`).toBeCloseTo(want[k], 6);
          whole++;
        }
      }
    }
    expect(checked).toBeGreaterThan(500);
    expect(whole).toBeGreaterThan(100);
  });

  it('el anillo es el objetivo más 4 px; uno alto con la tarjeta abajo muestra su parte de arriba', () => {
    const t = { top: 100, left: 16, width: 328, height: 80 };
    expect(ringSpot(t, 'bottom', 400, card, phone)).toEqual(ringOf(t));
    const tall = { top: 80, left: 16, width: 328, height: 500 };
    const cut = ringSpot(tall, 'bottom', 354, card, phone)!;
    expect(cut.top).toBe(76);
    expect(cut.top + cut.height).toBe(354 - RING_GAP / 2);
    // Cut at the screen's edges (the phone's bar touches them).
    expect(ringSpot({ top: 576, left: 0, width: 360, height: 64 }, 'top', 76, card, phone)).toEqual({ top: 572, left: 0, width: 360, height: 68 });
    // Nothing left to show.
    expect(ringSpot({ top: 500, left: 16, width: 100, height: 40 }, 'bottom', 300, card, phone)).toBeNull();
  });
});

describe('lo que recuerda el teléfono (D-48): por persona, nunca en la base', () => {
  const store = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
  };

  it('las claves llevan la persona y el tutorial', () => {
    expect(tourKey('u1', 'bienvenida')).toBe('fb:tour:u1:bienvenida');
    expect(offerKey('u1', 'hoy-redes')).toBe('fb:360:oferta:u1:hoy-redes');
    expect(offerStateKey('u1')).toBe('fb:360:oferta:u1');
    expect(OFFER_DEVICE_OFF).toBe('fb:360:oferta:off');
  });

  it('«terminado» no vuelve a «visto»; otra persona en el mismo teléfono empieza de cero', () => {
    const s = store();
    expect(readProgress(s, 'u1', 'bienvenida')).toBeNull();
    saveProgress(s, 'u1', 'bienvenida', 'seen');
    expect(readProgress(s, 'u1', 'bienvenida')).toBe('seen');
    saveProgress(s, 'u1', 'bienvenida', 'done');
    saveProgress(s, 'u1', 'bienvenida', 'seen');
    expect(readProgress(s, 'u1', 'bienvenida')).toBe('done');
    expect(readProgress(s, 'u2', 'bienvenida')).toBeNull();
    s.m.set(tourKey('u3', 'x'), 'basura');
    expect(readProgress(s, 'u3', 'x')).toBeNull();
  });
});
