// The attention desk's server actions (src/lib/actions/attention.ts, attention-admin.ts, team.ts for the web's roles)
// over the demo database (same migrations, RLS on, invented data), as each person of D-93: the state machine's words,
// assignment, replies and notes, «Ver contacto» (decrypted only for who works the case, and recorded), merges, spam,
// the saved replies, the areas and plazos (Administración), inviting a responsible with its areas, the status emails
// through the outbox (never the secret, never for spam or an internal note; nothing written in production with
// EMAIL_MODE=outbox) and the cron's notices of overdue and quiet cases, once a day per case. The session is mocked;
// after() collects its work so the test runs it.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import type { Session } from '@/lib/auth/session';
import type { Notice } from '@/lib/notify';
import { asAnon } from '@/lib/db/core';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import { sealContact } from '@/lib/participation/contact-crypto';
import { confirmationPlan } from '@/lib/actions/participation-core';
import { makeTestDb, type TestDb } from '../rls/setup';

const h = vi.hoisted(() => ({ session: null as unknown, afters: [] as (() => unknown)[], notices: [] as unknown[] }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ requireSession: vi.fn(async () => h.session) }));
vi.mock('next/server', async (orig) => ({
  ...(await orig<typeof import('next/server')>()),
  after: (fn: () => unknown) => {
    h.afters.push(fn);
  },
}));
vi.mock('@/lib/notify', async (orig) => ({
  ...(await orig<typeof import('@/lib/notify')>()),
  notify: vi.fn(async (n: unknown) => {
    h.notices.push(n);
  }),
}));

let t: TestDb;
let A: typeof import('@/lib/actions/attention');
let admin: typeof import('@/lib/actions/attention-admin');
let team: typeof import('@/lib/actions/team');
let email: typeof import('@/lib/actions/attention-email');
let alerts: typeof import('@/lib/data/attention-alerts');

beforeAll(async () => {
  t = await makeTestDb({ webContent: true });
  (globalThis as { __fbBackend?: Promise<unknown> }).__fbBackend = Promise.resolve(t.backend);
  A = await import('@/lib/actions/attention');
  admin = await import('@/lib/actions/attention-admin');
  team = await import('@/lib/actions/team');
  email = await import('@/lib/actions/attention-email');
  alerts = await import('@/lib/data/attention-alerts');
}, 120_000);

beforeEach(() => {
  h.afters.length = 0;
  h.notices.length = 0;
});

function as(key: DemoUserKey, aal: 'aal1' | 'aal2' = 'aal2') {
  const u = DEMO_USERS.find((x) => x.key === key)!;
  h.session = {
    userId: u.id, email: u.email, name: u.name, roles: [...u.roles], aal, mfaRequired: true, mfaOk: aal === 'aal2',
    claims: { sub: u.id, aal, role: 'authenticated' }, viewAs: null,
  } satisfies Session;
}
const runAfters = async () => {
  for (const fn of h.afters.splice(0)) await fn();
};
const sysOne = <T>(q: string, p: unknown[] = []) => t.system((sql) => sql.one<T>(q, p));
const sysAll = <T>(q: string, p: unknown[] = []) => t.system((sql) => sql.query<T>(q, p));
const hex = () => randomBytes(32).toString('hex');
const SECRET_DIGEST = hex();
const NOT_YOURS = 'No encontramos esa solicitud o no te toca atenderla.';

