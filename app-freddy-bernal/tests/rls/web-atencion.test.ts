// The attention desk (20261106000200_participacion.sql, D-92, D-93): who reads which request, who works on it, the
// state machine, assignment, the contact (encrypted, read only through an audited function), merges, moderation,
// «lo atendido», the figures and an audit trail without content. Every «no puede» is tried against the database.
import { describe, it, expect, beforeAll } from 'vitest';
import { lookup, makeWebTestDb, submit, TEAM, type WebTestDb, type Who } from './web-setup';

let t: WebTestDb;
type Sub = Awaited<ReturnType<typeof submit>>;
const R = {} as Record<'agua' | 'vial' | 'pet' | 'den', Sub>;

beforeAll(async () => {
  t = await makeWebTestDb();
  R.agua = await submit(t, { category: 'agua', contact: true, sector: 'Sector A (prueba)', lat: 7.70001, lng: -72.30001, title: 'Tubería rota en la vereda (prueba)' });
  R.vial = await submit(t, { category: 'vialidad', contact: true, sector: 'Sector B (prueba)' });
  R.pet = await submit(t, { type: 'peticion', category: 'otros', sector: 'Sector C (prueba)' });
  R.den = await submit(t, { type: 'denuncia', category: 'seguridad', contact: true, sector: 'Sector D (prueba)', description: 'Relato de la denuncia, privado de punta a punta (prueba).' });
}, 120_000);

const fails = async (p: Promise<unknown>, msg?: RegExp) => {
  if (msg) await expect(p).rejects.toThrow(msg);
  else await expect(p).rejects.toThrow();
};
const rows = <T>(who: Who, q: string, p: unknown[] = [], aal: 'aal1' | 'aal2' = 'aal2') => t.asWho(who, (sql) => sql.query<T>(q, p), aal);
const sys = <T>(q: string, p: unknown[] = []) => t.system((sql) => sql.query<T>(q, p));
const sysOne = async <T>(q: string, p: unknown[] = []) => (await sys<T>(q, p))[0];
const call = (who: Who, fn: string, args: unknown[], aal: 'aal1' | 'aal2' = 'aal2') =>
  rows(who, `select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as v`, args, aal);
const req = (id: string) =>
  sysOne<{ state: string; area_id: string | null; assignee_id: string | null; priority: string; due_at: Date | null; resolved_at: Date | null;
    resolution_note: string | null; first_response_at: Date | null; duplicate_of: string | null; support_count: number; is_spam: boolean;
    type: string; lat: string | null; description: string; title: string; location_reference: string }>(`select * from public.requests where id = $1`, [id]);
const visible = async (who: Who, aal: 'aal1' | 'aal2' = 'aal2') =>
  new Set((await rows<{ id: string }>(who, `select id from public.requests where id = any($1::uuid[])`, [Object.values(R).map((r) => r.id)], aal)).map((r) => r.id));
let n = 0;
const fresh = (o: Parameters<typeof submit>[1] = {}) => submit(t, { sector: `Sector suelto ${++n} (prueba)`, ...o });

