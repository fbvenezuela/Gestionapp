// The attention desk's route handlers over the demo database (invented data), with the session mocked:
//   /admin/atencion/exportar: the CSV for the coordinator (with the contact only when asked, each one recorded) and the
//   auditor (never contacts, never a denuncia), formula-safe, UTF-8 with BOM and «;»; 401 without a session or without
//   the second factor, 403 for every other role and for a link from another site; every export in the audit log.
//   /admin/atencion/<id>/evidencias: a photo of the attention into the private bucket, as the person (RLS decides):
//   who works the case uploads (cleaned of its metadata); a responsible of another area gets the one «not found» and
//   nothing stays in the bucket; the web's editor, the auditor and the boss get 403; without a session 401.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { Session } from '@/lib/auth/session';
import { withUser } from '@/lib/db';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import { localFilesRoot } from '@/lib/storage/local-files';
import { makeTestDb, type TestDb } from '../rls/setup';
import { SECRET, contains, jpegWithGps } from './fixtures/photos';

const h = vi.hoisted(() => ({ session: null as unknown, afters: [] as (() => unknown)[] }));
vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(async () => h.session),
  db: (s: { claims: Parameters<typeof withUser>[0] }, fn: Parameters<typeof withUser>[1]) => withUser(s.claims, fn),
}));
vi.mock('next/server', async (orig) => ({
  ...(await orig<typeof import('next/server')>()),
  after: (fn: () => unknown) => {
    h.afters.push(fn);
  },
}));

let t: TestDb;
let exportRoute: typeof import('@/app/(panel)/admin/atencion/exportar/route');
let evidence: typeof import('@/app/(panel)/admin/atencion/[id]/evidencias/route');

beforeAll(async () => {
  t = await makeTestDb({ webContent: true });
  (globalThis as { __fbBackend?: Promise<unknown> }).__fbBackend = Promise.resolve(t.backend);
  exportRoute = await import('@/app/(panel)/admin/atencion/exportar/route');
  evidence = await import('@/app/(panel)/admin/atencion/[id]/evidencias/route');
}, 120_000);

function as(key: DemoUserKey | null, aal: 'aal1' | 'aal2' = 'aal2') {
  if (!key) return void (h.session = null);
  const u = DEMO_USERS.find((x) => x.key === key)!;
  h.session = {
    userId: u.id, email: u.email, name: u.name, roles: [...u.roles], aal, mfaRequired: true, mfaOk: aal === 'aal2',
    claims: { sub: u.id, aal, role: 'authenticated' }, viewAs: null,
  } satisfies Session;
}
const sysOne = <T>(q: string, p: unknown[] = []) => t.system((sql) => sql.one<T>(q, p));
const sysAll = <T>(q: string, p: unknown[] = []) => t.system((sql) => sql.query<T>(q, p));
const getCsv = (qs = '', headers: Record<string, string> = { 'sec-fetch-site': 'same-origin' }) =>
  exportRoute.GET(new NextRequest(`http://localhost/admin/atencion/exportar${qs}`, { headers }));
const parse = (csv: string) => csv.replace(/^﻿/, '').trimEnd().split('\r\n').map((l) => l.split(';'));

