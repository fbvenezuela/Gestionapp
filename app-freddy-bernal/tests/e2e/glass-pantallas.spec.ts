import { test, expect, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { loginAs } from './helpers';

// At 360 px with axe (cambios del 27/10/2026):
//  - the boss lands on his Inicio, not on Hoy: Grabación's new notes for the editor (§5) show in his Redes tile, by
//    title, each opening the event's Material tab, and they are the same events Hoy lists. No date or time;
//  - «Cara glass» on the screens that still drew their own surfaces (WP4b): the calendar is a solid card (a long
//    grid), the view switch has the token's corner, the bars that float over a list take the menus' glass, «Empezar
//    de nuevo» asks with the app's own dialog, and the «no encontrado» pages are glass cards.
// The demo database is shared by the whole run: nothing here is hard-coded but the demo's own note (on the court).
// All data here is invented.

const TIME_RE = /\b\d{1,2}:\d{2}\s?(a\.?\s?m\.?|p\.?\s?m\.?|AM|PM)/i;
// The demo's note for the editor (src/lib/db/seed-parts/handoff.ts) is on this event.
const COURT = 'Entrega de la cancha techada de El Mirador';
const NOTE = /Lo mejor del jefe está en el segundo clip/;

async function noSerious(page: Page, where: string) {
  // A toast fading in or out is half transparent: axe would read its contrast mid-animation.
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 15_000 });
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${where} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 2).join(' | ')}`);
  expect(serious, where).toEqual([]);
}

async function fitsWidth(page: Page, where: string) {
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(w, `${where}: se desplaza hacia los lados`).toBeLessThanOrEqual(page.viewportSize()!.width);
}

const styleOf = (el: Locator) =>
  el.evaluate((node) => {
    const s = getComputedStyle(node);
    return { blur: s.backdropFilter, bg: s.backgroundColor, radius: s.borderTopLeftRadius, position: s.position };
  });
// The alpha of a computed rgb()/rgba() color (1 when opaque).
const alpha = (c: string) => {
  const parts = /^rgba?\(([^)]+)\)$/.exec(c)![1].split(/[\s,/]+/).filter(Boolean);
  return parts.length > 3 ? Number(parts[3]) : 1;
};

test.describe('las notas nuevas de Grabación en el inicio del jefe', () => {
  test('el jefe ve el título de cada evento con nota nueva en el botón de Redes, que abre su pestaña Material, sin fecha', async ({ page }) => {
    await loginAs(page, 'jefe@demo.test');
    await page.goto('/jefe');
    const redes = page.getByRole('region', { name: 'Redes', exact: true });
    const list = redes.getByRole('list', { name: 'Notas de Grabación nuevas' });
    await expect(list).toBeVisible();
    const shown = await list.getByRole('link').count();
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThanOrEqual(3);
    const total = Number((await redes.locator('#tile-redes-notes').innerText()).match(/(\d+)\s*$/)![1]);
    expect(total).toBeGreaterThanOrEqual(shown);
    const more = redes.getByRole('link', { name: 'Ver más en «Hoy»' });
    if (total > shown) await expect(more).toHaveAttribute('href', '/hoy');
    else await expect(more).toHaveCount(0);
    const court = list.getByRole('link', { name: new RegExp(`^${COURT}`) });
    await expect(court).toHaveAttribute('href', /^\/eventos\/[0-9a-f-]{36}\?tab=material$/);
    // Titles only.
    expect(await redes.innerText()).not.toMatch(TIME_RE);
    // Big enough for a finger, like every counter of the tile.
    for (const l of await redes.getByRole('link').all()) expect((await l.boundingBox())!.height, await l.innerText()).toBeGreaterThanOrEqual(56);
    await fitsWidth(page, '/jefe');
    await noSerious(page, '/jefe');

    // The same events as «Notas de Grabación nuevas» in Hoy (up to 10 there).
    await page.goto('/hoy');
    await expect(page.getByRole('link', { name: new RegExp(`${COURT}.*Notas de Grabación nuevas`) })).toBeVisible();
    expect(await page.getByRole('link', { name: /Notas de Grabación nuevas/ }).count()).toBe(Math.min(total, 10));

    // One tap: the event's Material tab, with Grabación's note.
    await page.goto('/jefe');
    await page.getByRole('region', { name: 'Redes', exact: true }).getByRole('list', { name: 'Notas de Grabación nuevas' }).getByRole('link', { name: new RegExp(`^${COURT}`) }).click();
    await expect(page).toHaveURL(/\/eventos\/[0-9a-f-]{36}\?tab=material$/);
    await expect(page.getByRole('heading', { name: COURT })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Entrega de Grabación' }).getByText(NOTE)).toBeVisible();
  });

  test('administración abre el inicio del jefe sin esa línea (tampoco la tiene en Hoy)', async ({ page }) => {
    await loginAs(page, 'admin@demo.test');
    await page.goto('/jefe');
    await expect(page.getByRole('region', { name: 'Redes', exact: true })).toBeVisible();
    await expect(page.getByText('Notas de Grabación nuevas')).toHaveCount(0);
  });
});

test.describe('glass en las pantallas sueltas', () => {
  test('el calendario (mes, semana y día) es una tarjeta sólida, y la vista elegida tiene la esquina del token', async ({ page }) => {
    await loginAs(page, 'jefe@demo.test');
    for (const vista of ['mes', 'semana', 'dia']) {
      await page.goto(`/agenda?vista=${vista}`);
      const grid = page.locator('main .glass-card.glass-solid').filter({ has: page.locator('a[href^="/agenda?vista=dia&fecha="]') }).first();
      await expect(grid, vista).toBeVisible();
      const s = await styleOf(grid);
      expect(s.blur, vista).toBe('none');
      expect(s.bg, vista).toBe('rgb(255, 255, 255)');
      expect((await styleOf(page.getByRole('tab', { selected: true }))).radius, vista).toBe('8px');
      await fitsWidth(page, `/agenda?vista=${vista}`);
      await noSerious(page, `/agenda?vista=${vista}`);
    }
  });

  test('la barra de «Aprobar marcados» flota con el vidrio de los menús, casi opaco', async ({ page }) => {
    await loginAs(page, 'jefe@demo.test');
    await page.goto('/aprobar?tab=tweets');
    const bar = page.getByRole('button', { name: 'Aprobar marcados' }).locator('xpath=..');
    await expect(bar).toBeVisible();
    const s = await styleOf(bar);
    expect(s.position).toBe('sticky');
    expect(s.blur).toContain('blur');
    expect(alpha(s.bg)).toBeGreaterThan(0.8);
    expect(alpha(s.bg)).toBeLessThan(1);
    await fitsWidth(page, '/aprobar?tab=tweets');
    await noSerious(page, '/aprobar?tab=tweets');
  });

  test('tanda nueva de tweets: la barra de abajo es de vidrio y «Empezar de nuevo» pregunta con el diálogo propio', async ({ page }) => {
    let nativeDialog = false;
    page.on('dialog', (d) => {
      nativeDialog = true;
      void d.dismiss();
    });
    await loginAs(page, 'redes@demo.test');
    await page.goto('/tweets/nueva');
    await page.getByLabel('Texto con los tweets').fill('1. Primer tweet de prueba para la barra.\n2. Segundo tweet de prueba para la barra.');
    await page.getByRole('button', { name: 'Separar tweets' }).click();
    await expect(page.getByText('Separé 2 tweets.')).toBeVisible();
    const restart = page.locator('main').getByRole('button', { name: 'Empezar de nuevo' });
    const s = await styleOf(restart.locator('xpath=..'));
    expect(s.position).toBe('sticky');
    expect(s.blur).toContain('blur');
    expect(alpha(s.bg)).toBeGreaterThan(0.8);
    await fitsWidth(page, '/tweets/nueva');
    await noSerious(page, '/tweets/nueva');

    // Cancel keeps the tweets; confirming goes back to the pasted text (not lost).
    await restart.click();
    const dialog = page.getByRole('dialog', { name: '¿Empezar de nuevo?' });
    await expect(dialog).toBeVisible();
    await noSerious(page, 'el diálogo de «Empezar de nuevo»');
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByLabel('Texto del tweet 1')).toBeVisible();
    await restart.click();
    await page.getByRole('dialog', { name: '¿Empezar de nuevo?' }).getByRole('button', { name: 'Empezar de nuevo' }).click();
    await expect(page.getByLabel('Texto con los tweets')).toHaveValue(/Primer tweet de prueba para la barra/);
    await expect(page.getByLabel('Texto del tweet 1')).toHaveCount(0);
    expect(nativeDialog).toBe(false);
  });

  test('«No encontramos esto» y «Esta página no existe» son tarjetas de vidrio', async ({ page }) => {
    await loginAs(page, 'redes@demo.test');
    for (const [url, title] of [
      ['/eventos/00000000-0000-4000-8000-000000000999', 'No encontramos esto'],
      ['/esta-pagina-no-existe-prueba', 'Esta página no existe'],
    ] as const) {
      await page.goto(url);
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
      const card = page.locator('.glass-card').filter({ has: page.getByRole('heading', { name: title }) });
      const s = await styleOf(card);
      expect(s.blur, url).toMatch(/^blur\(/);
      expect(alpha(s.bg), url).toBeLessThan(1);
      expect(s.radius, url).toBe('24px');
      await fitsWidth(page, url);
      await noSerious(page, url);
    }
  });
});
