// Material and Grabación's handoff (cambios del 27/10/2026, §4.1, §5 and §6), tried against the database:
// the five new kinds and who uploads each (Grabación its storyboard only on its own event; the boss any kind; the
// IVT obra photos and política report evidence, mirror images), one parent per file, files that never move, the
// thumbnails closed to every API role, and recording_notes (the note for the editor and the typed storyboard). All
// data here is invented.
import { describe, it, expect, beforeAll } from 'vitest';
import { makeTestDb, type TestDb } from './setup';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import { CAMERA_KINDS, MEDIA_KINDS, OBRA_KINDS, REPORT_KINDS } from '@/lib/domain/media-mime';
import { getHandoff } from '@/lib/data/recording';
import { DEMO_EDITOR_NOTE } from '@/lib/db/seed-parts/handoff';

let t: TestDb;
const ALL: DemoUserKey[] = DEMO_USERS.map((u) => u.key);

const fails = async (p: Promise<unknown>, msg?: RegExp) => {
  if (msg) await expect(p).rejects.toThrow(msg);
  else await expect(p).rejects.toThrow();
};

type Where = { event?: string | null; obra?: string | null; report?: string | null };
let pathN = 0;
const upload = (who: DemoUserKey, kind: string, where: Where = {}, mime = 'image/jpeg') =>
  t.as(who, async (sql) =>
    (await sql.one<{ id: string }>(
      `insert into public.media_assets (event_id, obra_ficha_id, community_report_id, kind, mime, storage_path, uploaded_by)
       values ($1, $2, $3, $4, $5, $6, auth.uid()) returning id`,
      [where.event ?? null, where.obra ?? null, where.report ?? null, kind, mime, `prueba/${++pathN}-${crypto.randomUUID()}.bin`],
    ))!.id,
  );
// The same insert without RETURNING: only the insert rule decides (not whether the new row is readable after).
const insertOnly = (who: DemoUserKey, kind: string, where: Where = {}, mime = 'image/jpeg') =>
  t.as(who, (sql) =>
    sql.query(
      `insert into public.media_assets (event_id, obra_ficha_id, community_report_id, kind, mime, storage_path, uploaded_by)
       values ($1, $2, $3, $4, $5, $6, auth.uid())`,
      [where.event ?? null, where.obra ?? null, where.report ?? null, kind, mime, `prueba/${++pathN}-${crypto.randomUUID()}.bin`],
    ),
  );
const count = async (who: DemoUserKey, q: string, params: unknown[] = []) =>
  (await t.as(who, (sql) => sql.one<{ n: number }>(`select count(*)::int as n from (${q}) x`, params)))!.n;
const mimeFor = (kind: string) => (kind === 'boss' || kind === 'drone' || kind === 'broll' || kind === 'other' || kind === 'final' || kind === 'voice_line' ? 'video/mp4' : 'image/jpeg');

let camEvent: string; // assigned to «camera», not to «camera2»
let otherEvent: string; // assigned to neither camera person
let obra: string;
let report: string;

beforeAll(async () => {
  t = await makeTestDb();
  const ev = await t.system((sql) =>
    sql.one<{ id: string }>(
      `select e.id from public.events e join public.event_assignments a on a.event_id = e.id and a.user_id = $1
        where not exists (select 1 from public.event_assignments b where b.event_id = e.id and b.user_id = $2) order by e.code limit 1`,
      [t.ids.camera, t.ids.camera2],
    ),
  );
  camEvent = ev!.id;
  const other = await t.system((sql) =>
    sql.one<{ id: string }>(
      `select e.id from public.events e where not exists (select 1 from public.event_assignments a where a.event_id = e.id and a.user_id = any($1::uuid[]))
        order by e.code limit 1`,
      [[t.ids.camera, t.ids.camera2]],
    ),
  );
  otherEvent = other!.id;
  obra = (await t.as('ivt', (sql) => sql.one<{ id: string }>(`insert into public.obra_fichas (name, municipality) values ('Obra de material (demo)', 'Junín') returning id`)))!.id;
  report = (await t.as('politics', (sql) =>
    sql.one<{ id: string }>(`insert into public.community_reports (title, municipality, type) values ('Reporte de material (demo)', 'Torbes', 'repair') returning id`),
  ))!.id;
});