describe('quién lee cada solicitud (D-92, D-93)', () => {
  it('la coordinación, todas (denuncias incluidas); el operador de denuncias, solo las denuncias', async () => {
    expect(await visible('coordinator')).toEqual(new Set(Object.values(R).map((r) => r.id)));
    expect(await visible('complaints')).toEqual(new Set([R.den.id]));
  });

  it('cada responsable, las de su área; nunca una denuncia ni las de otra área', async () => {
    expect(await visible('areaA')).toEqual(new Set([R.agua.id]));
    expect(await visible('areaB')).toEqual(new Set([R.vial.id]));
  });

  it('auditoría y el jefe leen todo menos las denuncias (solo leen: no atienden)', async () => {
    for (const who of ['auditor', 'boss'] as Who[]) {
      expect(await visible(who), who).toEqual(new Set([R.agua.id, R.vial.id, R.pet.id]));
      await fails(call(who, 'add_request_message', [R.agua.id, 'internal_note', 'Una nota']), /no te toca atenderla/);
      await fails(call(who, 'set_request_state', [R.agua.id, 'en_revision']), /no te toca/);
    }
  });

  it('administración, el editor, quien aprueba la web y los seis roles del equipo no ven ninguna solicitud ni nada de alrededor', async () => {
    for (const who of ['admin', 'writer', 'publisher', ...TEAM.filter((w) => w !== 'boss')] as Who[]) {
      for (const table of ['requests', 'request_events', 'request_messages', 'request_attachments', 'request_supports']) {
        expect(await rows(who, `select 1 from public.${table}`), `${who} ${table}`).toEqual([]);
      }
      await fails(call(who, 'set_request_state', [R.pet.id, 'en_revision']), /no te toca/);
      await fails(rows(who, `select * from public.request_contact($1)`, [R.agua.id]), /No puedes ver el contacto/);
    }
  });

  it('lo de alrededor de una denuncia (historia, mensajes) sigue a la denuncia: el operador sí, un responsable no', async () => {
    expect((await rows('complaints', `select kind from public.request_events where request_id = $1`, [R.den.id])).length).toBeGreaterThan(0);
    for (const who of ['areaA', 'auditor', 'boss'] as Who[]) {
      expect(await rows(who, `select kind from public.request_events where request_id = $1`, [R.den.id]), who).toEqual([]);
    }
  });

  it('las puertas dicen sí o no, nunca null (un caso sin asignar tiene la persona vacía)', async () => {
    for (const who of ['areaA', 'areaB', 'auditor', 'writer', 'social'] as Who[]) {
      const got = await rows<Record<string, boolean | null>>(who,
        `select public.can_work_request('reporte', $1, null) as w, public.can_read_request('reporte', null, null) as r,
                public.can_work_request(null, null, null) as n, public.can_steer_request(null) as s, public.is_area_member(null) as m`, [t.area.b]);
      for (const [k, v] of Object.entries(got[0])) expect(v, `${who} ${k}`).not.toBeNull();
    }
    expect((await rows<{ w: boolean }>('areaA', `select public.can_work_request('reporte', $1, null) as w`, [t.area.b]))[0].w).toBe(false);
  });

  it('sin doble factor, nadie de la atención lee nada', async () => {
    for (const who of ['coordinator', 'complaints', 'areaA', 'auditor', 'boss'] as Who[]) {
      expect((await visible(who, 'aal1')).size, who).toBe(0);
      await fails(call(who, 'request_stats', [null, null], 'aal1'), /Las cifras de atención/);
    }
  });

  it('el responsable sigue viendo lo que le asignaron aunque salga del área (y deja de ver lo demás de esa área)', async () => {
    const x = await fresh({ category: 'agua' });
    await call('coordinator', 'assign_request', [x.id, t.area.a, t.idOf('areaA')]);
    const membership = await sysOne<{ id: string }>(`select id from public.area_members where user_id = $1`, [t.idOf('areaA')]);
    await rows('admin', `delete from public.area_members where id = $1`, [membership!.id]);
    const seen = new Set((await rows<{ id: string }>('areaA', `select id from public.requests where id = any($1::uuid[])`, [[x.id, R.agua.id]])).map((r) => r.id));
    expect(seen).toEqual(new Set([x.id]));
    await rows('admin', `insert into public.area_members (area_id, user_id) values ($1, $2)`, [t.area.a, t.idOf('areaA')]);
  });
});

