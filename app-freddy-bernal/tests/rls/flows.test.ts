// RLS tests for the workflow gaps: only admin removes material (never an approved file), and the
// two-factor reset leaves its note in the audit trail.
import { describe, it, expect, beforeAll } from 'vitest';
import { makeTestDb, type TestDb } from './setup';
import { mediaLockSql } from '@/lib/domain/media-lock';

let t: TestDb;
beforeAll(async () => {
  t = await makeTestDb();
});

const fails = async (p: Promise<unknown>, msg?: RegExp) => {
  if (msg) await expect(p).rejects.toThrow(msg);
  else await expect(p).rejects.toThrow();
};

describe('quitar material subido por error: solo administración', () => {
  const rawClip = () =>
    t.system((sql) => sql.one<{ id: string; event_id: string }>(`select id, event_id from public.media_assets where kind = 'boss' and uploaded_by = $1 and deleted_at is null limit 1`, [t.ids.camera]));

  it('redes no puede quitar material', async () => {
    const m = (await rawClip())!;
    await fails(t.as('social', (sql) => sql.query(`update public.media_assets set deleted_at = now() where id = $1`, [m.id])), /Solo un administrador/);
  });

  it('quien graba no puede quitar ni lo que subió', async () => {
    const m = (await rawClip())!;
    await fails(t.as('camera', (sql) => sql.query(`update public.media_assets set deleted_at = now() where id = $1`, [m.id])), /Solo un administrador/);
  });

  it('el director de política y el del IVT ni siquiera llegan a la fila', async () => {
    const m = (await rawClip())!;
    for (const who of ['politics', 'ivt'] as const) {
      const r = await t.as(who, (sql) => sql.query(`update public.media_assets set deleted_at = now() where id = $1 returning id`, [m.id]));
      expect(r).toHaveLength(0);
    }
    const still = await t.system((sql) => sql.one<{ deleted_at: unknown }>(`select deleted_at from public.media_assets where id = $1`, [m.id]));
    expect(still?.deleted_at).toBeNull();
  });

  it('administración sí lo quita, queda en el registro y deja de verse para el equipo', async () => {
    const m = (await rawClip())!;
    const r = await t.as('admin', (sql) => sql.query(`update public.media_assets set deleted_at = now() where id = $1 and deleted_at is null returning id`, [m.id]));
    expect(r).toHaveLength(1);
    const audit = await t.system((sql) => sql.one<{ actor_id: string }>(`select actor_id from public.audit_log where table_name = 'media_assets' and row_id = $1 and action = 'soft_delete'`, [m.id]));
    expect(audit?.actor_id).toBe(t.ids.admin);
    const social = await t.as('social', (sql) => sql.query(`select id from public.media_assets where id = $1`, [m.id]));
    expect(social).toHaveLength(0);
    const admin = await t.as('admin', (sql) => sql.query(`select id from public.media_assets where id = $1`, [m.id]));
    expect(admin).toHaveLength(1);
  });

  it('el archivo de la versión aprobada de una pieza queda bloqueado (y el material crudo no)', async () => {
    const approved = await t.system((sql) =>
      sql.one<{ media_asset_id: string; cover_asset_id: string }>(
        `select v.media_asset_id, v.cover_asset_id from public.piece_versions v join public.pieces p on p.id = v.piece_id
          where p.status = 'approved' and v.version = p.approved_version limit 1`,
      ),
    );
    expect(approved?.media_asset_id).toBeTruthy();
    expect(await lockOf(approved!.media_asset_id)).toBeTruthy();
    expect(await lockOf(approved!.cover_asset_id)).toBeTruthy();
    const drone = await t.system((sql) => sql.one<{ id: string }>(`select id from public.media_assets where kind = 'drone' and deleted_at is null limit 1`));
    expect(await lockOf(drone!.id)).toBeNull();
  });
});

// What removeMedia checks, as admin (the one who removes): the reason, or null.
const lockOf = async (id: string) => (await t.as('admin', (sql) => sql.one<{ lock: string | null }>(`select ${mediaLockSql('$1::uuid')} as lock`, [id])))!.lock;

