// RLS for Google Drive storage: the side tables (the sealed grant, Drive file ids, upload
// sessions, thumbnails, the transfer meter) are closed to EVERY API role, admin with 2FA and anon
// included; Ajustes reads a summary through drive_status() (admin with 2FA only, never the token).
// Drive rows in media_assets (bucket 'drive') follow exactly the same rules as any other file.
import { describe, it, expect, beforeAll } from 'vitest';
import { asUser, type Sql } from '@/lib/db/core';
import { makeTestDb, type TestDb } from './setup';
import type { DemoUserKey } from '@/lib/db/seed-demo';

let t: TestDb;
let mediaId: string;
const WHO: DemoUserKey[] = ['admin', 'boss', 'dispatch', 'politics', 'ivt', 'social', 'social2', 'camera', 'camera2'];
const TABLES = ['drive_connection', 'drive_folders', 'media_drive', 'media_thumbs', 'drive_transfer', 'drive_transfer_person'];
const SEALED = 'v1.abcdef12.aXY.Y3Q.dGFn';

// The anon role (PostgREST without a session).
const asAnon = <T>(fn: (sql: Sql) => Promise<T>) =>
  t.backend.transaction(async (sql) => {
    await sql.query(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
    await sql.query('set local role anon');
    return fn(sql);
  });

beforeAll(async () => {
  t = await makeTestDb();
  await t.system(async (sql) => {
    const ev = await sql.one<{ id: string }>(`select id from public.events order by code limit 1`);
    mediaId = (await sql.one<{ id: string }>(
      `insert into public.media_assets (event_id, kind, bucket, storage_path, label, mime, size_bytes, status, uploaded_by)
       values ($1, 'boss', 'drive', $2, 'Jefe hablando 9', 'video/mp4', 1000, 'ready', $3) returning id`,
      [ev!.id, `${ev!.id}/00000000-0000-4000-8000-00000000d001.mp4`, t.ids.admin],
    ))!.id;
    await sql.query(
      `insert into public.drive_connection (account_email, token_enc, scope, root_folder_id, status, connected_by, connected_at)
       values ('cuenta@demo.test', $1, 'https://www.googleapis.com/auth/drive.file', 'rootFolderId0001', 'ok', $2, now())`,
      [SEALED, t.ids.admin],
    );
    await sql.query(`insert into public.drive_folders (path, folder_id) values ('Videos', 'folderVideos0001')`);
    await sql.query(`insert into public.media_drive (media_id, file_id, source) values ($1, 'driveFileId00001', 'upload')`, [mediaId]);
    await sql.query(`insert into public.media_thumbs (media_id, mime, bytes) values ($1, 'image/png', '\\x89504e47'::bytea)`, [mediaId]);
    await sql.query(`insert into public.drive_transfer (month, bytes) values (to_char(now() at time zone 'utc', 'YYYY-MM'), 12345)`);
    await sql.query(`insert into public.drive_transfer_person (day, user_id, bytes) values (current_date, $1, 678)`, [t.ids.social]);
  });
});

describe('tablas de Drive: cerradas para todos los roles de la API', () => {
  it('nadie las lee, ni administración con doble factor', async () => {
    for (const who of WHO) {
      for (const table of TABLES) {
        await expect(t.as(who, (sql) => sql.query(`select * from public.${table}`)), `${who} ${table}`).rejects.toThrow(/permission denied/);
      }
    }
    for (const table of TABLES) await expect(asAnon((sql) => sql.query(`select * from public.${table}`)), `anon ${table}`).rejects.toThrow(/permission denied/);
  });

  it('nadie escribe, cambia ni borra', async () => {
    for (const who of ['admin', 'social', 'camera'] as DemoUserKey[]) {
      await expect(t.as(who, (sql) => sql.query(`update public.drive_connection set status = 'ok'`))).rejects.toThrow(/permission denied/);
      await expect(t.as(who, (sql) => sql.query(`delete from public.drive_connection`))).rejects.toThrow(/permission denied/);
      await expect(t.as(who, (sql) => sql.query(`insert into public.drive_folders (path, folder_id) values ('Fotos', 'folderFotos00001')`))).rejects.toThrow(/permission denied/);
      await expect(t.as(who, (sql) => sql.query(`update public.media_drive set file_id = 'otroArchivo00001'`))).rejects.toThrow(/permission denied/);
      await expect(t.as(who, (sql) => sql.query(`insert into public.media_drive (media_id, file_id, source) values ($1, 'otroArchivo00002', 'picker')`, [mediaId]))).rejects.toThrow(/permission denied/);
      await expect(t.as(who, (sql) => sql.query(`delete from public.media_thumbs`))).rejects.toThrow(/permission denied/);
      await expect(t.as(who, (sql) => sql.query(`update public.drive_transfer set bytes = 0`))).rejects.toThrow(/permission denied/);
      await expect(t.as(who, (sql) => sql.query(`delete from public.drive_transfer_person`))).rejects.toThrow(/permission denied/);
    }
    await expect(asAnon((sql) => sql.query(`delete from public.media_drive`))).rejects.toThrow(/permission denied/);
    const still = await t.system((sql) => sql.one<{ n: number }>(`select count(*)::int as n from public.media_drive`));
    expect(still!.n).toBe(1);
  });

  it('las tablas tienen RLS activo (por si alguien da permisos después)', async () => {
    const rows = await t.system((sql) =>
      sql.query<{ relname: string; relrowsecurity: boolean }>(`select relname, relrowsecurity from pg_class where relname = any($1::text[]) and relnamespace = 'public'::regnamespace`, [TABLES]),
    );
    expect(rows).toHaveLength(TABLES.length);
    expect(rows.every((r) => r.relrowsecurity)).toBe(true);
  });
});

describe('drive_status(): lo que ve Ajustes', () => {
  it('solo administración con doble factor recibe la fila, sin el permiso ni ids de Drive', async () => {
    const rows = await t.as('admin', (sql) => sql.query<Record<string, unknown>>(`select * from public.drive_status()`));
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]).sort()).toEqual(['account_email', 'connected_at', 'last_error', 'month_bytes', 'root_ready', 'status', 'status_at']);
    expect(rows[0]).toMatchObject({ status: 'ok', account_email: 'cuenta@demo.test', root_ready: true });
    expect(Number(rows[0].month_bytes)).toBe(12345);
    expect(JSON.stringify(rows[0])).not.toContain(SEALED);
    expect(JSON.stringify(rows[0])).not.toContain('rootFolderId0001');
  });

  it('administración sin doble factor y el resto de los roles: cero filas', async () => {
    expect(await asUser(t.backend, { sub: t.ids.admin, aal: 'aal1' }, (sql) => sql.query(`select * from public.drive_status()`))).toHaveLength(0);
    for (const who of WHO.filter((w) => w !== 'admin')) {
      expect(await t.as(who, (sql) => sql.query(`select * from public.drive_status()`)), who).toHaveLength(0);
    }
    await expect(asAnon((sql) => sql.query(`select * from public.drive_status()`))).rejects.toThrow(/permission denied/);
  });
});

