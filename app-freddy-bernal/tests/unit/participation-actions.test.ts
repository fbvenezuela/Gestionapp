// The citizen's actions and routes on the public website (src/lib/actions/participation.ts, src/app/api/atencion,
// src/app/(web)/atencion/consultar/…), over the demo database (same migrations, RLS on, invented data): the form's
// schema on the server, the honeypot, Turnstile off and on (Cloudflare mocked), idempotency by the form's key, the
// persistent limit per device, «¿te sumas?» with counts only, the form without JavaScript, the lookup that answers the
// same for anything wrong, the consultation cookie (tampered: nothing), adding information, confirming, and the files:
// checked, cleaned, registered with the receipt, never left behind when the receipt is wrong. Cookies and headers are
// mocked; after() collects its work so the test runs it.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { env } from '@/lib/env';
import { today } from '@/lib/time';
import { generateSecret, SECRET_PATTERN, REFERENCE_PATTERN } from '@/lib/participation/receipt-code';
import { secretDigest } from '@/lib/participation/keys';
import { LOOKUP_COOKIE } from '@/lib/participation/lookup-cookie';
import { localFilesRoot } from '@/lib/storage/local-files';
import { makeTestDb, type TestDb } from '../rls/setup';
import { SECRET, contains, jpegWithGps } from './fixtures/photos';

// The tests stand for the platform's proxy (they write x-real-ip): src/lib/participation/keys.ts trusts it only then.
const h = vi.hoisted(() => ({
  trust: (process.env.TRUST_PROXY_HEADERS = 'true'),
  jar: new Map<string, { value: string; opts?: Record<string, unknown> }>(),
  ip: '203.0.113.1',
  afters: [] as (() => unknown)[],
}));

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-real-ip': h.ip }),
  cookies: async () => ({
    get: (n: string) => (h.jar.has(n) ? { name: n, value: h.jar.get(n)!.value } : undefined),
    set: (n: string, v: string, o?: Record<string, unknown>) => (o?.maxAge === 0 ? h.jar.delete(n) : h.jar.set(n, { value: v, opts: o })),
    delete: (n: string) => h.jar.delete(n),
  }),
}));
vi.mock('next/server', async (orig) => ({
  ...(await orig<typeof import('next/server')>()),
  after: (fn: () => unknown) => {
    h.afters.push(fn);
  },
}));

let t: TestDb;
let actions: typeof import('@/lib/actions/participation');
let upload: typeof import('@/app/api/atencion/adjuntos/route');
let consultUpload: typeof import('@/app/(web)/atencion/consultar/adjuntos/route');
let download: typeof import('@/app/(web)/atencion/consultar/archivo/[id]/route');
let cat: (slug: string) => string;
let muni: (name: string) => string;

const YEAR = today().year;
const DEMR02 = { reference: `AC-${YEAR}-DEMR02`, secret: 'R3PS-W8N2-DEMV-7QKA' };
const DEMR03 = { reference: `AC-${YEAR}-DEMR03`, secret: 'H4JX-5ZTB-9CNF-W2YE' };
const NOT_FOUND = 'No encontramos una solicitud con esos datos.';
let ipCounter = 10;

beforeAll(async () => {
  t = await makeTestDb({ webContent: true });
  (globalThis as { __fbBackend?: Promise<unknown> }).__fbBackend = Promise.resolve(t.backend);
  actions = await import('@/lib/actions/participation');
  upload = await import('@/app/api/atencion/adjuntos/route');
  consultUpload = await import('@/app/(web)/atencion/consultar/adjuntos/route');
  download = await import('@/app/(web)/atencion/consultar/archivo/[id]/route');
  const cats = await t.system((sql) => sql.query<{ slug: string; id: string }>(`select slug, id from public.request_categories`));
  const munis = await t.system((sql) => sql.query<{ name: string; id: string }>(`select name, id from public.territories where kind = 'municipality'`));
  cat = (slug) => cats.find((c) => c.slug === slug)!.id;
  muni = (name) => munis.find((m) => m.name === name)!.id;
}, 120_000);

