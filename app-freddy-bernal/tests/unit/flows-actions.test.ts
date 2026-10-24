// The flow actions themselves (not a copy of their SQL), against a real in-memory database
// with the same migrations. The session and notify() are mocked: we check who gets each
// notice (never the person who acted), the role guards and what ends up in the database.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import type { Session } from '@/lib/auth/session';
import type { Notice } from '@/lib/notify';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import { looksLikeDateTime } from '@/lib/push/text';
import { makeTestDb, type TestDb } from '../rls/setup';

const h = vi.hoisted(() => ({ session: null as unknown, notices: [] as unknown[] }));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ requireSession: vi.fn(async () => h.session) }));
vi.mock('@/lib/notify', async (orig) => ({
  ...(await orig<typeof import('@/lib/notify')>()),
  notify: vi.fn(async (n: unknown) => {
    h.notices.push(n);
  }),
}));

let t: TestDb;
let events: typeof import('@/lib/actions/events');
let team: typeof import('@/lib/actions/team');
let media: typeof import('@/lib/actions/media');

beforeAll(async () => {
  t = await makeTestDb();
  (globalThis as { __fbBackend?: Promise<unknown> }).__fbBackend = Promise.resolve(t.backend);
  events = await import('@/lib/actions/events');
  team = await import('@/lib/actions/team');
  media = await import('@/lib/actions/media');
});

beforeEach(() => {
  h.notices.length = 0;
});

function as(key: DemoUserKey) {
  const u = DEMO_USERS.find((x) => x.key === key)!;
  h.session = {
    userId: t.ids[key], email: u.email, name: u.name, roles: [...u.roles], aal: 'aal2', mfaRequired: false, mfaOk: true,
    claims: { sub: t.ids[key], aal: 'aal2', role: 'authenticated' }, viewAs: null,
  } satisfies Session;
}

const notices = () => h.notices as Notice[];
const sent = (kind: string) => notices().filter((n) => n.kind === kind);
const later = () => new Date(Date.now() + 40 * 86400_000).toISOString().slice(0, 10);

const newEvent = (title: string, extra: Record<string, unknown> = {}) => ({
  title, placeName: 'Cancha inventada', municipality: 'Municipio Demo', summary: '', categoryId: '', urgency: 2, cameraUserId: '',
  allowOverlap: true, date: later(), time: '10:00', durationMin: 60, exactAddress: 'Calle inventada 123', directions: 'Al lado de la plaza de prueba',
  siteContacts: 'Vocera demo 0000-1234567', ...extra,
});

describe('createEvent: avisos al proponer o crear', () => {
  it('secretaría propone: avisa al jefe y a despacho, a ella no, y solo con el título', async () => {
    as('secretary');
    const r = await events.createEvent(newEvent('Visita de prueba a la escuela'));
    expect(r.ok).toBe(true);
    const [n, ...rest] = sent('event_new');
    expect(rest).toHaveLength(0);
    expect(n.title).toBe('Hay un evento nuevo por decidir: Visita de prueba a la escuela');
    expect(new Set(n.userIds)).toEqual(new Set([t.ids.boss, t.ids.dispatch]));
    expect(sent('event_assigned')).toHaveLength(0);
    const out = JSON.stringify(notices());
    for (const secret of ['Calle inventada', 'plaza de prueba', '1234567', '10:00', 'Cancha inventada']) expect(out).not.toContain(secret);
  });

  it('despacho crea con cámara: el aviso (también por correo) a quien graba no lleva la fecha escrita en el título', async () => {
    as('dispatch');
    const r = await events.createEvent(newEvent('Inauguración del puente el 28/10 a las 9:30', { cameraUserId: t.ids.camera }));
    expect(r.ok).toBe(true);
    const [a] = sent('event_assigned');
    expect(a.userIds).toEqual([t.ids.camera]);
    expect(a.email).toBe(true);
    expect(a.body).toContain('Inauguración del puente');
    expect(`${a.title} ${a.body}`).not.toMatch(/28\/10|9:30/);
    expect(looksLikeDateTime(`${a.title} ${a.body}`)).toBe(false);
    const [n] = sent('event_new');
    expect(n.userIds).toEqual([t.ids.boss]); // despacho created it: no notice to herself
    expect(n.title).not.toMatch(/28\/10|9:30/);
  });
});