describe('registro de cambios de la conexión', () => {
  it('guarda cuenta y estado, nunca el permiso cifrado', async () => {
    await t.system((sql) => sql.query(`update public.drive_connection set status = 'expired', last_error = 'invalid_grant', status_at = now()`));
    await t.system((sql) => sql.query(`update public.drive_connection set token_enc = null, status = 'disconnected'`));
    const log = await t.system((sql) =>
      sql.query<{ action: string; old_data: unknown; new_data: unknown }>(`select action, old_data, new_data from public.audit_log where table_name = 'drive_connection' order by id`),
    );
    expect(log.map((l) => l.action)).toEqual(['insert', 'update', 'update']);
    expect(JSON.stringify(log)).not.toContain(SEALED);
    expect(JSON.stringify(log)).not.toContain('token_enc');
    expect(log[2].new_data).toMatchObject({ status: 'disconnected', connected: false, account_email: 'cuenta@demo.test' });
  });

  it('una conexión «ok» siempre tiene su permiso', async () => {
    await expect(t.system((sql) => sql.query(`update public.drive_connection set status = 'ok', token_enc = null`))).rejects.toThrow(/drive_connection_ok_has_token/);
  });
});

describe('material en Drive (bucket drive): las mismas reglas de siempre', () => {
  it('lo ven quienes ven su evento; grabación sin asignar, política e IVT no', async () => {
    const see = (who: DemoUserKey) => t.as(who, (sql) => sql.one<{ n: number }>(`select count(*)::int as n from public.media_assets where id = $1`, [mediaId]));
    for (const who of ['admin', 'social', 'boss'] as DemoUserKey[]) expect((await see(who))!.n, who).toBe(1);
    for (const who of ['politics', 'ivt'] as DemoUserKey[]) expect((await see(who))!.n, who).toBe(0);
    const assigned = await t.system((sql) => sql.query<{ user_id: string }>(`select user_id from public.event_assignments a join public.media_assets m on m.event_id = a.event_id where m.id = $1`, [mediaId]));
    const camOut = (['camera', 'camera2'] as DemoUserKey[]).find((c) => !assigned.some((a) => a.user_id === t.ids[c]));
    if (camOut) expect((await see(camOut))!.n).toBe(0);
  });

  it('nadie cambia de dónde viene un archivo ya subido', async () => {
    await expect(t.as('social', (sql) => sql.query(`update public.media_assets set bucket = 'material' where id = $1`, [mediaId]))).rejects.toThrow(/no se reemplaza/);
    await expect(t.as('admin', (sql) => sql.query(`update public.media_assets set storage_path = 'x/y.mp4' where id = $1`, [mediaId]))).rejects.toThrow(/no se reemplaza/);
  });
});
