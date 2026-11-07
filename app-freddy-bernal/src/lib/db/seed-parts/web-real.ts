import { createHash } from 'node:crypto';
import { getClientConfig, type ClientConfig } from '../../client-config';
import type { Block, TextNode } from '../../web/blocks';
import { DENUNCIA_NOTICE, EMERGENCY_NOTICE } from '../../participation/notices';
import { REAL_DEMO_BANNER, accountKeyOf, realIds, taglineWithoutName, type RealSnapshot } from '../../web/real-site';
import { parseSnapshot, type Snapshot } from '../../web/schema';
import type { Sql } from '../core';
import type { DemoUserKey } from '../seed-demo';
import { asPerson } from './context';

// The official site's real content in the demo (src/lib/web/real-site.ts, design §3): the LAST part of the demo seed,
// only when the build left a snapshot (src/lib/db/index.ts), after seedDemo(…, { inventedWebItems: false,
// publicAttended: false }). As the people who would do it, like the invented web seed (seed-parts/web.ts): the web
// editor puts the library's files (their bytes stay in .real-site/media, served read-only), the items and the pages'
// drafts; the web publisher publishes every item and every page; the system updates the site's settings and writes the
// old addresses' redirects (source «importador») and where each news item came from (the CMS shows «Traído de la web
// vieja»). Everything from the snapshot's ids, in a fixed order: the same rows on every demo server (D-39).
//
// The pages are composed here from the client's skeleton (config/clients/fb.json, as the seed put it), so the copy of
// the site stays the config's; the official site gives the name and tagline, the photos, the biography and the
// posts about taking office. The FAQs of the attention desk are this platform's own (they describe how the desk works,
// in the site's voice), not the official site's.

export { REAL_DEMO_BANNER };

const p = (text: string): TextNode => ({ type: 'paragraph', text });
const h2 = (text: string): TextNode => ({ type: 'heading', level: 2, text });

type Faq = { slug: string; order: number; q: string; a: TextNode[] };

/** The attention desk's questions, in the site's voice (copy audit §6: usted, one idea per sentence, «el personal de
 * atención», nothing about how the system works inside). The same facts and words as /atencion and «Consultar mi
 * solicitud»; two of them answer with the legal notices themselves (src/lib/participation/notices.ts), word for word. */
export function realFaqs(): Faq[] {
  return [
    { slug: 'como-consultar-una-solicitud', order: 1, q: '¿Cómo consulto mi solicitud?', a: [p('En «Consultar mi solicitud», escriba el código y la clave de su comprobante.')] },
    {
      slug: 'agregar-informacion-a-una-solicitud', order: 2, q: '¿Puedo agregar información a mi solicitud?',
      a: [p('Sí. En «Consultar mi solicitud» puede agregar información y leer las respuestas del personal de atención.')],
    },
    {
      slug: 'si-pierdo-la-clave', order: 3, q: '¿Qué pasa si pierdo la clave?',
      a: [p('La clave no se puede recuperar.'), p('Si dejó un dato de contacto, el personal de atención puede escribirle. Si no, puede enviar una solicitud nueva.')],
    },
    {
      slug: 'enviar-sin-dar-el-nombre', order: 4, q: '¿Puedo enviar una solicitud sin dar mi nombre?',
      a: [p('Sí. En los datos de contacto, marque «Enviar como anónimo».'), p('Sin datos de contacto, el código y la clave son la única forma de consultar la solicitud. Guárdelos en un lugar seguro.')],
    },
    { slug: 'quien-lee-una-denuncia', order: 5, q: '¿Quién lee una denuncia?', a: [p(DENUNCIA_NOTICE)] },
    {
      slug: 'cuanto-tarda-la-respuesta', order: 6, q: '¿Cuánto tarda la respuesta?',
      a: [p('El personal de atención fija una fecha de atención para cada solicitud, según su categoría y su urgencia.'), p('Los casos urgentes se atienden primero.')],
    },
    { slug: 'servicio-de-emergencias', order: 7, q: '¿Es un servicio de emergencias?', a: [p(EMERGENCY_NOTICE)] },
  ];
}

