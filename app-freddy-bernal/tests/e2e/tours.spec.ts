import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { loginAs } from './helpers';
import { toursForRoles, type Tour } from '../../src/lib/guides';

// The tutorials' engine on real pixels (R3, D-45, design §6.1, §9.2): `bienvenida` step by step with Redes and «Seguir»
// on to its home's tutorial, at 360×640 (the small phone), 810×1080 (iPad) and 1024×768; «Paso n de N» counts only the
// steps on screen (one without a target is not counted); the ring sits on its target (±2 px) in glass, «Modo sol»,
// dark and «Reducir transparencia», and never crosses the card; forced colors keep the ring; «Menos movimiento» scrolls
// at once; axe has no serious issue and can still measure the card; Escape leaves and the focus goes back to «Mi
// cuenta»; the tutorial never opens by itself. Read-only: nothing here changes the demo database (the progress lives
// in the phone's storage).
test.describe.configure({ mode: 'serial', timeout: 180_000 });

const RING_PAD = 4; // tour-core.ts: the ring goes 4 px outside its target
const tourOf = (roles: Parameters<typeof toursForRoles>[0], id: string) => toursForRoles(roles).find((t) => t.id === id)!;
const textFor = (body: Tour['steps'][number]['body'], role: string) => (typeof body === 'string' ? body : (body as Record<string, string>)[role]);

