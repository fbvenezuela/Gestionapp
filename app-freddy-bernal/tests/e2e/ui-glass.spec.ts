import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { loginAs } from './helpers';

// «Cara glass» at 360 px (docs/DISENO.md): the gradient and the blur are really drawn, axe can still
// measure contrast (it goes blind over a gradient image), and every way of going solid works: «Modo
// sol», a weak phone, «Más contraste», colors forced by the system and «Reducir transparencia». Also
// «Menos movimiento» and a pass in dark mode, which no other spec covers.

// The boss's home has big buttons and no card; Redes' home has cards (figures, «Lo que espera por mí»).
const HOMES = { 'jefe@demo.test': { home: '/jefe', cards: false }, 'redes@demo.test': { home: '/hoy', cards: true } } as const;

async function noSerious(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([]);
}

// axe reports «incomplete» (not a violation) when it cannot find the color behind a text because of a
// gradient, an image or a pseudo-element. The suite would stay green with no contrast check at all.
async function axeNotBlind(page: Page) {
  const r = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
  const blind = r.incomplete.flatMap((rule) =>
    rule.nodes
      .filter((n) => [...n.any, ...n.all, ...n.none].some((c) => ['bgGradient', 'bgImage', 'pseudoContent'].includes((c.data as { messageKey?: string } | null)?.messageKey ?? '')))
      .map((n) => n.target.join(' ')),
  );
  expect(blind).toEqual([]);
  expect(r.passes.find((p) => p.id === 'color-contrast')?.nodes.length ?? 0).toBeGreaterThan(5);
}

type Glass = {
  attr: string | null;
  gradient: boolean;
  gradientFixed: boolean;
  bodyImage: string;
  htmlImage: string;
  headerBlur: boolean;
  headerSelfBlur: string;
  headerAlpha: number;
  navBlur: boolean;
  cardAlpha: number;
  cardBlur: string;
};

// What is really drawn: a pseudo-element with content 'none' is not drawn, whatever else it declares.
function readGlass(page: Page): Promise<Glass> {
  return page.evaluate(() => {
    const alpha = (c: string) => {
      const m = /^rgba?\(([^)]+)\)$/.exec(c);
      if (!m) return Number.NaN;
      const parts = m[1].split(/[\s,/]+/).filter(Boolean);
      return parts.length > 3 ? Number(parts[3]) : 1;
    };
    const drawnBlur = (el: Element | null) => {
      if (!el) return false;
      const b = getComputedStyle(el, '::before');
      return b.content !== 'none' && b.backdropFilter.includes('blur');
    };
    const header = document.querySelector('header.glass-bar');
    const nav = document.querySelector('nav[aria-label="Menú"]');
    const card = document.querySelector('main .glass-card');
    const body = getComputedStyle(document.body, '::before');
    return {
      attr: document.documentElement.getAttribute('data-glass'),
      gradient: body.content !== 'none' && body.backgroundImage.includes('gradient'),
      gradientFixed: body.position === 'fixed',
      bodyImage: getComputedStyle(document.body).backgroundImage,
      htmlImage: getComputedStyle(document.documentElement).backgroundImage,
      headerBlur: drawnBlur(header),
      headerSelfBlur: header ? getComputedStyle(header).backdropFilter : 'missing',
      headerAlpha: header ? alpha(getComputedStyle(header).backgroundColor) : Number.NaN,
      navBlur: drawnBlur(nav),
      cardAlpha: card ? alpha(getComputedStyle(card).backgroundColor) : Number.NaN,
      cardBlur: card ? getComputedStyle(card).backdropFilter : 'missing',
    };
  });
}

async function expectGlass(page: Page) {
  const g = await readGlass(page);
  expect(g.attr).toBeNull();
  expect(g.gradient, 'gradient on body::before').toBe(true);
  expect(g.gradientFixed).toBe(true);
  // Never a background image on body or html: axe would stop measuring contrast.
  expect(g.bodyImage).toBe('none');
  expect(g.htmlImage).toBe('none');
  expect(g.headerBlur, 'top bar blur').toBe(true);
  expect(g.headerSelfBlur, 'the bar itself never blurs').toBe('none');
  expect(g.headerAlpha).toBeLessThan(1);
  expect(g.navBlur, 'phone bar blur').toBe(true);
  if (!Number.isNaN(g.cardAlpha)) {
    expect(g.cardAlpha, 'translucent card').toBeLessThan(1);
    expect(g.cardBlur, 'cards never blur').toBe('none');
  }
}

async function expectSolid(page: Page, why: string) {
  const g = await readGlass(page);
  expect(g.gradient, `${why}: no gradient`).toBe(false);
  expect(g.headerBlur, `${why}: no blur on the top bar`).toBe(false);
  expect(g.navBlur, `${why}: no blur on the phone bar`).toBe(false);
  expect(g.headerAlpha, `${why}: solid top bar`).toBe(1);
  expect(g.cardAlpha, `${why}: solid card`).toBe(1);
  expect(g.cardBlur).toBe('none');
}

const visitHome = async (page: Page, email: keyof typeof HOMES) => {
  const { home, cards } = HOMES[email];
  await page.goto(home);
  await expect(page.locator('header.glass-bar')).toBeVisible();
  if (cards) await expect(page.locator('main .glass-card').first()).toBeVisible();
};

async function openAccountMenu(page: Page) {
  await page.getByLabel('Mi cuenta').click();
  const panel = page.locator('header details[open] > div').last();
  await expect(panel).toBeVisible();
  return panel.evaluate((el) => ({ blur: getComputedStyle(el).backdropFilter, bg: getComputedStyle(el).backgroundColor }));
}

