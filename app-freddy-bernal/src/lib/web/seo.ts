import type { Metadata, MetadataRoute } from 'next';
import { CRAWL_DISALLOWED, NEVER_INDEXED } from './routes';
import type { Site } from './site-settings';

// Search engines and social networks (design §2, docs/diagnostico.md problems 4 and 5): unique titles that name the
// person once (the old site repeated it twice), descriptions, canonical links on SITE_URL, Open Graph and Twitter cards,
// and the structured data that tells Google who the governor is (Person + GovernmentOrganization, NewsArticle on news).
// sameAs carries ONLY verified accounts (site-settings.ts decides). Pure: the pages and robots.ts use it, tests too.

const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** «<Nombre>, gobernador del estado …»: the home's title and the site's name for search engines. */
export function siteTitle(site: Pick<Site, 'name' | 'title'>): string {
  const t = site.title.trim();
  return t ? `${site.name}, ${t.charAt(0).toLowerCase()}${t.slice(1)}` : site.name;
}

/** A page's title as browsers and search engines show it: the page's own words and the name once. A title that already
 * names the person stays as it is. */
export function pageTitle(title: string, site: Pick<Site, 'name'>): string {
  const t = title.replace(/\s+/g, ' ').trim();
  if (!t) return site.name;
  return fold(t).includes(fold(site.name)) ? t : `${t} · ${site.name}`;
}

/** Text in one line, cut at a word boundary to `max` characters, with an ellipsis. */
export function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const at = cut.lastIndexOf(' ');
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,;:.]+$/, '')}…`;
}

/** The first text given, in one line, at most 160 characters (a search result's description). */
export function describe(...candidates: (string | null | undefined)[]): string {
  for (const c of candidates) if (c && c.trim()) return clip(c, 160);
  return '';
}

/** The description of a page that has none of its own. The test version never calls itself the official site. */
export function defaultDescription(site: Pick<Site, 'name' | 'title' | 'demo'>): string {
  return site.demo ? `${siteTitle(site)}. Noticias de la gestión y atención ciudadana.` : `Sitio oficial de ${siteTitle(site)}. Noticias de la gestión y atención ciudadana.`;
}

export type OgImage = { url: string; width?: number; height?: number; alt?: string };

/** The generated default image (src/app/(web)/opengraph-image.tsx), for pages without a photo of their own. */
export const DEFAULT_OG_IMAGE = { url: '/opengraph-image', width: 1200, height: 630 } as const;

/** robots for a page: indexed only when the site is (SITE_INDEXABLE=true) and the page does not say otherwise. */
export function robotsMeta(index: boolean): NonNullable<Metadata['robots']> {
  return index ? { index: true, follow: true } : { index: false, follow: false };
}

export type PageMetaInput = {
  /** The page's own words (its SEO title or its title). */
  title: string;
  /** Used as it is (the home): no name added. */
  absolute?: boolean;
  description?: string | null;
  /** The canonical address, from the site's root («/», «/actualidad/una-nota», «/actualidad?pagina=2»). */
  path: string;
  /** The item's photo; without one, the generated default. */
  image?: OgImage | null;
  type?: 'website' | 'article';
  publishedTime?: string;
  modifiedTime?: string;
  section?: string;
  noindex?: boolean;
};

/** The metadata of a public page: title, description, canonical, robots, Open Graph and Twitter. */
export function pageMetadata(m: PageMetaInput, site: Site): Metadata {
  const title = m.absolute ? clip(m.title, 90) : pageTitle(m.title, site);
  const desc = describe(m.description, defaultDescription(site));
  const image: OgImage = m.image ?? { ...DEFAULT_OG_IMAGE, alt: site.wordmark };
  const common = { url: m.path, siteName: siteTitle(site), locale: 'es_VE', title, description: desc, images: [image] };
  return {
    title: { absolute: title },
    description: desc,
    alternates: { canonical: m.path },
    robots: robotsMeta(site.indexable && !m.noindex),
    openGraph:
      m.type === 'article'
        ? { ...common, type: 'article', publishedTime: m.publishedTime, modifiedTime: m.modifiedTime, section: m.section }
        : { ...common, type: 'website' },
    twitter: { card: 'summary_large_image', title, description: desc, images: [image.url] },
  };
}

/** robots.txt: nothing is crawled until the site is indexable (D-95); the team's screens, the private lookup and the
 * API never are. */
export function robotsFile(opts: { indexable: boolean; baseUrl: string }): MetadataRoute.Robots {
  if (!opts.indexable) return { rules: [{ userAgent: '*', disallow: ['/', ...NEVER_INDEXED] }] };
  return { rules: [{ userAgent: '*', allow: '/', disallow: [...CRAWL_DISALLOWED] }], sitemap: `${opts.baseUrl}/sitemap.xml` };
}

// --- Structured data (JSON-LD) ----------------------------------------------------------------------------------------
export type JsonLd = Record<string, unknown>;

/** The same object without the keys that have no value (an empty sameAs is left out, never sent empty). */
function compact<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0))) as T;
}

const personId = (site: Site) => `${site.baseUrl}/#persona`;
const orgId = (site: Site) => `${site.baseUrl}/#organizacion`;