async function noSerious(page: Page, where: string) {
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 15_000 });
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${where} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 2).join(' | ')}`);
  expect(serious, where).toEqual([]);
}

// axe goes «blind» (an incomplete, not a violation) over a gradient, an image or a pseudo-element: the card's text
// must still be measured (ui-glass.spec.ts).
async function axeNotBlind(page: Page) {
  const r = await new AxeBuilder({ page }).include('dialog[data-tour-dialog]').withRules(['color-contrast']).analyze();
  const blind = r.incomplete.flatMap((rule) =>
    rule.nodes
      .filter((n) => [...n.any, ...n.all, ...n.none].some((c) => ['bgGradient', 'bgImage', 'pseudoContent'].includes((c.data as { messageKey?: string } | null)?.messageKey ?? '')))
      .map((n) => n.target.join(' ')),
  );
  expect(blind).toEqual([]);
  expect(r.passes.find((p) => p.id === 'color-contrast')?.nodes.length ?? 0).toBeGreaterThan(1);
}

async function noSideScroll(page: Page, where: string) {
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(w, `${where}: se desplaza hacia los lados`).toBeLessThanOrEqual(page.viewportSize()!.width);
}

const dialog = (page: Page) => page.locator('dialog[data-tour-dialog][open]');

// Which of these steps have a target on screen now, as the engine decides it (tour-core.ts isShown).
function shownSteps(page: Page, tour: Tour) {
  return page.evaluate((steps: string[][]) => {
    const shown = (el: Element) => {
      if (!el.getClientRects().length) return false;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 && r.height <= 0) return false;
      if (el.closest('[aria-hidden="true"]') || el.closest('[data-tour-dialog]')) return false;
      const closed = el.closest('details:not([open])');
      return !closed || el.closest('summary')?.closest('details') === closed;
    };
    return steps.map((sels) => sels.some((s) => [...document.querySelectorAll(s)].some(shown)));
  }, tour.steps.map((s) => s.target));
}

type Rect = { top: number; left: number; width: number; height: number };
type Shot = { target: Rect | null; ring: Rect | null; card: Rect; vw: number; vh: number };

// The step's target (first shown element of its first selector that has one), the ring and the card, on screen.
function shot(page: Page, selectors: string[]): Promise<Shot> {
  return page.evaluate((sels) => {
    const box = (el: Element) => {
      const b = el.getBoundingClientRect();
      return { top: b.top, left: b.left, width: b.width, height: b.height };
    };
    const shown = (el: Element) => {
      if (!el.getClientRects().length || el.closest('[aria-hidden="true"]') || el.closest('[data-tour-dialog]')) return false;
      const closed = el.closest('details:not([open])');
      return !closed || el.closest('summary')?.closest('details') === closed;
    };
    let target: Element | null = null;
    for (const s of sels) {
      target = [...document.querySelectorAll(s)].find(shown) ?? null;
      if (target) break;
    }
    const ring = document.querySelector('dialog[data-tour-dialog] [data-tour-ring]');
    const card = document.querySelector('dialog[data-tour-dialog] [role="document"]')!;
    return { target: target && box(target), ring: ring && box(ring), card: box(card), vw: document.documentElement.clientWidth, vh: innerHeight };
  }, selectors);
}

const overlap = (a: Rect, b: Rect) => a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;

// '' when the ring is where it must be: the target plus 4 px, cut only at the screen's edges and, for a target taller
// than the room left by the card, at the card. Otherwise, what is off.
function ringProblem(s: Shot): string {
  if (!s.target) return 'sin objetivo';
  if (!s.ring) return 'sin anillo';
  if (overlap(s.ring, s.card)) return `el anillo cruza la tarjeta ${JSON.stringify(s)}`;
  const want = {
    top: Math.max(s.target.top - RING_PAD, 0),
    left: Math.max(s.target.left - RING_PAD, 0),
    right: Math.min(s.target.left + s.target.width + RING_PAD, s.vw),
    bottom: Math.min(s.target.top + s.target.height + RING_PAD, s.vh),
  };
  const got = { top: s.ring.top, left: s.ring.left, right: s.ring.left + s.ring.width, bottom: s.ring.top + s.ring.height };
  const near = (a: number, b: number) => Math.abs(a - b) <= 2;
  const cardTop = s.card.top;
  const cardBottom = s.card.top + s.card.height;
  const topOk = near(got.top, want.top) || (got.top > want.top && got.top >= cardBottom);
  const bottomOk = near(got.bottom, want.bottom) || (got.bottom < want.bottom && got.bottom <= cardTop);
  if (near(got.left, want.left) && near(got.right, want.right) && topOk && bottomOk) return '';
  return `anillo ${JSON.stringify(got)} objetivo ${JSON.stringify(want)} tarjeta ${JSON.stringify(s.card)}`;
}

// The card is whole on screen and the ring is on its target; waits for a smooth scroll to end.
async function expectRing(page: Page, selectors: string[], where: string) {
  await expect.poll(async () => ringProblem(await shot(page, selectors)), { message: where, timeout: 5_000 }).toBe('');
  const s = await shot(page, selectors);
  expect(s.card.left, where).toBeGreaterThanOrEqual(0);
  expect(s.card.top, where).toBeGreaterThanOrEqual(0);
  expect(s.card.left + s.card.width, where).toBeLessThanOrEqual(s.vw);
  expect(s.card.top + s.card.height, where).toBeLessThanOrEqual(s.vh);
}

// Walks one tutorial from the step shown now: heading, text, ring, axe on each step. Returns the last step's button.
async function walk(page: Page, tour: Tour, role: string, opts: { axe?: boolean; startAt?: number } = {}) {
  const shown = await shownSteps(page, tour);
  const steps = tour.steps.filter((_, i) => shown[i]);
  const n = steps.length;
  expect(n, `${tour.id}: pasos a la vista`).toBeGreaterThanOrEqual(2);
  for (let i = opts.startAt ?? 0; i < n; i++) {
    const where = `${tour.id} paso ${i + 1} de ${n}`;
    const d = page.getByRole('dialog', { name: `Paso ${i + 1} de ${n} · ${steps[i].title}` });
    await expect(d, where).toBeVisible();
    await expect(d.locator('p').first(), where).toContainText(textFor(steps[i].body, role));
    await expectRing(page, steps[i].target, where);
    await noSideScroll(page, where);
    if (opts.axe !== false) await noSerious(page, where);
    if (i < n - 1) await d.getByRole('button', { name: 'Siguiente' }).click();
  }
  return dialog(page).getByRole('button', { name: /^(Terminar|Seguir)$/ });
}

const storedProgress = (page: Page, id: string) =>
  page.evaluate((id) => Object.entries(localStorage).filter(([k]) => k.startsWith('fb:tour:') && k.endsWith(`:${id}`)).map(([, v]) => v), id);

test('el tutorial nunca se abre solo', async ({ page }) => {
  await loginAs(page, 'redes@demo.test');
  await page.goto('/hoy');
  await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
  await page.waitForTimeout(1500);
  await expect(dialog(page)).toHaveCount(0);
});

const SIZES = [
  { name: '360×640', viewport: { width: 360, height: 640 } },
  { name: 'iPad 810×1080', viewport: { width: 810, height: 1080 } },
  { name: '1024×768', viewport: { width: 1024, height: 768 } },
];

for (const size of SIZES) {
  test.describe(`Redes a ${size.name}`, () => {
    test.use({ viewport: size.viewport });

    test('bienvenida paso a paso y «Seguir» al tutorial de su inicio; «Paso n de N» cuenta solo lo que se ve', async ({ page }) => {
      const welcome = tourOf(['social'], 'bienvenida');
      const home = tourOf(['social'], 'hoy-redes');
      expect(welcome.next).toBe('hoy-redes');
      await loginAs(page, 'redes@demo.test');
      await page.goto('/hoy?tutorial=bienvenida');
      await expect(dialog(page)).toBeVisible();
      // The address loses ?tutorial= (a reload does not start it again).
      await expect(page).toHaveURL(/\/hoy$/);
      // A step whose target is not on screen is not counted (Mensajes' envelope while it is hidden, for one).
      const shown = await shownSteps(page, welcome);
      expect(await page.locator('[data-tour="messages"]').evaluate((el) => el.getClientRects().length > 0)).toBe(shown[welcome.steps.findIndex((s) => s.target.includes('[data-tour="messages"]'))]);

      const last = await walk(page, welcome, 'social', { axe: size.name === '360×640' });
      await expect(last).toHaveText('Seguir');
      await expect(dialog(page).locator('p').first()).toContainText('Ahora tu pantalla de inicio.');
      // «Atrás» goes back one step and the count stays.
      const n = shown.filter(Boolean).length;
      await dialog(page).getByRole('button', { name: 'Atrás' }).click();
      await expect(page.getByRole('dialog', { name: new RegExp(`^Paso ${n - 1} de ${n} · `) })).toBeVisible();
      await dialog(page).getByRole('button', { name: 'Siguiente' }).click();
      await dialog(page).getByRole('button', { name: 'Seguir' }).click();

      // The home's tutorial in the same dialog, from its first step.
      const end = await walk(page, home, 'social', { axe: size.name === '360×640' });
      await expect(end).toHaveText('Terminar');
      await end.click();
      await expect(dialog(page)).toHaveCount(0);
      expect(await storedProgress(page, 'bienvenida')).toEqual(['done']);
      expect(await storedProgress(page, 'hoy-redes')).toEqual(['done']);
      await page.reload();
      await page.waitForTimeout(800);
      await expect(dialog(page)).toHaveCount(0);
    });
  });
}

test.describe('el jefe en la computadora y en el iPad', () => {
  for (const viewport of [{ width: 1024, height: 768 }, { width: 810, height: 1080 }]) {
    test(`bienvenida a ${viewport.width}×${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const welcome = tourOf(['boss'], 'bienvenida');
      await loginAs(page, 'jefe@demo.test');
      await page.goto('/jefe?tutorial=bienvenida');
      await expect(dialog(page)).toBeVisible();
      const last = await walk(page, welcome, 'boss');
      // Without a tutorial of the boss's Inicio in the catalogue yet, it just ends; with one, it goes on.
      await expect(last).toHaveText(toursForRoles(['boss']).some((t) => t.id === welcome.next) ? 'Seguir' : 'Terminar');
      await page.keyboard.press('Escape');
      await expect(dialog(page)).toHaveCount(0);
    });
  }
});

