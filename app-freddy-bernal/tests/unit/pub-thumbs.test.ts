// §6 «Resultados con miniaturas» against the real demo database (same migrations, same seed): every publication of
// the demo has a picture the platform can serve, the boss's own post shows its screenshot, and a screenshot can be
// added to a post (when registering the boss's post, or afterwards) only once and only if it is a screenshot.
// The demo pictures are invented and abstract. Session mocked as in flows-actions.test.ts.
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import type { Session } from '@/lib/auth/session';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import { DEMO_THUMBS, demoThumbBytes } from '@/lib/db/seed-parts/thumbs';
import { checkUploadThumb } from '@/lib/domain/thumb';
import { PUB_THUMB_COLUMNS, PUB_THUMB_JOINS, pubThumbOf, type PubThumbCols } from '@/lib/data/pub-thumbs';
import { makeTestDb, type TestDb } from '../rls/setup';

const h = vi.hoisted(() => ({ session: null as unknown }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ requireSession: vi.fn(async () => h.session) }));

let t: TestDb;
let pubs: typeof import('@/lib/actions/publications');

beforeAll(async () => {
  t = await makeTestDb();
  (globalThis as { __fbBackend?: Promise<unknown> }).__fbBackend = Promise.resolve(t.backend);
  pubs = await import('@/lib/actions/publications');
}, 120_000);

function as(key: DemoUserKey) {
  const u = DEMO_USERS.find((x) => x.key === key)!;
  h.session = {
    userId: t.ids[key], email: u.email, name: u.name, roles: [...u.roles], aal: 'aal2', mfaRequired: false, mfaOk: true,
    claims: { sub: t.ids[key], aal: 'aal2', role: 'authenticated' }, viewAs: null,
  } satisfies Session;
}

type Row = PubThumbCols & { id: string; title: string };
// The same candidates Resultados reads, as that person.
const results = (who: DemoUserKey) =>
  t.as(who, (sql) =>
    sql.query<Row>(
      `select x.id, coalesce(p.title, x.title) as title, ${PUB_THUMB_COLUMNS}
         from public.publications x left join public.pieces p on p.id = x.piece_id ${PUB_THUMB_JOINS}
        where x.status = 'published' and x.deleted_at is null order by x.published_at desc`,
    ),
  );
const stored = (id: string) => t.system((sql) => sql.one<{ mime: string; bytes: Uint8Array }>(`select mime, bytes from public.media_thumbs where media_id = $1`, [id]));

// A finished screenshot uploaded by that person (as the uploader does: kind 'evidence', no event).
let n = 0;
const screenshot = (who: DemoUserKey, over: { kind?: string; mime?: string; eventId?: string | null } = {}) =>
  t.as(who, async (sql) =>
    (await sql.one<{ id: string }>(
      `insert into public.media_assets (event_id, kind, storage_path, label, mime, size_bytes, status, uploaded_by)
       values ($1, $2, $3, 'Captura (prueba)', $4, 2000, 'ready', auth.uid()) returning id`,
      [over.eventId ?? null, over.kind ?? 'evidence', `evidence/prueba-${++n}.jpg`, over.mime ?? 'image/jpeg'],
    ))!.id,
  );

describe('las miniaturas de la demostración', () => {
  it('son JPEG inventados que pasan la misma revisión que una miniatura subida (≤ 320 px, ≤ 256 KB, sin EXIF)', () => {
    // Those of Redes too (src/lib/db/demo-assets/redes-*.jpg, scripts/make-demo-thumbs.mts).
    const redes = fs.readdirSync(path.join(process.cwd(), 'src', 'lib', 'db', 'demo-assets')).filter((f) => /^redes-.*\.jpg$/.test(f)).sort();
    expect(redes).toHaveLength(12);
    for (const name of [...Object.values(DEMO_THUMBS), ...redes]) {
      const b = new Uint8Array(demoThumbBytes(name));
      expect(checkUploadThumb(b), name).toEqual({ ok: true, mime: 'image/jpeg' });
      expect(Buffer.from(b).includes(Buffer.from('Exif')), name).toBe(false);
    }
  });

  it('cada publicación de Resultados tiene una miniatura guardada, para Redes, el jefe y administración', async () => {
    for (const who of ['social', 'boss', 'admin'] as const) {
      const rows = await results(who);
      expect(rows.length, who).toBeGreaterThanOrEqual(6);
      for (const r of rows) {
        const [first] = pubThumbOf(r).ids;
        expect(first, `${who} ${r.title}`).toBeTruthy();
        const th = await stored(first);
        expect(th?.mime, `${who} ${r.title}`).toBe('image/jpeg');
      }
    }
  });

  it('las de la pieza aprobada muestran su portada; lo del jefe por su cuenta, su captura', async () => {
    const rows = await results('social');
    const own = rows.find((r) => r.origin === 'boss_spontaneous')!;
    expect(pubThumbOf(own).ids).toEqual([own.thumb_evidence_id]);
    expect(Buffer.from((await stored(own.thumb_evidence_id!))!.bytes).equals(demoThumbBytes(DEMO_THUMBS.capture))).toBe(true);
    const piece = rows.filter((r) => r.origin !== 'boss_spontaneous');
    expect(piece.length).toBeGreaterThanOrEqual(5);
    for (const r of piece) {
      // The cover it went out with, else the approved version's; a story has none: its photo or its clip's frame.
      const first = pubThumbOf(r).ids[0];
      expect(first, r.title).toBe(r.thumb_cover_id ?? r.thumb_vcover_id ?? r.thumb_vmedia_id);
      expect((await stored(first))?.mime, r.title).toBe('image/jpeg');
    }
    // The court's (core.ts) shows its cover picture.
    const court = piece.filter((r) => r.title === 'Cancha techada de El Mirador');
    expect(court.length).toBeGreaterThanOrEqual(5);
    for (const r of court) expect(Buffer.from((await stored(pubThumbOf(r).ids[0]))!.bytes).equals(demoThumbBytes(DEMO_THUMBS.cover))).toBe(true);
  });

  it('Grabación no ve publicaciones (ni sus miniaturas)', async () => {
    expect(await results('camera')).toEqual([]);
  });
});

