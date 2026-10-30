import { test, expect, type Browser, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import { loginAs } from './helpers';

// The sections of Redes and their cards (R4, WP-C1, D-60 to D-70), at 360 px against the demo (and one pass at 1366):
// «+ Nuevo reel» on top without changing the address, the post's fields and its image, «Enviar a aprobación» with
// what is missing, the month that follows from one section to the next, «¿Qué quieres crear?», no hour nor event day
// anywhere, the boss's «Revisar» and its way back, what goes out read-only on an approved piece behind «Editar (vuelve
// al jefe)», «Ya lo publiqué», «Eliminar» only for the boss, the design held after the approval, the notices, and the
// card someone jumps to. One server, in order (D-39): each step builds on the one before. All data invented.
test.describe.configure({ mode: 'serial' });

const fixture = (f: string) => path.join(__dirname, '..', 'fixtures', f);
const CLOCK = /\d{1,2}:\d{2}\s?[ap]\.\s?m\./i;

async function axe(page: Page) {
  // The page itself, once the last toast is gone (the toasts are the app's, checked elsewhere).
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 15_000 });
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([]);
}

async function noSideScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
}

const card = (page: Page, title: string) => page.getByRole('article', { name: title, exact: true });

// A card that starts folded on the phone: open it (the first one of a section is never folded). Until the page comes
// alive the phone's CSS keeps it folded, so try again until its body shows.
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

// The card's «⋯» (a <details>): a tap while the page is still coming alive can be lost, so try until it is open.
async function openMenu(c: Locator) {
  const item = c.getByRole('button', { name: 'Duplicar' });
  await expect(async () => {
    if (!(await item.isVisible())) await c.getByLabel('Opciones de la pieza').click();
    await expect(item).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 20_000 });
}

// The page came alive (React took over): on the phone the cards after the first one are folded by then. A tap on a
// button before that does nothing.
async function alive(page: Page) {
  await expect(page.locator('[aria-label="Desplegar"]').first()).toBeAttached({ timeout: 20_000 });
}

async function monthIds(page: Page): Promise<string[]> {
  const tabs = page.getByRole('navigation', { name: 'Meses de contenido' }).getByRole('link');
  await expect(tabs.first()).toBeVisible();
  return (await tabs.evaluateAll((as) => as.map((a) => new URL((a as HTMLAnchorElement).href).searchParams.get('mes') ?? ''))).filter(Boolean);
}

async function bossSees(browser: Browser, eventHref: string): Promise<{ day: string; time: string }> {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 760 }, locale: 'es-VE', timezoneId: 'America/Caracas' });
  const page = await ctx.newPage();
  await loginAs(page, 'jefe@demo.test');
  await page.goto(`${eventHref}?tab=ficha`);
  await expect(page.locator('main').getByText(CLOCK).first()).toBeVisible();
  const text = await page.locator('main').innerText();
  const when = text.match(/^[^\n]*\d{1,2} de [^\n,]+, \d{1,2}:\d{2}\s?[ap]\.\s?m\.$/m)?.[0] ?? '';
  expect(when, 'el jefe ve la fecha y la hora del evento').not.toBe('');
  await ctx.close();
  return { day: when.match(/\d{1,2} de [a-záéíóú]+/i)![0], time: when.match(CLOCK)![0] };
}

