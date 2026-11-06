// What the public website reads, as the role anon with RLS on (D-96, src/lib/web/public.ts), over the demo's content
// (seed-parts/web.ts): only what is published and live, its filters and search, the frozen photo data, the public
// settings, the redirects, the territories and categories and «lo atendido» (never a request). Then the citizen's way
// in (src/lib/web/participation.ts): send, follow with the receipt typed any way, add information, files, confirm,
// support, the figures; the demo's documented receipts work. Everything invented.
import { describe, expect, it, beforeAll } from 'vitest';
import { asAnon, asSystem } from '@/lib/db/core';
import { makeTestDb, type TestDb } from '../rls/setup';
import { plainSearch, publicAttended, publicRequestCategories, publicSettings, publicTerritories, publishedByIds, publishedBySlug, publishedList, redirectFor } from '@/lib/web/public';
import {
  addCitizenAttachment, addCitizenMessage, citizenAttachment, confirmRequest, lookupRequest, publicRequestStats, receiptGrant, similarRequests,
  submitRequest, supportRequest, type CitizenView,
} from '@/lib/web/participation';
import { contactKeyring, openContact } from '@/lib/participation/contact-crypto';
import { deviceKey, ipKey, newDeviceId } from '@/lib/participation/keys';
import { generateSecret } from '@/lib/participation/receipt-code';
import { requestInput } from '@/lib/participation/input';
import { stableId } from '@/lib/db/seed-parts/web';

let t: TestDb;
const anon = <T>(fn: Parameters<typeof asAnon<T>>[1]) => asAnon(t.backend, fn);
const keys = () => ({ deviceKey: deviceKey(newDeviceId()), ipKey: ipKey(`190.0.2.${Math.floor(Math.random() * 250)}`) });

beforeAll(async () => {
  t = await makeTestDb({ webContent: true });
}, 120_000);

describe('withAnon (D-96)', () => {
  it('corre como el rol anon, sin claims, con RLS: lee lo publicado y nunca una solicitud', async () => {
    (globalThis as { __fbBackend?: Promise<unknown> }).__fbBackend = Promise.resolve(t.backend);
    const { withAnon } = await import('@/lib/db');
    expect(await withAnon((sql) => sql.one(`select current_user::text as who, auth.uid() as uid, auth.role() as role`))).toEqual({ who: 'anon', uid: null, role: 'anon' });
    expect((await withAnon((sql) => publishedList(sql, { kind: 'news' }))).total).toBe(12);
    await expect(withAnon((sql) => sql.query(`select * from public.web_items`))).rejects.toThrow(/permission denied/);
    await expect(withAnon((sql) => sql.query(`select public.is_staff()`))).rejects.toThrow(/permission denied/);
    // Back to normal after each one (a transaction each, like withUser).
    expect(await withAnon((sql) => sql.one(`select current_user::text as who`))).toEqual({ who: 'anon' });
  });
});

