import { test, expect, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { loginAs } from './helpers';

// The piece in big, the review room and Ajustes → Cupo y pilares (R4, WP-C2, D-60, D-63, D-66, D-68, D-70), at 360 px
// against the demo (and one pass at 1366): a story's review room shows what goes out in the app; a notice Redes puts
// shows on top of the boss's checklist with «Leí los avisos de cumplimiento»; ?volver= to another site ends in «Por
// aprobar» and the real one back on the card; «Nueva pieza» from an event asks «Formato» and «Mes»; the boss deletes from
// the piece in big and administración brings it back. One server, in order (D-39): each step builds on the one before.
// It runs before redes-tarjetas.spec.ts: it leaves alone the pieces that one uses and creates no month. Invented data.
test.describe.configure({ mode: 'serial' });

async function axe(page: Page) {
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 15_000 });
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([]);
}

async function noSideScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
}

const card = (page: Page, title: string) => page.getByRole('article', { name: title, exact: true });

// A card that starts folded on the phone: open it (the page may still be coming alive, so try until its body shows).
async function open(c: Locator) {
  await c.scrollIntoViewIfNeeded();
  const body = c.page().locator(`#${await c.getAttribute('id')}-body`);
  await expect(async () => {
    if (await body.isVisible()) return;
    const unfold = c.getByRole('button', { name: 'Desplegar' });
    if (await unfold.count()) await unfold.click();
    await expect(body).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 20_000 });
}

async function idOf(page: Page, path: string, title: string): Promise<string> {
  await page.goto(path);
  const c = card(page, title);
  await expect(c).toBeVisible();
  return (await c.getAttribute('id'))!.replace(/^pieza-/, '');
}

async function monthIds(page: Page): Promise<string[]> {
  const tabs = page.getByRole('navigation', { name: 'Meses de contenido' }).getByRole('link');
  await expect(tabs.first()).toBeVisible();
  return (await tabs.evaluateAll((as) => as.map((a) => new URL((a as HTMLAnchorElement).href).searchParams.get('mes') ?? ''))).filter(Boolean);
}

async function switchTo(page: Page, email: string) {
  await page.context().clearCookies();
  await loginAs(page, email);
}

const CAROUSEL = 'Cómo pedir un operativo';
const NOTICE = 'Falta la autorización escrita de quien sale en la lámina 2 (prueba).';
const NEW_TITLE = 'Afiche de la jornada de salud (prueba)';
let newPiece = '';
let m2 = '';

test('la sala de una historia muestra lo que sale en la app: texto en pantalla, sticker, su texto y su enlace', async ({ page }) => {
  await loginAs(page, 'jefe@demo.test');
  const id = await idOf(page, '/redes/historias', 'Enlace al reporte de obras');
  await page.goto(`/aprobar/${id}`);
  const out = page.getByRole('region', { name: 'Lo que sale en la app' });
  await expect(out).toBeVisible();
  await expect(out.getByText('Lee el reporte completo')).toBeVisible();
  await expect(out.getByText('Enlace', { exact: true })).toBeVisible();
  await expect(out.getByText('Lee el reporte', { exact: true })).toBeVisible();
  await expect(out.getByText('https://example.org/demo/reporte')).toBeVisible();
  await expect(page.locator('main').getByText('Historia', { exact: true }).first()).toBeVisible();
  // A story has no copy: no «Copies: cómo saldrá».
  await expect(page.getByRole('heading', { name: 'Copies: cómo saldrá' })).toHaveCount(0);
  await noSideScroll(page);
  await axe(page);
});

