import 'server-only';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { withAnon } from '../db';
import {
  publicAttended, publicRequestCategories, publicSettings, publicTerritories, publishedByIds, publishedBySlug, publishedList,
  type Attended, type ListFilter, type PublicCategory, type PublishedItem, type Territory,
} from './public';
import { publicRequestStats, type PublicStats } from './participation';
import type { WebKind } from './schema';
import { WEB_REVALIDATE, WEB_REVALIDATE_SLOW, WEB_TAG } from './tags';

// What the public website reads, always as anon (D-96), kept in Next's data cache with tags (tags.ts): a page asks here
// and the database is read again only after WEB_REVALIDATE seconds or when revalidate.ts says something changed. The
// cache holds plain JSON (dates as ISO text). React's cache() makes each read happen once per request (the layout, the
// page and its metadata ask for the same things); it is keyed by text, so two calls with equal filters share it.
//
// Errors: while `next build` prerenders the pages, a database that cannot be read (for instance, one without the web's
// migrations yet) gives empty sections and a warning, so the build of the whole app does not fail; the page is read
// again on its first revalidation. At runtime the error goes up: the error page shows, and a page that was already
// generated keeps being served as it was (ISR never replaces a good page with a failed one).

export type WebItem<K extends WebKind = WebKind> = Omit<PublishedItem<K>, 'publishedAt' | 'liveSince'> & { publishedAt: string; liveSince: string };

const iso = (d: Date | string) => new Date(d).toISOString();
const plain = <K extends WebKind>(i: PublishedItem<K>): WebItem<K> => ({ ...i, publishedAt: iso(i.publishedAt), liveSince: iso(i.liveSince) });

export function isBuilding(): boolean {
  return process.env.NEXT_PHASE === 'phase-production-build';
}

async function read<T>(what: string, fn: () => Promise<T>, empty: T): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (!isBuilding()) throw e;
    console.warn(`[web] ${what}: sin datos al construir (${(e as Error).message}); se lee de nuevo al revalidar.`);
    return empty;
  }
}

/** The same filter always gives the same text (keys in order, empty ones out): the key of both caches. */
export function filterKey(f: ListFilter): string {
  const entries = Object.entries(f)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(Object.fromEntries(entries));
}

const listByKey = cache((key: string): Promise<{ items: WebItem[]; total: number }> => {
  const f = JSON.parse(key) as ListFilter;
  return read(
    `lista ${f.kind}`,
    unstable_cache(
      async () => {
        const r = await withAnon((sql) => publishedList(sql, f));
        return { items: r.items.map(plain), total: r.total };
      },
      ['web-list-v1', key],
      { tags: [WEB_TAG.all, WEB_TAG.kind(f.kind)], revalidate: WEB_REVALIDATE },
    ),
    { items: [], total: 0 },
  );
});

/** A page of published items of a kind (filters, search, order) and how many there are. */
export function listItems<K extends WebKind>(f: ListFilter & { kind: K }): Promise<{ items: WebItem<K>[]; total: number }> {
  return listByKey(filterKey(f)) as Promise<{ items: WebItem<K>[]; total: number }>;
}

const itemBySlug = cache((kind: WebKind, slug: string): Promise<WebItem | null> =>
  read(
    `${kind}/${slug}`,
    unstable_cache(
      async () => {
        const r = await withAnon((sql) => publishedBySlug(sql, kind, slug));
        return r ? plain(r) : null;
      },
      ['web-item-v1', kind, slug],
      { tags: [WEB_TAG.all, WEB_TAG.kind(kind)], revalidate: WEB_REVALIDATE },
    ),
    null,
  ),
);

/** One published item by its address, or null. */
export function getItem<K extends WebKind>(kind: K, slug: string): Promise<WebItem<K> | null> {
  return itemBySlug(kind, slug) as Promise<WebItem<K> | null>;
}

const itemsByKey = cache((key: string): Promise<WebItem[]> =>
  read(
    'referencias',
    unstable_cache(async () => (await withAnon((sql) => publishedByIds(sql, key.split(',')))).map(plain), ['web-ids-v1', key], {
      tags: [WEB_TAG.all],
      revalidate: WEB_REVALIDATE,
    }),
    [],
  ),
);

/** Published items by id (a block's references), in the order given; the missing ones are left out. */
export function itemsByIds(ids: readonly string[]): Promise<WebItem[]> {
  return ids.length ? itemsByKey(ids.join(',')) : Promise.resolve([]);
}

/** The public rows of web_settings, by key (site.ts turns them into what the pages show). */
export const rawSettings = cache((): Promise<Record<string, unknown>> =>
  read(
    'ajustes',
    unstable_cache(() => withAnon((sql) => publicSettings(sql)), ['web-settings-v1'], { tags: [WEB_TAG.settings], revalidate: WEB_REVALIDATE_SLOW }),
    {},
  ),
);

export const getTerritories = cache((): Promise<Territory[]> =>
  read(
    'municipios',
    unstable_cache(() => withAnon((sql) => publicTerritories(sql)), ['web-territories-v1'], { tags: [WEB_TAG.catalogs], revalidate: WEB_REVALIDATE_SLOW }),
    [],
  ),
);

export const getRequestCategories = cache((): Promise<PublicCategory[]> =>
  read(
    'categorías',
    unstable_cache(() => withAnon((sql) => publicRequestCategories(sql)), ['web-categories-v1'], {
      tags: [WEB_TAG.catalogs],
      revalidate: WEB_REVALIDATE_SLOW,
    }),
    [],
  ),
);

export type AttendedItem = Omit<Attended, 'publishedAt'> & { publishedAt: string };

/** «Lo atendido» (no data of any person: the database publishes only the anonymized summary). */
export const getAttended = cache((limit: number): Promise<AttendedItem[]> =>
  read(
    'lo atendido',
    unstable_cache(
      async () => (await withAnon((sql) => publicAttended(sql, limit))).map((a) => ({ ...a, publishedAt: iso(a.publishedAt) })),
      ['web-attended-v1', String(limit)],
      { tags: [WEB_TAG.attended], revalidate: WEB_REVALIDATE },
    ),
    [],
  ),
);

/** The public figures of the attention desk for a period (YYYY-MM-DD or null = from the start / until today). */
export const getStats = cache((from: string | null, to: string | null): Promise<PublicStats | null> =>
  read(
    'cifras',
    unstable_cache(() => withAnon((sql) => publicRequestStats(sql, from, to)), ['web-stats-v1', from ?? '', to ?? ''], {
      tags: [WEB_TAG.stats],
      revalidate: WEB_REVALIDATE_SLOW,
    }),
    null,
  ),
);