let n = 0;
/** A request as the public form sends it (anon, the contact sealed with the demo key). */
async function newRequest(o: { category?: string; type?: string; email?: string | null; muni?: string; sector?: string } = {}) {
  const k = ++n;
  const mail = o.email === null ? null : (o.email ?? `ana.prueba${k}@demo.test`);
  const c = mail === null ? { name: null, email: null, phone: null, channel: 'none' } : sealContact({ name: 'Ana Prueba', email: mail, channel: 'email' });
  const cat = (await sysOne<{ id: string }>(`select id from public.request_categories where slug = $1`, [o.category ?? 'agua']))!.id;
  const muni = (await sysOne<{ id: string }>(`select id from public.territories where kind = 'municipality' and name = $1`, [o.muni ?? 'Torbes']))!.id;
  const r = await asAnon(t.backend, (sql) =>
    sql.one<{ v: { id: string; reference: string } }>(
      `select citizen.submit_request(p_submission_key => $1, p_secret_digest => $2, p_device_key => $3, p_ip_key => $4, p_type => $5,
         p_category_id => $6, p_title => $7, p_description => $8, p_municipality_id => $9, p_sector => $10,
         p_contact_name => $11, p_contact_email => $12, p_contact_channel => $13) as v`,
      [randomUUID(), SECRET_DIGEST, hex(), hex(), o.type ?? 'reporte', cat, 'Fuga de agua en la esquina (prueba)', 'Sale agua de la tubería desde ayer (prueba).',
        muni, o.sector ?? `Sector de acciones ${k} (prueba)`, c.name, c.email, c.channel],
    ),
  );
  return { ...r!.v, email: mail };
}
const area = async (slug: string) => (await sysOne<{ id: string }>(`select id from public.areas where slug = $1`, [slug]))!.id;
const req = (id: string) => sysOne<{ state: string; area_id: string | null; assignee_id: string | null; resolution_note: string | null; duplicate_of: string | null; is_spam: boolean }>(`select * from public.requests where id = $1`, [id]);
const outbox = (to: string) => sysAll<{ subject: string; text_body: string; template: string }>(`select subject, text_body, template from public.outbox where to_email = $1 order by created_at`, [to]);
const ID = (key: DemoUserKey) => DEMO_USERS.find((u) => u.key === key)!.id;