test('Redes: «+ Nuevo reel» la pone arriba, abierta y sin cambiar de dirección; título, una toma, plegar y desplegar', async ({ page }) => {
  await loginAs(page, 'redes@demo.test');
  await page.goto('/redes/reels');
  await expect(page.getByRole('heading', { name: 'Reels', level: 1 })).toBeVisible();
  await expect(page.getByText(/^Reels de Mes 1: \d+ de 12/)).toBeVisible();
  await axe(page);
  await noSideScroll(page);
  const before = page.url();
  await alive(page);
  await page.getByRole('button', { name: 'Nuevo reel' }).click();
  await expect(page.getByText('Reel creado').first()).toBeVisible();
  const first = page.getByRole('article').first();
  const title = first.getByRole('textbox', { name: 'Título', exact: true });
  await expect(title).toHaveValue('Reel nuevo');
  await expect(title).toBeFocused();
  expect(page.url()).toBe(before);
  await title.fill('Reel de prueba de la sección');
  await first.getByRole('button', { name: 'Agregar toma' }).click();
  await first.getByLabel('Lo que dice').first().fill('Así quedó la obra (texto de prueba).');
  await first.getByLabel('La acción').first().fill('Toma abierta de la obra');
  await expect(first.getByText('Guardado', { exact: true })).toBeVisible({ timeout: 15_000 });
  // Folded, the header (thumbnail, title, chips) stays; the body goes.
  const fresh = card(page, 'Reel de prueba de la sección');
  await fresh.getByRole('button', { name: 'Plegar' }).click();
  await expect(fresh.getByRole('button', { name: 'Agregar toma' })).toBeHidden();
  await expect(fresh.getByRole('textbox', { name: 'Título', exact: true })).toBeVisible();
  await fresh.getByRole('button', { name: 'Desplegar' }).click();
  await expect(fresh.getByLabel('Lo que dice').first()).toHaveValue('Así quedó la obra (texto de prueba).');
  // Saved on this server: still there after a reload, with its shot.
  await page.reload();
  const again = card(page, 'Reel de prueba de la sección');
  await open(again);
  await expect(again.getByLabel('Lo que dice').first()).toHaveValue('Así quedó la obra (texto de prueba).');
});

test('Redes: el post con su texto del arte, enlaces, proporción 1:1 y caption; sube la imagen y la manda a aprobar', async ({ page }) => {
  await loginAs(page, 'redes@demo.test');
  await page.goto('/redes/posts');
  const c = card(page, 'Rutas para conocer el estado');
  await open(c);
  await c.getByLabel('Antetítulo').fill('Turismo (prueba)');
  await c.getByLabel('Titular').fill('Rutas para conocer el estado');
  await c.getByLabel('Enlaces / referencias').fill('https://example.org/demo/rutas');
  await c.getByLabel('Proporción').selectOption('1:1');
  await expect(c.getByText('Imagen 1:1', { exact: true })).toBeVisible();
  await c.getByLabel('Caption (copy largo: Instagram, Facebook y TikTok)').fill('¡Saludos, Táchira! Rutas para conocer el estado (prueba). 💛 Por amor al Táchira.');
  await expect(c.getByText('Guardado', { exact: true })).toBeVisible({ timeout: 15_000 });
  // What is missing is said under the switched-off button.
  await expect(c.getByRole('button', { name: 'Enviar a aprobación' })).toBeDisabled();
  await expect(c.getByText('Sube la imagen 1:1.')).toBeVisible();
  // The uploader loads on the tap; the picture shows in the header.
  await c.getByRole('button', { name: 'Subir imagen' }).click();
  await c.getByLabel('Subir imagen').setInputFiles(fixture('cover.jpg'));
  await expect(page.getByText('Imagen guardada.').first()).toBeVisible({ timeout: 30_000 });
  await expect(c.locator('header img')).toHaveAttribute('src', /^\/api\/media\/[0-9a-f-]{36}\/thumb$/);
  await expect(c.getByRole('button', { name: 'Enviar a aprobación' })).toBeEnabled({ timeout: 15_000 });
  await c.getByRole('button', { name: 'Enviar a aprobación' }).click();
  await expect(page.getByText('Enviada al jefe para aprobar.').first()).toBeVisible();
  await expect(c.getByText('En revisión', { exact: true })).toBeVisible();
  await expect(c.getByText('Espera al jefe')).toBeVisible();
  // What was typed is kept.
  await page.reload();
  const again = card(page, 'Rutas para conocer el estado');
  await open(again);
  await expect(again.getByLabel('Enlaces / referencias')).toHaveValue('https://example.org/demo/rutas');
  await expect(again.getByLabel('Proporción')).toHaveValue('1:1');
});