describe('el contacto de la persona', () => {
  it('lo ve cifrado quien atiende el caso, y cada vez queda en la auditoría', async () => {
    const got = await rows<{ name_enc: string; email_enc: string; preferred_channel: string }>('coordinator', `select * from public.request_contact($1)`, [R.agua.id]);
    expect(got).toHaveLength(1);
    expect(got[0].name_enc).toMatch(/^demo:/);
    expect(await rows('areaA', `select * from public.request_contact($1)`, [R.agua.id])).toHaveLength(1);
    expect(await rows('complaints', `select * from public.request_contact($1)`, [R.den.id])).toHaveLength(1);
    const views = await sys<{ actor_id: string }>(`select actor_id from public.audit_log where action = 'contact_view' and row_id = $1 order by id`, [R.agua.id]);
    expect(views.map((v) => v.actor_id)).toEqual([t.idOf('coordinator'), t.idOf('areaA')]);
  });

  it('quien no atiende ese caso no lo ve, ni auditoría ni el jefe; y nadie lee la tabla directo', async () => {
    await fails(rows('areaA', `select * from public.request_contact($1)`, [R.vial.id]), /No puedes ver el contacto/);
    await fails(rows('complaints', `select * from public.request_contact($1)`, [R.agua.id]), /No puedes ver el contacto/);
    for (const who of ['auditor', 'boss', 'admin', 'writer'] as Who[]) {
      await fails(rows(who, `select * from public.request_contact($1)`, [R.agua.id]), /No puedes ver el contacto/);
    }
    for (const who of ['coordinator', 'complaints', 'areaA', 'admin'] as Who[]) {
      await fails(rows(who, `select * from public.request_contacts`), /permission denied/);
    }
  });

  it('se borra a pedido de la persona (la coordinación, con motivo); el caso sigue y la historia lo dice sin el dato', async () => {
    await fails(call('areaB', 'erase_request_contact', [R.vial.id, 'Lo pidió la persona.', null]), /Borra contactos la coordinación/);
    await fails(call('coordinator', 'erase_request_contact', [R.vial.id, '', null]), /Escribe el motivo/);
    await call('coordinator', 'erase_request_contact', [R.vial.id, 'Lo pidió la persona por el formulario (prueba).', null]);
    expect(await rows('coordinator', `select * from public.request_contact($1)`, [R.vial.id])).toEqual([]);
    expect((await req(R.vial.id))!.state).toBe('recibido');
    const ev = await sysOne<{ kind: string; reason: string }>(`select kind, reason from public.request_events where request_id = $1 and kind = 'contact_erased'`, [R.vial.id]);
    expect(ev!.reason).toMatch(/Lo pidió la persona/);
    const trail = await sysOne<{ old_data: Record<string, unknown> }>(`select old_data from public.audit_log where table_name = 'request_contacts' and action = 'delete' order by id desc limit 1`);
    expect(trail!.old_data).toMatchObject({ fields: ['email_enc', 'name_enc', 'preferred_channel'] });
    expect(JSON.stringify(trail!.old_data)).not.toMatch(/demo:/);
  });
});

