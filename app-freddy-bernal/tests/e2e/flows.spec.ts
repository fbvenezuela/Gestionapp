import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import { loginAs } from './helpers';

// End-to-end at 360 px against the demo (in-memory) database. Runs in order: each
// step builds on the previous one, like a real day of work.
test.describe.configure({ mode: 'serial' });

const fixture = (f: string) => path.join(__dirname, '..', 'fixtures', f);
const TIME_RE = /\b\d{1,2}:\d{2}\s?(a\.?\s?m\.?|p\.?\s?m\.?|AM|PM)/i;

async function axe(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([]);
}

test('redes ve los eventos como lista, sin fecha ni hora', async ({ page }) => {
  await loginAs(page, 'redes@demo.test');
  await page.goto('/agenda');
  await expect(page.getByRole('heading', { name: 'Eventos' })).toBeVisible();
  const main = await page.locator('main').innerText();
  expect(main).not.toMatch(TIME_RE);
  expect(main).not.toMatch(/\bcalle 3\b/i); // exact address of a demo event
  await axe(page);
  await page.getByText('Reunión con productores de café de la zona alta').click();
  await expect(page.getByRole('heading', { name: /Reunión con productores/ })).toBeVisible();
  expect(await page.locator('main').innerText()).not.toMatch(TIME_RE);
});

test('redes arma el storyboard y queda guardado', async ({ page }) => {
  await loginAs(page, 'redes@demo.test');
  await page.goto('/agenda');
  await page.getByText('Entrega de viviendas en el urbanismo Nuevo Amanecer').click();
  await page.getByRole('link', { name: 'Storyboard', exact: true }).click();
  await page.getByLabel('Lo que va a decir').fill('¡Saludos, Táchira! Hoy entregamos viviendas.');
  await page.getByRole('button', { name: 'Agregar bloque' }).click();
  await page.getByLabel('Plano').first().fill('Plano general');
  await page.getByLabel('Lo que dice el jefe').first().fill('Estas familias ya tienen su casa.');
  await page.getByRole('button', { name: 'Guardar storyboard' }).click();
  await expect(page.getByText('Storyboard guardado.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Lo que va a decir')).toHaveValue(/entregamos viviendas/);
});

test('despacho crea un evento con su ficha y aparece en el calendario', async ({ page }) => {
  await loginAs(page, 'despacho@demo.test');
  await page.goto('/agenda/nuevo');
  await page.getByLabel('Título').fill('Inspección del acueducto de prueba');
  await page.getByLabel('A dónde se va').fill('Planta potabilizadora (demo)');
  const d = new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10);
  await page.getByLabel('Fecha', { exact: true }).fill(d);
  await page.getByLabel('Hora (Táchira)').fill('07:15');
  await page.getByLabel('De qué es la obra o el acto').fill('Revisión de la planta');
  await page.getByLabel('Guardar aunque choque con otro evento').check();
  await page.getByRole('button', { name: 'Guardar evento' }).click();
  await expect(page.getByRole('heading', { name: 'Inspección del acueducto de prueba' })).toBeVisible();
  await expect(page.getByText(/7:15/)).toBeVisible();
  await page.goto(`/agenda?vista=dia&fecha=${d}`);
  await expect(page.getByText('Inspección del acueducto de prueba')).toBeVisible();
  await axe(page);
});

test('quien graba sube el material por partes a su evento', async ({ page }) => {
  await loginAs(page, 'grabacion@demo.test');
  await page.goto('/agenda');
  await expect(page.getByRole('heading', { name: 'Mis eventos' })).toBeVisible();
  await page.getByText('Jornada de salud en la escuela Los Andes').click();
  await expect(page.getByRole('heading', { name: 'Jefe hablando' })).toBeVisible();
  await page.getByLabel('Subir jefe hablando').setInputFiles(fixture('vertical-4s.mp4'));
  await expect(page.getByText('Jefe hablando 1', { exact: true })).toBeVisible({ timeout: 30_000 });
});

