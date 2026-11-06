// The security review of the public website and the attention desk (06/11/2026, docs/SEGURIDAD.md «Web pública y
// atención ciudadana: revisión del 06/11»): what an attacker tried against the database, kept as tests. Each «no
// puede» is tried for real: a receipt used on someone else's file or message, a storage key of another request, the
// rate limit after a refusal, the functions that run as their owner, and the audit trail read by Auditoría (it must
// never show what RLS keeps from it: the keys of library files not yet published and the private settings).
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll } from 'vitest';
import { makeWebTestDb, rateKey, submit, type WebTestDb, type Who } from './web-setup';

let t: WebTestDb;
beforeAll(async () => {
  t = await makeWebTestDb();
}, 120_000);

const rows = <T>(who: Who, q: string, p: unknown[] = []) => t.asWho(who, (sql) => sql.query<T>(q, p));
const sys = <T>(q: string, p: unknown[] = []) => t.system((sql) => sql.query<T>(q, p));
const anonOne = async <T>(q: string, p: unknown[] = []) => (await t.anon((sql) => sql.one<{ v: T }>(q, p)))!.v;
const attach = (reference: string, digest: string, key: string, messageId: string | null = null, device = rateKey(), ip = rateKey()) =>
  anonOne<{ status: string; id: string }>(
    `select citizen.add_request_attachment($1, $2, $3, $4, $5, 'image/jpeg', 100, 'sin_analizar', $6) as v`,
    [reference, digest, device, ip, key, messageId],
  );

describe('las funciones que corren como su dueño (SECURITY DEFINER)', () => {
  it('todas fijan su search_path: nadie las hace leer otra tabla con el mismo nombre', async () => {
    const loose = await sys<{ f: string }>(
      `select p.oid::regprocedure::text as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public', 'citizen') and p.prosecdef
          and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`,
    );
    expect(loose).toEqual([]);
    // And none of the API roles may create objects in the schemas they search.
    const create = await sys<{ ok: boolean }>(
      `select bool_or(has_schema_privilege(r, n, 'CREATE')) as ok from unnest(array['anon', 'authenticated']) r, unnest(array['public', 'citizen']) n`,
    );
    expect(create[0].ok).toBe(false);
  });
});

describe('el comprobante de una persona no abre lo de otra', () => {
  it('ni el archivo, ni el mensaje, ni la llave de almacenamiento de otra solicitud', async () => {
    const a = await submit(t, { sector: 'Sector de la revisión A (prueba)' });
    const b = await submit(t, { sector: 'Sector de la revisión B (prueba)' });
    const keyB = `${randomUUID()}.jpg`;
    const fileB = await attach(b.reference, b.receipt.digest, keyB);
    expect(fileB.status).toBe('ok');
    // B's file asked with A's receipt: the one answer.
    const cross = await anonOne(`select citizen.request_attachment($1, $2, $3, $4, $5) as v`, [a.reference, a.receipt.digest, rateKey(), rateKey(), fileB.id]);
    expect(cross).toEqual({ status: 'not_found' });
    // A file «with» B's message, sent with A's receipt: refused.
    const msgB = await anonOne<{ id: string }>(`select citizen.add_citizen_message($1, $2, $3, $4, 'Un dato más (prueba)') as v`, [b.reference, b.receipt.digest, rateKey(), rateKey()]);
    await expect(attach(a.reference, a.receipt.digest, `${randomUUID()}.jpg`, msgB.id)).rejects.toThrow(/no es de esta solicitud/);
    // B's stored file registered again under A (by the citizen or by the team): the key is unique, refused.
    await expect(attach(a.reference, a.receipt.digest, keyB)).rejects.toThrow(/storage_key/);
    await sys(`update public.requests set area_id = $2 where id = $1`, [a.id, t.area.a]);
    await expect(rows('areaA', `select public.add_request_evidence($1, $2, 'image/jpeg', 100, 'sin_analizar', true) as v`, [a.id, keyB])).rejects.toThrow(/storage_key/);
  });

  it('pasado el límite, la negativa deshace su propio intento pero el contador sigue arriba: el siguiente también se niega', async () => {
    const device = rateKey('revision-limite');
    for (let i = 0; i < 10; i++) {
      expect(await anonOne(`select citizen.lookup_request('AC-2026-AAAAAA', $1, $2, $3) as v`, ['0'.repeat(64), device, rateKey()])).toEqual({ status: 'not_found' });
    }
    for (let i = 0; i < 2; i++) {
      await expect(anonOne(`select citizen.lookup_request('AC-2026-AAAAAA', $1, $2, $3) as v`, ['0'.repeat(64), device, rateKey()])).rejects.toMatchObject({ code: 'P0429' });
    }
    expect(await sys(`select hits from public.rate_limits where bucket = 'lookup_device' and key = $1`, [device])).toEqual([{ hits: 10 }]);
  });
});

