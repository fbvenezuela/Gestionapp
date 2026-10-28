// «Descargar todo» on the demo's seeded event, the path the demo guide gives Redes (auditoría del 28/10): the
// storyboard Grabación recorded with has a real picture behind it and comes down; the three sample videos have none,
// and the dialog counts them instead of saying «Listo» over files that never arrived. Through the real route
// (/api/media/<id>, GET and HEAD) as each person, against the seeded in-memory database. Every seed on the machine
// writes that picture to the same path, so it is replaced in one step: a download already running never reads a file
// cut short by another seed. All data here is invented.
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { Session } from '@/lib/auth/session';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import { DEMO_STORYBOARD, keepDemoFile } from '@/lib/db/seed-parts/handoff';
import { demoFilePath } from '@/lib/storage/demo-store';
import { demoThumbBytes } from '@/lib/db/seed-parts/thumbs';
import { RAW_KINDS } from '@/lib/domain/media-mime';
import { buildDownloadPlan } from '@/lib/media/download-plan';
import { fileStateText } from '@/lib/media/folder-sink';
import { checkStored, missingListLine, missingStored, runHeadline, sendPlanOneByOne } from '@/lib/media/one-by-one';
import { makeTestDb, type TestDb } from '../rls/setup';

const h = vi.hoisted(() => ({ session: null as unknown }));
vi.mock('@/lib/auth/session', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/session')>()),
  getSession: vi.fn(async () => h.session),
}));

let t: TestDb;
let route: typeof import('@/app/api/media/[id]/route');
type Row = { id: string; kind: string; label: string; size_bytes: string };
let pauta: Row[];
let code: string;

function as(key: DemoUserKey | null) {
  if (!key) {
    h.session = null;
    return;
  }
  const u = DEMO_USERS.find((x) => x.key === key)!;
  h.session = {
    userId: t.ids[key], email: u.email, name: u.name, roles: [...u.roles], aal: 'aal2', mfaRequired: true, mfaOk: true,
    claims: { sub: t.ids[key], aal: 'aal2', role: 'authenticated' }, viewAs: null,
  } satisfies Session;
}
const ask = (method: 'GET' | 'HEAD', id: string) =>
  route[method](new NextRequest(`http://localhost:3000/api/media/${id}`, { method }), { params: Promise.resolve({ id }) });
// What the dialog's fetch reaches, minus the browser.
const fetcher = async (url: string, init: RequestInit) => ask(init.method === 'HEAD' ? 'HEAD' : 'GET', url.split('/').pop()!);

beforeAll(async () => {
  t = await makeTestDb();
  (globalThis as { __fbBackend?: Promise<unknown> }).__fbBackend = Promise.resolve(t.backend);
  route = await import('@/app/api/media/[id]/route');
  // The court's event (E-0001 on the demo), as the material panel lists it for «Descargar todo»: raw and storyboard.
  const ev = (await t.system((sql) => sql.one<{ id: string; code: string }>(`select id, code from public.events where title = 'Entrega de la cancha techada de El Mirador'`)))!;
  code = ev.code;
  pauta = await t.system((sql) =>
    sql.query<Row>(`select id, kind, label, size_bytes from public.media_assets where event_id = $1 and kind = any($2::text[]) and status = 'ready' order by created_at`, [
      ev.id,
      [...RAW_KINDS, 'storyboard'],
    ]),
  );
}, 120_000);

