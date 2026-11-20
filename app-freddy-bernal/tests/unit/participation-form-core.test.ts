// The public request form's own rules (src/components/participation/form-core.ts and friends), pure: what the server
// receives (a denuncia never carries a point or a reference, an anonymous request never a contact), the same schema as
// the server with the errors on the step that owns them, the draft kept in sessionStorage (anything odd in it is
// dropped, never trusted), and the small helpers of the pages: «?sobre=», the date rule, the verified contacts, the
// words of the states.
import { describe, expect, it, vi } from 'vitest';
import { requestInput } from '@/lib/participation/input';
import { SECRET_PATTERN } from '@/lib/participation/receipt-code';
import { chosenChannel, eventDateProblem, linkedItemPath, parseSobre, stepOfField } from '@/lib/actions/participation-types';
import {
  DRAFT_KEY, canAskSimilar, emptyValues, errorsOfStep, filesAfterReload, firstErrorStep, hasContent, newDraft, parseDraft, resumeDraft, setAside,
  similarKey, toInput, uuidV4, validate, validateJoin, worthKeeping, type Draft, type FormValues,
} from '@/components/participation/form-core';
import { verifiedContacts } from '@/components/participation/contacts';
import { STATE_PLAIN, dayDate, reportsCount, tachiraToday, timelineLine } from '@/components/participation/words';
import { REQUEST_STATES } from '@/lib/participation/input';

const CAT = '11111111-1111-4111-8111-111111111111';
const MUNI = '22222222-2222-4222-8222-222222222222';
const TODAY = '2026-11-06';

function filled(over: Partial<FormValues> = {}): FormValues {
  return {
    ...emptyValues(),
    type: 'reporte',
    categoryId: CAT,
    municipalityId: MUNI,
    sector: 'Sector centro',
    locationReference: 'Frente a la bodega',
    title: 'Hueco en la avenida',
    description: 'Hay un hueco grande desde ayer en la avenida.',
    privacyAccepted: true,
    ...over,
  };
}

describe('lo que recibe el servidor', () => {
  it('una denuncia nunca lleva el punto ni la referencia, aunque el borrador los tuviera', () => {
    const input = toInput(filled({ type: 'denuncia', point: { lat: 7.77, lng: -72.22 }, locationConsent: true, locationReference: 'Al lado de la casa' }));
    expect(input).toMatchObject({ point: null, locationConsent: false, locationReference: '' });
    expect(requestInput.safeParse(input).success).toBe(true);
  });

  it('anónima: sin contacto ni permiso de nombre; con contacto, el canal sale del correo o el teléfono', () => {
    expect(toInput(filled({ anonymous: true, name: 'Ana', email: 'ana@demo.test', publishNameConsent: true }))).toMatchObject({ contact: null, publishNameConsent: false });
    expect(toInput(filled({ name: 'Ana', email: 'ana@demo.test' })).contact).toEqual({ name: 'Ana', email: 'ana@demo.test', phone: '', channel: 'email' });
    expect(toInput(filled({ phone: '0276 555 0000' })).contact).toMatchObject({ channel: 'phone' });
    expect(toInput(filled({ phone: '0276 555 0000', channel: 'none' })).contact).toMatchObject({ channel: 'none' });
    expect(toInput(filled()).contact).toBeNull();
    // The name's permission only with a name.
    expect(toInput(filled({ publishNameConsent: true })).publishNameConsent).toBe(false);
    expect(chosenChannel({ email: '', phone: '', channel: 'whatsapp' })).toBe('whatsapp');
  });

  it('el punto va solo con permiso y la parroquia solo con su municipio', () => {
    expect(toInput(filled({ point: { lat: 7.7, lng: -72.2 }, locationConsent: true }))).toMatchObject({ point: { lat: 7.7, lng: -72.2 }, locationConsent: true });
    expect(toInput(filled({ municipalityId: '', parishId: '33333333-3333-4333-8333-333333333333' })).parishId).toBeNull();
  });
});

