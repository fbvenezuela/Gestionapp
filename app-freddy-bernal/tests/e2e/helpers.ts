import { expect, type Page } from '@playwright/test';

// Signs in through the real form; in demo mode the code is read from the test inbox
// shown next to the form.
export async function login(page: Page, email: string) {
  await page.goto('/entrar');
  await page.getByLabel('Correo').fill(email);
  await page.getByRole('button', { name: 'Mandarme el código' }).click();
  const inbox = page.getByText(/Tu código para entrar: \d{6}/).first();
  await expect(inbox).toBeVisible({ timeout: 20_000 });
  const code = (await inbox.textContent())!.match(/\d{6}/)![0];
  await page.getByLabel('Código de 6 números').fill(code);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/entrar'), { timeout: 20_000 });
}

// Demo TOTP: reads the secret shown on the 2FA page and computes the current code.
export async function passMfa(page: Page) {
  if (!page.url().includes('/doble-factor')) return;
  await page.getByText('¿No puedes escanear? Escribe esta clave').click();
  const secret = (await page.locator('code').first().textContent())!.trim();
  const { totpAt } = await import('../../src/lib/auth/totp');
  await page.getByLabel('Código de 6 números').fill(totpAt(secret, Date.now()));
  await page.getByRole('button', { name: 'Confirmar' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/doble-factor'));
}

export async function loginAs(page: Page, email: string) {
  await login(page, email);
  await passMfa(page);
}