test('Grabación no tiene «Crear»: ese paso no se cuenta y N baja', async ({ page }) => {
  const welcome = tourOf(['camera'], 'bienvenida');
  await loginAs(page, 'grabacion@demo.test');
  await page.goto('/hoy?tutorial=bienvenida');
  await expect(dialog(page)).toBeVisible();
  const shown = await shownSteps(page, welcome);
  expect(shown[welcome.steps.findIndex((s) => s.target.includes('[data-tour="create"]'))]).toBe(false);
  const n = shown.filter(Boolean).length;
  expect(n).toBeLessThan(welcome.steps.length);
  await expect(page.getByRole('dialog', { name: new RegExp(`^Paso 1 de ${n} · `) })).toBeVisible();
  await walk(page, welcome, 'camera', { axe: false });
  await page.keyboard.press('Escape');
});

test('Escape sale y el foco vuelve a «Mi cuenta»; ahí están los tutoriales de la pantalla', async ({ page }) => {
  await loginAs(page, 'redes@demo.test');
  await page.goto('/hoy');
  await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
  await page.getByLabel('Mi cuenta').click();
  const menu = page.locator('header details[open]');
  await expect(menu.getByRole('link', { name: 'Ayuda y guías' })).toHaveAttribute('href', '/ayuda');
  // On the home: bienvenida first, then the home's own.
  await expect(menu.getByRole('button', { name: /^Ver el tutorial/ })).toHaveText(['Ver el tutorial: Bienvenida', 'Ver el tutorial: Cómo se usa Hoy']);
  await menu.getByRole('button', { name: 'Ver el tutorial: Cómo se usa Hoy' }).click();
  await expect(page.getByRole('dialog', { name: /^Paso 1 de \d+ · / })).toBeVisible();
  // The menu closed when the focus went into the tutorial; the main button has it.
  await expect(page.locator('header details[open]')).toHaveCount(0);
  await expect(dialog(page).getByRole('button', { name: 'Siguiente' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.locator('summary[aria-label="Mi cuenta"]')).toBeFocused();
  expect(await storedProgress(page, 'hoy-redes')).toEqual(['seen']);

  // The X does the same.
  await page.getByLabel('Mi cuenta').click();
  await page.locator('header details[open]').getByRole('button', { name: 'Ver el tutorial: Bienvenida' }).click();
  await dialog(page).getByRole('button', { name: 'Salir del tutorial' }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.locator('summary[aria-label="Mi cuenta"]')).toBeFocused();

  // A screen without a tutorial for Redes: only «Ayuda y guías».
  await page.goto('/avisos');
  await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
  await page.getByLabel('Mi cuenta').click();
  await expect(page.locator('header details[open]').getByRole('link', { name: 'Ayuda y guías' })).toBeVisible();
  await expect(page.locator('header details[open]').getByRole('button', { name: /^Ver el tutorial/ })).toHaveCount(0);
});

test('360 y «Mi cuenta» preguntan si un tutorial puede correr aquí (fb:tour:can)', async ({ page }) => {
  await loginAs(page, 'redes@demo.test');
  await page.goto('/hoy');
  await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
  const ask = (id: string) =>
    page.evaluate((id) => {
      let got: unknown = null;
      const on = (e: Event) => (got = (e as CustomEvent).detail);
      window.addEventListener('fb:tour:can:answer', on);
      window.dispatchEvent(new CustomEvent('fb:tour:can', { detail: { id } }));
      window.removeEventListener('fb:tour:can:answer', on);
      return got as { id: string; ok: boolean; order: number } | null;
    }, id);
  expect(await ask('bienvenida')).toEqual({ id: 'bienvenida', ok: true, order: 0 });
  expect(await ask('hoy-redes')).toEqual({ id: 'hoy-redes', ok: true, order: 1 });
  expect((await ask('no-existe'))?.ok).toBe(false);
  // The state events 360 listens to.
  const states = await page.evaluate(async () => {
    const seen: string[] = [];
    window.addEventListener('fb:tour:state', (e) => seen.push(`${(e as CustomEvent).detail.state}:${(e as CustomEvent).detail.id}`));
    window.dispatchEvent(new CustomEvent('fb:tour:start', { detail: { id: 'hoy-redes' } }));
    await new Promise((r) => setTimeout(r, 600));
    return seen;
  });
  expect(states).toEqual(['open:hoy-redes']);
  await page.keyboard.press('Escape');
  await page.goto('/agenda');
  await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
  expect((await ask('hoy-redes'))?.ok).toBe(false);
});

test.describe('el anillo sobre su objetivo en cada tema (±2 px)', () => {
  test.use({ viewport: { width: 360, height: 640 } });

  const themes: { name: string; set: (page: Page) => Promise<void> }[] = [
    { name: 'vidrio', set: async () => {} },
    {
      name: 'Modo sol',
      set: async (page) => {
        await page.evaluate(() => localStorage.setItem('fb:sun', '1'));
        await page.reload();
        await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high');
      },
    },
    { name: 'oscuro', set: async (page) => page.emulateMedia({ colorScheme: 'dark' }) },
    {
      name: 'Reducir transparencia',
      set: async (page) => {
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
        expect(await page.evaluate(() => matchMedia('(prefers-reduced-transparency: reduce)').matches)).toBe(true);
      },
    },
  ];

  for (const theme of themes) {
    test(theme.name, async ({ page }) => {
      const tour = tourOf(['social'], 'hoy-redes');
      await loginAs(page, 'redes@demo.test');
      await page.goto('/hoy');
      await theme.set(page);
      await page.goto('/hoy?tutorial=hoy-redes');
      await expect(dialog(page)).toBeVisible();
      await walk(page, tour, 'social', { axe: true });
      await axeNotBlind(page);
      await page.keyboard.press('Escape');
      await page.evaluate(() => localStorage.removeItem('fb:sun'));
    });
  }

  test('colores forzados: el anillo se sigue viendo (borde, no sombra) y la tarjeta es sólida', async ({ page }) => {
    await loginAs(page, 'redes@demo.test');
    await page.emulateMedia({ forcedColors: 'active' });
    await page.goto('/hoy?tutorial=hoy-redes');
    await expect(dialog(page)).toBeVisible();
    await expectRing(page, tourOf(['social'], 'hoy-redes').steps[0].target, 'colores forzados');
    const look = await page.evaluate(() => {
      const ring = getComputedStyle(document.querySelector('[data-tour-ring]')!);
      const card = getComputedStyle(document.querySelector('dialog[data-tour-dialog] [role="document"]')!);
      return { width: ring.borderTopWidth, style: ring.borderTopStyle, color: ring.borderTopColor, blur: card.backdropFilter, bg: card.backgroundColor };
    });
    expect(look.width).toBe('3px');
    expect(look.style).toBe('solid');
    expect(look.color).not.toMatch(/rgba\(.*,\s*0\)$|transparent/);
    expect(look.blur).toBe('none');
    expect(look.bg).not.toMatch(/rgba\(/);
    await noSerious(page, 'colores forzados');
  });

  test('«Menos movimiento»: el paso siguiente salta de una vez (sin desplazamiento suave ni transiciones)', async ({ page }) => {
    const tour = tourOf(['social'], 'hoy-redes');
    await loginAs(page, 'redes@demo.test');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/hoy?tutorial=hoy-redes');
    await expect(dialog(page)).toBeVisible();
    const shown = await shownSteps(page, tour);
    const steps = tour.steps.filter((_, i) => shown[i]);
    await expectRing(page, steps[0].target, 'paso 1');
    const still = await page.evaluate(() =>
      [document.querySelector('[data-tour-ring]')!, document.querySelector('dialog[data-tour-dialog] [role="document"]')!].map((el) => getComputedStyle(el).transitionDuration),
    );
    expect(still.every((d) => d.split(',').every((x) => parseFloat(x) < 0.001))).toBe(true);
    for (let i = 1; i < steps.length; i++) {
      await dialog(page).getByRole('button', { name: 'Siguiente' }).click();
      await expect(page.getByRole('dialog', { name: new RegExp(`^Paso ${i + 1} de `) })).toBeVisible();
      // Two frames: the plan and the measure. No smooth scroll to wait for.
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
      expect(ringProblem(await shot(page, steps[i].target)), `paso ${i + 1}`).toBe('');
    }
    await page.keyboard.press('Escape');
  });
});

test('el tutorial del evento va con su pestaña; uno de otra pantalla no se abre', async ({ page }) => {
  await loginAs(page, 'redes@demo.test');
  await page.goto('/agenda');
  const href = await page.locator('main a[href^="/eventos/"]').first().getAttribute('href');
  const event = href!.split('?')[0];
  const eventTours = toursForRoles(['social']).filter((t) => t.screen.startsWith('/eventos/[id]') && !t.screen.includes('/lectura'));
  const tabOf = (t: Tour) => new URLSearchParams(t.screen.split('?')[1] ?? '').get('tab');
  for (const tab of [null, 'storyboard', 'material']) {
    await page.goto(tab ? `${event}?tab=${tab}` : event);
    await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
    await page.getByLabel('Mi cuenta').click();
    const listed = await page.locator('header details[open]').getByRole('button', { name: /^Ver el tutorial/ }).allInnerTexts();
    await page.keyboard.press('Escape');
    // Only this tab's tutorials (none of another tab), and only those with 2 steps or more on screen.
    const here = eventTours.filter((t) => tabOf(t) === (tab ?? null) || (tab === null && tabOf(t) === 'ficha'));
    const others = eventTours.filter((t) => !here.includes(t));
    for (const t of others) expect(listed.join('|'), `${tab}: ${t.id}`).not.toContain(t.title);
    expect(listed.length, `${tab}`).toBeLessThanOrEqual(here.length);
  }
  // A tutorial of another screen (the home's) does not open here, and the address loses ?tutorial= all the same.
  await page.goto(`${event}?tab=storyboard&tutorial=hoy-redes`);
  await expect(page).toHaveURL(new RegExp(`${event}\\?tab=storyboard$`));
  await page.waitForTimeout(800);
  await expect(dialog(page)).toHaveCount(0);
});
