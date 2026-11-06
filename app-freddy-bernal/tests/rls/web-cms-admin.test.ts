// The website administrator's reads and the writes its screens make (src/lib/data/web-admin.ts, src/lib/actions/web*.ts),
// role by role against the database (D-93): the gates the screens follow are the database's own (can_read_web,
// can_edit_web, can_publish_web, can_manage_site, all with the second factor); the lists, versions, the library and its
// «dónde se usa» come back only to the web's people and Administración; the writes the screens make (withdraw from
// review, a new address with its 301, the library's words, the settings' upsert) are refused to whom they are not for.
// No new table, policy or function in this stage: these rows pin what the administrator relies on.
import { describe, it, expect, beforeAll } from 'vitest';
import { adminList, itemVersions, kindCounts, mediaList, mediaUsage, mediaUseCounts, reviewQueue, siteSettingRows, webCaps } from '@/lib/data/web-admin';
import { makeWebTestDb, TEAM, type WebTestDb, type Who } from './web-setup';

let t: WebTestDb;
let item: { id: string; rev: number };
let media: string;
beforeAll(async () => {
  t = await makeWebTestDb();
  media = (await t.asWho('writer', (sql) =>
    sql.one<{ id: string }>(
      `insert into public.web_media (storage_key, kind, mime, bytes, width, height, alt) values ($1, 'image', 'image/png', 10, 400, 300, 'Una foto de prueba (demo)') returning id`,
      [`${crypto.randomUUID()}.png`],
    ),
  ))!.id;
  item = (await t.asWho('writer', (sql) =>
    sql.one<{ id: string; rev: number }>(
      `insert into public.web_items (kind, slug, draft) values ('news', 'nota-del-administrador-demo', $1::text::jsonb) returning id, rev`,
      [JSON.stringify({ title: 'Nota del administrador (demo)', category: 'noticia', body: [], coverId: media })],
    ),
  ))!;
}, 120_000);

const caps = (who: Who, aal: 'aal1' | 'aal2' = 'aal2') => t.asWho(who, (sql) => webCaps(sql), aal);
const fails = (p: Promise<unknown>) => expect(p).rejects.toThrow();

describe('las puertas que siguen las pantallas', () => {
  it('editor, aprobador, jefe y administración, cada uno lo suyo; sin doble factor nada', async () => {
    expect(await caps('writer')).toEqual({ canRead: true, canEdit: true, canPublish: false, canManageSite: false });
    expect(await caps('publisher')).toEqual({ canRead: true, canEdit: true, canPublish: true, canManageSite: true });
    expect(await caps('boss')).toEqual({ canRead: true, canEdit: true, canPublish: true, canManageSite: true });
    expect(await caps('admin')).toEqual({ canRead: true, canEdit: false, canPublish: false, canManageSite: true });
    for (const who of ['writer', 'publisher', 'boss', 'admin'] as Who[]) {
      expect(await caps(who, 'aal1'), String(who)).toEqual({ canRead: false, canEdit: false, canPublish: false, canManageSite: false });
    }
    for (const who of [...TEAM.filter((w) => w !== 'boss'), 'coordinator', 'areaA', 'complaints', 'auditor'] as Who[]) {
      expect(await caps(who), String(who)).toEqual({ canRead: false, canEdit: false, canPublish: false, canManageSite: false });
    }
  });
});

describe('lo que leen las pantallas', () => {
  it('las listas, la cola, las versiones y la biblioteca: la gente de la web y administración; nadie más', async () => {
    for (const who of ['writer', 'publisher', 'boss', 'admin'] as Who[]) {
      const list = await t.asWho(who, (sql) => adminList(sql, { kind: 'news', q: 'administrador' }));
      expect(list.rows.map((r) => r.id), String(who)).toEqual([item.id]);
      expect((await t.asWho(who, (sql) => itemVersions(sql, item.id))).length, String(who)).toBeGreaterThanOrEqual(1);
      expect((await t.asWho(who, (sql) => mediaList(sql, { q: 'foto de prueba' }))).rows.map((m) => m.id), String(who)).toEqual([media]);
      expect((await t.asWho(who, (sql) => mediaUsage(sql, media))).map((u) => u.id), String(who)).toEqual([item.id]);
      expect((await t.asWho(who, (sql) => mediaUseCounts(sql, [media]))).get(media), String(who)).toBe(1);
    }
    for (const who of ['social', 'dispatch', 'camera', 'coordinator', 'auditor'] as Who[]) {
      expect((await t.asWho(who, (sql) => adminList(sql, { kind: 'news' }))).rows, String(who)).toEqual([]);
      expect(await t.asWho(who, (sql) => kindCounts(sql)), String(who)).toEqual([]);
      expect(await t.asWho(who, (sql) => reviewQueue(sql)), String(who)).toEqual([]);
      expect((await t.asWho(who, (sql) => mediaList(sql, {}))).rows, String(who)).toEqual([]);
      expect(await t.asWho(who, (sql) => itemVersions(sql, item.id)), String(who)).toEqual([]);
      expect((await t.asWho(who, (sql) => mediaUseCounts(sql, [media]))).get(media), String(who)).toBe(0);
    }
    // Without the second factor, the editor reads nothing either.
    expect((await t.asWho('writer', (sql) => adminList(sql, { kind: 'news' }), 'aal1')).rows).toEqual([]);
  });

  it('los ajustes del sitio: los públicos los lee cualquiera del equipo; los privados, la web y administración', async () => {
    await t.system((sql) => sql.query(`insert into public.web_settings (key, value, is_public) values ('site.interno_demo', '"privado"', false)`));
    const keys = async (who: Who) => (await t.asWho(who, (sql) => siteSettingRows(sql))).map((r) => r.key);
    expect(await keys('admin')).toContain('site.interno_demo');
    expect(await keys('writer')).toContain('site.interno_demo');
    expect(await keys('social')).not.toContain('site.interno_demo');
    expect(await keys('social')).toContain('site.navigation');
  });
});