describe('la misma revisión que el servidor, paso por paso', () => {
  it('un formulario completo no tiene nada que revisar', () => {
    expect(validate(filled(), TODAY)).toEqual({});
  });

  it('cada error sale en el paso que lo pide, con las palabras del esquema', () => {
    const errors = validate({ ...emptyValues(), type: 'reporte' }, TODAY);
    expect(errorsOfStep(errors, 1)).toEqual({ categoryId: 'Elija una categoría de la lista.' });
    expect(errorsOfStep(errors, 2)).toEqual({ municipalityId: 'Elija el municipio.' });
    expect(Object.keys(errorsOfStep(errors, 3)).sort()).toEqual(['description', 'title']);
    expect(errorsOfStep(errors, 4)).toEqual({ privacyAccepted: 'Para enviar, debe aceptar el aviso de privacidad.' });
    expect(firstErrorStep(errors)).toBe(1);
    expect(firstErrorStep(validate(filled({ title: '' }), TODAY))).toBe(3);
  });

  it('las reglas entre campos (el lugar de una denuncia, el permiso de la ubicación) salen en su paso aunque falte lo de después', () => {
    // zod only runs them once every field passes on its own: the form checks a copy with stand-ins.
    const early = { ...emptyValues(), type: 'denuncia' as const, categoryId: CAT, municipalityId: MUNI, locationReference: 'Al lado de la casa' };
    expect(toInput(early).locationReference).toBe('');
    const reporte = { ...emptyValues(), type: 'reporte' as const, categoryId: CAT, municipalityId: MUNI, point: { lat: 7.7, lng: -72.2 }, locationConsent: false };
    expect(errorsOfStep(validate(reporte, TODAY), 2)).toEqual({ locationConsent: 'Para guardar su ubicación se necesita su autorización.' });
    const contact = { ...filled({ title: '' }), channel: 'email', phone: '0276 555 0000' };
    expect(errorsOfStep(validate(contact, TODAY), 4)).toMatchObject({ contact: 'Escriba el correo o elija otro medio de contacto.' });
  });

  it('sin elegir qué enviar, no pide todavía la categoría (su pregunta aún no está en pantalla)', () => {
    expect(errorsOfStep(validate(emptyValues(), TODAY), 1)).toEqual({ type: 'Elija el tipo de solicitud.' });
  });

  it('la fecha del hecho: hasta mañana y diez años atrás, como la base', () => {
    expect(validate(filled({ eventDate: '2026-11-07' }), TODAY)).toEqual({});
    expect(validate(filled({ eventDate: '2026-11-09' }), TODAY).eventDate).toBe('La fecha del hecho no puede ser en el futuro.');
    expect(validate(filled({ eventDate: '2010-01-01' }), TODAY).eventDate).toMatch(/diez años/);
    expect(eventDateProblem('2026-02-30', TODAY)).toBe('Revise la fecha del hecho.');
    expect(eventDateProblem(null, TODAY)).toBeNull();
    expect(stepOfField('eventDate')).toBe(3);
    expect(stepOfField('contact.email')).toBe(4);
  });

  it('un contacto incoherente se dice junto al canal', () => {
    expect(validate(filled({ channel: 'email', phone: '0276 555 0000' }), TODAY).contact).toBe('Escriba el correo o elija otro medio de contacto.');
    expect(validate(filled({ email: 'no-es-correo' }), TODAY)['contact.email']).toBe('Revise el correo electrónico.');
  });

  it('sumarse pide solo el aviso de privacidad, un contacto coherente y una nota corta', () => {
    expect(validateJoin({ ...emptyValues(), privacyAccepted: true })).toEqual({});
    expect(validateJoin(emptyValues())).toEqual({ privacyAccepted: 'Para enviar, debe aceptar el aviso de privacidad.' });
    expect(validateJoin({ ...emptyValues(), privacyAccepted: true, note: 'x'.repeat(2001) }).note).toMatch(/2000/);
  });

  it('«¿ya lo reportaron?» se pregunta solo en un reporte con categoría y lugar, una vez por lugar', () => {
    expect(canAskSimilar(filled())).toBe(true);
    expect(canAskSimilar(filled({ type: 'peticion' }))).toBe(false);
    expect(canAskSimilar(filled({ municipalityId: '' }))).toBe(false);
    expect(canAskSimilar(filled({ municipalityId: '', point: { lat: 7.7, lng: -72.2 } }))).toBe(true);
    expect(similarKey(filled({ sector: '  Sector   Centro ' }))).toBe(similarKey(filled({ sector: 'sector centro' })));
    expect(similarKey(filled({ sector: 'Otro sector' }))).not.toBe(similarKey(filled()));
  });
});