describe('la entrega de Grabación como la ve cada uno (getHandoff, con RLS)', () => {
  it('la demo trae, en un evento de Grabación, su storyboard (con miniatura) y su nota para el editor', async () => {
    const sb = await t.system((sql) =>
      sql.one<{ id: string; uploaded_by: string; thumb: boolean }>(
        `select m.id, m.uploaded_by, exists (select 1 from public.media_thumbs th where th.media_id = m.id) as thumb
           from public.media_assets m where m.event_id = $1 and m.kind = 'storyboard' and m.storage_path like '%demo-storyboard-1.jpg'`,
        [camEvent],
      ),
    );
    expect(sb).toMatchObject({ uploaded_by: t.ids.camera, thumb: true });
    const note = await t.system((sql) => sql.one<{ body: string; author_id: string }>(`select body, author_id from public.recording_notes where event_id = $1 and kind = 'editor_note'`, [camEvent]));
    expect(note).toEqual({ body: DEMO_EDITOR_NOTE, author_id: t.ids.camera });
  });

  it('Redes, el jefe, administración y Grabación asignada ven nota y storyboard; el despacho solo el archivo; los demás nada', async () => {
    const view = (who: DemoUserKey) => t.as(who, (sql) => getHandoff(sql, camEvent));
    for (const who of ['admin', 'boss', 'social', 'social2', 'camera'] as const) {
      const h = await view(who);
      const note = h.notes.find((n) => n.kind === 'editor_note');
      expect(note?.author, who).toBe('Kevin');
      expect(note?.mine, who).toBe(who === 'camera');
      expect(h.storyboards.some((m) => m.label === 'Storyboard 1'), who).toBe(true);
      // No time of any kind comes back (Redes never gets one from here).
      expect(JSON.stringify(h), who).not.toMatch(/created_at|updated_at|starts_at|\d{4}-\d{2}-\d{2}T/);
    }
    const dispatch = await view('dispatch');
    expect(dispatch.notes).toEqual([]);
    expect(dispatch.storyboards.length).toBeGreaterThan(0);
    for (const who of ['camera2', 'ivt', 'politics'] as const) expect(await view(who), who).toEqual({ notes: [], storyboards: [] });
  });
});

