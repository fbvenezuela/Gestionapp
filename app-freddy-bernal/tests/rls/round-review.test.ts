// The review of the whole round (20261028002200_round_review_fixes.sql), straight against the database as each demo
// person (RLS on), as an API client would:
//   1. a phone is refused in Grabación's note for the editor, in a community report's main text and in an event's own
//      text (Redes reads all three); a time code of the video («2:15») still passes;
//   2. a soft-deleted event is Administración's only: the camera person assigned no longer reads its date, address or
//      brief, and Redes no longer reads its brief;
//   3. an event's code is the database's (no date in it, no number taken from the next event);
//   4. an event already done keeps its date and place.
// The roles (Administración never the boss nor despacho), the 2FA list and the community contacts are in
// tests/rls/por-rol.test.ts. All data here is invented.
import { describe, expect, it, beforeAll } from 'vitest';
import { makeTestDb, type TestDb } from './setup';
import type { DemoUserKey } from '@/lib/db/seed-demo';
import { friendlyDbError } from '@/lib/db/core';

let t: TestDb;
let n = 0;

const errorOf = async (p: Promise<unknown>): Promise<{ code?: string; message: string }> => {
  try {
    await p;
  } catch (e) {
    return e as { code?: string; message: string };
  }
  throw new Error('tenía que fallar');
};
const count = async (who: DemoUserKey, q: string, params: unknown[] = [], aal: 'aal1' | 'aal2' = 'aal2') =>
  (await t.as(who, (sql) => sql.one<{ n: number }>(`select count(*)::int as n from (${q}) x`, params), aal))!.n;
// An event of the boss's agenda, with its date (in the past or the future), a brief and the camera person assigned.
async function bossEvent(startsIn: string, camera?: DemoUserKey) {
  return t.as('boss', async (sql) => {
    const id = (await sql.one<{ id: string }>(`insert into public.events (title, place_name, created_by) values ($1, 'Sitio de prueba (demo)', auth.uid()) returning id`, [
      `Evento de la revisión ${++n} (demo)`,
    ]))!.id;
    await sql.query(
      `insert into public.event_schedule (event_id, starts_at, ends_at, exact_address, site_contacts)
       values ($1, now() + $2::interval, now() + $2::interval + interval '1 hour', 'Calle de la revisión 1 (demo)', 'Enlace de la revisión (demo)')`,
      [id, startsIn],
    );
    await sql.query(`insert into public.event_brief (event_id, work_description) values ($1, 'Qué se hace (demo)')`, [id]);
    if (camera) await sql.query(`insert into public.event_assignments (event_id, user_id, duty) values ($1, $2, 'camera')`, [id, t.ids[camera]]);
    return id;
  });
}

beforeAll(async () => {
  t = await makeTestDb();
}, 120_000);