type PageDraft = Snapshot<'page'>;
// The home's blocks the official site has nothing for (works, figures, notices) or that would show invented cases.
const HOME_HIDDEN_IDS = new Set(['indicadores', 'atendido', 'gestion', 'avisos']);
const HOME_HIDDEN_TYPES = new Set<Block['type']>(['indicators', 'attended', 'projects', 'notices']);

/** «inicio»: the hero with the official site's name, tagline and photo; nothing without content; the opinion pieces and
 * the latest weekly right after the news. */
export function composeHome(draft: PageDraft, snap: Pick<RealSnapshot, 'identity' | 'pages'>): PageDraft {
  let hero = false;
  const blocks: Block[] = draft.blocks.map((b) => {
    if (b.type === 'hero' && !hero) {
      hero = true;
      return { ...b, data: { ...b.data, title: snap.identity.name, text: taglineWithoutName(snap.identity), mediaId: snap.pages.heroMediaId } };
    }
    if (HOME_HIDDEN_IDS.has(b.id) || HOME_HIDDEN_TYPES.has(b.type)) return { ...b, visible: false };
    return b;
  });
  const extra: Block[] = (
    [
      { id: 'opinion', type: 'news', visible: true, data: { title: 'Opinión', category: 'articulo', limit: 2 } },
      { id: 'semanario', type: 'documents', visible: true, data: { title: 'Semanario', category: 'semanario', limit: 1, ids: [] } },
    ] satisfies Block[]
  ).filter((x) => !blocks.some((b) => b.id === x.id));
  const news = blocks.findIndex((b) => b.id === 'actualidad');
  const at = news >= 0 ? news : blocks.findIndex((b) => b.type === 'news');
  if (at >= 0) blocks.splice(at + 1, 0, ...extra);
  else blocks.push(...extra);
  return { ...draft, blocks };
}

/** «gobernador»: the governor's photo in the hero; the biography, the posts about taking office and the honours of the
 * official site in place of the skeleton's slots, with the source; no press kit (the official site has none). */
export function composeGovernor(draft: PageDraft, snap: Pick<RealSnapshot, 'pages' | 'source'>, cfg: ClientConfig = getClientConfig()): PageDraft {
  const pg = snap.pages;
  const content: TextNode[] = [];
  if (pg.biography.length) content.push(h2('Biografía'), ...pg.biography);
  if (pg.office.length) content.push(h2(cfg.web.structuredData.jobTitle), ...pg.office);
  if (pg.honors.length) content.push(h2('Condecoraciones'), ...pg.honors);
  if (content.length && pg.bioSourceUrl) {
    content.push({ type: 'paragraph', runs: [{ text: 'Fuente: ' }, { text: new URL(snap.source).hostname, href: pg.bioSourceUrl }] });
  }
  const text = content.slice(0, 200);
  let hero = false;
  let placed = false;
  const blocks: Block[] = draft.blocks.map((b) => {
    if (b.type === 'hero' && !hero) {
      hero = true;
      return { ...b, data: { ...b.data, mediaId: pg.bioMediaId ?? b.data.mediaId ?? null } };
    }
    if (b.id === 'biografia' && b.type === 'text' && text.length) {
      placed = true;
      return { ...b, data: { ...b.data, content: text } };
    }
    if (b.id === 'prensa') return { ...b, visible: false };
    return b;
  });
  if (!placed && text.length) {
    const after = blocks.findIndex((b) => b.type === 'hero');
    blocks.splice(after + 1, 0, { id: 'biografia', type: 'text', visible: true, data: { content: text } });
  }
  return { ...draft, blocks };
}

type Account = { network: string; label?: string; handle: string; url: string; verified?: boolean; active?: boolean; note?: string };
type Channel = { label?: string; handle?: string; url: string; verified?: boolean; active?: boolean; note?: string };

/** The configured accounts, verified only when the governor's own channel links them (and the channel itself when its
 * feed is the configured one); no internal notes in the public rows. */