// Every test: a new browser (no cookies) on a network of its own, so the persistent limits of one never touch another.
beforeEach(() => {
  h.jar.clear();
  h.afters.length = 0;
  h.ip = `203.0.113.${ipCounter++}`;
});
afterEach(() => vi.unstubAllGlobals());

const runAfters = async () => {
  for (const fn of h.afters.splice(0)) await fn();
};
const sys = <T>(q: string, p: unknown[] = []) => t.system((sql) => sql.one<T>(q, p));
const receipt = () => ({ submissionKey: crypto.randomUUID(), secret: generateSecret() });

function report(over: Record<string, unknown> = {}) {
  return {
    type: 'reporte',
    categoryId: cat('agua'),
    title: 'Bote de agua en la esquina (prueba)',
    description: 'Sale agua limpia de la tubería desde ayer y se pierde por la cuneta (prueba).',
    municipalityId: muni('Torbes'),
    parishId: null,
    sector: `Sector de prueba ${crypto.randomUUID().slice(0, 8)}`,
    locationReference: 'Frente a la bodega (prueba)',
    eventDate: null,
    point: null,
    locationConsent: false,
    anonymous: false,
    publishNameConsent: false,
    linkedItemId: null,
    contact: { name: 'Ana Prueba', email: 'ana.prueba@demo.test', phone: '', channel: 'email' },
    privacyAccepted: true,
    ...over,
  };
}

