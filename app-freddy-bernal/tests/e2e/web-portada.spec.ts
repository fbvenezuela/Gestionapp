import { test, expect } from '@playwright/test';
import { PROGRAM, noScaffolding, transfer } from './web-helpers';

// The public website's home (D-91, design §1–§3), with no session, at 360 px: the name and the office, the attention
// accesses, the figures with their source, the cases, the works, the program, the news and the channels, with no
// scaffolding and no video loaded until someone taps it; and the home's weight, measured with and without photos
// (docs/diagnostico.md problem 11: the brief's target is under 200 KB without photos).
// (Until 19/11/2026 in web-publica.spec.ts; the shared helpers are in web-helpers.ts.)

test.describe('la web pública en el teléfono (360 px)', () => {
  test('la portada: el nombre y el cargo, los accesos de atención, las cifras con su fuente, los casos, la gestión, el programa, las noticias y los canales', async ({ page }) => {
    await page.goto('/');
    const main = page.getByRole('main');
    // F5: the site's name and the office, never the brand's greeting.
    await expect(main.getByRole('heading', { level: 1, name: 'Freddy Bernal' })).toBeVisible();
    await expect(main.getByText('Gobernador del estado Táchira', { exact: true })).toBeVisible();
    await expect(main.getByText(/Saludos/)).toHaveCount(0);
    for (const [name, href] of [
      [/Hacer un reporte/, '/atencion/nueva?tipo=reporte'],
      [/Hacer una petición/, '/atencion/nueva?tipo=peticion'],
      [/Enviar una observación/, '/atencion/nueva?tipo=acotacion'],
      [/Hacer una denuncia/, '/atencion/nueva?tipo=denuncia'],
      [/Consultar mi solicitud/, '/atencion/consultar'],
    ] as const) {
      await expect(main.getByRole('link', { name }).first(), String(name)).toHaveAttribute('href', href);
    }
    await expect(main.getByText(/no es un servicio de emergencias/i).first()).toBeVisible();
    await expect(main.getByText(/Fuente: Cifra inventada para la demostración/).first()).toBeVisible();
    for (const h2 of ['Atención ciudadana', 'Gestión en cifras', 'Casos atendidos', 'Gestión y obras', PROGRAM, 'Últimas publicaciones', 'Avisos de servicio', 'Canales oficiales']) {
      await expect(main.getByRole('heading', { level: 2, name: h2 }), h2).toBeVisible();
    }
    // F1: the demo has no photos and its episodes no video: nothing of that is drawn (no empty frame with a sign).
    await noScaffolding(page, '/');
    await expect(main.getByRole('link', { name: 'Ver todas las emisiones' })).toHaveAttribute('href', '/reporte-bernal');
    // The news eyebrow is the item's first topic (the official site's sections come as topics).
    await expect(main.locator('article p', { hasText: /^Vialidad · / }).first()).toBeVisible();
    // Nothing of YouTube loads until someone taps a video: no iframe on the page.
    await expect(page.locator('iframe')).toHaveCount(0);
    // Structured data: the person and the organization; no sameAs while no account is verified.
    const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent())!) as Record<string, unknown>[];
    const person = ld.find((x) => x['@type'] === 'Person')!;
    expect(person.name).toBe('Freddy Bernal');
    expect(person.jobTitle).toMatch(/Gobernador/);
    expect(person.sameAs).toBeUndefined();
    expect(ld.some((x) => x['@type'] === 'GovernmentOrganization')).toBe(true);
  });
});

test('el peso de la portada, medido con y sin fotos (meta del encargo: menos de 200 KB sin fotos)', async ({ browser }) => {
  const base = test.info().project.use.baseURL!;
  const withImages = await transfer(browser, `${base}/`, false);
  const without = await transfer(browser, `${base}/`, true);
  const kb = (n: number) => Math.round(n / 1024);
  const note =
    `portada: ${kb(withImages.bytes)} KB con fotos (${withImages.requests} pedidos) · ${kb(without.bytes)} KB sin fotos (${without.requests} pedidos, gzip de next start)` +
    ` · ${kb(without.brotli)} KB sin fotos con brotli (estimado, como sirve Vercel)` +
    ` · por tipo sin fotos: ${Object.entries(without.byType).map(([t, b]) => `${t} ${kb(b)} KB`).join(', ')}`;
  test.info().annotations.push({ type: 'peso', description: note });
  console.log(note);
  // A guard against regressions, not the target: the target (200 KB) is reported with the measurement.
  expect(without.bytes).toBeLessThan(240 * 1024);
  expect(without.byType.image ?? 0).toBe(0);
});