describe('updateProposal: el jefe ve el título corregido', () => {
  it('si cambia el título, el jefe y despacho reciben el aviso otra vez con el título nuevo', async () => {
    as('secretary');
    const c = await events.createEvent(newEvent('Visita de prueba a la biblioteca'));
    const id = (c as { data: { id: string } }).data.id;
    h.notices.length = 0;
    const r = await events.updateProposal({ id, title: 'Visita corregida a la biblioteca', placeName: '', municipality: '', summary: '', categoryId: '' });
    expect(r.ok).toBe(true);
    const [n, ...rest] = sent('event_new');
    expect(rest).toHaveLength(0);
    expect(n.title).toBe('Corrigieron el evento por decidir: Visita corregida a la biblioteca');
    expect(n.key).not.toBe(`event_new:${id}`); // not swallowed by the first notice's key
    expect(n.key.startsWith(`event_new:${id}:`)).toBe(true);
    expect(new Set(n.userIds)).toEqual(new Set([t.ids.boss, t.ids.dispatch]));
  });

  it('si solo cambia el resumen, no hay aviso nuevo', async () => {
    as('secretary');
    const c = await events.createEvent(newEvent('Propuesta con resumen nuevo'));
    const id = (c as { data: { id: string } }).data.id;
    h.notices.length = 0;
    const r = await events.updateProposal({ id, title: 'Propuesta con resumen nuevo', placeName: '', municipality: '', summary: 'Otro resumen', categoryId: '' });
    expect(r.ok).toBe(true);
    expect(notices()).toHaveLength(0);
  });
});

describe('bossDecide: solo el jefe decide', () => {
  const proposal = async (title: string) => {
    as('secretary');
    const c = await events.createEvent(newEvent(title));
    h.notices.length = 0;
    return (c as { data: { id: string } }).data.id;
  };
  const decision = (id: string) => t.system((sql) => sql.one<{ boss_decision: string }>(`select boss_decision from public.events where id = $1`, [id]));

  it('despacho o administración no pueden decidir por él (ni mandar un aviso falso)', async () => {
    const id = await proposal('Propuesta que despacho no decide');
    for (const who of ['dispatch', 'admin'] as const) {
      as(who);
      const r = await events.bossDecide({ id, priority: 5, decision: 'accepted' });
      expect(r).toEqual({ ok: false, error: 'Solo el jefe decide.' });
    }
    expect((await decision(id))?.boss_decision).toBe('pending');
    expect(notices()).toHaveLength(0);
  });

  it('el jefe acepta: se enteran quien propuso y despacho, él no', async () => {
    const id = await proposal('Propuesta que el jefe acepta');
    as('boss');
    const r = await events.bossDecide({ id, priority: 7, decision: 'accepted' });
    expect(r.ok).toBe(true);
    expect((await decision(id))?.boss_decision).toBe('accepted');
    const [n, ...rest] = sent('event_decided');
    expect(rest).toHaveLength(0);
    expect(n.title).toBe('El jefe aceptó: Propuesta que el jefe acepta');
    expect(new Set(n.userIds)).toEqual(new Set([t.ids.secretary, t.ids.dispatch]));
    // Same decision again: nothing changed, no new notice.
    h.notices.length = 0;
    await events.bossDecide({ id, priority: 7, decision: 'accepted' });
    expect(notices()).toHaveLength(0);
  });
});