describe('el borrador de la pestaña', () => {
  it('un formulario nuevo trae su llave (uuid v4) y su clave (80 bits, Crockford), hechas en el navegador', () => {
    const d = newDraft({ type: 'peticion', linkedItemId: null });
    expect(d.submissionKey).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(d.secret).toMatch(SECRET_PATTERN);
    expect(newDraft().secret).not.toBe(d.secret);
    expect(uuidV4(new Uint8Array(16))).toBe('00000000-0000-4000-8000-000000000000');
    expect(d.values.type).toBe('peticion');
    // It remembers what the address chose when it started.
    expect(d.opened).toEqual({ type: 'peticion', linkedItemId: null });
    expect(newDraft().opened).toEqual({ type: null, linkedItemId: null });
    expect(DRAFT_KEY).toMatch(/borrador/);
  });

  it('vuelve tal cual lo escrito (ida y vuelta por JSON)', () => {
    const d = { ...newDraft({ type: 'acotacion', linkedItemId: '44444444-4444-4444-8444-444444444444' }), step: 3 as const, values: filled({ point: { lat: 7.71234, lng: -72.21234 }, locationConsent: true, name: 'Ana' }) };
    const back = parseDraft(JSON.stringify(d));
    expect(back).toMatchObject({ submissionKey: d.submissionKey, secret: d.secret, step: 3, values: d.values, opened: { type: 'acotacion', linkedItemId: '44444444-4444-4444-8444-444444444444' } });
  });

  it('lo raro se descarta: JSON roto, sin llave, clave mala, muy viejo; y campo por campo, lo que no cabe', () => {
    const d = newDraft();
    expect(parseDraft('{no es json')).toBeNull();
    expect(parseDraft(JSON.stringify({ ...d, submissionKey: 'x' }))).toBeNull();
    expect(parseDraft(JSON.stringify({ ...d, secret: 'corta' }))).toBeNull();
    expect(parseDraft(JSON.stringify({ ...d, savedAt: '2020-01-01T00:00:00Z' }))).toBeNull();
    const odd = parseDraft(
      JSON.stringify({
        ...d,
        step: 9,
        values: { type: 'otra', categoryId: '<script>', title: 'x'.repeat(500), point: { lat: 200, lng: 0 }, locationConsent: true, channel: 'paloma', linkedItemId: 'no' },
        opened: { type: 'otra', linkedItemId: '<b>' },
        receipt: { reference: 'AC-2026-<b>', type: 'reporte' },
      }),
    )!;
    expect(odd.step).toBe(1);
    expect(odd.values).toMatchObject({ type: '', categoryId: '', point: null, locationConsent: false, channel: '', linkedItemId: null });
    expect(odd.values.title).toHaveLength(140);
    expect(odd.opened).toEqual({ type: null, linkedItemId: null });
    expect(odd.receipt).toBeNull();
    // A draft kept before «opened» existed (or with something else there): opened with no choice.
    for (const opened of [undefined, null, 'denuncia', 7]) expect(parseDraft(JSON.stringify({ ...d, opened }))?.opened).toEqual({ type: null, linkedItemId: null });
  });

  it('el comprobante se recuerda con la clave del borrador; tras recargar, lo que no subió se da por perdido', () => {
    const d = newDraft();
    const receipt = {
      reference: 'AC-2026-K7QM2H', secret: 'otra', kind: 'request', sentAt: '2026-11-06T10:00:00Z', type: 'reporte', emailNote: false, saved: false,
      files: [
        { id: 'a', name: 'a.jpg', size: 10, status: 'done' },
        { id: 'b', name: 'b.jpg', size: 10, status: 'uploading' },
        { id: 'c', name: 'c.pdf', size: 10, status: 'failed', error: 'x' },
      ],
    };
    const back = parseDraft(JSON.stringify({ ...d, receipt }))!;
    expect(back.receipt).toMatchObject({ reference: 'AC-2026-K7QM2H', secret: d.secret, kind: 'request' });
    expect(filesAfterReload(back.receipt!.files).map((f) => f.status)).toEqual(['done', 'lost', 'lost']);
  });

  it('un borrador sin nada escrito no se ofrece para seguir: el tipo solo no es algo escrito', () => {
    expect(hasContent(emptyValues({ type: 'reporte' }))).toBe(false);
    // A kind ticked by hand is not something written either (it used to count when it was not the address's).
    expect(hasContent(emptyValues({ type: 'denuncia' }))).toBe(false);
    expect(hasContent({ ...emptyValues({ type: 'reporte' }), linkedItemId: '44444444-4444-4444-8444-444444444444', anonymous: true, privacyAccepted: true })).toBe(false);
    expect(hasContent({ ...emptyValues({ type: 'reporte' }), sector: 'Centro' })).toBe(true);
    expect(hasContent({ ...emptyValues({ type: 'peticion' }), categoryId: CAT })).toBe(true);
    expect(hasContent({ ...emptyValues(), point: { lat: 7.7, lng: -72.2 } })).toBe(true);
  });
});

