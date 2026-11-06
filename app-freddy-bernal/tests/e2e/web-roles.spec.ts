import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { loginAs } from './helpers';

// The website's and the attention desk's people (D-91, D-93) on the strict demo server, at 360 px with axe: the real
// sign-in (code by email and the second factor, always for these roles), their own screen as home (/panel sends them
// there), «Web» or «Atención» as their only menu item, no 360, no Mensajes, and the team's screens closed to them. The
// counts on the waiting screens are the demo's (seed-parts/web.ts), read live by the database with each one's RLS.
test.describe.configure({ mode: 'serial' });

async function noSerious(page: Page, where: string) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${where} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 2).join(' | ')}`);
  expect(serious, where).toEqual([]);
}

async function stat(page: Page, label: string) {
  const value = page.getByText(label, { exact: true }).first().locator('xpath=following-sibling::p[1]');
  return Number((await value.innerText()).replace(/\D/g, ''));
}

const PEOPLE = [
  { email: 'web.editora@demo.test', home: '/admin/web', item: 'Web', heading: 'La web' },
  { email: 'web.aprobador@demo.test', home: '/admin/web', item: 'Web', heading: 'La web' },
  { email: 'atencion.coordinacion@demo.test', home: '/admin/atencion', item: 'Atención', heading: 'Atención ciudadana' },
  { email: 'atencion.servicios@demo.test', home: '/admin/atencion', item: 'Atención', heading: 'Atención ciudadana' },
  { email: 'atencion.denuncias@demo.test', home: '/admin/atencion', item: 'Atención', heading: 'Atención ciudadana' },
  { email: 'consulta@demo.test', home: '/admin/atencion', item: 'Atención', heading: 'Atención ciudadana' },
] as const;

for (const p of PEOPLE) {
  test(`${p.email}: entra con doble factor a su pantalla, con su menú y sin lo del equipo`, async ({ page }) => {
    await loginAs(page, p.email);
    await page.goto('/panel');
    await expect(page).toHaveURL(new RegExp(`${p.home}$`));
    await expect(page.getByRole('heading', { level: 1, name: p.heading })).toBeVisible();
    // Both administrators are built (W3): /admin/web opens on its sections («Secciones de la web», built on the CMS
    // branch; its placeholder until that branch is merged with this one) and /admin/atencion on its inbox, never a
    // placeholder. This holds before and after the merge.
    if (p.home === '/admin/web') {
      await expect(page.getByRole('navigation', { name: 'Secciones de la web' }).or(page.getByText('Se arma en la siguiente etapa.'))).toBeVisible();
    } else await expect(page.getByText('Se arma en la siguiente etapa.')).toHaveCount(0);
    const bar = page.getByRole('navigation', { name: 'Menú' });
    await expect(bar.getByRole('link')).toHaveText([p.item]);
    // No 360, no Mensajes, no «Crear».
    await expect(page.getByRole('button', { name: /360/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Mensajes/ })).toHaveCount(0);
    await expect(page.getByText('Crear', { exact: true })).toHaveCount(0);
    await noSerious(page, p.home);
    // The team's screens send them back home with the polite note.
    await page.goto('/redes');
    await expect(page).toHaveURL(new RegExp(`${p.home}\\?sin-permiso=1$`));
  });
}

test('lo que cuenta cada quien es lo que su RLS deja leer: la coordinación todo, un área lo suyo, denuncias solo las denuncias', async ({ page }) => {
  const total = async () => (await stat(page, 'Por revisar')) + (await stat(page, 'En atención')) + (await stat(page, 'Resueltas'));
  await loginAs(page, 'atencion.coordinacion@demo.test');
  await page.goto('/admin/atencion');
  const all = await total();
  expect(all).toBeGreaterThan(40);
  await page.context().clearCookies();
  await loginAs(page, 'atencion.denuncias@demo.test');
  await page.goto('/admin/atencion');
  const denuncias = await total();
  expect(denuncias).toBeGreaterThan(0);
  expect(denuncias).toBeLessThan(all);
  await page.context().clearCookies();
  await loginAs(page, 'web.editora@demo.test');
  await page.goto('/admin/web');
  expect(await stat(page, 'Publicados')).toBeGreaterThan(50);
  expect(await stat(page, 'Esperan aprobación')).toBe(2);
  await page.goto('/admin/atencion');
  await expect(page).toHaveURL(/\/admin\/web\?sin-permiso=1$/);
});