describe('un teléfono no entra en lo que lee Redes', () => {
  it('la nota de Grabación para el editor y su storyboard escrito: con teléfono no; con un tiempo del video, sí', async () => {
    const id = await bossEvent('3 days', 'camera');
    for (const kind of ['editor_note', 'storyboard_text']) {
      const e = await errorOf(t.as('camera', (sql) =>
        sql.query(`insert into public.recording_notes (event_id, kind, body) values ($1, $2, 'Para el editor: la vocera (demo) 0414-5550123 tiene más fotos')`, [id, kind]), 'aal1'));
      expect(e.code, kind).toBe('23514');
      expect(e.message, kind).toContain('recording_notes_no_phone');
      expect(friendlyDbError(e)).toMatch(/teléfono/);
    }
    await t.as('camera', (sql) => sql.query(`insert into public.recording_notes (event_id, kind, body) values ($1, 'editor_note', 'El saludo bueno está en el 2:15 y la toma aérea en el 12:40.')`, [id]), 'aal1');
    expect(await count('social', 'select 1 from public.recording_notes where event_id = $1', [id])).toBe(1);
    // Saving it again with a phone fails too.
    const e = await errorOf(t.as('camera', (sql) => sql.query(`update public.recording_notes set body = 'Llamar al 0414 555 0123' where event_id = $1`, [id]), 'aal1'));
    expect(e.code).toBe('23514');
  });

  it('el texto principal de un reporte comunitario: lo que «Ponerle fecha» copia al evento no lleva teléfonos', async () => {
    const report = (await t.as('politics', (sql) =>
      sql.one<{ id: string }>(`insert into public.community_reports (title, municipality, type, wants_agenda, created_by) values ('Fuga de agua (demo)', 'Torbes', 'event', true, auth.uid()) returning id`)))!.id;
    for (const field of ['title', 'community', 'description', 'why_matters', 'results', 'sectors', 'institution', 'in_charge', 'observations']) {
      const e = await errorOf(t.as('politics', (sql) =>
        sql.query(`update public.community_reports set ${field} = 'Fuga de agua: avisar a la vocera 0414-5550123' where id = $1`, [report]), 'aal1'));
      expect(e.message, field).toContain('community_reports_main_no_phone');
    }
    // An amount with dots is not a phone.
    await t.as('politics', (sql) => sql.query(`update public.community_reports set results = 'Se entregaron 1.500.000 litros (demo)' where id = $1`, [report]), 'aal1');
  });

  it('el evento: su título, su lugar y su resumen, al crearlo y al cambiarlo (también por «Ponerle fecha»)', async () => {
    for (const col of ['title', 'place_name', 'summary']) {
      const e = await errorOf(t.as('dispatch', (sql) =>
        sql.query(`insert into public.events (title, created_by, ${col === 'title' ? 'place_name' : col}) values ($1, auth.uid(), $2)`, [
          col === 'title' ? 'Visita: llamar al 0414-5550123' : 'Visita de la revisión (demo)',
          col === 'title' ? '' : 'Preguntar por la vocera 0414-5550123',
        ])));
      expect(e.message, col).toContain('events_main_no_phone');
    }
    const id = await bossEvent('8 days');
    const e = await errorOf(t.as('dispatch', (sql) => sql.query(`update public.events set summary = 'Contacto: 0276 555 0199' where id = $1`, [id])));
    expect(e.message).toContain('events_main_no_phone');
    const report = (await t.as('politics', (sql) =>
      sql.one<{ id: string }>(`insert into public.community_reports (title, municipality, type, wants_agenda, created_by) values ('Asamblea de la revisión (demo)', 'Torbes', 'event', true, auth.uid()) returning id`)))!.id;
    const s = await errorOf(t.as('boss', (sql) =>
      sql.query(`select public.schedule_ficha('community', $1, 'Asamblea: avisar a la vocera 0414-5550123', '', now() + interval '9 days', now() + interval '9 days 1 hour', '', '', '', '{}'::jsonb)`, [report])));
    expect(s.message).toContain('events_main_no_phone');
    expect(await count('social', `select 1 from public.events where title ~ '0414'`)).toBe(0);
  });
});

describe('un evento borrado es solo de Administración', () => {
  it('Grabación ya no lee su fecha, su dirección ni su ficha técnica; Redes, el jefe y el despacho tampoco su ficha técnica', async () => {
    const id = await bossEvent('5 days', 'camera2');
    expect(await count('camera2', 'select 1 from public.event_schedule where event_id = $1', [id], 'aal1')).toBe(1);
    expect(await t.as('admin', (sql) => sql.query(`update public.events set deleted_at = now() where id = $1 returning id`, [id]))).toHaveLength(1);
    for (const table of ['events', 'event_schedule', 'event_brief', 'event_calendar']) {
      const col = table === 'events' || table === 'event_calendar' ? 'id' : 'event_id';
      expect(await count('camera2', `select 1 from public.${table} where ${col} = $1`, [id], 'aal1'), `camera2 ${table}`).toBe(0);
    }
    for (const who of ['social', 'boss', 'dispatch'] as const) {
      expect(await count(who, 'select 1 from public.event_brief where event_id = $1', [id]), who).toBe(0);
      expect((await t.as(who, (sql) => sql.one<{ ok: boolean }>('select public.can_see_event($1) as ok', [id])))!.ok, who).toBe(false);
    }
    // Administración keeps all of it (its trash: it restores it).
    for (const table of ['event_schedule', 'event_brief']) expect(await count('admin', `select 1 from public.${table} where event_id = $1`, [id]), table).toBe(1);
    // Restored, it is back for everyone.
    await t.as('admin', (sql) => sql.query(`update public.events set deleted_at = null where id = $1`, [id]));
    expect(await count('camera2', 'select 1 from public.event_schedule where event_id = $1', [id], 'aal1')).toBe(1);
    expect(await count('social', 'select 1 from public.event_brief where event_id = $1', [id])).toBe(1);
  });
});

