import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { loginAs } from './helpers';
import { FLOWS, GUIDE_TITLES, guideFor } from '../../src/lib/guides';
import type { TeamRole } from '../../src/lib/roles';

// Ayuda y guías (R3, D-42, D-43, D-44, design §5.4, §9.2): /ayuda and the role's guide with its three tabs for every
// role at 360 px, with axe and without sideways scroll; the boss opens the six guides; Grabación cannot open Redes'
// guide; Administración has its own; the flows' index and one flow with «tú». Read-only: nothing here writes to the
// demo database.
test.describe.configure({ mode: 'serial', timeout: 180_000 });

async function noSerious(page: Page, where: string) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${where} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 2).join(' | ')}`);
  expect(serious, where).toEqual([]);
}

async function noSideScroll(page: Page, where: string) {
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(w, `${where}: se desplaza hacia los lados`).toBeLessThanOrEqual(page.viewportSize()!.width);
}

async function check(page: Page, where: string) {
  await expect(page.getByRole('heading', { name: 'Algo no cargó' }), where).toHaveCount(0);
  await noSideScroll(page, where);
  await noSerious(page, where);
}

const TEAM: { email: string; role: TeamRole; home: string }[] = [
  { email: 'jefe@demo.test', role: 'boss', home: '/jefe' },
  { email: 'despacho@demo.test', role: 'dispatch', home: '/hoy' },
  { email: 'politica@demo.test', role: 'politics', home: '/municipios' },
  { email: 'ivt@demo.test', role: 'ivt', home: '/obras' },
  { email: 'grabacion@demo.test', role: 'camera', home: '/hoy' },
  { email: 'redes@demo.test', role: 'social', home: '/hoy' },
];

for (const p of TEAM) {
  const g = guideFor(p.role);
  test(`${g.label}: Ayuda y su guía con las tres pestañas, a 360 px`, async ({ page }) => {
    await loginAs(page, p.email);
    await page.goto('/ayuda');
    await expect(page.getByRole('heading', { level: 1, name: 'Ayuda y guías' })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Mi trabajo, paso a paso/ })).toHaveAttribute('href', `/ayuda/${g.slug}`);
    await expect(page.getByRole('link', { name: /^Qué se hace en cada pantalla/ })).toHaveAttribute('href', `/ayuda/${g.slug}?ver=pantallas`);
    await expect(page.getByRole('link', { name: /^Cómo va el trabajo entre todos/ })).toHaveAttribute('href', '/ayuda/flujos');
    // The tutorials of their screens, each with its address; «Para todos» closed, and it opens.
    await expect(page.getByRole('heading', { name: 'Tutoriales de mis pantallas' })).toBeVisible();
    await expect(page.locator('a[href*="?tutorial=bienvenida"]')).toHaveAttribute('href', `${p.home}?tutorial=bienvenida`);
    await page.locator('#para-todos summary', { hasText: 'Mensajes' }).click();
    await expect(page.locator('#para-todos')).toContainText('El jefe puede leer todas las conversaciones');
    // Only the boss (and Administración) see every role's guide.
    await expect(page.getByRole('heading', { name: 'La guía de cada persona' })).toHaveCount(p.role === 'boss' ? 1 : 0);
    await check(page, '/ayuda');

    await page.getByRole('link', { name: /^Mi trabajo, paso a paso/ }).click();
    await expect(page).toHaveURL(new RegExp(`/ayuda/${g.slug}$`));
    await expect(page.getByRole('heading', { level: 1, name: 'Tu guía' })).toBeVisible();
    const tabs = page.getByRole('navigation', { name: 'Partes de la guía' });
    await expect(tabs.getByRole('link')).toHaveText(['Tu trabajo', 'Paso a paso', 'Cada pantalla']);
    await expect(tabs.getByRole('link', { name: 'Tu trabajo' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByText(g.job.mission)).toBeVisible();
    await page.getByRole('main').locator('summary', { hasText: g.faq[0].q }).click();
    await expect(page.getByText(g.faq[0].a)).toBeVisible();
    await check(page, `${g.slug} · trabajo`);

    await tabs.getByRole('link', { name: 'Paso a paso' }).click();
    await expect(page).toHaveURL(new RegExp(`/ayuda/${g.slug}\\?ver=pasos$`));
    await expect(page.getByRole('heading', { name: g.tasks[0].title, exact: true })).toBeVisible();
    const flow = page.getByRole('main').locator('summary', { hasText: /^Ver el flujo:/ }).first();
    if (await flow.count()) {
      await flow.click();
      await expect(page.locator('details[open] ol[aria-label$="pasos"]').first()).toBeVisible();
    }
    await check(page, `${g.slug} · pasos`);

    await tabs.getByRole('link', { name: 'Cada pantalla' }).click();
    await expect(page).toHaveURL(new RegExp(`/ayuda/${g.slug}\\?ver=pantallas$`));
    const first = g.sections[0];
    await page.getByRole('main').locator('summary', { hasText: first.title }).first().click();
    await expect(page.getByText(first.what).first()).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: first.menu, exact: true })).toBeVisible();
    await check(page, `${g.slug} · pantallas`);
  });
}

test('el jefe abre las seis guías; la suya dice «Tu guía» y las otras «Su trabajo»', async ({ page }) => {
  await loginAs(page, 'jefe@demo.test');
  for (const p of TEAM) {
    const g = guideFor(p.role);
    await page.goto(`/ayuda/${g.slug}`);
    const mine = p.role === 'boss';
    await expect(page.getByRole('heading', { level: 1, name: mine ? 'Tu guía' : GUIDE_TITLES[p.role] })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Partes de la guía' }).getByRole('link').first()).toHaveText(mine ? 'Tu trabajo' : 'Su trabajo');
    await noSideScroll(page, g.slug);
  }
  await page.goto('/ayuda');
  await expect(page.getByRole('heading', { name: 'La guía de cada persona' })).toBeVisible();
  await page.goto('/ayuda/administracion');
  await expect(page).toHaveURL(/\/jefe\?sin-permiso=1$/);
});

test('Grabación no abre la guía de Redes: vuelve a su inicio con el aviso', async ({ page }) => {
  await loginAs(page, 'grabacion@demo.test');
  await page.goto('/ayuda/redes');
  await expect(page).toHaveURL(/\/hoy\?sin-permiso=1$/);
  await expect(page.getByText('Esa pantalla no es de tu rol.', { exact: false })).toBeVisible();
  await page.goto('/ayuda/no-existe');
  await expect(page.getByRole('heading', { name: 'Algo no cargó' })).toHaveCount(0);
});

test('administración: su guía aparte y la de cada persona', async ({ page }) => {
  await loginAs(page, 'admin@demo.test');
  await page.goto('/ayuda');
  await expect(page.getByRole('link', { name: /^Guía de administración/ })).toHaveAttribute('href', '/ayuda/administracion');
  await expect(page.getByRole('heading', { name: 'La guía de cada persona' })).toBeVisible();
  // Without «Ver como», Administración has no team guide of its own and no tutorials.
  await expect(page.getByRole('link', { name: /^Mi trabajo, paso a paso/ })).toHaveCount(0);
  await check(page, '/ayuda (administración)');
  await page.goto('/ayuda/administracion');
  await expect(page.getByRole('heading', { level: 1, name: 'Guía de administración' })).toBeVisible();
  await expect(page.getByText('Mensajes no es para administración', { exact: false })).toBeVisible();
  await page.getByRole('main').locator('summary', { hasText: 'Equipo' }).first().click();
  await expect(page.getByRole('link', { name: /^Abrir\s?: Equipo$/ })).toHaveAttribute('href', '/ajustes/equipo');
  await check(page, '/ayuda/administracion');
  await page.goto('/ayuda/redes');
  await expect(page.getByRole('heading', { level: 1, name: GUIDE_TITLES.social })).toBeVisible();
});

test('los flujos: el índice y uno abierto, con «tú» en los pasos de Redes', async ({ page }) => {
  await loginAs(page, 'redes@demo.test');
  await page.goto('/ayuda/flujos');
  await expect(page.getByRole('main').getByRole('listitem')).toHaveCount(FLOWS.length);
  await check(page, '/ayuda/flujos');
  const tweets = FLOWS.find((f) => f.id === 'tweets')!;
  await page.getByRole('link', { name: new RegExp(`^${tweets.title}`) }).click();
  await expect(page).toHaveURL(/\/ayuda\/flujos\?f=tweets$/);
  const list = page.getByRole('list', { name: `${tweets.title}, ${tweets.steps.length} pasos` });
  await expect(list).toBeVisible();
  await expect(list.locator(':scope > li')).toHaveCount(tweets.steps.length);
  await expect(list.getByText(' · tú')).toHaveCount(tweets.steps.filter((s) => s.roles.includes('social')).length);
  // Redes cannot open «Por aprobar»: that step has no link.
  await expect(list.locator('a[href="/aprobar"]')).toHaveCount(0);
  await check(page, '/ayuda/flujos?f=tweets');
  await page.emulateMedia({ colorScheme: 'dark' });
  await noSerious(page, '/ayuda/flujos?f=tweets (oscuro)');
});

test('el flujo «El mes de Redes» (R4): sus pasos, con «tú» en los de Redes y la sección de cada uno', async ({ page }) => {
  await loginAs(page, 'redes@demo.test');
  const month = FLOWS.find((f) => f.id === 'mes-redes')!;
  await page.goto('/ayuda/flujos');
  await page.getByRole('link', { name: new RegExp(`^${month.title}`) }).click();
  await expect(page).toHaveURL(/\/ayuda\/flujos\?f=mes-redes$/);
  const list = page.getByRole('list', { name: `${month.title}, ${month.steps.length} pasos` });
  await expect(list.locator(':scope > li')).toHaveCount(month.steps.length);
  await expect(list.getByText(' · tú')).toHaveCount(month.steps.filter((s) => s.roles.includes('social')).length);
  // The feed's step opens the feed; the boss's step («Revisar») has no link for Redes.
  await expect(list.locator('a[href="/redes/feed"]').first()).toBeVisible();
  await expect(list.locator('a[href="/aprobar"]')).toHaveCount(0);
  await check(page, '/ayuda/flujos?f=mes-redes');
});

test('el tutorial de Ayuda corre sobre la pantalla y cuenta sus pasos', async ({ page }) => {
  await loginAs(page, 'redes@demo.test');
  await page.goto('/ayuda?tutorial=ayuda');
  await expect(page.getByRole('dialog', { name: 'Paso 1 de 4 · Tu trabajo' })).toBeVisible();
  for (const title of ['Cada pantalla', 'Entre todos', 'Tutoriales']) {
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByRole('dialog', { name: new RegExp(`· ${title}$`) })).toBeVisible();
  }
  await expect(page.getByRole('button', { name: 'Terminar' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog[data-tour-dialog][open]')).toHaveCount(0);
});