test('Redes pone un aviso; el jefe lo ve arriba de su lista con «Leí los avisos de cumplimiento»; ?volver= de otro sitio termina en «Por aprobar»', async ({ page }) => {
  await loginAs(page, 'redes@demo.test');
  await page.goto('/redes/carruseles');
  const c = card(page, CAROUSEL);
  await open(c);
  await c.getByRole('button', { name: 'Agregar aviso' }).click();
  await c.getByLabel('Tipo de aviso').selectOption('written_consent');
  await c.getByLabel('Qué hay que cuidar').fill(NOTICE);
  await c.getByRole('button', { name: 'Guardar aviso' }).click();
  await expect(page.getByText('Aviso guardado').first()).toBeVisible();
  const id = (await c.getAttribute('id'))!.replace(/^pieza-/, '');

  await switchTo(page, 'jefe@demo.test');
  await page.goto('/aprobar');
  const row = page.getByRole('link', { name: new RegExp(CAROUSEL) });
  await expect(row.getByText('Carrusel', { exact: true })).toBeVisible();
  await expect(row.getByText('Tiene avisos')).toBeVisible();
  await noSideScroll(page);
  await axe(page);
  await row.click();
  await expect(page).toHaveURL(new RegExp(`/aprobar/${id}$`));
  // The notice, above «Antes de aprobar»; the slides in order.
  const band = page.getByRole('region', { name: 'Avisos de cumplimiento' });
  await expect(band.getByText(NOTICE)).toBeVisible();
  const list = page.getByRole('group', { name: 'Antes de aprobar' });
  expect((await band.boundingBox())!.y).toBeLessThan((await list.boundingBox())!.y);
  await expect(page.getByRole('heading', { name: 'Láminas en orden' })).toBeVisible();
  await expect(page.getByText('Lámina 1 · Portada')).toBeVisible();
  await expect(page.getByText('Lámina 4 · CTA')).toBeVisible();
  await noSideScroll(page);
  await axe(page);
  // The four checks are not enough: the notices too.
  const read = list.getByRole('checkbox', { name: 'Leí los avisos de cumplimiento' });
  await expect(list.getByRole('checkbox')).toHaveCount(5);
  for (const box of await list.getByRole('checkbox').all()) await box.check();
  await read.uncheck();
  await expect(page.getByRole('button', { name: 'Marca la lista para aprobar' })).toBeDisabled();
  await read.check();
  await expect(page.getByRole('button', { name: 'Aprobar', exact: true })).toBeEnabled();

  // A way back to another site is never followed: after deciding, «Por aprobar».
  await page.goto(`/aprobar/${id}?volver=${encodeURIComponent('https://example.org/redes/posts')}`);
  await expect(page.locator('main').getByRole('link', { name: 'Por aprobar' })).toHaveAttribute('href', '/aprobar');
  await page.getByRole('button', { name: 'Muy largo' }).click();
  await page.getByRole('button', { name: 'Pedir cambios' }).click();
  await expect(page.getByText('Se pidieron los cambios.').first()).toBeVisible();
  await expect(page).toHaveURL(/\/aprobar$/);
});

test('Redes la vuelve a enviar desde su tarjeta; el jefe la aprueba con «Revisar» y vuelve a Carruseles con la tarjeta lista', async ({ page }) => {
  await loginAs(page, 'redes@demo.test');
  await page.goto('/redes/carruseles');
  const c = card(page, CAROUSEL);
  await open(c);
  await expect(c.getByText('Pidieron cambios: revísalos y vuelve a enviarla.')).toBeVisible();
  const send = c.getByRole('button', { name: 'Enviar a aprobación' });
  await expect(send).toBeEnabled();
  await send.click();
  await expect(page.getByText('Enviada al jefe para aprobar.').first()).toBeVisible();
  await expect(c.getByText('Espera al jefe')).toBeVisible();

  await switchTo(page, 'jefe@demo.test');
  await page.goto('/redes/carruseles');
  const [m1] = await monthIds(page);
  const mine = card(page, CAROUSEL);
  await open(mine);
  const id = (await mine.getAttribute('id'))!.replace(/^pieza-/, '');
  const back = `/redes/carruseles?mes=${m1}#pieza-${id}`;
  await mine.getByRole('link', { name: 'Revisar' }).click();
  await expect(page).toHaveURL(new RegExp(`/aprobar/${id}\\?volver=`));
  await expect(page.locator('main').getByRole('link', { name: 'Carruseles' })).toHaveAttribute('href', back);
  for (const box of await page.getByRole('group', { name: 'Antes de aprobar' }).getByRole('checkbox').all()) await box.check();
  await page.getByRole('button', { name: 'Aprobar', exact: true }).click();
  await expect(page.getByText('Aprobada.').first()).toBeVisible();
  await page.waitForURL((u) => u.pathname === '/redes/carruseles');
  expect(page.url()).toContain(back);
  const done = card(page, CAROUSEL);
  await expect(done.getByText('En revisión · ✓ Lista')).toBeVisible();
  await expect(done.getByText('Revisado y listo para publicar')).toBeVisible();
});

