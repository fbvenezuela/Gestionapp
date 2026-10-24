import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { loginAs } from './helpers';

// Every page of every role opens without errors and without serious accessibility issues.
const ROLES: Record<string, string[]> = {
  'admin@demo.test': ['/hoy', '/agenda', '/agenda?vista=mes', '/agenda?vista=dia', '/piezas', '/tweets', '/publicar', '/resultados', '/biblioteca', '/aprobar', '/aprobar?tab=tweets', '/ajustes', '/ajustes/equipo', '/ajustes/categorias', '/ajustes/formulas', '/ajustes/horarios', '/ajustes/redes', '/ajustes/marca', '/ajustes/buzon', '/ajustes/registro', '/avisos', '/perfil', '/buscar?q=puente', '/agenda/nuevo', '/piezas/nueva', '/tweets/nueva', '/publicar/nueva', '/publicar/espontanea'],
  'jefe@demo.test': ['/jefe', '/jefe/politica', '/jefe/digital', '/agenda', '/resultados', '/aprobar'],
  'despacho@demo.test': ['/hoy', '/agenda', '/biblioteca'],
  'supervision@demo.test': ['/hoy', '/aprobar', '/tweets', '/resultados'],
  'grabacion@demo.test': ['/hoy', '/agenda'],
  'secretaria@demo.test': ['/hoy', '/agenda', '/agenda/nuevo'],
};

for (const [email, pages] of Object.entries(ROLES)) {
  test(`páginas de ${email}`, async ({ page }) => {
    await loginAs(page, email);
    for (const p of pages) {
      const res = await page.goto(p);
      expect(res?.status(), p).toBeLessThan(400);
      await expect(page.getByRole('heading', { name: 'Algo no cargó' }), p).toHaveCount(0);
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      const serious = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${p} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 2).join(' | ')}`);
      expect(serious, p).toEqual([]);
    }
  });
}

test('las páginas de un evento abren para cada rol', async ({ page }) => {
  for (const email of ['admin@demo.test', 'redes@demo.test', 'jefe@demo.test']) {
    await loginAs(page, email);
    await page.goto('/agenda');
    const link = page.locator('a[href^="/eventos/"]').first();
    const href = await link.getAttribute('href');
    for (const tab of ['ficha', 'storyboard', 'material', 'piezas']) {
      await page.goto(`${href!.split('?')[0]}?tab=${tab}`);
      await expect(page.getByRole('heading', { name: 'Algo no cargó' })).toHaveCount(0);
    }
    await page.context().clearCookies();
  }
});