describe('exportar (CSV)', () => {
  it('la coordinación: UTF-8 con BOM, «;», cabecera en español, las denuncias también; queda en el registro', async () => {
    as('attention');
    const before = (await sysAll(`select id from public.audit_log where action = 'export'`)).length;
    const r = await getCsv();
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(r.headers.get('Content-Disposition')).toMatch(/^attachment; filename="atencion-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(r.headers.get('Cache-Control')).toBe('private, no-store');
    const bytes = new Uint8Array(await r.clone().arrayBuffer());
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const lines = parse(await r.text());
    expect(lines[0].slice(0, 5)).toEqual(['Código', 'Tipo', 'Categoría', 'Estado', 'Prioridad']);
    expect(lines[0]).not.toContain('Correo');
    const all = (await sysOne<{ n: number }>(`select count(*)::int as n from public.requests where duplicate_of is null and not is_spam`))!.n;
    expect(lines.length - 1).toBe(all);
    expect(lines.some((l) => l[1] === 'Denuncia')).toBe(true);
    expect((await sysAll(`select id from public.audit_log where action = 'export'`)).length).toBe(before + 1);
  });

  it('una fórmula escrita por alguien queda como texto (lleva un apóstrofo delante)', async () => {
    const id = (await sysOne<{ id: string }>(`select id from public.requests where type = 'reporte' and duplicate_of is null order by created_at limit 1`))!.id;
    await sysAll(`update public.requests set title = '=HYPERLINK("http://x.test";"clic")' where id = $1`, [id]);
    as('attention');
    const text = await (await getCsv()).text();
    expect(text).toContain(`"'=HYPERLINK(""http://x.test"";""clic"")"`);
    expect(text).not.toMatch(/;=HYPERLINK/);
  });

  it('con el contacto, solo la coordinación y solo si lo pide: cada contacto leído queda registrado', async () => {
    as('attention');
    const views = async () => (await sysAll(`select id from public.audit_log where action = 'contact_view'`)).length;
    const v0 = await views();
    const r = await getCsv('?estado=en_atencion&contacto=1');
    const lines = parse(await r.text());
    expect(lines[0].slice(-4)).toEqual(['Nombre', 'Correo', 'Teléfono', 'Prefiere']);
    const rows = lines.length - 1;
    expect(rows).toBeGreaterThan(0);
    expect(lines.slice(1).every((l) => l[3] === 'En atención')).toBe(true);
    expect(lines.slice(1).some((l) => /@demo\.test$/.test(l.at(-3) ?? ''))).toBe(true);
    expect((await views()) - v0).toBe(rows);
    const log = await sysOne<{ new_data: { with_contact: boolean; filters: Record<string, unknown> } }>(`select new_data from public.audit_log where action = 'export' order by id desc limit 1`);
    expect(log!.new_data).toMatchObject({ with_contact: true, filters: { state: 'en_atencion' } });
  });

  it('auditoría exporta sin contactos aunque los pida, y sin denuncias', async () => {
    as('auditView');
    const r = await getCsv('?contacto=1');
    expect(r.status).toBe(200);
    const lines = parse(await r.text());
    expect(lines[0]).not.toContain('Correo');
    expect(lines.some((l) => l[1] === 'Denuncia')).toBe(false);
    expect(r.headers.get('Content-Disposition')).not.toContain('con-contacto');
  });

  it('nadie más exporta: 401 sin sesión o sin doble factor, 403 para los demás roles y para un enlace de otro sitio', async () => {
    as(null);
    expect((await getCsv()).status).toBe(401);
    as('attention', 'aal1');
    expect((await getCsv()).status).toBe(401);
    for (const key of ['servicesLead', 'complaintsDesk', 'boss', 'admin', 'webEditor', 'social'] as DemoUserKey[]) {
      as(key);
      expect((await getCsv()).status, key).toBe(403);
    }
    as('attention');
    expect((await getCsv('', { 'sec-fetch-site': 'cross-site' })).status).toBe(403);
  });
});

describe('subir una evidencia', () => {
  const caseOf = async (slug: string) =>
    (await sysOne<{ id: string }>(
      `select r.id from public.requests r join public.request_categories c on c.id = r.category_id
        where c.slug = $1 and r.duplicate_of is null and r.state in ('en_atencion', 'asignado') order by r.created_at limit 1`,
      [slug],
    ))!.id;
  const upload = (id: string, shared = true, file: { name: string; bytes: Uint8Array; type: string } = { name: 'despues.jpg', bytes: jpegWithGps(), type: 'image/jpeg' }) => {
    const form = new FormData();
    form.set('file', new File([file.bytes as Uint8Array<ArrayBuffer>], file.name, { type: file.type }));
    form.set('shared', shared ? '1' : '0');
    return evidence.POST(new NextRequest(`http://localhost/admin/atencion/${id}/evidencias`, { method: 'POST', body: form, headers: { origin: 'http://localhost' } }), {
      params: Promise.resolve({ id }),
    });
  };
  const stored = () => {
    const dir = path.join(localFilesRoot(), 'participacion-privado');
    return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => !f.endsWith('.tmp')).length : 0;
  };

  it('quien atiende el caso la sube: limpia de su ubicación, registrada a su nombre y compartida si lo pidió', async () => {
    const id = await caseOf('agua');
    as('servicesLead');
    const r = await upload(id, true);
    expect(r.status).toBe(200);
    const out = (await r.json()) as { ok: boolean; id: string };
    const row = await sysOne<{ kind: string; shared: boolean; uploaded_by: string; storage_key: string; scan_status: string }>(`select * from public.request_attachments where id = $1`, [out.id]);
    expect(row).toMatchObject({ kind: 'evidence', shared: true, uploaded_by: DEMO_USERS.find((u) => u.key === 'servicesLead')!.id, scan_status: 'sin_analizar' });
    const bytes = fs.readFileSync(path.join(localFilesRoot(), 'participacion-privado', row!.storage_key));
    expect(contains(new Uint8Array(bytes), SECRET)).toBe(false);
  });

  it('un responsable de otra área: el mismo «no encontrado», y el archivo no se queda guardado', async () => {
    const id = await caseOf('agua');
    as('roadsLead');
    const before = stored();
    const r = await upload(id);
    expect(r.status).toBe(404);
    expect(((await r.json()) as { error: string }).error).toBe('No encontramos esa solicitud o no te toca atenderla.');
    expect(stored()).toBe(before);
  });

  it('el editor de la web, auditoría y el jefe: 403; sin sesión 401; otro sitio 403; algo que no es una foto ni un PDF, 422', async () => {
    const id = await caseOf('agua');
    for (const key of ['webEditor', 'auditView', 'boss', 'admin'] as DemoUserKey[]) {
      as(key);
      expect((await upload(id)).status, key).toBe(403);
    }
    as(null);
    expect((await upload(id)).status).toBe(401);
    as('attention');
    const form = new FormData();
    form.set('file', new File([new Uint8Array([1, 2, 3])], 'x.jpg'));
    expect((await evidence.POST(new NextRequest(`http://localhost/admin/atencion/${id}/evidencias`, { method: 'POST', body: form, headers: { origin: 'http://evil.test' } }), { params: Promise.resolve({ id }) })).status).toBe(403);
    expect((await upload(id, false, { name: 'nota.txt', bytes: new TextEncoder().encode('hola'), type: 'text/plain' })).status).toBe(422);
  });
});
