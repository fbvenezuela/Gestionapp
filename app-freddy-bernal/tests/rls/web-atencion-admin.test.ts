// The attention desk's administrator (20261106100100_atencion_admin.sql) against the database, role by role: a lookup
// that finds the receipt gives its hit back (reloading an open consultation never locks the person out) while failed
// attempts still count; the figures with their medians, for the coordinator, the auditor and the boss only; the reply
// templates (whoever answers reads them, only the coordinator writes, nobody deletes); the desk's people for whoever
// assigns; the export's audit row (the auditor never with the contact); and the cron's memory of overdue notices,
// which no API role touches. Every «no puede» is tried against the database.
import { describe, it, expect, beforeAll } from 'vitest';
import { digestOf, lookup, makeWebTestDb, rateKey, submit, TEAM, type WebTestDb, type Who } from './web-setup';

let t: WebTestDb;
beforeAll(async () => {
  t = await makeWebTestDb();
}, 120_000);

const fails = (p: Promise<unknown>, msg?: RegExp) => (msg ? expect(p).rejects.toThrow(msg) : expect(p).rejects.toThrow());
const rows = <T>(who: Who, q: string, p: unknown[] = [], aal: 'aal1' | 'aal2' = 'aal2') => t.asWho(who, (sql) => sql.query<T>(q, p), aal);
const sys = <T>(q: string, p: unknown[] = []) => t.system((sql) => sql.query<T>(q, p));
let n = 0;
const fresh = (o: Parameters<typeof submit>[1] = {}) => submit(t, { sector: `Sector del administrador ${++n} (prueba)`, ...o });

describe('consultar mi solicitud: solo cuentan los intentos fallidos (W2)', () => {
  it('recargar una consulta abierta muchas veces no gasta el límite; los fallidos sí y, pasado el límite, ni la clave correcta entra', async () => {
    const s = await fresh();
    const device = rateKey('recargas');
    // The limit is 10 per 15 minutes on this device: 15 good lookups in a row all answer.
    for (let i = 0; i < 15; i++) expect((await lookup(t, s.reference, s.receipt.digest, device)).status, `consulta ${i + 1}`).toBe('ok');
    const hits = await sys<{ hits: number }>(`select hits from public.rate_limits where bucket = 'lookup_device' and key = $1`, [device]);
    expect(hits.reduce((a, r) => a + r.hits, 0)).toBe(0);
    // Ten wrong secrets still count; the eleventh attempt, even with the right secret, waits.
    for (let i = 0; i < 10; i++) expect((await lookup(t, s.reference, digestOf(`intento ${i}`), device)).status).toBe('not_found');
    await expect(lookup(t, s.reference, s.receipt.digest, device)).rejects.toMatchObject({ code: 'P0429' });
  });

  it('una consulta buena entre intentos malos no borra los malos (solo devuelve el suyo)', async () => {
    const s = await fresh();
    const device = rateKey('mezcla');
    for (let i = 0; i < 4; i++) {
      expect((await lookup(t, s.reference, digestOf(`malo ${i}`), device)).status).toBe('not_found');
      expect((await lookup(t, s.reference, s.receipt.digest, device)).status).toBe('ok');
    }
    const hits = await sys<{ hits: number }>(`select hits from public.rate_limits where bucket = 'lookup_device' and key = $1`, [device]);
    expect(hits.reduce((a, r) => a + r.hits, 0)).toBe(4);
  });

  it('también para quien se sumó a un reporte (su propio comprobante)', async () => {
    const main = await fresh({ sector: 'Sector de apoyos del administrador (prueba)' });
    const r = await t.anon((sql) =>
      sql.one<{ v: { reference: string } }>(
        `select citizen.support_request(p_submission_key => gen_random_uuid(), p_secret_digest => $1, p_device_key => $2, p_ip_key => $3, p_request_id => $4) as v`,
        [digestOf('clave del apoyo'), rateKey(), rateKey(), main.id],
      ),
    );
    const device = rateKey('apoyo');
    for (let i = 0; i < 12; i++) expect((await lookup(t, r!.v.reference, digestOf('clave del apoyo'), device)).status).toBe('ok');
  });

  it('nadie llama la devolución del límite: ni anon ni una sesión', async () => {
    await fails(t.anon((sql) => sql.query(`select public.rate_limit_refund('lookup_device', repeat('a', 64))`)), /permission denied/);
    await fails(rows('coordinator', `select public.rate_limit_refund('lookup_device', repeat('a', 64))`), /permission denied/);
  });
});