describe('lo que está en revisión, publicado o grabado por el jefe tampoco se quita', () => {
  it('el video de una pieza en revisión queda bloqueado (si se quitara, el jefe aprobaría algo sin archivo)', async () => {
    const v = await t.system((sql) =>
      sql.one<{ media_asset_id: string }>(
        `select v.media_asset_id from public.piece_versions v join public.pieces p on p.id = v.piece_id
          where p.title = 'Avance del puente La Quebrada' and p.status = 'in_review' and v.version = p.current_version`,
      ),
    );
    expect(v?.media_asset_id).toBeTruthy();
    expect(await lockOf(v!.media_asset_id)).toBe('in_review');
  });

  it('el audio que el jefe grabó para una pieza, ya recibido, queda bloqueado; uno cancelado no', async () => {
    const piece = await t.system((sql) => sql.one<{ id: string }>(`select id from public.pieces where title = 'Jornada de salud escolar'`));
    const audio = async () =>
      (await t.as('boss', (sql) =>
        sql.one<{ id: string }>(
          `insert into public.media_assets (kind, bucket, storage_path, label, mime, size_bytes, status, uploaded_by)
           values ('voice_line', 'material', $1, 'Audio del jefe', 'audio/mp4', 1000, 'ready', auth.uid()) returning id`,
          [`voice_line/${crypto.randomUUID()}.m4a`],
        ),
      ))!.id;
    const ask = () =>
      t.as('social', (sql) => sql.one<{ id: string }>(`insert into public.voice_line_requests (piece_id, phrase) values ($1, 'Frase de prueba') returning id`, [piece!.id]));
    const kept = await audio();
    const req = await ask();
    await t.as('boss', (sql) => sql.query(`update public.voice_line_requests set status = 'received', audio_asset_id = $2 where id = $1`, [req!.id, kept]));
    expect(await lockOf(kept)).toBe('voice_line');

    const dropped = await audio();
    const req2 = await ask();
    await t.as('boss', (sql) => sql.query(`update public.voice_line_requests set status = 'cancelled', audio_asset_id = $2 where id = $1`, [req2!.id, dropped]));
    expect(await lockOf(dropped)).toBeNull();
  });

  // Changes the demo's approved piece: keep it after the tests that read it.
  it('lo que ya salió en redes sigue bloqueado aunque la pieza tenga versión nueva y le pidan cambios', async () => {
    const p1 = (await t.system((sql) =>
      sql.one<{ id: string; event_id: string; media_asset_id: string; cover_asset_id: string }>(
        `select p.id, p.event_id, v.media_asset_id, v.cover_asset_id from public.pieces p join public.piece_versions v on v.piece_id = p.id and v.version = p.approved_version
          where p.status = 'approved' and exists (select 1 from public.publications x where x.piece_id = p.id and x.status = 'published' and x.deleted_at is null) limit 1`,
      ),
    ))!;
    expect(await lockOf(p1.media_asset_id)).toBe('published');
    // Redes sube la versión 2 (como addVersion) y el jefe pide cambios: approved_version queda vacío.
    await t.as('social', async (sql) => {
      const m = await sql.one<{ id: string }>(
        `insert into public.media_assets (event_id, kind, bucket, storage_path, label, mime, size_bytes, status, uploaded_by)
         values ($1, 'final', 'material', $2, 'Video final 9', 'video/mp4', 1000, 'ready', auth.uid()) returning id`,
        [p1.event_id, `${p1.event_id}/${crypto.randomUUID()}.mp4`],
      );
      const cur = await sql.one<{ current_version: number }>(`select current_version from public.pieces where id = $1`, [p1.id]);
      await sql.query(`insert into public.piece_versions (piece_id, version, media_asset_id, cover_asset_id) values ($1, $2, $3, $4)`, [p1.id, cur!.current_version + 1, m!.id, p1.cover_asset_id]);
      await sql.query(`update public.pieces set current_version = $2 where id = $1`, [p1.id, cur!.current_version + 1]);
    });
    await t.as('boss', (sql) => sql.query(`select public.review_piece($1, 'changes_requested', 'Cambia el cierre, por favor.')`, [p1.id]));
    const after = await t.system((sql) => sql.one<{ status: string; approved_version: number | null }>(`select status, approved_version from public.pieces where id = $1`, [p1.id]));
    expect(after).toEqual({ status: 'changes_requested', approved_version: null });
    expect(await lockOf(p1.media_asset_id)).toBe('published');
    expect(await lockOf(p1.cover_asset_id)).toBe('published');
  });

  it('una pieza aprobada que nunca salió y a la que le pidieron cambios suelta su versión vieja', async () => {
    const r = await t.as('social', async (sql) => {
      const ev = await sql.one<{ id: string }>(`select id from public.events where deleted_at is null limit 1`);
      const v1 = (await sql.one<{ id: string }>(
        `insert into public.media_assets (event_id, kind, bucket, storage_path, label, mime, size_bytes, status, uploaded_by)
         values ($1, 'final', 'material', $2, 'Video final prueba', 'video/mp4', 1000, 'ready', auth.uid()) returning id`,
        [ev!.id, `${ev!.id}/${crypto.randomUUID()}.mp4`],
      ))!.id;
      const p = await sql.one<{ id: string }>(`insert into public.pieces (event_id, kind, title) values ($1, 'video', 'Pieza de prueba sin publicar') returning id`, [ev!.id]);
      await sql.query(`insert into public.piece_versions (piece_id, version, media_asset_id) values ($1, 1, $2)`, [p!.id, v1]);
      await sql.query(`update public.pieces set current_version = 1 where id = $1`, [p!.id]);
      return { piece: p!.id, v1 };
    });
    expect(await lockOf(r.v1)).toBeNull(); // a draft: social may still replace it
    await t.as('social', (sql) => sql.query(`update public.pieces set status = 'in_review' where id = $1`, [r.piece]));
    expect(await lockOf(r.v1)).toBe('in_review');
    await t.as('boss', (sql) => sql.query(`select public.review_piece($1, 'approved', 'Bien.')`, [r.piece]));
    expect(await lockOf(r.v1)).toBe('approved');
    await t.as('boss', (sql) => sql.query(`select public.review_piece($1, 'changes_requested', 'Mejor otra toma.')`, [r.piece]));
    expect(await lockOf(r.v1)).toBeNull();
  });
});

