// The public website's content (20261106000110_web_publica.sql, D-90, D-93, D-96): every role and anon try what is not
// theirs against the database. Drafts never reach anon; only the publisher or the boss publish, schedule, archive;
// editors touch the draft only; versions and the audit keep the history without the content.
import { describe, it, expect, beforeAll } from 'vitest';
import { getClientConfig } from '@/lib/client-config';
import { makeWebTestDb, TEAM, type WebTestDb, type Who } from './web-setup';

let t: WebTestDb;
beforeAll(async () => {
  t = await makeWebTestDb();
}, 120_000);

const fails = async (p: Promise<unknown>, msg?: RegExp) => {
  if (msg) await expect(p).rejects.toThrow(msg);
  else await expect(p).rejects.toThrow();
};
const one = <T>(who: Who, q: string, p: unknown[] = [], aal: 'aal1' | 'aal2' = 'aal2') => t.asWho(who, (sql) => sql.one<T>(q, p), aal);
const rows = <T>(who: Who, q: string, p: unknown[] = [], aal: 'aal1' | 'aal2' = 'aal2') => t.asWho(who, (sql) => sql.query<T>(q, p), aal);
const sys = <T>(q: string, p: unknown[] = []) => t.system((sql) => sql.query<T>(q, p));
const sysOne = async <T>(q: string, p: unknown[] = []) => (await sys<T>(q, p))[0];
const anonRows = <T>(q: string, p: unknown[] = []) => t.anon((sql) => sql.query<T>(q, p));

type Item = { id: string; rev: number; status: string; draft_version: number };
let n = 0;
async function newItem(who: Who = 'writer', kind = 'news', draft: Record<string, unknown> = {}): Promise<Item> {
  n++;
  return (await one<Item>(
    who,
    `insert into public.web_items (kind, slug, draft) values ($1, $2, $3::text::jsonb) returning id, rev, status, draft_version`,
    [kind, `contenido-de-prueba-${n}`, JSON.stringify({ title: `Contenido de prueba ${n} (demo)`, excerpt: 'Resumen de prueba.', blocks: [], ...draft })],
  ))!;
}
const item = (id: string) =>
  sysOne<Item & { published: Record<string, unknown> | null; publish_at: Date | null; archived_at: Date | null; published_version: number | null; draft: Record<string, unknown>; slug: string; review_note: string | null; published_media: Record<string, Record<string, unknown>>; display_date: string | null; category: string | null; search: string; municipality_id: string | null }>(
    `select *, display_date::text as display_date from public.web_items where id = $1`, [id]);
const publish = (who: Who, id: string, rev: number | null, at: string | null = null, aal: 'aal1' | 'aal2' = 'aal2') =>
  one<{ at: Date }>(who, `select public.publish_web_item($1, $2, $3::timestamptz) as at`, [id, rev, at], aal);
const anonSees = async (id: string) => (await anonRows<{ id: string }>(`select id from public.web_items where id = $1`, [id])).length === 1;