describe('al llegar al formulario: el borrador de la pestaña o uno nuevo', () => {
  const LINK_A = '55555555-5555-4555-8555-555555555555';
  const LINK_B = '66666666-6666-4666-8666-666666666666';
  const preset = (type: Draft['values']['type'] | null, linkedItemId: string | null = null) => ({ type: type || null, linkedItemId });
  const written = (over: Partial<FormValues> = {}): Draft => ({ ...newDraft(), step: 2, values: { ...emptyValues({ type: 'peticion' }), categoryId: CAT, sector: 'Sector escrito (prueba)', ...over } });
  // As the tab keeps it: through JSON and the field-by-field check.
  const stored = (d: Draft) => parseDraft(JSON.stringify(d));

  it('el tipo del enlace gana: un borrador con solo «Denuncia» no vuelve en la página de la petición (ni en ninguna)', () => {
    const onlyType = stored(newDraft({ type: 'denuncia', linkedItemId: null }));
    expect(onlyType).not.toBeNull();
    expect(resumeDraft(onlyType, preset('peticion'))).toBeNull();
    expect(resumeDraft(onlyType, preset('denuncia'))).toBeNull();
    expect(resumeDraft(onlyType, preset(null))).toBeNull();
    expect(resumeDraft(null, preset('peticion'))).toBeNull();
  });

  it('lo escrito para un tipo no vuelve en el formulario de otro tipo', () => {
    const denuncia = stored(written({ type: 'denuncia', title: 'Un hecho escrito (prueba)' }));
    expect(resumeDraft(denuncia, preset('peticion'))).toBeNull();
    expect(resumeDraft(denuncia, preset('reporte'))).toBeNull();
  });

  it('lo escrito vuelve, tal cual y con su llave y su clave, al abrir el mismo tipo (o el formulario sin tipo)', () => {
    const d = written();
    const back = resumeDraft(stored(d), preset('peticion'));
    expect(back).toMatchObject({ submissionKey: d.submissionKey, secret: d.secret, step: 2, values: d.values });
    expect(resumeDraft(stored(d), preset(null))).toMatchObject({ submissionKey: d.submissionKey, values: { type: 'peticion', sector: 'Sector escrito (prueba)' } });
  });

  it('lo escrito sobre una publicación no vuelve en el formulario sobre otra; sin publicación en la dirección, sí', () => {
    const aboutA = stored(written({ type: 'acotacion', linkedItemId: LINK_A }));
    expect(resumeDraft(aboutA, preset('acotacion', LINK_B))).toBeNull();
    expect(resumeDraft(aboutA, preset('acotacion', LINK_A))).toMatchObject({ values: { linkedItemId: LINK_A } });
    expect(resumeDraft(aboutA, preset('acotacion'))).toMatchObject({ values: { linkedItemId: LINK_A } });
    // Written about no item in a form opened without one: the form about an item is another one (the link wins).
    expect(resumeDraft(stored(written({ type: 'acotacion', linkedItemId: null })), preset('acotacion', LINK_A))).toBeNull();
    // A draft that dropped its item («Quitar») on the page about A: opening that page again gives the form about A (the
    // link wins); the page coming back as it was left (a reload) brings the draft back as it was.
    const dropped = stored({ ...written({ type: 'acotacion', linkedItemId: null }), opened: { type: 'acotacion', linkedItemId: LINK_A } });
    expect(resumeDraft(dropped, preset('acotacion', LINK_A))).toBeNull();
    expect(resumeDraft(dropped, preset('acotacion', LINK_A), true)).toMatchObject({ values: { linkedItemId: null } });
    expect(resumeDraft(dropped, preset('acotacion', LINK_B), true)).toBeNull();
  });

  it('el tipo cambiado a mano: al abrir otra vez el enlace, gana el enlace; solo al recargar esa página vuelve lo escrito', () => {
    // Opened from the denuncia's link, «Petición» ticked by hand, then written.
    const switched = stored({ ...written({ type: 'peticion' }), opened: { type: 'denuncia', linkedItemId: null } });
    // The denuncia's link opened again (a link of the site, the address typed or followed): the denuncia's form.
    expect(resumeDraft(switched, preset('denuncia'))).toBeNull();
    // That page coming back as it was left (a reload, Back or Forward): the petición, as written.
    expect(resumeDraft(switched, preset('denuncia'), true)).toMatchObject({ values: { type: 'peticion', sector: 'Sector escrito (prueba)' } });
    // Its own kind, and the form without a kind, bring it back any time, and then it is on that page.
    expect(resumeDraft(switched, preset('peticion'))).toMatchObject({ values: { type: 'peticion' }, opened: { type: 'peticion', linkedItemId: null } });
    expect(resumeDraft(switched, preset(null))).toMatchObject({ opened: { type: null, linkedItemId: null } });
    expect(resumeDraft(switched, preset('reporte'), true)).toBeNull();
    // Kept by an older version (no «opened»): only its own kind brings it back.
    const legacy = JSON.parse(JSON.stringify(written({ type: 'denuncia', title: 'Un hecho escrito (prueba)' })));
    delete legacy.opened;
    expect(resumeDraft(parseDraft(JSON.stringify(legacy)), preset('denuncia'))).not.toBeNull();
    expect(resumeDraft(parseDraft(JSON.stringify(legacy)), preset('peticion'), true)).toBeNull();
  });

  it('de la petición a «Denuncia» a mano: «Hacer una petición» otra vez da la petición, y lo escrito queda para la denuncia', () => {
    const toDenuncia = stored({ ...written({ type: 'denuncia', title: 'Un hecho escrito (prueba)' }), opened: { type: 'peticion', linkedItemId: null } })!;
    // Before another form takes its place, a reload of the petición's page brings back what was on it.
    expect(resumeDraft(toDenuncia, preset('peticion'), true)).toMatchObject({ values: { type: 'denuncia' } });
    // Opened again: the petición's form, nothing of the denuncia.
    expect(resumeDraft(toDenuncia, preset('peticion'))).toBeNull();
    // That new form sets the draft aside (the same draft, on no page): a reload of the petición's page, which now shows
    // the petición, does not bring it back; the denuncia's link does.
    const aside = stored(setAside(toDenuncia))!;
    expect(aside).toEqual({ ...toDenuncia, opened: { type: 'denuncia', linkedItemId: null } });
    expect(resumeDraft(aside, preset('peticion'), true)).toBeNull();
    expect(resumeDraft(aside, preset('denuncia'))).toMatchObject({ submissionKey: toDenuncia.submissionKey, values: { type: 'denuncia', title: 'Un hecho escrito (prueba)' } });
    expect(setAside(stored(written({ type: 'acotacion', linkedItemId: LINK_A }))!).opened).toEqual({ type: 'acotacion', linkedItemId: LINK_A });
  });

  it('un comprobante vuelve siempre (su código y su clave no se pueden pedir otra vez), con lo que no subió dado por perdido', () => {
    const d = newDraft({ type: 'denuncia', linkedItemId: null });
    const receipt = {
      reference: 'AC-2026-K7QM2H', secret: d.secret, kind: 'request' as const, sentAt: '2026-11-06T10:00:00Z', type: 'denuncia' as const, emailNote: false, saved: false,
      files: [{ id: 'a', name: 'a.jpg', size: 10, status: 'uploading' as const }],
    };
    const back = resumeDraft(stored({ ...d, values: emptyValues({ type: 'denuncia' }), receipt }), preset('peticion'));
    expect(back?.receipt).toMatchObject({ reference: 'AC-2026-K7QM2H', files: [{ id: 'a', status: 'lost' }] });
  });

  it('se guarda en la pestaña solo lo que vale la pena: un comprobante o algo escrito', () => {
    expect(worthKeeping(newDraft({ type: 'denuncia', linkedItemId: null }))).toBe(false);
    expect(worthKeeping(written())).toBe(true);
    expect(worthKeeping({ receipt: { reference: 'AC-2026-K7QM2H' } as Draft['receipt'], values: emptyValues({ type: 'reporte' }) })).toBe(true);
  });
});