describe('la auditoría no muestra lo que RLS le guarda a quien la lee', () => {
  it('auditoría no lee la biblioteca: tampoco la llave ni las palabras de un archivo en el registro', async () => {
    const key = `${randomUUID()}.jpg`;
    const [m] = await rows<{ id: string }>('writer',
      `insert into public.web_media (storage_key, kind, mime, bytes, width, height, alt, caption) values ($1, 'image', 'image/jpeg', 100, 800, 600, 'Foto sin publicar (prueba)', 'Pie reservado (prueba)') returning id`,
      [key]);
    await rows('writer', `update public.web_media set caption = 'Otro pie reservado (prueba)' where id = $1`, [m.id]);
    expect(await rows('auditor', `select storage_key from public.web_media where id = $1`, [m.id])).toEqual([]);
    const trail = await rows<{ action: string; old_data: unknown; new_data: Record<string, unknown> }>('auditor',
      `select action, old_data, new_data from public.audit_log where table_name = 'web_media' and row_id = $1 order by id`, [m.id]);
    expect(trail.map((r) => r.action)).toEqual(['insert', 'update']);
    expect(JSON.stringify(trail)).not.toContain(key);
    expect(JSON.stringify(trail)).not.toMatch(/sin publicar|reservado/);
    // Still who, when and which fields.
    expect(trail[1].new_data).toMatchObject({ id: m.id, kind: 'image', content_fields: ['caption'] });
    // Administración reads the library itself, as before.
    expect(await rows('admin', `select storage_key from public.web_media where id = $1`, [m.id])).toEqual([{ storage_key: key }]);
  });

  it('las notas internas del sitio (ajuste privado) no salen en el registro; un ajuste público sí guarda su valor', async () => {
    await rows('publisher', `insert into public.web_settings (key, value, is_public) values ('site.internal_notes', '{"site.whatsapp_channel":"Verificado por teléfono con la oficina (prueba)"}', false)
      on conflict (key) do update set value = excluded.value, is_public = false`);
    expect(await rows('auditor', `select key from public.web_settings where key = 'site.internal_notes'`)).toEqual([]);
    const notes = await rows('auditor', `select old_data, new_data from public.audit_log where table_name = 'web_settings' and row_id = 'site.internal_notes'`);
    expect(notes.length).toBeGreaterThan(0);
    expect(JSON.stringify(notes)).not.toMatch(/Verificado por teléfono/);
    await rows('publisher', `insert into public.web_settings (key, value, is_public) values ('site.demo_banner', '"Versión de prueba (revisión)"', true)
      on conflict (key) do update set value = excluded.value`);
    const banner = await rows('auditor', `select new_data from public.audit_log where table_name = 'web_settings' and row_id = 'site.demo_banner' order by id desc limit 1`);
    expect(JSON.stringify(banner)).toMatch(/Versión de prueba \(revisión\)/);
  });
});

describe('las funciones ciudadanas solo le contestan a la app', () => {
  it('una llamada por la Data API de Supabase (llega con request.headers) se niega; la de la app, igual que siempre', async () => {
    const viaApi = (q: string, p: unknown[]) =>
      t.anon(async (sql) => {
        await sql.query(`select set_config('request.headers', '{"host":"proyecto.supabase.co","x-forwarded-for":"203.0.113.9"}', true)`);
        return sql.one(q, p);
      });
    const lookupQ = `select citizen.lookup_request('AC-2026-AAAAAA', $1, $2, $3) as v`;
    await expect(viaApi(lookupQ, ['0'.repeat(64), rateKey(), rateKey()])).rejects.toMatchObject({ code: '42501' });
    await expect(viaApi(`select citizen.similar_requests($1, $2, $3) as v`, [rateKey(), rateKey(), t.category('agua')])).rejects.toMatchObject({ code: '42501' });
    // From the app it answers as before.
    expect(await anonOne(lookupQ, ['0'.repeat(64), rateKey(), rateKey()])).toEqual({ status: 'not_found' });
    expect((await submit(t, { sector: 'Sector de la revisión C (prueba)' })).status).toBe('ok');
  });
});