describe('las cifras, con medianas', () => {
  it('la coordinación, auditoría y el jefe las ven, con mediana y promedio; nadie más', async () => {
    for (const who of ['coordinator', 'auditor', 'boss'] as Who[]) {
      const [r] = await rows<{ v: Record<string, unknown> }>(who, `select public.request_stats() as v`);
      expect(Object.keys(r.v), who).toEqual(expect.arrayContaining(['medianFirstResponseHours', 'medianResolutionHours', 'avgFirstResponseHours', 'answered']));
    }
    for (const who of ['areaA', 'complaints', 'writer', 'admin', 'social'] as Who[]) {
      await fails(rows(who, `select public.request_stats()`), /Las cifras de atención/);
    }
    await fails(rows('coordinator', `select public.request_stats()`, [], 'aal1'), /Las cifras de atención/);
  });

  it('la mediana es la del caso del medio: tres respuestas a las 1, 2 y 9 horas dan 2 (el promedio, 4)', async () => {
    const ids = [(await fresh()).id, (await fresh()).id, (await fresh()).id];
    const year = new Date().getFullYear() - 3;
    // Three requests of a past, empty year, answered after 1, 2 and 9 hours (the system writes the history).
    await t.system(async (sql) => {
      for (const [i, h] of [1, 2, 9].entries()) {
        await sql.query(`alter table public.requests disable trigger guard_request_update`);
        await sql.query(
          `update public.requests set created_at = make_timestamptz($2, 3, 10, 12, 0, 0, 'America/Caracas'),
                  first_response_at = make_timestamptz($2, 3, 10, 12, 0, 0, 'America/Caracas') + make_interval(hours => $3) where id = $1`,
          [ids[i], year, h],
        );
        await sql.query(`alter table public.requests enable trigger guard_request_update`);
      }
    });
    const [r] = await rows<{ v: Record<string, number> }>('coordinator', `select public.request_stats($1::date, $2::date) as v`, [`${year}-03-01`, `${year}-03-31`]);
    expect(Number(r.v.received)).toBe(3);
    expect(Number(r.v.answered)).toBe(3);
    expect(Number(r.v.medianFirstResponseHours)).toBe(2);
    expect(Number(r.v.avgFirstResponseHours)).toBe(4);
  });
});

describe('respuestas guardadas', () => {
  it('vienen sembradas; las leen quienes responden (coordinación, responsables, denuncias); nadie más', async () => {
    const seeded = await sys<{ title: string }>(`select title from public.request_reply_templates`);
    expect(seeded.length).toBeGreaterThanOrEqual(9);
    for (const who of ['coordinator', 'areaA', 'complaints'] as Who[]) {
      expect((await rows(who, `select id from public.request_reply_templates`)).length, who).toBe(seeded.length);
    }
    for (const who of ['auditor', 'writer', 'publisher', 'admin', ...TEAM] as Who[]) {
      expect(await rows(who, `select id from public.request_reply_templates`), who).toEqual([]);
    }
    expect(await rows('coordinator', `select id from public.request_reply_templates`, [], 'aal1')).toEqual([]);
    await fails(t.anon((sql) => sql.query(`select id from public.request_reply_templates`)), /permission denied/);
  });

  it('solo la coordinación las escribe; nadie las borra (se apagan)', async () => {
    await rows('coordinator', `insert into public.request_reply_templates (kind, title, body) values ('public_reply', 'Prueba de la coordinación', 'Un texto de prueba para la persona.')`);
    const id = (await sys<{ id: string }>(`select id from public.request_reply_templates where title = 'Prueba de la coordinación'`))[0].id;
    await rows('coordinator', `update public.request_reply_templates set active = false where id = $1`, [id]);
    expect((await sys<{ active: boolean }>(`select active from public.request_reply_templates where id = $1`, [id]))[0].active).toBe(false);
    for (const who of ['areaA', 'complaints', 'auditor', 'admin'] as Who[]) {
      await fails(rows(who, `insert into public.request_reply_templates (kind, title, body) values ('public_reply', 'Intento ${who}', 'Un texto de prueba para la persona.')`), /row-level security|permission denied/);
      expect(await rows(who, `update public.request_reply_templates set body = 'Cambiado por quien no debe.' where id = $1 returning id`, [id]), who).toEqual([]);
    }
    await fails(rows('coordinator', `delete from public.request_reply_templates where id = $1`, [id]), /permission denied/);
    // Who changed it stays in the audit log.
    const audit = await sys<{ action: string }>(`select action from public.audit_log where table_name = 'request_reply_templates' and row_id = $1 order by id`, [id]);
    expect(audit.map((a) => a.action)).toEqual(['insert', 'update']);
  });
});

