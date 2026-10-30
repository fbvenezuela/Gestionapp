import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { loginAs } from './helpers';

// The board of Redes (R4, WP-D, D-71) against the demo, at 360 px with axe and once at 1366: «Estado del contenido»
// as blocks on the phone and a table on a computer; tapping Posts × «Copy faltante» twice opens two different pieces,
// each in its section with its card open and the focus on its title; a zero says «¡al día!»; «Por trimestre» and the
// arrows; «Buscar en Redes» across formats and tweets; a quick action creates in the open month. No hour anywhere.
// One server, in order (D-39); every number is read live. All data invented.
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

async function alive(page: Page) {
  await expect(page.locator('[data-tour="redes-matrix"]')).toBeVisible();
  await page.waitForLoadState('networkidle');
}

const visibleNumber = (page: Page, name: RegExp) => page.locator('[data-tour="redes-matrix"]').getByRole('link', { name }).locator('visible=true');

test('el tablero a 360: las cifras, un bloque por formato con sus siete números, sin horas y sin correrse de lado', async ({ page }) => {
  await loginAs(page, 'redes@demo.test');
  await page.goto('/redes');
  await expect(page.getByRole('heading', { level: 1, name: 'Redes' })).toBeVisible();
  await alive(page);
  await expect(page.getByRole('list', { name: 'Cifras de Redes' })).toContainText('Receptividad media');
  // On the phone: one block per format; the table is for a computer.
  const blocks = page.getByRole('list', { name: 'Estado del contenido por formato' });
  await expect(blocks).toBeVisible();
  for (const f of ['Reels', 'Posts', 'Carruseles', 'Historias', 'YouTube', 'Fin de mes']) await expect(blocks.getByRole('heading', { name: f, exact: true })).toBeVisible();
  await expect(page.locator('[data-tour="redes-matrix"] table')).toBeHidden();
  // The section bar carries the open month's numbers, and the board its observations, activity and quick actions.
  await expect(page.getByRole('navigation', { name: 'Secciones de Redes' }).getByRole('link', { name: /^Posts.*de 8 revisados/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Observaciones' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Actividad reciente' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Crear en Redes' }).getByRole('button', { name: /Nuevo reel/ })).toBeVisible();
  await expect(page.getByRole('search', { name: 'Buscar en Redes' })).toBeVisible();
  for (const name of ['Tweets', 'Publicar', 'Resultados', 'Biblioteca']) await expect(page.getByRole('region', { name, exact: true })).toBeVisible();
  expect(await page.locator('main').innerText()).not.toMatch(CLOCK);
  await noSideScroll(page);
  await axe(page);
});

test('«Copy faltante» de Posts dos veces lleva a dos piezas distintas, cada una abierta y con el foco en su título', async ({ page }) => {
  await loginAs(page, 'redes@demo.test');
  await page.goto('/redes');
  await alive(page);
  const cell = visibleNumber(page, /^Posts, Copy faltante: \d+\. Ir a la siguiente$/);
  const n = Number((await cell.getAttribute('aria-label'))!.match(/: (\d+)\./)![1]);
  expect(n, 'la demo trae al menos dos posts sin copy').toBeGreaterThanOrEqual(2);
  const seen: string[] = [];
  for (let i = 0; i < 2; i++) {
    if (i) {
      await page.goto('/redes');
      await alive(page);
    }
    await visibleNumber(page, /^Posts, Copy faltante: \d+\. Ir a la siguiente$/).click();
    await expect(page).toHaveURL(/\/redes\/posts\?mes=[0-9a-f-]{36}#pieza-[0-9a-f-]{36}$/);
    const anchor = new URL(page.url()).hash.slice(1);
    const article = page.locator(`#${anchor}`);
    await expect(article).toBeVisible();
    // Open (its body shows) and the focus on its title, even on the phone where the others start folded.
    await expect(page.locator(`#${anchor}-body`)).toBeVisible();
    await expect(article.getByRole('textbox', { name: 'Título', exact: true })).toBeFocused();
    seen.push(anchor);
  }
  expect(seen[0]).not.toBe(seen[1]);
});

test('un cero dice «¡al día!» y no lleva a ninguna parte', async ({ page }) => {
  await loginAs(page, 'redes@demo.test');
  await page.goto('/redes');
  await alive(page);
  const zero = page.locator('[data-tour="redes-matrix"]').getByRole('button', { name: /: 0\. Nada pendiente$/ }).locator('visible=true').first();
  await zero.click();
  await expect(page.getByText('Nada pendiente en esta categoría: ¡al día!').first()).toBeVisible();
  await expect(page).toHaveURL(/\/redes(\?.*)?$/);
});

test.describe('en la computadora (1366)', () => {
  test.use({ viewport: { width: 1366, height: 900 } });

  test('la tabla con su caption, «Por trimestre» con sus flechas y «Por mes» que mueve el mes abierto', async ({ page }) => {
    await loginAs(page, 'jefe@demo.test');
    await page.goto('/redes');
    await alive(page);
    const table = page.getByRole('table', { name: 'Estado del contenido' });
    await expect(table).toBeVisible();
    await expect(table.getByRole('columnheader')).toHaveText(['Formato', 'Revisados', 'Por revisar', 'Diseño aprobado', 'Diseño desaprobado', 'Publicado', 'Copy faltante', 'Imagen faltante']);
    await expect(table.getByRole('rowheader')).toHaveText(['Reels', 'Posts', 'Carruseles', 'Historias', 'YouTube', 'Fin de mes']);
    await expect(page.getByRole('list', { name: 'Estado del contenido por formato' })).toBeHidden();
    const period = page.locator('[data-tour="redes-period"]');
    await period.getByRole('link', { name: 'Por trimestre' }).click();
    await expect(page).toHaveURL(/vista=trimestre/);
    await expect(period).toContainText('Trimestre 1');
    await expect(period).toContainText('Mes 1 a Mes 3');
    await expect(period.getByRole('button', { name: 'Anterior: trimestre' })).toBeDisabled();
    await period.getByRole('link', { name: 'Por mes' }).click();
    await expect(period).toContainText('Mes 1');
    await expect(period.getByRole('button', { name: 'Anterior: mes' })).toBeDisabled();
    await period.getByRole('link', { name: 'Siguiente: mes' }).click();
    await expect(period).toContainText('Mes 2');
    await expect(page).toHaveURL(/\/redes\?mes=[0-9a-f-]{36}$/);
    // The open month follows in the section bar.
    const mes = new URL(page.url()).searchParams.get('mes');
    await expect(page.getByRole('navigation', { name: 'Secciones de Redes' }).getByRole('link', { name: /^Posts/ })).toHaveAttribute('href', `/redes/posts?mes=${mes}`);
    await axe(page);
    await noSideScroll(page);
  });
});

test('«Buscar en Redes» trae piezas de varios formatos y tweets, y cada resultado abre su tarjeta', async ({ page }) => {
  await loginAs(page, 'redes@demo.test');
  await page.goto('/redes');
  await alive(page);
  const box = page.getByRole('search', { name: 'Buscar en Redes' });
  await box.getByRole('searchbox', { name: 'Buscar en Redes' }).fill('agua');
  await box.getByRole('button', { name: 'Buscar' }).click();
  await expect(page).toHaveURL(/\/redes\/buscar\?mes=[0-9a-f-]{36}&q=agua$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Buscar en Redes' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /resultados? para «agua»/ })).toBeVisible();
  const groups = page.getByRole('region');
  const names = await groups.evaluateAll((rs) => rs.map((r) => r.querySelector('h2')?.textContent ?? ''));
  expect(names.filter((n) => ['Reels', 'Posts', 'Carruseles', 'Historias', 'YouTube', 'Fin de mes'].includes(n)).length, names.join(', ')).toBeGreaterThanOrEqual(2);
  expect(await page.locator('main').innerText()).not.toMatch(CLOCK);
  await noSideScroll(page);
  await axe(page);
  // A tweet (the demo's tweets talk about the court) opens its week.
  await page.goto('/redes/buscar?q=cancha');
  const tweets = page.getByRole('region', { name: 'Tweets' });
  await expect(tweets).toBeVisible();
  await expect(tweets.getByRole('link').first()).toHaveAttribute('href', /^\/tweets\/[0-9a-f-]{36}$/);
  // A piece opens its card in its section.
  const first = page.getByRole('region', { name: 'Reels' }).getByRole('link').first();
  const href = (await first.getAttribute('href'))!;
  expect(href).toMatch(/^\/redes\/reels\?mes=[0-9a-f-]{36}#pieza-[0-9a-f-]{36}$/);
  await first.click();
  await expect(page.locator(`#${href.split('#')[1]}`)).toBeVisible();
});

test('una acción rápida crea en el mes abierto y abre la tarjeta en su sección', async ({ page }) => {
  await loginAs(page, 'redes@demo.test');
  await page.goto('/redes');
  await alive(page);
  // Open Mes 2 from the period arrows, then «Nueva historia».
  await page.locator('[data-tour="redes-period"]').getByRole('link', { name: 'Siguiente: mes' }).click();
  await expect(page.locator('[data-tour="redes-period"]')).toContainText('Mes 2');
  const mes = new URL(page.url()).searchParams.get('mes')!;
  await alive(page);
  const quick = page.getByRole('navigation', { name: 'Crear en Redes' });
  await expect(quick).toContainText('En Mes 2');
  await quick.getByRole('button', { name: /^Nueva historia/ }).click();
  await expect(page).toHaveURL(new RegExp(`/redes/historias\\?mes=${mes}#pieza-[0-9a-f-]{36}$`));
  const anchor = new URL(page.url()).hash.slice(1);
  const article = page.locator(`#${anchor}`);
  await expect(article.getByRole('textbox', { name: 'Título', exact: true })).toHaveValue('Historia nueva');
  await expect(page.getByRole('navigation', { name: 'Meses de contenido' }).getByRole('link', { name: /^Mes 2/ })).toHaveAttribute('aria-current', 'page');
});