describe('reiniciar el doble factor', () => {
  it('nadie lee los secretos del doble factor desde la API, ni administración', async () => {
    await t.system((sql) => sql.query(`insert into demo_auth.totp_factors (user_id, secret, verified) values ($1, 'SECRETODEPRUEBA', true) on conflict do nothing`, [t.ids.social2]));
    await fails(t.as('admin', (sql) => sql.query(`select * from demo_auth.totp_factors`)));
    await fails(t.as('admin', (sql) => sql.query(`delete from demo_auth.totp_factors where user_id = $1`, [t.ids.social2])));
  });

  it('nadie escribe a mano en el registro de cambios: la nota la deja el servidor', async () => {
    await fails(
      t.as('admin', (sql) => sql.query(`insert into public.audit_log (actor_id, table_name, row_id, action) values (auth.uid(), 'two_factor', $1, 'mfa_reset')`, [t.ids.social2])),
    );
    // What resetTwoFactor does after act(): system connection, explicit actor.
    await t.system((sql) =>
      sql.query(`insert into public.audit_log (actor_id, table_name, row_id, action, new_data) values ($1, 'two_factor', $2, 'mfa_reset', $3::text::jsonb)`, [
        t.ids.admin,
        t.ids.social2,
        JSON.stringify({ factors_removed: 1, sessions_closed: true }),
      ]),
    );
    const seen = await t.as('admin', (sql) => sql.query(`select actor_id from public.audit_log where table_name = 'two_factor' and row_id = $1`, [t.ids.social2]));
    expect(seen).toEqual([{ actor_id: t.ids.admin }]);
    const social = await t.as('social', (sql) => sql.query(`select 1 from public.audit_log where table_name = 'two_factor'`));
    expect(social).toHaveLength(0);
  });

  it('solo administración cierra las sesiones de otra persona', async () => {
    const r = await t.as('social', (sql) => sql.query(`update public.profiles set sessions_revoked_at = now() where id = $1 returning id`, [t.ids.social2]));
    expect(r).toHaveLength(0);
    const a = await t.as('admin', (sql) => sql.query(`update public.profiles set sessions_revoked_at = now() where id = $1 returning id`, [t.ids.social2]));
    expect(a).toHaveLength(1);
    const ok = await t.as('admin', (sql) => sql.one<{ ok: boolean }>(`select public.has_role('admin') and public.mfa_ok() as ok`));
    expect(ok?.ok).toBe(true);
    const no = await t.as('social', (sql) => sql.one<{ ok: boolean }>(`select public.has_role('admin') and public.mfa_ok() as ok`));
    expect(no?.ok).toBe(false);
  });
});
