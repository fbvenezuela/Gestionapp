// The citizen without an account (20261106000300_citizen.sql, D-92, D-96): everything goes through the citizen.*
// functions as anon, which check every input, keep persistent limits, answer the minimum and never leak a contact, an
// internal note, a staff name or another person's file. Nobody with a session calls them; anon reads no request table.
import { describe, it, expect, beforeAll } from 'vitest';
import { lookup, makeWebTestDb, rateKey, receipt, sealed, submit, digestOf, type WebTestDb, type Who } from './web-setup';

let t: WebTestDb;
beforeAll(async () => {
  t = await makeWebTestDb();
}, 120_000);

const fails = async (p: Promise<unknown>, msg?: RegExp) => {
  if (msg) await expect(p).rejects.toThrow(msg);
  else await expect(p).rejects.toThrow();
};
const rows = <T>(who: Who, q: string, p: unknown[] = []) => t.asWho(who, (sql) => sql.query<T>(q, p));
const sys = <T>(q: string, p: unknown[] = []) => t.system((sql) => sql.query<T>(q, p));
const sysOne = async <T>(q: string, p: unknown[] = []) => (await sys<T>(q, p))[0];
const anonOne = async <T>(q: string, p: unknown[] = []) => (await t.anon((sql) => sql.one<{ v: T }>(q, p)))!.v;
const tz = 'America/Caracas';
let sectorN = 0;
const freshSector = () => `Sector único ${++sectorN} (prueba)`;

