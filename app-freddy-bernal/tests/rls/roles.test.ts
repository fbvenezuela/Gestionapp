// Six roles (cambios del 27/10/2026): jefe, despacho, política, IVT, grabación y redes, plus Administración as the
// technical role. Only those can be given; the boss approves everything through public.can_approve(); the boss does
// what Redes does. Every «no puede» is tried against the database.
import { describe, it, expect, beforeAll } from 'vitest';
import { makeTestDb, type TestDb } from './setup';
import type { DemoUserKey } from '@/lib/db/seed-demo';

let t: TestDb;
beforeAll(async () => {
  t = await makeTestDb();
});

const fails = async (p: Promise<unknown>, msg?: RegExp) => {
  if (msg) await expect(p).rejects.toThrow(msg);
  else await expect(p).rejects.toThrow();
};
const RETIRED_AND_FUTURE = ['supervisor', 'secretary', 'writer', 'reports_operator'] as const;

// A fresh piece with a file and its three copies, sent to review at that level by Redes.
async function inReview(level: 'verde' | 'amarillo' | 'rojo', who: DemoUserKey = 'social') {
  const id = (await t.as(who, (sql) => sql.one<{ id: string }>(`insert into public.pieces (kind, title, review_level) values ('video', $1, $2) returning id`, [`Pieza ${level} de prueba`, level])))!.id;
  await t.as(who, async (sql) => {
    await sql.query(`insert into public.piece_versions (piece_id, version) values ($1, 1)`, [id]);
    await sql.query(`update public.pieces set current_version = 1 where id = $1`, [id]);
    for (const g of ['long', 'medium', 'short']) await sql.query(`insert into public.copies (piece_id, length_group, body) values ($1, $2, $3)`, [id, g, `Copy ${g} de prueba.`]);
    await sql.query(`update public.pieces set status = 'in_review' where id = $1`, [id]);
  });
  return id;
}
const pieceStatus = async (id: string) =>
  (await t.system((sql) => sql.one<{ status: string; approved_by: string | null }>(`select status, approved_by from public.pieces where id = $1`, [id])))!;
const mfaList = async () => (await t.system((sql) => sql.one<{ value: string[] }>(`select value from public.app_settings where key = 'security.mfa_roles'`)))!.value;
const setMfaList = (value: unknown) =>
  t.system((sql) => sql.query(`update public.app_settings set value = $1::text::jsonb where key = 'security.mfa_roles'`, [JSON.stringify(value)]));

