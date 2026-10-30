// 360 offers a tutorial without nagging (R3, D-47, D-48; design §8.6): the pure rules of offer-core.ts, one by one,
// and the rules its widget code keeps. Fake storage; nothing of the browser.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import type { KV } from '@/components/ui/device-store';
import { OFFER_DEVICE_OFF, OFFER_SESSION_KEY, TOUR_CAN_ANSWER_EVENT, TOUR_CAN_EVENT, offerKey, offerStateKey, tourKey } from '@/components/tour/tour-core';
import {
  NO_OFFER_SCREENS,
  OFFER_AUTO_HIDE_MS,
  OFFER_DELAY_MS,
  OFFER_MAX_NO,
  OFFER_OFF_TEXT,
  OFFER_TEXT,
  availableHere,
  dayOf,
  markShown,
  momentOk,
  offerAllowed,
  pickOffer,
  readOfferState,
  rememberAnswer,
  shouldOffer,
  tourOfferable,
  welcomeText,
  type OfferMoment,
  type OfferTour,
  type TabKV,
} from '@/components/assistant/offer-core';
import { OFFER_OFF_KEY, e2eOrigins, quietState } from '../e2e/global-setup';
import { offerIsOff } from '@/components/guides/offer-reset';
import { TOURS } from '@/lib/guides';

const U = 'u-1';
const TODAY = '2026-10-28';
const store = (): KV & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
};
const tab = (): TabKV & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
};
const QUIET: OfferMoment = { visibleMs: OFFER_DELAY_MS, editing: false, dialogOpen: false, panelOpen: false, tipVisible: false, noPermission: false, tourOpen: false };
// A tutorial of a screen with a pattern (R4: a section of Redes; «Piezas» became Redes by format).
const SECCION: OfferTour = { id: 'redes-seccion', screen: '/redes/[formato]', title: 'Cómo se usa una sección de Redes' };
const base = (s: KV, t: TabKV | null, over: Partial<Parameters<typeof shouldOffer>[0]> = {}) => ({ tour: SECCION, userId: U, store: s, tab: t, today: TODAY, screen: '/redes/[formato]', available: true, ...QUIET, ...over });

describe('cuándo se ofrece (D-47)', () => {
  it('con todo en calma, a los 4 s, un tutorial de la pantalla con 2 pasos o más', () => {
    expect(shouldOffer(base(store(), tab()))).toBe(true);
    expect(OFFER_DELAY_MS).toBe(4000);
    expect(OFFER_AUTO_HIDE_MS).toBe(12000);
  });

  it('nunca con la llave del teléfono (la ponen los e2e), ni para otra persona en el mismo teléfono si la apagó', () => {
    const s = store();
    s.setItem(OFFER_DEVICE_OFF, '1');
    expect(shouldOffer(base(s, tab()))).toBe(false);
    const s2 = store();
    s2.setItem(offerStateKey('otra'), JSON.stringify({ no: 2, off: true, dia: '2026-10-01' }));
    expect(shouldOffer(base(s2, tab()))).toBe(true);
    expect(shouldOffer(base(s2, tab(), { userId: 'otra' }))).toBe(false);
  });

  it('como mucho una por día y una por pestaña', () => {
    const s = store();
    s.setItem(offerStateKey(U), JSON.stringify({ no: 0, off: false, dia: TODAY }));
    expect(shouldOffer(base(s, tab()))).toBe(false);
    expect(shouldOffer(base(s, tab(), { today: '2026-10-29' }))).toBe(true);
    const t = tab();
    t.setItem(OFFER_SESSION_KEY, '1');
    expect(shouldOffer(base(store(), t))).toBe(false);
  });

  it('cada tutorial una vez por persona: ya ofrecido, visto o terminado → no (la clave es el tutorial)', () => {
    for (const [k, v] of [[offerKey(U, 'redes-seccion'), TODAY], [tourKey(U, 'redes-seccion'), 'seen'], [tourKey(U, 'redes-seccion'), 'done']]) {
      const s = store();
      s.setItem(k, v);
      expect(shouldOffer(base(s, tab())), k).toBe(false);
      expect(shouldOffer(base(s, tab(), { tour: { ...SECCION, id: 'pieza' } })), k).toBe(true);
    }
  });

  it('nunca en pantallas de formulario o con barra fija, ni un tutorial de formulario, ni con menos de 2 pasos', () => {
    expect(NO_OFFER_SCREENS).toEqual(['/agenda/nuevo', '/publicar/nueva', '/tweets/nueva', '/obras/nueva', '/reportes/nuevo', '/mensajes/nueva', '/mensajes/[id]', '/aprobar/[id]']);
    for (const screen of NO_OFFER_SCREENS) expect(shouldOffer(base(store(), tab(), { screen })), screen).toBe(false);
    expect(shouldOffer(base(store(), tab(), { tour: { ...SECCION, form: true } }))).toBe(false);
    expect(shouldOffer(base(store(), tab(), { available: false }))).toBe(false);
    // Every form tutorial of the catalogue is marked so, and its screen is one of those.
    for (const t of TOURS.filter((x) => x.form)) expect(NO_OFFER_SCREENS, t.id).toContain(t.screen);
  });

  it('nunca antes de 4 s, escribiendo, con un diálogo, con 360 abierto, con un consejo, con «sin permiso» o con un tutorial', () => {
    expect(momentOk(QUIET)).toBe(true);
    expect(momentOk({ ...QUIET, visibleMs: OFFER_DELAY_MS - 1 })).toBe(false);
    for (const k of ['editing', 'dialogOpen', 'panelOpen', 'tipVisible', 'noPermission', 'tourOpen'] as const) {
      expect(momentOk({ ...QUIET, [k]: true }), k).toBe(false);
      expect(shouldOffer(base(store(), tab(), { [k]: true })), k).toBe(false);
    }
  });
});

