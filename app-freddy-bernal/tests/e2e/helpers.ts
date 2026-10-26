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
  await page.waitForURL((u) => u.pathname !== '/' && !u.pathname.startsWith('/entrar'), { timeout: 20_000 });
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