describe('solo se dan los seis roles y Administración', () => {
  it('administración no da un rol retirado ni uno de la fase 3; la base tampoco lo acepta del sistema', async () => {
    for (const role of RETIRED_AND_FUTURE) {
      await fails(t.as('admin', (sql) => sql.query(`insert into public.user_roles (user_id, role) values ($1, $2)`, [t.ids.social2, role])));
      await fails(t.system((sql) => sql.query(`insert into public.user_roles (user_id, role) values ($1, $2)`, [t.ids.social2, role])));
    }
  });

  it('ni por invitación', async () => {
    for (const role of RETIRED_AND_FUTURE) {
      await fails(
        t.as('admin', (sql) => sql.query(`insert into public.invitations (email, full_name, roles) values ($1, 'Prueba', $2::public.app_role[])`, [`${role}@prueba.test`, `{social,${role}}`])),
        /Ese rol ya no se usa/,
      );
    }
    const inv = await t.as('admin', (sql) => sql.one<{ id: string }>(`insert into public.invitations (email, full_name, roles) values ('cambia@prueba.test', 'Prueba', '{social}') returning id`));
    await fails(t.as('admin', (sql) => sql.query(`update public.invitations set roles = '{supervisor}' where id = $1`, [inv!.id])), /Ese rol ya no se usa/);
  });

  it('se invita al director de política y al del IVT, y al entrar reciben exactamente ese rol', async () => {
    for (const role of ['politics', 'ivt'] as const) {
      const email = `nuevo-${role}@prueba.test`;
      await t.as('admin', (sql) => sql.query(`insert into public.invitations (email, full_name, roles, invited_by) values ($1, 'Persona nueva', $2::public.app_role[], auth.uid())`, [email, `{${role}}`]));
      const u = await t.system((sql) => sql.one<{ id: string }>(`insert into auth.users (email) values ($1) returning id`, [email]));
      const roles = await t.system((sql) => sql.query<{ role: string }>(`select role::text from public.user_roles where user_id = $1`, [u!.id]));
      expect(roles).toEqual([{ role }]);
    }
  });

  it('una invitación vieja con un rol retirado no hace fallar la entrada: solo copia los roles vigentes', async () => {
    await t.system(async (sql) => {
      await sql.query(`alter table public.invitations disable trigger guard_invitation_roles`);
      await sql.query(`insert into public.invitations (email, full_name, roles) values ('vieja@prueba.test', 'Invitación vieja', '{supervisor,social}')`);
      await sql.query(`alter table public.invitations enable trigger guard_invitation_roles`);
    });
    const u = await t.system((sql) => sql.one<{ id: string }>(`insert into auth.users (email) values ('vieja@prueba.test') returning id`));
    const roles = await t.system((sql) => sql.query<{ role: string }>(`select role::text from public.user_roles where user_id = $1`, [u!.id]));
    expect(roles).toEqual([{ role: 'social' }]);
    // Using it does not touch its roles, so the history stays as it was written.
    const inv = await t.system((sql) => sql.one<{ roles: string; accepted: boolean }>(`select roles::text as roles, accepted_at is not null as accepted from public.invitations where email = 'vieja@prueba.test'`));
    expect(inv).toEqual({ roles: '{supervisor,social}', accepted: true });
  });

  it('nadie del equipo tiene un rol retirado, y el registro dice que se retiraron', async () => {
    const left = await t.system((sql) => sql.query(`select 1 from public.user_roles where role::text in ('secretary', 'supervisor')`));
    expect(left).toEqual([]);
    const summary = await t.as('admin', (sql) => sql.one<{ n: number }>(`select count(*)::int as n from public.audit_log where action = 'roles_retired'`));
    expect(summary!.n).toBe(1);
  });

  it('el doble factor lo piden el jefe, despacho, política, IVT y administración; ya no supervisión', async () => {
    const v = await t.system((sql) => sql.one<{ value: string[] }>(`select value from public.app_settings where key = 'security.mfa_roles'`));
    expect(v!.value).toEqual(expect.arrayContaining(['admin', 'boss', 'dispatch', 'politics', 'ivt']));
    expect(v!.value).not.toContain('supervisor');
    expect(v!.value).not.toContain('secretary');
    for (const who of ['politics', 'ivt'] as const) {
      const ok = await t.as(who, (sql) => sql.one<{ ok: boolean }>(`select public.mfa_ok() as ok`), 'aal1');
      expect(ok!.ok, who).toBe(false);
    }
  });
});

