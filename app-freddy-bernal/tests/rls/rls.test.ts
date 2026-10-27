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

  it('el director de política no ve la agenda; el del IVT, solo la fecha de las visitas de sus obras', async () => {
    expect(await t.as('politics', (sql) => sql.query('select * from public.event_schedule'))).toHaveLength(0);
    expect(await t.as('politics', (sql) => sql.query('select * from public.event_calendar'))).toHaveLength(0);
    const sch = await t.as('ivt', (sql) => sql.query<{ event_id: string }>('select event_id from public.event_schedule'));
    const visits = await t.system((sql) => sql.query<{ id: string }>('select id from public.events where obra_ficha_id is not null and deleted_at is null'));
    expect(visits.length).toBeGreaterThan(0);
    expect(new Set(sch.map((r) => r.event_id))).toEqual(new Set(visits.map((r) => r.id)));
    // Without 2FA, not even those.
    expect(await t.as('ivt', (sql) => sql.query('select * from public.event_schedule'), 'aal1')).toHaveLength(0);
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

  it('el jefe califica y decide, y con el despacho comparte la agenda: también cambia el título', async () => {
    const id = await eventId();
    const before = await t.system((sql) => sql.one<{ title: string }>(`select title from public.events where id = $1`, [id]));
    const r = await t.as('boss', (sql) => sql.query(`update public.events set priority = 10, boss_decision = 'accepted' where id = $1 returning id`, [id]));
    expect(r).toHaveLength(1);
    expect(await t.as('boss', (sql) => sql.query(`update public.events set title = 'Otro título (demo)' where id = $1 returning id`, [id]))).toHaveLength(1);
    // Without 2FA the boss still decides, but does not edit the agenda.
    await fails(t.as('boss', (sql) => sql.query(`update public.events set title = 'Sin doble factor (demo)' where id = $1`, [id]), 'aal1'));
    await t.as('boss', (sql) => sql.query(`update public.events set title = $2 where id = $1`, [id, before!.title]));
  });
});