describe('la página del formulario que vuelve como se dejó (recargar, atrás o adelante)', () => {
  const FORM = 'http://localhost:3000/atencion/nueva?tipo=peticion';
  // The answers of two forms started one after the other in a page load with this navigation timing (a fresh module:
  // the first form of a page load).
  async function twoForms(entries: { type: string; name: string }[], href = FORM) {
    vi.resetModules();
    vi.stubGlobal('location', { href });
    const timing = vi.spyOn(performance, 'getEntriesByType').mockReturnValue(entries as unknown as PerformanceEntryList);
    try {
      const { formCameBack } = await import('@/components/participation/draft-storage');
      return [formCameBack(), formCameBack()];
    } finally {
      timing.mockRestore();
      vi.unstubAllGlobals();
    }
  }

  it('solo el primer formulario de una carga que recarga o vuelve a esa misma dirección', async () => {
    expect(await twoForms([{ type: 'reload', name: FORM }])).toEqual([true, false]);
    expect(await twoForms([{ type: 'back_forward', name: FORM }])).toEqual([true, false]);
    // The address typed or followed: a new visit.
    expect(await twoForms([{ type: 'navigate', name: FORM }])).toEqual([false, false]);
    // A reload of another page, then a link of the site to the form: a new visit too.
    expect(await twoForms([{ type: 'reload', name: 'http://localhost:3000/atencion' }])).toEqual([false, false]);
    // Without the browser's timing: never (the address's choice wins).
    expect(await twoForms([])).toEqual([false, false]);
  });
});