describe('resetTwoFactor', () => {
  const factor = () => t.system((sql) => sql.query(`insert into demo_auth.totp_factors (user_id, secret, verified) values ($1, 'SECRETODEPRUEBA', true) on conflict do nothing`, [t.ids.social2]));
  const factors = () => t.system((sql) => sql.query(`select 1 from demo_auth.totp_factors where user_id = $1`, [t.ids.social2]));

  it('alguien que no es de administración no puede', async () => {
    await factor();
    as('social');
    expect(await team.resetTwoFactor({ userId: t.ids.social2 })).toEqual({ ok: false, error: 'Solo administración puede hacer esto.' });
    expect(await factors()).toHaveLength(1);
  });

  it('administración no reinicia el suyo', async () => {
    as('admin');
    const r = await team.resetTwoFactor({ userId: t.ids.admin });
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toMatch(/otra persona de administración/);
  });

  it('administración lo reinicia: borra el factor, cierra sesiones y deja la nota en el registro', async () => {
    await factor();
    as('admin');
    const r = await team.resetTwoFactor({ userId: t.ids.social2 });
    expect(r.ok).toBe(true);
    expect(await factors()).toHaveLength(0);
    const p = await t.system((sql) => sql.one<{ sessions_revoked_at: Date | null }>(`select sessions_revoked_at from public.profiles where id = $1`, [t.ids.social2]));
    expect(p?.sessions_revoked_at).not.toBeNull();
    const audit = await t.system((sql) =>
      sql.one<{ actor_id: string; new_data: { factors_removed: number } }>(
        `select actor_id, new_data from public.audit_log where table_name = 'two_factor' and row_id = $1 and action = 'mfa_reset' order by id desc limit 1`,
        [t.ids.social2],
      ),
    );
    expect(audit?.actor_id).toBe(t.ids.admin);
    expect(audit?.new_data.factors_removed).toBe(1);
  });
});

describe('removeMedia', () => {
  it('redes no puede quitar archivos', async () => {
    const m = await t.system((sql) => sql.one<{ id: string }>(`select id from public.media_assets where kind = 'drone' and deleted_at is null limit 1`));
    as('social');
    expect(await media.removeMedia({ id: m!.id })).toEqual({ ok: false, error: 'Solo administración puede quitar archivos.' });
  });

  it('administración no puede quitar el video de una pieza en revisión', async () => {
    const v = await t.system((sql) =>
      sql.one<{ media_asset_id: string }>(
        `select v.media_asset_id from public.piece_versions v join public.pieces p on p.id = v.piece_id
          where p.status = 'in_review' and v.version = p.current_version and v.media_asset_id is not null
            and not exists (select 1 from public.publications x where x.piece_id = p.id) limit 1`,
      ),
    );
    as('admin');
    expect(await media.removeMedia({ id: v!.media_asset_id })).toEqual({ ok: false, error: 'No se puede quitar: es parte de una pieza en revisión.' });
    const still = await t.system((sql) => sql.one<{ deleted_at: Date | null }>(`select deleted_at from public.media_assets where id = $1`, [v!.media_asset_id]));
    expect(still?.deleted_at).toBeNull();
  });

  it('administración no puede quitar lo que ya salió en redes', async () => {
    const v = await t.system((sql) =>
      sql.one<{ media_asset_id: string }>(
        `select v.media_asset_id from public.piece_versions v join public.publications x on x.piece_id = v.piece_id
          where x.status = 'published' and x.deleted_at is null and v.media_asset_id is not null limit 1`,
      ),
    );
    as('admin');
    expect(await media.removeMedia({ id: v!.media_asset_id })).toEqual({ ok: false, error: 'No se puede quitar: lo usa una publicación programada o publicada.' });
  });

  it('administración sí quita material crudo subido por error', async () => {
    const m = await t.system((sql) => sql.one<{ id: string }>(`select id from public.media_assets where kind = 'drone' and deleted_at is null limit 1`));
    as('admin');
    expect((await media.removeMedia({ id: m!.id })).ok).toBe(true);
    expect((await media.removeMedia({ id: m!.id }))).toEqual({ ok: false, error: 'Ese archivo ya no está.' });
  });
});