describe('material: los tipos nuevos y quién sube cada uno', () => {
  it('Grabación sube el storyboard con el que grabó (foto o PDF) solo en su propio evento', async () => {
    expect(await upload('camera', 'storyboard', { event: camEvent }, 'image/jpeg')).toBeTruthy();
    expect(await upload('camera', 'storyboard', { event: camEvent }, 'application/pdf')).toBeTruthy();
    await fails(upload('camera', 'storyboard', { event: otherEvent }));
    await fails(upload('camera2', 'storyboard', { event: camEvent }));
    // Its raw kinds still go; finals, covers, screenshots and ficha photos never.
    for (const kind of CAMERA_KINDS) expect(await upload('camera', kind, { event: camEvent }, kind === 'storyboard' ? 'image/png' : 'video/mp4')).toBeTruthy();
    for (const kind of ['final', 'cover', 'editable', 'voice_line', 'evidence', 'tweet_image', 'before', 'progress', 'after', 'document']) {
      await fails(upload('camera', kind, { event: camEvent }), undefined);
    }
    await fails(upload('camera', 'before', { obra }));
    await fails(upload('camera', 'evidence'));
  });

  it('un storyboard sin evento, o que no es foto ni PDF, no entra para nadie', async () => {
    for (const who of ['admin', 'boss', 'social'] as const) await fails(upload(who, 'storyboard', {}, 'image/jpeg'), /storyboard_shape|check constraint/);
    await fails(upload('camera', 'storyboard', { event: camEvent }, 'video/mp4'), /storyboard_shape|check constraint/);
    await fails(upload('boss', 'storyboard', { event: camEvent }, 'image/svg+xml'), /storyboard_shape|check constraint/);
    await fails(upload('social', 'storyboard', { event: camEvent }, 'application/zip'), /storyboard_shape|check constraint/);
    await fails(t.system((sql) => sql.query(`insert into public.media_assets (kind, mime, storage_path) values ('storyboard', 'image/jpeg', 'sistema/storyboard.jpg')`)));
  });

  it('el jefe sube cualquier tipo: material, final, portada, captura, audio, storyboard, y fotos de obra y de reporte', async () => {
    for (const kind of ['boss', 'drone', 'broll', 'other', 'final', 'cover', 'editable', 'voice_line', 'evidence', 'tweet_image']) {
      expect(await upload('boss', kind, { event: camEvent }, mimeFor(kind)), kind).toBeTruthy();
      expect(await upload('boss', kind, {}, mimeFor(kind)), kind).toBeTruthy();
    }
    expect(await upload('boss', 'storyboard', { event: otherEvent }, 'image/webp')).toBeTruthy();
    for (const kind of OBRA_KINDS) expect(await upload('boss', kind, { obra }), kind).toBeTruthy();
    for (const kind of REPORT_KINDS) expect(await upload('boss', kind, { report }), kind).toBeTruthy();
  });

  it('el IVT sube fotos y documentos de la obra; nunca evidencia de un reporte ni material de un evento', async () => {
    for (const kind of OBRA_KINDS) expect(await upload('ivt', kind, { obra }), kind).toBeTruthy();
    await fails(upload('ivt', 'after', { obra }));
    for (const kind of REPORT_KINDS) await fails(upload('ivt', kind, { report }));
    for (const kind of ['boss', 'storyboard', 'final']) await fails(upload('ivt', kind, { event: camEvent }));
    for (const kind of ['evidence', 'cover', 'tweet_image']) await fails(upload('ivt', kind));
    expect(await count('ivt', `select 1 from public.media_assets where obra_ficha_id = $1`, [obra])).toBeGreaterThanOrEqual(3);
    expect(await count('ivt', `select 1 from public.media_assets where community_report_id is not null`)).toBe(0);
    expect(await count('ivt', `select 1 from public.media_assets where event_id is not null`)).toBe(0);
    expect(await count('ivt', `select 1 from public.media_assets where event_id is null and obra_ficha_id is null and community_report_id is null`)).toBe(0);
  });

  it('el director de política, al revés: evidencia de su reporte sí, fotos de obra y material de evento no', async () => {
    for (const kind of REPORT_KINDS) expect(await upload('politics', kind, { report }), kind).toBeTruthy();
    await fails(upload('politics', 'progress', { report }));
    for (const kind of OBRA_KINDS) await fails(upload('politics', kind, { obra }));
    for (const kind of ['boss', 'storyboard', 'final']) await fails(upload('politics', kind, { event: camEvent }));
    await fails(upload('politics', 'evidence'));
    expect(await count('politics', `select 1 from public.media_assets where community_report_id = $1`, [report])).toBeGreaterThanOrEqual(3);
    expect(await count('politics', `select 1 from public.media_assets where obra_ficha_id is not null`)).toBe(0);
    expect(await count('politics', `select 1 from public.media_assets where event_id is not null`)).toBe(0);
  });

  it('el despacho sube a las dos fichas, pero no material de un evento ni archivos de piezas', async () => {
    expect(await upload('dispatch', 'before', { obra })).toBeTruthy();
    expect(await upload('dispatch', 'after', { report })).toBeTruthy();
    await fails(upload('dispatch', 'boss', { event: camEvent }, 'video/mp4'));
    await fails(upload('dispatch', 'evidence'));
  });

  it('Redes no sube nada a una ficha; nunca ve la evidencia de un reporte; ve las fotos de una obra cuando su visita ya está en la agenda', async () => {
    for (const kind of OBRA_KINDS) await fails(upload('social', kind, { obra }));
    for (const kind of REPORT_KINDS) await fails(upload('social', kind, { report }));
    const seen = (who: DemoUserKey, col: string, id: string) => count(who, `select 1 from public.media_assets where ${col} = $1`, [id]);
    for (const who of ['social', 'social2', 'camera', 'camera2'] as const) {
      expect(await seen(who, 'obra_ficha_id', obra), who).toBe(0);
      expect(await seen(who, 'community_report_id', report), who).toBe(0);
    }
    // The visit of this obra is camera's event: Redes and that camera person see its photos; camera2 does not.
    await t.system((sql) => sql.query(`update public.events set obra_ficha_id = $1 where id = $2`, [obra, camEvent]));
    await t.system((sql) => sql.query(`update public.events set community_report_id = $1 where id = $2`, [report, otherEvent]));
    try {
      const n = await seen('boss', 'obra_ficha_id', obra);
      expect(n).toBeGreaterThan(0);
      // Its photos, not its documents (20261027002100_obra_documents.sql).
      const photos = await count('boss', `select 1 from public.media_assets where obra_ficha_id = $1 and kind in ('before', 'progress')`, [obra]);
      expect(photos).toBeGreaterThan(0);
      expect(photos).toBeLessThan(n);
      for (const who of ['social', 'social2', 'camera'] as const) expect(await seen(who, 'obra_ficha_id', obra), who).toBe(photos);
      expect(await seen('camera2', 'obra_ficha_id', obra)).toBe(0);
      // A report linked to an event stays closed to Redes and Grabación.
      for (const who of ['social', 'social2', 'camera', 'camera2'] as const) expect(await seen(who, 'community_report_id', report), who).toBe(0);
      expect(await seen('boss', 'community_report_id', report)).toBeGreaterThan(0);
      // Seeing the obra's photos is not uploading to it (the insert rule alone, with no RETURNING to read it back).
      for (const kind of OBRA_KINDS) {
        await fails(insertOnly('social', kind, { obra }), /row-level security/);
        await fails(insertOnly('camera', kind, { obra }), /row-level security/);
      }
      for (const kind of REPORT_KINDS) await fails(insertOnly('social', kind, { report }), /row-level security/);
    } finally {
      await t.system((sql) => sql.query(`update public.events set obra_ficha_id = null, community_report_id = null where id = any($1::uuid[])`, [[camEvent, otherEvent]]));
    }
  });

  it('un archivo va en un solo lugar: con dos padres no entra, ni para administración ni para el sistema', async () => {
    await fails(upload('admin', 'before', { event: camEvent, obra }));
    await fails(upload('admin', 'document', { event: camEvent, report }));
    await fails(upload('boss', 'document', { obra, report }));
    await fails(t.system((sql) =>
      sql.query(`insert into public.media_assets (event_id, obra_ficha_id, kind, mime, storage_path) values ($1, $2, 'before', 'image/jpeg', 'sistema/dos.jpg')`, [camEvent, obra]),
    ), /one_parent|check constraint/);
    // And the ficha kinds never go anywhere but their ficha.
    await fails(t.system((sql) => sql.query(`insert into public.media_assets (event_id, kind, mime, storage_path) values ($1, 'before', 'image/jpeg', 'sistema/antes.jpg')`, [camEvent])), /parent_kinds|check constraint/);
    await fails(t.system((sql) => sql.query(`insert into public.media_assets (obra_ficha_id, kind, mime, storage_path) values ($1, 'after', 'image/jpeg', 'sistema/despues.jpg')`, [obra])), /parent_kinds|check constraint/);
    await fails(t.system((sql) => sql.query(`insert into public.media_assets (community_report_id, kind, mime, storage_path) values ($1, 'final', 'video/mp4', 'sistema/final.mp4')`, [report])), /parent_kinds|check constraint/);
  });

  it('un archivo subido no se pasa a otro evento, ficha o reporte, ni lo hace administración', async () => {
    const onObra = await upload('ivt', 'before', { obra });
    const other = (await t.as('ivt', (sql) => sql.one<{ id: string }>(`insert into public.obra_fichas (name, municipality) values ('Otra obra (demo)', 'Junín') returning id`)))!.id;
    for (const who of ['ivt', 'admin', 'boss'] as const) {
      await fails(t.as(who, (sql) => sql.query(`update public.media_assets set obra_ficha_id = $1 where id = $2`, [other, onObra])), /no se reemplaza/);
    }
    const onReport = await upload('politics', 'before', { report });
    await fails(t.as('admin', (sql) => sql.query(`update public.media_assets set community_report_id = null, obra_ficha_id = $1 where id = $2`, [obra, onReport])), /no se reemplaza/);
    const onEvent = await upload('camera', 'boss', { event: camEvent }, 'video/mp4');
    await fails(t.as('admin', (sql) => sql.query(`update public.media_assets set event_id = $1 where id = $2`, [otherEvent, onEvent])), /no se reemplaza/);
    // The label can still be fixed, and the uploader finishes their own upload.
    expect(await t.as('ivt', (sql) => sql.one<{ status: string }>(`update public.media_assets set status = 'ready' where id = $1 returning status`, [onObra]))).toEqual({ status: 'ready' });
  });

  it('las miniaturas: ningún rol de la API las lee ni las escribe', async () => {
    const id = await upload('camera', 'boss', { event: camEvent }, 'video/mp4');
    await t.system((sql) => sql.query(`insert into public.media_thumbs (media_id, mime, bytes) values ($1, 'image/jpeg', '\\xffd8ffd9'::bytea)`, [id]));
    for (const who of ALL) {
      await fails(t.as(who, (sql) => sql.query(`select * from public.media_thumbs`)), /permission denied/);
      await fails(t.as(who, (sql) => sql.query(`insert into public.media_thumbs (media_id, mime, bytes) values ($1, 'image/jpeg', '\\xffd8ffd9'::bytea)`, [id])), /permission denied/);
      await fails(t.as(who, (sql) => sql.query(`update public.media_thumbs set bytes = '\\xffd8ffd9'::bytea`)), /permission denied/);
    }
  });

  it('las reglas del material ya no nombran a Supervisión ni a Secretaría', async () => {
    const rows = await t.system((sql) =>
      sql.query<{ policyname: string; qual: string | null; with_check: string | null }>(
        `select policyname, qual, with_check from pg_policies where schemaname = 'public' and tablename in ('media_assets', 'recording_notes')`,
      ),
    );
    expect(rows.map((r) => r.policyname).sort()).toEqual(['media_insert', 'media_select', 'media_update', 'rn_insert', 'rn_select', 'rn_update']);
    for (const r of rows) expect(`${r.qual} ${r.with_check}`, r.policyname).not.toMatch(/supervisor|secretary/);
    // Every kind in the CHECK is one the app knows.
    const def = await t.system((sql) => sql.one<{ def: string }>(`select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'media_assets_kind_check'`));
    expect([...def!.def.matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]).sort()).toEqual([...MEDIA_KINDS].sort());
  });

  it('una pieza sin aprobar no sale: el aviso nombra al jefe, ya no a Supervisión', async () => {
    const piece = await t.as('social', (sql) => sql.one<{ id: string }>(`insert into public.pieces (kind, title) values ('video', 'Pieza sin aprobar (demo)') returning id`));
    await fails(
      t.as('social', (sql) => sql.query(`insert into public.publications (piece_id, network, copy_body, status, url) values ($1, 'instagram', 'Copy', 'published', 'https://example.com/p')`, [piece!.id])),
      /La pieza no está aprobada por el jefe\./,
    );
    const src = await t.system((sql) => sql.one<{ src: string }>(`select prosrc as src from pg_proc where proname = 'guard_publication'`));
    expect(src!.src).not.toMatch(/supervisi/i);
  });
});

