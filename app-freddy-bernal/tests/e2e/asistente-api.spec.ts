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
  expect(Object.keys(j1).sort()).toEqual(['ambito', 'conversacion', 'degradado', 'hizo', 'ir', 'modelo', 'ms', 'respuesta']);
  expect(j1).toMatchObject({ ambito: 'equipo', modelo: 'local', degradado: false });

  // Same conversation, and never a date, time or address of an event.
  const r2 = await page.request.post('/api/asistente', { data: { pregunta: '¿A qué hora y dónde es la jornada de salud?', conversacion: j1.conversacion } });
  const j2 = await r2.json();
  expect(j2.conversacion).toBe(j1.conversacion);
  expect(j2.respuesta).not.toMatch(/\b\d{1,2}:\d{2}\b|\b\d{1,2}\s*[ap]\.?\s?m\b/i);

  const bad = await page.request.post('/api/asistente', { data: { pregunta: 'x'.repeat(1501) } });
  expect(bad.status()).toBe(400);
});
