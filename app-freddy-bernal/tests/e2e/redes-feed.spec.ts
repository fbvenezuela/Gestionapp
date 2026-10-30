import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fb from '../../config/clients/fb.json';
import { loginAs } from './helpers';

// The feed of the month (R4, WP-D, D-69, F11) against the demo, at 360 px with axe and once at 1366 with a mouse and
// only the keyboard: the read-only profile header (no Instagram user), the #1 published with its green frame, an empty
// place filled from the picker, a placed title that says «Ya en Mes 1 · #N» and asks before moving, «Publicar antes»
// with a finger (the menu stays open, the focus goes to the new place and the live line says it), «Publicar después»
// with the keyboard, a click that opens the card, a drag, and a new month filled, emptied («Vaciar este mes») and
// deleted with its pieces back in Mes 1. One server, in order (D-39); every number is read live. All data invented.
test.describe.configure({ mode: 'serial' });

const CLOCK = /\b\d{1,2}:\d{2}\s?(a\.?\s?m\.?|p\.?\s?m\.?)/i;

async function axe(page: Page) {
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 15_000 });
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([]);
}

async function noSideScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
}

const place = (page: Page, n: number) => page.locator(`#espacio-${n}`);
const live = (page: Page) => page.locator('[data-tour="feed-live"] [role="status"]');

// The page came alive: a tap on a cell before that does nothing.
async function alive(page: Page) {
  await expect(page.locator('[data-tour="feed-grid"]')).toBeVisible();
  await page.waitForLoadState('networkidle');
}

async function filledCount(page: Page): Promise<number> {
  const line = await page.getByText(/^\d+ de 24 espacios ocupados en este mes/).innerText();
  return Number(line.match(/^(\d+)/)![1]);
}

// The title placed in an empty place of Mes 1 (test 2), moved to a new month and back (test 6).
let placedTitle = '';