describe('el jefe aprueba todo (public.can_approve())', () => {
  it('can_approve(): solo el jefe y con doble factor', async () => {
    const ask = (who: DemoUserKey, aal: 'aal1' | 'aal2' = 'aal2') => t.as(who, (sql) => sql.one<{ ok: boolean }>(`select public.can_approve() as ok`), aal);
    expect((await ask('boss'))!.ok).toBe(true);
    expect((await ask('boss', 'aal1'))!.ok).toBe(false);
    for (const who of ['admin', 'dispatch', 'politics', 'ivt', 'social', 'camera'] as const) expect((await ask(who))!.ok, who).toBe(false);
  });

  it('aprueba verde, amarillo y rojo; nadie más, y él tampoco sin doble factor', async () => {
    for (const level of ['verde', 'amarillo', 'rojo'] as const) {
      const p = await inReview(level);
      for (const who of ['admin', 'social', 'dispatch', 'politics', 'ivt', 'camera'] as const) {
        await fails(t.as(who, (sql) => sql.query(`select public.review_piece($1, 'approved')`, [p])));
      }
      await fails(t.as('boss', (sql) => sql.query(`select public.review_piece($1, 'approved')`, [p]), 'aal1'));
      await t.as('boss', (sql) => sql.query(`select public.review_piece($1, 'approved', 'Va.')`, [p]));
      expect(await pieceStatus(p), level).toEqual({ status: 'approved', approved_by: t.ids.boss });
    }
  });

  it('solo el jefe pide cambios', async () => {
    const p = await inReview('amarillo');
    for (const who of ['admin', 'social', 'dispatch'] as const) {
      await fails(t.as(who, (sql) => sql.query(`select public.review_piece($1, 'changes_requested', 'Cambia el cierre.')`, [p])));
    }
    await t.as('boss', (sql) => sql.query(`select public.review_piece($1, 'changes_requested', 'Cambia el cierre.')`, [p]));
    expect((await pieceStatus(p)).status).toBe('changes_requested');
  });

  it('todas las verdes de una vez: cada una pasa por review_piece y se salta la que cambió', async () => {
    const [a, b] = [await inReview('verde'), await inReview('verde')];
    const rev = async (id: string) => (await t.system((sql) => sql.one<{ revision: number }>(`select revision from public.pieces where id = $1`, [id])))!.revision;
    const seen = { [a]: await rev(a), [b]: await rev(b) };
    await t.as('social', (sql) => sql.query(`update public.copies set body = 'Copy cambiado.' where piece_id = $1 and length_group = 'short'`, [b]));
    // What approveGreen does with the revisions the boss saw.
    for (const id of [a, b]) {
      const r = t.as('boss', (sql) => sql.query(`select public.review_piece($1, 'approved', '', $2)`, [id, seen[id]]));
      if (id === a) await r;
      else await fails(r, /cambió mientras la revisabas/);
    }
    expect((await pieceStatus(a)).status).toBe('approved');
    expect((await pieceStatus(b)).status).toBe('in_review');
  });

  it('el nivel lo cambian el jefe o administración; redes y despacho no bajan una pieza en revisión', async () => {
    const p = await inReview('rojo');
    for (const who of ['social', 'dispatch', 'politics'] as const) await fails(t.as(who, (sql) => sql.query(`select public.set_review_level($1, 'verde')`, [p])));
    await t.as('admin', (sql) => sql.query(`select public.set_review_level($1, 'amarillo')`, [p]));
    await t.as('boss', (sql) => sql.query(`select public.set_review_level($1, 'verde')`, [p]));
    await fails(t.as('boss', (sql) => sql.query(`select public.set_review_level($1, 'rojo')`, [p]), 'aal1'));
  });

  it('el doble factor del jefe no depende de la lista que se edita: sin él no aprueba aunque la lista no lo nombre', async () => {
    const p = await inReview('rojo');
    const tw = await t.as('social', async (sql) => {
      const b = await sql.one<{ id: string }>(`insert into public.tweet_batches (title) values ('Tanda sin doble factor') returning id`);
      return (await sql.one<{ id: string }>(`insert into public.tweets (batch_id, position, body) values ($1, 0, 'Tweet de prueba sin doble factor.') returning id`, [b!.id]))!.id;
    });
    const saved = await mfaList();
    try {
      // What only the system can do now (a migration, a seed): a list without the boss, and then an empty one.
      for (const value of [['dispatch'], []]) {
        await setMfaList(value);
        expect((await t.as('boss', (sql) => sql.one<{ ok: boolean }>(`select public.can_approve() as ok`), 'aal1'))!.ok, JSON.stringify(value)).toBe(false);
        await fails(t.as('boss', (sql) => sql.query(`select public.review_piece($1, 'approved')`, [p]), 'aal1'), /Solo el jefe aprueba/);
        await fails(t.as('boss', (sql) => sql.query(`update public.tweets set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = $1`, [tw]), 'aal1'), /Solo el jefe aprueba tweets/);
      }
      // Even with the list empty, admin cannot give himself the boss's role (nobody grants roles to themselves,
      // 20261028002200_round_review_fixes.sql), and does not approve.
      await fails(t.as('admin', (sql) => sql.query(`insert into public.user_roles (user_id, role) values (auth.uid(), 'boss')`), 'aal1'), /row-level security/);
      await fails(t.as('admin', (sql) => sql.query(`select public.review_piece($1, 'approved')`, [p]), 'aal1'), /Solo el jefe aprueba/);
    } finally {
      await t.system((sql) => sql.query(`delete from public.user_roles where user_id = $1 and role = 'boss'`, [t.ids.admin]));
      await setMfaList(saved);
    }
    expect(await pieceStatus(p)).toEqual({ status: 'in_review', approved_by: null });
  });

  it('administración sin doble factor no cambia la lista del doble factor ni ningún ajuste, ni se da el rol de jefe', async () => {
    const saved = await mfaList();
    try {
      for (const value of [['dispatch'], []]) {
        const r = await t.as('admin', (sql) => sql.query(`update public.app_settings set value = $1::text::jsonb where key = 'security.mfa_roles' returning key`, [JSON.stringify(value)]), 'aal1');
        expect(r, JSON.stringify(value)).toHaveLength(0);
      }
      expect(await mfaList()).toEqual(saved);
      expect(await t.as('admin', (sql) => sql.query(`update public.app_settings set value = '5' where key = 'tweets.low_stock_days' returning key`), 'aal1')).toHaveLength(0);
      await fails(t.as('admin', (sql) => sql.query(`insert into public.app_settings (key, value) values ('prueba.sin_doble_factor', '1')`), 'aal1'));
      await fails(t.as('admin', (sql) => sql.query(`insert into public.user_roles (user_id, role) values (auth.uid(), 'boss')`), 'aal1'));
    } finally {
      await setMfaList(saved);
      await t.system((sql) => sql.query(`delete from public.user_roles where user_id = $1 and role = 'boss'`, [t.ids.admin]));
    }
    // With 2FA, settings still work as before.
    expect(await t.as('admin', (sql) => sql.query(`update public.app_settings set value = value where key = 'tweets.low_stock_days' returning key`))).toHaveLength(1);
  });

  it('con doble factor, administración no saca de la lista a administración, al jefe, al despacho, a política ni al IVT, ni la renombra', async () => {
    const saved = await mfaList();
    for (const value of [['dispatch'], [], ['admin', 'dispatch'], ['boss'], { admin: true, boss: true }, 'admin boss', ['admin', 'boss', 7],
      ['admin', 'boss'], ['admin', 'boss', 'dispatch', 'politics'], ['admin', 'boss', 'dispatch', 'ivt'], ['admin', 'boss', 'politics', 'ivt']]) {
      await fails(
        t.as('admin', (sql) => sql.query(`update public.app_settings set value = $1::text::jsonb where key = 'security.mfa_roles'`, [JSON.stringify(value)])),
        /siempre lo usan administración, el jefe, el despacho, política y el IVT/,
      );
    }
    await fails(t.as('admin', (sql) => sql.query(`update public.app_settings set key = 'security.mfa_roles_vieja' where key = 'security.mfa_roles'`)), /no se renombra/);
    expect(await mfaList()).toEqual(saved);
    // Adding a role to the list is fine.
    try {
      await t.as('admin', (sql) => sql.query(`update public.app_settings set value = value || '["camera"]'::jsonb where key = 'security.mfa_roles'`));
      expect(await mfaList()).toContain('camera');
    } finally {
      await setMfaList(saved);
    }
  });

  it('los tweets los aprueba el jefe; nadie más, y sin doble factor tampoco', async () => {
    const tw = await t.as('social', async (sql) => {
      const b = await sql.one<{ id: string }>(`insert into public.tweet_batches (title) values ('Tanda del jefe') returning id`);
      return (await sql.one<{ id: string }>(`insert into public.tweets (batch_id, position, body) values ($1, 0, 'Un tweet de prueba.') returning id`, [b!.id]))!.id;
    });
    const approve = `update public.tweets set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = $1 returning id`;
    for (const who of ['admin', 'social'] as const) await fails(t.as(who, (sql) => sql.query(approve, [tw])), /Solo el jefe aprueba tweets/);
    for (const who of ['dispatch', 'politics', 'ivt', 'camera'] as const) expect(await t.as(who, (sql) => sql.query(approve, [tw])), who).toHaveLength(0);
    await fails(t.as('boss', (sql) => sql.query(approve, [tw]), 'aal1'));
    expect(await t.as('boss', (sql) => sql.query(approve, [tw]))).toHaveLength(1);
  });
});