describe('estados (la máquina de estados vive en la base)', () => {
  it('sigue el camino; el motivo es obligatorio donde corresponde; reabrir deja constancia', async () => {
    const x = await fresh({ type: 'peticion', category: 'otros' });
    const to = (state: string, reason: string | null = null, note: string | null = null) => call('coordinator', 'set_request_state', [x.id, state, reason, note]);
    await to('en_revision');
    await fails(to('resuelto', 'Hecho.'), /De «En revisión» no se pasa a «Resuelto»/);
    await fails(to('no_procede'), /Escribe el motivo/);
    await fails(to('requiere_informacion', 'Falta la dirección'), /qué información necesitas/);
    await to('requiere_informacion', null, '¿En qué calle queda?');
    expect(await sys(`select kind, body from public.request_messages where request_id = $1`, [x.id])).toEqual([{ kind: 'info_request', body: '¿En qué calle queda?' }]);
    await to('en_atencion');
    await fails(to('resuelto'), /Escribe el motivo/);
    await to('resuelto', 'Se entregó lo pedido (prueba).');
    const resolved = (await req(x.id))!;
    expect(resolved).toMatchObject({ state: 'resuelto', resolution_note: 'Se entregó lo pedido (prueba).' });
    expect(resolved.resolved_at).not.toBeNull();
    expect(resolved.first_response_at).not.toBeNull();
    await fails(to('cerrado'), /Escribe el motivo/);
    await to('cerrado', 'La persona confirmó (prueba).');
    await fails(to('en_revision'), /Escribe el motivo/);
    await to('en_revision', 'Volvió a pasar (prueba).');
    expect((await req(x.id))!.resolved_at).toBeNull();
    const states = await sys<{ from_state: string; to_state: string; actor_id: string }>(
      `select from_state, to_state, actor_id from public.request_events where request_id = $1 and kind = 'state' order by created_at`, [x.id]);
    expect(states.map((s) => s.to_state)).toEqual(['en_revision', 'requiere_informacion', 'en_atencion', 'resuelto', 'cerrado', 'en_revision']);
    expect(new Set(states.map((s) => s.actor_id))).toEqual(new Set([t.idOf('coordinator')]));
  });

  it('el responsable de otra área no cambia nada; nadie escribe, cambia ni borra una solicitud por fuera de las funciones', async () => {
    await fails(call('areaB', 'set_request_state', [R.agua.id, 'en_revision']), /no te toca/);
    for (const who of ['coordinator', 'areaA', 'admin'] as Who[]) {
      await fails(rows(who, `update public.requests set state = 'cerrado' where id = $1`, [R.agua.id]), /permission denied/);
      await fails(rows(who, `delete from public.requests where id = $1`, [R.agua.id]), /permission denied/);
      await fails(rows(who, `insert into public.request_events (request_id, kind, actor_kind) values ($1, 'state', 'staff')`, [R.agua.id]), /permission denied/);
      await fails(rows(who, `insert into public.request_messages (request_id, kind, body, author_id) values ($1, 'internal_note', 'x', auth.uid())`, [R.agua.id]), /permission denied/);
      await fails(rows(who, `delete from public.request_messages`), /permission denied/);
    }
  });

  it('la historia y los mensajes no se borran ni se cambian, tampoco con la conexión del sistema; el código y la clave no cambian', async () => {
    await fails(sys(`update public.request_events set reason = 'otra' where request_id = $1`, [R.agua.id]), /El historial no se borra/);
    await fails(sys(`delete from public.request_events where request_id = $1`, [R.agua.id]), /El historial no se borra/);
    await call('areaA', 'add_request_message', [R.agua.id, 'internal_note', 'Revisar con la cuadrilla (prueba).']);
    await fails(sys(`update public.request_messages set body = 'otra' where request_id = $1`, [R.agua.id]), /no se borra ni se cambia/);
    await fails(sys(`delete from public.request_messages where request_id = $1`, [R.agua.id]), /no se borra ni se cambia/);
    await fails(sys(`update public.requests set reference = 'AC-2026-AAAAAA' where id = $1`, [R.agua.id]), /no cambian/);
    await fails(sys(`update public.requests set secret_digest = repeat('a', 64) where id = $1`, [R.agua.id]), /no cambian/);
    await fails(sys(`update public.requests set state = 'resuelto' where id = $1`, [R.pet.id]), /no se pasa/);
  });
});

