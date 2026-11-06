import type { Sql } from '../db/core';
import { parseSnapshot, type Snapshot, type WebKind } from './schema';

// What the public website reads (D-96): run inside withAnon(), as the role anon with RLS on. anon sees only the public
// columns of what is published (never a draft, never something scheduled before its time, never something archived),
// the public site settings, the redirects, the active territories and request categories and «lo atendido». Every
// column is named (anon has column privileges, never `select *`) and no function of public is called (anon executes
// none): the search words are made plain here the way the database made the column. Snapshots are checked with the
// kind's schema; one that does not fit is left out, never shown half.

export type FrozenMedia = {
  key: string; kind: 'image' | 'document'; mime: string; bytes: number; width: number | null; height: number | null;
  alt: string; caption: string; credit: string; title: string; focalX: number; focalY: number;
};

export type PublishedItem<K extends WebKind = WebKind> = {
  id: string;
  kind: K;
  slug: string;
  data: Snapshot<K>;
  media: Record<string, FrozenMedia>;
  version: number;
  publishedAt: Date;
  liveSince: Date;
  municipalityId: string | null;
  category: string | null;
  state: string | null;
  date: string | null;
};

type Row = {
  id: string; kind: WebKind; slug: string; published: unknown; published_version: number; published_media: Record<string, FrozenMedia>;
  publish_at: Date; published_at: Date; municipality_id: string | null; category: string | null; state: string | null; display_date: string | null;
};

const COLUMNS = `id, kind, slug, published, published_version, published_media, publish_at, published_at, municipality_id, category, state,
  display_date::text as display_date`;

function toItem<K extends WebKind>(r: Row): PublishedItem<K> | null {
  const parsed = parseSnapshot(r.kind as K, r.published);
  if (!parsed.ok) {
    console.error(`[web] ${r.kind}/${r.slug}: lo publicado no tiene la forma esperada (${parsed.error}); no se muestra.`);
    return null;
  }
  return {
    id: r.id, kind: r.kind as K, slug: r.slug, data: parsed.data, media: r.published_media ?? {}, version: r.published_version,
    publishedAt: r.published_at, liveSince: r.publish_at, municipalityId: r.municipality_id, category: r.category, state: r.state,
    date: r.display_date,
  };
}

