// The ficha inside its event (cambios del 27/10/2026, §4.1), read the way the event page and modo lectura read it
// (linkedFicha, as each person, RLS on), against the demo: the visit to the puente La Quebrada (O-0001, with two
// invented photos). Redes and the camera person assigned get the obra's main part and its photos, never its
// contacts, even when the page asks for them; the boss and despacho get the contacts only with 2FA; nobody outside
// the obra's own roles gets a report. All data here is invented.
import { describe, expect, it, beforeAll } from 'vitest';
import { makeTestDb, type TestDb } from './setup';
import { linkedFicha } from '@/lib/data/events';
import { beforeSpeaking, fichaTab } from '@/lib/domain/ficha-tab';
import type { DemoUserKey } from '@/lib/db/seed-demo';

let t: TestDb;
let visit: { id: string; obra_ficha_id: string; community_report_id: string | null };
let reportEvent: { id: string; obra_ficha_id: string | null; community_report_id: string };
let assigned: DemoUserKey;
let other: DemoUserKey;
const SECRETS = ['0000-0000101', '0000-0000102', 'Vocero comunal (demo)', 'Enlace comunitario (demo)', 'La comunidad pide alumbrado'];

beforeAll(async () => {
  t = await makeTestDb();
  visit = (await t.system((sql) => sql.one(`select id, obra_ficha_id, community_report_id from public.events where obra_ficha_id is not null and deleted_at is null limit 1`)))!;
  reportEvent = (await t.system((sql) => sql.one(`select id, obra_ficha_id, community_report_id from public.events where community_report_id is not null and deleted_at is null limit 1`)))!;
  const cams = await t.system((sql) => sql.query<{ user_id: string }>(`select user_id from public.event_assignments where event_id = $1 and duty = 'camera'`, [visit.id]));
  assigned = cams.some((c) => c.user_id === t.ids.camera) ? 'camera' : 'camera2';
  other = assigned === 'camera' ? 'camera2' : 'camera';
}, 120_000);

const read = (who: DemoUserKey, ev: { obra_ficha_id: string | null; community_report_id: string | null }, aal: 'aal1' | 'aal2' = 'aal2') =>
  t.as(who, (sql) => linkedFicha(sql, ev, { contacts: true, media: true }), aal);

describe('la ficha de obra dentro de su visita', () => {
  it('el jefe y el despacho, con doble factor: la ficha, sus fotos y sus contactos', async () => {
    for (const who of ['boss', 'dispatch'] as const) {
      const f = await read(who, visit);
      expect(f?.kind, who).toBe('obra');
      expect(f?.code, who).toBe('O-0001');
      expect(f?.priv?.liaison_name, who).toBe('Enlace comunitario (demo)');
      expect(f?.media.map((m) => m.kind).sort(), who).toEqual(['before', 'progress']);
      expect(f?.fab, who).toMatch(/\S/);
      expect(beforeSpeaking('obra', f!.priv).map((b) => b.value)).toContain('Vocero comunal (demo)');
    }
  });

  it('sin doble factor, el despacho no recibe los contactos (aunque la página los pida)', async () => {
    const f = await read('dispatch', visit, 'aal1');
    expect(f?.code).toBe('O-0001');
    expect(f?.priv).toBeNull();
  });

  it('Redes y quien graba la visita: la parte principal y las fotos, nunca los contactos', async () => {
    for (const who of ['social', 'social2', assigned] as const) {
      const f = await read(who, visit);
      expect(f?.code, who).toBe('O-0001');
      expect(f?.priv, who).toBeNull();
      expect(f?.media.length, who).toBe(2);
      // What the tab shows them carries no contact, even with the private part forced in.
      const tab = JSON.stringify(fichaTab('obra', f!.row, f!.priv, { contacts: false }));
      for (const s of SECRETS) expect(tab, `${who}: ${s}`).not.toContain(s);
      // And the main row itself never holds the private columns.
      for (const k of ['liaison_name', 'liaison_phone', 'reporter_name', 'engineer_phone', 'boss_should_know']) expect(f!.row, `${who}: ${k}`).not.toHaveProperty(k);
    }
  });

  it('quien graba otro evento no recibe nada', async () => {
    expect(await read(other, visit)).toBeNull();
  });

  it('un reporte comunitario: el jefe sí; Redes y Grabación nunca, ni desde su evento', async () => {
    const boss = await read('boss', reportEvent);
    expect(boss?.kind).toBe('report');
    expect(boss?.fab).toBe('');
    for (const who of ['social', 'social2', 'camera', 'camera2'] as const) expect(await read(who, reportEvent), who).toBeNull();
  });
});
