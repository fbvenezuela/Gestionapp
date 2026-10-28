import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { loginAs } from './helpers';
import { OFFER_OFF_KEY } from './global-setup';

// 360 offers the tutorial of the screen (R3, D-47, D-48; design §8.6), at 360 px on the strict demo server: a one-line
// strip after ~4 s, never over a tip, a form or what is being typed; «Sí, muéstrame» starts the tutorial; an X once and
// it does not come back for that tutorial; the second X stops it for good on this phone, «Ayuda y guías» turns it back
// on. In the panel, «muéstrame cómo se usa esta pantalla» brings «Ver el tutorial de…», and 360 never reads Mensajes.
// The rest of the suite starts with the phone's switch that turns the offer off (global-setup.ts); this file does not.
// Invented demo data; nothing leaves the app.

test.use({ storageState: { cookies: [], origins: [] } });

const REDES = 'redes@demo.test';
const strip = (page: Page) => page.getByRole('complementary', { name: '360 te ofrece ayuda' });

async function noSerious(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
}

async function noSideScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
}

// The tip of the screen goes first: «Entendido» lets the strip come. A tip shows once the page read the phone's
// storage (tip.tsx), so it is waited for a moment when the screen has one.
async function dismissTips(page: Page) {
  const tips = page.getByRole('complementary', { name: 'Consejo' });
  await tips.first().waitFor({ timeout: 3_000 }).catch(() => {});
  for (let i = 0; i < 3 && (await tips.count()); i++) await tips.first().getByRole('button', { name: 'Entendido' }).click();
}

// As if it were another day in another tab: the strip of today and of this tab are used up (one a day, one per tab).
async function nextDayNewTab(page: Page) {
  await page.evaluate((off) => {
    for (const k of Object.keys(localStorage)) {
      if (!/^fb:360:oferta:[^:]+$/.test(k) || k === off) continue;
      const s = JSON.parse(localStorage.getItem(k) ?? '{}');
      localStorage.setItem(k, JSON.stringify({ ...s, dia: '2000-01-01' }));
    }
    sessionStorage.removeItem('fb:360:oferta-sesion');
  }, OFFER_OFF_KEY);
}

async function expectNoStrip(page: Page, ms = 6_000) {
  await page.waitForTimeout(ms);
  await expect(strip(page)).toHaveCount(0);
}

test('la franja sale a los ~4 s, después del consejo, en una línea y sin tapar el último control; «Sí, muéstrame» abre el tutorial', async ({ page }) => {
  await loginAs(page, REDES);
  await page.goto('/piezas');
  // First the tip: no strip while it shows.
  await expect(page.getByRole('complementary', { name: 'Consejo' })).toBeVisible();
  await expectNoStrip(page, 5_000);
  await dismissTips(page);
  const s = strip(page);
  await expect(s).toBeVisible({ timeout: 4_000 });
  await expect(s).toContainText('¿Te muestro esta pantalla?');
  await expect(s).not.toHaveAttribute('data-who', /.*/);
  // It never takes the focus.
  expect(await page.evaluate(() => !!document.activeElement?.closest('[data-assistant-offer]'))).toBe(false);

  // One row: the text, «Sí, muéstrame» and the X (44 px), inside the screen, above 360's button.
  const box = (await s.boundingBox())!;
  const yes = (await s.getByRole('button', { name: 'Sí, muéstrame' }).boundingBox())!;
  const no = (await s.getByRole('button', { name: 'Ahora no' }).boundingBox())!;
  expect(box.height).toBeLessThanOrEqual(72);
  expect(no.width).toBeGreaterThanOrEqual(44);
  expect(no.height).toBeGreaterThanOrEqual(44);
  expect(yes.height).toBeGreaterThanOrEqual(44);
  expect(Math.abs(yes.y + yes.height / 2 - (no.y + no.height / 2))).toBeLessThanOrEqual(2);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(360);
  const button = (await page.locator('[data-assistant-button]').boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(button.y);
  await noSideScroll(page);
  await noSerious(page);

  // At the end of the page the last control is not under it (the page leaves room for it).
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(300);
  const last = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('main a, main button, main input, main select, main textarea')).filter((e) => e.getClientRects().length);
    const r = els.at(-1)!.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom };
  });
  const after = (await s.boundingBox())!;
  expect(last.bottom <= after.y || last.top >= after.y + after.height).toBe(true);

  // «Sí, muéstrame»: the tutorial of the screen, from its first step.
  await s.getByRole('button', { name: 'Sí, muéstrame' }).click();
  await expect(strip(page)).toHaveCount(0);
  const tour = page.locator('dialog[data-tour-dialog]');
  await expect(tour).toBeVisible({ timeout: 8_000 });
  await expect(tour).toContainText(/Paso 1 de \d/);
  await page.keyboard.press('Escape');
  await expect(tour).toBeHidden();
  // Seen: it is not offered again (nor anything else today, in this tab).
  await page.reload();
  await expectNoStrip(page);
});

test('en el inicio, la primera vez, se presenta y ofrece cómo empezar', async ({ page }) => {
  await loginAs(page, REDES);
  await page.goto('/hoy');
  await dismissTips(page);
  await expect(strip(page)).toContainText(/^Hola, soy .+\. ¿Te muestro cómo empezar\?/, { timeout: 8_000 });
});