test('la cabecera de perfil sin usuario, las cuentas que coinciden y el #1 publicado con su marco verde', async ({ page }) => {
  await loginAs(page, 'redes@demo.test');
  await page.goto('/redes/feed');
  await expect(page.getByRole('heading', { level: 1, name: 'Feed' })).toBeVisible();
  await alive(page);
  const n = await filledCount(page);
  expect(n).toBeGreaterThan(0);
  // The header: the configuration's name and title and this month's count; no @user, no followers.
  const card = page.locator('[data-feed-profile]');
  await expect(card).toContainText(fb.brand.clientName);
  await expect(card).toContainText(fb.brand.clientTitle);
  await expect(card).toContainText(`${n} publicaciones en Mes 1`);
  expect(await card.innerText()).not.toMatch(/@|seguidores|followers/i);
  // The month tab says the same.
  const tabs = page.getByRole('navigation', { name: 'Meses de contenido' });
  await expect(tabs.getByRole('link', { name: `Mes 1 · ${n} de 24` })).toHaveAttribute('aria-current', 'page');
  // The #1 (bottom right) went out: green frame and the word, not only the colour.
  await expect(place(page, 1)).toHaveClass(/ring-ok/);
  await expect(place(page, 1).getByRole('button', { name: /^#1 · .+ · Publicado\. Opciones$/ })).toBeVisible();
  // The #1 is the last cell of the grid and the #24 the first.
  const order = await page.locator('[data-tour="feed-grid"] > li').evaluateAll((ls) => ls.map((l) => Number(l.getAttribute('data-num'))));
  expect(order[0]).toBe(24);
  expect(order[23]).toBe(1);
  expect(await page.locator('main').innerText()).not.toMatch(CLOCK);
  await noSideScroll(page);
  await axe(page);
});

test('el chip «En Feed · Mes 1 #N» de una tarjeta lleva a su espacio, que toma el foco', async ({ page }) => {
  await loginAs(page, 'redes@demo.test');
  await page.goto('/redes/posts');
  await expect(page.getByRole('heading', { level: 1, name: 'Posts' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  const chip = page.getByRole('link', { name: /^En Feed · Mes 1 #\d+$/ }).first();
  const num = Number((await chip.innerText()).match(/#(\d+)$/)![1]);
  await chip.click();
  await expect(page).toHaveURL(new RegExp(`/redes/feed\\?mes=[0-9a-f-]{36}#espacio-${num}$`));
  await expect(place(page, num).locator('[data-cell-focus]')).toBeFocused();
  await expect(place(page, num)).toHaveAttribute('data-piece', /[0-9a-f-]{36}/);
});

test('una celda vacía: el selector por formato, «Ya en Mes 1 · #N» pregunta antes, y un título sin espacio queda puesto', async ({ page }) => {
  await loginAs(page, 'redes@demo.test');
  await page.goto('/redes/feed');
  await alive(page);
  // The first empty place (the top row is free in the demo).
  const empty = page.locator('[data-tour="feed-grid"] > li:not([data-piece])').first();
  const num = Number(await empty.getAttribute('data-num'));
  await empty.getByRole('button').click();
  const sheet = page.getByRole('dialog', { name: `Mes 1 · Espacio #${String(num).padStart(2, '0')}` });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('Elige el formato y luego el título.')).toBeVisible();
  await axe(page);
  await sheet.getByRole('button', { name: /^Posts \d+ títulos?$/ }).click();
  const posts = sheet.locator('#feed-grupo-post');
  // A title that already has a place says where, and asks first: it is never in two.
  const placed = posts.getByRole('button').filter({ hasText: /Ya en Mes 1 · #\d+/ }).first();
  const where = (await placed.innerText()).match(/Ya en Mes 1 · #(\d+)/)![1];
  await placed.click();
  await expect(sheet.getByText(`Está en Mes 1 · #${where}. ¿La mueves a este espacio?`)).toBeVisible();
  await sheet.getByRole('button', { name: 'Elegir otra' }).click();
  // Back to the same list (the group stays open); one without a place goes in.
  await expect(sheet.getByRole('button', { name: /^Posts \d+ títulos?$/ })).toHaveAttribute('aria-expanded', 'true');
  const free = posts.getByRole('button').filter({ hasNotText: /Ya en |En este espacio/ }).first();
  await expect(free).toBeVisible();
  placedTitle = (await free.locator('span.font-semibold').first().innerText()).trim();
  await free.click();
  await expect(sheet).toBeHidden();
  await expect(live(page)).toContainText(`Colocada en el #${num}`);
  await expect(place(page, num).getByRole('button', { name: new RegExp(`^#${num} · Post · «${placedTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}»`) })).toBeVisible();
  await expect(place(page, num).locator('[data-cell-focus]')).toBeFocused();
  await noSideScroll(page);
  await axe(page);
});

test('con el dedo: «Publicar antes» la mueve, la hoja sigue abierta y la línea en vivo lo dice', async ({ page }) => {
  await loginAs(page, 'redes@demo.test');
  await page.goto('/redes/feed');
  await alive(page);
  const five = place(page, 5).getByRole('button', { name: /^#5 · / });
  const title = (await five.getAttribute('aria-label'))!.match(/«(.+)»/)![1];
  await five.click();
  const menu = page.getByRole('dialog', { name: 'Mes 1 · #5' });
  await expect(menu).toBeVisible();
  await menu.getByRole('button', { name: 'Publicar antes (#4)' }).click();
  await expect(live(page)).toContainText('Movida al #4');
  // The menu follows the piece, still open, and the focus is on its new place.
  await expect(page.getByRole('dialog', { name: 'Mes 1 · #4' })).toBeVisible();
  await expect(place(page, 4).locator('[data-cell-focus]')).toBeFocused();
  await expect(place(page, 4).getByRole('button', { name: new RegExp(`^#4 · .+ · «${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}»`) })).toBeVisible();
  // Once more from the same menu: back to #5.
  await page.getByRole('dialog', { name: 'Mes 1 · #4' }).getByRole('button', { name: 'Publicar después (#5)' }).click();
  await expect(live(page)).toContainText('Movida al #5');
  await expect(page.getByRole('dialog', { name: 'Mes 1 · #5' })).toBeVisible();
  // With the menu open over the page (it does not cover it), still no serious accessibility issue.
  await axe(page);
  await page.getByRole('dialog', { name: 'Mes 1 · #5' }).getByRole('button', { name: 'Cerrar' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await noSideScroll(page);
});

test.describe('en la computadora (1366, con ratón y teclado)', () => {
  test.use({ viewport: { width: 1366, height: 900 }, isMobile: false, hasTouch: false });

  test('solo con el teclado: el «⋯» del #5 → «Publicar después» → el foco queda en el #6', async ({ page }) => {
    await loginAs(page, 'redes@demo.test');
    await page.goto('/redes/feed');
    await alive(page);
    const dots = page.getByRole('button', { name: 'Opciones del #5' });
    await expect(dots).toBeVisible();
    // From the link of the #5 (its card), one Tab reaches its «⋯».
    await place(page, 5).getByRole('link').focus();
    await page.keyboard.press('Tab');
    await expect(dots).toBeFocused();
    await page.keyboard.press('Enter');
    const menu = page.getByRole('dialog', { name: 'Mes 1 · #5' });
    await expect(menu).toBeVisible();
    const after = menu.getByRole('button', { name: 'Publicar después (#6)' });
    for (let i = 0; i < 8 && !(await after.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
    await expect(after).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(live(page)).toContainText('Movida al #6');
    await expect(page.getByRole('button', { name: 'Opciones del #6' })).toBeFocused();
    // And back with the keyboard, then Escape closes the menu.
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: 'Opciones del #6' }).press('Enter');
    await page.getByRole('dialog', { name: 'Mes 1 · #6' }).getByRole('button', { name: 'Publicar antes (#5)' }).press('Enter');
    await expect(live(page)).toContainText('Movida al #5');
    await page.keyboard.press('Escape');
    await axe(page);
  });

  test('arrastrar con el ratón intercambia dos espacios; el clic en una celda llena abre su tarjeta', async ({ page }) => {
    await loginAs(page, 'redes@demo.test');
    await page.goto('/redes/feed');
    await alive(page);
    const name = async (n: number) => (await place(page, n).getByRole('link').getAttribute('aria-label'))!.replace(/^#\d+ · /, '');
    const [two, three] = [await name(2), await name(3)];
    await place(page, 2).dragTo(place(page, 3));
    await expect(live(page)).toContainText('Movida al #3');
    await expect.poll(() => name(3)).toBe(two);
    expect(await name(2)).toBe(three);
    await place(page, 3).dragTo(place(page, 2));
    await expect(live(page)).toContainText('Movida al #2');
    await expect.poll(() => name(2)).toBe(two);
    // A click on a filled place opens its card in its section, with the month and the card's anchor.
    const link = place(page, 3).getByRole('link');
    const href = (await link.getAttribute('href'))!;
    expect(href).toMatch(/^\/redes\/(posts|reels|carruseles)\?mes=[0-9a-f-]{36}#pieza-[0-9a-f-]{36}$/);
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
    await expect(page.locator(`#${href.split('#')[1]}`)).toBeVisible();
  });
});

test('un mes nuevo: se coloca, «Vaciar este mes» no borra nada y al borrar el mes sus piezas vuelven a Mes 1', async ({ page }) => {
  expect(placedTitle, 'el título que se colocó antes').not.toBe('');
  await loginAs(page, 'redes@demo.test');
  await page.goto('/redes/feed');
  await alive(page);
  const tabs = page.getByRole('navigation', { name: 'Meses de contenido' });
  await tabs.getByRole('button', { name: '+ Nuevo mes' }).click();
  await expect(page).toHaveURL(/\/redes\/feed\?mes=[0-9a-f-]{36}$/);
  const current = tabs.locator('a[aria-current="page"]');
  await expect(current).toHaveText(/^Mes \d+ · 0 de 24$/);
  const label = (await current.innerText()).split(' · ')[0];
  const monthId = new URL(page.url()).searchParams.get('mes')!;
  await alive(page);
  // The piece placed before (Mes 1) comes to this month's #1: it asks first, then says where it came from.
  await place(page, 1).getByRole('button').click();
  const sheet = page.getByRole('dialog', { name: `${label} · Espacio #01` });
  await sheet.getByRole('button', { name: /^Posts \d+ títulos?$/ }).click();
  await sheet.locator('#feed-grupo-post').getByRole('button').filter({ hasText: placedTitle }).first().click();
  await expect(sheet.getByText(/^Está en Mes 1 · #\d+\. ¿La mueves a este espacio\?$/)).toBeVisible();
  await sheet.getByRole('button', { name: 'Sí, moverla aquí' }).click();
  await expect(live(page)).toContainText('Colocada en el #1 · venía de Mes 1');
  await expect(tabs.getByRole('link', { name: `${label} · 1 de 24` })).toBeVisible();
  // «Vaciar este mes»: it says what happens first, and nothing is deleted.
  await page.getByRole('button', { name: 'Vaciar este mes' }).click();
  const ask = page.getByRole('dialog', { name: 'Vaciar este mes' });
  await expect(ask).toContainText(`¿Vaciar el feed de «${label}»? La pieza colocada queda «Sin programar»: no se borra ninguna y siguen en su sección.`);
  await ask.getByRole('button', { name: 'Vaciar este mes' }).click();
  await expect(live(page)).toContainText('Mes vaciado: 1 pieza quedó sin programar');
  await expect(tabs.getByRole('link', { name: `${label} · 0 de 24` })).toBeVisible();
  // Still in its section, in this month, «Sin programar».
  await page.goto(`/redes/posts?mes=${monthId}`);
  const piece = page.getByRole('article', { name: placedTitle, exact: true });
  await expect(piece).toBeVisible();
  await expect(piece.getByText('Post · Sin programar')).toBeVisible();
  // «Borrar este mes» says how many pieces it has; they go back to Mes 1.
  await page.goto(`/redes/feed?mes=${monthId}`);
  await alive(page);
  await page.getByLabel(`Opciones de ${label}`).click();
  await page.getByRole('button', { name: 'Borrar este mes' }).click();
  const del = page.getByRole('dialog', { name: 'Borrar este mes' });
  await expect(del).toContainText(`¿Borrar «${label}»? Tiene 1 pieza. No se borra: pasa a «Mes 1».`);
  await del.getByRole('button', { name: 'Borrar este mes' }).click();
  await expect(page).toHaveURL(/\/redes\/feed\?mes=[0-9a-f-]{36}$/);
  await expect(tabs.getByRole('link', { name: label })).toHaveCount(0);
  const m1 = new URL(page.url()).searchParams.get('mes')!;
  await page.goto(`/redes/posts?mes=${m1}`);
  await expect(page.getByRole('article', { name: placedTitle, exact: true })).toBeVisible();
});