describe('lo publicado, como anon', () => {
  it('las noticias publicadas: no las programadas ni los borradores; las más nuevas primero; cuántas hay', async () => {
    const { items, total } = await anon((sql) => publishedList(sql, { kind: 'news', limit: 50 }));
    expect(total).toBe(12);
    expect(items).toHaveLength(12);
    expect(items.every((i) => i.data.title.endsWith('(demo)'))).toBe(true);
    const dates = items.map((i) => i.date!);
    expect([...dates].sort().reverse()).toEqual(dates);
    const slugs = items.map((i) => i.slug);
    expect(slugs).not.toContain('proxima-jornada-de-vacunacion-libertador-demo');
    expect(slugs).not.toContain('balance-del-mes-demo');
    expect(slugs).not.toContain('ferias-de-alimentos-fin-de-semana-demo');
    // Pages of two.
    const page2 = await anon((sql) => publishedList(sql, { kind: 'news', limit: 2, offset: 2 }));
    expect(page2.items.map((i) => i.slug)).toEqual(slugs.slice(2, 4));
    expect(page2.total).toBe(12);
  });

  it('filtros por municipio, categoría, estado y fecha; la búsqueda sin tildes', async () => {
    const sc = (await anon((sql) => publicTerritories(sql))).find((m) => m.name === 'San Cristóbal')!;
    const inSc = await anon((sql) => publishedList(sql, { kind: 'project', municipalityId: sc.id }));
    expect(inSc.items.map((i) => i.slug)).toEqual(['rehabilitacion-avenida-principal-demo']);
    const done = await anon((sql) => publishedList(sql, { kind: 'project', state: 'concluido', limit: 50 }));
    expect(done.total).toBe(5);
    expect(done.items.every((i) => i.data.state === 'concluido')).toBe(true);
    const water = await anon((sql) => publishedList(sql, { kind: 'project', category: 'agua' }));
    expect(water.items.map((i) => i.slug).sort()).toEqual(['planta-potabilizadora-bolivar-demo', 'red-de-tuberias-garcia-de-hevia-demo']);
    const found = await anon((sql) => publishedList(sql, { kind: 'news', q: 'POTABILIZADORA bolívar' }));
    expect(found.items.map((i) => i.slug)).toEqual(['planta-potabilizadora-bolivar-asi-quedo-demo']);
    expect((await anon((sql) => publishedList(sql, { kind: 'news', q: "'; drop table x; --" }))).total).toBe(0);
    const recent = await anon((sql) => publishedList(sql, { kind: 'news', from: new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10) }));
    expect(recent.total).toBeGreaterThanOrEqual(2);
    expect(recent.total).toBeLessThan(12);
    const faqs = await anon((sql) => publishedList(sql, { kind: 'faq', category: 'atencion', order: 'title', limit: 50 }));
    expect(faqs.total).toBe(6);
  });

  it('una obra en vivo con un cambio esperando aprobación: el público ve lo aprobado', async () => {
    const it = await anon((sql) => publishedBySlug(sql, 'project', 'limpieza-canalizacion-quebradas-torbes-demo'));
    expect(it?.data.excerpt).toBe('Cauces limpios antes de las lluvias.');
    const draft = await asSystem(t.backend, (sql) => sql.one<{ status: string; excerpt: string }>(`select status, draft ->> 'excerpt' as excerpt from public.web_items where slug = 'limpieza-canalizacion-quebradas-torbes-demo'`));
    expect(draft).toEqual({ status: 'in_review', excerpt: 'Cauces limpios y muros nuevos antes de las lluvias: va por la mitad.' });
    expect(await anon((sql) => publishedBySlug(sql, 'news', 'balance-del-mes-demo'))).toBeNull();
  });

  it('un documento trae su archivo congelado (clave, tipo, título); las páginas base se publicaron', async () => {
    const doc = await anon((sql) => publishedBySlug(sql, 'document', 'semanario-12-demo'));
    const fileId = (doc!.data as { fileId: string }).fileId;
    expect(doc!.media[fileId]).toMatchObject({ kind: 'document', mime: 'application/pdf', title: 'Semanario n.º 12 (demo)' });
    expect(doc!.media[fileId].key).toMatch(/^[0-9a-f-]{36}\.pdf$/);
    const home = await anon((sql) => publishedBySlug(sql, 'page', 'inicio'));
    const indicators = (home!.data as { blocks: { id: string; data: { ids?: string[] } }[] }).blocks.find((b) => b.id === 'indicadores')!;
    const shown = await anon((sql) => publishedByIds(sql, indicators.data.ids!));
    expect(shown.map((i) => i.kind)).toEqual(['indicator', 'indicator', 'indicator', 'indicator']);
    expect(shown.map((i) => i.data.title)).toEqual(['Viviendas entregadas (demo)', 'Personas atendidas en jornadas de salud (demo)', 'Prótesis entregadas (demo)', 'Obras concluidas (demo)']);
    expect(await anon((sql) => publishedByIds(sql, [stableId('nada'), indicators.data.ids![1]]))).toHaveLength(1);
    for (const slug of ['inicio', 'gobernador', 'atencion', 'aviso-de-privacidad', 'condiciones-de-participacion', 'accesibilidad']) {
      expect(await anon((sql) => publishedBySlug(sql, 'page', slug)), slug).not.toBeNull();
    }
  });

  it('ajustes públicos, redirecciones internas, 29 municipios, 10 categorías y lo atendido sin datos de nadie', async () => {
    const s = await anon((sql) => publicSettings(sql));
    expect(s['site.demo_banner']).toBe('Versión de prueba: el contenido es inventado.');
    expect(s['site.social_accounts']).toEqual([]);
    await asSystem(t.backend, (sql) => sql.query(`insert into public.web_redirects (from_path, to_path, source) values ('/2024/05/nota-vieja', '/actualidad/nota-nueva', 'importador')`));
    expect(await anon((sql) => redirectFor(sql, '/2024/05/nota-vieja'))).toEqual({ to: '/actualidad/nota-nueva', status: 301 });
    expect(await anon((sql) => redirectFor(sql, '/no-existe'))).toBeNull();
    const munis = await anon((sql) => publicTerritories(sql));
    expect(munis).toHaveLength(29);
    expect(munis.every((m) => m.parishes.length === 0)).toBe(true);
    expect(await anon((sql) => publicRequestCategories(sql))).toHaveLength(10);
    const att = await anon((sql) => publicAttended(sql, 50));
    expect(att).toHaveLength(7);
    expect(att.find((a) => a.type === 'denuncia')).toMatchObject({ summary: 'Denuncia atendida en el municipio Bolívar.', displayName: null, categoryId: null });
    for (const a of att) expect(Object.keys(a)).not.toContain('requestId');
    // anon never reads a request, by any column.
    await expect(anon((sql) => sql.query(`select id from public.requests`))).rejects.toThrow(/permission denied/);
    await expect(anon((sql) => sql.query(`select request_id from public.attended_publications`))).rejects.toThrow(/permission denied/);
  });

  it('la búsqueda sin tildes es la misma que hizo la base (assistant_plain)', async () => {
    for (const s of ['Rehabilitación de la Avenida', 'ÑANDÚ  pingüino!!', '¿Qué pasó en Táriba?', 'a-b_c.d', '']) {
      const db = await asSystem(t.backend, (sql) => sql.one<{ v: string }>(`select public.assistant_plain($1) as v`, [s]));
      expect(plainSearch(s), s).toBe(db!.v);
    }
  });
});