describe('atender un caso de punta a punta', () => {
  it('la coordinación asigna; el área responde y lo resuelve con motivo; a la persona le llegan avisos sin la clave ni el texto', async () => {
    const r = await newRequest({ category: 'agua' });
    const services = await area('servicios-publicos');
    as('attention');
    expect(await A.assignRequest({ id: r.id, areaId: services, assigneeId: ID('servicesLead'), reason: '' })).toMatchObject({ ok: true });
    expect(await req(r.id)).toMatchObject({ state: 'asignado', area_id: services, assignee_id: ID('servicesLead') });
    await runAfters();
    expect((await outbox(r.email!)).map((m) => m.subject)).toEqual([`Tu solicitud ${r.reference}: Asignado`]);

    as('servicesLead');
    expect(await A.addRequestMessage({ id: r.id, kind: 'internal_note', body: 'La cuadrilla va mañana (prueba).' })).toMatchObject({ ok: true, message: 'Nota guardada: solo la ve el equipo.' });
    await runAfters();
    expect(await outbox(r.email!)).toHaveLength(1);
    expect(await A.addRequestMessage({ id: r.id, kind: 'public_reply', body: 'Ya programamos la visita (prueba).' })).toMatchObject({ ok: true });
    await runAfters();
    expect((await outbox(r.email!)).at(-1)).toMatchObject({ subject: `Te respondimos: ${r.reference}`, template: 'atencion_reply' });

    // The state machine's words: no jump, the reason where it is needed.
    expect(await A.changeRequestState({ id: r.id, state: 'cerrado', reason: 'x' })).toEqual({ ok: false, error: 'De «Asignado» no se pasa a «Cerrado».' });
    expect(await A.changeRequestState({ id: r.id, state: 'en_atencion' })).toMatchObject({ ok: true });
    expect(await A.changeRequestState({ id: r.id, state: 'resuelto' })).toEqual({ ok: false, error: 'Escribe el motivo.' });
    expect(await A.changeRequestState({ id: r.id, state: 'resuelto', reason: 'Se cambió el tubo (prueba).' })).toMatchObject({ ok: true });
    expect(await req(r.id)).toMatchObject({ state: 'resuelto', resolution_note: 'Se cambió el tubo (prueba).' });
    await runAfters();
    const mails = await outbox(r.email!);
    expect(mails.map((m) => m.subject)).toEqual([`Tu solicitud ${r.reference}: Asignado`, `Te respondimos: ${r.reference}`, `Tu solicitud ${r.reference}: En atención`, `Tu solicitud ${r.reference}: Resuelto`]);
    for (const m of mails) {
      expect(m.text_body).not.toContain('cuadrilla');
      expect(m.text_body).not.toContain('Se cambió el tubo');
      expect(m.text_body).not.toContain(SECRET_DIGEST);
      expect(m.text_body).toContain('Consultar mi solicitud');
    }
  });

  it('«Pedir más información» pasa el caso a «Requiere información» y le avisa; no se pide desde donde la máquina no deja', async () => {
    const r = await newRequest();
    as('attention');
    expect(await A.addRequestMessage({ id: r.id, kind: 'info_request', body: '¿Nos mandas una foto? (prueba)' })).toMatchObject({ ok: true, message: 'Listo: le pedimos la información.' });
    expect((await req(r.id))!.state).toBe('requiere_informacion');
    await runAfters();
    expect((await outbox(r.email!)).map((m) => m.subject)).toEqual([`Necesitamos un dato: ${r.reference}`]);
    expect(await A.addRequestMessage({ id: r.id, kind: 'info_request', body: 'Otra vez (prueba)' })).toEqual({ ok: false, error: 'En «Requiere información» no se pide más información.' });
  });

  it('un responsable de otra área, el editor de la web y el equipo no lo encuentran; auditoría lo lee pero no lo toca ni ve el contacto', async () => {
    const r = await newRequest({ category: 'agua' });
    for (const key of ['roadsLead', 'webEditor', 'social', 'admin'] as DemoUserKey[]) {
      as(key);
      expect(await A.changeRequestState({ id: r.id, state: 'en_revision' }), key).toEqual({ ok: false, error: NOT_YOURS });
      expect(await A.addRequestMessage({ id: r.id, kind: 'internal_note', body: 'Intento (prueba)' }), key).toEqual({ ok: false, error: NOT_YOURS });
      expect(await A.revealContact({ id: r.id }), key).toEqual({ ok: false, error: 'No puedes ver el contacto de esta solicitud.' });
    }
    as('auditView');
    expect(await A.addRequestMessage({ id: r.id, kind: 'internal_note', body: 'Intento (prueba)' })).toEqual({ ok: false, error: NOT_YOURS });
    expect(await A.revealContact({ id: r.id })).toEqual({ ok: false, error: 'No puedes ver el contacto de esta solicitud.' });
    // A session without the second factor reads nothing either.
    as('attention', 'aal1');
    expect(await A.changeRequestState({ id: r.id, state: 'en_revision' })).toEqual({ ok: false, error: NOT_YOURS });
  });

  it('la app pregunta el rol antes que la base: el jefe y auditoría leen el caso, pero no lo trabajan ni ven el contacto, y nada queda escrito', async () => {
    const r = await newRequest({ category: 'agua' });
    const events = () => sysOne<{ n: number }>(`select count(*)::int as n from public.request_events where request_id = $1`, [r.id]);
    const before = await events();
    for (const key of ['boss', 'auditView'] as DemoUserKey[]) {
      as(key);
      // RLS lets them read it (the boss and the auditor read the desk) …
      expect(await t.as(key, (sql) => sql.one(`select id from public.requests where id = $1`, [r.id])), key).toEqual({ id: r.id });
      // … and the app says no before the database is asked to change anything.
      expect(await A.changeRequestState({ id: r.id, state: 'en_revision' }), key).toEqual({ ok: false, error: NOT_YOURS });
      expect(await A.setRequestPriority({ id: r.id, priority: 'alta' }), key).toEqual({ ok: false, error: NOT_YOURS });
      expect(await A.findDuplicates({ id: r.id, q: '' }), key).toEqual({ ok: false, error: NOT_YOURS });
      expect(await A.revealContact({ id: r.id }), key).toEqual({ ok: false, error: 'No puedes ver el contacto de esta solicitud.' });
      expect(await admin.saveReplyTemplate({ kind: 'public_reply', title: `Intento de ${key}`, body: 'Un texto para la persona (prueba).' }), key).toEqual({ ok: false, error: 'No tienes permiso para hacer esto.' });
      expect(await admin.saveArea({ name: `Intento de ${key}` }), key).toEqual({ ok: false, error: 'No tienes permiso para hacer esto.' });
    }
    expect(await events()).toEqual(before);
    expect(await sysOne(`select count(*)::int as n from public.audit_log where action = 'contact_view' and row_id = $1`, [r.id])).toEqual({ n: 0 });
    expect(await sysOne(`select count(*)::int as n from public.request_reply_templates where title like 'Intento de %'`)).toEqual({ n: 0 });
  });

  it('«Ver contacto»: la coordinación lo lee descifrado y queda registrado quién lo miró', async () => {
    const r = await newRequest();
    as('attention');
    const got = await A.revealContact({ id: r.id });
    expect(got).toEqual({ ok: true, data: { name: 'Ana Prueba', email: r.email, phone: null, preferredChannel: 'email' } });
    const log = await sysAll<{ actor_id: string }>(`select actor_id from public.audit_log where action = 'contact_view' and row_id = $1`, [r.id]);
    expect(log.map((l) => l.actor_id)).toEqual([ID('attention')]);
    // Anonymous: nothing to read.
    const anon = await newRequest({ email: null });
    expect(await A.revealContact({ id: anon.id })).toEqual({ ok: true, data: null });
  });
});