test('desde un evento: «Nueva pieza» pide «Formato» y «Mes»; la pieza en grande es su tarjeta, con «Copies» abajo', async ({ page }) => {
  await loginAs(page, 'redes@demo.test');
  await page.goto('/redes/posts');
  [, m2] = await monthIds(page);
  await page.goto('/redes/reels');
  const event = await card(page, 'Jornada de salud escolar').getByRole('link', { name: 'Ver evento' }).getAttribute('href');
  expect(event).toMatch(/^\/eventos\/[0-9a-f-]{36}$/);
  await page.goto(`${event}?tab=piezas`);
  const tab = page.locator('main');
  const row = tab.getByRole('link', { name: /Jornada de salud escolar/ });
  await expect(row.getByText('Reel', { exact: true })).toBeVisible();
  await tab.getByRole('link', { name: 'Nueva pieza' }).click();
  await expect(page).toHaveURL(new RegExp(`/piezas/nueva\\?evento=${event!.split('/')[2]}$`));

  const formats = page.getByRole('group', { name: 'Formato' });
  await expect(formats.getByRole('radio')).toHaveCount(6);
  await expect(formats.getByRole('radio', { name: /^Reel/ })).toBeChecked();
  await formats.getByRole('radio', { name: /^Post/ }).check();
  await expect(page.getByLabel('Mes', { exact: true })).toHaveValue(/[0-9a-f-]{36}/);
  await page.getByLabel('Mes', { exact: true }).selectOption({ label: 'Mes 2' });
  await page.getByLabel('Título').fill(NEW_TITLE);
  await noSideScroll(page);
  await axe(page);
  await page.getByRole('button', { name: 'Crear pieza' }).click();
  await page.waitForURL(/\/piezas\/[0-9a-f-]{36}$/);
  newPiece = new URL(page.url()).pathname;

  // The piece in big: the same card as in Posts (its art text, the review row), then «Copies» with its anchor.
  await expect(page.getByRole('heading', { level: 1, name: NEW_TITLE })).toBeVisible();
  await expect(page.locator('main').getByRole('link', { name: 'Posts', exact: true })).toHaveAttribute('href', new RegExp(`^/redes/posts\\?mes=${m2}#pieza-`));
  const big = card(page, NEW_TITLE);
  await expect(big.getByText('Texto del arte')).toBeVisible();
  await expect(big.getByRole('link', { name: /El copy se escribe abajo, en «Copies»/ })).toHaveAttribute('href', '#copies');
  await expect(big.getByRole('button', { name: 'Enviar a aprobación' })).toBeDisabled();
  await expect(big.getByLabel('Nivel de aprobación')).toBeVisible();
  await expect(big.getByText('Sube la imagen 4:5.')).toBeVisible();
  await expect(page.locator('#copies').getByRole('button', { name: 'Escribir desde la ficha' })).toBeVisible();
  await expect(page.locator('[data-tour="final-file"]').getByText('Subir imagen final (nueva versión)')).toBeAttached();
  await noSideScroll(page);
  await axe(page);

  // It lives in Posts of Mes 2.
  await page.goto(`/redes/posts?mes=${m2}`);
  await expect(card(page, NEW_TITLE)).toBeVisible();
});