describe('enviar sin cuenta', () => {
  it('devuelve el código y el id, nada más; el caso queda «recibido», en el área de su categoría, con plazo e historia', async () => {
    const s = await submit(t, { contact: true, sector: freshSector() });
    expect(s).toMatchObject({ status: 'ok', kind: 'request' });
    expect(Object.keys(s).filter((k) => k !== 'receipt').sort()).toEqual(['id', 'kind', 'reference', 'status']);
    const year = new Intl.DateTimeFormat('en', { timeZone: tz, year: 'numeric' }).format(new Date());
    expect(s.reference).toMatch(new RegExp(`^AC-${year}-[0-9A-HJKMNP-TV-Z]{6}$`));
    const r = await sysOne<{ state: string; area_id: string; due_days: number; secret_digest: string; type: string; location_consent: boolean }>(
      `select state, area_id, round(extract(epoch from due_at - created_at) / 86400)::int as due_days, secret_digest, type, location_consent
         from public.requests where id = $1`, [s.id]);
    expect(r).toMatchObject({ state: 'recibido', area_id: t.area.a, due_days: 15, secret_digest: s.receipt.digest, type: 'reporte', location_consent: false });
    const c = await sysOne<{ name_enc: string; preferred_channel: string }>(`select name_enc, preferred_channel from public.request_contacts where request_id = $1`, [s.id]);
    expect(c!.name_enc).toMatch(/^demo:[A-Za-z0-9_-]{16}:/);
    expect(c!.preferred_channel).toBe('email');
    expect(await sys(`select kind, actor_kind, actor_id from public.request_events where request_id = $1`, [s.id])).toEqual([{ kind: 'created', actor_kind: 'citizen', actor_id: null }]);
  });

  it('el mismo envío otra vez (reintento, doble toque) devuelve el mismo código; con otra clave para ese formulario, no', async () => {
    const r = receipt();
    const a = await submit(t, { r, sector: freshSector() });
    const b = await submit(t, { r, title: 'Otro título que no se guarda (prueba)' });
    expect(b.reference).toBe(a.reference);
    expect(b.id).toBe(a.id);
    expect(await sysOne<{ n: number }>(`select count(*)::int as n from public.requests where submission_key = $1`, [r.submissionKey])).toEqual({ n: 1 });
    await fails(submit(t, { r: { ...r, digest: digestOf('otra clave') } }), /otra clave/);
    await fails(submit(t, { r: { ...r, digest: 'no-es-un-digest' } }), /Falta la clave del comprobante/);
  });

  it('límite por dispositivo (5 por hora): el sexto se niega con P0429 y no guarda nada; el reintento del primero sí responde', async () => {
    const device = rateKey('dispositivo-con-prisa');
    const first = receipt();
    await submit(t, { device, type: 'peticion', category: 'otros', r: first });
    for (let i = 0; i < 4; i++) await submit(t, { device, type: 'peticion', category: 'otros' });
    const before = (await sysOne<{ n: number }>(`select count(*)::int as n from public.requests`))!.n;
    await expect(submit(t, { device, type: 'peticion', category: 'otros' })).rejects.toMatchObject({ code: 'P0429' });
    expect((await sysOne<{ n: number }>(`select count(*)::int as n from public.requests`))!.n).toBe(before);
    expect((await submit(t, { device, type: 'peticion', category: 'otros', r: first })).status).toBe('ok');
  });

  it('límite por red, configurable en los ajustes; las llaves del límite son obligatorias y con su forma', async () => {
    await sys(`insert into public.app_settings (key, value) values ('participation.rate_limits', '{"submit_ip":{"limit":2,"minutes":60}}')
               on conflict (key) do update set value = public.app_settings.value || excluded.value`);
    const ip = rateKey('una-misma-red');
    await submit(t, { ip, type: 'sugerencia', category: 'otros', municipality: null });
    await submit(t, { ip, type: 'sugerencia', category: 'otros', municipality: null });
    await expect(submit(t, { ip, type: 'sugerencia', category: 'otros', municipality: null })).rejects.toMatchObject({ code: 'P0429' });
    await fails(submit(t, { device: 'abc' }), /llaves del límite/);
    await sys(`update public.app_settings set value = value - 'submit_ip' where key = 'participation.rate_limits'`);
  });

  it('una denuncia lleva solo el lugar aproximado: ni punto, ni referencia exacta; el punto siempre con permiso', async () => {
    await fails(submit(t, { type: 'denuncia', category: 'seguridad', lat: 7.7677, lng: -72.225 }), /solo el lugar aproximado/);
    await fails(submit(t, { type: 'denuncia', category: 'seguridad', place: 'Frente a la casa azul' }), /solo el lugar aproximado/);
    await fails(submit(t, { lat: 7.7677, lng: -72.225, consent: false }), /hace falta tu permiso/);
    await fails(submit(t, { lat: 7.7677, lng: null }), /no está completa/);
    const d = await submit(t, { type: 'denuncia', category: 'seguridad', sector: freshSector() });
    expect(await sysOne(`select area_id, lat, location_reference from public.requests where id = $1`, [d.id])).toEqual({ area_id: null, lat: null, location_reference: '' });
  });

  it('anónima va sin contacto ni permiso de nombre; municipio obligatorio donde hace falta; solo enlaza contenido publicado', async () => {
    await fails(submit(t, { anonymous: true, contact: true }), /anónima va sin contacto/);
    await fails(submit(t, { anonymous: true, nameConsent: true }), /anónima va sin contacto/);
    await fails(submit(t, { municipality: null }), /Elige el municipio/);
    await fails(submit(t, { type: 'peticion', municipality: null }), /Elige el municipio/);
    expect((await submit(t, { type: 'acotacion', category: 'otros', municipality: null })).status).toBe('ok');
    const draft = await sysOne<{ id: string }>(`select id from public.web_items where kind = 'page' and slug = 'gobernador'`);
    await fails(submit(t, { linkedItem: draft!.id }), /ya no está publicado/);
    await fails(submit(t, { title: 'no' }), /de 3 a 140/);
    await fails(submit(t, { description: 'corto' }), /en 10 a 4000 letras/);
  });
});