/** The same as public.assistant_plain(): accents and ñ out, lower case, only letters and numbers between spaces. */
export function plainSearch(s: string): string {
  const from = 'ÁÉÍÓÚÜÑÀÈÌÒÙÂÊÎÔÛÄËÏÖáéíóúüñàèìòùâêîôûäëïö';
  const to = 'AEIOUUNAEIOUAEIOUAEIOaeiouunaeiouaeiouaeio';
  return [...s]
    .map((c) => (from.includes(c) ? to[from.indexOf(c)] : c))
    .join('')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export type ListFilter = {
  kind: WebKind;
  limit?: number;
  offset?: number;
  municipalityId?: string | null;
  category?: string | null;
  state?: string | null;
  q?: string | null;
  from?: string | null; // display date, YYYY-MM-DD
  to?: string | null;
  order?: 'recent' | 'title';
};

/** A page of published items of a kind, newest first (or by title), and how many there are in all. */
export async function publishedList<K extends WebKind>(sql: Sql, f: ListFilter & { kind: K }): Promise<{ items: PublishedItem<K>[]; total: number }> {
  const where = ['kind = $1'];
  const params: unknown[] = [f.kind];
  const add = (cond: (n: string) => string, v: unknown) => {
    params.push(v);
    where.push(cond(`$${params.length}`));
  };
  if (f.municipalityId) add((n) => `municipality_id = ${n}::uuid`, f.municipalityId);
  if (f.category) add((n) => `category = ${n}`, f.category);
  if (f.state) add((n) => `state = ${n}`, f.state);
  if (f.from) add((n) => `display_date >= ${n}::date`, f.from);
  if (f.to) add((n) => `display_date <= ${n}::date`, f.to);
  for (const word of plainSearch(f.q ?? '').split(' ').filter(Boolean).slice(0, 8)) add((n) => `search like '%' || ${n} || '%'`, word);
  const order = f.order === 'title' ? `published ->> 'title', id` : `display_date desc nulls last, published_at desc, id`;
  const limit = Math.min(Math.max(f.limit ?? 12, 1), 100);
  const offset = Math.max(f.offset ?? 0, 0);
  const rows = await sql.query<Row & { total: number }>(
    `select ${COLUMNS}, count(*) over ()::int as total from public.web_items where ${where.join(' and ')}
      order by ${order} limit ${limit} offset ${offset}`,
    params,
  );
  return { items: rows.map((r) => toItem<K>(r)).filter((x): x is PublishedItem<K> => !!x), total: rows[0]?.total ?? 0 };
}

/** One published item by its address, or null. */
export async function publishedBySlug<K extends WebKind>(sql: Sql, kind: K, slug: string): Promise<PublishedItem<K> | null> {
  const r = await sql.one<Row>(`select ${COLUMNS} from public.web_items where kind = $1 and slug = $2`, [kind, slug]);
  return r ? toItem<K>(r) : null;
}

/** Published items by id (a block's references), in the order asked. */
export async function publishedByIds(sql: Sql, ids: string[]): Promise<PublishedItem[]> {
  if (!ids.length) return [];
  const rows = await sql.query<Row>(`select ${COLUMNS} from public.web_items where id = any ($1::uuid[])`, [ids]);
  const byId = new Map(rows.map((r) => [r.id, toItem(r)]));
  return ids.map((id) => byId.get(id)).filter((x): x is PublishedItem => !!x);
}

/** The public site settings (navigation, footer, verified channels, banner texts…), by key. */
export async function publicSettings(sql: Sql): Promise<Record<string, unknown>> {
  const rows = await sql.query<{ key: string; value: unknown }>(`select key, value from public.web_settings`);
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/** Where an old address goes now (the importer's 301s), or null. Only paths of this site come back. */
export async function redirectFor(sql: Sql, path: string): Promise<{ to: string; status: number } | null> {
  const r = await sql.one<{ to_path: string; status_code: number }>(`select to_path, status_code from public.web_redirects where from_path = $1`, [path]);
  return r && r.to_path.startsWith('/') && !r.to_path.startsWith('//') ? { to: r.to_path, status: r.status_code } : null;
}

export type Territory = { id: string; name: string; slug: string; parishes: { id: string; name: string; slug: string }[] };

/** The 29 municipalities (and their parishes, when the official list is loaded), in the client's order. */
export async function publicTerritories(sql: Sql): Promise<Territory[]> {
  const rows = await sql.query<{ id: string; kind: string; parent_id: string | null; name: string; slug: string }>(
    `select id, kind, parent_id, name, slug from public.territories order by sort, name`,
  );
  const munis = rows.filter((r) => r.kind === 'municipality').map((m) => ({ id: m.id, name: m.name, slug: m.slug, parishes: [] as Territory['parishes'] }));
  const byId = new Map(munis.map((m) => [m.id, m]));
  for (const p of rows.filter((r) => r.kind === 'parish')) byId.get(p.parent_id ?? '')?.parishes.push({ id: p.id, name: p.name, slug: p.slug });
  return munis;
}

export type PublicCategory = { id: string; slug: string; name: string; description: string };

export async function publicRequestCategories(sql: Sql): Promise<PublicCategory[]> {
  return sql.query<PublicCategory>(`select id, slug, name, description from public.request_categories order by sort, name`);
}

export type Attended = { id: string; type: string; categoryId: string | null; municipalityId: string | null; summary: string; displayName: string | null; resolvedOn: string | null; publishedAt: Date };

/** «Lo atendido»: what the coordinator published of resolved cases, newest first. No data of any person. */
export async function publicAttended(sql: Sql, limit = 12): Promise<Attended[]> {
  const rows = await sql.query<{ id: string; type: string; category_id: string | null; municipality_id: string | null; public_summary: string; display_name: string | null; resolved_on: string | null; published_at: Date }>(
    `select id, type, category_id, municipality_id, public_summary, display_name, resolved_on::text as resolved_on, published_at
       from public.attended_publications order by published_at desc, id limit $1`,
    [Math.min(Math.max(limit, 1), 100)],
  );
  return rows.map((r) => ({
    id: r.id, type: r.type, categoryId: r.category_id, municipalityId: r.municipality_id, summary: r.public_summary,
    displayName: r.display_name, resolvedOn: r.resolved_on, publishedAt: r.published_at,
  }));
}