describe('enviar una solicitud', () => {
  it('se guarda como anon con el resumen de la clave (nunca la clave) y el contacto cifrado; el correo lleva el código, no la clave', async () => {
    const r0 = receipt();
    const r = await actions.sendRequest({ ...r0, input: report() });
    expect(r).toMatchObject({ ok: true, kind: 'request' });
    const ok = r as Extract<typeof r, { ok: true }>;
    expect(ok.reference).toMatch(REFERENCE_PATTERN);
    expect(JSON.stringify(r)).not.toContain(r0.secret);
    // The demo writes it to the outbox only: the receipt never says «Te enviamos un correo».
    expect(ok.emailed).toBe(false);
    // The device cookie: first party, httpOnly, a year.
    expect(h.jar.get('fb_dispositivo')?.opts).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });
    const row = (await sys<{ secret_digest: string; title: string; name_enc: string | null; email_enc: string | null }>(
      `select r.secret_digest, r.title, c.name_enc, c.email_enc from public.requests r left join public.request_contacts c on c.request_id = r.id where r.reference = $1`,
      [ok.reference],
    ))!;
    expect(row.secret_digest).toBe(secretDigest(r0.secret));
    expect(row.name_enc).toMatch(/^demo:/);
    expect(row.name_enc).not.toContain('Ana');
    expect(row.email_enc).not.toContain('ana.prueba');
    await runAfters();
    const mail = (await sys<{ to_email: string; subject: string; html: string; text_body: string }>(
      `select to_email, subject, html, text_body from public.outbox where idempotency_key = $1`,
      [`atencion-recibida:${ok.reference}`],
    ))!;
    expect(mail.to_email).toBe('ana.prueba@demo.test');
    expect(mail.subject).toContain(ok.reference);
    expect(mail.text_body).toContain(ok.reference);
    expect(`${mail.html}${mail.text_body}`).not.toContain(r0.secret);
    expect(mail.text_body).toMatch(/no es un servicio de emergencias/i);
  });

  it('el correo de confirmación sale solo si el correo está configurado para entregarse (en la demo, al buzón de salida)', async () => {
    const { confirmationPlan } = await import('@/lib/actions/participation-core');
    const yes = () => true;
    const no = () => false;
    expect(confirmationPlan('', 'supabase', yes)).toEqual({ queue: false, delivers: false });
    // Production without email set up to send: nothing written (no address in the clear in the outbox for nothing).
    expect(confirmationPlan('ana@ejemplo.com', 'supabase', no)).toEqual({ queue: false, delivers: false });
    expect(confirmationPlan('ana@ejemplo.com', 'supabase', yes)).toEqual({ queue: true, delivers: true });
    // The demo: invented data, the outbox stands in for the inbox; it never says it was delivered.
    expect(confirmationPlan('ana.prueba@demo.test', 'demo', no)).toEqual({ queue: true, delivers: false });
  });

  it('sin correo no hay correo de confirmación', async () => {
    const r = await actions.sendRequest({ ...receipt(), input: report({ anonymous: true, contact: null }) });
    expect(r.ok).toBe(true);
    expect(h.afters).toHaveLength(0);
  });

  it('«que no me contacten» se respeta: con correo y canal «ninguno», no sale el correo de confirmación', async () => {
    const r = await actions.sendRequest({ ...receipt(), input: report({ contact: { name: 'Ana Prueba', email: 'ana.prueba@demo.test', phone: '', channel: 'none' } }) });
    expect(r.ok).toBe(true);
    expect(h.afters).toHaveLength(0);
  });

  it('sobre un contenido publicado guarda a qué se refiere; uno sin publicar se rechaza con su motivo', async () => {
    const live = (await sys<{ id: string }>(`select id from public.web_items where kind = 'project' and slug = 'rehabilitacion-avenida-principal-demo'`))!;
    const draft = (await sys<{ id: string }>(`select id from public.web_items where kind = 'news' and slug = 'balance-del-mes-demo'`))!;
    const ok = await actions.sendRequest({ ...receipt(), input: report({ type: 'acotacion', linkedItemId: live.id, anonymous: true, contact: null }) });
    expect(ok).toMatchObject({ ok: true });
    const row = (await sys<{ linked_item_id: string }>(`select linked_item_id from public.requests where reference = $1`, [(ok as { reference: string }).reference]))!;
    expect(row.linked_item_id).toBe(live.id);
    const refused = await actions.sendRequest({ ...receipt(), input: report({ type: 'acotacion', linkedItemId: draft.id, anonymous: true, contact: null }) });
    expect(refused).toMatchObject({ ok: false, error: 'El contenido al que se refiere ya no está publicado.' });
  });

  it('el mismo envío dos veces (un reintento) da el mismo código y una sola fila; otra clave con la misma llave no crea nada', async () => {
    const r0 = receipt();
    const input = report();
    const a = await actions.sendRequest({ ...r0, input });
    const b = await actions.sendRequest({ ...r0, input });
    expect(a).toMatchObject({ ok: true });
    expect((b as { reference: string }).reference).toBe((a as { reference: string }).reference);
    const other = await actions.sendRequest({ submissionKey: r0.submissionKey, secret: generateSecret(), input });
    expect(other.ok).toBe(false);
    const n = await sys<{ n: number }>(`select count(*)::int as n from public.requests where submission_key = $1`, [r0.submissionKey]);
    expect(n!.n).toBe(1);
  });

  it('el servidor revisa con el mismo esquema del formulario: errores por campo y nada se guarda', async () => {
    const r0 = receipt();
    const cases: [Record<string, unknown>, string][] = [
      [{ title: '' }, 'title'],
      [{ municipalityId: null }, 'municipalityId'],
      [{ type: 'denuncia', locationReference: 'Frente a la casa' }, 'locationReference'],
      [{ point: { lat: 7.7, lng: -72.2 }, locationConsent: false }, 'locationConsent'],
      [{ anonymous: true }, 'anonymous'],
      [{ eventDate: '2999-01-01' }, 'eventDate'],
      [{ privacyAccepted: false }, 'privacyAccepted'],
      [{ contact: { name: '', email: '', phone: '', channel: 'email' } }, 'contact'],
    ];
    for (const [over, field] of cases) {
      const r = await actions.sendRequest({ ...r0, input: report(over) });
      expect(r, field).toMatchObject({ ok: false, code: 'validation' });
      expect((r as { fieldErrors?: Record<string, string> }).fieldErrors?.[field], field).toBeTruthy();
    }
    expect(await sys(`select 1 from public.requests where submission_key = $1`, [r0.submissionKey])).toBeNull();
    // Without the receipt's keys nothing is sent either.
    expect(await actions.sendRequest({ input: report() })).toMatchObject({ ok: false, code: 'validation' });
    expect(await actions.sendRequest({ submissionKey: r0.submissionKey, secret: 'no-es-una-clave', input: report() })).toMatchObject({ ok: false });
  });

  it('el campo trampa lleno (un robot) no envía nada', async () => {
    const r0 = receipt();
    expect(await actions.sendRequest({ ...r0, hp: 'https://spam.example', input: report() })).toMatchObject({ ok: false, code: 'honeypot' });
    expect(await sys(`select 1 from public.requests where submission_key = $1`, [r0.submissionKey])).toBeNull();
  });

  it('Turnstile: apagado sin claves; encendido, sin ficha o con una mala no envía, con una buena sí (Cloudflare simulado)', async () => {
    const before = { ...env.turnstile };
    const fetchMock = vi.fn(async (_url: unknown, init?: { body?: URLSearchParams }) => {
      const ok = init?.body?.get('response') === 'ficha-buena';
      return new Response(JSON.stringify({ success: ok }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      expect(await actions.sendRequest({ ...receipt(), input: report() })).toMatchObject({ ok: true });
      expect(fetchMock).not.toHaveBeenCalled();
      Object.assign(env.turnstile, { siteKey: 'sitio-de-prueba', secretKey: 'secreto-de-prueba' });
      const r0 = receipt();
      expect(await actions.sendRequest({ ...r0, input: report() })).toMatchObject({ ok: false, code: 'turnstile' });
      expect(await actions.sendRequest({ ...r0, turnstileToken: 'ficha-mala', input: report() })).toMatchObject({ ok: false, code: 'turnstile' });
      expect(await sys(`select 1 from public.requests where submission_key = $1`, [r0.submissionKey])).toBeNull();
      expect(await actions.sendRequest({ ...r0, turnstileToken: 'ficha-buena', input: report() })).toMatchObject({ ok: true });
      const sent = fetchMock.mock.calls.at(-1)!;
      expect(String(sent[0])).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
      expect((sent[1] as { body: URLSearchParams }).body.get('secret')).toBe('secreto-de-prueba');
      expect((sent[1] as { body: URLSearchParams }).body.get('remoteip')).toBe(h.ip);
    } finally {
      Object.assign(env.turnstile, before);
    }
  });

  it('límite persistente: el sexto envío seguido desde el mismo teléfono se rechaza con un mensaje claro', async () => {
    for (let i = 0; i < 5; i++) expect(await actions.sendRequest({ ...receipt(), input: report() }), `envío ${i + 1}`).toMatchObject({ ok: true });
    const sixth = await actions.sendRequest({ ...receipt(), input: report() });
    expect(sixth).toMatchObject({ ok: false, code: 'rate' });
    expect((sixth as { error: string }).error).toMatch(/muchos intentos/i);
    // A reply to the same form (a retry) still gets its receipt: idempotency comes before the limit.
  });
});

describe('¿ya lo reportaron? y ¿te sumas?', () => {
  const place = () => ({ categoryId: cat('vialidad'), municipalityId: muni('San Cristóbal'), parishId: null, sector: 'Sector centro (demo)', point: null });

  it('cuenta los reportes abiertos del mismo problema en el mismo sitio, sin ids, textos ni nombres', async () => {
    const r = await actions.checkSimilar(place());
    expect(r).toEqual({ ok: true, count: expect.any(Number) });
    expect((r as { count: number }).count).toBeGreaterThanOrEqual(1);
    expect(Object.keys(r).sort()).toEqual(['count', 'ok']);
    expect(await actions.checkSimilar({ ...place(), sector: 'Un sector que no existe (prueba)' })).toEqual({ ok: true, count: 0 });
    expect(await actions.checkSimilar({ categoryId: 'no' })).toEqual({ ok: false });
  });

  it('sumarse da un código propio que sigue el caso, sin el título ni el texto de la otra persona', async () => {
    const r0 = receipt();
    const joined = await actions.joinReport({ ...r0, place: place(), note: 'También me pasó (prueba).', anonymous: true, contact: null, privacyAccepted: true });
    expect(joined).toMatchObject({ ok: true, kind: 'support' });
    const ref = (joined as { reference: string }).reference;
    expect(await actions.joinReport({ ...r0, place: place(), anonymous: true, contact: null, privacyAccepted: true })).toMatchObject({ reference: ref });
    const fd = new FormData();
    fd.set('reference', ref);
    fd.set('secret', r0.secret);
    expect(await actions.openCase(null, fd)).toBeNull();
    // The view behind the cookie: a support, never the original's title or description.
    const { lookupRequest, receiptGrant } = await import('@/lib/web/participation');
    const { withAnon } = await import('@/lib/db');
    const view = await withAnon((sql) => lookupRequest(sql, receiptGrant(ref, r0.secret)!, { deviceKey: 'a'.repeat(64), ipKey: 'b'.repeat(64) }));
    expect(view).toMatchObject({ status: 'ok', kind: 'support' });
    expect(JSON.stringify(view)).not.toContain('Hueco grande');
    // Without the privacy notice, nothing.
    expect(await actions.joinReport({ ...receipt(), place: place(), anonymous: true, contact: null, privacyAccepted: false })).toMatchObject({ ok: false, code: 'validation' });
  });
});

describe('el formulario sin JavaScript', () => {
  function form(key: string, over: Record<string, string> = {}) {
    const fd = new FormData();
    const fields: Record<string, string> = {
      submissionKey: key, type: 'peticion', categoryId: cat('salud'), municipalityId: muni('Junín'), sector: 'Sector rural (prueba)',
      title: 'Jornada de vacunación (prueba)', description: 'Pedimos una jornada de vacunación para los niños del sector (prueba).',
      anonymous: 'on', privacyAccepted: 'on', ...over,
    };
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    return fd;
  }

  it('el servidor hace la clave; el mismo formulario otra vez da el mismo comprobante; desde otro teléfono no da nada', async () => {
    const key = crypto.randomUUID();
    const a = await actions.sendRequestWithoutJs(null, form(key));
    expect(a).toMatchObject({ status: 'sent', kind: 'request' });
    const sent = a as Extract<typeof a, { status: 'sent' }>;
    expect(sent.secret).toMatch(SECRET_PATTERN);
    expect(sent.reference).toMatch(REFERENCE_PATTERN);
    const b = await actions.sendRequestWithoutJs(null, form(key));
    expect(b).toMatchObject({ status: 'sent', reference: sent.reference, secret: sent.secret });
    h.jar.clear();
    const other = await actions.sendRequestWithoutJs(null, form(key));
    expect(other).toMatchObject({ status: 'error' });
    expect(JSON.stringify(other)).not.toContain(sent.secret);
    expect(JSON.stringify(other)).not.toContain(sent.reference);
  });

  it('los errores vuelven por campo, con lo que la persona escribió (nunca una clave)', async () => {
    const r = await actions.sendRequestWithoutJs(null, form(crypto.randomUUID(), { title: 'x', privacyAccepted: '' }));
    expect(r).toMatchObject({ status: 'error', values: { title: 'x', type: 'peticion' } });
    const e = r as Extract<typeof r, { status: 'error' }>;
    expect(e.fieldErrors?.title).toBeTruthy();
    expect(e.fieldErrors?.privacyAccepted).toBeTruthy();
    expect(await actions.sendRequestWithoutJs(null, form(crypto.randomUUID(), { sitio_web: 'spam' }))).toMatchObject({ status: 'error' });
    expect(await actions.sendRequestWithoutJs(null, form('no-es-uuid'))).toMatchObject({ status: 'error' });
  });
});

describe('consultar mi solicitud', () => {
  const lookup = (reference: string, secret: string) => {
    const fd = new FormData();
    fd.set('reference', reference);
    fd.set('secret', secret);
    return actions.openCase(null, fd);
  };

  it('clave mala, código alterado o mal escrito: la misma respuesta, sin pistas', async () => {
    const answers = [
      await lookup(DEMR03.reference, 'ZZZZ-ZZZZ-ZZZZ-ZZZZ'),
      await lookup(DEMR03.reference.replace(/.$/, (c) => (c === '1' ? '2' : '1')), DEMR03.secret),
      await lookup(`AC-${YEAR}-ZZZZZZ`, DEMR03.secret),
      await lookup('hola', DEMR03.secret),
      await lookup(DEMR03.reference, 'corta'),
    ];
    for (const a of answers) expect(a).toEqual({ status: 'error', error: NOT_FOUND, reference: expect.any(String) });
    expect(h.jar.has(LOOKUP_COOKIE)).toBe(false);
    // Empty fields say which one is missing (that reveals nothing).
    expect(await lookup('', '')).toMatchObject({ status: 'error', fieldErrors: { reference: expect.any(String), secret: expect.any(String) } });
  });

  it('con los datos buenos abre una consulta corta: cookie cifrada, httpOnly, estricta y solo bajo /atencion/consultar', async () => {
    expect(await lookup(DEMR03.reference.toLowerCase().replace(/-/g, ' '), DEMR03.secret.toLowerCase())).toBeNull();
    const c = h.jar.get(LOOKUP_COOKIE)!;
    expect(c.opts).toMatchObject({ httpOnly: true, sameSite: 'strict', path: '/atencion/consultar', maxAge: 1800 });
    expect(c.value).not.toContain(DEMR03.reference);
    expect(c.value).not.toContain(DEMR03.secret);
    await actions.closeCase();
    expect(h.jar.has(LOOKUP_COOKIE)).toBe(false);
  });

  it('una cookie alterada no abre nada: ni mensajes ni archivos', async () => {
    await lookup(DEMR03.reference, DEMR03.secret);
    const c = h.jar.get(LOOKUP_COOKIE)!;
    const flipped = c.value.slice(0, 20) + (c.value[20] === 'A' ? 'B' : 'A') + c.value.slice(21);
    h.jar.set(LOOKUP_COOKIE, { value: flipped });
    const fd = new FormData();
    fd.set('body', 'Hola (prueba)');
    expect(await actions.addCaseInfo(null, fd)).toMatchObject({ status: 'error', expired: true });
    const anyFile = (await sys<{ id: string }>(`select id from public.request_attachments order by created_at limit 1`))!;
    const res = await download.GET(new NextRequest(`http://localhost/atencion/consultar/archivo/${anyFile.id}`), { params: Promise.resolve({ id: anyFile.id }) });
    expect(res.status).toBe(404);
  });

  it('agregar información queda en la línea de tiempo; un caso que pedía información vuelve a revisión', async () => {
    expect(await lookup(DEMR03.reference, DEMR03.secret)).toBeNull();
    const fd = new FormData();
    fd.set('body', 'Las lámparas están frente a la cancha (prueba).');
    const r = await actions.addCaseInfo(null, fd);
    expect(r).toMatchObject({ status: 'ok', messageId: expect.any(String) });
    const row = (await sys<{ state: string; body: string }>(
      `select r.state, m.body from public.requests r join public.request_messages m on m.request_id = r.id where r.reference = $1 and m.kind = 'citizen_message' order by m.created_at desc limit 1`,
      [DEMR03.reference],
    ))!;
    expect(row).toEqual({ state: 'en_revision', body: 'Las lámparas están frente a la cancha (prueba).' });
    const empty = new FormData();
    empty.set('body', '   ');
    expect(await actions.addCaseInfo(null, empty)).toMatchObject({ status: 'error', fieldErrors: { body: expect.any(String) } });
  });

  it('«¿se resolvió?»: el «no» pide qué falta y reabre con su registro; no se confirma dos veces', async () => {
    expect(await lookup(DEMR02.reference, DEMR02.secret)).toBeNull();
    const no = new FormData();
    no.set('resolved', 'no');
    expect(await actions.confirmCase(null, no)).toMatchObject({ status: 'error', fieldErrors: { comment: expect.any(String) } });
    no.set('comment', 'Sigue saliendo agua en la esquina (prueba).');
    expect(await actions.confirmCase(null, no)).toEqual({ status: 'ok', state: 'en_atencion' });
    const events = await t.system((sql) =>
      sql.query<{ kind: string }>(`select e.kind from public.request_events e join public.requests r on r.id = e.request_id where r.reference = $1 order by e.created_at desc limit 2`, [DEMR02.reference]),
    );
    expect(events.map((e) => e.kind).sort()).toEqual(['citizen_not_resolved', 'state']);
    const again = new FormData();
    again.set('resolved', 'si');
    expect(await actions.confirmCase(null, again)).toMatchObject({ status: 'error', error: expect.stringMatching(/no está esperando/) });
  });
});

describe('los archivos', () => {
  const privateFiles = () => {
    const dir = path.join(localFilesRoot(), 'participacion-privado');
    return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => !f.endsWith('.tmp')).length : 0;
  };
  function post(url: string, fields: Record<string, string | File>, origin = 'http://localhost') {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    return new NextRequest(url, { method: 'POST', body: fd, headers: { origin } });
  }
  const photo = () => new File([jpegWithGps()], 'foto del hueco.jpg', { type: 'image/jpeg' });

  it('después de enviar: con el comprobante se guarda limpia (sin GPS); con una clave mala, 404 y nada queda guardado', async () => {
    const r0 = receipt();
    const sent = (await actions.sendRequest({ ...r0, input: report({ anonymous: true, contact: null }) })) as { reference: string };
    const res = await upload.POST(post('http://localhost/api/atencion/adjuntos', { reference: sent.reference, secret: r0.secret, file: photo() }));
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    const body = (await res.json()) as { ok: boolean; id: string };
    expect(body.ok).toBe(true);
    const row = (await sys<{ storage_key: string; scan_status: string; kind: string; message_id: string | null }>(
      `select storage_key, scan_status, kind, message_id from public.request_attachments where id = $1`,
      [body.id],
    ))!;
    expect(row).toMatchObject({ scan_status: 'sin_analizar', kind: 'citizen', message_id: null });
    const stored = fs.readFileSync(path.join(localFilesRoot(), 'participacion-privado', row.storage_key));
    expect(contains(stored, SECRET)).toBe(false);
    expect(h.afters.length).toBe(1); // the scan, after the response
    await runAfters();

    const before = privateFiles();
    const wrong = await upload.POST(post('http://localhost/api/atencion/adjuntos', { reference: sent.reference, secret: generateSecret(), file: photo() }));
    expect(wrong.status).toBe(404);
    expect(await wrong.json()).toEqual({ ok: false, error: NOT_FOUND });
    expect(privateFiles()).toBe(before);
    const malformed = await upload.POST(post('http://localhost/api/atencion/adjuntos', { reference: 'AC-x', secret: 'y', file: photo() }));
    expect(malformed.status).toBe(404);
  });

  it('en Vercel (el cuerpo de una función llega a 4,5 MB) un archivo va hasta 4 MB, y se dice antes de leerlo', async () => {
    const { maxAttachmentBytes } = await import('@/lib/actions/participation-core');
    expect(maxAttachmentBytes(undefined)).toBe(8 * 1024 * 1024);
    expect(maxAttachmentBytes('1')).toBe(4 * 1024 * 1024);
    vi.stubEnv('VERCEL', '1');
    try {
      const big = new File([new Uint8Array(5 * 1024 * 1024)], 'grande.pdf', { type: 'application/pdf' });
      const res = await upload.POST(post('http://localhost/api/atencion/adjuntos', { reference: `AC-${YEAR}-DEMR03`, secret: DEMR03.secret, file: big }));
      expect(res.status).toBe(413);
      expect(((await res.json()) as { error: string }).error).toBe('El archivo pasa de 4 MB: manda uno más liviano.');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('tipo falso, otro sitio y el cuarto archivo de un envío se rechazan', async () => {
    const r0 = receipt();
    const sent = (await actions.sendRequest({ ...r0, input: report({ anonymous: true, contact: null }) })) as { reference: string };
    const url = 'http://localhost/api/atencion/adjuntos';
    const fake = new File([new TextEncoder().encode('MZ esto es un programa')], 'foto.jpg', { type: 'image/jpeg' });
    const bad = await upload.POST(post(url, { reference: sent.reference, secret: r0.secret, file: fake }));
    expect(bad.status).toBe(422);
    expect(((await bad.json()) as { error: string }).error).toMatch(/no es lo que dice su nombre/);
    const exe = await upload.POST(post(url, { reference: sent.reference, secret: r0.secret, file: new File([jpegWithGps()], 'virus.exe') }));
    expect(exe.status).toBe(422);
    const cross = await upload.POST(post(url, { reference: sent.reference, secret: r0.secret, file: photo() }, 'https://otro-sitio.example'));
    expect(cross.status).toBe(403);
    for (let i = 0; i < 3; i++) expect((await upload.POST(post(url, { reference: sent.reference, secret: r0.secret, file: photo() }))).status, `archivo ${i + 1}`).toBe(200);
    const before = privateFiles();
    const fourth = await upload.POST(post(url, { reference: sent.reference, secret: r0.secret, file: photo() }));
    expect(fourth.status).toBe(409);
    expect(((await fourth.json()) as { error: string }).error).toMatch(/3 archivos/);
    expect(privateFiles()).toBe(before);
  });

  it('desde la consulta: el archivo va con el mensaje y se descarga mientras la cookie vale; uno de otra solicitud, 404', async () => {
    const fd = new FormData();
    fd.set('reference', DEMR03.reference);
    fd.set('secret', DEMR03.secret);
    expect(await actions.openCase(null, fd)).toBeNull();
    const msg = new FormData();
    msg.set('body', 'Va una foto (prueba).');
    const m = (await actions.addCaseInfo(null, msg)) as { messageId: string };
    const res = await consultUpload.POST(post('http://localhost/atencion/consultar/adjuntos', { messageId: m.messageId, file: photo() }));
    expect(res.status).toBe(200);
    const { id } = (await res.json()) as { id: string };
    expect(await sys(`select 1 as one from public.request_attachments where id = $1 and message_id = $2`, [id, m.messageId])).toEqual({ one: 1 });
    const get = (fileId: string) => download.GET(new NextRequest(`http://localhost/atencion/consultar/archivo/${fileId}`), { params: Promise.resolve({ id: fileId }) });
    const own = await get(id);
    expect(own.status).toBe(200);
    expect(own.headers.get('Content-Type')).toBe('image/jpeg');
    expect(own.headers.get('Content-Disposition')).toMatch(/^attachment; filename="AC-\d{4}-DEMR03-adjunto\.jpg"$/);
    expect(own.headers.get('Cache-Control')).toBe('private, no-store');
    const other = (await sys<{ id: string }>(
      `select a.id from public.request_attachments a join public.requests r on r.id = a.request_id where r.reference <> $1 order by a.created_at limit 1`,
      [DEMR03.reference],
    ))!;
    expect((await get(other.id)).status).toBe(404);
    expect((await get('no-es-un-id')).status).toBe(404);
    await actions.closeCase();
    expect((await get(id)).status).toBe(404);
    const late = await consultUpload.POST(post('http://localhost/atencion/consultar/adjuntos', { file: photo() }));
    expect(late.status).toBe(404);
  });
});
