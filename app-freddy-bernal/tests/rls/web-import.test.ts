// Where the imported drafts and photos came from (20261106300100_web_importador.sql): the web's people read it (to see
// the old address and what to review), with 2FA; nobody else does, anon never; and no one writes it through the API
// (only the importer, as the system). Invented rows only.
import { describe, it, expect, beforeAll } from 'vitest';
import { makeWebTestDb, TEAM, type WebTestDb, type Who } from './web-setup';

let t: WebTestDb;
let itemId: string;

beforeAll(async () => {
  t = await makeWebTestDb();
  itemId = await t.system(async (sql) => {
    const item = (await sql.one<{ id: string; rev: number }>(
      `insert into public.web_items (kind, slug, draft) values ('news', 'nota-importada-rls', '{"title":"Nota importada (prueba)","category":"noticia","body":[]}'::jsonb) returning id, rev`,
    ))!;
    const media = (await sql.one<{ id: string }>(
      `insert into public.web_media (storage_key, kind, mime, bytes, width, height, alt)
       values ('00000000-0000-4000-8000-00000000f001.png', 'image', 'image/png', 100, 320, 200, '[Por escribir] Foto (prueba)') returning id`,
    ))!;
    await sql.query(
      `insert into public.web_import_items (site, source_id, item_id, source_url, source_path, content_hash, item_rev, review_flags)
       values ('sitio-viejo.test', 9101, $1, 'https://sitio-viejo.test/2026/03/nota-importada-rls/', '/2026/03/nota-importada-rls', $2, $3, '{alt_missing}')`,
      [item.id, 'a'.repeat(64), item.rev],
    );
    await sql.query(
      `insert into public.web_import_media (site, source_key, source_url, source_path, media_id, sha256)
       values ('sitio-viejo.test', 'id:9102', 'https://sitio-viejo.test/wp-content/uploads/2026/03/foto.png', '/wp-content/uploads/2026/03/foto.png', $1, $2)`,
      [media.id, 'b'.repeat(64)],
    );
    return item.id;
  });
}, 120_000);

const count = (who: Who, table: string, aal: 'aal1' | 'aal2' = 'aal2') =>
  t.asWho(who, async (sql) => (await sql.one<{ n: number }>(`select count(*)::int as n from public.${table}`))!.n, aal);

describe('de dónde vino lo importado', () => {
  it('lo leen el editor, quien aprueba, el jefe y administración, con doble factor', async () => {
    for (const who of ['writer', 'publisher', 'boss', 'admin'] as Who[]) {
      expect(await count(who, 'web_import_items'), who).toBe(1);
      expect(await count(who, 'web_import_media'), who).toBe(1);
    }
    expect(await count('writer', 'web_import_items', 'aal1')).toBe(0);
  });

  it('el editor lo ve como lo lee su pantalla (dirección vieja y qué revisar); otro rol, nada', async () => {
    const { importOrigin } = await import('@/lib/data/web-admin');
    expect(await t.asWho('writer', (sql) => importOrigin(sql, itemId))).toMatchObject({ sourcePath: '/2026/03/nota-importada-rls', flags: ['alt_missing'] });
    expect(await t.asWho('coordinator', (sql) => importOrigin(sql, itemId))).toBeNull();
  });

  it('nadie más: ni el equipo, ni la atención, ni auditoría; anon ni siquiera tiene la tabla', async () => {
    for (const who of [...TEAM.filter((x) => x !== 'boss'), 'coordinator', 'areaA', 'complaints', 'auditor'] as Who[]) {
      expect(await count(who, 'web_import_items'), who).toBe(0);
      expect(await count(who, 'web_import_media'), who).toBe(0);
    }
    await expect(t.anon((sql) => sql.query(`select * from public.web_import_items`))).rejects.toThrow(/permission denied/);
    await expect(t.anon((sql) => sql.query(`select * from public.web_import_media`))).rejects.toThrow(/permission denied/);
  });

  it('nadie lo escribe por la API: solo el importador, como sistema', async () => {
    for (const who of ['writer', 'publisher', 'boss', 'admin'] as Who[]) {
      await expect(t.asWho(who, (sql) => sql.query(`update public.web_import_items set item_rev = item_rev + 1`)), who).rejects.toThrow(/permission denied/);
      await expect(t.asWho(who, (sql) => sql.query(`delete from public.web_import_media`)), who).rejects.toThrow(/permission denied/);
      await expect(
        t.asWho(who, (sql) =>
          sql.query(
            `insert into public.web_import_items (site, source_id, item_id, source_url, source_path, content_hash, item_rev) values ('x.test', 1, $1, 'https://x.test/', '/', $2, 1)`,
            [itemId, 'c'.repeat(64)],
          ),
        ),
        who,
      ).rejects.toThrow(/permission denied/);
    }
  });

  it('la base no publica una foto con «[Por escribir]» ni siquiera para el sistema', async () => {
    const media = (await t.system((sql) => sql.one<{ id: string }>(`select id from public.web_media where storage_key like '00000000-0000-4000-8000-00000000f001%'`)))!;
    await t.system((sql) => sql.query(`update public.web_items set draft = jsonb_set(draft, '{coverId}', to_jsonb($2::text)) where id = $1`, [itemId, media.id]));
    await expect(t.system((sql) => sql.one(`select public.publish_web_item($1, null)`, [itemId]))).rejects.toThrow(/todavía no tiene su texto alternativo/);
    await t.system((sql) => sql.query(`update public.web_media set alt = 'Una plaza con árboles (prueba)' where id = $1`, [media.id]));
    await t.system((sql) => sql.one(`select public.publish_web_item($1, null)`, [itemId]));
    expect(await t.anon(async (sql) => (await sql.query(`select id from public.web_items where id = $1`, [itemId])).length)).toBe(1);
  });
});
