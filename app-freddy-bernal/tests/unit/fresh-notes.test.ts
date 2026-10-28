// «Notas de Grabación nuevas» (§5): the events where someone else left a Grabación note in the last days, the same list
// on Hoy (Redes and the boss) and in the Redes tile of the boss's Inicio (/jefe), tried against a real in-memory
// database (same migrations, RLS on). Titles only, never a date. All data here is invented.
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { makeTestDb, type TestDb } from '../rls/setup';
import { FRESH_NOTE_DAYS, freshNoteEvents } from '@/lib/data/recording';
import type { DemoUserKey } from '@/lib/db/seed-demo';

let t: TestDb;
let seeded: string;
const fresh = (who: DemoUserKey, limit = 10) => t.as(who, (sql) => freshNoteEvents(sql, limit));
const ids = async (who: DemoUserKey) => (await fresh(who, 50)).events.map((e) => e.id);
// Events of the demo with no note yet, to leave notes on (oldest code first, stable on every run).
const noteless = (n: number) =>
  t.system(async (sql) =>
    (await sql.query<{ id: string }>(
      `select e.id from public.events e
        where e.deleted_at is null and e.cancelled_at is null
          and not exists (select 1 from public.recording_notes n where n.event_id = e.id)
        order by e.code limit $1`,
      [n],
    )).map((r) => r.id),
  );
const leaveNote = (eventId: string, extra: { body?: string; daysAgo?: number; deleted?: boolean } = {}) =>
  t.system((sql) =>
    sql.query(
      `insert into public.recording_notes (event_id, kind, body, author_id, updated_at, deleted_at)
       values ($1, 'editor_note', $2, $3, now() - make_interval(days => $4::int), case when $5::boolean then now() end)`,
      [eventId, extra.body ?? 'Usa el segundo clip; el primero tiene viento (prueba).', t.ids.camera, extra.daysAgo ?? 0, extra.deleted ?? false],
    ),
  );

beforeAll(async () => {
  t = await makeTestDb();
  // The demo's note for the editor (src/lib/db/seed-parts/handoff.ts), left by «camera» on the court.
  seeded = (await t.system((sql) => sql.one<{ event_id: string }>(`select event_id from public.recording_notes where author_id = $1 limit 1`, [t.ids.camera])))!.event_id;
});

describe('notas de Grabación nuevas: quién las ve', () => {
  it('el jefe y Redes ven el evento con la nota del demo, y los dos la misma lista', async () => {
    const boss = await fresh('boss');
    expect(boss.total).toBeGreaterThan(0);
    expect(boss.events.map((e) => e.id)).toContain(seeded);
    expect(await fresh('social')).toEqual(boss);
  });

  it('quien la escribió no la ve como nueva', async () => {
    expect(await ids('camera')).not.toContain(seeded);
  });

  it('despacho, el IVT y política no reciben ninguna (RLS: no leen las notas)', async () => {
    for (const who of ['dispatch', 'ivt', 'politics'] as const) expect(await fresh(who), who).toEqual({ total: 0, events: [] });
  });

  it('solo el id y el título del evento: nunca una fecha, una hora ni el texto de la nota', async () => {
    const { events } = await fresh('boss');
    for (const e of events) expect(Object.keys(e).sort()).toEqual(['id', 'title']);
  });
});

describe('notas de Grabación nuevas: qué cuenta', () => {
  it(`una nota de hace más de ${FRESH_NOTE_DAYS} días, vacía o quitada no cuenta`, async () => {
    const [old, empty, gone, recent] = await noteless(4);
    await leaveNote(old, { daysAgo: FRESH_NOTE_DAYS + 1 });
    await leaveNote(empty, { body: '' });
    await leaveNote(gone, { deleted: true });
    await leaveNote(recent, { daysAgo: FRESH_NOTE_DAYS - 1 });
    const seen = await ids('boss');
    expect(seen).not.toContain(old);
    expect(seen).not.toContain(empty);
    expect(seen).not.toContain(gone);
    expect(seen).toContain(recent);
  });

  it('un evento cancelado deja de contar', async () => {
    const [ev] = await noteless(1);
    await leaveNote(ev);
    expect(await ids('boss')).toContain(ev);
    await t.as('boss', (sql) => sql.query(`update public.events set cancelled_at = now(), cancel_reason = 'Prueba de las notas nuevas (demo)' where id = $1`, [ev]));
    expect(await ids('boss')).not.toContain(ev);
  });

  it('`total` las cuenta todas aunque traiga solo las primeras (el inicio del jefe muestra 3)', async () => {
    // The demo's note and the recent one above (the demo has six events, all used by now).
    const all = await fresh('boss', 50);
    expect(all.total).toBeGreaterThan(1);
    expect(all.events).toHaveLength(all.total);
    const first = await fresh('boss', 1);
    expect(first.total).toBe(all.total);
    expect(first.events).toEqual(all.events.slice(0, 1));
  });
});

describe('notas de Grabación nuevas: Hoy y el inicio del jefe cuentan lo mismo', () => {
  const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), 'utf8');

  it('las dos pantallas usan freshNoteEvents, y el inicio del jefe solo para el jefe', () => {
    const hoy = read('src/app/(panel)/hoy/page.tsx');
    const jefe = read('src/app/(panel)/jefe/page.tsx');
    expect(hoy).toContain('await freshNoteEvents(sql, 10)');
    expect(hoy).not.toContain('from public.recording_notes');
    expect(jefe).toContain('notes: boss ? await freshNoteEvents(sql, SHOWN_NOTES) : null');
    // Each title opens the event's Material tab, where the notes are; the rest are in Hoy.
    expect(jefe).toContain('href: `/eventos/${e.id}?tab=material`');
    expect(jefe).toContain("href: '/hoy'");
  });
});