test('redes crea la pieza, sube el final, escribe los copies y la manda a aprobar', async ({ page }) => {
  await loginAs(page, 'redes@demo.test');
  await page.goto('/piezas');
  await page.getByRole('link', { name: 'Jornada de salud escolar' }).click();
  await page.getByLabel('Subir video final (nueva versión)').setInputFiles(fixture('vertical-4s.mp4'));
  await expect(page.getByText('Nueva versión guardada.')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Escribir desde la ficha' }).click();
  await expect(page.getByText(/Copies listos desde la ficha/)).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect(page.getByLabel('Largo')).toHaveValue(/Saludos, Táchira/);
  await page.getByRole('button', { name: 'Enviar a aprobación' }).click();
  await expect(page.getByText('Enviada a supervisión.')).toBeVisible();
});

test('redes no puede publicar lo que no está aprobado', async ({ page }) => {
  await loginAs(page, 'redes@demo.test');
  await page.goto('/publicar/nueva');
  const options = await page.getByLabel('¿Qué pieza vas a publicar?').locator('option').allTextContents();
  expect(options).not.toContain('Jornada de salud escolar');
});

test('supervisión aprueba la pieza', async ({ page }) => {
  await loginAs(page, 'supervision@demo.test');
  await page.goto('/aprobar');
  await axe(page);
  await page.getByRole('link', { name: /Jornada de salud escolar/ }).click();
  await page.getByRole('button', { name: 'Aprobar' }).click();
  await expect(page).toHaveURL(/\/aprobar$/);
});

test('redes publica a mano con validación por red y link', async ({ page }) => {
  await loginAs(page, 'redes@demo.test');
  await page.goto('/publicar');
  await page.getByRole('link', { name: /Jornada de salud escolar/ }).first().click();
  await expect(page.getByText(/Todo bien para TikTok|TikTok:/).first()).toBeVisible();
  await page.getByRole('checkbox').first().check();
  await page.getByRole('button', { name: /Guardar como borrador|Programar/ }).click();
  await expect(page.getByText('Paquete para publicar')).toBeVisible();
  await page.getByLabel('Link de la publicación').fill('https://example.com/demo/post/123');
  await page.getByRole('button', { name: 'Ya lo publiqué' }).click();
  await expect(page.getByText('Evidencia')).toBeVisible();
  await page.getByLabel('Vistas').fill('1500');
  await page.getByLabel('Me gusta').fill('120');
  await page.getByRole('button', { name: 'Guardar resultados' }).click();
  await expect(page.getByText('Resultados guardados.')).toBeVisible();
});

test('tweets de la semana: se separan, se validan y se reparten', async ({ page }) => {
  await loginAs(page, 'redes@demo.test');
  await page.goto('/tweets/nueva');
  await page.getByLabel('Texto con los tweets').fill(
    'Tweets semana\n\n1. Seguimos con el bacheo de la vía principal de prueba.\n2. Jornada de vacunación en la escuela de prueba.\n3. Seguimos con el bacheo de la vía principal de prueba.\n4. ' +
      'x'.repeat(300),
  );
  await page.getByRole('button', { name: 'Separar tweets' }).click();
  await expect(page.getByText('Separé 4 tweets.')).toBeVisible();
  await expect(page.getByText('Repetido: es igual al tweet 1.')).toBeVisible();
  await expect(page.getByText(/Se pasa por/)).toBeVisible();
  await page.getByRole('button', { name: 'Quitar tweet 4' }).click();
  await page.getByRole('button', { name: 'Quitar tweet 3' }).click();
  await page.getByRole('button', { name: /Repartir en la semana/ }).click();
  await expect(page.getByText('2 por aprobar')).toBeVisible();
});

test('administración invita a una persona y el correo queda en el buzón de prueba', async ({ page }) => {
  await loginAs(page, 'admin@demo.test');
  await page.goto('/ajustes/equipo');
  await page.getByLabel('Nombre').fill('Persona Inventada');
  await page.getByLabel('Correo').fill('nueva@demo.test');
  await page.getByRole('button', { name: 'Enviar invitación' }).click();
  await expect(page.getByText('Invitación enviada.')).toBeVisible();
  await page.goto('/ajustes/buzon');
  await expect(page.getByText(/Te invitaron a/).first()).toBeVisible();
  await expect(page.getByText('Guardado (no enviado)').first()).toBeVisible();
});

test('el jefe entra con doble factor, ve Política y Digital y decide un evento', async ({ page }) => {
  await loginAs(page, 'jefe@demo.test');
  await expect(page.getByRole('link', { name: /Política Agenda/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Digital Lo publicado/ })).toBeVisible();
  await axe(page);
  await page.getByRole('link', { name: /Política Agenda/ }).click();
  await page.getByRole('link', { name: /Feria de emprendedores/ }).first().click();
  await page.getByRole('radio', { name: '8' }).click();
  await page.getByRole('button', { name: 'Aceptar' }).click();
  await expect(page.getByText('Evento aceptado.')).toBeVisible();
});