describe('la participación sin cuenta, como la llama la app', () => {
  const cat = (slug: string) => asSystem(t.backend, async (sql) => (await sql.one<{ id: string }>(`select id from public.request_categories where slug = $1`, [slug]))!.id);
  const muni = (name: string) => asSystem(t.backend, async (sql) => (await sql.one<{ id: string }>(`select id from public.territories where name = $1`, [name]))!.id);

  it('enviar con contacto: el código; consultar con la clave escrita de otra forma; el contacto solo lo descifra quien atiende', async () => {
    const input = requestInput.parse({
      type: 'reporte', categoryId: await cat('agua'), title: 'Fuga en la tubería de prueba (demo)', description: 'Sale agua desde ayer en la esquina de prueba (demo).',
      municipalityId: await muni('Seboruco'), sector: 'Sector de prueba único (demo)', privacyAccepted: true,
      contact: { name: 'Vecina de prueba (demo)', email: 'vecina.prueba@demo.test', channel: 'email' },
    });
    const secret = generateSecret();
    const k = keys();
    const receipt = { submissionKey: crypto.randomUUID(), secret };
    const sent = await anon((sql) => submitRequest(sql, input, receipt, k));
    expect(sent).toMatchObject({ status: 'ok', kind: 'request' });
    expect(sent.reference).toMatch(/^AC-\d{4}-[0-9A-HJKMNP-TV-Z]{6}$/);
    // A retry with the same form key: the same receipt.
    expect((await anon((sql) => submitRequest(sql, input, receipt, k))).reference).toBe(sent.reference);
    const typed = secret.toLowerCase().replace(/-/g, ' ');
    const g = receiptGrant(sent.reference.toLowerCase(), typed)!;
    const v = (await anon((sql) => lookupRequest(sql, g, keys()))) as CitizenView;
    expect(v.status).toBe('ok');
    expect(v.request).toMatchObject({ reference: sent.reference, type: 'reporte', title: 'Fuga en la tubería de prueba (demo)', state: 'recibido', canAddInfo: true });
    expect(JSON.stringify(v)).not.toMatch(/vecina\.prueba|Vecina de prueba/);
    // The wrong secret, or a malformed receipt: the same «not found».
    expect(await anon((sql) => lookupRequest(sql, receiptGrant(sent.reference, generateSecret())!, keys()))).toEqual({ status: 'not_found' });
    expect(receiptGrant('no es un código', secret)).toBeNull();
    // The coordinator reads the contact through request_contact() (audited) and decrypts it here, with the demo key.
    const row = await t.as('attention', (sql) => sql.one<{ name_enc: string; email_enc: string; phone_enc: string | null; preferred_channel: string }>(`select * from public.request_contact($1)`, [sent.id]));
    expect(openContact(row!, contactKeyring())).toEqual({ name: 'Vecina de prueba (demo)', email: 'vecina.prueba@demo.test', phone: null, preferredChannel: 'email' });
  });

  it('agregar información, un archivo ya guardado, verlo y confirmar la resolución', async () => {
    const input = requestInput.parse({
      type: 'peticion', categoryId: await cat('otros'), title: 'Petición de prueba (demo)', description: 'Pedimos algo para la comunidad de prueba (demo).',
      municipalityId: await muni('Seboruco'), privacyAccepted: true, anonymous: true,
    });
    const secret = generateSecret();
    const sent = await anon((sql) => submitRequest(sql, input, { submissionKey: crypto.randomUUID(), secret }, keys()));
    const g = receiptGrant(sent.reference, secret)!;
    expect(await anon((sql) => addCitizenMessage(sql, g, keys(), 'Les cuento algo más (demo).'))).toMatchObject({ status: 'ok' });
    const file = { storageKey: `${crypto.randomUUID()}.jpg`, mime: 'image/jpeg', bytes: 1234, scanStatus: 'sin_analizar' as const };
    const added = (await anon((sql) => addCitizenAttachment(sql, g, keys(), file))) as { status: 'ok'; id: string };
    expect(added.status).toBe('ok');
    expect(await anon((sql) => citizenAttachment(sql, g, keys(), added.id))).toMatchObject({ status: 'ok', storageKey: file.storageKey, scanStatus: 'sin_analizar' });
    expect(await anon((sql) => citizenAttachment(sql, g, keys(), stableId('otro')))).toEqual({ status: 'not_found' });
    // The team resolves it (the system here), the person confirms.
    await asSystem(t.backend, async (sql) => {
      await sql.query(`select set_config('app.trusted_update', 'on', true)`);
      await sql.query(`update public.requests set state = 'resuelto', resolved_at = now(), resolution_note = 'Listo (demo).' where id = $1`, [sent.id]);
    });
    expect(await anon((sql) => confirmRequest(sql, g, keys(), true))).toEqual({ status: 'ok', state: 'resuelto' });
    const v = (await anon((sql) => lookupRequest(sql, g, keys()))) as CitizenView;
    expect(v.request.citizenConfirmation).toBe('resolved');
    expect(v.timeline.map((x) => x.kind)).toContain('citizen_message');
  });

  it('«¿te sumas?»: cuántos reportes abiertos hay cerca y sumarse con su propio comprobante; las cifras públicas', async () => {
    const agua = await cat('agua');
    const sc = await muni('San Cristóbal');
    const near = await anon((sql) => similarRequests(sql, keys(), { categoryId: agua, municipalityId: sc, point: { lat: 7.778, lng: -72.229 } }));
    expect(near.status).toBe('ok');
    const vialidad = await cat('vialidad');
    const vial = await anon((sql) => similarRequests(sql, keys(), { categoryId: vialidad, municipalityId: sc, point: { lat: 7.769, lng: -72.224 } }));
    expect(vial.count).toBeGreaterThanOrEqual(1);
    const secret = generateSecret();
    const support = await anon((sql) => supportRequest(sql, vial.ids![0], { submissionKey: crypto.randomUUID(), secret }, keys(), { note: 'A mí también (demo).' }));
    expect(support).toMatchObject({ status: 'ok', kind: 'support' });
    const sv = (await anon((sql) => lookupRequest(sql, receiptGrant(support.reference, secret)!, keys()))) as CitizenView;
    expect(sv.kind).toBe('support');
    expect(sv.request.title).toBeUndefined();
    const stats = await anon((sql) => publicRequestStats(sql));
    expect(stats.received).toBeGreaterThanOrEqual(58);
    expect(stats.byType.denuncia).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(stats.byCategory)).not.toMatch(/denuncia/i);
  });

  it('los comprobantes de la demo (docs/DEMO.md) abren su caso', async () => {
    const year = new Intl.DateTimeFormat('en', { timeZone: 'America/Caracas', year: 'numeric' }).format(new Date());
    const cases: [string, string, string][] = [
      ['DEMR01', 'K7QM-2HXP-9WRT-4BNE', 'en_atencion'],
      ['DEMR02', 'r3ps w8n2 demv 7qka', 'resuelto'],
      ['DEMR03', 'H4JX5ZTB9CNFW2YE', 'requiere_informacion'],
    ];
    for (const [suffix, secret, state] of cases) {
      const v = (await anon((sql) => lookupRequest(sql, receiptGrant(`AC-${year}-${suffix}`, secret)!, keys()))) as CitizenView;
      expect(v.status, suffix).toBe('ok');
      expect(v.request.state, suffix).toBe(state);
    }
    const first = (await anon((sql) => lookupRequest(sql, receiptGrant(`AC-${year}-DEMR01`, 'K7QM-2HXP-9WRT-4BNE')!, keys()))) as CitizenView;
    // Three supports and the duplicate merged into it (and the one added above); the team's reply in the timeline,
    // never its internal note.
    expect(first.request.supportCount).toBeGreaterThanOrEqual(4);
    expect(first.timeline.some((x) => x.kind === 'public_reply')).toBe(true);
    expect(JSON.stringify(first)).not.toMatch(/visita de la cuadrilla/);
    const second = (await anon((sql) => lookupRequest(sql, receiptGrant(`AC-${year}-DEMR02`, 'R3PS-W8N2-DEMV-7QKA')!, keys()))) as CitizenView;
    expect(second.request.canConfirm).toBe(true);
    expect(second.attachments.map((a) => a.kind).sort()).toEqual(['citizen', 'evidence']);
  });
});