describe('notas de Grabación (para el editor y el storyboard escrito)', () => {
  type Note = { id: string; body: string; author_id: string };
  const write = (who: DemoUserKey, eventId: string, kind: 'editor_note' | 'storyboard_text', body: string) =>
    t.as(who, async (sql) =>
      (await sql.one<Note>(
        `insert into public.recording_notes (event_id, kind, body) values ($1, $2, $3)
         on conflict (event_id, author_id, kind) where deleted_at is null do update set body = excluded.body
         returning id, body, author_id`,
        [eventId, kind, body],
      ))!,
    );
  const notesOf = (who: DemoUserKey, eventId: string) => count(who, `select 1 from public.recording_notes where event_id = $1`, [eventId]);

  it('Grabación escribe las suyas en su evento (y las vuelve a guardar); en otro evento o a nombre de otro, no', async () => {
    const a = await write('camera', camEvent, 'editor_note', 'Lo mejor está en el segundo clip (demo).');
    expect(a.author_id).toBe(t.ids.camera);
    const b = await write('camera', camEvent, 'editor_note', 'Mejor el tercer clip (demo).');
    expect(b.id).toBe(a.id);
    expect(b.body).toBe('Mejor el tercer clip (demo).');
    expect((await write('camera', camEvent, 'storyboard_text', 'Abrir con el dron, luego el saludo (demo).')).author_id).toBe(t.ids.camera);
    await fails(write('camera', otherEvent, 'editor_note', 'No es mi evento (demo).'));
    await fails(write('camera2', camEvent, 'editor_note', 'No estoy asignada (demo).'));
    await fails(t.as('camera', (sql) => sql.query(`insert into public.recording_notes (event_id, kind, body, author_id) values ($1, 'editor_note', 'Ajena', $2)`, [camEvent, t.ids.boss])));
    // One live note per person, event and kind.
    await fails(t.as('camera', (sql) => sql.query(`insert into public.recording_notes (event_id, kind, body) values ($1, 'editor_note', 'Repetida')`, [camEvent])), /duplicate|unique/);
  });

  it('las leen administración, el jefe, Redes y Grabación asignada; Grabación sin asignar, despacho, IVT y política no', async () => {
    for (const who of ['admin', 'boss', 'social', 'social2', 'camera'] as const) expect(await notesOf(who, camEvent), who).toBe(2);
    for (const who of ['camera2', 'dispatch', 'ivt', 'politics'] as const) expect(await notesOf(who, camEvent), who).toBe(0);
  });

  it('Redes lee pero no escribe ni cambia; el jefe escribe la suya en cualquier evento; nadie cambia la de otro', async () => {
    await fails(write('social', camEvent, 'editor_note', 'Redes no escribe aquí (demo).'));
    for (const who of ['social', 'boss', 'camera2', 'dispatch'] as const) {
      const r = await t.as(who, (sql) => sql.query(`update public.recording_notes set body = 'Cambiada' where event_id = $1 returning id`, [camEvent]));
      expect(r, who).toHaveLength(0);
    }
    expect((await write('boss', otherEvent, 'editor_note', 'Nota del jefe (demo).')).author_id).toBe(t.ids.boss);
    // Nobody writes one in Grabación's name (the boss and Redes neither).
    for (const who of ['boss', 'social'] as const) {
      await fails(t.as(who, (sql) => sql.query(`insert into public.recording_notes (event_id, kind, body, author_id) values ($1, 'editor_note', 'A nombre de Grabación', $2)`, [camEvent, t.ids.camera])), /row-level security/);
    }
    for (const who of ['dispatch', 'ivt', 'politics', 'admin'] as const) await fails(write(who, camEvent, 'storyboard_text', 'No me toca (demo).'));
  });

  it('una nota no cambia de evento, tipo ni autor, ni siquiera para administración', async () => {
    const n = await write('camera', camEvent, 'editor_note', 'Nota fija (demo).');
    await fails(t.as('camera', (sql) => sql.query(`update public.recording_notes set kind = 'storyboard_text' where id = $1`, [n.id])), /no cambia/);
    await fails(t.as('camera', (sql) => sql.query(`update public.recording_notes set event_id = $1 where id = $2`, [otherEvent, n.id])), /no cambia/);
    await fails(t.as('admin', (sql) => sql.query(`update public.recording_notes set author_id = $1 where id = $2`, [t.ids.admin, n.id])), /no cambia/);
  });

  it('solo administración la quita (queda en el registro) y nadie la borra de verdad', async () => {
    const n = await write('camera', camEvent, 'storyboard_text', 'Para quitar (demo).');
    await fails(t.as('camera', (sql) => sql.query(`update public.recording_notes set deleted_at = now() where id = $1`, [n.id])), /administrador/);
    // The boss and Redes cannot remove it either (it is not theirs: the row is not even theirs to update).
    for (const who of ['boss', 'social'] as const) {
      expect(await t.as(who, (sql) => sql.query(`update public.recording_notes set deleted_at = now() where id = $1 returning id`, [n.id])), who).toHaveLength(0);
    }
    for (const who of ['camera', 'admin', 'boss'] as const) {
      await fails(t.as(who, (sql) => sql.query(`delete from public.recording_notes where id = $1`, [n.id])), /permission denied/);
    }
    await t.as('admin', (sql) => sql.query(`update public.recording_notes set deleted_at = now() where id = $1`, [n.id]));
    expect(await count('camera', `select 1 from public.recording_notes where id = $1`, [n.id])).toBe(0);
    expect(await count('social', `select 1 from public.recording_notes where id = $1`, [n.id])).toBe(0);
    expect(await count('admin', `select 1 from public.recording_notes where id = $1`, [n.id])).toBe(1);
    // A new one can be written after (the unique rule counts live notes only).
    expect((await write('camera', camEvent, 'storyboard_text', 'La nueva (demo).')).id).not.toBe(n.id);
    // Written by Grabación (insert, then saved again: update), removed by admin (soft_delete), each with its actor.
    const audit = await t.system((sql) =>
      sql.query<{ action: string; actor_id: string }>(`select action, actor_id from public.audit_log where table_name = 'recording_notes' and row_id = $1 order by id`, [n.id]),
    );
    expect(audit[0]).toEqual({ action: 'insert', actor_id: t.ids.camera });
    expect(audit.at(-1)).toEqual({ action: 'soft_delete', actor_id: t.ids.admin });
    expect(audit.slice(1, -1).every((a) => a.action === 'update' && a.actor_id === t.ids.camera)).toBe(true);
  });

  it('sin fecha, hora ni dirección: la tabla no tiene dónde guardarlas', async () => {
    const cols = await t.system((sql) =>
      sql.query<{ column_name: string }>(`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'recording_notes' order by column_name`),
    );
    expect(cols.map((c) => c.column_name)).toEqual(['author_id', 'body', 'created_at', 'deleted_at', 'event_id', 'id', 'kind', 'updated_at']);
  });
});
