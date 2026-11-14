// Atención → «Registro de atención» over the demo database (invented data), with the session mocked (F1, R02): a line
// starts with «La web» only for what a person did on the public web (a new request, its support and contact, the
// person's message or file, a step the person took); what else nobody signed in did is «La app», as in Ajustes →
// «Registro de cambios»: the client's setup (areas, categories), the saved replies a migration brings or rewrites, the
// file scanner. Each line reads as a sentence, with the same words as the general registry.
import { describe, expect, it, beforeAll, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Session } from '@/lib/auth/session';
import { withUser } from '@/lib/db';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import { AUDIT_FROM_WEB_SQL } from '@/lib/domain/audit-log';
import { makeTestDb, type TestDb } from '../rls/setup';

const h = vi.hoisted(() => ({ session: null as unknown }));
vi.mock('@/lib/auth/session', () => ({
  requireRole: vi.fn(async () => h.session),
  db: (s: { claims: Parameters<typeof withUser>[0] }, fn: Parameters<typeof withUser>[1]) => withUser(s.claims, fn),
}));

let t: TestDb;
let page: typeof import('@/app/(panel)/admin/atencion/registro/page');

beforeAll(async () => {
  t = await makeTestDb({ webContent: true });
  (globalThis as { __fbBackend?: Promise<unknown> }).__fbBackend = Promise.resolve(t.backend);
  page = await import('@/app/(panel)/admin/atencion/registro/page');
}, 120_000);

function as(key: DemoUserKey) {
  const u = DEMO_USERS.find((x) => x.key === key)!;
  h.session = {
    userId: u.id, email: u.email, name: u.name, roles: [...u.roles], aal: 'aal2', mfaRequired: true, mfaOk: true,
    claims: { sub: u.id, aal: 'aal2', role: 'authenticated' }, viewAs: null,
  } satisfies Session;
}

const text = async (antes?: string) =>
  renderToStaticMarkup(await page.default({ searchParams: Promise.resolve(antes ? { antes } : {}) }))
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"');

type Probe = { table_name: string; action: string; from_web: boolean; kind: string | null; actor_kind: string | null; uploaded_by: string | null };

describe('«Registro de atención»: quién', () => {
  it('«La web» solo para lo que hizo una persona desde la web; lo demás sin nadie es de la app', async () => {
    const rows = await t.system((sql) =>
      sql.query<Probe>(
        `select a.table_name, a.action, ${AUDIT_FROM_WEB_SQL} as from_web, a.new_data ->> 'kind' as kind,
                a.new_data ->> 'actor_kind' as actor_kind, a.new_data ->> 'uploaded_by' as uploaded_by
           from public.audit_log a where a.actor_id is null`,
      ),
    );
    const web = (table: string, action: string) => rows.filter((r) => r.table_name === table && r.action === action);
    // The client's setup and the saved replies that migrations bring and rewrite: the app.
    for (const [table, action] of [['areas', 'insert'], ['area_members', 'insert'], ['request_categories', 'insert'], ['request_reply_templates', 'insert'], ['request_reply_templates', 'update']]) {
      expect(web(table, action).length, `${table} ${action}`).toBeGreaterThan(0);
      expect(web(table, action).every((r) => !r.from_web), `${table} ${action}`).toBe(true);
    }
    // A new request and its contact: only the public web makes them.
    expect(web('requests', 'insert').length).toBeGreaterThan(0);
    expect(web('requests', 'insert').every((r) => r.from_web)).toBe(true);
    expect(web('request_contacts', 'insert').every((r) => r.from_web)).toBe(true);
    // A message or a step: the person's say «La web», the team's (seeded without a session) do not.
    for (const r of web('request_messages', 'insert')) expect(r.from_web, r.kind ?? '').toBe(r.kind === 'citizen_message');
    expect(web('request_messages', 'insert').some((r) => r.kind !== 'citizen_message')).toBe(true);
    for (const r of web('request_events', 'insert')) expect(r.from_web, r.actor_kind ?? '').toBe(r.actor_kind === 'citizen');
    expect(web('request_events', 'insert').some((r) => r.actor_kind === 'citizen')).toBe(true);
    for (const r of web('request_attachments', 'insert')) expect(r.from_web).toBe(r.uploaded_by === null);
    // A change to a request after what the person did (its state, its supports) is the app's.
    expect(web('requests', 'update').every((r) => !r.from_web)).toBe(true);
  });

  it('en la pantalla: un área sembrada y una respuesta que cambió una migración dicen «La app …»; una solicitud nueva, «La web creó la solicitud …»', async () => {
    // Administración reads the saved replies' lines too (the auditor's policy leaves them out).
    as('admin');
    // The oldest lines: the client's setup and the saved replies come before the requests.
    const first = await t.system((sql) =>
      sql.one<{ id: string }>(`select min(id)::text as id from public.audit_log where table_name = 'requests' and action = 'insert'`),
    );
    const old = await text(String(Number(first!.id) + 1));
    expect(old).toContain('La app creó un área de atención');
    expect(old).toContain('La app creó una categoría de atención');
    expect(old).toContain('La app cambió una respuesta guardada');
    // Administración does not read the cases (D-93): the line says it was a request, without its code.
    expect(old).toContain('La web creó una solicitud');
    expect(old).not.toMatch(/la solicitud [A-Z]+-/);
    expect(old).not.toMatch(/La web (creó|cambió|agregó) (un área|una categoría|una respuesta guardada)/);
    as('auditView');
    const recent = await text();
    expect(recent).not.toMatch(/El sistema|[a-z]+_[a-z_]+|«Casos atendidos»/);
    // A file the person sent reads «La web»; the team's, seeded without a session, «La app»; so do the seeded cases.
    expect(recent).toMatch(/La web subió un archivo a la solicitud [A-Z]+-/);
    expect(recent).toMatch(/La app subió un archivo a la solicitud [A-Z]+-/);
    expect(recent).toMatch(/La app escribió un mensaje en la solicitud [A-Z]+-/);
    expect(recent).toContain('La app publicó un caso atendido');
  });
});
