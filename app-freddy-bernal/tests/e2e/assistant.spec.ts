import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { loginAs } from './helpers';

// The team assistant's window and its panel, at 360 px on the demo server (no AI keys: the
// demo brain answers with modelo 'local'). Nothing here sends anything outside: the notice
// to administration stays inside the app.

async function noSerious(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
}

async function noSideScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
}

const bubble = (page: Page) => page.getByRole('button', { name: /asistente del equipo/ });

async function ask(page: Page, question: string) {
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/Tu pregunta/).fill(question);
  await dialog.getByRole('button', { name: 'Enviar' }).click();
  // The person's message shows right away; the answer arrives after the typing dots.
  await expect(dialog.getByRole('log')).toContainText(question);
  await expect(dialog.getByText(/está escribiendo/)).toHaveCount(0, { timeout: 20_000 });
}

test('la ventana: pregunta, contesta, lleva a la pantalla, sigue al cambiar de página y avisa a administración', async ({ page }) => {
  await loginAs(page, 'redes@demo.test');
  await page.goto('/hoy');

  // Round button above the phone's bottom bar, not covering it.
  const btn = bubble(page);
  await expect(btn).toBeVisible();
  await expect(btn).toHaveAttribute('aria-expanded', 'false');
  const nav = await page.getByRole('navigation', { name: 'Menú' }).boundingBox();
  const box = await btn.boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(nav!.y);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await noSideScroll(page);

  await btn.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  // The modal dialog hides everything behind it from assistive tech, the launcher included.
  await expect(page.getByRole('button', { name: /asistente del equipo/, includeHidden: true })).toHaveAttribute('aria-expanded', 'true');
  await expect(dialog.getByText('No escribas aquí fechas, horas ni direcciones de la agenda.')).toBeVisible();
  await expect(dialog.getByLabel(/Tu pregunta/)).toHaveAttribute('maxlength', '1500');
  await expect(dialog.getByRole('button', { name: 'Enviar' })).toBeDisabled();
  const name = (await dialog.getByRole('heading').first().textContent())!.trim();
  expect(name.length).toBeGreaterThan(0);

  // 1. Its name.
  await ask(page, '¿cómo te llamas?');
  const answers = dialog.locator('[data-who="asistente"]'); // the intro + each answer
  await expect(answers).toHaveCount(2);
  await expect(answers.last()).toContainText(name);
  await expect(dialog.getByText('modo demostración, sin IA')).toBeVisible();

  // 2. What's pending for redes: a real lookup, with the button to the screen.
  await ask(page, '¿qué tengo pendiente?');
  await expect(answers).toHaveCount(3);
  await expect(answers.last()).toContainText(/pendiente/i);
  const goTo = dialog.getByRole('link', { name: 'Ir a Hoy' });
  await expect(goTo).toBeVisible();
  await noSerious(page);
  await noSideScroll(page);

  // Escape closes and gives the focus back to the button.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(btn).toHaveAttribute('aria-expanded', 'false');
  await expect(btn).toBeFocused();

  // 3. Another page (full load): the thread is still there and the button says so.
  await page.goto('/agenda');
  await expect(bubble(page)).toHaveAccessibleName(/conversación a medias/);
  await bubble(page).click();
  await expect(page.getByRole('dialog').getByRole('log')).toContainText('¿qué tengo pendiente?');

  // «Ir a…» takes you there and closes the window.
  await page.getByRole('dialog').getByRole('link', { name: 'Ir a Hoy' }).last().click();
  await expect(page).toHaveURL(/\/hoy$/);
  await expect(page.getByRole('dialog')).toBeHidden();

  // 4. A person, please: the team is told for real.
  await bubble(page).click();
  await ask(page, 'quiero hablar con alguien');
  await expect(page.getByRole('dialog').getByRole('log')).toContainText(/administraci[oó]n/i);

  // «Empezar de nuevo» drops the thread (nothing is deleted in the database).
  await page.getByRole('dialog').getByRole('button', { name: 'Empezar de nuevo' }).click();
  await expect(page.getByRole('dialog').getByRole('log')).not.toContainText('¿qué tengo pendiente?');
  await page.keyboard.press('Escape');
  await expect(bubble(page)).not.toHaveAccessibleName(/conversación a medias/);

  // Administration sees the notice and opens the conversation in the panel.
  await page.context().clearCookies();
  await loginAs(page, 'admin@demo.test');
  await page.goto('/avisos');
  await page.getByText('El asistente pide una persona').first().click();
  await expect(page).toHaveURL(/\/ajustes\/asistente\?conversacion=/);
  await expect(page.getByRole('heading', { name: 'Conversaciones', level: 2, exact: true })).toBeVisible();
  await expect(page.getByText('quiero hablar con alguien').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Así se contesta' }).first()).toBeVisible();
  // Someone else's thread never shows in the same tab.
  await expect(bubble(page)).not.toHaveAccessibleName(/conversación a medias/);
});

test('el botón nunca tapa lo último de una página larga', async ({ page }) => {
  await loginAs(page, 'admin@demo.test');
  for (const path of ['/ajustes/asistente?tab=sabe', '/hoy', '/ajustes']) {
    await page.goto(path);
    await expect(bubble(page)).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const box = await bubble(page).boundingBox();
    // The last control inside main, once scrolled to the end, sits clear of the button.
    const last = await page.evaluate(() => {
      const els = [...document.querySelectorAll<HTMLElement>('main a[href], main button, main input, main select, main textarea')].filter((e) => e.offsetParent !== null);
      const r = els.at(-1)?.getBoundingClientRect();
      return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
    });
    if (!last || !box) continue;
    const overlaps = last.x < box.x + box.width && box.x < last.x + last.w && last.y < box.y + box.height && box.y < last.y + last.h;
    expect(overlaps, path).toBe(false);
  }
});

test('el panel: administración abre las ocho pestañas; otro rol no entra', async ({ page }) => {
  await loginAs(page, 'admin@demo.test');
  await page.goto('/ajustes');
  await page.getByRole('link', { name: /Asistente/ }).click();
  await expect(page).toHaveURL(/\/ajustes\/asistente$/);
  await expect(page.getByRole('heading', { name: 'Asistente', level: 1, exact: true })).toBeVisible();

  const tabs = page.getByRole('navigation', { name: 'Secciones del asistente' });
  for (const label of ['Lo que sabe', 'Cómo contesta', 'Conversaciones', 'Cómo va', 'Lo que preguntan', 'Por confirmar', 'Lo que hizo', 'Ajustes']) {
    await tabs.getByRole('link', { name: new RegExp(`^${label}`) }).click();
    await expect(page.getByRole('heading', { name: label, level: 2, exact: true })).toBeVisible();
    await expect(tabs.getByRole('link', { name: new RegExp(`^${label}`) })).toHaveAttribute('aria-current', 'page');
    await noSideScroll(page);
  }
  await noSerious(page);

  // «Cómo contesta»: the tester shows which scripts it would use, without spending a turn.
  await tabs.getByRole('link', { name: 'Cómo contesta' }).click();
  await page.getByLabel('La pregunta').fill('¿cómo te llamas?');
  await page.getByRole('button', { name: 'Probar', exact: true }).click();
  await expect(page.getByText('Usaría estos guiones:')).toBeVisible();

  // «Cómo va»: the chain test in demo answers with the demo brain.
  await tabs.getByRole('link', { name: 'Cómo va' }).click();
  await page.getByRole('button', { name: 'Probar la cadena' }).click();
  await expect(page.getByText('Cerebro de demostración')).toBeVisible();
  await noSerious(page);

  await page.context().clearCookies();
  await loginAs(page, 'redes@demo.test');
  await page.goto('/ajustes/asistente');
  await expect(page).not.toHaveURL(/\/ajustes\/asistente/);
});