describe('roles de la web y de la atención (D-93)', () => {
  const freshUser = async (email: string) => (await sysOne<{ id: string }>(`insert into auth.users (email) values ($1) returning id`, [email]))!.id;

  it('administración da los seis roles nuevos; aid_operator y los retirados siguen sin darse', async () => {
    for (const role of ['writer', 'web_publisher', 'attention_coordinator', 'reports_operator', 'complaints_operator', 'auditor']) {
      const u = await freshUser(`rol.${role}@prueba.test`);
      expect(await rows('admin', `insert into public.user_roles (user_id, role) values ($1, $2) returning role`, [u, role]), role).toHaveLength(1);
    }
    const u = await freshUser('rol.ayudas@prueba.test');
    for (const role of ['aid_operator', 'secretary', 'supervisor']) {
      await fails(rows('admin', `insert into public.user_roles (user_id, role) values ($1, $2)`, [u, role]), /user_roles_assignable/);
    }
  });

  it('se invita con un rol de la web y al entrar llega ese rol; con doble factor siempre', async () => {
    await rows('admin', `insert into public.invitations (email, full_name, roles, invited_by) values ('nueva.editora@prueba.test', 'Nueva editora (prueba)', '{writer}', auth.uid())`);
    const u = await sysOne<{ id: string }>(`insert into auth.users (email) values ('nueva.editora@prueba.test') returning id`);
    expect(await sys<{ role: string }>(`select role::text from public.user_roles where user_id = $1`, [u!.id])).toEqual([{ role: 'writer' }]);
    const list = (await sysOne<{ value: string[] }>(`select value from public.app_settings where key = 'security.mfa_roles'`))!.value;
    expect(list).toEqual(expect.arrayContaining(['writer', 'web_publisher', 'attention_coordinator', 'reports_operator', 'complaints_operator', 'auditor']));
  });

  it('administración nunca publica ni lee casos en la misma cuenta: ni por rol ni por invitación (el editor sí)', async () => {
    const adminAccount = await freshUser('otra.admin@prueba.test');
    await sys(`insert into public.user_roles (user_id, role) values ($1, 'admin')`, [adminAccount]);
    for (const role of ['web_publisher', 'attention_coordinator', 'reports_operator', 'complaints_operator', 'auditor']) {
      await fails(rows('admin', `insert into public.user_roles (user_id, role) values ($1, $2)`, [adminAccount, role]), /no publica la web ni lee las solicitudes/);
      await fails(t.system((sql) => sql.query(`insert into public.user_roles (user_id, role) values ($1, $2)`, [adminAccount, role])), /no publica la web/);
      await fails(
        rows('admin', `insert into public.invitations (email, full_name, roles) values ($1, 'Mezcla (prueba)', $2::public.app_role[])`, [`mezcla.${role}@prueba.test`, `{admin,${role}}`]),
        /no publica la web ni lee las solicitudes/,
      );
    }
    // The boss and despacho keep their own (more specific) reason.
    await fails(rows('admin', `insert into public.user_roles (user_id, role) values ($1, 'dispatch')`, [adminAccount]), /ni el despacho/);
    expect(await rows('admin', `insert into public.user_roles (user_id, role) values ($1, 'writer') returning role`, [adminAccount])).toHaveLength(1);
  });
});