describe('unir duplicados, spam y moderación', () => {
  it('unir: el repetido se cierra apuntando al que se queda, los apoyos cuentan y a su remitente le llega «se unió»', async () => {
    const main = await newRequest({ sector: 'Sector del duplicado (prueba)' });
    const dup = await newRequest({ sector: 'Sector del duplicado bis (prueba)' });
    as('servicesLead');
    expect(await A.mergeRequest({ id: dup.id, into: main.id, reason: 'Mismo bote (prueba).' })).toMatchObject({ ok: false });
    as('attention');
    expect(await A.mergeRequest({ id: dup.id, into: main.id, reason: 'Mismo bote (prueba).' })).toMatchObject({ ok: true });
    expect(await req(dup.id)).toMatchObject({ state: 'cerrado', duplicate_of: main.id });
    expect((await sysOne<{ support_count: number }>(`select support_count from public.requests where id = $1`, [main.id]))!.support_count).toBe(1);
    await runAfters();
    expect((await outbox(dup.email!)).map((m) => m.subject)).toEqual([`Tu solicitud ${dup.reference} se unió a otra igual`]);
    // A later change of the case that stays reaches the duplicate's sender too, with their own code.
    expect(await A.changeRequestState({ id: main.id, state: 'en_revision' })).toMatchObject({ ok: true });
    await runAfters();
    expect((await outbox(dup.email!)).at(-1)!.text_body).toContain(`El caso al que se unió tu solicitud ${dup.reference} ahora está «En revisión».`);
  });

  it('spam: «No procede» marcado y guardado, sin correo; una crítica se cierra con su motivo, nunca se borra', async () => {
    const r = await newRequest();
    as('servicesLead');
    expect(await A.markRequestSpam({ id: r.id, reason: 'Publicidad (prueba)' })).toMatchObject({ ok: false });
    as('attention');
    expect(await A.markRequestSpam({ id: r.id, reason: 'Publicidad (prueba)' })).toMatchObject({ ok: true });
    expect(await req(r.id)).toMatchObject({ state: 'no_procede', is_spam: true });
    await runAfters();
    expect(await outbox(r.email!)).toEqual([]);
    expect(await sysOne(`select id from public.requests where id = $1`, [r.id])).not.toBeNull();
  });

  it('retirar un dato o el texto de un mensaje: queda el registro de qué y por qué, nunca lo que decía', async () => {
    const r = await newRequest();
    as('attention');
    expect(await A.redactRequestField({ id: r.id, field: 'description', reason: 'Tenía un teléfono (prueba).' })).toMatchObject({ ok: true });
    expect((await sysOne<{ description: string }>(`select description from public.requests where id = $1`, [r.id]))!.description).toBe('[Texto retirado por el equipo]');
    const ev = await sysOne<{ detail: { field: string }; reason: string }>(`select detail, reason from public.request_events where request_id = $1 and kind = 'redacted'`, [r.id]);
    expect(ev).toEqual({ detail: { field: 'description' }, reason: 'Tenía un teléfono (prueba).' });
  });
});

