import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { loginAs } from './helpers';

// Grabación's handoff to the editor (cambios del 27/10/2026, §5), at 360 px against the demo: the camera person
// uploads the storyboard it recorded with and leaves its note; Redes sees both, with no date or time, and brings
// the whole pauta at once: into a folder (the folder picker mapped to the browser's private disk, OPFS) or, where
// there is no picker, one file after another to Downloads. Runs in order. All data here is invented.
test.describe.configure({ mode: 'serial' });

const fixture = (f: string) => path.join(__dirname, '..', 'fixtures', f);
const EVENT = 'Jornada de salud en la escuela Los Andes';
const NOTE = 'Lo mejor del saludo está en el segundo clip; el dron tiene viento al final (prueba).';
const TIME_RE = /\b\d{1,2}:\d{2}\s?(a\.?\s?m\.?|p\.?\s?m\.?|AM|PM)/i;
let eventUrl = '';
let code = '';

async function axe(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([]);
}

async function openMaterial(page: Page) {
  await page.goto(`${eventUrl}?tab=material`);
  await expect(page.getByRole('heading', { name: EVENT })).toBeVisible();
}

test('Grabación sube el storyboard con el que grabó y deja su nota para el editor', async ({ page }) => {
  await loginAs(page, 'grabacion@demo.test');
  await page.goto('/agenda');
  await page.getByText(EVENT).first().click();
  await expect(page.getByRole('heading', { name: 'Storyboard con el que se grabó' })).toBeVisible();
  eventUrl = new URL(page.url()).pathname;
  code = (await page.locator('main span.font-mono').first().textContent())!.trim();
  expect(code).toMatch(/^E-\d{4,}$/);

  await page.getByLabel('Subir el storyboard (foto o PDF)').setInputFiles(fixture('cover.jpg'));
  const storyboard = page.getByRole('region', { name: 'Entrega de Grabación' });
  await expect(storyboard.getByText(/^Storyboard \d+$/).first()).toBeVisible({ timeout: 30_000 });

  await page.getByLabel('Tu nota para el editor').fill(NOTE);
  await page.getByRole('button', { name: 'Guardar nota' }).click();
  await expect(page.getByText('Nota guardada. Redes ya la ve.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Tu nota para el editor')).toHaveValue(NOTE);
  await axe(page);
});

test('Redes ve la nota y el storyboard, sin fecha ni hora, y le llega en Hoy', async ({ page }) => {
  await loginAs(page, 'redes@demo.test');
  await openMaterial(page);
  const handoff = page.getByRole('region', { name: 'Entrega de Grabación' });
  await expect(handoff.getByText(NOTE)).toBeVisible();
  await expect(handoff.getByText('Kevin', { exact: true })).toBeVisible();
  await expect(handoff.getByText(/^Storyboard \d+$/).first()).toBeVisible();
  // Redes reads it; it does not write it.
  await expect(page.getByLabel('Tu nota para el editor')).toHaveCount(0);
  await expect(page.getByLabel('Subir el storyboard (foto o PDF)')).toHaveCount(0);
  expect(await page.locator('main').innerText()).not.toMatch(TIME_RE);
  await axe(page);

  await page.goto('/hoy');
  await expect(page.getByRole('link', { name: new RegExp(`${EVENT}.*Notas de Grabación nuevas`) })).toBeVisible();
});

test('«Descargar todo» en una carpeta: el LEEME con la nota y cada archivo en su subcarpeta, sin fechas', async ({ page }) => {
  // The folder picker answers with the browser's private disk (OPFS), emptied first.
  await page.addInitScript(() => {
    (window as unknown as { showDirectoryPicker: () => Promise<unknown> }).showDirectoryPicker = () => navigator.storage.getDirectory();
  });
  await loginAs(page, 'redes@demo.test');
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const names: string[] = [];
    for await (const name of (root as unknown as { keys(): AsyncIterable<string> }).keys()) names.push(name);
    for (const name of names) await root.removeEntry(name, { recursive: true });
  });
  await openMaterial(page);
  await page.getByRole('button', { name: /^Descargar todo el material \(\d+\)$/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Descargar todo' });
  await expect(sheet.getByText(`${code}-LEEME.txt`).first()).toBeVisible();
  await axe(page);
  await sheet.getByRole('button', { name: 'Elegir carpeta y descargar' }).click();
  await expect(sheet.getByText('Listo: todo está en la carpeta.')).toBeVisible({ timeout: 60_000 });

  const found = await page.evaluate(async (c) => {
    type Dir = FileSystemDirectoryHandle & { entries(): AsyncIterable<[string, FileSystemHandle]> };
    const root = (await navigator.storage.getDirectory()) as Dir;
    const dir = (await root.getDirectoryHandle(c)) as Dir;
    const files: Record<string, number> = {};
    for await (const [name, h] of dir.entries()) {
      if (h.kind === 'file') files[name] = (await (h as FileSystemFileHandle).getFile()).size;
      else for await (const [sub, f] of (h as Dir).entries()) if (f.kind === 'file') files[`${name}/${sub}`] = (await (f as FileSystemFileHandle).getFile()).size;
    }
    const readme = await (await (await dir.getFileHandle(`${c}-LEEME.txt`)).getFile()).text();
    return { files, readme };
  }, code);
  expect(found.readme).toContain(EVENT);
  expect(found.readme).toContain(`Kevin: ${NOTE}`);
  expect(found.readme).toMatch(new RegExp(`Storyboard/${code}-Storyboard-\\d+\\.jpg`));
  expect(found.readme).not.toMatch(TIME_RE);
  const storyboards = Object.entries(found.files).filter(([n]) => new RegExp(`^Storyboard/${code}-Storyboard-\\d+\\.jpg$`).test(n));
  expect(storyboards.length).toBeGreaterThan(0);
  for (const [, size] of storyboards) expect(size).toBeGreaterThan(0);
  // Names: the event code and the platform's label only, never a date.
  for (const name of Object.keys(found.files)) expect(name, name).not.toMatch(/\d{4}-\d{2}-\d{2}|\d{1,2}[-_]\d{2}[-_]\d{2,4}|:\d{2}/);
});

test('sin selector de carpetas, los archivos van uno tras otro a descargas, el LEEME primero', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showDirectoryPicker', { value: undefined, configurable: true, writable: true });
  });
  await loginAs(page, 'redes@demo.test');
  await openMaterial(page);
  await page.getByRole('button', { name: /^Descargar todo el material \(\d+\)$/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Descargar todo' });
  const first = page.waitForEvent('download');
  await sheet.getByRole('button', { name: 'Descargar uno por uno' }).click();
  const readme = await first;
  expect(readme.suggestedFilename()).toBe(`${code}-LEEME.txt`);
  const text = fs.readFileSync((await readme.path())!, 'utf8');
  expect(text).toContain(`Kevin: ${NOTE}`);
  expect(text).not.toMatch(TIME_RE);
  const next = await page.waitForEvent('download');
  expect(next.suggestedFilename()).toMatch(new RegExp(`^${code}-[A-Za-z0-9-]+\\.[a-z0-9]{1,5}$`));
  await expect(sheet.getByText('Listo: todo va a tus descargas.')).toBeVisible({ timeout: 30_000 });
});