describe('las páginas base y los catálogos del cliente', () => {
  it('los 29 municipios del cliente, sin parroquias inventadas', async () => {
    const cfg = getClientConfig();
    const munis = await sys<{ name: string; slug: string }>(`select name, slug from public.territories where kind = 'municipality' order by sort`);
    expect(munis.map((m) => m.name)).toEqual(cfg.municipalities);
    expect(munis).toHaveLength(29);
    expect(munis.find((m) => m.name === 'San Cristóbal')?.slug).toBe('san-cristobal');
    expect(await sysOne<{ n: number }>(`select count(*)::int as n from public.territories where kind = 'parish'`)).toEqual({ n: 0 });
  });

  it('las seis páginas base entran como borrador: nada de eso es público hasta que alguien lo publique', async () => {
    const pages = await sys<{ slug: string; status: string; published: unknown }>(`select slug, status, published from public.web_items where kind = 'page' order by slug`);
    expect(pages.map((p) => p.slug)).toEqual(['accesibilidad', 'atencion', 'aviso-de-privacidad', 'condiciones-de-participacion', 'gobernador', 'inicio']);
    for (const p of pages) expect(p, p.slug).toMatchObject({ status: 'draft', published: null });
    expect(await anonRows(`select id from public.web_items where kind = 'page'`)).toEqual([]);
    // Each one already has its first version.
    expect(await sysOne<{ n: number }>(`select count(*)::int as n from public.web_versions v join public.web_items i on i.id = v.item_id where i.kind = 'page'`)).toEqual({ n: 6 });
  });

  it('los ajustes del sitio: las cuentas del diagnóstico, todas por confirmar; sin contactos, WhatsApp ni portal verificados', async () => {
    const s = Object.fromEntries((await sys<{ key: string; value: unknown }>(`select key, value from public.web_settings`)).map((r) => [r.key, r.value]));
    // docs/diagnostico.md §8: the accounts the team has to confirm. None is verified, so production shows none and
    // JSON-LD sameAs stays empty until the team verifies them; the abandoned YouTube channel is inactive (never shown).
    const accounts = s['site.social_accounts'] as { handle: string; url: string; verified: boolean; active: boolean }[];
    expect(accounts.length).toBeGreaterThan(0);
    for (const a of accounts) {
      expect(a.verified, a.handle).toBe(false);
      expect(a.url, a.handle).toMatch(/^https:\/\//);
    }
    expect(accounts.find((a) => a.handle === '@FreddyBernalOficial')).toMatchObject({ active: false });
    expect(accounts.find((a) => a.handle === '@FreddyBernal.oficial')).toMatchObject({ active: true });
    expect(s['site.youtube_channel']).toMatchObject({ handle: '@FreddyBernal.oficial', verified: false });
    expect(s['site.institutional_portal']).toMatchObject({ verified: false });
    expect(s['site.contacts']).toEqual([]);
    expect(s['site.whatsapp_channel']).toBeNull();
    // The office as the official site writes it, the same in the header, the hero, the title and the JSON-LD.
    expect(s['site.identity']).toMatchObject({ title: 'Gobernador del estado Táchira', wordmark: 'Freddy Bernal · Gobernador del estado Táchira' });
  });
});

describe('borrador → aprobación → publicado (solo quien aprueba o el jefe)', () => {
  it('el editor crea un borrador; no lo crea publicado, archivado ni con fecha de salida', async () => {
    const it = await newItem();
    expect(it).toMatchObject({ status: 'draft', rev: 1, draft_version: 1 });
    await fails(one('writer', `insert into public.web_items (kind, slug, status, draft) values ('news', 'ya-publicada', 'published', '{"title":"x"}')`), /empieza como borrador/);
    await fails(one('writer', `insert into public.web_items (kind, slug, draft, published) values ('news', 'con-snapshot', '{"title":"x"}', '{"title":"x"}')`), /permission denied/);
    await fails(one('writer', `insert into public.web_items (kind, slug, draft, publish_at) values ('news', 'con-fecha', '{"title":"x"}', now())`), /permission denied/);
  });

  it('el editor manda a aprobación, pero no publica, no programa, no archiva ni toca lo publicado', async () => {
    const it = await newItem();
    const sent = await one<{ status: string; submitted_by: string }>('writer', `update public.web_items set status = 'in_review' where id = $1 returning status, submitted_by`, [it.id]);
    expect(sent).toEqual({ status: 'in_review', submitted_by: t.idOf('writer') });
    const rev = (await item(it.id))!.rev;
    await fails(publish('writer', it.id, rev), /Publica quien aprueba la web o el jefe/);
    await fails(publish('writer', it.id, rev, new Date(Date.now() + 86_400_000).toISOString()), /Publica quien aprueba/);
    await fails(one('writer', `select public.archive_web_item($1)`, [it.id]), /Archiva quien aprueba/);
    await fails(one('writer', `update public.web_items set status = 'published' where id = $1`, [it.id]), /se hacen con sus botones/);
    await fails(one('writer', `update public.web_items set published = draft where id = $1`, [it.id]), /permission denied/);
    await fails(one('writer', `update public.web_items set archived_at = now() where id = $1`, [it.id]), /permission denied/);
    expect(await anonSees(it.id)).toBe(false);
  });

  it('quien aprueba publica exactamente el borrador que vio; si cambió mientras tanto, no', async () => {
    const it = await newItem('writer', 'news', { date: '2026-11-01', category: 'Obras', municipalityId: t.municipality('Junín') });
    await one('writer', `update public.web_items set status = 'in_review' where id = $1`, [it.id]);
    const seen = (await item(it.id))!.rev;
    await one('writer', `update public.web_items set draft = draft || '{"excerpt":"Cambio de último minuto."}'::jsonb where id = $1`, [it.id]);
    await fails(publish('publisher', it.id, seen), /cambió mientras lo revisabas/);
    const now = (await item(it.id))!;
    await publish('publisher', it.id, now.rev);
    const after = (await item(it.id))!;
    expect(after).toMatchObject({ status: 'published', published_version: now.draft_version, display_date: '2026-11-01', category: 'Obras', municipality_id: t.municipality('Junín') });
    expect(after.published).toEqual(after.draft);
    expect(after.search).toContain('cambio de ultimo minuto');
    expect(await anonSees(it.id)).toBe(true);
  });

  it('anon lee lo publicado y solo sus columnas públicas: nunca el borrador, ni quién publicó', async () => {
    const it = await newItem();
    await publish('publisher', it.id, null);
    const got = await anonRows<{ slug: string; published: { title: string } }>(`select slug, published from public.web_items where id = $1`, [it.id]);
    expect(got[0].published.title).toMatch(/Contenido de prueba/);
    for (const col of ['draft', 'published_by', 'created_by', 'review_note', 'status', 'rev', '*']) {
      await fails(anonRows(`select ${col} from public.web_items`), /permission denied/);
    }
    for (const q of [`insert into public.web_items (kind, slug, draft) values ('news', 'anon', '{}')`, `update public.web_items set slug = slug`, `delete from public.web_items`]) {
      await fails(anonRows(q), /permission denied/);
    }
  });

  it('editar algo publicado cambia el borrador; lo público sigue igual hasta publicar otra vez', async () => {
    const it = await newItem();
    await publish('publisher', it.id, null);
    const before = (await item(it.id))!;
    await one('writer', `update public.web_items set draft = jsonb_set(draft, '{title}', '"Título nuevo (demo)"') where id = $1`, [it.id]);
    const after = (await item(it.id))!;
    expect(after.status).toBe('draft');
    expect(after.published).toEqual(before.published);
    expect((await anonRows<{ t: string }>(`select published ->> 'title' as t from public.web_items where id = $1`, [it.id]))[0].t).toBe(before.published!.title);
    // Something live is updated now, never scheduled (it would leave the site until then).
    await fails(publish('publisher', it.id, after.rev, new Date(Date.now() + 86_400_000).toISOString()), /ya está publicado/);
    await publish('boss', it.id, after.rev);
    expect((await anonRows<{ t: string }>(`select published ->> 'title' as t from public.web_items where id = $1`, [it.id]))[0].t).toBe('Título nuevo (demo)');
  });

  it('programar: no se ve antes de su hora; a su hora sí; quitar la programación lo devuelve a borrador', async () => {
    const it = await newItem();
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
    await publish('publisher', it.id, null, tomorrow);
    expect((await item(it.id))!.status).toBe('scheduled');
    expect(await anonSees(it.id)).toBe(false);
    await fails(publish('publisher', it.id, null, new Date(Date.now() - 3_600_000).toISOString()), /ya pasó/);
    // Its time comes (the system moves the clock of this row).
    await sys(`update public.web_items set publish_at = now() - interval '1 minute' where id = $1`, [it.id]);
    expect(await anonSees(it.id)).toBe(true);
    await fails(one('publisher', `select public.web_items_flip_scheduled()`), /permission denied/);
    expect(await sysOne<{ n: number }>(`select public.web_items_flip_scheduled() as n`)).toEqual({ n: 1 });
    expect((await item(it.id))!.status).toBe('published');

    const later = await newItem();
    await publish('publisher', later.id, null, tomorrow);
    await fails(one('writer', `select public.cancel_web_schedule($1)`, [later.id]), /la quita quien aprueba/);
    await one('publisher', `select public.cancel_web_schedule($1)`, [later.id]);
    expect(await item(later.id)).toMatchObject({ status: 'draft', published: null, publish_at: null });
  });

  it('archivar lo saca de la web al momento; desarchivar trae lo aprobado; el editor no hace ninguna de las dos', async () => {
    const it = await newItem();
    await publish('publisher', it.id, null);
    await one('publisher', `select public.archive_web_item($1)`, [it.id]);
    expect(await anonSees(it.id)).toBe(false);
    expect((await item(it.id))!.status).toBe('archived');
    await fails(one('writer', `select public.unarchive_web_item($1)`, [it.id]), /Desarchiva quien aprueba/);
    await fails(one('writer', `update public.web_items set status = 'draft' where id = $1`, [it.id]), /vuelve con «Desarchivar»/);
    await one('boss', `select public.unarchive_web_item($1)`, [it.id]);
    expect(await anonSees(it.id)).toBe(true);
    expect((await item(it.id))!.status).toBe('published');
  });

  it('«Pedir cambios» devuelve el borrador con la nota; al mandarlo de nuevo la nota se va', async () => {
    const it = await newItem();
    await one('writer', `update public.web_items set status = 'in_review' where id = $1`, [it.id]);
    await fails(one('writer', `select public.return_web_item($1, 'Cambia el título.')`, [it.id]), /Pide cambios quien aprueba/);
    await fails(one('publisher', `select public.return_web_item($1, '')`, [it.id]), /Escribe qué hay que cambiar/);
    await one('publisher', `select public.return_web_item($1, 'Cambia el título.')`, [it.id]);
    expect(await item(it.id)).toMatchObject({ status: 'draft', review_note: 'Cambia el título.' });
    await fails(one('writer', `update public.web_items set review_note = null where id = $1`, [it.id]), /permission denied/);
    await one('writer', `update public.web_items set status = 'in_review' where id = $1`, [it.id]);
    expect(await item(it.id)).toMatchObject({ status: 'in_review', review_note: null });
  });

  it('administración lee los borradores pero no escribe, no publica ni archiva; el equipo y la atención no ven borradores', async () => {
    const it = await newItem();
    expect(await rows('admin', `select id from public.web_items where id = $1`, [it.id])).toHaveLength(1);
    expect(await rows('admin', `update public.web_items set draft = '{}' where id = $1 returning id`, [it.id])).toEqual([]);
    await fails(rows('admin', `insert into public.web_items (kind, slug, draft) values ('news', 'de-admin', '{"title":"x"}')`), /row-level security/);
    await fails(publish('admin', it.id, null), /Publica quien aprueba/);
    await fails(rows('admin', `select public.archive_web_item($1)`, [it.id]), /Archiva quien aprueba/);
    for (const who of [...TEAM.filter((w) => w !== 'boss'), 'coordinator', 'areaA', 'complaints', 'auditor'] as Who[]) {
      expect(await rows(who, `select id from public.web_items`), who).toEqual([]);
      expect(await rows(who, `select id from public.web_versions`), who).toEqual([]);
      expect(await rows(who, `select id from public.web_media`), who).toEqual([]);
      await fails(rows(who, `insert into public.web_items (kind, slug, draft) values ('news', 'ajena', '{"title":"x"}')`), /row-level security/);
      await fails(publish(who, it.id, null), /Publica quien aprueba/);
    }
  });

  it('sin doble factor nadie de la web hace nada: ni el editor, ni quien aprueba, ni el jefe', async () => {
    const it = await newItem();
    for (const who of ['writer', 'publisher', 'boss'] as Who[]) {
      expect(await rows(who, `select id from public.web_items`, [], 'aal1'), who).toEqual([]);
      await fails(rows(who, `insert into public.web_items (kind, slug, draft) values ('news', 'sin-2fa', '{"title":"x"}')`, [], 'aal1'), /row-level security/);
      await fails(publish(who, it.id, null, null, 'aal1'), /Publica quien aprueba/);
    }
  });

  it('la dirección de algo publicado la cambia quien publica; la de un borrador nuevo, el editor', async () => {
    const it = await newItem();
    expect(await rows('writer', `update public.web_items set slug = 'otra-direccion-borrador' where id = $1 returning slug`, [it.id])).toHaveLength(1);
    await publish('publisher', it.id, null);
    await fails(one('writer', `update public.web_items set slug = 'otra-direccion' where id = $1`, [it.id]), /la cambia quien publica/);
    expect(await rows('publisher', `update public.web_items set slug = 'otra-direccion' where id = $1 returning slug`, [it.id])).toEqual([{ slug: 'otra-direccion' }]);
  });
});

describe('versiones: cada guardado queda; volver a una versión toca solo el borrador', () => {
  it('cada cambio del borrador es una versión; restaurar copia al borrador y no a lo publicado', async () => {
    const it = await newItem();
    await t.asWho('writer', async (sql) => {
      await sql.query(`select set_config('app.version_note', 'Primer ajuste', true)`);
      await sql.query(`update public.web_items set draft = jsonb_set(draft, '{title}', '"Versión dos (demo)"') where id = $1`, [it.id]);
    });
    await publish('publisher', it.id, null);
    await one('writer', `update public.web_items set draft = jsonb_set(draft, '{title}', '"Versión tres (demo)"') where id = $1`, [it.id]);
    const versions = await rows<{ version_no: number; note: string | null; title: string }>('writer',
      `select version_no, note, snapshot ->> 'title' as title from public.web_versions where item_id = $1 order by version_no`, [it.id]);
    expect(versions.map((v) => v.version_no)).toEqual([1, 2, 3]);
    expect(versions[1]).toMatchObject({ note: 'Primer ajuste', title: 'Versión dos (demo)' });
    expect(await one<{ v: number }>('writer', `select public.restore_web_version($1, 1) as v`, [it.id])).toEqual({ v: 4 });
    const after = (await item(it.id))!;
    expect(after.draft.title).toBe(versions[0].title);
    expect(after.published!.title).toBe('Versión dos (demo)');
    expect(after.status).toBe('draft');
    expect((await sysOne<{ note: string }>(`select note from public.web_versions where item_id = $1 and version_no = 4`, [it.id]))!.note).toBe('Vuelta a la versión 1');
    await fails(one('auditor', `select public.restore_web_version($1, 1)`, [it.id]), /Vuelve a una versión quien edita/);
  });

  it('el historial no se borra ni se cambia, tampoco con la conexión del sistema', async () => {
    const v = await sysOne<{ id: string }>(`select id from public.web_versions limit 1`);
    await fails(sys(`update public.web_versions set note = 'otra' where id = $1`, [v!.id]), /El historial no se borra/);
    await fails(sys(`delete from public.web_versions where id = $1`, [v!.id]), /El historial no se borra/);
    await fails(rows('writer', `delete from public.web_versions`), /permission denied/);
  });
});

describe('biblioteca de fotos y archivos', () => {
  const key = () => `${crypto.randomUUID()}.jpg`;
  const addImage = (who: Who, alt: string) =>
    one<{ id: string }>(who, `insert into public.web_media (storage_key, kind, mime, bytes, width, height, alt) values ($1, 'image', 'image/jpeg', 1000, 800, 600, $2) returning id`, [key(), alt]);

  it('una foto sin texto alternativo no entra (la base lo exige); el archivo no se reemplaza', async () => {
    await fails(addImage('writer', ''), /web_media_image_alt/);
    await fails(one('writer', `insert into public.web_media (storage_key, kind, mime, bytes, width, height, alt) values ($1, 'image', 'image/png', 10, 1, 1, 'Foto de prueba')`, [key()]), /web_media_key_mime/);
    const m = (await addImage('writer', 'Foto de prueba de una obra'))!;
    await fails(one('writer', `update public.web_media set storage_key = $2 where id = $1`, [m.id, key()]), /permission denied/);
    await fails(sys(`update public.web_media set bytes = 5 where id = $1`, [m.id]), /no se reemplaza/);
    expect(await rows('writer', `update public.web_media set alt = 'Otro texto alternativo' where id = $1 returning alt`, [m.id])).toHaveLength(1);
    await fails(anonRows(`select id from public.web_media`), /permission denied/);
    for (const who of ['admin', 'auditor', 'coordinator'] as Who[]) {
      await fails(addImage(who, 'Foto ajena de prueba'), /row-level security/);
    }
  });

  it('al publicar, las fotos quedan congeladas en lo publicado; cambiar la biblioteca no cambia la web', async () => {
    const m = (await addImage('writer', 'Texto alternativo original'))!;
    const it = await newItem('writer', 'news', { blocks: [{ id: 'b1', type: 'image', visible: true, data: { mediaId: m.id } }] });
    await publish('publisher', it.id, null);
    const frozen = (await item(it.id))!.published_media[m.id];
    expect(frozen).toMatchObject({ alt: 'Texto alternativo original', mime: 'image/jpeg', width: 800 });
    await one('writer', `update public.web_media set alt = 'Texto cambiado después' where id = $1`, [m.id]);
    expect((await item(it.id))!.published_media[m.id].alt).toBe('Texto alternativo original');
    const pub = await anonRows<{ m: Record<string, { key: string }> }>(`select published_media as m from public.web_items where id = $1`, [it.id]);
    expect(pub[0].m[m.id].key).toMatch(/\.jpg$/);
    // An archived photo cannot go out in a new publication.
    await one('writer', `update public.web_media set archived_at = now() where id = $1`, [m.id]);
    const again = await newItem('writer', 'news', { cover: m.id });
    await fails(publish('publisher', again.id, null), /archivado en la biblioteca/);
  });
});

describe('ajustes del sitio, redirecciones y territorios', () => {
  it('anon lee los ajustes públicos y nada más; los escriben administración, quien aprueba y el jefe', async () => {
    const keys = (await anonRows<{ key: string }>(`select key from public.web_settings order by key`)).map((r) => r.key);
    expect(keys).toContain('site.navigation');
    await fails(anonRows(`select is_public from public.web_settings`), /permission denied/);
    await rows('admin', `insert into public.web_settings (key, value, is_public) values ('site.interno_prueba', '"solo el equipo"', false)`);
    expect(await anonRows(`select key from public.web_settings where key = 'site.interno_prueba'`)).toEqual([]);
    expect(await rows('writer', `update public.web_settings set value = '"x"' where key = 'site.demo_banner' returning key`)).toEqual([]);
    await fails(rows('writer', `insert into public.web_settings (key, value) values ('site.otro', '1')`), /row-level security/);
    for (const who of ['admin', 'publisher', 'boss'] as Who[]) {
      expect(await rows(who, `update public.web_settings set value = value where key = 'site.demo_banner' returning key`), who).toHaveLength(1);
    }
    await fails(anonRows(`update public.web_settings set value = '1'`), /permission denied/);
  });

  it('redirecciones: anon las lee; nunca hacia otro sitio; las maneja quien maneja el sitio', async () => {
    await rows('admin', `insert into public.web_redirects (from_path, to_path) values ('/2023/05/una-noticia-vieja', '/actualidad')`);
    expect(await anonRows(`select to_path, status_code from public.web_redirects where from_path = '/2023/05/una-noticia-vieja'`)).toEqual([{ to_path: '/actualidad', status_code: 301 }]);
    for (const to of ['https://otro.sitio/', '//otro.sitio/x', 'actualidad', '/a b']) {
      await fails(rows('admin', `insert into public.web_redirects (from_path, to_path) values ($1, $2)`, [`/viejo-${to.length}`, to]), /web_redirects_to_path_check|check constraint/);
    }
    await fails(rows('writer', `insert into public.web_redirects (from_path, to_path) values ('/de-editor', '/')`), /row-level security/);
    expect(await rows('publisher', `delete from public.web_redirects where from_path = '/2023/05/una-noticia-vieja' returning id`)).toHaveLength(1);
    await fails(anonRows(`delete from public.web_redirects`), /permission denied/);
  });

  it('territorios: anon lee los activos; administración los mantiene (apagar, nunca borrar); nadie más', async () => {
    const id = t.municipality('Seboruco');
    await rows('admin', `update public.territories set active = false where id = $1`, [id]);
    expect(await anonRows(`select id from public.territories where id = $1`, [id])).toEqual([]);
    expect(await rows('coordinator', `select id from public.territories where id = $1`, [id])).toHaveLength(1);
    await rows('admin', `update public.territories set active = true where id = $1`, [id]);
    expect(await anonRows(`select name from public.territories where id = $1`, [id])).toEqual([{ name: 'Seboruco' }]);
    await fails(anonRows(`select active from public.territories`), /permission denied/);
    expect(await rows('admin', `insert into public.territories (kind, parent_id, name, slug) values ('parish', $1, 'Parroquia de prueba', 'parroquia-de-prueba') returning kind`, [id])).toHaveLength(1);
    await fails(rows('admin', `insert into public.territories (kind, parent_id, name, slug) values ('parish', (select id from public.territories where kind = 'parish' limit 1), 'Dentro de otra', 'dentro-de-otra')`), /va dentro de un municipio/);
    await fails(rows('admin', `delete from public.territories where id = $1`, [id]), /permission denied/);
    for (const who of ['coordinator', 'writer', 'dispatch'] as Who[]) {
      await fails(rows(who, `insert into public.territories (kind, name, slug) values ('municipality', 'Inventado', 'inventado')`), /row-level security/);
    }
  });
});

describe('auditoría de la web', () => {
  it('cada cambio queda con quién y qué campos, sin el contenido; auditoría lo lee, pero no el resto de la plataforma', async () => {
    const it = await newItem();
    await publish('publisher', it.id, null);
    const audit = await sys<{ action: string; new_data: Record<string, unknown>; actor_id: string }>(
      `select action, new_data, actor_id from public.audit_log where table_name = 'web_items' and row_id = $1 order by id`, [it.id]);
    expect(audit.length).toBeGreaterThanOrEqual(2);
    for (const a of audit) {
      expect(a.new_data).not.toHaveProperty('draft');
      expect(a.new_data).not.toHaveProperty('published');
      expect(JSON.stringify(a.new_data)).not.toMatch(/Contenido de prueba/);
    }
    // No photos in it: published_media stays {} and is not named.
    expect(audit.at(-1)).toMatchObject({ actor_id: t.idOf('publisher'), new_data: { status: 'published', content_fields: ['published', 'search'] } });
    expect((await rows('auditor', `select id from public.audit_log where table_name = 'web_items' and row_id = $1`, [it.id])).length).toBe(audit.length);
    expect(await rows('auditor', `select id from public.audit_log where table_name in ('event_schedule', 'events', 'obra_ficha_private', 'chat_messages')`)).toEqual([]);
    expect(await rows('auditor', `select id from public.audit_log where table_name = 'web_items'`, [], 'aal1')).toEqual([]);
    for (const who of ['writer', 'publisher', 'coordinator', 'boss'] as Who[]) {
      expect(await rows(who, `select id from public.audit_log where table_name = 'web_items'`), who).toEqual([]);
    }
    for (const who of ['admin', 'auditor'] as Who[]) {
      await fails(rows(who, `delete from public.audit_log where table_name = 'web_items'`), /permission denied/);
    }
  });
});