for (const email of Object.keys(HOMES) as (keyof typeof HOMES)[]) {
  test(`glass en el inicio de ${email}: degradado, barras con desenfoque, tarjetas sin él, y axe sigue midiendo`, async ({ page }) => {
    await loginAs(page, email);
    await visitHome(page, email);
    await expectGlass(page);
    await noSerious(page);
    await axeNotBlind(page);

    // The «Mi cuenta» menu, inside the top bar, blurs the page (the bar is not a backdrop root).
    const menu = await openAccountMenu(page);
    expect(menu.blur).toContain('blur');
    expect(menu.bg).toMatch(/^rgba\(/);
    await page.keyboard.press('Escape');

    // The assistant: a dimmed overlay that blurs a little and an almost opaque panel.
    const bubble = page.getByRole('button', { name: /asistente del equipo/ });
    if (await bubble.count()) {
      await bubble.click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      expect(await dialog.evaluate((el) => getComputedStyle(el).backgroundColor)).toMatch(/^rgba\(.*0\.96\)$/);
      expect(await page.locator('.glass-overlay').evaluate((el) => getComputedStyle(el).backdropFilter)).toContain('blur');
      await noSerious(page);
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
    }
  });
}

test('«Más contraste», colores forzados y «Reducir transparencia» dejan todo sólido', async ({ page }) => {
  await loginAs(page, 'redes@demo.test');
  await visitHome(page, 'redes@demo.test');
  await expectGlass(page);

  await page.emulateMedia({ contrast: 'more' });
  await expectSolid(page, 'contrast: more');
  expect((await openAccountMenu(page)).blur).toBe('none');
  await page.keyboard.press('Escape');
  await noSerious(page);

  await page.emulateMedia({ contrast: null, forcedColors: 'active' });
  await expectSolid(page, 'forced colors');
  await page.emulateMedia({ forcedColors: null });
  await expectGlass(page);

  // Playwright has no option for it yet: the DevTools protocol does («Emulate prefers-reduced-transparency»).
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-transparency: reduce)').matches)).toBe(true);
  await expectSolid(page, 'reduced transparency');
  await cdp.send('Emulation.setEmulatedMedia', { features: [] });
  await expectGlass(page);
});

test('«Modo sol» es sólido: sin degradado, sin desenfoque, tarjetas opacas', async ({ page }) => {
  await loginAs(page, 'redes@demo.test');
  await visitHome(page, 'redes@demo.test');
  await page.evaluate(() => localStorage.setItem('fb:sun', '1'));
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high');
  await expectSolid(page, 'Modo sol');
  expect((await openAccountMenu(page)).blur).toBe('none');
  await page.keyboard.press('Escape');
  await noSerious(page);
  await axeNotBlind(page);
  await page.evaluate(() => localStorage.removeItem('fb:sun'));
});

test('teléfono con poca memoria o con ahorro de datos: el vidrio se apaga antes de pintar', async ({ page, context }) => {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'deviceMemory', { configurable: true, get: () => 1 }));
  await page.goto('/entrar');
  await expect(page.locator('html')).toHaveAttribute('data-glass', 'off');
  expect((await readGlass(page)).gradient).toBe(false);
  await loginAs(page, 'redes@demo.test');
  await visitHome(page, 'redes@demo.test');
  await expect(page.locator('html')).toHaveAttribute('data-glass', 'off');
  await expectSolid(page, 'deviceMemory=1');
  await noSerious(page);

  const saver = await context.newPage();
  await saver.addInitScript(() => Object.defineProperty(Navigator.prototype, 'connection', { configurable: true, get: () => ({ saveData: true }) }));
  await visitHome(saver, 'redes@demo.test');
  await expect(saver.locator('html')).toHaveAttribute('data-glass', 'off');
  await expectSolid(saver, 'saveData');
  await saver.close();

  // A normal phone keeps the glass.
  const normal = await context.newPage();
  await visitHome(normal, 'redes@demo.test');
  await expectGlass(normal);
  await normal.close();
});

test('«Menos movimiento»: sin transiciones ni animaciones (las ruedas de espera siguen)', async ({ page }) => {
  await loginAs(page, 'redes@demo.test');
  await visitHome(page, 'redes@demo.test');
  const button = page.locator('header .transition-colors').first();
  const duration = () => button.evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration));
  expect(await duration()).toBeGreaterThan(0.05); // the check below is not empty

  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await duration()).toBeLessThan(0.001);
  await page.goto('/agenda'); // a navigation (the loading skeleton pulses) under reduced motion
  await page.goto('/hoy');
  const running = await page.evaluate(() =>
    document
      .getAnimations()
      .filter((a) => a.playState === 'running')
      .filter((a) => !((a.effect as KeyframeEffect | null)?.target as Element | null)?.closest('.animate-spin'))
      .map((a) => ((a.effect as KeyframeEffect | null)?.target as Element | null)?.className ?? String(a)),
  );
  expect(running).toEqual([]);
});

test.describe('modo oscuro', () => {
  test.use({ colorScheme: 'dark' });

  for (const email of Object.keys(HOMES) as (keyof typeof HOMES)[]) {
    test(`axe en oscuro en el inicio de ${email}`, async ({ page }) => {
      await loginAs(page, email);
      await visitHome(page, email);
      expect(await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches)).toBe(true);
      await expectGlass(page);
      await noSerious(page);
      await axeNotBlind(page);
      await openAccountMenu(page);
      await noSerious(page);
    });
  }
});