describe('las respuestas guardadas y lo de administración', () => {
  it('la coordinación crea y cambia respuestas guardadas; un responsable no', async () => {
    as('attention');
    expect(await admin.saveReplyTemplate({ kind: 'public_reply', title: 'Prueba de la coordinación (acciones)', body: 'Un texto para la persona (prueba).' })).toMatchObject({ ok: true });
    as('servicesLead');
    expect(await admin.saveReplyTemplate({ kind: 'public_reply', title: 'Intento del responsable', body: 'Un texto para la persona (prueba).' })).toEqual({ ok: false, error: 'No tienes permiso para hacer esto.' });
  });

  it('administración arma áreas, quién está y los plazos; la coordinación no', async () => {
    as('admin');
    const created = await admin.saveArea({ name: 'Área de prueba de acciones', description: 'Para la prueba.' });
    expect(created).toMatchObject({ ok: true });
    const id = (created as { data: { id: string } }).data.id;
    expect(await admin.setAreaMember({ areaId: id, userId: ID('roadsLead'), on: true })).toMatchObject({ ok: true });
    expect(await sysOne(`select 1 as x from public.area_members where area_id = $1 and user_id = $2`, [id, ID('roadsLead')])).toEqual({ x: 1 });
    expect(await admin.saveDeskSettings({ urgente: 2, alta: 5, normal: null, baja: null, staleDays: 7 })).toMatchObject({ ok: true });
    expect((await sysOne<{ value: unknown }>(`select value from public.app_settings where key = 'participation.alerts'`))!.value).toEqual({ staleDays: 7 });
    as('attention');
    expect(await admin.saveArea({ name: 'Intento de la coordinación' })).toEqual({ ok: false, error: 'No tienes permiso para hacer esto.' });
    expect(await admin.saveDeskSettings({ urgente: 1, alta: 1, normal: null, baja: null, staleDays: 1 })).toEqual({ ok: false, error: 'No tienes permiso para hacer esto.' });
    expect(await admin.setAreaMember({ areaId: id, userId: ID('roadsLead'), on: false })).toMatchObject({ ok: false });
    as('admin');
    expect(await admin.saveDeskSettings({ urgente: 2, alta: 5, normal: null, baja: null, staleDays: 5 })).toMatchObject({ ok: true });
  });

  it('administración invita a un responsable con sus áreas (sin área no se puede) y a cada rol de la web y la atención', async () => {
    as('admin');
    expect(await team.inviteUser({ email: 'responsable.nueva@demo.test', fullName: 'Responsable Nueva', role: 'reports_operator' })).toEqual({
      ok: false, error: 'Elige al menos un área para el responsable.',
    });
    const roads = await area('vialidad-transporte');
    expect(await team.inviteUser({ email: 'responsable.nueva@demo.test', fullName: 'Responsable Nueva', role: 'reports_operator', areaIds: [roads] })).toMatchObject({ ok: true, message: 'Invitación enviada.' });
    const p = await sysOne<{ id: string; roles: string[] }>(`select p.id, array_agg(ur.role::text) as roles from public.profiles p join public.user_roles ur on ur.user_id = p.id where p.email = 'responsable.nueva@demo.test' group by p.id`);
    expect(p!.roles).toEqual(['reports_operator']);
    expect(await sysAll(`select area_id from public.area_members where user_id = $1`, [p!.id])).toEqual([{ area_id: roads }]);
    for (const role of ['writer', 'web_publisher', 'attention_coordinator', 'complaints_operator', 'auditor'] as const) {
      expect(await team.inviteUser({ email: `nuevo.${role}@demo.test`, fullName: `Persona ${role}`, role }), role).toMatchObject({ ok: true });
    }
    // Administración never in the same account as a role that reads the requests or publishes the web.
    expect(await team.setRole({ userId: p!.id, role: 'admin', on: true })).toEqual({ ok: false, error: 'Administración no publica la web ni lee las solicitudes ciudadanas: usa otra cuenta.' });
  });
});