describe('el código del evento lo pone la base', () => {
  it('nadie le pone una fecha ni le quita el número al siguiente evento', async () => {
    const dated = (await t.as('dispatch', (sql) =>
      sql.one<{ id: string; code: string }>(`insert into public.events (title, created_by, code) values ('Otra prueba (demo)', auth.uid(), 'Visita 3-11 10am') returning id, code`)))!;
    expect(dated.code).toMatch(/^E-\d{4,}$/);
    expect((await t.as('social', (sql) => sql.one<{ code: string }>('select code from public.events where id = $1', [dated.id])))!.code).toBe(dated.code);
    const next = (await t.system((sql) => sql.one<{ c: string }>(`select 'E-' || lpad((last_value + 1)::text, 4, '0') as c from public.event_code_seq`)))!.c;
    await t.as('dispatch', (sql) => sql.query(`insert into public.events (title, created_by, code) values ('Otra prueba más (demo)', auth.uid(), $1)`, [next]));
    // The boss's next event (and «Ponerle fecha») still gets its number.
    const boss = (await t.as('boss', (sql) => sql.one<{ code: string }>(`insert into public.events (title, created_by) values ('Evento del jefe (demo)', auth.uid()) returning code`)))!;
    expect(boss.code).toMatch(/^E-\d{4,}$/);
    // The API roles no longer use the sequence; a code of another shape is refused even from the system.
    expect((await errorOf(t.as('dispatch', (sql) => sql.query(`select nextval('public.event_code_seq')`)))).code).toBe('42501');
    expect((await errorOf(t.system((sql) => sql.query(`insert into public.events (title, code) values ('Evento raro (demo)', 'Visita 3-11')`)))).message).toContain('events_code_shape');
    // The demo keeps E-0001, E-0002…
    expect(await t.system((sql) => sql.query(`select code from public.events where code !~ '^E-[0-9]{4,}$'`))).toEqual([]);
  });
});

describe('un evento realizado no se mueve', () => {
  it('ni el jefe ni el despacho le cambian la fecha o el lugar después de marcarlo realizado; antes, sí', async () => {
    const id = await bossEvent('-2 days', 'camera');
    expect(await t.as('dispatch', (sql) => sql.query(`update public.event_schedule set exact_address = 'Calle de la revisión 2 (demo)' where event_id = $1 returning event_id`, [id]))).toHaveLength(1);
    await t.as('boss', (sql) => sql.query('select public.mark_event_done($1)', [id]));
    for (const who of ['boss', 'dispatch'] as const) {
      for (const set of [`starts_at = now() + interval '20 days', ends_at = now() + interval '20 days 1 hour'`, `exact_address = 'Otra calle (demo)'`]) {
        const e = await errorOf(t.as(who, (sql) => sql.query(`update public.event_schedule set ${set} where event_id = $1`, [id])));
        expect(e.code, `${who}: ${set}`).toBe('42501');
        expect(friendlyDbError(e), who).toBe('Este evento ya se realizó: su fecha y su lugar ya no se cambian.');
      }
    }
    const row = (await t.system((sql) => sql.one<{ past: boolean; addr: string }>(`select starts_at < now() as past, exact_address as addr from public.event_schedule where event_id = $1`, [id])))!;
    expect(row).toEqual({ past: true, addr: 'Calle de la revisión 2 (demo)' });
  });
});