describe('asignar', () => {
  it('la coordinación asigna área y persona; el caso queda «asignado» con su historia', async () => {
    const x = await fresh({ type: 'peticion', category: 'otros' });
    await call('coordinator', 'assign_request', [x.id, t.area.b, t.idOf('areaB'), 'Le toca a vialidad (prueba).']);
    expect(await req(x.id)).toMatchObject({ state: 'asignado', area_id: t.area.b, assignee_id: t.idOf('areaB') });
    const ev = await sys<{ kind: string }>(`select kind from public.request_events where request_id = $1 order by created_at, kind`, [x.id]);
    expect(ev.map((e) => e.kind)).toEqual(['created', 'assigned', 'state']);
    expect(await visible('areaB')).toContain(R.vial.id);
  });

  it('el responsable toma un caso de su área o se lo pasa a alguien de su área; no lo cambia de área', async () => {
    const x = await fresh({ category: 'agua' });
    await call('areaA', 'assign_request', [x.id, t.area.a, t.idOf('areaA')]);
    expect((await req(x.id))!.assignee_id).toBe(t.idOf('areaA'));
    await fails(call('areaA', 'assign_request', [x.id, t.area.b, t.idOf('areaA')]), /El área la cambia la coordinación/);
    await fails(call('areaA', 'assign_request', [x.id, t.area.a, t.idOf('areaB')]), /no atiende las solicitudes de esa área/);
    await fails(call('areaA', 'set_request_priority', [x.id, 'urgente', null]), /La prioridad la pone la coordinación/);
    await fails(call('areaA', 'set_request_due', [x.id, new Date(Date.now() + 86_400_000), null]), /fecha comprometida la pone/);
  });

  it('una denuncia no se le asigna a un responsable de área; el operador de denuncias se la asigna a sí mismo', async () => {
    await fails(call('coordinator', 'assign_request', [R.den.id, t.area.a, t.idOf('areaA')]), /la atienden solo el operador de denuncias o la coordinación/);
    await call('complaints', 'assign_request', [R.den.id, null, t.idOf('complaints')]);
    expect(await req(R.den.id)).toMatchObject({ assignee_id: t.idOf('complaints'), state: 'asignado' });
  });

  it('prioridad y fecha comprometida: la coordinación; el plazo sigue a la prioridad mientras nadie lo puso a mano', async () => {
    const x = await fresh({ category: 'salud' });
    await call('coordinator', 'set_request_priority', [x.id, 'urgente', null]);
    const days = await sysOne<{ d: number }>(`select round(extract(epoch from due_at - created_at) / 86400)::int as d from public.requests where id = $1`, [x.id]);
    expect(days).toEqual({ d: 2 });
    const due = new Date(Date.now() + 10 * 86_400_000);
    await call('coordinator', 'set_request_due', [x.id, due, 'Lo acordado con la comunidad (prueba).']);
    await call('coordinator', 'set_request_priority', [x.id, 'baja', null]);
    expect((await req(x.id))!.due_at!.getTime()).toBe(due.getTime());
    await fails(call('coordinator', 'set_request_due', [x.id, new Date('2020-01-01'), null]), /antes de que llegara/);
  });
});