describe('«¿Te sumas?» y el cuarto reporte', () => {
  it('similar_requests cuenta los reportes abiertos del mismo problema a 100 m o menos, sin su contenido', async () => {
    const near = await submit(t, { category: 'electricidad-alumbrado', lat: 7.7677, lng: -72.2251, sector: freshSector() });
    const similar = (lat: number | null, lng: number | null, category = 'electricidad-alumbrado', sector = '') =>
      anonOne<{ status: string; count: number; ids: string[] }>(
        `select citizen.similar_requests($1, $2, $3, $4, null, $5, $6, $7) as v`,
        [rateKey(), rateKey(), t.category(category), t.municipality('San Cristóbal'), sector, lat, lng]);
    expect(await similar(7.7679, -72.2252)).toEqual({ status: 'ok', count: 1, ids: [near.id] }); // about 25 m
    expect((await similar(7.7700, -72.2251)).count).toBe(0); // about 255 m
    expect((await similar(7.7679, -72.2252, 'agua')).count).toBe(0);
  });

  it('el mismo problema en el mismo sitio no se abre más de tres veces: el cuarto se suma solo al primero, con su propio comprobante', async () => {
    const sector = freshSector();
    const firstWords = { title: 'Hueco frente al kiosco (prueba)', description: 'La primera persona cuenta que el hueco ya rompió dos cauchos (prueba).' };
    const first = await submit(t, { category: 'vialidad', sector, ...firstWords });
    await submit(t, { category: 'vialidad', sector: sector.toUpperCase() });
    await submit(t, { category: 'vialidad', sector: `  ${sector}  ` });
    const fourth = await submit(t, { category: 'vialidad', sector, contact: true, title: 'El hueco de siempre (prueba)', description: 'Lo veo todos los días al ir al trabajo (prueba).' });
    expect(fourth.kind).toBe('support');
    expect(await sysOne(`select support_count from public.requests where id = $1`, [first.id])).toEqual({ support_count: 1 });
    const sup = await sysOne<{ request_id: string; automatic: boolean; note: string }>(`select request_id, automatic, note from public.request_supports where id = $1`, [fourth.id]);
    expect(sup).toMatchObject({ request_id: first.id, automatic: true });
    expect(sup!.note).toMatch(/El hueco de siempre/);
    expect(await sysOne<{ n: number }>(`select count(*)::int as n from public.request_contacts where support_id = $1`, [fourth.id])).toEqual({ n: 1 });
    // Their receipt follows the case: kind, category, municipality and state; never the first person's words.
    const seen = await lookup(t, fourth.reference, fourth.receipt.digest);
    expect(seen).toMatchObject({ status: 'ok', kind: 'support', request: { reference: fourth.reference, type: 'reporte', category: 'Vialidad', state: 'recibido' } });
    expect(JSON.stringify(seen)).not.toMatch(/kiosco|dos cauchos/);
    expect((seen as { request: { note: string } }).request.note).toMatch(/Lo veo todos los días/);
  });

  it('sumarse a mano: solo a un reporte abierto (no a una petición ni a una denuncia); idempotente', async () => {
    const rep = await submit(t, { category: 'ambiente-aseo', sector: freshSector() });
    const r = receipt();
    const call = (target: string, rr = r) =>
      anonOne<{ status: string; kind: string; reference: string }>(
        `select citizen.support_request($1, $2, $3, $4, $5, 'Yo también lo veo todos los días.') as v`,
        [rr.submissionKey, rr.digest, rateKey(), rateKey(), target]);
    const s = await call(rep.id);
    expect(s).toMatchObject({ status: 'ok', kind: 'support' });
    expect((await call(rep.id)).reference).toBe(s.reference);
    expect(await sysOne(`select support_count from public.requests where id = $1`, [rep.id])).toEqual({ support_count: 1 });
    const pet = await submit(t, { type: 'peticion', category: 'otros' });
    const den = await submit(t, { type: 'denuncia', category: 'seguridad' });
    for (const target of [pet.id, den.id]) await fails(call(target, receipt()), /ya no está abierto/);
  });
});

describe('consultar con el código y la clave', () => {
  it('con la clave correcta: lo suyo, el estado y lo compartido; nunca el contacto, las notas internas, nombres del equipo, área, prioridad ni plazo', async () => {
    const s = await submit(t, { contact: true, sector: freshSector() });
    await rows('coordinator', `select public.add_request_message($1, 'internal_note', 'Nota interna: llamar al vecino del frente.')`, [s.id]);
    await rows('coordinator', `select public.assign_request($1, $2, $3)`, [s.id, t.area.a, t.idOf('areaA')]);
    await rows('coordinator', `select public.set_request_priority($1, 'alta')`, [s.id]);
    await rows('areaA', `select public.add_request_message($1, 'public_reply', 'Ya pasamos el caso a la cuadrilla.')`, [s.id]);
    const v = await lookup(t, s.reference, s.receipt.digest);
    expect(v).toMatchObject({ status: 'ok', kind: 'request', request: { reference: s.reference, state: 'asignado', category: 'Agua', municipality: 'San Cristóbal', canAddInfo: true, canConfirm: false } });
    const text = JSON.stringify(v);
    expect(text).toContain('Ya pasamos el caso a la cuadrilla.');
    for (const hidden of ['Nota interna', 'Responsable de servicios', 'Coordinación (prueba)', 'alta', 'demo:', t.area.a, t.idOf('areaA'), 'due', 'priority', 'assignee', 'area']) {
      expect(text, hidden).not.toContain(hidden);
    }
    const timeline = (v as { timeline: { kind: string; by: string }[] }).timeline;
    expect(timeline.map((e) => e.kind)).toEqual(['created', 'state', 'public_reply']);
    expect(new Set(timeline.map((e) => e.by))).toEqual(new Set(['citizen', 'team']));
  });

  it('con otra clave, un código que no existe o mal escrito: siempre «not_found», igual; el código se lee en mayúsculas', async () => {
    const s = await submit(t, { sector: freshSector() });
    for (const [ref, digest] of [[s.reference, digestOf('clave equivocada')], ['AC-2026-ZZZZZZ', s.receipt.digest], ['no es un código', s.receipt.digest], [s.reference, 'xyz']]) {
      expect(await lookup(t, ref, digest), ref).toEqual({ status: 'not_found' });
    }
    expect((await lookup(t, `  ${s.reference.toLowerCase()} `, s.receipt.digest)).status).toBe('ok');
  });

  it('los intentos fallidos cuentan: pasado el límite, ni la clave correcta entra desde ese dispositivo', async () => {
    const s = await submit(t, { sector: freshSector() });
    const device = rateKey('adivinador');
    for (let i = 0; i < 10; i++) expect((await lookup(t, s.reference, digestOf(`intento ${i}`), device)).status).toBe('not_found');
    await expect(lookup(t, s.reference, s.receipt.digest, device)).rejects.toMatchObject({ code: 'P0429' });
    expect((await lookup(t, s.reference, s.receipt.digest)).status).toBe('ok');
  });
});