describe('los correos de estado', () => {
  it('en producción con EMAIL_MODE=outbox no se escribe nada (la dirección nunca queda en claro para un correo que no sale)', async () => {
    const r = await newRequest();
    const send = vi.fn();
    const plan = (to: string) => confirmationPlan(to, 'supabase', () => false);
    expect(await email.sendStatusEmails({ requestId: r.id, kind: 'state', state: 'en_atencion', key: 'prueba' }, { send, plan })).toBe(0);
    expect(send).not.toHaveBeenCalled();
    // Delivering, it goes once per contact, with its idempotency key.
    const ok = vi.fn(async () => ({ stored: true, sent: true }));
    expect(await email.sendStatusEmails({ requestId: r.id, kind: 'state', state: 'en_atencion', key: 'prueba' }, { send: ok, plan: () => ({ queue: true, delivers: true }) })).toBe(1);
    expect((ok.mock.calls as unknown as [Record<string, unknown>][])[0][0]).toMatchObject({ to: r.email, idempotencyKey: expect.stringMatching(/^atencion-state:prueba:[0-9a-f-]{36}$/) });
  });

  it('una solicitud anónima no recibe nada; a quien se sumó le llega solo el cambio de estado, con su propio código', async () => {
    const anon = await newRequest({ email: null });
    const send = vi.fn(async () => ({ stored: true, sent: false }));
    expect(await email.sendStatusEmails({ requestId: anon.id, kind: 'state', state: 'en_atencion', key: 'x' }, { send, plan: () => ({ queue: true, delivers: false }) })).toBe(0);
    const main = await newRequest({ sector: 'Sector de quien se suma (prueba)' });
    const sup = sealContact({ name: 'Beto Prueba', email: 'beto.prueba@demo.test', channel: 'email' });
    const s = await asAnon(t.backend, (sql) =>
      sql.one<{ v: { reference: string } }>(
        `select citizen.support_request(p_submission_key => gen_random_uuid(), p_secret_digest => $1, p_device_key => $2, p_ip_key => $3, p_request_id => $4,
           p_contact_name => $5, p_contact_email => $6, p_contact_channel => 'email') as v`,
        [hex(), hex(), hex(), main.id, sup.name, sup.email],
      ),
    );
    const to = vi.fn(async () => ({ stored: true, sent: false }));
    await email.sendStatusEmails({ requestId: main.id, kind: 'reply', key: 'y' }, { send: to, plan: () => ({ queue: true, delivers: false }) });
    expect((to.mock.calls as unknown as [{ to: string }][]).map((c) => c[0].to)).toEqual([main.email]);
    to.mockClear();
    await email.sendStatusEmails({ requestId: main.id, kind: 'state', state: 'resuelto', key: 'z' }, { send: to, plan: () => ({ queue: true, delivers: false }) });
    const calls = to.mock.calls as unknown as [{ to: string; subject: string }][];
    expect(calls.map((c) => c[0].to).sort()).toEqual(['beto.prueba@demo.test', main.email].sort());
    expect(calls.find((c) => c[0].to === 'beto.prueba@demo.test')![0].subject).toBe(`Tu solicitud ${s!.v.reference}: Resuelto`);
  });
});

describe('los avisos del cron: vencidas y sin movimiento', () => {
  it('a la coordinación y a su responsable, una vez al día por caso; con el código, nunca lo que escribió la persona', async () => {
    const now = new Date();
    const first = await alerts.runAttentionAlerts(now);
    expect(first.notified).toBeGreaterThan(0);
    const notices = h.notices as Notice[];
    expect(notices.every((x) => x.kind === 'attention_overdue' || x.kind === 'attention_stale')).toBe(true);
    for (const x of notices) {
      expect(x.title).toMatch(/^(Solicitud|Denuncia) (vencida|sin movimiento): AC-\d{4}-[0-9A-Z]{6}$/);
      expect(x.userIds).toContain(ID('attention'));
      expect(x.link).toMatch(/^\/admin\/atencion\/[0-9a-f-]{36}$/);
      expect(x.email).toBeFalsy();
    }
    // A denuncia's notice never reaches a responsible of an area or the auditor.
    const titles = await sysAll<{ id: string; type: string }>(`select id, type from public.requests`);
    const typeOf = new Map(titles.map((r) => [r.id, r.type]));
    for (const x of notices.filter((y) => typeOf.get(y.link!.split('/').pop()!) === 'denuncia')) {
      expect(x.userIds).not.toContain(ID('servicesLead'));
      expect(x.userIds).not.toContain(ID('auditView'));
    }
    // The same day again: nothing new. The next day: again.
    h.notices.length = 0;
    expect(await alerts.runAttentionAlerts(now)).toMatchObject({ notified: 0 });
    expect(h.notices).toEqual([]);
    const tomorrow = new Date(now.getTime() + 86_400_000);
    expect((await alerts.runAttentionAlerts(tomorrow)).notified).toBeGreaterThan(0);
  });
});
