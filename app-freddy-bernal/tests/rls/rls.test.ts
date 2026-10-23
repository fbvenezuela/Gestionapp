// RLS tests: each role tries what it must NOT be able to do, and it must fail.
import { describe, it, expect, beforeAll } from 'vitest';
import { makeTestDb, type TestDb } from './setup';

let t: TestDb;
beforeAll(async () => {
  t = await makeTestDb();
});

const eventId = async () => (await t.system((sql) => sql.one<{ id: string }>(`select id from public.events order by code limit 1`)))!.id;
const fails = async (p: Promise<unknown>) => {
  await expect(p).rejects.toThrow();
};

describe('regla de fecha y hora: redes nunca ve la agenda', () => {
  it('redes ve los eventos pero no event_schedule', async () => {
    const evs = await t.as('social', (sql) => sql.query('select * from public.events'));
    expect(evs.length).toBe(6);
    expect(Object.keys(evs[0])).not.toContain('starts_at');
    const sch = await t.as('social', (sql) => sql.query('select * from public.event_schedule'));
    expect(sch).toHaveLength(0);
  });

  it('redes no lo consigue por join, vista ni subconsulta', async () => {
    const j = await t.as('social', (sql) =>
      sql.query('select e.id, s.starts_at from public.events e left join public.event_schedule s on s.event_id = e.id'),
    );
    expect(j.every((r) => r.starts_at === null)).toBe(true);
    const v = await t.as('social', (sql) => sql.query('select * from public.event_calendar'));
    expect(v).toHaveLength(0);
    const c = await t.as('social', (sql) =>
      sql.one<{ n: number }>('select count(*)::int as n from public.events e where exists (select 1 from public.event_schedule s where s.event_id = e.id)'),
    );
    expect(c!.n).toBe(0);
  });

  it('redes no puede escribir en event_schedule', async () => {
    const id = await eventId();
    await fails(
      t.as('social', (sql) => sql.query(`insert into public.event_schedule (event_id, starts_at, ends_at) values ($1, now(), now() + interval '1 hour')`, [id])),
    );
    const upd = await t.as('social', (sql) => sql.query(`update public.event_schedule set exact_address = 'x' returning event_id`));
    expect(upd).toHaveLength(0);
  });

  it('supervisión y secretaría tampoco ven la agenda', async () => {
    for (const who of ['supervisor', 'secretary'] as const) {
      const sch = await t.as(who, (sql) => sql.query('select * from public.event_schedule'));
      expect(sch).toHaveLength(0);
    }
  });

  it('el registro de cambios de la agenda no es legible por redes', async () => {
    const a = await t.as('social', (sql) => sql.query(`select * from public.audit_log where table_name = 'event_schedule'`));
    expect(a).toHaveLength(0);
  });

  it('jefe, despacho y administración ven todo el calendario', async () => {
    for (const who of ['boss', 'dispatch', 'admin'] as const) {
      const sch = await t.as(who, (sql) => sql.query('select * from public.event_calendar'));
      expect(sch).toHaveLength(6);
    }
  });

  it('sin doble factor (aal1), el jefe no ve la agenda', async () => {
    const sch = await t.as('boss', (sql) => sql.query('select * from public.event_schedule'), 'aal1');
    expect(sch).toHaveLength(0);
  });

  it('quien graba ve solo la fecha de sus eventos asignados', async () => {
    const evs = await t.as('camera', (sql) => sql.query('select id from public.events'));
    const sch = await t.as('camera', (sql) => sql.query('select event_id from public.event_schedule'));
    expect(evs.length).toBe(2);
    expect(sch.length).toBe(2);
    const assigned = await t.system((sql) => sql.query(`select event_id from public.event_assignments where user_id = $1`, [t.ids.camera]));
    expect(new Set(sch.map((r) => r.event_id))).toEqual(new Set(assigned.map((r) => r.event_id)));
  });

  it('al marcar realizado, redes ve solo el día', async () => {
    const evs = await t.as('social', (sql) => sql.query<{ done_on: unknown }>('select done_on from public.events where done_on is not null'));
    expect(evs.length).toBe(2);
  });

  it('redes no puede marcar un evento como realizado ni cambiar su prioridad', async () => {
    const id = await eventId();
    await fails(t.as('social', (sql) => sql.query('select public.mark_event_done($1)', [id])));
    await fails(t.as('social', (sql) => sql.query('update public.events set priority = 3 where id = $1', [id])));
  });

  it('redes sí puede cambiar el estado de trabajo', async () => {
    const id = await eventId();
    const r = await t.as('social', (sql) => sql.query(`update public.events set work_status = 'editing' where id = $1 returning id`, [id]));
    expect(r).toHaveLength(1);
  });

  it('el jefe califica y decide, pero no cambia el título', async () => {
    const id = await eventId();
    const r = await t.as('boss', (sql) => sql.query(`update public.events set priority = 10, boss_decision = 'accepted' where id = $1 returning id`, [id]));
    expect(r).toHaveLength(1);
    await fails(t.as('boss', (sql) => sql.query(`update public.events set title = 'otro título' where id = $1`, [id])));
  });
});