describe('agregar información, archivos y confirmar', () => {
  const message = (ref: string, digest: string, body: string) =>
    anonOne<{ status: string; id?: string }>(`select citizen.add_citizen_message($1, $2, $3, $4, $5) as v`, [ref, digest, rateKey(), rateKey(), body]);
  const attach = (ref: string, digest: string, o: { mime?: string; ext?: string; scan?: string; message?: string | null } = {}) =>
    anonOne<{ status: string; id?: string }>(`select citizen.add_request_attachment($1, $2, $3, $4, $5, $6, 1000, $7, $8) as v`,
      [ref, digest, rateKey(), rateKey(), `${crypto.randomUUID()}.${o.ext ?? 'jpg'}`, o.mime ?? 'image/jpeg', o.scan ?? 'cuarentena', o.message ?? null]);

  it('un mensaje de la persona; si el equipo le pedía información, el caso vuelve a revisión', async () => {
    const s = await submit(t, { sector: freshSector() });
    await rows('coordinator', `select public.add_request_message($1, 'info_request', '¿Nos dices el número de la casa más cercana?')`, [s.id]);
    expect(await sysOne(`select state from public.requests where id = $1`, [s.id])).toEqual({ state: 'requiere_informacion' });
    expect(await message(s.reference, digestOf('otra'), 'Hola')).toEqual({ status: 'not_found' });
    expect((await message(s.reference, s.receipt.digest, 'Es la casa 12 de la vereda (prueba).')).status).toBe('ok');
    expect(await sysOne(`select state from public.requests where id = $1`, [s.id])).toEqual({ state: 'en_revision' });
    const v = await lookup(t, s.reference, s.receipt.digest);
    expect((v as { timeline: { kind: string }[] }).timeline.map((e) => e.kind)).toEqual(['created', 'info_request', 'state', 'citizen_message', 'state']);
    await rows('coordinator', `select public.set_request_state($1, 'no_procede', 'No es competencia de la gobernación (prueba).')`, [s.id]);
    await fails(message(s.reference, s.receipt.digest, 'Otra cosa'), /ya está cerrada/);
  });

  it('archivos: hasta 3 por envío; nunca «limpio» desde la persona; en la consulta, solo los suyos y la evidencia compartida', async () => {
    const s = await submit(t, { sector: freshSector() });
    await fails(attach(s.reference, s.receipt.digest, { scan: 'limpio' }), /cuarentena/);
    await fails(attach(s.reference, s.receipt.digest, { ext: 'png' }), /request_attachments_key_mime/);
    await fails(attach(s.reference, s.receipt.digest, { mime: 'image/gif', ext: 'gif' }), /check constraint/);
    for (let i = 0; i < 3; i++) expect((await attach(s.reference, s.receipt.digest)).status).toBe('ok');
    await fails(attach(s.reference, s.receipt.digest), /hasta 3 archivos/);
    const m = await message(s.reference, s.receipt.digest, 'Mando otra foto (prueba).');
    expect((await attach(s.reference, s.receipt.digest, { message: m.id!, mime: 'application/pdf', ext: 'pdf', scan: 'sin_analizar' })).status).toBe('ok');
    const hidden = await rows<{ id: string }>('coordinator', `select public.add_request_evidence($1, $2, 'image/jpeg', 2000) as id`, [s.id, `${crypto.randomUUID()}.jpg`]);
    const shared = await rows<{ id: string }>('coordinator', `select public.add_request_evidence($1, $2, 'image/jpeg', 2000, 'cuarentena', true) as id`, [s.id, `${crypto.randomUUID()}.jpg`]);
    const v = (await lookup(t, s.reference, s.receipt.digest)) as { attachments: { id: string; kind: string }[] };
    expect(v.attachments.filter((a) => a.kind === 'citizen')).toHaveLength(4);
    expect(v.attachments.map((a) => a.id)).toContain(shared[0].id);
    expect(v.attachments.map((a) => a.id)).not.toContain(hidden[0].id);
  });

  it('descargar: lo suyo y lo compartido; nunca lo retirado ni lo de otra solicitud', async () => {
    const s = await submit(t, { sector: freshSector() });
    const other = await submit(t, { sector: freshSector() });
    const mine = (await attach(s.reference, s.receipt.digest)).id!;
    const theirs = (await attach(other.reference, other.receipt.digest)).id!;
    const download = (ref: string, digest: string, id: string) =>
      anonOne<{ status: string; storageKey?: string; scanStatus?: string }>(`select citizen.request_attachment($1, $2, $3, $4, $5) as v`, [ref, digest, rateKey(), rateKey(), id]);
    expect(await download(s.reference, s.receipt.digest, mine)).toMatchObject({ status: 'ok', scanStatus: 'cuarentena', storageKey: expect.stringMatching(/\.jpg$/) });
    expect(await download(s.reference, s.receipt.digest, theirs)).toEqual({ status: 'not_found' });
    expect(await download(s.reference, digestOf('otra'), mine)).toEqual({ status: 'not_found' });
    await rows('coordinator', `select public.withhold_request_attachment($1, 'Se ve la cara de un niño (prueba).')`, [mine]);
    expect(await download(s.reference, s.receipt.digest, mine)).toEqual({ status: 'not_found' });
  });

  it('confirmar: «sí» queda anotado; «no» reabre con su registro y el comentario va al equipo; si no está resuelta, no', async () => {
    const confirm = (ref: string, digest: string, ok: boolean, comment: string | null = null) =>
      anonOne<{ status: string; state?: string }>(`select citizen.confirm_request($1, $2, $3, $4, $5, $6) as v`, [ref, digest, rateKey(), rateKey(), ok, comment]);
    const s = await submit(t, { sector: freshSector() });
    await fails(confirm(s.reference, s.receipt.digest, true), /no está esperando tu confirmación/);
    const resolve = async (id: string) => {
      await rows('coordinator', `select public.set_request_state($1, 'en_atencion')`, [id]);
      await rows('coordinator', `select public.set_request_state($1, 'resuelto', 'Se reparó la tubería (prueba).')`, [id]);
    };
    await resolve(s.id);
    expect((await lookup(t, s.reference, s.receipt.digest) as { request: { canConfirm: boolean } }).request.canConfirm).toBe(true);
    expect(await confirm(s.reference, s.receipt.digest, true)).toEqual({ status: 'ok', state: 'resuelto' });
    expect(await sysOne(`select citizen_confirmation from public.requests where id = $1`, [s.id])).toEqual({ citizen_confirmation: 'resolved' });
    await fails(confirm(s.reference, s.receipt.digest, false), /no está esperando/);

    const n = await submit(t, { sector: freshSector() });
    await resolve(n.id);
    expect(await confirm(n.reference, n.receipt.digest, false, 'Sigue saliendo agua (prueba).')).toEqual({ status: 'ok', state: 'en_atencion' });
    expect(await sysOne(`select state, citizen_confirmation, resolved_at from public.requests where id = $1`, [n.id])).toEqual({ state: 'en_atencion', citizen_confirmation: 'not_resolved', resolved_at: null });
    const ev = await sys<{ kind: string; actor_kind: string }>(`select kind, actor_kind from public.request_events where request_id = $1 order by created_at, kind`, [n.id]);
    expect(ev.filter((e) => e.actor_kind === 'citizen').map((e) => e.kind).sort()).toEqual(['citizen_not_resolved', 'created', 'state']);
    expect(await sys(`select body from public.request_messages where request_id = $1 and kind = 'citizen_message'`, [n.id])).toEqual([{ body: 'Sigue saliendo agua (prueba).' }]);
    expect(await confirm(n.reference, digestOf('otra'), true)).toEqual({ status: 'not_found' });
  });
});

