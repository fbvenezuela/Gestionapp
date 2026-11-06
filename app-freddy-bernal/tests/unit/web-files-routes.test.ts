// The website's file routes over the demo (design §6): /api/archivos/web/<key> serves the public library's file, a year
// in cache; /api/archivos/atencion/<id> serves a request's file only to who may read that request (the person's session
// with its second factor, then RLS): the coordinator yes, a responsible of another area or the web's editor no (the
// same «not found» as a file that does not exist), a denuncia's file only for the denuncias desk; without a session 401;
// a file withheld by moderation, 410. The session is mocked; the database is the demo's (invented data).
import { describe, expect, it, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { Session } from '@/lib/auth/session';
import { asSystem } from '@/lib/db/core';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import { withUser } from '@/lib/db';
import { makeTestDb, type TestDb } from '../rls/setup';

const h = vi.hoisted(() => ({ session: null as unknown }));
vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(async () => h.session),
  db: (s: { claims: Parameters<typeof withUser>[0] }, fn: Parameters<typeof withUser>[1]) => withUser(s.claims, fn),
}));

let t: TestDb;
let web: typeof import('@/app/api/archivos/web/[key]/route');
let atencion: typeof import('@/app/api/archivos/atencion/[id]/route');

beforeAll(async () => {
  t = await makeTestDb({ webContent: true });
  (globalThis as { __fbBackend?: Promise<unknown> }).__fbBackend = Promise.resolve(t.backend);
  web = await import('@/app/api/archivos/web/[key]/route');
  atencion = await import('@/app/api/archivos/atencion/[id]/route');
}, 120_000);

function as(key: DemoUserKey | null, aal: 'aal1' | 'aal2' = 'aal2') {
  if (!key) return void (h.session = null);
  const u = DEMO_USERS.find((x) => x.key === key)!;
  h.session = {
    userId: u.id, email: u.email, name: u.name, roles: [...u.roles], aal, mfaRequired: true, mfaOk: aal === 'aal2',
    claims: { sub: u.id, aal, role: 'authenticated' }, viewAs: null,
  } satisfies Session;
}
const getFile = (id: string, qs = '') => atencion.GET(new NextRequest(`http://localhost/api/archivos/atencion/${id}${qs}`), { params: Promise.resolve({ id }) });
const sysOne = <T>(q: string, p: unknown[] = []) => asSystem(t.backend, (sql) => sql.one<T>(q, p));

describe('/api/archivos/web/<clave>', () => {
  it('el PDF de un documento publicado, en caché por un año; una clave mala o que no existe, 404', async () => {
    const doc = (await sysOne<{ key: string }>(`select m.storage_key as key from public.web_media m order by m.created_at limit 1`))!;
    const r = await web.GET(new NextRequest(`http://localhost/api/archivos/web/${doc.key}`), { params: Promise.resolve({ key: doc.key }) });
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Type')).toBe('application/pdf');
    expect(r.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    expect(Buffer.from(await r.arrayBuffer()).subarray(0, 5).toString('latin1')).toBe('%PDF-');
    for (const key of ['..%2F..%2Fetc%2Fpasswd', 'x.jpg', '0b1c2d3e-4f50-4a6b-8c7d-8e9fa0b1c2d3.jpg']) {
      expect((await web.GET(new NextRequest(`http://localhost/api/archivos/web/${key}`), { params: Promise.resolve({ key }) })).status, key).toBe(404);
    }
  });
});

describe('/api/archivos/atencion/<id>', () => {
  it('la coordinación lo ve; un responsable de otra área, el editor o administración no (404); sin sesión 401', async () => {
    // A citizen's photo of a water report (Servicios públicos).
    const f = (await sysOne<{ id: string }>(
      `select a.id from public.request_attachments a join public.requests r on r.id = a.request_id
        join public.request_categories c on c.id = r.category_id where a.kind = 'citizen' and c.slug = 'agua' order by a.created_at limit 1`,
    ))!;
    as('attention');
    const ok = await getFile(f.id, '?ver=1');
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Content-Type')).toBe('image/jpeg');
    expect(ok.headers.get('Content-Disposition')).toMatch(/^inline; filename="AC-\d{4}-[0-9A-Z]{6}-\d+\.jpg"$/);
    expect(ok.headers.get('Cache-Control')).toBe('private, no-store');
    // The demo serves «sin analizar» with its warning.
    expect(ok.headers.get('X-Archivo-Aviso')).toBe('sin-analizar');
    as('servicesLead');
    expect((await getFile(f.id)).status).toBe(200);
    for (const who of ['roadsLead', 'webEditor', 'admin', 'social', 'complaintsDesk'] as const) {
      as(who);
      expect((await getFile(f.id)).status, who).toBe(404);
    }
    as('attention', 'aal1');
    expect((await getFile(f.id)).status).toBe(401);
    as(null);
    expect((await getFile(f.id)).status).toBe(401);
    expect((await getFile('no-es-un-id')).status).toBe(404);
  });

  it('un archivo retirado por moderación no se sirve más (410)', async () => {
    const f = (await sysOne<{ id: string }>(`select id from public.request_attachments where kind = 'evidence' order by created_at limit 1`))!;
    await asSystem(t.backend, async (sql) => {
      await sql.query(`select set_config('app.trusted_update', 'on', true)`);
      await sql.query(`update public.request_attachments set withheld_at = now(), withheld_reason = 'Muestra un dato de una persona (demo).' where id = $1`, [f.id]);
    });
    as('attention');
    const r = await getFile(f.id);
    expect(r.status).toBe(410);
    expect(await r.text()).toMatch(/se retiró/);
  });
});