describe('las personas de la atención (para asignar)', () => {
  it('quien asigna las ve con sus áreas; auditoría, el jefe y los demás no reciben a nadie', async () => {
    const staff = await rows<{ id: string; coordinator: boolean; reports: boolean; complaints: boolean; area_ids: string[] }>('coordinator', `select * from public.attention_staff()`);
    const byId = new Map(staff.map((x) => [x.id, x]));
    expect(byId.get(t.idOf('coordinator'))).toMatchObject({ coordinator: true });
    expect(byId.get(t.idOf('complaints'))).toMatchObject({ complaints: true });
    expect(byId.get(t.idOf('areaA'))).toMatchObject({ reports: true, area_ids: [t.area.a] });
    expect(byId.has(t.idOf('auditor'))).toBe(false);
    for (const who of ['areaA', 'complaints', 'admin'] as Who[]) expect((await rows(who, `select id from public.attention_staff()`)).length, who).toBe(staff.length);
    for (const who of ['auditor', 'boss', 'writer', 'social'] as Who[]) expect(await rows(who, `select id from public.attention_staff()`), who).toEqual([]);
    expect(await rows('coordinator', `select id from public.attention_staff()`, [], 'aal1')).toEqual([]);
    await fails(t.anon((sql) => sql.query(`select * from public.attention_staff()`)), /permission denied/);
  });
});

describe('exportar queda en el registro', () => {
  it('la coordinación exporta con o sin contacto; auditoría solo sin contacto; nadie más', async () => {
    await rows('coordinator', `select public.log_attention_export(3, '{"state":"recibido"}'::jsonb, true)`);
    await rows('auditor', `select public.log_attention_export(2, '{}'::jsonb, false)`);
    await fails(rows('auditor', `select public.log_attention_export(2, '{}'::jsonb, true)`), /Exporta la coordinación/);
    for (const who of ['areaA', 'complaints', 'boss', 'admin', 'writer'] as Who[]) {
      await fails(rows(who, `select public.log_attention_export(1, '{}'::jsonb, false)`), /Exporta la coordinación/);
    }
    await fails(rows('coordinator', `select public.log_attention_export(1, '{}'::jsonb, false)`, [], 'aal1'), /Exporta la coordinación/);
    const log = await sys<{ actor_id: string; new_data: { rows: number; with_contact: boolean } }>(
      `select actor_id, new_data from public.audit_log where table_name = 'requests' and action = 'export' order by id`,
    );
    expect(log.map((l) => [l.actor_id, l.new_data.rows, l.new_data.with_contact])).toEqual([
      [t.idOf('coordinator'), 3, true],
      [t.idOf('auditor'), 2, false],
    ]);
    // Auditoría reads that trail (and administración); the coordinator does not read the audit log.
    expect((await rows('auditor', `select id from public.audit_log where action = 'export'`)).length).toBe(2);
    expect((await rows('admin', `select id from public.audit_log where action = 'export'`)).length).toBe(2);
    expect(await rows('coordinator', `select id from public.audit_log where action = 'export'`)).toEqual([]);
  });
});

describe('la memoria de los avisos del cron', () => {
  it('request_alerts no la toca ningún rol de la API', async () => {
    const s = await fresh();
    await sys(`insert into public.request_alerts (request_id, day, reason) values ($1, current_date, 'overdue')`, [s.id]);
    for (const who of ['coordinator', 'admin'] as Who[]) {
      await fails(rows(who, `select * from public.request_alerts`), /permission denied/);
      await fails(rows(who, `insert into public.request_alerts (request_id, day, reason) values ($1, current_date - 1, 'stale')`, [s.id]), /permission denied/);
    }
    await fails(t.anon((sql) => sql.query(`select * from public.request_alerts`)), /permission denied/);
  });
});