describe('«Descargar todo» en el evento sembrado de la demo', () => {
  it('el storyboard tiene su imagen detrás (HEAD 200 y GET con los bytes); los videos de ejemplo no (404)', async () => {
    as('social');
    const sb = pauta.find((m) => m.kind === 'storyboard')!;
    expect((await ask('HEAD', sb.id)).status).toBe(200);
    const res = await ask('GET', sb.id);
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).equals(demoThumbBytes(DEMO_STORYBOARD))).toBe(true);
    expect(Number(sb.size_bytes)).toBe(demoThumbBytes(DEMO_STORYBOARD).length);
    const videos = pauta.filter((m) => m.kind !== 'storyboard');
    expect(videos.map((m) => m.kind).sort()).toEqual(['boss', 'broll', 'drone']);
    for (const v of videos) {
      const head = await ask('HEAD', v.id);
      expect(head.status, v.label).toBe(404);
      expect(await head.text(), v.label).toBe('');
    }
  });

  it('uno por uno: baja el storyboard y cuenta los tres videos sin archivo; el titular no dice «Listo» a secas', async () => {
    as('social');
    const plan = buildDownloadPlan({
      title: 'Entrega de la cancha techada de El Mirador', code, notes: null, kinds: ['storyboard', ...RAW_KINDS],
      files: pauta.map((m) => ({ id: m.id, kind: m.kind, label: m.label, ext: m.kind === 'storyboard' ? 'jpg' : 'mp4', size: Number(m.size_bytes), drive: false })),
    });
    const handed: string[] = [];
    const run = await sendPlanOneByOne(plan, { stored: (e) => handed.push(e.name), check: (e) => checkStored(e.id, { fetcher }), drive: async () => ({ ok: true }), pause: async () => {} });
    expect(handed).toEqual([`${code}-Storyboard-1.jpg`]);
    expect(run.files.map(fileStateText).sort()).toEqual(['Listo', 'No hay un archivo detrás.', 'No hay un archivo detrás.', 'No hay un archivo detrás.']);
    expect(runHeadline({ running: false, cancelled: false, stopped: null, sent: true, files: run.files })).toBe(
      'Listo: lo demás va a tus descargas. 3 archivos no se bajaron porque no están guardados en la plataforma.',
    );
  });

  it('en el iPhone y el iPad: los tres videos dicen que no hay un archivo detrás; el storyboard conserva su «Bajar»', async () => {
    as('social');
    const files = pauta.map((m) => ({ id: m.id, drive: false }));
    const missing = await missingStored(files, { check: (id) => checkStored(id, { fetcher }) });
    expect(pauta.filter((m) => missing.has(m.id)).map((m) => m.kind).sort()).toEqual(['boss', 'broll', 'drone']);
    expect(missingListLine(missing.size)).toBe('3 archivos no se pueden bajar porque no están guardados en la plataforma.');
  });

  it('HEAD pide lo mismo que GET: sin sesión 401; quien no ve el archivo, 404 (un documento de un reporte para Administración y Redes)', async () => {
    const sb = pauta.find((m) => m.kind === 'storyboard')!;
    as(null);
    expect((await ask('HEAD', sb.id)).status).toBe(401);
    expect((await ask('GET', sb.id)).status).toBe(401);
    // Política never reads an event's material.
    as('politics');
    expect((await ask('HEAD', sb.id)).status).toBe(404);
    const report = (await t.system((sql) => sql.one<{ id: string }>(`select id from public.community_reports where deleted_at is null order by code limit 1`)))!.id;
    const doc = (await t.as('politics', (sql) =>
      sql.one<{ id: string }>(
        `insert into public.media_assets (community_report_id, kind, mime, storage_path, label, status, uploaded_by)
         values ($1, 'document', 'application/pdf', $2, 'Acta (demo)', 'ready', auth.uid()) returning id`,
        [report, `${report}/acta-demo.pdf`],
      )))!.id;
    for (const who of ['admin', 'social'] as const) {
      as(who);
      expect((await ask('HEAD', doc)).status, who).toBe(404);
      expect((await ask('GET', doc)).status, who).toBe(404);
    }
    // Política reads the row: in the demo there are no bytes behind it, so 404 with nothing else said.
    as('politics');
    expect((await ask('HEAD', doc)).status).toBe(404);
  });
});

describe('el archivo del storyboard en el almacén de la demo', () => {
  it('otra siembra lo cambia de una vez: quien ya lo está leyendo sigue con la imagen entera, y no quedan archivos a medias', () => {
    // Its own folder, so the seeded picture the other tests read is never touched.
    const storagePath = `prueba-${crypto.randomUUID()}/demo-storyboard-1.jpg`;
    const file = demoFilePath(storagePath);
    const picture = demoThumbBytes(DEMO_STORYBOARD);
    keepDemoFile(storagePath, picture);
    const reader = fs.openSync(file, 'r'); // a download already running
    try {
      keepDemoFile(storagePath, Buffer.from('Otra siembra (demo)'));
      const seen = Buffer.alloc(picture.length + 16);
      const n = fs.readSync(reader, seen, 0, seen.length, 0);
      expect(seen.subarray(0, n).equals(picture)).toBe(true);
      expect(fs.readFileSync(file, 'utf8')).toBe('Otra siembra (demo)');
      expect(fs.readdirSync(path.dirname(file))).toEqual(['demo-storyboard-1.jpg']);
    } finally {
      fs.closeSync(reader);
      fs.rmSync(path.dirname(file), { recursive: true, force: true });
    }
  });
});