/** The governor: name, office and organization, and only the VERIFIED accounts as sameAs. */
export function personJsonLd(site: Site): JsonLd {
  return compact({
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': personId(site),
    name: site.person.name,
    jobTitle: site.person.jobTitle,
    worksFor: { '@type': 'GovernmentOrganization', '@id': orgId(site), name: site.organization.name },
    url: `${site.baseUrl}/gobernador`,
    sameAs: site.sameAs,
  });
}

/** The government organization (its portal only when verified). */
export function organizationJsonLd(site: Site): JsonLd {
  return compact({
    '@context': 'https://schema.org',
    '@type': 'GovernmentOrganization',
    '@id': orgId(site),
    name: site.organization.name,
    url: site.portal?.verified ? site.portal.url : undefined,
    areaServed: { '@type': 'AdministrativeArea', name: site.organization.areaServed },
    address: { '@type': 'PostalAddress', addressRegion: site.organization.areaServed, addressCountry: site.organization.country },
  });
}

/** The website itself, with its news search. */
export function websiteJsonLd(site: Site): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${site.baseUrl}/#sitio`,
    url: `${site.baseUrl}/`,
    name: siteTitle(site),
    inLanguage: 'es-VE',
    about: { '@id': personId(site) },
    publisher: { '@id': personId(site) },
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${site.baseUrl}/actualidad?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };
}

export type ArticleInput = {
  url: string;
  title: string;
  description?: string;
  datePublished: string;
  dateModified?: string;
  author?: string;
  images?: string[];
  section?: string;
};

/** A news item. The author is the newsroom that signs it, or the governor's office (the organization) when none: never
 * the governor himself, whose name would then sign other people's columns and other outlets' notes. */
export function newsArticleJsonLd(a: ArticleInput, site: Site): JsonLd {
  return compact({
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    mainEntityOfPage: { '@type': 'WebPage', '@id': a.url },
    url: a.url,
    headline: clip(a.title, 110),
    description: a.description || undefined,
    datePublished: a.datePublished,
    dateModified: a.dateModified ?? a.datePublished,
    author: a.author ? { '@type': 'Organization', name: a.author } : { '@type': 'GovernmentOrganization', '@id': orgId(site), name: site.organization.name },
    publisher: { '@type': 'Person', '@id': personId(site), name: site.person.name },
    image: a.images,
    articleSection: a.section,
    inLanguage: 'es-VE',
  });
}

/** JSON for a <script type="application/ld+json">: «<», «>», «&» and the line separators as \u escapes, so no text of
 * the content can close the script or open another tag. */
export function jsonLdHtml(data: unknown): string {
  return JSON.stringify(data).replace(/[<>&\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}