describe('la captura de una publicación', () => {
  it('al registrar lo que publicó el jefe, la captura queda y es su miniatura', async () => {
    const shot = await screenshot('social');
    as('social');
    const r = await pubs.registerSpontaneous({ network: 'instagram', title: 'Historia del jefe en la vía (prueba)', url: 'https://example.com/demo/ig/historia', evidenceId: shot });
    expect(r).toMatchObject({ ok: true });
    const row = (await results('boss')).find((x) => x.id === (r as { data: { id: string } }).data.id)!;
    expect(pubThumbOf(row).ids).toEqual([shot]);
  });

  it('sin captura también se registra (queda el ícono)', async () => {
    as('boss');
    const r = await pubs.registerSpontaneous({ network: 'x', title: 'Mensaje del jefe (prueba)', url: 'https://example.com/demo/x/1' });
    expect(r).toMatchObject({ ok: true });
    const row = (await results('boss')).find((x) => x.id === (r as { data: { id: string } }).data.id)!;
    expect(pubThumbOf(row)).toEqual({ ids: [], icon: 'text' });
  });

  it('solo una captura: no el material de un evento, no un video, no la de otra publicación', async () => {
    as('social');
    const ev = (await t.system((sql) => sql.one<{ id: string }>(`select id from public.events order by code limit 1`)))!.id;
    const raw = await screenshot('social', { kind: 'boss', mime: 'video/mp4', eventId: ev });
    const video = await screenshot('social', { mime: 'video/mp4' });
    const base = { network: 'tiktok', title: 'Video del jefe (prueba)', url: 'https://example.com/demo/tt/2' };
    for (const evidenceId of [raw, video, '00000000-0000-4000-8000-00000000dead']) {
      expect(await pubs.registerSpontaneous({ ...base, evidenceId })).toEqual({ ok: false, error: 'No se encontró la captura: súbela otra vez.' });
    }
    const used = (await results('social')).find((x) => x.origin === 'boss_spontaneous' && x.thumb_evidence_id)!.thumb_evidence_id;
    expect(await pubs.registerSpontaneous({ ...base, evidenceId: used })).toEqual({ ok: false, error: 'Esa captura ya es de otra publicación.' });
    expect(await pubs.markPublished({ id: (await results('social'))[0].id, url: 'https://example.com/x', evidenceId: video })).toEqual({ ok: false, error: 'No se encontró la captura: súbela otra vez.' });
  });

  it('«Agregar captura» a una publicada sin captura: una sola vez, y nunca se cambia', async () => {
    const target = (await results('social')).find((x) => x.origin !== 'boss_spontaneous' && !x.thumb_evidence_id)!;
    const shot = await screenshot('boss');
    as('boss');
    expect(await pubs.attachEvidence({ id: target.id, evidenceId: shot })).toEqual({ ok: true, data: undefined });
    const row = (await results('social')).find((x) => x.id === target.id)!;
    expect(row.thumb_evidence_id).toBe(shot);
    // Its cover still comes first; the screenshot is next in line.
    expect(pubThumbOf(row).ids.at(-1)).toBe(shot);
    const other = await screenshot('boss');
    expect(await pubs.attachEvidence({ id: target.id, evidenceId: other })).toEqual({ ok: false, error: 'Esta publicación ya tiene su captura, o todavía no está publicada.' });
    expect((await results('social')).find((x) => x.id === target.id)!.thumb_evidence_id).toBe(shot);
  });

  it('Grabación no agrega capturas', async () => {
    const target = (await results('social')).find((x) => x.origin !== 'boss_spontaneous' && !x.thumb_evidence_id)!;
    const shot = await screenshot('social');
    as('camera');
    expect((await pubs.attachEvidence({ id: target.id, evidenceId: shot })).ok).toBe(false);
    expect((await results('social')).find((x) => x.id === target.id)!.thumb_evidence_id).toBeNull();
  });
});