describe('aprobación: nada se publica sin el jefe', () => {
  const pieceIn = (status: string) =>
    t.system((sql) => sql.one<{ id: string }>(`select id from public.pieces where status = $1 and review_level <> 'rojo' order by created_at limit 1`, [status]));

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

  it('el jefe aprueba y entonces sí se puede marcar publicada', async () => {
    const p = (await pieceIn('in_review'))!.id;
    await t.as('boss', (sql) => sql.query(`select public.review_piece($1, 'approved', 'ok')`, [p]));
    const r = await t.as('social', (sql) =>
      // The publication carries the approved Instagram copy, as the real flow does.
      sql.query(
        `insert into public.publications (piece_id, network, status, url, copy_body)
         values ($1, 'instagram', 'published', 'https://example.com/p',
                 (select c.body from public.copies c join public.network_specs s on s.length_group = c.length_group where c.piece_id = $1 and s.network = 'instagram'))
         returning id`,
        [p],
      ),
    );
    expect(r).toHaveLength(1);
  });

  it('pedir cambios exige comentario', async () => {
    const p = await t.system((sql) => sql.one<{ id: string }>(`select id from public.pieces where status = 'approved' limit 1`));
    await fails(t.as('boss', (sql) => sql.query(`select public.review_piece($1, 'changes_requested', '')`, [p!.id])));
  });

  it('una versión nueva vuelve a revisión', async () => {
    const p = await t.system((sql) => sql.one<{ id: string; current_version: number }>(`select id, current_version from public.pieces where status = 'approved' limit 1`));
    const r = await t.as('social', (sql) =>
      sql.one<{ status: string }>(`update public.pieces set current_version = current_version + 1 where id = $1 returning status`, [p!.id]),
    );
    expect(r!.status).toBe('in_review');
  });

  it('el jefe sin doble factor no aprueba', async () => {
    const p = (await pieceIn('in_review'))!.id;
    await fails(t.as('boss', (sql) => sql.query(`select public.review_piece($1, 'approved')`, [p]), 'aal1'));
  });

  it('redes no aprueba tweets; el jefe sí', async () => {
    const tw = await t.system((sql) => sql.one<{ id: string }>(`select id from public.tweets where status = 'draft' limit 1`));
    await fails(t.as('social', (sql) => sql.query(`update public.tweets set status = 'approved', approved_at = now() where id = $1`, [tw!.id])));
    await fails(t.as('social', (sql) => sql.query(`update public.tweets set status = 'scheduled' where id = $1`, [tw!.id])));
    const ok = await t.as('boss', (sql) =>
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

describe('semáforo de aprobación', () => {
  const red = () => t.system((sql) => sql.one<{ id: string }>(`select id from public.pieces where review_level = 'rojo' and status = 'in_review' limit 1`));
  const draftWithFile = async (level = 'amarillo') => {
    const id = (await t.as('social', (sql) => sql.one<{ id: string }>(`insert into public.pieces (kind, title, review_level) values ('video', 'Pieza del semáforo', $1) returning id`, [level])))!.id;
    await t.as('social', (sql) => sql.query(`insert into public.piece_versions (piece_id, version) values ($1, 1)`, [id]));
    await t.as('social', (sql) => sql.query(`update public.pieces set current_version = 1 where id = $1`, [id]));
    return id;
  };

  it('en rojo, redes y administración no aprueban; el jefe aprueba y pide cambios', async () => {
    const p = (await red())!.id;
    await fails(t.as('social', (sql) => sql.query(`select public.review_piece($1, 'approved')`, [p])));
    await fails(t.as('admin', (sql) => sql.query(`select public.review_piece($1, 'approved')`, [p])));
    await t.as('boss', (sql) => sql.query(`select public.review_piece($1, 'approved', 'Va')`, [p]));
    const r = await t.system((sql) => sql.one<{ status: string; approved_by: string }>(`select status, approved_by from public.pieces where id = $1`, [p]));
    expect(r).toMatchObject({ status: 'approved', approved_by: t.ids.boss });
    await t.as('boss', (sql) => sql.query(`select public.review_piece($1, 'changes_requested', 'Falta un dato')`, [p]));
  });

  it('el jefe aprueba lo verde y lo amarillo, nunca sin doble factor', async () => {
    for (const level of ['verde', 'amarillo'] as const) {
      const p = await draftWithFile(level);
      await t.as('social', (sql) => sql.query(`update public.pieces set status = 'in_review' where id = $1`, [p]));
      await fails(t.as('boss', (sql) => sql.query(`select public.review_piece($1, 'approved')`, [p]), 'aal1'));
      await t.as('boss', (sql) => sql.query(`select public.review_piece($1, 'approved')`, [p]));
      const r = await t.system((sql) => sql.one<{ status: string; approved_by: string }>(`select status, approved_by from public.pieces where id = $1`, [p]));
      expect(r).toMatchObject({ status: 'approved', approved_by: t.ids.boss });
    }
  });

  it('no se aprueba un borrador que no se mandó a revisión', async () => {
    const p = await draftWithFile();
    await fails(t.as('boss', (sql) => sql.query(`select public.review_piece($1, 'approved')`, [p])));
  });

  it('redes no baja el nivel de una pieza en revisión ni la saca del rojo', async () => {
    const p = await draftWithFile('rojo');
    await fails(t.as('social', (sql) => sql.query(`update public.pieces set review_level = 'amarillo' where id = $1`, [p])));
    await t.as('social', (sql) => sql.query(`update public.pieces set status = 'in_review' where id = $1`, [p]));
    await fails(t.as('dispatch', (sql) => sql.query(`select public.set_review_level($1, 'verde')`, [p])));
    await fails(t.as('social', (sql) => sql.query(`select public.set_review_level($1, 'verde')`, [p])));
    await t.as('admin', (sql) => sql.query(`select public.set_review_level($1, 'amarillo')`, [p]));
    await t.as('boss', (sql) => sql.query(`select public.set_review_level($1, 'verde')`, [p]));
  });

  it('el reloj de revisión lo pone la base, no la persona', async () => {
    const p = await draftWithFile();
    const r = await t.as('social', (sql) =>
      sql.one<{ sent_to_review_at: Date | null }>(`update public.pieces set status = 'in_review', sent_to_review_at = now() - interval '5 days' where id = $1 returning sent_to_review_at`, [p]),
    );
    expect(Date.now() - new Date(r!.sent_to_review_at!).getTime()).toBeLessThan(60_000);
  });

  it('cambiar el copy de una pieza aprobada la devuelve a revisión', async () => {
    const p = await draftWithFile();
    await t.as('social', (sql) => sql.query(`insert into public.copies (piece_id, length_group, body) values ($1, 'short', 'Copy aprobado.')`, [p]));
    await t.as('social', (sql) => sql.query(`update public.pieces set status = 'in_review' where id = $1`, [p]));
    await t.as('boss', (sql) => sql.query(`select public.review_piece($1, 'approved')`, [p]));
    await t.as('social', (sql) => sql.query(`update public.copies set body = body || ' Editado.' where piece_id = $1 and length_group = 'short'`, [p]));
    const r = await t.system((sql) => sql.one<{ status: string }>(`select status from public.pieces where id = $1`, [p]));
    expect(r!.status).toBe('in_review');
  });
});

describe('lo que sale es exactamente lo aprobado', () => {
  // A fresh amarillo piece with a file and its three copies, approved by the boss.
  const approvedPiece = async () => {
    const id = (await t.as('social', (sql) => sql.one<{ id: string }>(`insert into public.pieces (kind, title) values ('video', 'Pieza aprobada de prueba') returning id`)))!.id;
    await t.as('social', (sql) => sql.query(`insert into public.piece_versions (piece_id, version) values ($1, 1)`, [id]));
    await t.as('social', (sql) => sql.query(`update public.pieces set current_version = 1 where id = $1`, [id]));
    for (const g of ['long', 'medium', 'short']) await t.as('social', (sql) => sql.query(`insert into public.copies (piece_id, length_group, body) values ($1, $2, $3)`, [id, g, `Copy ${g} aprobado.`]));
    await t.as('social', (sql) => sql.query(`update public.pieces set status = 'in_review' where id = $1`, [id]));
    await t.as('boss', (sql) => sql.query(`select public.review_piece($1, 'approved')`, [id]));
    return id;
  };
  const status = async (id: string) => (await t.system((sql) => sql.one<{ status: string }>(`select status from public.pieces where id = $1`, [id])))!.status;

  it('un copy no se pasa a otra pieza ni a otro largo', async () => {
    const a = await approvedPiece();
    // Targets without a copy of that length, so only the guard can stop it (no unique clash).
    const empty = (await t.as('social', (sql) => sql.one<{ id: string }>(`insert into public.pieces (kind, title) values ('video', 'Pieza sin copies') returning id`)))!.id;
    const good = await t.system((sql) => sql.one<{ id: string }>(`select id from public.copies where piece_id = $1 and length_group = 'long'`, [a]));
    await fails(t.as('social', (sql) => sql.query(`update public.copies set piece_id = $1 where id = $2`, [empty, good!.id])));
    const lone = await t.as('social', (sql) => sql.one<{ id: string }>(`insert into public.copies (piece_id, length_group, body) values ($1, 'long', 'Solo largo.') returning id`, [empty]));
    await fails(t.as('social', (sql) => sql.query(`update public.copies set length_group = 'short' where id = $1`, [lone!.id])));
    expect(await status(a)).toBe('approved');
  });

  it('subir a rojo una pieza aprobada la devuelve a revisión', async () => {
    const a = await approvedPiece();
    await t.as('boss', (sql) => sql.query(`select public.set_review_level($1, 'rojo')`, [a]));
    expect(await status(a)).toBe('in_review');
  });

  it('una versión no se vuelve atrás', async () => {
    const a = await approvedPiece();
    await t.as('social', (sql) => sql.query(`insert into public.piece_versions (piece_id, version) values ($1, 2)`, [a]));
    await t.as('social', (sql) => sql.query(`update public.pieces set current_version = 2 where id = $1`, [a]));
    await fails(t.as('social', (sql) => sql.query(`update public.pieces set current_version = 1 where id = $1`, [a])));
  });

  it('la aprobación nombra lo que se vio: si cambió, la base la rechaza', async () => {
    const a = await approvedPiece();
    await t.as('social', (sql) => sql.query(`update public.copies set body = 'Copy cambiado.' where piece_id = $1 and length_group = 'short'`, [a]));
    const r1 = (await t.system((sql) => sql.one<{ revision: number }>(`select revision from public.pieces where id = $1`, [a])))!.revision;
    await t.as('social', (sql) => sql.query(`update public.copies set body = 'Otra vez cambiado.' where piece_id = $1 and length_group = 'short'`, [a]));
    await fails(t.as('boss', (sql) => sql.query(`select public.review_piece($1, 'approved', '', $2)`, [a, r1])));
    await t.as('boss', (sql) => sql.query(`select public.review_piece($1, 'approved', '', $2)`, [a, r1 + 1]));
    expect(await status(a)).toBe('approved');
    // Nobody sets the revision by hand.
    const r = await t.as('social', (sql) => sql.one<{ revision: number }>(`update public.pieces set revision = 0 where id = $1 returning revision`, [a]));
    expect(r!.revision).toBe(r1 + 1);
  });

  it('al dejar de estar aprobada, lo programado vuelve a borrador; lo publicado se puede corregir y borrar', async () => {
    const a = await approvedPiece();
    const body = 'Copy long aprobado.';
    const sch = await t.as('social', (sql) => sql.one<{ id: string }>(`insert into public.publications (piece_id, network, copy_body, status, scheduled_at) values ($1, 'instagram', $2, 'scheduled', now() + interval '1 day') returning id`, [a, body]));
    const pub = await t.as('social', (sql) => sql.one<{ id: string }>(`insert into public.publications (piece_id, network, copy_body, status, url) values ($1, 'facebook', $2, 'published', 'https://example.com/p/1') returning id`, [a, body]));
    await t.as('social', (sql) => sql.query(`update public.copies set body = 'Copy nuevo.' where piece_id = $1 and length_group = 'long'`, [a]));
    const s1 = await t.system((sql) => sql.one<{ status: string }>(`select status from public.publications where id = $1`, [sch!.id]));
    expect(s1!.status).toBe('draft');
    await t.as('social', (sql) => sql.query(`update public.publications set url = 'https://example.com/p/2' where id = $1`, [pub!.id]));
    await t.as('admin', (sql) => sql.query(`update public.publications set deleted_at = now() where id = $1`, [pub!.id]));
  });

  it('se programa solo con el copy aprobado de esa red, y no se cambia después', async () => {
    const a = await approvedPiece();
    await fails(t.as('social', (sql) => sql.query(`insert into public.publications (piece_id, network, copy_body, status, scheduled_at) values ($1, 'x', 'Texto que nadie aprobó', 'scheduled', now())`, [a])));
    const ok = await t.as('social', (sql) => sql.one<{ id: string }>(`insert into public.publications (piece_id, network, copy_body, status, scheduled_at) values ($1, 'x', 'Copy short aprobado.', 'scheduled', now()) returning id`, [a]));
    await fails(t.as('social', (sql) => sql.query(`update public.publications set copy_body = 'Texto cambiado' where id = $1`, [ok!.id])));
    await fails(t.as('social', (sql) => sql.query(`update public.publications set origin = 'boss_spontaneous', piece_id = null, title = 'Truco', status = 'published', url = 'https://example.com/t' where id = $1`, [ok!.id])));
  });

  it('redes no baja el nivel de una pieza que ya pasó por revisión', async () => {
    const id = (await t.as('social', (sql) => sql.one<{ id: string }>(`insert into public.pieces (kind, title) values ('video', 'Pieza que bajaría') returning id`)))!.id;
    await t.as('social', (sql) => sql.query(`insert into public.piece_versions (piece_id, version) values ($1, 1)`, [id]));
    await t.as('social', (sql) => sql.query(`update public.pieces set current_version = 1, review_level = 'verde' where id = $1`, [id]));
    await t.as('social', (sql) => sql.query(`update public.pieces set status = 'in_review' where id = $1`, [id]));
    await t.as('boss', (sql) => sql.query(`select public.set_review_level($1, 'amarillo')`, [id]));
    await t.as('boss', (sql) => sql.query(`select public.review_piece($1, 'changes_requested', 'Ajusta el cierre')`, [id]));
    await fails(t.as('social', (sql) => sql.query(`update public.pieces set review_level = 'verde', status = 'in_review' where id = $1`, [id])));
    await t.as('social', (sql) => sql.query(`update public.pieces set status = 'in_review' where id = $1`, [id]));
  });

  it('un archivo terminado no se reemplaza', async () => {
    const m = await t.system((sql) => sql.one<{ id: string }>(`select id from public.media_assets where kind = 'final' and status = 'ready' limit 1`));
    await fails(t.as('social', (sql) => sql.query(`update public.media_assets set storage_path = 'otro/archivo.mp4' where id = $1`, [m!.id])));
    await fails(t.as('social', (sql) => sql.query(`update public.media_assets set status = 'uploading' where id = $1`, [m!.id])));
    await t.as('social', (sql) => sql.query(`update public.media_assets set label = 'Etiqueta nueva' where id = $1`, [m!.id]));
  });
});

describe('publicaciones espontáneas del jefe', () => {
  it('se registran después, publicadas, con link y sin pieza', async () => {
    const r = await t.as('social', (sql) =>
      sql.one<{ published_at: Date | null }>(
        `insert into public.publications (origin, title, network, status, url) values ('boss_spontaneous', 'Video del jefe en la vía (demo)', 'tiktok', 'published', 'https://example.com/demo/tt/1') returning published_at`,
      ),
    );
    expect(r!.published_at).not.toBeNull();
  });
  it('sin link, programadas o con pieza no se aceptan', async () => {
    await fails(t.as('social', (sql) => sql.query(`insert into public.publications (origin, title, network, status) values ('boss_spontaneous', 'Sin link', 'x', 'published')`)));
    await fails(t.as('social', (sql) => sql.query(`insert into public.publications (origin, title, network, status, scheduled_at) values ('boss_spontaneous', 'Programada', 'x', 'scheduled', now())`)));
    await fails(t.as('social', (sql) => sql.query(`insert into public.publications (origin, title, network, status, url, mode) values ('boss_spontaneous', 'Por API', 'x', 'published', 'https://example.com/a', 'api')`)));
    const draft = await t.system((sql) => sql.one<{ id: string }>(`select id from public.pieces where status = 'draft' limit 1`));
    await fails(t.as('social', (sql) => sql.query(`insert into public.publications (origin, piece_id, title, network, status, url) values ('boss_spontaneous', $1, 'Con pieza', 'x', 'published', 'https://example.com/b')`, [draft!.id])));
  });
  it('una publicación del equipo sigue necesitando pieza aprobada', async () => {
    await fails(t.as('social', (sql) => sql.query(`insert into public.publications (network, status, url) values ('x', 'published', 'https://example.com/c')`)));
  });
  it('no se registra con fecha futura', async () => {
    await fails(t.as('social', (sql) => sql.query(`insert into public.publications (origin, title, network, status, url, published_at) values ('boss_spontaneous', 'Del futuro', 'x', 'published', 'https://example.com/f', now() + interval '2 days')`)));
  });
  it('quien graba no registra publicaciones', async () => {
    await fails(t.as('camera', (sql) => sql.query(`insert into public.publications (origin, title, network, status, url) values ('boss_spontaneous', 'Intento', 'x', 'published', 'https://example.com/d')`)));
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

  it('el director de política y el del IVT no crean eventos ni les ponen fecha', async () => {
    const id = await eventId();
    for (const who of ['politics', 'ivt'] as const) {
      await fails(t.as(who, (sql) => sql.query(`insert into public.events (title, place_name, created_by) values ('Audiencia con gremio (demo)', 'Sede del gremio', auth.uid())`)));
      await fails(t.as(who, (sql) => sql.query(`insert into public.event_schedule (event_id, starts_at, ends_at) values ($1, now(), now() + interval '1 hour')`, [id])));
      expect(await t.as(who, (sql) => sql.query(`update public.event_schedule set exact_address = 'x' returning event_id`))).toHaveLength(0);
      expect(await t.as(who, (sql) => sql.query(`update public.events set title = 'otro' returning id`))).toHaveLength(0);
    }
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
    await fails(t.as('boss', (sql) => sql.query(`insert into public.user_roles (user_id, role) values (auth.uid(), 'admin')`)));
    // A retired role cannot be given, not even by administración (user_roles_assignable).
    await fails(t.as('admin', (sql) => sql.query(`insert into public.user_roles (user_id, role) values ($1, 'supervisor')`, [t.ids.social])));
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
