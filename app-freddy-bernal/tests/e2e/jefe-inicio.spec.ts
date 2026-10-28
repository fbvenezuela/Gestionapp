import { test, expect, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { loginAs } from './helpers';

// The boss's Inicio and the Redes hub (cambios del 27/10/2026, §3), on the iPad (1024×768) and the phone (360 px), with
// axe and no sideways scroll: four big tiles (Política, Obras, Redes, Digital) whose live counters are the same numbers
// the screens they open show, «Aprobar todas las verdes» in one tap from the Inicio, the phone bar Inicio, Agenda, Por
// aprobar, Redes and «Más», and /redes as the door to Redes' own screens (Redes may use it too, without any date).
// The demo database is shared by the whole run, so every number is read live and compared, never hard-coded.
test.describe.configure({ mode: 'serial' });

const TIME_RE = /\b\d{1,2}:\d{2}\s?(a\.?\s?m\.?|p\.?\s?m\.?|AM|PM)/i;

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

const tile = (page: Page, name: string) => page.getByRole('region', { name, exact: true });

// The number of a counter link («3 piezas en curso»), found by the words after the number (a regex source).
async function counter(scope: Locator, words: string): Promise<{ link: Locator; n: number }> {
  const link = scope.getByRole('link', { name: new RegExp(`^([\\d.]+) ${words}$`) });
  await expect(link).toHaveCount(1);
  const name = (await link.innerText()).replace(/\s+/g, ' ').trim();
  return { link, n: Number(name.match(/^([\d.]+)/)![1].replace(/\./g, '')) };
}

// A <Stat> of a page: its label, then its value.
async function stat(page: Page, label: string) {
  const value = page.getByText(label, { exact: true }).first().locator('xpath=following-sibling::p[1]');
  return Number((await value.innerText()).replace(/\D/g, ''));
}

// Every target in the tiles is big enough for a finger (56 px; the head of each tile, 80 px).
async function bigTargets(page: Page, names: string[]) {
  for (const name of names) {
    const links = await tile(page, name).getByRole('link').all();
    expect(links.length, name).toBeGreaterThan(1);
    for (const [i, l] of links.entries()) {
      const box = (await l.boundingBox())!;
      expect(box.height, `${name}: ${await l.innerText()}`).toBeGreaterThanOrEqual(i === 0 ? 80 : 56);
    }
  }
}

const BOSS_TILES = ['Política', 'Obras', 'Redes', 'Digital'];
const HUB_TILES = ['Piezas', 'Tweets', 'Publicar', 'Resultados', 'Biblioteca'];

test.describe('en el iPad (1024×768)', () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  test('el inicio del jefe: cuatro botones grandes, dos por fila, con contadores en vivo', async ({ page }) => {
    await loginAs(page, 'jefe@demo.test');
    await page.goto('/jefe');
    for (const name of BOSS_TILES) await expect(tile(page, name)).toBeVisible();
    // Two per row on the iPad: Política next to Obras, Redes next to Digital.
    const box = async (name: string) => (await tile(page, name).boundingBox())!;
    const [pol, obr, red, dig] = [await box('Política'), await box('Obras'), await box('Redes'), await box('Digital')];
    expect(Math.abs(pol.y - obr.y)).toBeLessThan(2);
    expect(obr.x).toBeGreaterThan(pol.x + pol.width - 1);
    expect(Math.abs(red.y - dig.y)).toBeLessThan(2);
    expect(red.y).toBeGreaterThan(pol.y);
    // The head of each tile opens its screen (the names other specs rely on).
    await expect(page.getByRole('link', { name: /^Política Agenda/ })).toHaveAttribute('href', '/jefe/politica');
    await expect(page.getByRole('link', { name: /^Obras Las fichas del IVT/ })).toHaveAttribute('href', '/obras');
    await expect(page.getByRole('link', { name: /^Redes Piezas, tweets/ })).toHaveAttribute('href', '/redes');
    await expect(page.getByRole('link', { name: /^Digital Lo publicado/ })).toHaveAttribute('href', '/jefe/digital');
    // The approval block stays, with every level and the tweets.
    await expect(page.getByRole('region', { name: 'Te toca aprobar' })).toBeVisible();
    await bigTargets(page, BOSS_TILES);
    await fitsWidth(page, '/jefe en el iPad');
    await noSerious(page, '/jefe en el iPad');
  });

  test('cada contador del inicio es el número de la pantalla que abre', async ({ page }) => {
    await loginAs(page, 'jefe@demo.test');
    await page.goto('/jefe');
    const pol = tile(page, 'Política');
    const toSchedule = await counter(pol, 'por ponerle fecha');
    const pending = await counter(pol, 'por decidir');
    await counter(pol, 'eventos? hoy');
    const obraWaiting = await counter(tile(page, 'Obras'), 'por ponerle fecha');
    const pieces = await counter(tile(page, 'Redes'), 'piezas? en curso');
    await counter(tile(page, 'Redes'), 'listas? para publicar');
    await counter(tile(page, 'Redes'), 'días? cubiertos? de tweets');
    const published = await counter(tile(page, 'Digital'), 'publicadas? esta semana');
    await counter(tile(page, 'Digital'), 'vistas esta semana');

    await toSchedule.link.click();
    await expect(page).toHaveURL(/\/agenda\/por-fecha$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Por ponerle fecha' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ver ficha' })).toHaveCount(toSchedule.n);

    await page.goto('/jefe');
    await pending.link.click();
    await expect(page).toHaveURL(/\/jefe\/politica$/);
    if (pending.n) await expect(page.getByRole('heading', { name: `Esperan tu decisión (${pending.n})` })).toBeVisible();
    else await expect(page.getByRole('heading', { name: /^Esperan tu decisión/ })).toHaveCount(0);

    await page.goto('/jefe');
    await obraWaiting.link.click();
    await expect(page).toHaveURL(/\/obras\?estado=to_schedule$/);
    await expect(page.locator('main li a[href^="/obras/"]')).toHaveCount(obraWaiting.n);

    await page.goto('/jefe');
    await pieces.link.click();
    await expect(page).toHaveURL(/\/piezas$/);
    await expect(page.locator('main li a[href^="/piezas/"]')).toHaveCount(pieces.n);
    // On a Redes screen the boss's menu marks «Redes» (his door to it).
    await expect(page.getByRole('navigation', { name: 'Menú principal' }).getByRole('link', { name: 'Redes' })).toHaveAttribute('aria-current', 'page');

    await page.goto('/jefe');
    await published.link.click();
    await expect(page).toHaveURL(/\/jefe\/digital$/);
    expect(await stat(page, 'Publicado esta semana')).toBe(published.n);
  });

  test('un toque en el inicio aprueba todas las verdes, sin ventanas, y Redes las ve listas para publicar', async ({ page }) => {
    let nativeDialog = false;
    page.on('dialog', (d) => {
      nativeDialog = true;
      void d.dismiss();
    });
    await loginAs(page, 'jefe@demo.test');
    await page.goto('/jefe');
    const block = page.getByRole('region', { name: 'Te toca aprobar' });
    const greens = block.getByRole('button', { name: /^Aprobar todas las verdes \(\d+\)$/ });
    await expect(greens).toBeVisible();
    const n = Number((await greens.innerText()).match(/\((\d+)\)/)![1]);
    expect(n).toBeGreaterThan(0);
    expect((await greens.boundingBox())!.height).toBeGreaterThanOrEqual(56);
    await expect(block.getByRole('heading', { name: new RegExp(`^Verde\\s+${n} piezas?$`) })).toBeVisible();
    const ready = await counter(tile(page, 'Redes'), 'listas? para publicar');
    await greens.click();
    await expect(page.getByText(n === 1 ? 'Aprobada la verde.' : `Aprobadas ${n} verdes.`)).toBeVisible();
    await expect(page.getByRole('button', { name: /Aprobar todas las verdes/ })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /^Verde\s/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Saludo semanal a los clubes deportivos/ })).toHaveCount(0);
    // Approved and not published yet: the Redes tile counts them as ready.
    await expect(tile(page, 'Redes').getByRole('link', { name: new RegExp(`^${ready.n + n} listas? para publicar$`) })).toBeVisible();
    // «Por aprobar» agrees.
    await page.goto('/aprobar');
    await expect(page.getByRole('heading', { name: 'Por aprobar' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Aprobar todas las verdes/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Saludo semanal a los clubes deportivos/ })).toHaveCount(0);
    expect(nativeDialog).toBe(false);
  });

  test('la puerta de Redes: cinco botones con lo que espera en cada pantalla', async ({ page }) => {
    await loginAs(page, 'jefe@demo.test');
    await page.goto('/redes');
    await expect(page.getByRole('heading', { level: 1, name: 'Redes' })).toBeVisible();
    for (const name of HUB_TILES) await expect(tile(page, name)).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Menú principal' }).getByRole('link', { name: 'Redes' })).toHaveAttribute('aria-current', 'page');
    // What waits for the boss opens where he approves.
    const waiting = await counter(tile(page, 'Piezas'), 'esperan? al jefe');
    await expect(waiting.link).toHaveAttribute('href', '/aprobar');
    await expect((await counter(tile(page, 'Tweets'), 'por aprobar')).link).toHaveAttribute('href', '/aprobar?tab=tweets');
    await bigTargets(page, HUB_TILES);
    await fitsWidth(page, '/redes en el iPad');
    await noSerious(page, '/redes en el iPad');
  });
});

