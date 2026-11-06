// The security review of 06/11 (docs/SEGURIDAD.md «Web pública y atención ciudadana: revisión del 06/11»): what the
// emails to citizens leave behind. The outbox is read by Administración (Ajustes → Buzón), which never reads a case:
// with real data it keeps only a masked address for the attention desk's emails (the address itself is the contact the
// app keeps encrypted). The receipt never names the kind of request (an inbox or a lock screen is seen by others:
// «Recibimos tu denuncia» could put the person at risk). And the demo's «buzón de prueba», a server action anyone can
// call with any address, shows only sign-in codes of the team, never what the public website sent to someone.
import { describe, expect, it, beforeAll, beforeEach, vi } from 'vitest';
import { createElement } from 'react';
import { env } from '@/lib/env';
import { generateSecret } from '@/lib/participation/receipt-code';
import { makeTestDb, type TestDb } from '../rls/setup';

const h = vi.hoisted(() => ({
  trust: (process.env.TRUST_PROXY_HEADERS = 'true'),
  jar: new Map<string, { value: string }>(),
  ip: '192.0.2.1',
  afters: [] as (() => unknown)[],
  resend: [] as { to: string }[],
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
vi.mock('resend', () => ({
  Resend: class {
    emails = {
      send: async (m: { to: string }) => {
        h.resend.push({ to: m.to });
        return { data: { id: 'prueba' }, error: null };
      },
    };
  },
}));

let t: TestDb;
let actions: typeof import('@/lib/actions/participation');
let mail: typeof import('@/lib/email/send');
let inbox: typeof import('@/lib/auth/demo-inbox');
let net = 1;

beforeAll(async () => {
  t = await makeTestDb({ webContent: true });
  (globalThis as { __fbBackend?: Promise<unknown> }).__fbBackend = Promise.resolve(t.backend);
  actions = await import('@/lib/actions/participation');
  mail = await import('@/lib/email/send');
  inbox = await import('@/lib/auth/demo-inbox');
}, 120_000);

beforeEach(() => {
  h.jar.clear();
  h.afters.length = 0;
  h.resend.length = 0;
  h.ip = `192.0.2.${net++}`;
});

const runAfters = async () => {
  for (const fn of h.afters.splice(0)) await fn();
};
const sys = <T>(q: string, p: unknown[] = []) => t.system((sql) => sql.query<T>(q, p));

async function sendDenuncia(email: string) {
  const [{ id: category }] = await sys<{ id: string }>(`select id from public.request_categories where slug = 'seguridad'`);
  const [{ id: municipality }] = await sys<{ id: string }>(`select id from public.territories where kind = 'municipality' and name = 'Torbes'`);
  const r = await actions.sendRequest({
    submissionKey: crypto.randomUUID(),
    secret: generateSecret(),
    input: {
      type: 'denuncia', categoryId: category, title: 'Algo que pasa en la cuadra (prueba)',
      description: 'Relato de la denuncia, privado de punta a punta (prueba de la revisión).', municipalityId: municipality, parishId: null,
      sector: `Sector de la revisión ${crypto.randomUUID().slice(0, 8)}`, locationReference: '', eventDate: null, point: null,
      locationConsent: false, anonymous: false, publishNameConsent: false, linkedItemId: null,
      contact: { name: 'Persona Inventada', email, phone: '', channel: 'email' }, privacyAccepted: true,
    },
  });
  expect(r.ok).toBe(true);
  await runAfters();
  return (r as { reference: string }).reference;
}

describe('el correo de recibido', () => {
  it('nunca dice qué tipo de solicitud es: una denuncia llega como «solicitud»', async () => {
    const ref = await sendDenuncia('denuncia.revision@demo.test');
    const [row] = await sys<{ subject: string; text_body: string; html: string }>(
      `select subject, text_body, html from public.outbox where idempotency_key = $1`, [`atencion-recibida:${ref}`]);
    expect(row.text_body).toContain(ref);
    expect(`${row.subject} ${row.text_body} ${row.html}`).not.toMatch(/denuncia/i);
    expect(row.text_body).toMatch(/Recibimos tu solicitud/);
  });
});

describe('el buzón de salida con datos reales', () => {
  it('la dirección de una persona que usó la web queda enmascarada; el correo sí le llega a ella', async () => {
    const saved = { mode: env.dataMode, email: { ...env.email } };
    Object.assign(env, { dataMode: 'supabase' });
    Object.assign(env.email, { mode: 'send', resendKey: 're_prueba' });
    try {
      const key = `revision:${crypto.randomUUID()}`;
      const r = await mail.sendEmail({ to: 'Ana.Perez@Ejemplo.com', subject: 'Recibimos tu solicitud AC-2026-REV001', template: 'atencion_recibida', element: createElement('p', null, 'Hola'), idempotencyKey: key });
      expect(r).toMatchObject({ stored: true, sent: true });
      expect(h.resend).toEqual([{ to: 'Ana.Perez@Ejemplo.com' }]);
      const [row] = await sys<{ to_email: string; status: string }>(`select to_email, status from public.outbox where idempotency_key = $1`, [key]);
      expect(row).toEqual({ to_email: 'a***@e***.com', status: 'sent' });
    } finally {
      Object.assign(env, { dataMode: saved.mode });
      Object.assign(env.email, saved.email);
    }
    expect(mail.maskEmail('Ana.Perez@Ejemplo.com')).toBe('a***@e***.com');
    expect(mail.outboxAddress('ana@ejemplo.com', 'atencion_recibida', 'supabase')).toBe('a***@e***.com');
    expect(mail.outboxAddress('ana@ejemplo.com', 'atencion_state', 'demo')).toBe('ana@ejemplo.com');
    // The team's own emails keep their address (who was invited, who got a notice).
    expect(mail.outboxAddress('equipo@ejemplo.com', 'login_code', 'supabase')).toBe('equipo@ejemplo.com');
    expect(mail.outboxAddress('equipo@ejemplo.com', 'notice:web_review', 'supabase')).toBe('equipo@ejemplo.com');
  });
});

describe('el buzón de prueba de la demostración', () => {
  it('a una dirección de la ciudadanía no le muestra nada; a alguien del equipo, solo sus códigos para entrar', async () => {
    const citizen = 'vecina.revision@demo.test';
    const ref = await sendDenuncia(citizen);
    expect((await sys(`select 1 from public.outbox where to_email = $1`, [citizen])).length).toBe(1);
    expect(await inbox.demoInbox(citizen)).toEqual([]);
    expect(await inbox.demoInbox(citizen.toUpperCase())).toEqual([]);

    const [staff] = await sys<{ email: string }>(`select email from public.profiles where active and deleted_at is null order by email limit 1`);
    await sys(`insert into public.outbox (to_email, subject, html, text_body, template, idempotency_key) values
      ($1, 'Tu código para entrar: 123456', '<p>123456</p>', '123456', 'login_code', $2),
      ($1, 'Otro aviso', '<p>x</p>', 'x', 'notice:prueba', $3)`, [staff.email, `login:${crypto.randomUUID()}`, `aviso:${crypto.randomUUID()}`]);
    const got = await inbox.demoInbox(staff.email);
    expect(got.map((m) => m.subject)).toEqual(['Tu código para entrar: 123456']);
    expect(JSON.stringify(got)).not.toContain(ref);
  });
});