describe('aprobación: nada se publica sin supervisión', () => {
  const pieceIn = (status: string) =>
    t.system((sql) => sql.one<{ id: string }>(`select id from public.pieces where status = $1 limit 1`, [status]));

  it('redes no puede aprobar una pieza', async () => {
    const p = (await pieceIn('in_review'))!.id;
    await fails(t.as('social', (sql) => sql.query(`update public.pieces set status = 'approved' where id = $1`, [p])));
    await fails(t.as('social', (sql) => sql.query(`select public.review_piece($1, 'approved')`, [p])));
    await fails(t.as('admin', (sql) => sql.query(`select public.review_piece($1, 'approved')`, [p])));
  });

  it('no se puede crear una pieza ya aprobada', async () => {
    await fails(t.as('social', (sql) => sql.query(`insert into public.pieces (kind, title, status) values ('video', 'Pieza trampa', 'approved')`)));
  });

  it('no se programa una publicación de una pieza sin aprobar', async () => {
    const p = (await pieceIn('in_review'))!.id;
    await fails(
      t.as('social', (sql) => sql.query(`insert into public.publications (piece_id, network, status, scheduled_at) values ($1, 'instagram', 'scheduled', now())`, [p])),
    );
    await fails(
      t.as('social', (sql) => sql.query(`insert into public.publications (piece_id, network, status, url) values ($1, 'instagram', 'published', 'https://x.y')`, [p])),
    );
  });

  it('supervisión aprueba y entonces sí se puede marcar publicada', async () => {
    const p = (await pieceIn('in_review'))!.id;
    await t.as('supervisor', (sql) => sql.query(`select public.review_piece($1, 'approved', 'ok')`, [p]));
    const r = await t.as('social', (sql) =>
      sql.query(`insert into public.publications (piece_id, network, status, url) values ($1, 'instagram', 'published', 'https://example.com/p') returning id`, [p]),
    );
    expect(r).toHaveLength(1);
  });

  it('pedir cambios exige comentario', async () => {
    const p = await t.system((sql) => sql.one<{ id: string }>(`select id from public.pieces where status = 'approved' limit 1`));
    await fails(t.as('supervisor', (sql) => sql.query(`select public.review_piece($1, 'changes_requested', '')`, [p!.id])));
  });

  it('una versión nueva vuelve a revisión', async () => {
    const p = await t.system((sql) => sql.one<{ id: string; current_version: number }>(`select id, current_version from public.pieces where status = 'approved' limit 1`));
    const r = await t.as('social', (sql) =>
      sql.one<{ status: string }>(`update public.pieces set current_version = current_version + 1 where id = $1 returning status`, [p!.id]),
    );
    expect(r!.status).toBe('in_review');
  });

  it('supervisión sin doble factor no aprueba', async () => {
    const p = (await pieceIn('in_review'))!.id;
    await fails(t.as('supervisor', (sql) => sql.query(`select public.review_piece($1, 'approved')`, [p]), 'aal1'));
  });

  it('redes no aprueba tweets; supervisión sí', async () => {
    const tw = await t.system((sql) => sql.one<{ id: string }>(`select id from public.tweets where status = 'draft' limit 1`));
    await fails(t.as('social', (sql) => sql.query(`update public.tweets set status = 'approved', approved_at = now() where id = $1`, [tw!.id])));
    await fails(t.as('social', (sql) => sql.query(`update public.tweets set status = 'scheduled' where id = $1`, [tw!.id])));
    const ok = await t.as('supervisor', (sql) =>
      sql.query(`update public.tweets set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = $1 returning id`, [tw!.id]),
    );
    expect(ok).toHaveLength(1);
  });

  it('editar un tweet aprobado lo devuelve a borrador', async () => {
    const tw = await t.system((sql) => sql.one<{ id: string }>(`select id from public.tweets where approved_at is not null limit 1`));
    const r = await t.as('social', (sql) =>
      sql.one<{ status: string; approved_at: unknown }>(`update public.tweets set body = body || ' (editado)' where id = $1 returning status, approved_at`, [tw!.id]),
    );
    expect(r!.status).toBe('draft');
    expect(r!.approved_at).toBeNull();
  });
});

