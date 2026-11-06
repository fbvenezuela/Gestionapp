// One post of the old site (WordPress REST API) → what the new site keeps of it: a news DRAFT (never published), its
// address, its dates, its type and topics, and the old addresses that must keep working (web_redirects). Pure: the
// importer (run.ts) adds the photos and writes it.
//
//   * Title, the publication day (in the Táchira), the type (our four: noticia, comunicado, artículo, entrevista) and the
//     old categories as topics (Táchira, Salud, …): src/lib/web/schema.ts.
//   * The author only when the old site shows it in public (Yoast's «Escrito por»: the users list of the API is closed).
//   * The excerpt only when someone wrote one (WordPress makes one from the first words when nobody did: that one would
//     repeat the first paragraph); the description for search engines from Yoast's, or from the first paragraph.
//   * The body (convert.ts), without a first heading that only repeats the title (many old posts start like that).
//   * The address: the old one when it fits (lower case, numbers and dashes, up to 120); one made from the title when
//     the old one was only a number (15 posts) or empty.
import type { TextNode } from '../../src/lib/web/blocks';
import { NEWS_CATEGORIES, slugFromTitle, type Snapshot } from '../../src/lib/web/schema';
import { normalizeOldPath } from '../../src/lib/web/redirects';
import { dayIn } from '../../src/lib/web/cms/drafts';
import { bodyText, convertArticle, plainFromHtml, type FoundImage, type ReviewFlag } from './convert';
import { scrubText, addPii, type PiiCounts } from './pii';

export type WpRendered = { rendered: string; protected?: boolean };
export type WpPost = {
  id: number;
  date: string;
  date_gmt: string;
  modified: string;
  modified_gmt: string;
  slug: string;
  status: string;
  type: string;
  link: string;
  title: WpRendered;
  content: WpRendered;
  excerpt: WpRendered;
  author?: number;
  featured_media: number;
  categories: number[];
  tags: number[];
  format?: string;
  yoast_head_json?: { author?: string; description?: string } | null;
};
export type WpTerm = { id: number; name: string; slug: string; link: string; count?: number };

export type NewsCategory = keyof typeof NEWS_CATEGORIES;

/** The old site's categories (docs/diagnostico.md §1) → our type, a topic, and where their old page goes now. */
export const CATEGORY_MAP: Record<string, { category: NewsCategory; topic?: string; page: string }> = {
  tachira: { category: 'noticia', topic: 'Táchira', page: '/actualidad?q=tachira' },
  internacionales: { category: 'noticia', topic: 'Internacionales', page: '/actualidad?q=internacionales' },
  nacionales: { category: 'noticia', topic: 'Nacionales', page: '/actualidad?q=nacionales' },
  seguridad: { category: 'noticia', topic: 'Seguridad', page: '/actualidad?q=seguridad' },
  salud: { category: 'noticia', topic: 'Salud', page: '/actualidad?q=salud' },
  deportes: { category: 'noticia', topic: 'Deportes', page: '/actualidad?q=deportes' },
  noticias: { category: 'noticia', page: '/actualidad?categoria=noticia' },
  opinion: { category: 'articulo', topic: 'Opinión', page: '/actualidad?categoria=articulo' },
  informativo: { category: 'comunicado', page: '/actualidad?categoria=comunicado' },
  // The 2014 biography: a starting point for /gobernador, which replaces it (docs/diagnostico.md §5).
  biografia: { category: 'articulo', page: '/gobernador' },
  'sin-categoria': { category: 'noticia', page: '/actualidad' },
};
// When a post has several categories, the type of the strongest one.
const TYPE_RANK: Record<NewsCategory, number> = { noticia: 0, comunicado: 1, entrevista: 2, articulo: 3 };
// Paths under /actualidad that a route of this site already answers.
const RESERVED_NEWS_SLUGS = new Set(['semanario']);
// Posts whose old address goes somewhere else than their news page.
const SPECIAL_TARGETS: Record<string, string> = { biografia: '/gobernador' };

export type PostPlan = {
  sourceId: number;
  /** The old address, https. */
  sourceUrl: string;
  /** The old path as the redirects keep it (no final slash). */
  oldPath: string | null;
  /** /YYYY/MM of the old address (its month archive), when it has that shape. */
  monthPath: string | null;
  slug: string;
  /** Where the old address goes now. */
  target: string | null;
  title: string;
  date: string;
  publishedAt: string | null;
  modifiedAt: string | null;
  category: NewsCategory;
  topics: string[];
  author?: string;
  excerpt?: string;
  seoDescription?: string;
  body: TextNode[];
  youtubeId: string | null;
  images: FoundImage[];
  featuredMediaId: number | null;
  categoryIds: number[];
  tagIds: number[];
  flags: Set<ReviewFlag>;
  pii: PiiCounts;
  /** Why it cannot be imported at all (a protected post, not a post…), or null. */
  refused: string | null;
};

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();
const norm = (s: string) => collapse(s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9ñ]+/g, ' '));