describe('lo que escriben las pantallas', () => {
  it('«Retirar de revisión»: el editor sí; administración no toca el borrador', async () => {
    await t.asWho('writer', (sql) => sql.query(`update public.web_items set status = 'in_review' where id = $1`, [item.id]));
    expect((await t.asWho('admin', (sql) => sql.query(`update public.web_items set status = 'draft' where id = $1 returning id`, [item.id])))).toEqual([]);
    expect((await t.asWho('writer', (sql) => sql.query(`update public.web_items set status = 'draft' where id = $1 returning id`, [item.id])))).toHaveLength(1);
  });

  it('una dirección nueva con su 301 en la misma transacción: el aprobador sí; el editor ni la dirección ni la redirección', async () => {
    const live = (await t.asWho('publisher', (sql) => sql.one<{ rev: number }>(`select rev from public.web_items where id = $1`, [item.id])))!;
    await t.asWho('publisher', (sql) => sql.query(`select public.publish_web_item($1, $2)`, [item.id, live.rev]));
    await fails(t.asWho('writer', (sql) => sql.query(`update public.web_items set slug = 'otra-direccion-demo' where id = $1`, [item.id])));
    await fails(t.asWho('writer', (sql) => sql.query(`insert into public.web_redirects (from_path, to_path) values ('/actualidad/nota-del-administrador-demo', '/actualidad/x')`)));
    await t.asWho('publisher', async (sql) => {
      await sql.query(`update public.web_items set slug = 'nota-nueva-del-administrador-demo' where id = $1`, [item.id]);
      await sql.query(
        `insert into public.web_redirects (from_path, to_path, status_code) values ($1, $2, 301)
         on conflict (from_path) do update set to_path = excluded.to_path, status_code = 301`,
        ['/actualidad/nota-del-administrador-demo', '/actualidad/nota-nueva-del-administrador-demo'],
      );
    });
    const r = await t.anon((sql) => sql.one<{ to_path: string }>(`select to_path from public.web_redirects where from_path = '/actualidad/nota-del-administrador-demo'`));
    expect(r?.to_path).toBe('/actualidad/nota-nueva-del-administrador-demo');
    // Chains are rewritten by who manages the site; the editor's update matches nothing.
    expect(await t.asWho('writer', (sql) => sql.query(`update public.web_redirects set to_path = '/gestion' where to_path like '/actualidad/nota-nueva%' returning id`))).toEqual([]);
  });

  it('las palabras de la biblioteca y archivar: quien edita la web; administración y Redes no', async () => {
    expect(await t.asWho('writer', (sql) => sql.query(`update public.web_media set caption = 'Pie (demo)', focal_x = 0.2 where id = $1 returning id`, [media]))).toHaveLength(1);
    expect(await t.asWho('admin', (sql) => sql.query(`update public.web_media set archived_at = now() where id = $1 returning id`, [media]))).toEqual([]);
    expect(await t.asWho('social', (sql) => sql.query(`update public.web_media set alt = 'x' where id = $1 returning id`, [media]))).toEqual([]);
    await fails(t.asWho('writer', (sql) => sql.query(`update public.web_media set alt = '' where id = $1`, [media])));
    expect(await t.asWho('publisher', (sql) => sql.query(`update public.web_media set archived_at = now() where id = $1 returning id`, [media]))).toHaveLength(1);
  });

  it('guardar un ajuste (insertar o reemplazar): administración, el aprobador y el jefe; el editor no', async () => {
    const upsert = (who: Who) =>
      t.asWho(who, (sql) =>
        sql.query(
          `insert into public.web_settings (key, value, is_public) values ('site.demo_banner', $1::text::jsonb, true)
           on conflict (key) do update set value = excluded.value returning key`,
          [JSON.stringify(`Prueba de ${String(who)} (demo)`)],
        ),
      );
    for (const who of ['admin', 'publisher', 'boss'] as Who[]) expect(await upsert(who), String(who)).toHaveLength(1);
    await fails(upsert('writer'));
    await fails(upsert('social'));
  });
});