describe('mensajes, unir duplicados, retirar datos y spam', () => {
  it('la nota interna nunca la ve la persona; la respuesta sí', async () => {
    const x = await fresh({ category: 'agua' });
    await call('areaA', 'add_request_message', [x.id, 'internal_note', 'Ojo: el vecino es pariente de alguien (prueba).']);
    await call('areaA', 'add_request_message', [x.id, 'public_reply', 'Gracias, ya lo estamos revisando (prueba).']);
    const v = JSON.stringify(await lookup(t, x.reference, x.receipt.digest));
    expect(v).toContain('Gracias, ya lo estamos revisando');
    expect(v).not.toContain('pariente');
    await fails(call('areaA', 'add_request_message', [x.id, 'citizen_message', 'Me hago pasar por la persona']), /Tipo de mensaje inválido/);
  });

  it('unir: el duplicado se cierra unido y el que queda suma; la persona del duplicado ve que se unió y cómo va el otro', async () => {
    const keep = await fresh({ category: 'electricidad-alumbrado' });
    const dup = await fresh({ category: 'electricidad-alumbrado' });
    await fails(call('areaA', 'merge_request', [dup.id, keep.id, 'Es el mismo poste (prueba).']), /Une casos la coordinación/);
    await fails(call('coordinator', 'merge_request', [dup.id, keep.id, '']), /Escribe el motivo/);
    await fails(call('coordinator', 'merge_request', [dup.id, R.pet.id, 'x']), /mismo tipo/);
    await call('coordinator', 'merge_request', [dup.id, keep.id, 'Es el mismo poste (prueba).']);
    expect(await req(dup.id)).toMatchObject({ state: 'cerrado', duplicate_of: keep.id });
    expect((await req(keep.id))!.support_count).toBe(1);
    await call('coordinator', 'set_request_state', [keep.id, 'en_revision']);
    const v = (await lookup(t, dup.reference, dup.receipt.digest)) as { request: { merged: boolean; mainState: string; canAddInfo: boolean }; timeline: { kind: string }[] };
    expect(v.request).toMatchObject({ merged: true, mainState: 'en_revision', canAddInfo: false });
    expect(v.timeline.map((e) => e.kind)).toContain('merged');
    expect(JSON.stringify(v)).not.toContain(keep.reference);
    await fails(call('coordinator', 'merge_request', [dup.id, keep.id, 'otra vez']), /ya está unido/);
    await fails(call('coordinator', 'set_request_state', [dup.id, 'en_revision', 'x']), /está unida a otra/);
  });

  it('retirar un dato o un mensaje deja constancia del campo y del motivo, nunca del texto', async () => {
    const x = await fresh({ category: 'agua', description: 'Llamen a mi vecino al cero cuatro uno cuatro (prueba).', lat: 7.71, lng: -72.31 });
    await fails(call('areaA', 'redact_request', [x.id, 'description', 'Trae datos de un tercero.']), /Retira datos la coordinación/);
    await call('coordinator', 'redact_request', [x.id, 'description', 'Trae datos de un tercero (prueba).']);
    await call('coordinator', 'redact_request', [x.id, 'location', 'El punto es la casa de la persona (prueba).']);
    await fails(call('coordinator', 'redact_request', [x.id, 'reference', 'x']), /no se retira/);
    expect(await req(x.id)).toMatchObject({ description: '[Texto retirado por el equipo]', lat: null });
    const ev = await sys<{ detail: Record<string, string> }>(`select detail from public.request_events where request_id = $1 and kind = 'redacted' order by created_at`, [x.id]);
    expect(ev.map((e) => e.detail.field)).toEqual(['description', 'location']);
    const m = await t.anon((sql) => sql.one<{ v: { id: string } }>(`select citizen.add_citizen_message($1, $2, $3, $4, 'Mi cédula es V-1 (prueba)') as v`,
      [x.reference, x.receipt.digest, 'a'.repeat(64), 'b'.repeat(64)]));
    await call('coordinator', 'redact_request_message', [m!.v.id, 'Un dato que no hace falta (prueba).']);
    const v = JSON.stringify(await lookup(t, x.reference, x.receipt.digest));
    expect(v).not.toContain('cédula');
    expect(v).toContain('"redacted":true');
    expect(JSON.stringify(await sys(`select old_data, new_data from public.audit_log where row_id = $1`, [x.id]))).not.toMatch(/vecino|cero cuatro/);
  });

  it('spam: «no procede», marcado y guardado (nunca borrado), y fuera de las cifras', async () => {
    const x = await fresh({ type: 'sugerencia', category: 'otros', municipality: null, title: 'Compre seguidores baratos (prueba)' });
    await fails(call('areaA', 'mark_request_spam', [x.id, 'Publicidad.']), /no te toca|Marca spam/);
    await call('coordinator', 'mark_request_spam', [x.id, 'Publicidad (prueba).']);
    expect(await req(x.id)).toMatchObject({ is_spam: true, state: 'no_procede' });
    const before = (await rows<{ v: { received: number } }>('coordinator', `select public.request_stats() as v`))[0].v.received;
    expect((await sysOne<{ n: number }>(`select count(*)::int as n from public.requests where not is_spam and duplicate_of is null`))!.n).toBe(before);
  });
});