test('Redes: mover a otro mes y volver; el mes elegido sigue de Posts a Reels; la barra dice «N/8»', async ({ page }) => {
  await loginAs(page, 'redes@demo.test');
  await page.goto('/redes/posts');
  const [m1, m2] = await monthIds(page);
  const bar = page.getByRole('navigation', { name: 'Secciones de Redes' });
  await expect(bar.locator('a[href^="/redes/posts"]')).toContainText(/Posts\s*\d+\/8/);
  await expect(bar.locator('a[href^="/redes/posts"]')).toContainText(/\d+ de 8 revisados/);
  const c = card(page, 'Nuestro café de altura');
  await openMenu(c);
  await c.getByRole('button', { name: 'Mover a otro mes' }).click();
  const sheet = page.getByRole('dialog', { name: 'Mover a otro mes' });
  await expect(sheet.getByText('Mes 1 — está aquí')).toBeVisible();
  await sheet.getByRole('button', { name: 'Mes 2', exact: true }).click();
  await expect(page.getByText(/^Movida a Mes 2/).first()).toBeVisible();
  await expect(card(page, 'Nuestro café de altura')).toHaveCount(0);
  // The month tab: Mes 2 has it; the address carries the month.
  await page.getByRole('navigation', { name: 'Meses de contenido' }).getByRole('link', { name: /^Mes 2/ }).click();
  await expect(page).toHaveURL(new RegExp(`/redes/posts\\?mes=${m2}$`));
  const moved = card(page, 'Nuestro café de altura');
  await expect(moved).toBeVisible();
  // Mes 2 follows to Reels from the section bar (F2).
  await bar.getByRole('link', { name: /^Reels/ }).click();
  await expect(page).toHaveURL(new RegExp(`/redes/reels\\?mes=${m2}$`));
  await expect(page.getByRole('navigation', { name: 'Meses de contenido' }).getByRole('link', { name: /^Mes 2/ })).toHaveAttribute('aria-current', 'page');
  // Back to Mes 1.
  await page.goto(`/redes/posts?mes=${m2}`);
  const back = card(page, 'Nuestro café de altura');
  await openMenu(back);
  await back.getByRole('button', { name: 'Mover a otro mes' }).click();
  await page.getByRole('dialog', { name: 'Mover a otro mes' }).getByRole('button', { name: 'Mes 1', exact: true }).click();
  await expect(page.getByText(/^Movida a Mes 1/).first()).toBeVisible();
  await page.goto(`/redes/posts?mes=${m1}`);
  await expect(card(page, 'Nuestro café de altura')).toBeVisible();
  // «+ Nuevo mes» opens the new month right away; «Borrar este mes» says first what it has and leaves no piece behind.
  const tabs = page.getByRole('navigation', { name: 'Meses de contenido' });
  await alive(page);
  await tabs.getByRole('button', { name: '+ Nuevo mes' }).click();
  await expect(page.getByText('Mes creado').first()).toBeVisible();
  await expect(tabs.getByRole('link', { name: 'Mes 4 · 0 de 8' })).toHaveAttribute('aria-current', 'page');
  const m4 = new URL(page.url()).searchParams.get('mes');
  expect(m4).not.toBe(m1);
  const options = tabs.getByLabel('Opciones de Mes 4');
  await expect(async () => {
    if (!(await tabs.getByRole('button', { name: 'Borrar este mes' }).isVisible())) await options.click();
    await expect(tabs.getByRole('button', { name: 'Borrar este mes' })).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 20_000 });
  await tabs.getByRole('button', { name: 'Borrar este mes' }).click();
  const ask = page.getByRole('dialog', { name: 'Borrar este mes' });
  await expect(ask.getByText('¿Borrar «Mes 4»? No tiene piezas.')).toBeVisible();
  await ask.getByRole('button', { name: 'Borrar este mes' }).click();
  await expect(page.getByText('Mes borrado').first()).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/redes/posts\\?mes=${m1}$`));
  await expect(tabs.getByRole('link', { name: /^Mes 4/ })).toHaveCount(0);
});

test('Redes: «Crear» → «Nueva pieza» → «¿Qué quieres crear?» → Historia: queda en Historias del mes abierto', async ({ page }) => {
  await loginAs(page, 'redes@demo.test');
  await page.goto('/redes/historias');
  const [m1] = await monthIds(page);
  const create = page.locator('header details').filter({ has: page.getByText('Crear', { exact: true }) });
  await create.locator('summary').click();
  await create.getByRole('link', { name: 'Nueva pieza' }).click();
  await expect(page).toHaveURL(/\/redes\?crear=1$/);
  const sheet = page.getByRole('dialog', { name: '¿Qué quieres crear?' });
  await expect(sheet.getByText('Se creará en Mes 1.')).toBeVisible();
  await axe(page);
  await sheet.getByRole('button', { name: /^Historia/ }).click();
  await expect(page).toHaveURL(new RegExp(`/redes/historias\\?mes=${m1}#pieza-[0-9a-f-]{36}$`));
  const fresh = card(page, 'Historia nueva');
  await expect(fresh).toBeVisible();
  await expect(fresh.getByLabel('Idea original')).toBeVisible();
  await expect(fresh.getByRole('textbox', { name: 'Título', exact: true })).toBeFocused();
});

