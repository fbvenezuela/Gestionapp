// The flow actions themselves (not a copy of their SQL), against a real in-memory database
// with the same migrations. The session and notify() are mocked: we check who gets each
// notice (never the person who acted), the role guards and what ends up in the database.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { DateTime } from 'luxon';
import { TZ } from '@/lib/time';
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

const DATED = 'El título no lleva fecha ni hora: eso va en sus campos.';
const notices = () => h.notices as Notice[];
const sent = (kind: string) => notices().filter((n) => n.kind === kind);
const later = () => new Date(Date.now() + 40 * 86400_000).toISOString().slice(0, 10);

const newEvent = (title: string, extra: Record<string, unknown> = {}) => ({
  title, placeName: 'Cancha inventada', municipality: 'Municipio Demo', summary: '', categoryId: '', urgency: 2, cameraUserId: '',
  allowOverlap: true, date: later(), time: '10:00', durationMin: 60, exactAddress: 'Calle inventada 123', directions: 'Al lado de la plaza de prueba',
  siteContacts: 'Vocera demo 0000-1234567', ...extra,
});

describe('createEvent: avisos al crear', () => {
  it('administración crea: avisa al jefe y a despacho, a ella no, y solo con el título', async () => {
    as('admin');
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

  it('despacho crea con cámara: el aviso (también por correo) a quien graba lleva solo el título', async () => {
    as('dispatch');
    // A date typed into the title is refused (its fields are for that): no event, no notice.
    expect(await events.createEvent(newEvent('Inauguración del puente el 28/10 a las 9:30', { cameraUserId: t.ids.camera }))).toEqual({ ok: false, error: DATED });
    expect(notices()).toHaveLength(0);
    const r = await events.createEvent(newEvent('Inauguración del puente', { cameraUserId: t.ids.camera }));
    expect(r.ok).toBe(true);
    const [a] = sent('event_assigned');
    expect(a.userIds).toEqual([t.ids.camera]);
    expect(a.email).toBe(true);
    expect(a.body).toContain('Inauguración del puente');
    expect(looksLikeDateTime(`${a.title} ${a.body}`)).toBe(false);
    const [n] = sent('event_new');
    expect(n.userIds).toEqual([t.ids.boss]); // despacho created it: no notice to herself
  });
});

describe('el título de un evento no lleva fecha ni hora', () => {
  const titled = (title: string) => t.system((sql) => sql.one<{ n: number }>(`select count(*)::int as n from public.events where title = $1`, [title]));
  const WED = '2027-03-10'; // a Wednesday: no title below names it, unless the test says so
  const SUN = '2027-03-14';
  const on = (title: string, date: string) => newEvent(title, { date });
  const idOf = (r: unknown) => (r as { data: { id: string } }).data.id;
  const placeHint = (name: string) => `${DATED} Si «${name}» es el nombre del sitio, ponlo en «A dónde se va».`;

  it('al crear: se rechaza cualquier hora y día de la semana, aunque siga una palabra en -s o un nombre', async () => {
    as('dispatch');
    for (const title of [
      'Acto en la plaza el 28/10', 'Inauguración a las 9:30 am', 'Acto del sábado', 'Acto a las nueve de la noche', 'Acto Domingo 25', 'Acto 28/10/2027',
      'Rueda de prensa a las 10 antes del acto', 'Acto a las 3 después del almuerzo', 'Misa a las 9 tras la procesión', 'Llegada a las ocho después de la misa',
      'Encuentro a las 4 todos juntos', 'Jornada de 8 a 12 todos invitados', 'Inauguración a las 11 pues hay lluvia', 'Acto a las 3 hrs', 'Acto a las 21h', 'Acto 21 hrs',
      'Misa de las 7', 'Acto a la una', 'Acto al mediodía', 'Rueda de prensa hoy', 'Acto a las 3 llegamos todos',
      'Inauguración Viernes', 'Gran Acto Sábado en la plaza', 'Rueda de Prensa Lunes', 'Jornada Médica Domingo', 'Inauguración el viernes', 'Domingo de Ramos en la catedral',
      'Rueda de prensa a las 12m', 'Jornada de 8 a 12m', 'Jornada médica 8-12', 'Rueda de prensa entre 9 y 10', 'Acto 12 m.', 'Almuerzo 12m con productores',
      'Jornada 8 a 12', `Acto el 15 de marzo de ${DateTime.now().setZone(TZ).year + 1}`,
    ]) {
      expect(await events.createEvent(on(title, WED)), title).toEqual({ ok: false, error: DATED });
      expect((await titled(title))?.n, title).toBe(0);
    }
  });

  it('al crear: los sitios con nombre de fecha y los números que no son hora pasan; la fecha del propio evento no', async () => {
    as('dispatch');
    for (const title of [
      'Barrio 23 de Enero: entrega de mercados', 'Visita a la Escuela 12 de Octubre', 'Avenida 19 de Abril: asfaltado', 'Sector 4 de Mayo', 'Liceo 5 de Julio',
      'Urbanización 12 de Octubre', 'Inauguración de la UBCH 24 de Julio', 'Farmacia 24h en Rubio', 'Concierto Joven 3.0', 'Congreso 2.0 de comunicadores',
      'Mañana Deportiva en Táriba', 'Encuentro en la Noche de Talentos', 'Inauguración del ambulatorio', 'Jornada de salud 2026', 'Entrega de útiles a las 3 escuelas',
      'Torneo de las siete parroquias', 'Torneo infantil de 8 a 12 años', 'Visita a Santo Domingo', 'Escuela Domingo Savio: entrega de pupitres', 'Entrega de 1.200 bolsas',
      'Farmacia abierta las 24 horas', 'Urbanización 23 de Enero', 'Plaza 19 de Abril', 'Visita al 23 de Enero', 'Charla para grupos de entre 8 y 10 personas',
      // A past year is a commemoration and a big number a count, not the event's year.
      'Acto conmemorativo del 19 de abril de 1810', 'Barrio 23 de Enero, 1500 bolsas', 'Liceo 5 de Julio 1200 alumnos',
    ]) {
      expect((await events.createEvent(on(title, WED))).ok, title).toBe(true);
    }
    // The same names on the event's own day would say the date: refused, with a hint for the place.
    expect(await events.createEvent(on('Barrio 10 de Marzo: entrega de mercados', WED))).toEqual({ ok: false, error: placeHint('10 de Marzo') });
    expect(await events.createEvent(on('Escuela Domingo Savio: entrega', SUN))).toEqual({ ok: false, error: placeHint('Domingo Savio') });
    expect((await events.createEvent(on('Visita a Santo Domingo', SUN))).ok).toBe(true);
    for (const title of ['Visita al ambulatorio 10/3', 'Acto del 10', 'Inauguración marzo 10']) {
      expect(await events.createEvent(on(title, WED)), title).toEqual({ ok: false, error: DATED });
    }
    expect(await events.createEvent(on('Acto 1.º de marzo', '2027-03-01'))).toEqual({ ok: false, error: placeHint('1.º de marzo') });
    // Every day of a list or span is a date, the first one too: Redes never reads it.
    const spans = ['Jornada de vacunación 8 al 12 de marzo', 'Jornada de vacunación los días 8 y 9 de marzo', 'Feria del 6 al 10 de marzo'];
    for (const title of spans) expect(await events.createEvent(on(title, '2027-03-08')), title).toEqual({ ok: false, error: DATED });
    // «mañana» on the eve, in any case; «Mañana» + a name gets the place hint, like «Domingo Savio».
    const tomorrow = DateTime.now().setZone(TZ).plus({ days: 1 }).toISODate()!;
    for (const title of ['Rueda de prensa mañana', 'Rueda De Prensa Mañana En La Gobernación']) {
      expect(await events.createEvent(on(title, tomorrow)), title).toEqual({ ok: false, error: DATED });
    }
    expect(await events.createEvent(on('Mañana Inauguración del puente', tomorrow))).toEqual({ ok: false, error: placeHint('Mañana Inauguración') });
    for (const title of ['Inauguración marzo 10', 'Acto 1.º de marzo', 'Rueda De Prensa Mañana En La Gobernación', 'Mañana Inauguración del puente', ...spans]) {
      expect((await titled(title))?.n, title).toBe(0);
    }
  });

  it('al editar el evento (despacho)', async () => {
    as('dispatch');
    const id = idOf(await events.createEvent(on('Visita de prueba al ambulatorio', WED)));
    const base = { id, placeName: '', municipality: '', summary: '', categoryId: '' };
    expect(await events.updateEvent({ ...base, title: 'Visita al ambulatorio el lunes a las 8', urgency: 2 })).toEqual({ ok: false, error: DATED });
    // The event's own date in the title, even as a place name, would say when it is.
    expect(await events.updateEvent({ ...base, title: 'Visita al ambulatorio 10 de marzo', urgency: 2 })).toEqual({ ok: false, error: placeHint('10 de marzo') });
    expect(await events.updateEvent({ ...base, title: 'Visita al ambulatorio 10/3', urgency: 2 })).toEqual({ ok: false, error: DATED });
    const ev = await t.system((sql) => sql.one<{ title: string }>(`select title from public.events where id = $1`, [id]));
    expect(ev?.title).toBe('Visita de prueba al ambulatorio');
    expect((await events.updateEvent({ ...base, title: 'Visita al ambulatorio nuevo', urgency: 2 })).ok).toBe(true);
    // Despacho sees the date: a place named after another day is fine.
    expect((await events.updateEvent({ ...base, title: 'Visita al ambulatorio del Sector 4 de Mayo', urgency: 3 })).ok).toBe(true);
  });

  it('un sitio con nombre de fecha no bloquea editar, y no se puede mover el evento a ese día', async () => {
    as('dispatch');
    const title = 'Barrio 23 de Enero: entrega de mercados';
    const id = idOf(await events.createEvent(on(title, WED)));
    const base = { id, placeName: 'Barrio 23 de Enero', municipality: '', categoryId: '' };
    expect((await events.updateEvent({ ...base, title: `${title} y útiles`, summary: 'Con útiles', urgency: 3 })).ok).toBe(true);
    const sched = { id, time: '10:00', durationMin: 60, exactAddress: 'Calle inventada 123', directions: '', siteContacts: '' };
    expect(await events.updateSchedule({ ...sched, date: '2028-01-23' })).toEqual({ ok: false, error: 'El título dice esa fecha: cámbialo primero.' });
    expect((await events.updateSchedule({ ...sched, date: '2028-01-24' })).ok).toBe(true);
  });
});

describe('bossDecide: solo el jefe decide', () => {
  const proposal = async (title: string) => {
    as('admin');
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

  it('el jefe acepta: se enteran quien lo creó y despacho, él no', async () => {
    const id = await proposal('Propuesta que el jefe acepta');
    as('boss');
    const r = await events.bossDecide({ id, priority: 7, decision: 'accepted' });
    expect(r.ok).toBe(true);
    expect((await decision(id))?.boss_decision).toBe('accepted');
    const [n, ...rest] = sent('event_decided');
    expect(rest).toHaveLength(0);
    expect(n.title).toBe('El jefe aceptó: Propuesta que el jefe acepta');
    expect(new Set(n.userIds)).toEqual(new Set([t.ids.admin, t.ids.dispatch]));
    // Same decision again: nothing changed, no new notice.
    h.notices.length = 0;
    await events.bossDecide({ id, priority: 7, decision: 'accepted' });
    expect(notices()).toHaveLength(0);
  });

  it('quien lo creó y ya no tiene rol (una cuenta de la ex Secretaría) no recibe el aviso', async () => {
    const id = await t.system(async (sql) => {
      const ghost = await sql.one<{ id: string }>(`insert into auth.users (email) values ('ex-secretaria@prueba.test') returning id`);
      return (await sql.one<{ id: string }>(`insert into public.events (title, place_name, created_by) values ('Evento de alguien sin rol', 'Sitio inventado', $1) returning id`, [ghost!.id]))!.id;
    });
    as('boss');
    expect((await events.bossDecide({ id, priority: 4, decision: 'rejected' })).ok).toBe(true);
    const [n] = sent('event_decided');
    expect(n.userIds).toEqual([t.ids.dispatch]);
  });
});

describe('approveGreen: el jefe aprueba todas las verdes de un toque', () => {
  const green = async (title: string) =>
    t.as('social', async (sql) => {
      const id = (await sql.one<{ id: string }>(`insert into public.pieces (kind, title, review_level) values ('video', $1, 'verde') returning id`, [title]))!.id;
      await sql.query(`insert into public.piece_versions (piece_id, version) values ($1, 1)`, [id]);
      await sql.query(`update public.pieces set current_version = 1 where id = $1`, [id]);
      await sql.query(`insert into public.copies (piece_id, length_group, body) values ($1, 'short', 'Copy corto.')`, [id]);
      await sql.query(`update public.pieces set status = 'in_review' where id = $1`, [id]);
      return (await sql.one<{ id: string; revision: number }>(`select id, revision from public.pieces where id = $1`, [id]))!;
    });
  const status = (id: string) => t.system((sql) => sql.one<{ status: string; approved_by: string | null }>(`select status, approved_by from public.pieces where id = $1`, [id]));

  it('aprueba las que vio en una sola llamada y se salta la que cambió mientras tanto', async () => {
    const pieces = await import('@/lib/actions/pieces');
    const [a, b, c] = [await green('Verde uno'), await green('Verde dos'), await green('Verde tres')];
    await t.as('social', (sql) => sql.query(`update public.copies set body = 'Copy cambiado.' where piece_id = $1`, [c.id]));
    as('boss');
    const r = await pieces.approveGreen({ pieces: [a, b, c] });
    expect(r).toMatchObject({ ok: true, data: { n: 2, skipped: 1 } });
    for (const p of [a, b]) expect(await status(p.id)).toEqual({ status: 'approved', approved_by: t.ids.boss });
    expect((await status(c.id))?.status).toBe('in_review');
    const [n] = sent('piece_approved');
    expect(n.userIds).toEqual(expect.arrayContaining([t.ids.social, t.ids.social2]));
  });

  it('nadie más las aprueba, ni administración ni Redes', async () => {
    const pieces = await import('@/lib/actions/pieces');
    const g = await green('Verde que nadie más aprueba');
    for (const who of ['admin', 'social', 'dispatch'] as const) {
      as(who);
      // Refused by the database, or (despacho does not even see pieces) nothing to approve.
      const r = await pieces.approveGreen({ pieces: [g] });
      expect(r.ok ? r.data!.n : 0, who).toBe(0);
    }
    expect((await status(g.id))?.status).toBe('in_review');
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
