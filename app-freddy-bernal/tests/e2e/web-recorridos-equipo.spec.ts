import { test, expect } from '@playwright/test';
import { noToasts } from './helpers';
import { SECRET as GPS_TEXT, jpegWithGps } from '../unit/fixtures/photos';
import {
  DEMR03, DESKTOP, NOT_FOUND, PDF, RUN, axe, citizen, fillForm, lookup, noSideScroll, openCase, readReceipt, staff, toContactStep, type Kind,
} from './recorridos-helpers';

// The team's journey of the typed brief and of the 6/11 brief (§11), on a computer and on the strict demo server with
// the real sign-in (the table journey → test is in docs/INFORME-PRUEBAS-WEB.md): a petición with a PDF; the
// coordination assigns it and raises its priority; the responsible asks for more information; the person answers from
// the consultation WITH a photo; the team reads it, replies, resolves it with its justification; the person confirms;
// the coordination closes it and the whole history stays (for the team and, in its shared part, for the person); and a
// changed id reveals nothing: another person's consultation, a tampered cookie, an invented id or a case of another
// area open no file and no case. Everything it writes is invented and says «(prueba)».
// (Until 19/11/2026 in web-recorridos.spec.ts; the shared helpers are in recorridos-helpers.ts.)

// --- Journeys 3 to 9 on a computer -------------------------------------------------------------------------------------