describe('el jefe hace lo de Redes', () => {
  it('crea la pieza, la versión y los copies, comenta, pide una frase y la manda a aprobar', async () => {
    const id = await inReview('amarillo', 'boss');
    await t.as('boss', async (sql) => {
      await sql.query(`insert into public.review_comments (piece_id, version, author_id, body) values ($1, 1, auth.uid(), 'Comentario del jefe.')`, [id]);
      await sql.query(`insert into public.voice_line_requests (piece_id, phrase) values ($1, 'Una frase de prueba')`, [id]);
      await sql.query(`update public.copies set body = 'Copy corto del jefe.' where piece_id = $1 and length_group = 'short'`, [id]);
    });
    const p = await t.system((sql) => sql.one<{ created_by: string; status: string }>(`select created_by, status from public.pieces where id = $1`, [id]));
    expect(p).toEqual({ created_by: t.ids.boss, status: 'in_review' });
  });

  it('arma la tanda de tweets y la programa', async () => {
    const r = await t.as('boss', async (sql) => {
      const b = await sql.one<{ id: string }>(`insert into public.tweet_batches (title) values ('Tanda armada por el jefe') returning id`);
      const tw = await sql.one<{ id: string }>(`insert into public.tweets (batch_id, position, body, scheduled_at) values ($1, 0, 'Tweet del jefe.', now() + interval '1 day') returning id`, [b!.id]);
      await sql.query(`update public.tweets set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = $1`, [tw!.id]);
      return sql.one<{ status: string }>(`update public.tweets set status = 'scheduled' where id = $1 returning status`, [tw!.id]);
    });
    expect(r!.status).toBe('scheduled');
  });

  it('publica a mano una pieza aprobada y carga sus resultados; no publica una sin aprobar', async () => {
    const id = await inReview('verde', 'boss');
    const pub = (body: string) =>
      t.as('boss', (sql) =>
        sql.one<{ id: string }>(`insert into public.publications (piece_id, network, copy_body, status, url) values ($1, 'instagram', $2, 'published', 'https://example.com/jefe') returning id`, [id, body]),
      );
    await fails(pub('Copy long de prueba.'), /no está aprobada/);
    await t.as('boss', (sql) => sql.query(`select public.review_piece($1, 'approved')`, [id]));
    const x = await pub('Copy long de prueba.');
    await t.as('boss', (sql) => sql.query(`insert into public.publication_metrics (publication_id, views, source) values ($1, 100, 'manual')`, [x!.id]));
    const m = await t.system((sql) => sql.one<{ n: number }>(`select count(*)::int as n from public.publication_metrics where publication_id = $1`, [x!.id]));
    expect(m!.n).toBe(1);
  });

  it('crea la pieza de un evento con material y marca publicado: el evento avanza como cuando lo hace Redes', async () => {
    const ev = (await t.system((sql) =>
      sql.one<{ id: string }>(`insert into public.events (title, boss_decision, work_status) values ('Evento con material (prueba)', 'accepted', 'material') returning id`),
    ))!.id;
    const workStatus = async () => (await t.system((sql) => sql.one<{ work_status: string }>(`select work_status from public.events where id = $1`, [ev])))!.work_status;
    // What «Crear pieza» does for an event in 'material' or 'recording'.
    await t.as('boss', async (sql) => {
      await sql.query(`insert into public.pieces (event_id, kind, title) values ($1, 'video', 'Pieza del evento con material')`, [ev]);
      await sql.query(`update public.events set work_status = 'editing' where id = $1 and work_status in ('material', 'recording')`, [ev]);
    });
    expect(await workStatus()).toBe('editing');
    // What «Ya lo publiqué» does when the piece belongs to an event; and the urgency, as Redes.
    await t.as('boss', (sql) => sql.query(`update public.events set work_status = 'published', urgency = 1 where id = $1`, [ev]));
    expect(await workStatus()).toBe('published');
    // Política and IVT still change nothing of an event.
    for (const who of ['politics', 'ivt'] as const) {
      expect(await t.as(who, (sql) => sql.query(`update public.events set work_status = 'brief' where id = $1 returning id`, [ev])), who).toHaveLength(0);
    }
    expect(await workStatus()).toBe('published');
  });

  it('ve todo el contenido, como Redes; política e IVT no ven nada de contenido', async () => {
    const tables = ['pieces', 'piece_versions', 'copies', 'reviews', 'review_comments', 'voice_line_requests', 'tweet_batches', 'tweets', 'publications', 'publication_metrics'];
    for (const table of tables) {
      const all = (await t.system((sql) => sql.one<{ n: number }>(`select count(*)::int as n from public.${table} ${table === 'pieces' || table === 'tweets' || table === 'tweet_batches' || table === 'publications' ? 'where deleted_at is null' : ''}`)))!.n;
      const boss = (await t.as('boss', (sql) => sql.one<{ n: number }>(`select count(*)::int as n from public.${table}`)))!.n;
      expect(boss, table).toBe(all);
      for (const who of ['politics', 'ivt'] as const) {
        expect((await t.as(who, (sql) => sql.one<{ n: number }>(`select count(*)::int as n from public.${table}`)))!.n, `${who} ${table}`).toBe(0);
      }
    }
  });

  it('política e IVT no crean contenido', async () => {
    for (const who of ['politics', 'ivt'] as const) {
      await fails(t.as(who, (sql) => sql.query(`insert into public.pieces (kind, title) values ('video', 'Pieza ajena')`)));
      await fails(t.as(who, (sql) => sql.query(`insert into public.tweet_batches (title) values ('Tanda ajena')`)));
    }
  });
});

