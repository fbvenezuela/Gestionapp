// The security review of 06/11 (docs/SEGURIDAD.md «Web pública y atención ciudadana: revisión del 06/11»): the ways
// in of a file. The database decides first (the receipt or the person, the rate limit, the counts) and only then is
// the file written: an anonymous client with a wrong receipt, or over the limit, never makes the server store a byte
// (it used to be written and then removed, so the limit never reached the storage). A body without Content-Length is
// read only up to the cap (it used to be read to the end). A photo that claims tens of thousands of pixels per side
// does not go in. The storage is the demo's folder, watched: every write is counted.
import { crc32 } from 'node:zlib';
import { describe, expect, it, beforeAll, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { Session } from '@/lib/auth/session';
import { withUser } from '@/lib/db';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import { generateSecret } from '@/lib/participation/receipt-code';
import { makeTestDb, type TestDb } from '../rls/setup';
import { jpegWithGps, png } from './fixtures/photos';

const h = vi.hoisted(() => ({
  jar: new Map<string, { value: string }>(),
  ip: '198.51.100.1',
  afters: [] as (() => unknown)[],
  puts: [] as string[],
  session: null as unknown,
}));

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-real-ip': h.ip }),
  cookies: async () => ({
    get: (n: string) => (h.jar.has(n) ? { name: n, value: h.jar.get(n)!.value } : undefined),
    set: (n: string, v: string, o?: { maxAge?: number }) => (o?.maxAge === 0 ? h.jar.delete(n) : h.jar.set(n, { value: v })),
    delete: (n: string) => h.jar.delete(n),
  }),
}));
vi.mock('next/server', async (orig) => ({
  ...(await orig<typeof import('next/server')>()),
  after: (fn: () => unknown) => {
    h.afters.push(fn);
  },
}));
vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(async () => h.session),
  db: (s: { claims: Parameters<typeof withUser>[0] }, fn: Parameters<typeof withUser>[1]) => withUser(s.claims, fn),
}));
// Every write to a bucket is counted (the folder of the demo still gets it).
vi.mock('@/lib/storage/buckets', async (orig) => {
  const m = await orig<typeof import('@/lib/storage/buckets')>();
  return {
    ...m,
    bucketStore: (bucket: Parameters<typeof m.bucketStore>[0]) => {
      const s = m.bucketStore(bucket);
      return {
        ...s,
        put: async (key: string, bytes: Uint8Array, mime: string) => {
          h.puts.push(`${bucket}/${key}`);
          return s.put(key, bytes, mime);
        },
      };
    },
  };
});

let t: TestDb;
let actions: typeof import('@/lib/actions/participation');
let upload: typeof import('@/app/api/atencion/adjuntos/route');
let evidence: typeof import('@/app/(panel)/admin/atencion/[id]/evidencias/route');
let cat: (slug: string) => string;
let muni: (name: string) => string;
let net = 1;

beforeAll(async () => {
  process.env.TRUST_PROXY_HEADERS = 'true';
  t = await makeTestDb({ webContent: true });
  (globalThis as { __fbBackend?: Promise<unknown> }).__fbBackend = Promise.resolve(t.backend);
  actions = await import('@/lib/actions/participation');
  upload = await import('@/app/api/atencion/adjuntos/route');
  evidence = await import('@/app/(panel)/admin/atencion/[id]/evidencias/route');
  const cats = await t.system((sql) => sql.query<{ slug: string; id: string }>(`select slug, id from public.request_categories`));
  const munis = await t.system((sql) => sql.query<{ name: string; id: string }>(`select name, id from public.territories where kind = 'municipality'`));
  cat = (slug) => cats.find((c) => c.slug === slug)!.id;
  muni = (name) => munis.find((m) => m.name === name)!.id;
}, 120_000);

beforeEach(() => {
  h.jar.clear();
  h.afters.length = 0;
  h.puts.length = 0;
  h.ip = `198.51.100.${net++}`;
});

const sys = <T>(q: string, p: unknown[] = []) => t.system((sql) => sql.query<T>(q, p));

async function newRequest() {
  const r0 = { submissionKey: crypto.randomUUID(), secret: generateSecret() };
  const sent = await actions.sendRequest({
    ...r0,
    input: {
      type: 'reporte', categoryId: cat('agua'), title: 'Tubería rota en la esquina (prueba)',
      description: 'Sale agua desde ayer y se pierde por la cuneta (prueba de la revisión).', municipalityId: muni('Torbes'),
      parishId: null, sector: `Sector de la revisión ${crypto.randomUUID().slice(0, 8)}`, locationReference: '', eventDate: null,
      point: null, locationConsent: false, anonymous: true, publishNameConsent: false, linkedItemId: null, contact: null, privacyAccepted: true,
    },
  });
  expect(sent.ok).toBe(true);
  return { reference: (sent as { reference: string }).reference, secret: r0.secret };
}

function post(fields: Record<string, string | File>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return new NextRequest('http://localhost/api/atencion/adjuntos', { method: 'POST', body: fd, headers: { origin: 'http://localhost' } });
}
const photo = (bytes: Uint8Array = jpegWithGps(), name = 'foto.jpg') => new File([bytes as Uint8Array<ArrayBuffer>], name, { type: 'image/jpeg' });