test.describe('de punta a punta en la computadora: llega, se asigna, se pide información, la persona responde con una foto, se resuelve y se cierra', () => {
  test.describe.configure({ mode: 'serial' });
  const TITLE = `Parada de autobús sin techo ${RUN} (prueba)`;
  const DESCRIPTION = 'La parada de la avenida no tiene techo y con la lluvia nadie puede esperar ahí (prueba).';
  const QUESTION = `¿En qué esquina exacta está la parada? ${RUN} (prueba)`;
  const ANSWER = `Frente a la panadería, mando una foto ${RUN} (prueba).`;
  const REPLY = `Ya está en el plan de la semana que viene ${RUN} (prueba).`;
  const NOTE = `Nota interna: pedir el techo al almacén ${RUN} (prueba).`;
  const RESOLUTION = `Se instaló el techo de la parada ${RUN} (prueba).`;
  const CLOSING = `La persona confirmó y no queda nada pendiente ${RUN} (prueba).`;
  const flow = { reference: '', secret: '', caseUrl: '', photoHref: '', pdfHref: '', staffPhotoUrl: '' };

  test('1) una persona manda una petición con un PDF desde la computadora y se lleva su comprobante', async ({ browser }) => {
    const c = await citizen(browser, DESKTOP);
    const page = c.page;
    const k: Kind = { tipo: 'peticion', label: 'Petición', type: /^Petición/, category: /^Transporte/, categoryName: 'Transporte', municipality: 'Lobatera', heading: 'Solicitud recibida', servicesArea: false };
    await fillForm(page, k, { title: TITLE, description: DESCRIPTION, sector: `Sector de la parada ${RUN}` });
    await page.getByLabel('Elegir fotos o documentos').setInputFiles({ name: 'carta de la comunidad.pdf', mimeType: 'application/pdf', buffer: PDF });
    await expect(page.getByRole('list', { name: 'Archivos elegidos' }).getByText('carta de la comunidad.pdf')).toBeVisible();
    await toContactStep(page);
    await page.getByRole('textbox', { name: /^Nombre/ }).fill('Vecino de Prueba');
    await page.getByRole('textbox', { name: /^Correo/ }).fill(`vecino.${RUN}@demo.test`);
    await page.getByLabel(/Leí el aviso de privacidad/).check();
    await page.getByRole('button', { name: 'Enviar', exact: true }).click();
    Object.assign(flow, await readReceipt(page));
    await expect(page.getByRole('region', { name: 'Archivos adjuntos' }).getByText(/· Listo$/)).toBeVisible({ timeout: 30_000 });
    await axe(page, 'comprobante con PDF (computadora)');
    await c.ctx.close();
  });

  test('2) la coordinación la recibe por su código, ve el contacto, la asigna al área de vialidad y le sube la prioridad', async ({ browser }) => {
    const s = await staff(browser, 'atencion.coordinacion@demo.test', DESKTOP);
    const page = s.page;
    await page.goto('/admin/atencion');
    await page.getByLabel('Buscar por código o título').fill(flow.reference);
    await page.getByRole('button', { name: 'Filtrar' }).click();
    await page.getByRole('link', { name: flow.reference, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();
    flow.caseUrl = new URL(page.url()).pathname;
    await expect(page.getByText(DESCRIPTION)).toBeVisible();
    await expect(page.getByText(/De la persona · PDF/)).toBeVisible();
    await page.getByRole('button', { name: 'Ver contacto' }).click();
    await expect(page.getByText(`vecino.${RUN}@demo.test`)).toBeVisible();
    // The category's area is already there (Transporte → Vialidad y transporte); its responsible takes it.
    await expect(page.getByLabel('Área', { exact: true }).locator('option:checked')).toHaveText('Vialidad y transporte');
    await page.getByLabel('Responsable', { exact: true }).selectOption({ label: 'Responsable de vialidad (demo)' });
    await page.getByRole('button', { name: 'Guardar asignación' }).click();
    await expect(page.getByText('Listo: quedó asignada.')).toBeVisible();
    await page.getByLabel('Prioridad', { exact: true }).selectOption('alta');
    await page.getByRole('button', { name: 'Guardar prioridad' }).click();
    await expect(page.getByText('Prioridad guardada.')).toBeVisible();
    const history = page.getByRole('list', { name: 'Historial del caso' });
    await expect(history.getByText(/Asignación \(responsable: nadie → Responsable de vialidad \(demo\)\)/)).toBeVisible();
    await expect(history.getByText('Prioridad: Normal → Alta.')).toBeVisible();
    await noSideScroll(page, 'caso (computadora)');
    await axe(page, 'caso de la coordinación (computadora)');
    await s.ctx.close();
  });

  test('3) el responsable pide más información; la persona la ve en su consulta y responde con una foto', async ({ browser }) => {
    const s = await staff(browser, 'atencion.vialidad@demo.test', DESKTOP);
    await s.page.goto('/admin/atencion?responsable=yo');
    await expect(s.page.getByRole('link', { name: flow.reference, exact: true })).toBeVisible();
    await s.page.goto(flow.caseUrl);
    await s.page.getByLabel('Pedir más información', { exact: true }).check();
    await s.page.getByLabel('Qué información necesitas', { exact: true }).fill(QUESTION);
    await s.page.getByRole('button', { name: 'Pedir la información' }).click();
    await expect(s.page.getByText('Listo: le pedimos la información.')).toBeVisible();
    // The question is the message the person reads (and, for the team, the reason of the move to «Requiere información»).
    await expect(s.page.getByRole('list', { name: 'Historial del caso' }).getByText(QUESTION, { exact: true })).toBeVisible();
    await expect(s.page.getByRole('list', { name: 'Historial del caso' }).getByText('Pasó de «Asignado» a «Requiere información».')).toBeVisible();
    await s.page.getByLabel('Nota interna', { exact: true }).check();
    await s.page.getByLabel('Nota para el equipo').fill(NOTE);
    await s.page.getByRole('button', { name: 'Guardar nota interna' }).click();
    await expect(s.page.getByText('Nota guardada: solo la ve el equipo.')).toBeVisible();
    await s.ctx.close();

    const c = await citizen(browser, DESKTOP);
    const page = c.page;
    await openCase(page, flow.reference, flow.secret);
    await expect(page.getByTestId('estado-solicitud')).toHaveText('Requiere información');
    const story = page.getByRole('region', { name: 'Historial de la solicitud' });
    await expect(story.getByText('Solicitud de información', { exact: true })).toBeVisible();
    await expect(story.getByText(QUESTION)).toBeVisible();
    await expect(page.getByText(NOTE)).toHaveCount(0);
    await expect(page.getByText(/almacén/)).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 2, name: 'Responder la solicitud de información' })).toBeVisible();
    await axe(page, 'consulta que pide información (computadora)');
    // Its own PDF downloads while the consultation lasts.
    flow.pdfHref = (await page.getByRole('link', { name: 'Descargar Documento 1' }).getAttribute('href'))!;
    const pdf = await page.request.get(flow.pdfHref);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()['content-type']).toBe('application/pdf');

    await page.getByLabel('Su respuesta', { exact: true }).fill(ANSWER);
    await page.getByLabel('Elegir fotos o documentos').setInputFiles({ name: 'la parada.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpegWithGps()) });
    await expect(page.getByRole('list', { name: 'Archivos elegidos' }).getByText('la parada.jpg')).toBeVisible();
    await page.getByRole('button', { name: 'Enviar información' }).click();
    await expect(page.getByText('Información enviada al personal de atención.')).toBeVisible({ timeout: 30_000 });
    // Answering puts the case back in review; the photo hangs from the person's message.
    await expect(page.getByTestId('estado-solicitud')).toHaveText('En revisión');
    await expect(story.getByText(ANSWER)).toBeVisible();
    const photo = page.getByRole('link', { name: 'Descargar Foto 1' });
    await expect(photo).toBeVisible({ timeout: 30_000 });
    flow.photoHref = (await photo.getAttribute('href'))!;
    expect(flow.photoHref).toMatch(/^\/atencion\/consultar\/archivo\/[0-9a-f-]{36}$/);
    const file = await page.request.get(flow.photoHref);
    expect(file.status()).toBe(200);
    expect(file.headers()['content-type']).toBe('image/jpeg');
    expect(file.headers()['cache-control']).toBe('private, no-store');
    expect((await file.body()).includes(Buffer.from(GPS_TEXT, 'latin1'))).toBe(false);
    await c.ctx.close();
  });

  test('4) el equipo lee la respuesta y la foto (sin GPS), le contesta, la atiende y la resuelve con su justificación', async ({ browser }) => {
    const s = await staff(browser, 'atencion.vialidad@demo.test', DESKTOP);
    const page = s.page;
    await page.goto(flow.caseUrl);
    const history = page.getByRole('list', { name: 'Historial del caso' });
    await expect(history.getByText(ANSWER)).toBeVisible();
    await expect(history.getByText('La persona agregó información.')).toBeVisible();
    await expect(history.getByText('Pasó de «Requiere información» a «En revisión».')).toBeVisible();
    await expect(page.getByText(/De la persona · Foto/)).toBeVisible();
    const photoItem = page.getByRole('listitem').filter({ hasText: /De la persona · Foto/ });
    flow.staffPhotoUrl = (await photoItem.getByRole('link', { name: 'Descargar' }).getAttribute('href'))!;
    expect(flow.staffPhotoUrl).toMatch(/^\/api\/archivos\/atencion\/[0-9a-f-]{36}$/);
    const file = await page.request.get(flow.staffPhotoUrl);
    expect(file.status()).toBe(200);
    expect((await file.body()).includes(Buffer.from(GPS_TEXT, 'latin1'))).toBe(false);

    await page.getByLabel('Respuesta a la persona', { exact: true }).check();
    await page.getByLabel('Respuesta', { exact: true }).fill(REPLY);
    await page.getByRole('button', { name: 'Enviar respuesta' }).click();
    await expect(page.getByText('Respuesta enviada a la persona.')).toBeVisible();

    await page.getByLabel('Pasar a').selectOption('en_atencion');
    await page.getByRole('button', { name: 'Cambiar el estado' }).click();
    await expect(page.getByText('Listo: cambió el estado.')).toBeVisible();
    await expect(history.getByText('Pasó de «En revisión» a «En atención».')).toBeVisible();
    await noToasts(page);
    await page.getByLabel('Pasar a').selectOption('resuelto');
    await page.getByLabel('Cómo se resolvió (justificación)').fill(RESOLUTION);
    await page.getByRole('button', { name: 'Cambiar el estado' }).click();
    await expect(page.getByText('Listo: cambió el estado.')).toBeVisible();
    await expect(history.getByText('Pasó de «En atención» a «Resuelto».')).toBeVisible();
    await expect(page.getByText(`Justificación (interna): ${RESOLUTION}`)).toBeVisible();
    await axe(page, 'caso resuelto (computadora)');
    await s.ctx.close();
  });

  test('5) la persona confirma que se resolvió; la coordinación la cierra y la historia completa queda, también para la persona', async ({ browser }) => {
    const c = await citizen(browser, DESKTOP);
    await openCase(c.page, flow.reference, flow.secret);
    await expect(c.page.getByTestId('estado-solicitud')).toHaveText('Resuelta');
    await expect(c.page.getByText(REPLY)).toBeVisible();
    await expect(c.page.getByText(RESOLUTION)).toHaveCount(0);
    await c.page.getByLabel('Sí, se resolvió').check();
    await c.page.getByRole('button', { name: 'Responder' }).click();
    await expect(c.page.getByText('Usted confirmó que se resolvió. Gracias por su respuesta.')).toBeVisible();
    await c.ctx.close();

    const s = await staff(browser, 'atencion.coordinacion@demo.test', DESKTOP);
    const page = s.page;
    await page.goto(flow.caseUrl);
    const history = page.getByRole('list', { name: 'Historial del caso' });
    await expect(history.getByText('La persona confirmó que se resolvió.')).toBeVisible();
    await page.getByLabel('Pasar a').selectOption('cerrado');
    await page.getByLabel('Por qué se cierra').fill(CLOSING);
    await page.getByRole('button', { name: 'Cambiar el estado' }).click();
    await expect(page.getByText('Listo: cambió el estado.')).toBeVisible();
    await expect(history.getByText('Pasó de «Resuelto» a «Cerrado».')).toBeVisible();
    // Nothing is lost: every step, in order, with who and why. (What one action writes at once shares its time, so
    // only the order between the steps is checked; inside a step, that each line is there.)
    const steps = [
      ['Llegó la solicitud desde la web.'],
      ['Pasó de «Recibido» a «Asignado».', 'Asignación (responsable: nadie → Responsable de vialidad (demo)).'],
      ['Prioridad: Normal → Alta.'],
      [QUESTION, 'Pasó de «Asignado» a «Requiere información».'],
      [NOTE],
      [ANSWER, 'La persona agregó información.', 'Pasó de «Requiere información» a «En revisión».'],
      [REPLY],
      ['Pasó de «En revisión» a «En atención».'],
      ['Pasó de «En atención» a «Resuelto».'],
      ['La persona confirmó que se resolvió.'],
      ['Pasó de «Resuelto» a «Cerrado».'],
    ];
    const text = (await history.innerText()).replace(/\s+/g, ' ');
    let after = -1;
    for (const step of steps) {
      const found = step.map((line) => ({ line, at: text.indexOf(line, after + 1) }));
      for (const f of found) expect(f.at, `«${f.line}» en el historial, después del paso anterior`).toBeGreaterThan(after);
      after = Math.max(...found.map((f) => f.at));
    }
    await expect(history.getByText(`Motivo (interno): ${CLOSING}`)).toBeVisible();
    await s.ctx.close();

    // The person still reads the shared part of the story; never the internal note nor the reasons.
    const again = await citizen(browser, DESKTOP);
    await openCase(again.page, flow.reference, flow.secret);
    await expect(again.page.getByTestId('estado-solicitud')).toHaveText('Cerrada');
    const story = again.page.getByRole('region', { name: 'Historial de la solicitud' });
    for (const line of [QUESTION, ANSWER, REPLY, 'Usted confirmó que se resolvió', 'Pasó a «Cerrada»']) await expect(story.getByText(line).first(), line).toBeVisible();
    for (const hidden of [NOTE, RESOLUTION, CLOSING]) await expect(again.page.getByText(hidden), hidden).toHaveCount(0);
    await axe(again.page, 'consulta cerrada (computadora)');
    await again.ctx.close();
  });

  test('6) un id cambiado no revela nada: otra consulta, la cookie alterada, un id inventado o un caso de otra área', async ({ browser }) => {
    // Another person, with THEIR consultation open (the demo's DEMR03): this case's files do not exist for them.
    const other = await citizen(browser, DESKTOP);
    await openCase(other.page, DEMR03.reference, DEMR03.secret);
    for (const href of [flow.photoHref, `${flow.photoHref}?ver=1`, flow.pdfHref]) {
      const r = await other.page.request.get(href);
      expect(r.status(), href).toBe(404);
      expect(await r.text()).not.toContain('%PDF');
    }
    // Their receipt with this case's code: the one answer.
    await other.page.getByRole('button', { name: 'Salir' }).click();
    await expect(other.page.getByRole('heading', { level: 1, name: 'Consultar mi solicitud' })).toBeVisible();
    await lookup(other.page, flow.reference, DEMR03.secret);
    await expect(other.page.getByRole('alert').getByText(NOT_FOUND)).toBeVisible();
    // The team's door for files asks for a session.
    expect((await other.page.request.get(flow.staffPhotoUrl)).status()).toBe(401);
    await other.ctx.close();

    // The person's own consultation with its cookie changed by one letter: nothing opens.
    const owner = await citizen(browser, DESKTOP);
    await openCase(owner.page, flow.reference, flow.secret);
    const cookie = (await owner.ctx.cookies()).find((x) => x.name === 'fb_consulta')!;
    const mid = Math.floor(cookie.value.length / 2);
    const flipped = cookie.value.slice(0, mid) + (cookie.value[mid] === 'A' ? 'B' : 'A') + cookie.value.slice(mid + 1);
    await owner.ctx.addCookies([{ ...cookie, value: flipped }]);
    expect((await owner.page.request.get(flow.photoHref)).status()).toBe(404);
    await owner.page.goto('/atencion/consultar');
    await expect(owner.page.getByRole('heading', { level: 1, name: 'Consultar mi solicitud' })).toBeVisible();
    await expect(owner.page.getByText(TITLE)).toHaveCount(0);
    // An invented or malformed file id, with or without a consultation: the same 404.
    for (const id of ['00000000-0000-4000-8000-00000000beef', 'no-es-un-id', '..%2F..%2Fetc%2Fpasswd']) {
      expect((await owner.page.request.get(`/atencion/consultar/archivo/${id}`)).status(), id).toBe(404);
    }
    await owner.ctx.close();

    // A responsible of another area: the case, its file and an invented case are «not found».
    const s = await staff(browser, 'atencion.servicios@demo.test', DESKTOP);
    await s.page.goto(flow.caseUrl);
    await expect(s.page.getByRole('heading', { name: 'No encontramos esto' })).toBeVisible();
    await expect(s.page.getByText(TITLE)).toHaveCount(0);
    await expect(s.page.getByText(ANSWER)).toHaveCount(0);
    expect((await s.page.request.get(flow.staffPhotoUrl)).status()).toBe(404);
    for (const id of ['00000000-0000-4000-8000-00000000beef', 'no-es-un-id']) {
      await s.page.goto(`/admin/atencion/${id}`);
      await expect(s.page.getByRole('heading', { name: 'No encontramos esto' }), id).toBeVisible();
    }
    await s.ctx.close();
  });
});