export function verifiedAccounts(cfg: ClientConfig, accounts: RealSnapshot['accounts']): { social: Account[]; youtube: Channel | null } {
  const settings = cfg.web.settings as Record<string, unknown>;
  const linked = new Set(accounts.verifiedHandles);
  const yt = cfg.web.realSite.youtube;
  const channel = accounts.youtubeOk ? new Set([`youtube:${yt.handle.replace(/^@/, '').toLowerCase()}`, `youtube:channel:${yt.channelId.toLowerCase()}`]) : new Set<string>();
  const verified = (url: string) => {
    const k = accountKeyOf(url);
    return !!k && (linked.has(k) || channel.has(k));
  };
  const withoutNote = <T extends { note?: string; url: string }>(a: T): T => {
    const c = { ...a, verified: verified(a.url) };
    delete c.note;
    return c;
  };
  const social = ((settings['site.social_accounts'] as Account[] | undefined) ?? []).map(withoutNote);
  const conf = settings['site.youtube_channel'] as Channel | null | undefined;
  return { social, youtube: conf ? withoutNote(conf) : null };
}

export type RealSeedCtx = { sql: Sql; ids: Record<DemoUserKey, string> };

const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');

/** When each item was published, from the snapshot and never the server's clock: the post's own moment on the official
 * site, else its day (at noon in Caracas), else the moment the build read the site. The same on every server and on every
 * start, so a news item never says it was changed when the demo woke up. */
export function publishedMoments(snap: Pick<RealSnapshot, 'items' | 'fetchedAt'>, others: readonly string[]): { id: string; at: string }[] {
  const out = snap.items.map((i) => {
    const day = (i.draft as { date?: unknown }).date;
    const at = i.source?.publishedAt ?? (typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) ? `${day}T12:00:00-04:00` : snap.fetchedAt);
    return { id: i.id, at: new Date(at).toISOString() };
  });
  for (const id of others) out.push({ id, at: new Date(snap.fetchedAt).toISOString() });
  return out;
}

