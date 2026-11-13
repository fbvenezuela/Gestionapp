import fs from 'node:fs';
import path from 'node:path';
import { expect, type Page } from '@playwright/test';

// TOTP secrets of demo users enrolled during this test run (enrollment happens once
// per server; later logins only ask for the code).
const SECRETS = path.join(process.cwd(), 'test-results', '.totp-secrets.json');
const readSecrets = (): Record<string, string> => {
  try {
    return JSON.parse(fs.readFileSync(SECRETS, 'utf8'));
  } catch {
    return {};
  }
};

// Signs in through the real form; in demo mode the code is read from the test inbox
// shown next to the form.
export async function login(page: Page, email: string) {
  await page.goto('/entrar');
  await page.getByLabel('Correo').fill(email);
  await page.getByRole('button', { name: 'Mandarme el código' }).click();
  const inbox = page.getByText(/Tu código para entrar: \d{6}/).first();
  await expect(inbox).toBeVisible({ timeout: 20_000 });
  const code = (await inbox.textContent())!.match(/\d{6}/)![0];
  await page.getByLabel('Código del correo').fill(code);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/entrar'), { timeout: 20_000 });
}

// Demo TOTP: the first time, taps «Mostrar el código QR», reads the secret shown under the QR and
// computes the current code. Later logins only ask for the code.
export async function passMfa(page: Page, email: string) {
  // `/panel` (and `/`) only send on to the person's home or to the second factor (D-91): wait past them.
  await page.waitForURL((u) => u.pathname !== '/' && u.pathname !== '/panel' && !u.pathname.startsWith('/entrar'), { timeout: 20_000 });
  if (!page.url().includes('/doble-factor')) return;
  const secrets = readSecrets();
  let secret = secrets[email];
  const showQr = page.getByRole('button', { name: 'Mostrar el código QR' });
  if (await showQr.count()) {
    await showQr.click();
    await page.getByText('¿No puedes escanear? Escribe esta clave').click();
    secret = (await page.locator('code').first().textContent())!.trim();
    fs.mkdirSync(path.dirname(SECRETS), { recursive: true });
    fs.writeFileSync(SECRETS, JSON.stringify({ ...secrets, [email]: secret }));
  }
  const { totpAt } = await import('../../src/lib/auth/totp');
  await page.getByLabel('Código de 6 números').fill(totpAt(secret, Date.now()));
  await page.getByRole('button', { name: 'Confirmar' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/doble-factor'));
}

export async function loginAs(page: Page, email: string) {
  await login(page, email);
  await passMfa(page, email);
}

/**
 * No toast on the screen: a toast fading in or out is half transparent (axe would read its contrast mid-animation), and
 * one can cover what the test taps next. Sonner keeps every toast while the pointer is over one (it expands them), and
 * Playwright leaves the pointer where it last clicked: in CI the toast of «Crear borrador» slid under the pointer left on
 * the CMS editor's «Guardar borrador» (its toolbar is right under the toasts, top-centre), and both toasts stayed for good
 * (web-recorridos, runs 57 and 58). So the pointer goes to the corner first, as a person's would move on; a toast that
 * stays on its own still fails, after 15 s.
 */
export async function noToasts(page: Page) {
  await page.mouse.move(0, 0);
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 15_000 });
}

/**
 * What axe needs before it reads a screen: no toast, and its <title>. Next renders the title with the page's metadata,
 * in a boundary of its own that streams after the page; right after an action that redraws the page (and
 * `router.refresh()`), axe ran in CI before the title was back, 3 times (participacion and admin-web, runs 54 and 58;
 * web-recorridos before them, docs/INFORME-PRUEBAS-WEB.md §11). A page that really has no title still fails, after 5 s.
 */
export async function readyForAxe(page: Page, where: string) {
  await noToasts(page);
  await expect.poll(() => page.title(), { message: `${where}: la página no tiene título`, timeout: 5_000 }).not.toBe('');
}