test('Redes no ve hora ni el día de un evento en sus secciones (y ninguna se corre de lado a 360 px)', async ({ page, browser }) => {
  await loginAs(page, 'redes@demo.test');
  await page.goto('/redes/reels');
  const c = card(page, 'Jornada de salud escolar');
  const href = await c.getByRole('link', { name: 'Ver evento' }).getAttribute('href');
  expect(href).toMatch(/^\/eventos\/[0-9a-f-]{36}$/);
  const { day, time } = await bossSees(browser, href!);
  for (const p of ['/redes/reels', '/redes/posts', '/redes/historias', '/redes/youtube', '/redes/fin-de-mes']) {
    await page.goto(p);
    await expect(page.getByRole('navigation', { name: 'Meses de contenido' })).toBeVisible();
    const text = await page.locator('main').innerText();
    expect(text, p).not.toMatch(CLOCK);
    expect(text.toLowerCase(), p).not.toContain(day.toLowerCase());
    expect(text, p).not.toContain(time);
    await noSideScroll(page);
  }
});

test('el jefe: «Revisar» el post en revisión, lo aprueba y su tarjeta queda «En revisión · ✓ Lista»', async ({ page }) => {
  await loginAs(page, 'jefe@demo.test');
  await page.goto('/redes/posts');
  const [m1] = await monthIds(page);
  const c = card(page, 'La vecina que volvió a tener agua');
  await open(c);
  await expect(c.getByText('Antes de publicar:')).toBeVisible();
  const id = (await c.getAttribute('id'))!.replace(/^pieza-/, '');
  const review = c.getByRole('link', { name: 'Revisar' });
  const back = `/redes/posts?mes=${m1}#pieza-${id}`;
  await expect(review).toHaveAttribute('href', `/aprobar/${id}?volver=${encodeURIComponent(back)}`);
  await review.click();
  await expect(page).toHaveURL(new RegExp(`/aprobar/${id}\\?volver=`));
  for (const box of await page.getByRole('group', { name: 'Antes de aprobar' }).getByRole('checkbox').all()) await box.check();
  await page.getByRole('button', { name: 'Aprobar', exact: true }).click();
  await expect(page.getByText('Aprobada.').first()).toBeVisible();
  // Back on its card (the address «Revisar» carries): open, with the focus on its title, ✓ ready.
  await page.waitForURL((u) => !u.pathname.startsWith(`/aprobar/${id}`));
  if (!page.url().includes('/redes/posts')) await page.goto(back);
  const done = card(page, 'La vecina que volvió a tener agua');
  await expect(done.getByText('En revisión · ✓ Lista')).toBeVisible();
  await expect(done.getByText('Revisado y listo para publicar')).toBeVisible();
  await expect(done.getByRole('textbox', { name: 'Título', exact: true })).toBeFocused();
});

