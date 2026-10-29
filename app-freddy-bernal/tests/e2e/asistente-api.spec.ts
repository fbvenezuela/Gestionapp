import { test, expect } from '@playwright/test';
import { loginAs } from './helpers';

// The team assistant's endpoint on the demo server (no AI keys → demo brain, model 'local').
test('asistente: sin sesión no contesta; con sesión contesta con las claves de la ventana', async ({ page, playwright }) => {
  const anon = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
  const r0 = await anon.post('/api/asistente', { data: { pregunta: 'hola' } });
  expect(r0.status()).toBe(401);
  await anon.dispose();

  await loginAs(page, 'redes@demo.test');
  const r1 = await page.request.post('/api/asistente', { data: { pregunta: '¿Cómo te llamas?' } });
  expect(r1.status()).toBe(200);
  const j1 = await r1.json();
  expect(Object.keys(j1).sort()).toEqual(['ambito', 'conversacion', 'degradado', 'hizo', 'ir', 'modelo', 'ms', 'respuesta', 'tutorial']);
  expect(j1).toMatchObject({ ambito: 'equipo', modelo: 'local', degradado: false, tutorial: null });

  // R3: the window sends the pattern of the screen; «muéstrame…» brings that screen's tutorial (never an id, and a
  // screen that is not a pattern is dropped). 360 never reads Mensajes: the button to it.
  const rt = await page.request.post('/api/asistente', { data: { pregunta: 'muéstrame cómo se usa esta pantalla', pantalla: '/redes' } });
  expect((await rt.json()).tutorial).toEqual({ id: 'redes', etiqueta: 'Ver el tutorial de Redes', href: '/redes?tutorial=redes' });
  const rx = await page.request.post('/api/asistente', { data: { pregunta: 'muéstrame cómo se usa esta pantalla', pantalla: '/piezas/123e4567-e89b-42d3-a456-426614174000' } });
  expect(rx.status()).toBe(200);
  expect((await rx.json()).tutorial?.id ?? null).not.toBe('pieza');
  const rm = await page.request.post('/api/asistente', { data: { pregunta: '¿Qué me escribió Daniela?' } });
  const jm = await rm.json();
  expect(jm.respuesta).toMatch(/^No leo los mensajes del equipo/);
  expect(jm.ir).toEqual({ href: '/mensajes', label: 'Mensajes' });

  // Same conversation, and never a date, time or address of an event.
  const r2 = await page.request.post('/api/asistente', { data: { pregunta: '¿A qué hora y dónde es la jornada de salud?', conversacion: j1.conversacion } });
  const j2 = await r2.json();
  expect(j2.conversacion).toBe(j1.conversacion);
  expect(j2.respuesta).not.toMatch(/\b\d{1,2}:\d{2}\b|\b\d{1,2}\s*[ap]\.?\s?m\b/i);

  // Support: there is no support phone, and 360 offers to tell administración (also as a second turn).
  const r3 = await page.request.post('/api/asistente', { data: { pregunta: '¿Cuál es el teléfono de soporte?', conversacion: j1.conversacion } });
  expect((await r3.json()).respuesta).toMatch(/^No hay teléfono de soporte en la plataforma; si algo falla, le aviso a administración\./);

  const bad = await page.request.post('/api/asistente', { data: { pregunta: 'x'.repeat(1501) } });
  expect(bad.status()).toBe(400);
});