test('el jefe la elimina desde la pieza en grande; administración la recupera en «Piezas eliminadas» y vuelve a Posts de Mes 2', async ({ page }) => {
  expect(newPiece, 'la pieza de la prueba anterior').toMatch(/^\/piezas\/[0-9a-f-]{36}$/);
  await loginAs(page, 'jefe@demo.test');
  await page.goto(newPiece);
  const big = card(page, NEW_TITLE);
  const item = big.getByRole('button', { name: 'Eliminar' });
  await expect(async () => {
    if (!(await item.isVisible())) await big.getByLabel('Opciones de la pieza').click();
    await expect(item).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 20_000 });
  await expect(big.getByRole('link', { name: 'Abrir la pieza' })).toHaveCount(0);
  await item.click();
  const confirm = page.getByRole('dialog', { name: '¿Eliminar esta pieza?' });
  await confirm.getByRole('button', { name: 'Eliminar' }).click();
  await expect(page.getByText('Pieza eliminada').first()).toBeVisible();
  await page.waitForURL((u) => u.pathname === '/redes/posts' && u.searchParams.get('mes') === m2 && !u.hash);
  await expect(page.getByRole('heading', { level: 1, name: 'Posts' })).toBeVisible();
  await expect(card(page, NEW_TITLE)).toHaveCount(0);
  await expect(page.getByText('Esta pieza se creó en otro servidor')).toHaveCount(0);

  await switchTo(page, 'admin@demo.test');
  await page.goto('/ajustes');
  await page.getByRole('link', { name: /Cupo y pilares/ }).click();
  await expect(page).toHaveURL(/\/ajustes\/contenido$/);
  const deleted = page.locator('main .glass-card').filter({ has: page.getByRole('heading', { name: 'Piezas eliminadas' }) });
  const row = deleted.getByRole('listitem').filter({ hasText: NEW_TITLE });
  await expect(row).toContainText('Post · Mes 2 · Eliminada hace');
  await noSideScroll(page);
  await axe(page);
  await row.getByRole('button', { name: `Recuperar «${NEW_TITLE}»` }).click();
  await expect(page.getByText('Pieza recuperada en Mes 2').first()).toBeVisible();
  await expect(deleted.getByText(NEW_TITLE)).toHaveCount(0);
  await page.goto(`/redes/posts?mes=${m2}`);
  await expect(card(page, NEW_TITLE)).toBeVisible();
});

test('administración cambia el cupo en «Cupo y pilares» y la sección lo muestra (y lo deja como estaba)', async ({ page }) => {
  await loginAs(page, 'admin@demo.test');
  await page.goto('/ajustes/contenido');
  const box = page.getByLabel('Historias', { exact: true });
  const before = await box.inputValue();
  await box.fill('31');
  await page.getByRole('button', { name: 'Guardar cupo' }).click();
  await expect(page.getByText('Cupo guardado.').first()).toBeVisible();
  await page.goto('/redes/historias');
  await expect(page.getByText(/^Historias de Mes 1: \d+ de 31/)).toBeVisible();
  await page.goto('/ajustes/contenido');
  await page.getByLabel('Historias', { exact: true }).fill(before);
  await page.getByRole('button', { name: 'Guardar cupo' }).click();
  await expect(page.getByText('Cupo guardado.').first()).toBeVisible();
  await page.goto('/redes/historias');
  await expect(page.getByText(new RegExp(`^Historias de Mes 1: \\d+ de ${before}`))).toBeVisible();
});

test('a 1366 px: la pieza en grande, la sala de revisión y «Nueva pieza», sin scroll de lado y con axe', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await loginAs(page, 'jefe@demo.test');
  const id = await idOf(page, '/redes/carruseles', 'Cinco obras del mes');
  for (const path of [`/piezas/${id}`, `/aprobar/${id}`, '/piezas/nueva']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await noSideScroll(page);
    await axe(page);
  }
});