describe('«Lo atendido» en la web', () => {
  const resolve = async (id: string, who: Who = 'coordinator') => {
    await call(who, 'set_request_state', [id, 'en_atencion']);
    await call(who, 'set_request_state', [id, 'resuelto', 'Atendido por la cuadrilla (prueba).']);
  };

  it('solo lo resuelto; el nombre solo con permiso de la persona (si no, iniciales); nunca un teléfono ni un correo', async () => {
    const x = await fresh({ category: 'agua', contact: true });
    await fails(call('coordinator', 'publish_attended', [x.id, 'Se reparó la tubería del sector (prueba).', null]), /ya se resolvió/);
    await resolve(x.id);
    await fails(call('areaA', 'publish_attended', [x.id, 'Se reparó la tubería del sector (prueba).', null]), /Publica lo atendido la coordinación/);
    await fails(call('coordinator', 'publish_attended', [x.id, 'Se reparó la tubería del sector (prueba).', 'María Pérez']), /solo sus iniciales/);
    await fails(call('coordinator', 'publish_attended', [x.id, 'Se reparó; llamen al 0414-1234567 (prueba).', 'M. P.']), /attended_no_contact/);
    await fails(call('coordinator', 'publish_attended', [x.id, 'Se reparó; escriban a vecino@correo.test (prueba).', null]), /attended_no_contact/);
    await call('coordinator', 'publish_attended', [x.id, 'Se reparó la tubería del sector (prueba).', 'M. P.']);
    const pub = await t.anon((sql) => sql.query<{ public_summary: string; display_name: string }>(`select public_summary, display_name, type from public.attended_publications`));
    expect(pub).toContainEqual(expect.objectContaining({ public_summary: 'Se reparó la tubería del sector (prueba).', display_name: 'M. P.' }));
    await fails(t.anon((sql) => sql.query(`select request_id from public.attended_publications`)), /permission denied/);

    const named = await fresh({ category: 'vialidad', contact: true, nameConsent: true });
    await resolve(named.id);
    await call('coordinator', 'publish_attended', [named.id, 'Se tapó el hueco de la calle (prueba).', 'Ana Contreras (prueba)']);
    const anonymous = await fresh({ category: 'agua', anonymous: true });
    await resolve(anonymous.id);
    await fails(call('coordinator', 'publish_attended', [anonymous.id, 'Se reparó la fuga (prueba).', 'A. C.']), /anónima/);
  });

  it('de una denuncia solo «Denuncia atendida en el municipio X»: sin nombre, sin categoría, diga lo que diga el resumen', async () => {
    await call('complaints', 'set_request_state', [R.den.id, 'en_atencion']);
    await call('complaints', 'set_request_state', [R.den.id, 'resuelto', 'Se remitió a las autoridades (prueba).']);
    await call('coordinator', 'publish_attended', [R.den.id, 'Un resumen con detalles que no deben salir (prueba).', 'D. N.']);
    const pub = await sysOne(`select public_summary, display_name, category_id, type from public.attended_publications where request_id = $1`, [R.den.id]);
    expect(pub).toEqual({ public_summary: 'Denuncia atendida en el municipio San Cristóbal.', display_name: null, category_id: null, type: 'denuncia' });
  });

  it('retirarlo lo saca de la web; retirarlo otra vez no tiene sentido', async () => {
    const x = await fresh({ category: 'salud' });
    await resolve(x.id);
    const pubId = (await call('coordinator', 'publish_attended', [x.id, 'Se dotó el ambulatorio del sector (prueba).', null]))[0] as { v: string };
    await fails(call('coordinator', 'withdraw_attended', [x.id, '']), /Escribe el motivo/);
    await call('coordinator', 'withdraw_attended', [x.id, 'Se publicó por error (prueba).']);
    expect(await t.anon((sql) => sql.query(`select id from public.attended_publications where id = $1`, [pubId.v]))).toEqual([]);
    await fails(call('coordinator', 'withdraw_attended', [x.id, 'otra vez']), /no está publicado/);
  });
});