describe('ayudas de las páginas', () => {
  it('«?sobre=» acepta solo news:<slug> o project:<slug>', () => {
    expect(parseSobre('news:arranco-la-obra-demo')).toEqual({ kind: 'news', slug: 'arranco-la-obra-demo' });
    expect(parseSobre('project:via-uribante')).toEqual({ kind: 'project', slug: 'via-uribante' });
    for (const bad of ['page:inicio', 'news:', 'news:Mayus', 'news:../x', 'project:a b', 'news:a--b', null, 3, `news:${'a'.repeat(200)}`]) expect(parseSobre(bad)).toBeNull();
    expect(linkedItemPath('news', 'x')).toBe('/actualidad/x');
    expect(linkedItemPath('project', 'y')).toBe('/gestion/y');
  });

  it('contactos: solo los verificados, y enlaces de tres tipos seguros (nunca javascript:)', () => {
    const list = verifiedContacts([
      { label: 'Atención', value: '0276-555 00 00', kind: 'phone', verified: true },
      { label: 'Correo', value: 'atencion@ejemplo.test', kind: 'email', verified: true },
      { label: 'WhatsApp', value: '+58 414 000 0000', kind: 'whatsapp', verified: true },
      { label: 'Sin verificar', value: '0276 111 1111', kind: 'phone', verified: false },
      { label: 'Raro', value: 'javascript:alert(1)', kind: 'web', verified: true },
      { label: 'Web http', value: 'http://ejemplo.test', kind: 'web', verified: true },
      { label: '', value: 'x', verified: true },
      'basura',
    ]);
    expect(list.map((c) => c.label)).toEqual(['Atención', 'Correo', 'WhatsApp', 'Raro', 'Web http']);
    expect(list.map((c) => c.href)).toEqual(['tel:02765550000', 'mailto:atencion@ejemplo.test', 'https://wa.me/584140000000', null, null]);
    expect(verifiedContacts(null)).toEqual([]);
  });

  it('los estados en palabras simples, la historia y las fechas del Táchira', () => {
    for (const s of REQUEST_STATES) expect(STATE_PLAIN[s].label.length).toBeGreaterThan(3);
    expect(timelineLine({ kind: 'state', state: 'requiere_informacion' })).toBe('Pasó a «Requiere información»');
    expect(timelineLine({ kind: 'info_request' })).toBe('Solicitud de información');
    expect(reportsCount(1)).toBe('1 reporte');
    expect(reportsCount(3)).toBe('3 reportes');
    expect(tachiraToday(new Date('2026-11-07T02:30:00Z'))).toBe('2026-11-06');
    expect(dayDate('2026-11-06')).toBe('6 de noviembre de 2026');
  });
});