test.describe('en el teléfono (360 px)', () => {
  test('el inicio del jefe cabe: los cuatro botones uno debajo del otro y la barra con «Más»', async ({ page }) => {
    await loginAs(page, 'jefe@demo.test');
    await page.goto('/jefe');
    const boxes = [];
    for (const name of BOSS_TILES) {
      await expect(tile(page, name)).toBeVisible();
      boxes.push((await tile(page, name).boundingBox())!);
    }
    for (let i = 1; i < boxes.length; i++) {
      expect(Math.abs(boxes[i].x - boxes[0].x)).toBeLessThan(2);
      expect(boxes[i].y).toBeGreaterThan(boxes[i - 1].y + boxes[i - 1].height - 1);
    }
    await bigTargets(page, BOSS_TILES);
    await fitsWidth(page, '/jefe en el teléfono');
    await noSerious(page, '/jefe en el teléfono');
    // The phone bar: Inicio, Agenda, Por aprobar, Redes and «Más» with Obras, Municipios and Digital.
    const bar = page.getByRole('navigation', { name: 'Menú', exact: true });
    await expect(bar.getByRole('link')).toHaveText(['Inicio', 'Agenda', 'Por aprobar', 'Redes']);
    await expect(bar.getByRole('link', { name: 'Inicio' })).toHaveAttribute('aria-current', 'page');
    await bar.getByText('Más', { exact: true }).click();
    for (const name of ['Obras', 'Municipios', 'Digital']) await expect(bar.getByRole('link', { name })).toBeVisible();
    await expect(bar.getByRole('link', { name: 'Piezas' })).toHaveCount(0);
  });

  test('el jefe entra a Redes desde la barra y sus contadores son los de cada pantalla', async ({ page }) => {
    await loginAs(page, 'jefe@demo.test');
    await page.goto('/jefe');
    const bar = page.getByRole('navigation', { name: 'Menú', exact: true });
    await bar.getByRole('link', { name: 'Redes' }).click();
    await expect(page).toHaveURL(/\/redes$/);
    await expect(bar.getByRole('link', { name: 'Redes' })).toHaveAttribute('aria-current', 'page');
    for (const name of HUB_TILES) await expect(tile(page, name)).toBeVisible();
    await fitsWidth(page, '/redes en el teléfono');
    await noSerious(page, '/redes en el teléfono');
    const active = await counter(tile(page, 'Piezas'), 'en curso');
    const upcoming = await counter(tile(page, 'Tweets'), 'por salir');
    const published = await counter(tile(page, 'Resultados'), 'publicaciones? en 30 días');

    await active.link.click();
    await expect(page).toHaveURL(/\/piezas$/);
    await expect(page.locator('main li a[href^="/piezas/"]')).toHaveCount(active.n);
    await expect(bar.getByRole('link', { name: 'Redes' })).toHaveAttribute('aria-current', 'page');

    await page.goto('/redes');
    await upcoming.link.click();
    await expect(page).toHaveURL(/\/tweets$/);
    expect(await stat(page, 'Por salir')).toBe(upcoming.n);

    await page.goto('/redes');
    await published.link.click();
    await expect(page).toHaveURL(/\/resultados$/);
    expect(await stat(page, 'Publicaciones')).toBe(published.n);
  });

  test('Redes también puede usar la puerta de Redes: sin fechas y sin «Por aprobar»', async ({ page }) => {
    await loginAs(page, 'redes@demo.test');
    await page.goto('/redes');
    for (const name of HUB_TILES) await expect(tile(page, name)).toBeVisible();
    expect(await page.locator('main').innerText()).not.toMatch(TIME_RE);
    // Redes does not approve: what waits for the boss opens its own screens.
    await expect((await counter(tile(page, 'Piezas'), 'esperan? al jefe')).link).toHaveAttribute('href', '/piezas');
    await expect((await counter(tile(page, 'Tweets'), 'por aprobar')).link).toHaveAttribute('href', '/tweets');
    // Its own menu does not change (Hoy first).
    await expect(page.getByRole('navigation', { name: 'Menú', exact: true }).getByRole('link').first()).toHaveText('Hoy');
    await fitsWidth(page, '/redes de Redes');
    await noSerious(page, '/redes de Redes');
  });
});