describe('cifras, reclasificar y auditoría', () => {
  it('las cifras: la coordinación ve las denuncias en todo; auditoría y el jefe solo en los totales; nadie más las ve', async () => {
    type Stats = { byType: Record<string, number>; byCategory: { name: string }[]; byArea: { name: string }[] };
    const as = async (who: Who) => (await rows<{ v: Stats }>(who, `select public.request_stats() as v`))[0].v;
    expect((await as('coordinator')).byCategory.map((c) => c.name)).toContain('Seguridad');
    for (const who of ['auditor', 'boss'] as Who[]) {
      const st = await as(who);
      expect(st.byType.denuncia, who).toBeGreaterThanOrEqual(1);
      expect(st.byCategory.map((c) => c.name), who).not.toContain('Seguridad');
    }
    for (const who of ['areaA', 'complaints', 'admin', 'writer', 'dispatch'] as Who[]) {
      await fails(call(who, 'request_stats', [null, null]), /Las cifras de atención/);
    }
  });

  it('reclasificar: solo la coordinación y con motivo; si pasa a denuncia pierde el punto, sale del área y la ven otros', async () => {
    const x = await fresh({ category: 'agua', lat: 7.72, lng: -72.32, place: 'Frente a la bodega (prueba)' });
    await call('areaA', 'assign_request', [x.id, t.area.a, t.idOf('areaA')]);
    await fails(call('areaA', 'reclassify_request', [x.id, 'denuncia', t.category('seguridad'), 'Es una denuncia.']), /la coordinación/);
    await fails(call('coordinator', 'reclassify_request', [x.id, 'denuncia', t.category('seguridad'), '']), /Escribe el motivo/);
    await call('coordinator', 'reclassify_request', [x.id, 'denuncia', t.category('seguridad'), 'La persona describe un delito (prueba).']);
    expect(await req(x.id)).toMatchObject({ type: 'denuncia', lat: null, location_reference: '', area_id: null, assignee_id: null });
    expect(await rows('areaA', `select id from public.requests where id = $1`, [x.id])).toEqual([]);
    expect(await rows('complaints', `select id from public.requests where id = $1`, [x.id])).toHaveLength(1);
  });

  it('la auditoría guarda quién y qué campos, nunca el texto ni el lugar exacto; auditoría y administración la leen', async () => {
    const trail = await sys<{ table_name: string; old_data: unknown; new_data: unknown }>(
      `select table_name, old_data, new_data from public.audit_log where table_name like 'request%' or table_name = 'attended_publications'`);
    expect(trail.length).toBeGreaterThan(20);
    const text = JSON.stringify(trail);
    for (const secret of ['Tubería rota en la vereda', 'Relato de la denuncia', 'Sector A (prueba)', '7.70001', 'Revisar con la cuadrilla', 'demo:']) {
      expect(text, secret).not.toContain(secret);
    }
    const insert = await sysOne<{ new_data: { fields: string[]; state: string } }>(`select new_data from public.audit_log where table_name = 'requests' and row_id = $1 and action = 'insert'`, [R.agua.id]);
    expect(insert!.new_data.state).toBe('recibido');
    expect(insert!.new_data.fields).toEqual(expect.arrayContaining(['title', 'description', 'sector', 'lat', 'lng', 'secret_digest', 'submission_key']));
    for (const who of ['auditor', 'admin'] as Who[]) {
      expect((await rows(who, `select id from public.audit_log where table_name = 'requests' and row_id = $1`, [R.agua.id])).length, who).toBeGreaterThan(0);
    }
    expect((await rows('auditor', `select id from public.audit_log where action = 'contact_view'`)).length).toBeGreaterThan(0);
    for (const who of ['coordinator', 'areaA', 'boss', 'complaints'] as Who[]) {
      expect(await rows(who, `select id from public.audit_log where table_name = 'requests'`), who).toEqual([]);
    }
  });
});