test('Redes: lo aprobado en lectura hasta «Editar (vuelve al jefe)»; «Ya lo publiqué»; sin «Eliminar»; pone un aviso', async ({ page }) => {
  await loginAs(page, 'redes@demo.test');
  await page.goto('/redes/posts');
  // The caption of the approved post is read-only until confirmed; then it saves alone and goes back to the boss.
  const c = card(page, 'La vecina que volvió a tener agua');
  await open(c);
  const caption = 'Caption (copy largo: Instagram, Facebook y TikTok)';
  await expect(c.getByLabel(caption)).toHaveCount(0);
  await c.getByRole('button', { name: 'Editar (vuelve al jefe)' }).first().click();
  const dialog = page.getByRole('dialog', { name: '¿Editar lo aprobado?' });
  await expect(dialog.getByText('Si lo cambias, la pieza vuelve al jefe para aprobar.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Editar' }).click();
  await c.getByLabel(caption).fill('¡Saludos, Táchira! El agua volvió a llegar al sector (texto cambiado de prueba). 💛 Por amor al Táchira.');
  await expect(page.getByText('Volvió al jefe').first()).toBeVisible({ timeout: 15_000 });
  await expect(c.getByText('En revisión', { exact: true })).toBeVisible();
  await expect(c.getByText('Espera al jefe')).toBeVisible();

  // «Ya lo publiqué» on an approved post: its link, and the card turns green.
  const ready = card(page, 'Tips para ahorrar agua');
  await open(ready);
  await ready.getByRole('button', { name: 'Ya lo publiqué' }).click();
  const sheet = page.getByRole('dialog', { name: 'Ya lo publiqué' });
  await sheet.getByLabel('Link de Instagram').fill('https://example.org/demo/ig/tips-agua');
  await axe(page);
  await sheet.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('¡Listo! Quedó como publicada.').first()).toBeVisible();
  await expect(ready.getByText('Publicado', { exact: true }).first()).toBeVisible();
  await expect(ready.getByRole('link', { name: /Instagram/ })).toHaveAttribute('href', 'https://example.org/demo/ig/tips-agua');

  // Redes never sees «Eliminar».
  const menu = card(page, 'Nuestro café de altura');
  await openMenu(menu);
  await expect(menu.getByRole('button', { name: 'Duplicar' })).toBeVisible();
  await expect(menu.getByRole('button', { name: 'Eliminar' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  // A compliance notice: the amber band «Antes de publicar:».
  const draft = card(page, 'Así pides una jornada de salud');
  await open(draft);
  await draft.getByRole('button', { name: 'Agregar aviso' }).click();
  await draft.getByLabel('Tipo de aviso').selectOption('verify_source');
  await draft.getByLabel('Qué hay que cuidar').fill('Confirmar con la ficha cuántas jornadas se hicieron (prueba).');
  await draft.getByRole('button', { name: 'Guardar aviso' }).click();
  await expect(page.getByText('Aviso guardado').first()).toBeVisible();
  await expect(draft.getByText('Antes de publicar:')).toBeVisible();
  await expect(draft.getByText('Confirmar con la ficha cuántas jornadas se hicieron (prueba).')).toBeVisible();
});

test('el jefe elimina un borrador y desaparece; desaprueba el diseño de una aprobada y no pide cambios', async ({ page }) => {
  await loginAs(page, 'jefe@demo.test');
  await page.goto('/redes/posts');
  const gone = card(page, 'Nuestro café de altura');
  await openMenu(gone);
  await gone.getByRole('button', { name: 'Eliminar' }).click();
  const confirm = page.getByRole('dialog', { name: '¿Eliminar esta pieza?' });
  await expect(confirm.getByText('Administración puede recuperarla.')).toBeVisible();
  await confirm.getByRole('button', { name: 'Eliminar' }).click();
  await expect(page.getByText('Pieza eliminada').first()).toBeVisible();
  await expect(card(page, 'Nuestro café de altura')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('article').first()).toBeVisible();
  await expect(card(page, 'Nuestro café de altura')).toHaveCount(0);

  const c = card(page, 'Así trabajan los bomberos del estado');
  await open(c);
  await c.getByRole('button', { name: 'Diseño desaprobado' }).click();
  const ask = page.getByRole('dialog', { name: '¿Pedir cambios también?' });
  await ask.getByRole('button', { name: 'No, solo marcar' }).click();
  await expect(c.getByRole('button', { name: 'Diseño desaprobado' })).toHaveAttribute('aria-pressed', 'true');
  await c.getByLabel('¿Qué no le gustó del diseño?').fill('La foto se ve oscura en el teléfono (prueba).');
  await c.getByRole('button', { name: 'Guardar nota' }).click();
  await expect(page.getByText('Diseño marcado como desaprobado').first()).toBeVisible();
});

test('Redes: con el diseño desaprobado por el jefe, «Ya lo publiqué» está apagado y dice por qué', async ({ page }) => {
  await loginAs(page, 'redes@demo.test');
  await page.goto('/redes/posts');
  const c = card(page, 'Así trabajan los bomberos del estado');
  await open(c);
  await expect(c.getByText(/Desaprobó: el jefe/)).toBeVisible();
  await expect(c.getByRole('button', { name: 'Diseño desaprobado' })).toBeDisabled();
  await expect(c.getByRole('button', { name: 'Ya lo publiqué' })).toBeDisabled();
  await expect(c.getByText('El diseño quedó desaprobado: el jefe tiene que volver a verla.')).toBeVisible();
});

test('a 360 px, el salto a #pieza-<id> abre esa tarjeta aunque las demás empiecen plegadas; sin scroll de lado', async ({ page }) => {
  await loginAs(page, 'redes@demo.test');
  await page.goto('/redes/posts');
  const [m1] = await monthIds(page);
  const target = card(page, 'Tips para comprar en el mercado');
  const id = (await target.getAttribute('id'))!;
  await page.goto(`/redes/posts?mes=${m1}#${id}`);
  const opened = card(page, 'Tips para comprar en el mercado');
  await expect(page.locator(`#${id}-body`)).toBeVisible();
  await expect(opened.getByRole('textbox', { name: 'Título', exact: true })).toBeFocused();
  // Another card that is not the first stays folded on the phone.
  const other = card(page, 'Así pides una jornada de salud');
  const otherId = (await other.getAttribute('id'))!;
  await expect(page.locator(`#${otherId}-body`)).toBeHidden();
  await expect(other.getByRole('button', { name: 'Desplegar' })).toBeVisible();
  await noSideScroll(page);
  await axe(page);
});

test('a 1366 px las tarjetas abiertas, sin scroll de lado y con axe', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await loginAs(page, 'redes@demo.test');
  for (const p of ['/redes/posts', '/redes/carruseles', '/redes/historias']) {
    await page.goto(p);
    const articles = page.getByRole('article');
    await expect(articles.first()).toBeVisible();
    const n = await articles.count();
    expect(n, p).toBeGreaterThan(1);
    await expect(articles.nth(n - 1).getByRole('button', { name: 'Plegar' }), p).toBeVisible();
    await noSideScroll(page);
    await axe(page);
  }
});