describe('roles y permisos generales', () => {
  it('quien graba no ve piezas, tweets ni publicaciones', async () => {
    for (const table of ['pieces', 'tweets', 'publications', 'copies']) {
      const r = await t.as('camera', (sql) => sql.query(`select * from public.${table}`));
      expect(r, table).toHaveLength(0);
    }
  });

  it('quien graba solo sube material a sus eventos', async () => {
    const mine = await t.system((sql) => sql.one<{ event_id: string }>(`select event_id from public.event_assignments where user_id = $1 limit 1`, [t.ids.camera]));
    const other = await t.system((sql) =>
      sql.one<{ id: string }>(`select id from public.events where id not in (select event_id from public.event_assignments where user_id = $1) limit 1`, [t.ids.camera]),
    );
    const ok = await t.as('camera', (sql) =>
      sql.query(`insert into public.media_assets (event_id, kind, storage_path, uploaded_by) values ($1, 'boss', $2, auth.uid()) returning id`, [mine!.event_id, `${mine!.event_id}/${crypto.randomUUID()}.mp4`]),
    );
    expect(ok).toHaveLength(1);
    await fails(
      t.as('camera', (sql) =>
        sql.query(`insert into public.media_assets (event_id, kind, storage_path, uploaded_by) values ($1, 'boss', $2, auth.uid())`, [other!.id, `${other!.id}/${crypto.randomUUID()}.mp4`]),
      ),
    );
    await fails(
      t.as('camera', (sql) =>
        sql.query(`insert into public.media_assets (event_id, kind, storage_path, uploaded_by) values ($1, 'final', $2, auth.uid())`, [mine!.event_id, `${mine!.event_id}/${crypto.randomUUID()}.mp4`]),
      ),
    );
  });

  it('secretaría ve solo los eventos que propuso', async () => {
    const before = await t.as('secretary', (sql) => sql.query('select id from public.events'));
    expect(before).toHaveLength(0);
    const created = await t.as('secretary', (sql) =>
      sql.one<{ id: string }>(`insert into public.events (title, place_name) values ('Audiencia con gremio (demo)', 'Sede del gremio') returning id`),
    );
    const after = await t.as('secretary', (sql) => sql.query('select id from public.events'));
    expect(after.map((r) => r.id)).toEqual([created!.id]);
  });

  it('nadie que no sea administrador borra (borrado lógico)', async () => {
    const id = await eventId();
    await fails(t.as('dispatch', (sql) => sql.query(`update public.events set deleted_at = now() where id = $1`, [id])));
    await fails(t.as('social', (sql) => sql.query(`delete from public.events where id = $1`, [id])));
    const r = await t.as('admin', (sql) => sql.query(`update public.events set deleted_at = now() where id = $1 returning id`, [id]));
    expect(r).toHaveLength(1);
    const seen = await t.as('social', (sql) => sql.query(`select id from public.events where id = $1`, [id]));
    expect(seen).toHaveLength(0);
    await t.as('admin', (sql) => sql.query(`update public.events set deleted_at = null where id = $1`, [id]));
  });

  it('solo administración da roles; nadie se da roles a sí mismo', async () => {
    await fails(t.as('social', (sql) => sql.query(`insert into public.user_roles (user_id, role) values (auth.uid(), 'admin')`)));
    await fails(t.as('boss', (sql) => sql.query(`insert into public.user_roles (user_id, role) values (auth.uid(), 'supervisor')`)));
    const mine = await t.as('social', (sql) => sql.query(`select * from public.user_roles`));
    expect(mine).toHaveLength(1);
  });

  it('el perfil propio: nombre sí, activar o correo no', async () => {
    const ok = await t.as('social', (sql) => sql.query(`update public.profiles set full_name = 'Nombre nuevo' where id = auth.uid() returning id`));
    expect(ok).toHaveLength(1);
    await fails(t.as('social', (sql) => sql.query(`update public.profiles set email = 'otro@demo.test' where id = auth.uid()`)));
    const other = await t.as('social', (sql) => sql.query(`update public.profiles set full_name = 'x' where id = $1 returning id`, [t.ids.admin]));
    expect(other).toHaveLength(0);
  });

  it('el registro de cambios no se puede editar ni borrar, y solo lo lee administración', async () => {
    const n = await t.as('admin', (sql) => sql.one<{ n: number }>('select count(*)::int as n from public.audit_log'));
    expect(n!.n).toBeGreaterThan(0);
    const s = await t.as('social', (sql) => sql.query('select * from public.audit_log'));
    expect(s).toHaveLength(0);
    await fails(t.system((sql) => sql.query(`delete from public.audit_log`)));
    await fails(t.as('admin', (sql) => sql.query(`update public.audit_log set action = 'x'`)));
  });

  it('cada quien ve solo sus avisos; el buzón de correos solo administración', async () => {
    await t.system((sql) =>
      sql.query(`insert into public.notifications (user_id, kind, title) values ($1, 'test', 'Para admin'), ($2, 'test', 'Para redes')`, [t.ids.admin, t.ids.social]),
    );
    const mine = await t.as('social', (sql) => sql.query<{ title: string }>('select title from public.notifications'));
    expect(mine.map((r) => r.title)).toEqual(['Para redes']);
    await t.system((sql) =>
      sql.query(`insert into public.outbox (to_email, subject, html, text_body, template, idempotency_key) values ('a@demo.test', 's', 'h', 't', 'x', 'k1')`),
    );
    expect(await t.as('social', (sql) => sql.query('select * from public.outbox'))).toHaveLength(0);
    expect(await t.as('admin', (sql) => sql.query('select * from public.outbox'))).toHaveLength(1);
  });

  it('un usuario sin rol no ve nada', async () => {
    const ghost = await t.system((sql) => sql.one<{ id: string }>(`insert into auth.users (email) values ('nadie@demo.test') returning id`));
    const r = await t.backend.transaction(async (sql) => {
      await sql.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ghost!.id, aal: 'aal2' })]);
      await sql.query('set local role authenticated');
      const out: Record<string, number> = {};
      for (const table of ['events', 'event_schedule', 'pieces', 'tweets', 'categories', 'profiles', 'app_settings']) {
        out[table] = (await sql.query(`select 1 from public.${table}`)).length;
      }
      return out;
    });
    expect(r).toEqual({ events: 0, event_schedule: 0, pieces: 0, tweets: 0, categories: 0, profiles: 1, app_settings: 0 });
  });

  it('el rol anon no lee ninguna tabla', async () => {
    await fails(
      t.backend.transaction(async (sql) => {
        await sql.query('set local role anon');
        return sql.query('select * from public.events');
      }),
    );
  });
});