export async function seedRealWeb(ctx: RealSeedCtx, snap: RealSnapshot, cfg: ClientConfig = getClientConfig()): Promise<void> {
  const { sql, ids } = ctx;
  const site = new URL(snap.source).hostname;
  const faqs = realFaqs().map((f) => ({ id: realIds.faq(f.slug), kind: 'faq' as const, slug: f.slug, draft: { title: f.q, category: 'atencion', answer: f.a, order: f.order } }));
  for (const f of faqs) {
    const ok = parseSnapshot('faq', f.draft);
    if (!ok.ok) throw new Error(`contenido real: pregunta ${f.slug}: ${ok.error}`);
  }
  const items = [...snap.items.map((i) => ({ id: i.id, kind: i.kind, slug: i.slug, draft: i.draft, source: i.source })), ...faqs.map((f) => ({ ...f, source: undefined }))];

  // The two pages, composed from what the seed put (the client's skeleton).
  const pages = await sql.query<{ id: string; slug: string; draft: PageDraft }>(
    `select id, slug, draft from public.web_items where kind = 'page' and slug = any ($1::text[]) order by slug`,
    [['gobernador', 'inicio']],
  );
  const composed = pages.map((pg) => ({ id: pg.id, slug: pg.slug, draft: pg.slug === 'inicio' ? composeHome(pg.draft, snap) : composeGovernor(pg.draft, snap, cfg) }));
  for (const c of composed) {
    const ok = parseSnapshot('page', c.draft);
    if (!ok.ok) throw new Error(`contenido real: página ${c.slug}: ${ok.error}`);
  }

  // The editor: the library's files, the drafts, the pages.
  await asPerson(sql, ids.webEditor, async () => {
    if (snap.media.length) {
      await sql.query(
        `insert into public.web_media (id, storage_key, kind, mime, bytes, width, height, alt, caption, title)
         select x.id, x.key, x.kind, x.mime, x.bytes, x.width, x.height, coalesce(x.alt, ''), coalesce(x.caption, ''), coalesce(x.title, '')
           from jsonb_to_recordset($1::text::jsonb) as x(id uuid, key text, kind text, mime text, bytes bigint, width int, height int, alt text, caption text, title text)`,
        [JSON.stringify(snap.media)],
      );
    }
    for (const it of items) {
      if (it.source) await sql.query(`select set_config('app.version_note', $1, true)`, ['Traído de la web oficial']);
      await sql.query(`insert into public.web_items (id, kind, slug, status, draft) values ($1, $2, $3, 'draft', $4::text::jsonb)`, [
        it.id, it.kind, it.slug, JSON.stringify(it.draft),
      ]);
    }
    for (const c of composed) await sql.query(`update public.web_items set draft = $2::text::jsonb where id = $1`, [c.id, JSON.stringify(c.draft)]);
  });

  // The publisher: every item, then every page still unpublished (the client's skeletons, these two included).
  await asPerson(sql, ids.webPublisher, async () => {
    for (const it of items) await sql.query(`select public.publish_web_item($1, null)`, [it.id]);
    for (const pg of await sql.query<{ id: string }>(`select id from public.web_items where kind = 'page' and published is null order by slug`)) {
      await sql.query(`select public.publish_web_item($1, null)`, [pg.id]);
    }
  });
  // Their moments, from the snapshot (the system may set them: publish_web_item stamps the server's clock). The pages
  // and the questions: when the build read the official site.
  const pageIds = (await sql.query<{ id: string }>(`select id::text as id from public.web_items where kind = 'page' order by id`)).map((r) => r.id);
  await sql.query(
    `update public.web_items w set published_at = x.at, publish_at = x.at
       from jsonb_to_recordset($1::text::jsonb) as x(id uuid, at timestamptz) where w.id = x.id`,
    [JSON.stringify(publishedMoments(snap, [...faqs.map((f) => f.id), ...pageIds]))],
  );

  // The system: the site's settings (the seed put the config's with «no pisar»), the redirects, where each came from.
  const setting = (key: string, value: unknown) => sql.query(`update public.web_settings set value = $2::text::jsonb where key = $1`, [key, JSON.stringify(value)]);
  const settings = cfg.web.settings as Record<string, unknown>;
  await setting('site.demo_banner', REAL_DEMO_BANNER);
  await setting('site.navigation', ((settings['site.navigation'] as { label: string; path: string }[] | undefined) ?? []).filter((l) => l.path !== '/gestion'));
  const accounts = verifiedAccounts(cfg, snap.accounts);
  await setting('site.social_accounts', accounts.social);
  if (accounts.youtube) await setting('site.youtube_channel', accounts.youtube);

  if (snap.redirects.length) {
    await sql.query(
      `insert into public.web_redirects (from_path, to_path, status_code, source)
       select x.from_path, x.to_path, 301, 'importador' from jsonb_to_recordset($1::text::jsonb) as x(from_path text, to_path text)
       on conflict (from_path) do nothing`,
      [JSON.stringify(snap.redirects.map((r) => ({ from_path: r.from, to_path: r.to })))],
    );
  }
  const imported = snap.items.filter((i) => i.kind === 'news' && i.source);
  if (imported.length) {
    const revs = new Map(
      (await sql.query<{ id: string; rev: number }>(`select id::text as id, rev from public.web_items where id = any ($1::uuid[])`, [imported.map((i) => i.id)])).map((r) => [r.id, r.rev]),
    );
    await sql.query(
      `insert into public.web_import_items (site, source_id, item_id, source_url, source_path, source_published_at, content_hash, item_rev)
       select $1, x.source_id, x.item_id, x.source_url, x.source_path, x.published_at, x.content_hash, x.item_rev
         from jsonb_to_recordset($2::text::jsonb) as x(source_id bigint, item_id uuid, source_url text, source_path text, published_at timestamptz, content_hash text, item_rev int)`,
      [
        site,
        JSON.stringify(
          imported.map((i) => ({
            source_id: Number(i.source!.id), item_id: i.id, source_url: i.source!.url, source_path: i.source!.path,
            published_at: i.source!.publishedAt ?? null, content_hash: hash(i.draft), item_rev: revs.get(i.id) ?? 1,
          })),
        ),
      ],
    );
  }
}