describe('lo que recuerda el teléfono (D-48)', () => {
  it('al salir la franja: el tutorial queda ofrecido, se gasta la del día y la de la pestaña', () => {
    const s = store();
    const t = tab();
    markShown({ tourId: 'redes-seccion', userId: U, store: s, tab: t, today: TODAY });
    expect(s.data.get(offerKey(U, 'redes-seccion'))).toBe(TODAY);
    expect(readOfferState(s, U)).toEqual({ no: 0, off: false, dia: TODAY });
    expect(t.data.get(OFFER_SESSION_KEY)).toBe('1');
    expect(offerAllowed({ userId: U, store: s, tab: tab(), today: TODAY })).toBe(false);
  });

  it('la segunda X la apaga para siempre (y lo dice una vez); «sí» y «se fue sola» no cuentan', () => {
    const s = store();
    expect(rememberAnswer({ answer: 'ignored', tourId: 'a', userId: U, store: s, today: TODAY })).toEqual({ off: false });
    expect(rememberAnswer({ answer: 'yes', tourId: 'b', userId: U, store: s, today: TODAY })).toEqual({ off: false });
    expect(readOfferState(s, U).no).toBe(0);
    expect(rememberAnswer({ answer: 'no', tourId: 'c', userId: U, store: s, today: TODAY })).toEqual({ off: false });
    expect(OFFER_MAX_NO).toBe(2);
    expect(rememberAnswer({ answer: 'no', tourId: 'd', userId: U, store: s, today: '2026-10-29' })).toEqual({ off: true });
    expect(readOfferState(s, U)).toEqual({ no: 2, off: true, dia: '2026-10-29' });
    // Once: the next «no» (if one could happen) does not say it again.
    expect(rememberAnswer({ answer: 'no', tourId: 'e', userId: U, store: s, today: '2026-10-30' })).toEqual({ off: false });
    for (const id of ['a', 'b', 'c', 'd']) expect(s.data.get(offerKey(U, id)), id).toBeTruthy();
    expect(offerAllowed({ userId: U, store: s, tab: tab(), today: '2027-01-01' })).toBe(false);
    expect(offerIsOff(s.data.get(offerStateKey(U)) ?? null)).toBe(true);
    expect(OFFER_OFF_TEXT).toBe('Listo. La ayuda está en Mi cuenta → Ayuda y guías.');
  });

  it('«Volver a ofrecerme ayuda» (escribe {}) lo prende otra vez, sin borrar lo de cada tutorial', () => {
    const s = store();
    s.setItem(offerStateKey(U), JSON.stringify({ no: 2, off: true, dia: TODAY }));
    s.setItem(offerKey(U, 'redes-seccion'), TODAY);
    s.setItem(offerStateKey(U), JSON.stringify({}));
    expect(readOfferState(s, U)).toEqual({ no: 0, off: false, dia: null });
    expect(offerAllowed({ userId: U, store: s, tab: tab(), today: TODAY })).toBe(true);
    expect(tourOfferable({ tour: SECCION, userId: U, store: s, screen: '/redes/[formato]' })).toBe(false);
  });

  it('lo que no se entiende se lee como nada guardado; el día es el del teléfono', () => {
    const s = store();
    s.setItem(offerStateKey(U), '{roto');
    expect(readOfferState(s, U)).toEqual({ no: 0, off: false, dia: null });
    s.setItem(offerStateKey(U), JSON.stringify({ no: -3, off: 'sí', dia: 5 }));
    expect(readOfferState(s, U)).toEqual({ no: 0, off: false, dia: null });
    expect(dayOf(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });

  it('sin sessionStorage (modo privado) recuerda la pestaña en memoria', () => {
    const broken: TabKV = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(offerAllowed({ userId: 'priv', store: store(), tab: broken, today: TODAY })).toBe(true);
    markShown({ tourId: 'x', userId: 'priv', store: store(), tab: broken, today: TODAY });
    expect(offerAllowed({ userId: 'priv2', store: store(), tab: broken, today: TODAY })).toBe(false);
  });
});

describe('cuál se ofrece: el motor sabe la pantalla y lo que se ve', () => {
  it('pregunta por cada uno y se queda con los que el motor dice, en su orden', () => {
    const target = new EventTarget();
    // A fake engine: on this screen, bienvenida (order 0) and hoy-redes (order 1); hoy-redes with too few steps now.
    const answers: Record<string, { ok: boolean; order: number }> = { bienvenida: { ok: true, order: 0 }, 'hoy-redes': { ok: true, order: 1 }, 'redes-seccion': { ok: false, order: -1 } };
    target.addEventListener(TOUR_CAN_EVENT, (e) => {
      const id = (e as CustomEvent<{ id: string }>).detail.id;
      const a = answers[id] ?? { ok: false, order: -1 };
      target.dispatchEvent(new CustomEvent(TOUR_CAN_ANSWER_EVENT, { detail: { id, ...a } }));
    });
    expect(availableHere(['redes-seccion', 'hoy-redes', 'bienvenida'], target as unknown as Window)).toEqual(['bienvenida', 'hoy-redes']);
    // No engine mounted: nothing.
    expect(availableHere(['redes-seccion'], new EventTarget() as unknown as Window)).toEqual([]);
    const tours: OfferTour[] = [
      { id: 'bienvenida', screen: '@home', title: 'Bienvenida' },
      { id: 'hoy-redes', screen: '/hoy', title: 'Cómo se usa Hoy' },
    ];
    const s = store();
    expect(pickOffer({ tours, here: ['bienvenida', 'hoy-redes'], userId: U, store: s, screen: '/hoy' })?.id).toBe('bienvenida');
    s.setItem(tourKey(U, 'bienvenida'), 'done');
    expect(pickOffer({ tours, here: ['bienvenida', 'hoy-redes'], userId: U, store: s, screen: '/hoy' })?.id).toBe('hoy-redes');
    s.setItem(offerKey(U, 'hoy-redes'), TODAY);
    expect(pickOffer({ tours, here: ['bienvenida', 'hoy-redes'], userId: U, store: s, screen: '/hoy' })).toBeNull();
  });

  it('los textos: una línea, y en el inicio la primera vez se presenta', () => {
    expect(OFFER_TEXT).toBe('¿Te muestro esta pantalla?');
    expect(welcomeText('360')).toBe('Hola, soy 360. ¿Te muestro cómo empezar?');
    expect(welcomeText('  ')).toBe('Hola, soy el asistente. ¿Te muestro cómo empezar?');
  });
});

describe('las reglas del código de la franja', () => {
  const widget = fs.readFileSync('src/components/assistant/assistant-widget.tsx', 'utf8');
  const core = fs.readFileSync('src/components/assistant/offer-core.ts', 'utf8');

  it('no abre 360, no llama a /api/asistente, no roba el foco y no se parece a una respuesta', () => {
    const strip = widget.slice(widget.indexOf('function OfferStrip'), widget.indexOf('function Bubble'));
    expect(strip).not.toMatch(/fetch\(|setOpen\(true\)|autoFocus|\.focus\(\)\s*;?\s*\n\s*setShown\(\{/);
    expect(strip).not.toContain('data-who');
    expect(strip).toContain('aria-label={OFFER_LABEL}');
    expect(strip).toContain('aria-live="polite"');
    expect(strip).toContain('aria-label={OFFER_NO}');
    expect(strip).toContain('h-11 w-11'); // the X is 44 px
    expect(core).not.toMatch(/localStorage|fetch\(/);
    expect(widget).not.toMatch(/localStorage/);
  });

  it('no se pinta en una conversación de Mensajes (ni el botón de 360)', () => {
    expect(widget).toContain("NO_ASSISTANT_SCREENS = ['/mensajes/[id]']");
    expect(widget).toMatch(/if \(screen && NO_ASSISTANT_SCREENS\.includes\(screen\)\) return null;/);
  });
});

describe('los e2e empiezan con la llave del teléfono puesta (U8)', () => {
  it('la misma llave, en los dos servidores (o los desplegados)', () => {
    expect(OFFER_OFF_KEY).toBe(OFFER_DEVICE_OFF);
    expect(e2eOrigins({})).toEqual(['http://localhost:3100', 'http://localhost:3101']);
    expect(e2eOrigins({ E2E_PORT: '4100' })).toEqual(['http://localhost:4100', 'http://localhost:4101']);
    expect(e2eOrigins({ E2E_BASE_URL: 'https://demo.example.test/x' })).toEqual(['https://demo.example.test']);
    expect(e2eOrigins({ E2E_BASE_URL: 'https://a.example.test', E2E_SHORTCUTS_URL: 'https://b.example.test' })).toEqual(['https://a.example.test', 'https://b.example.test']);
    expect(quietState({}).origins[0]).toEqual({ origin: 'http://localhost:3100', localStorage: [{ name: OFFER_DEVICE_OFF, value: '1' }] });
    const config = fs.readFileSync('playwright.config.ts', 'utf8');
    expect(config).toMatch(/storageState: QUIET_STATE/);
    expect(fs.readFileSync('tests/e2e/assistant-offer.spec.ts', 'utf8')).toContain("test.use({ storageState: { cookies: [], origins: [] } })");
  });
});