describe('lo que nadie puede por fuera de las funciones', () => {
  it('anon no lee ni escribe ninguna tabla de solicitudes, contactos, áreas ni límites', async () => {
    for (const table of ['requests', 'request_contacts', 'request_events', 'request_messages', 'request_attachments', 'request_supports', 'rate_limits', 'areas', 'area_members']) {
      await fails(t.anon((sql) => sql.query(`select 1 from public.${table} limit 1`)), /permission denied/);
      await fails(t.anon((sql) => sql.query(`delete from public.${table}`)), /permission denied/);
    }
    await fails(t.anon((sql) => sql.query(`select default_area_id from public.request_categories`)), /permission denied/);
    expect((await t.anon((sql) => sql.query(`select slug from public.request_categories`))).length).toBe(10);
  });

  it('anon no llama las funciones del equipo ni las internas', async () => {
    const id = (await submit(t, { sector: freshSector() })).id;
    for (const q of [
      `select public.set_request_state('${id}', 'cerrado', 'x')`,
      `select * from public.request_contact('${id}')`,
      `select public.request_stats()`,
      `select public.publish_web_item('${id}', 1)`,
      `select public.request_new_reference()`,
      `select public.request_by_receipt('AC-2026-AAAAAA', 'x')`,
      `select public.rate_limit_pass('lookup_device', repeat('a', 64))`,
      `select public.citizen_add_support('${id}', gen_random_uuid(), repeat('a', 64), '', null, null, null, 'none', false)`,
      `select public.prune_rate_limits()`,
    ]) {
      await fails(t.anon((sql) => sql.query(q)), /permission denied/);
    }
  });

  it('nadie con sesión llama las funciones ciudadanas: ni administración, ni la coordinación, ni el jefe', async () => {
    const s = await submit(t, { sector: freshSector() });
    for (const who of ['admin', 'coordinator', 'boss', 'social'] as Who[]) {
      await fails(rows(who, `select citizen.lookup_request($1, $2, $3, $4)`, [s.reference, s.receipt.digest, rateKey(), rateKey()]), /permission denied/);
    }
  });

  it('la huella de la clave y la clave del formulario no las lee ningún rol de la API, ni con «*»', async () => {
    for (const who of ['coordinator', 'complaints', 'auditor', 'boss'] as Who[]) {
      for (const q of ['select secret_digest from public.requests', 'select submission_key from public.requests', 'select * from public.requests',
        'select secret_digest from public.request_supports', 'select r from public.requests r']) {
        await fails(rows(who, q), /permission denied/);
      }
    }
  });

  it('el sistema poda las ventanas viejas de los límites', async () => {
    await sys(`insert into public.rate_limits (bucket, key, window_start, hits) values ('lookup_device', $1, now() - interval '3 days', 4)`, [rateKey('vieja')]);
    expect((await sysOne<{ n: number }>(`select public.prune_rate_limits() as n`))!.n).toBeGreaterThanOrEqual(1);
  });
});

describe('las cifras públicas (/transparencia)', () => {
  it('totales y distribuciones sin datos de personas; las denuncias, solo en los totales por tipo y estado', async () => {
    await submit(t, { type: 'denuncia', category: 'seguridad', municipality: 'Ayacucho', sector: freshSector() });
    const st = await anonOne<{ received: number; byType: Record<string, number>; byCategory: { name: string; count: number }[]; byMunicipality: { name: string }[] }>(
      `select citizen.request_stats() as v`);
    expect(st.received).toBeGreaterThan(5);
    expect(st.byType.denuncia).toBeGreaterThanOrEqual(1);
    expect(st.byCategory.map((c) => c.name)).not.toContain('Seguridad');
    expect(st.byMunicipality.map((m) => m.name)).not.toContain('Ayacucho');
    expect(JSON.stringify(st)).not.toMatch(/Bote de agua|Sector único|demo:/);
    expect(Object.keys(st)).not.toContain('byArea');
    // A sealed contact never reaches it (the check of the format runs before).
    expect(sealed()).toMatch(/^demo:/);
  });
});