describe('lo que esta migración rehízo ya no nombra los roles retirados', () => {
  it('las funciones de aprobación, contenido, invitaciones y asistente', async () => {
    const r = await t.system((sql) =>
      sql.query<{ proname: string }>(
        `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = any($1::text[]) and p.prosrc ~ '(secretary|supervisor)'`,
        [['review_piece', 'set_review_level', 'guard_piece_status', 'guard_tweet', 'is_content_team', 'can_approve', 'handle_new_auth_user', 'guard_invitation_roles', 'assistant_refresh']],
      ),
    );
    expect(r).toEqual([]);
  });

  it('las políticas de contenido, tweets y publicaciones: sin roles retirados, y con el jefe donde está Redes', async () => {
    const rows = await t.system((sql) =>
      sql.query<{ tablename: string; policyname: string; expr: string }>(
        `select tablename, policyname, coalesce(qual, '') || ' ' || coalesce(with_check, '') as expr from pg_policies
          where schemaname = 'public' and tablename = any($1::text[])`,
        [['pieces', 'piece_versions', 'copies', 'reviews', 'review_comments', 'voice_line_requests', 'tweet_batches', 'tweets', 'publications', 'publication_metrics']],
      ),
    );
    expect(rows.length).toBeGreaterThan(10);
    for (const p of rows) {
      expect(p.expr, `${p.tablename}.${p.policyname}`).not.toMatch(/secretary|supervisor/);
      if (/'social'/.test(p.expr)) expect(p.expr, `${p.tablename}.${p.policyname}`).toMatch(/'boss'/);
    }
  });
});