/** Cut at a word, at most `max` characters with the «…». */
export function cutWords(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const at = cut.lastIndexOf(' ');
  return `${(at > max * 0.5 ? cut.slice(0, at) : cut).replace(/[\s,.;:–—-]+$/, '')}…`;
}

/** WordPress «2026-11-06T12:42:24» (GMT, without the zone) → an ISO time, or null. */
export function gmtIso(s: string | undefined): string | null {
  if (!s || s.startsWith('0000')) return null;
  const t = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/** The old site's path of an address of its own (no final slash), or null. */
export function oldPathOf(link: string, ownHosts: readonly string[]): string | null {
  try {
    const u = new URL(link);
    if (!ownHosts.includes(u.hostname.toLowerCase())) return null;
    return normalizeOldPath(u.pathname);
  } catch {
    return null;
  }
}

/** Our address for an old one: lower case, numbers and dashes, at most 120; from the title when the old one is a
 * number or empty (it says which). */
export function ourSlug(wpSlug: string, title: string): { slug: string; changed: boolean; numeric: boolean } {
  let s = wpSlug ?? '';
  try {
    s = decodeURIComponent(s);
  } catch {
    // keep it as written
  }
  s = s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const numeric = !s || /^\d+$/.test(s);
  if (numeric) s = slugFromTitle(title || 'nota');
  if (s.length > 120) {
    const cut = s.slice(0, 120);
    s = cut.slice(0, cut.lastIndexOf('-') > 60 ? cut.lastIndexOf('-') : 120).replace(/-+$/, '');
  }
  if (RESERVED_NEWS_SLUGS.has(s)) s = `${s}-nota`;
  return { slug: s || 'nota', changed: !numeric && s !== wpSlug, numeric };
}

/** The address with the post's id at the end, for when another content already has it. */
export function slugWithId(slug: string, id: number): string {
  const tail = `-${id}`;
  return `${slug.slice(0, 120 - tail.length).replace(/-+$/, '')}${tail}`;
}

const AUTO_EXCERPT_END = /\s*(?:\[(?:…|\.\.\.|&hellip;)\]|…|\.\.\.|leer m[aá]s|continue reading|seguir leyendo)\s*$/i;

/** One post → its plan. `categories` are the old site's (by id). */
export function planPost(post: WpPost, ctx: { categories: Map<number, WpTerm>; ownHosts: readonly string[]; tz: string }): PostPlan {
  const flags = new Set<ReviewFlag>();
  const pii: PiiCounts = { emails: 0, phones: 0, ids: 0 };
  const scrub = (s: string) => {
    const r = scrubText(s);
    addPii(pii, r.found);
    return r.text;
  };
  let sourceUrl = post.link;
  try {
    const u = new URL(post.link);
    if (ctx.ownHosts.includes(u.hostname.toLowerCase())) u.protocol = 'https:';
    sourceUrl = u.toString();
  } catch {
    // keep it as given
  }
  const oldPath = oldPathOf(post.link, ctx.ownHosts);
  const month = oldPath ? /^\/(\d{4})\/(\d{2})\//.exec(`${oldPath}/`) : null;
  const publishedAt = gmtIso(post.date_gmt) ?? gmtIso(post.date);
  const modifiedAt = gmtIso(post.modified_gmt) ?? gmtIso(post.modified);
  const date = publishedAt ? dayIn(ctx.tz, new Date(publishedAt)) : (post.date ?? '').slice(0, 10);

  // Type and topics from the categories.
  let category: NewsCategory = 'noticia';
  const topics: string[] = [];
  let special: string | null = null;
  for (const id of post.categories ?? []) {
    const term = ctx.categories.get(id);
    if (!term) continue;
    const known = CATEGORY_MAP[term.slug];
    const mapped = known ?? { category: 'noticia' as NewsCategory, topic: collapse(plainFromHtml(term.name)).slice(0, 40) || undefined };
    if (TYPE_RANK[mapped.category] > TYPE_RANK[category]) category = mapped.category;
    if (mapped.topic && !topics.includes(mapped.topic) && topics.length < 12) topics.push(mapped.topic);
    if (SPECIAL_TARGETS[term.slug]) special = SPECIAL_TARGETS[term.slug];
  }

  // Title.
  let title = scrub(collapse(plainFromHtml(post.title?.rendered ?? '')));
  if (!title) {
    title = `Nota del ${date.split('-').reverse().join('/')}`;
    flags.add('title_missing');
  }
  if (title.length > 160) {
    title = cutWords(title, 160);
    flags.add('title_truncated');
  }

  const conv = convertArticle(post.content?.rendered ?? '', { baseUrl: sourceUrl, ownHosts: ctx.ownHosts });
  conv.flags.forEach((f) => flags.add(f));
  addPii(pii, conv.pii);
  // A heading that only repeats the title, at the top.
  const body = conv.body.filter((n, i) => !(i < 3 && n.type === 'heading' && norm(n.text) === norm(title)));
  const text = bodyText(body);

  // The excerpt someone wrote (not WordPress's first words).
  let excerpt: string | undefined;
  const rawExcerpt = collapse(plainFromHtml(post.excerpt?.rendered ?? '').replace(AUTO_EXCERPT_END, ''));
  if (rawExcerpt && !norm(text).startsWith(norm(rawExcerpt).slice(0, 120))) excerpt = cutWords(scrub(rawExcerpt), 400);

  // For search engines: Yoast's description, or the first words of the text.
  const yoast = collapse(plainFromHtml(post.yoast_head_json?.description ?? ''));
  const descriptionSource = yoast || text;
  const seoDescription = descriptionSource ? cutWords(scrub(descriptionSource), 160) : undefined;

  // The author, only when public; never an email or an account's login.
  const rawAuthor = collapse(plainFromHtml(post.yoast_head_json?.author ?? ''));
  const author = rawAuthor && !/@/.test(rawAuthor) && !/^admin(istrador)?$/i.test(rawAuthor) ? scrub(rawAuthor).slice(0, 120) : undefined;

  const s = ourSlug(post.slug, title);
  if (s.numeric) flags.add('numeric_slug');
  else if (s.changed) flags.add('slug_changed');

  if (pii.emails) flags.add('email_removed');
  if (pii.phones) flags.add('phone_removed');
  if (pii.ids) flags.add('id_removed');

  let refused: string | null = null;
  if (post.type && post.type !== 'post') refused = 'no es un artículo';
  else if (post.status && post.status !== 'publish') refused = 'no está publicado en la web vieja';
  else if (post.content?.protected) refused = 'tiene contraseña en la web vieja';

  return {
    sourceId: post.id,
    sourceUrl,
    oldPath,
    monthPath: month ? `/${month[1]}/${month[2]}` : null,
    slug: s.slug,
    target: special ?? `/actualidad/${s.slug}`,
    title,
    date,
    publishedAt,
    modifiedAt,
    category,
    topics,
    ...(author ? { author } : {}),
    ...(excerpt ? { excerpt } : {}),
    ...(seoDescription ? { seoDescription } : {}),
    body,
    youtubeId: conv.videos[0] ?? null,
    images: conv.images,
    featuredMediaId: post.featured_media > 0 ? post.featured_media : null,
    categoryIds: post.categories ?? [],
    tagIds: post.tags ?? [],
    flags,
    pii,
    refused,
  };
}

/** The news draft the importer writes (exactly the kind's schema, src/lib/web/schema.ts). */
export function draftOf(plan: PostPlan, media: { coverId: string | null; galleryIds: string[] }): Snapshot<'news'> {
  return {
    title: plan.title,
    ...(plan.excerpt ? { excerpt: plan.excerpt } : {}),
    date: plan.date,
    category: plan.category,
    ...(plan.author ? { author: plan.author } : {}),
    municipalityId: null,
    coverId: media.coverId,
    body: plan.body,
    galleryIds: media.galleryIds,
    sources: [],
    topics: plan.topics,
    youtubeId: plan.youtubeId,
    ...(plan.seoDescription ? { seo: { description: plan.seoDescription } } : {}),
  };
}

/** Where the redirect of a post goes: its news page, or the special page (the biography → /gobernador). */
export function postTarget(plan: PostPlan, slug: string): string {
  return plan.target && !plan.target.startsWith('/actualidad/') ? plan.target : `/actualidad/${slug}`;
}

/** The new page of an old category: CATEGORY_MAP, or a search with its name. */
export function categoryTarget(term: WpTerm): string {
  return CATEGORY_MAP[term.slug]?.page ?? `/actualidad?q=${encodeURIComponent(collapse(plainFromHtml(term.name)).slice(0, 120))}`;
}

/** An old tag page → a search on /actualidad with the tag's words. */
export function tagTarget(term: WpTerm): string {
  const words = collapse(plainFromHtml(term.name).replace(/[^\p{L}\p{N}\s-]+/gu, ' ')).slice(0, 120);
  return words ? `/actualidad?q=${encodeURIComponent(words)}` : '/actualidad';
}
