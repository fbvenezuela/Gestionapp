import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { loginAs, readyForAxe } from './helpers';
import { QUIET_STATE } from './global-setup';

// What the journeys share (web-recorridos-ciudadano, web-recorridos-equipo and web-recorridos-cms, which were
// web-recorridos.spec.ts until 19/11/2026): the run's token, the receipts' shapes, the demo receipts, the two devices, a
// network of its own for each citizen, a citizen or someone of the team in a browser of their own, the steps of the
// form, the receipt and the consultation.

export const YEAR = new Date().getFullYear();
export const RUN = Math.random().toString(36).slice(2, 7);
export const REF = /^AC-\d{4}-[0-9A-HJKMNP-TV-Z]{6}$/;
export const SECRET_RE = /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/;
export const NOT_FOUND = 'No hay ninguna solicitud con esos datos.';
export const DEMR02 = { reference: `AC-${YEAR}-DEMR02`, secret: 'R3PS-W8N2-DEMV-7QKA' };
export const DEMR03 = { reference: `AC-${YEAR}-DEMR03`, secret: 'H4JX-5ZTB-9CNF-W2YE' };
export const DENUNCIA_TEXT = /Las denuncias son confidenciales/;
export const PHONE = { viewport: { width: 360, height: 760 }, isMobile: true, hasTouch: true };
export const DESKTOP = { viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false };
export type Device = typeof PHONE | typeof DESKTOP;

// Each citizen comes from a network of its own (the persistent limits per network), in a range no other spec uses.
const NET = `100.${64 + Math.floor(Math.random() * 60)}.${Math.floor(Math.random() * 250)}`;
let host = Math.floor(Math.random() * 120);
export const nextIp = () => `${NET}.${host++ % 250}`;

/** A small PDF: the server checks its first bytes («%PDF-») and keeps it as it came. */
export const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n', 'latin1');

export async function axe(page: Page, where: string) {
  await readyForAxe(page, where);
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = r.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${where} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);
  expect(serious, where).toEqual([]);
}

export async function noSideScroll(page: Page, where: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth), where).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
}

export async function newContext(browser: Browser, device: Device): Promise<BrowserContext> {
  const ctx = await browser.newContext({ ...device, baseURL: test.info().project.use.baseURL, locale: 'es-VE', timezoneId: 'America/Caracas', storageState: QUIET_STATE });
  await ctx.setExtraHTTPHeaders({ 'x-real-ip': nextIp() });
  return ctx;
}

/** A citizen without an account: a browser (device) and a network of their own. */
export async function citizen(browser: Browser, device: Device = PHONE) {
  const ctx = await newContext(browser, device);
  return { ctx, page: await ctx.newPage() };
}

/** Someone of the team, signed in with the code by email and the second factor. */
export async function staff(browser: Browser, email: string, device: Device = PHONE) {
  const ctx = await newContext(browser, device);
  const page = await ctx.newPage();
  await loginAs(page, email);
  return { ctx, page };
}

export const next = (page: Page) => page.getByRole('button', { name: 'Siguiente' }).click();

export async function lookup(page: Page, reference: string, secret: string) {
  await page.goto('/atencion/consultar');
  await page.getByLabel('Código', { exact: true }).fill(reference);
  await page.getByLabel('Clave', { exact: true }).fill(secret);
  await page.getByRole('button', { name: 'Consultar' }).click();
}

export async function openCase(page: Page, reference: string, secret: string) {
  await lookup(page, reference, secret);
  await expect(page.locator('#caso-titulo')).toHaveText(reference.toUpperCase());
}

export async function readReceipt(page: Page) {
  const code = page.getByTestId('comprobante-codigo');
  await expect(code).toBeVisible({ timeout: 30_000 });
  const reference = (await code.textContent())!.trim();
  const secret = (await page.getByTestId('comprobante-clave').textContent())!.trim();
  expect(reference).toMatch(REF);
  expect(secret).toMatch(SECRET_RE);
  return { reference, secret };
}

export type Kind = {
  tipo: string; label: string; type: RegExp; category: RegExp; categoryName: string; municipality?: string; heading: string;
  /** The area its category goes to (config/clients/fb.json): the services' responsible sees only «servicios». */
  servicesArea: boolean;
};
export const KINDS: Kind[] = [
  { tipo: 'reporte', label: 'Reporte', type: /^Reporte/, category: /^Ambiente y aseo/, categoryName: 'Ambiente y aseo', municipality: 'Ayacucho', heading: 'Solicitud recibida', servicesArea: true },
  { tipo: 'peticion', label: 'Petición', type: /^Petición/, category: /^Educación/, categoryName: 'Educación', municipality: 'Bolívar', heading: 'Solicitud recibida', servicesArea: false },
  { tipo: 'acotacion', label: 'Observación', type: /^Observación/, category: /^Servicios comunitarios/, categoryName: 'Servicios comunitarios', municipality: 'Lobatera', heading: 'Solicitud recibida', servicesArea: true },
  { tipo: 'sugerencia', label: 'Sugerencia', type: /^Sugerencia/, category: /^Otros/, categoryName: 'Otros', heading: 'Solicitud recibida', servicesArea: false },
  { tipo: 'reconocimiento', label: 'Reconocimiento', type: /^Reconocimiento/, category: /^Salud/, categoryName: 'Salud', municipality: 'Junín', heading: 'Solicitud recibida', servicesArea: false },
  { tipo: 'denuncia', label: 'Denuncia', type: /^Denuncia/, category: /^Seguridad/, categoryName: 'Seguridad', municipality: 'Cárdenas', heading: 'Solicitud recibida', servicesArea: false },
];

/** Steps 1 to 3 of the form; then the contact step, ready to send. */
export async function fillForm(page: Page, k: Kind, f: { title: string; description: string; sector: string }) {
  await page.goto(`/atencion/nueva?tipo=${k.tipo}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const radio = page.getByLabel(k.type);
  if (!(await radio.isChecked())) await radio.check();
  await page.getByLabel(k.category).check();
  await next(page);
  await expect(page.getByRole('heading', { level: 2, name: /^Lugar/ })).toBeVisible();
  if (k.municipality) await page.getByLabel(/^Municipio/).selectOption({ label: k.municipality });
  await page.getByLabel(/Parroquia, localidad o sector/).fill(f.sector);
  await next(page);
  await expect(page.getByRole('heading', { level: 2, name: 'Detalle de la solicitud' })).toBeVisible();
  await page.getByLabel(/^Título/).fill(f.title);
  await page.getByLabel(/^Descripción/).fill(f.description);
}

export async function toContactStep(page: Page) {
  await next(page);
  await expect(page.getByRole('heading', { level: 2, name: 'Contacto y envío' })).toBeVisible();
}