test('una X: ese tutorial no vuelve; la segunda X lo apaga en este teléfono y lo dice; «Volver a ofrecerme ayuda» lo prende', async ({ page }) => {
  await loginAs(page, REDES);
  await page.goto('/piezas');
  await dismissTips(page);
  await strip(page).getByRole('button', { name: 'Ahora no' }).click({ timeout: 8_000 });
  await expect(strip(page)).toHaveCount(0);
  // The same tutorial, another day and tab: not again.
  await nextDayNewTab(page);
  await page.reload();
  await dismissTips(page);
  await expectNoStrip(page);

  // Another screen, the second X: «Listo…», once, and it goes away by itself.
  await nextDayNewTab(page);
  await page.goto('/resultados');
  await strip(page).getByRole('button', { name: 'Ahora no' }).click({ timeout: 8_000 });
  await expect(strip(page)).toContainText('Listo. La ayuda está en Mi cuenta → Ayuda y guías.');
  await expect(strip(page)).toHaveCount(0, { timeout: 9_000 });
  // Off for good on this phone: not even another day.
  await nextDayNewTab(page);
  await page.goto('/biblioteca');
  await expectNoStrip(page);

  // «Ayuda y guías» turns it back on.
  await page.goto('/ayuda');
  await page.getByRole('button', { name: 'Volver a ofrecerme ayuda' }).click();
  await expect(page.getByText('Listo: 360 te vuelve a ofrecer ayuda en tus pantallas.')).toBeVisible();
  await nextDayNewTab(page);
  await page.goto('/biblioteca');
  await expect(strip(page)).toBeVisible({ timeout: 8_000 });
});

test('no sale en una pantalla de formulario, ni mientras se escribe, ni en una conversación de Mensajes', async ({ page }) => {
  await loginAs(page, 'despacho@demo.test');
  await page.goto('/agenda/nuevo');
  await expectNoStrip(page);

  await page.context().clearCookies();
  await loginAs(page, REDES);
  await page.evaluate(() => sessionStorage.clear());
  await page.goto('/biblioteca');
  const search = page.getByLabel('Buscar en la biblioteca');
  await search.click();
  await search.pressSequentially('cancha', { delay: 50 });
  await expectNoStrip(page, 6_000);
  // Done typing (the focus leaves the field): now it may come.
  await page.getByRole('heading', { level: 1 }).click();
  await expect(strip(page)).toBeVisible({ timeout: 8_000 });
  await strip(page).getByRole('button', { name: 'Ahora no' }).click();

  // A conversation fills the screen: no 360 button and no strip (U11).
  await nextDayNewTab(page);
  await page.goto('/mensajes');
  const ack = page.getByRole('button', { name: 'Entendido' });
  if (await ack.isVisible().catch(() => false)) await page.keyboard.press('Escape');
  await page.locator('[data-tour="chat-list"] a[href^="/mensajes/"]').first().click();
  await page.waitForURL(/\/mensajes\/[0-9a-f-]{36}/);
  await expectNoStrip(page, 5_000);
  await expect(page.locator('[data-assistant-button]')).toHaveCount(0);
});

test.describe('con la llave del teléfono (como el resto de la suite)', () => {
  test.use({ storageState: { cookies: [], origins: [{ origin: new URL(process.env.E2E_BASE_URL ?? `http://localhost:${process.env.E2E_PORT ?? 3100}`).origin, localStorage: [{ name: OFFER_OFF_KEY, value: '1' }] }] } });

  test('un contexto que abre la prueba hereda la llave del proyecto (U8)', async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    const p = await ctx.newPage();
    await p.goto('/entrar');
    expect(await p.evaluate((k) => localStorage.getItem(k), OFFER_OFF_KEY)).toBe('1');
    await ctx.close();
  });

  test('en el panel: «Ver el tutorial de…», la línea de administración, y 360 no lee Mensajes', async ({ page }) => {
    await loginAs(page, REDES);
    await page.goto('/piezas');
    await dismissTips(page);
    await page.getByRole('button', { name: /asistente del equipo/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Administración ve lo que le preguntas a', { exact: false })).toContainText('no pegues aquí mensajes del equipo.');

    const ask = async (q: string) => {
      await dialog.getByLabel(/Tu pregunta/).fill(q);
      await dialog.getByRole('button', { name: 'Enviar' }).click();
      await expect(dialog.getByRole('log')).toContainText(q);
      await expect(dialog.getByText(/está escribiendo/)).toHaveCount(0, { timeout: 20_000 });
    };
    await ask('¿Qué me escribió Daniela?');
    await expect(dialog.locator('[data-who="asistente"]').last()).toContainText('No leo los mensajes del equipo');
    await expect(dialog.getByRole('link', { name: 'Ir a Mensajes' })).toBeVisible();

    await ask('muéstrame cómo se usa esta pantalla');
    const go = dialog.getByRole('link', { name: 'Ver el tutorial de Piezas' });
    await expect(go).toBeVisible();
    await noSerious(page);
    await go.click();
    await expect(dialog).toBeHidden();
    const tour = page.locator('dialog[data-tour-dialog]');
    await expect(tour).toBeVisible({ timeout: 8_000 });
    await expect(tour).toContainText(/Paso 1 de \d/);
    await page.keyboard.press('Escape');
  });
});