/** The 4×3 PNG of the fixtures, saying it is `w` × `h` (its header only; nothing else changes). */
function claimsPixels(w: number, hgt: number): Uint8Array<ArrayBuffer> {
  const b = png();
  const v = new DataView(b.buffer);
  v.setUint32(16, w);
  v.setUint32(20, hgt);
  v.setUint32(29, crc32(b.subarray(12, 29)) >>> 0);
  return b;
}

describe('los archivos de la persona: la base decide antes de guardar nada', () => {
  it('con una clave mala, el servidor no escribe nada en el almacenamiento', async () => {
    const r = await newRequest();
    const res = await upload.POST(post({ reference: r.reference, secret: generateSecret(), file: photo() }));
    expect(res.status).toBe(404);
    expect(h.puts).toEqual([]);
    // With the right one, exactly one write.
    const ok = await upload.POST(post({ reference: r.reference, secret: r.secret, file: photo() }));
    expect(ok.status).toBe(200);
    expect(h.puts).toHaveLength(1);
  });

  it('pasado el límite de archivos por red, tampoco: el intento que se niega no llega al almacenamiento', async () => {
    const [{ value }] = await sys<{ value: Record<string, unknown> }>(`select value from public.app_settings where key = 'participation.rate_limits'`);
    await sys(`update public.app_settings set value = value || '{"attach_ip":{"limit":1,"minutes":60}}' where key = 'participation.rate_limits'`);
    try {
      const r = await newRequest();
      expect((await upload.POST(post({ reference: r.reference, secret: r.secret, file: photo() }))).status).toBe(200);
      expect(h.puts).toHaveLength(1);
      h.jar.clear(); // a new «device»: only the network's limit is left
      const again = await upload.POST(post({ reference: r.reference, secret: r.secret, file: photo() }));
      expect(again.status).toBe(429);
      expect(h.puts).toHaveLength(1);
    } finally {
      await sys(`update public.app_settings set value = $1::text::jsonb where key = 'participation.rate_limits'`, [JSON.stringify(value)]);
    }
  });

  it('sin Content-Length, un cuerpo enorme se deja de leer al pasar el tope (413)', async () => {
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        if (pulled >= 30 * 1024 * 1024) return c.close();
        pulled += 64 * 1024;
        c.enqueue(new Uint8Array(64 * 1024));
      },
    });
    const req = new NextRequest('http://localhost/api/atencion/adjuntos', {
      method: 'POST',
      body: stream,
      headers: { origin: 'http://localhost', 'content-type': 'multipart/form-data; boundary=revision' },
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });
    expect(req.headers.get('content-length')).toBeNull();
    const res = await upload.POST(req);
    expect(res.status).toBe(413);
    expect(pulled).toBeLessThan(10 * 1024 * 1024);
    expect(h.puts).toEqual([]);
  });

  it('una foto que dice tener 50 000 × 50 000 píxeles no entra', async () => {
    const r = await newRequest();
    const res = await upload.POST(post({ reference: r.reference, secret: r.secret, file: new File([claimsPixels(50_000, 50_000)], 'grande.png', { type: 'image/png' }) }));
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: string }).error).toMatch(/demasiado grande/);
    expect(h.puts).toEqual([]);
    const fine = await upload.POST(post({ reference: r.reference, secret: r.secret, file: new File([png()], 'normal.png', { type: 'image/png' }) }));
    expect(fine.status).toBe(200);
  });
});

describe('las evidencias del equipo: la base decide antes de guardar nada', () => {
  function as(key: DemoUserKey) {
    const u = DEMO_USERS.find((x) => x.key === key)!;
    h.session = {
      userId: u.id, email: u.email, name: u.name, roles: [...u.roles], aal: 'aal2', mfaRequired: true, mfaOk: true,
      claims: { sub: u.id, aal: 'aal2', role: 'authenticated' }, viewAs: null,
    } satisfies Session;
  }
  const send = (id: string) => {
    const form = new FormData();
    form.set('file', photo(jpegWithGps(), 'despues.jpg'));
    form.set('shared', '1');
    return evidence.POST(new NextRequest(`http://localhost/admin/atencion/${id}/evidencias`, { method: 'POST', body: form, headers: { origin: 'http://localhost' } }), {
      params: Promise.resolve({ id }),
    });
  };

  it('un responsable de otra área recibe el «no encontrado» sin que se escriba el archivo; quien atiende, una escritura', async () => {
    const [{ id }] = await sys<{ id: string }>(
      `select r.id from public.requests r join public.request_categories c on c.id = r.category_id
        where c.slug = 'agua' and r.duplicate_of is null and r.state in ('en_atencion', 'asignado') order by r.created_at limit 1`,
    );
    as('roadsLead');
    expect((await send(id)).status).toBe(404);
    expect(h.puts).toEqual([]);
    as('servicesLead');
    expect((await send(id)).status).toBe(200);
    expect(h.puts).toHaveLength(1);
  });
});
