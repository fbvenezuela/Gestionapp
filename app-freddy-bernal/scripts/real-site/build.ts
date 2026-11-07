// The snapshot of the official site (src/lib/web/real-site.ts RealSnapshot), put together from what the sources give
// (sources.ts reads the network; the tests give invented ones): the newest news and opinion pieces with their photos,
// the biography and the posts about taking office, the hero's and the governor's photos, the program's episodes from
// YouTube and the weekly from the home. Every id comes from a name and every file key from its bytes, arrays are
// sorted: the same content gives the same file. A piece that cannot be read is left out and said in report.skipped;
// WordPress itself not answering stops the whole run (the build then keeps the last good snapshot). Pure but for the
// sources it is given.
import { dayIn } from '../../src/lib/web/cms/drafts';
import { fmtDay } from '../../src/lib/web/format';
import { slugFromTitle } from '../../src/lib/web/schema';
import type { TextNode } from '../../src/lib/web/blocks';
import {
  REAL_FILE_MAX_BYTES, mediaKey, parseRealSnapshot, realIds, realItem, realMedia, sha256Of, type RealItem, type RealMedia, type RealSnapshot,
} from '../../src/lib/web/real-site';
import { plainFromHtml } from '../web-import/convert';
import { findAll, parseHtml } from '../web-import/html';
import { oldPathOf, postTarget, slugWithId, type PostPlan, type WpPost, type WpTerm } from '../web-import/mapping';
import { wantFromImage, wantFromWp, type FetchedPhoto, type PhotoWant, type WpMedia } from '../web-import/media';
import { scrubText } from '../web-import/pii';
import { altFor, biographyOf, captionFor, newsDraft, officeLeadOf, photoWants, planNews, type PlanContext } from './news';
import { findSemanario, meaningfulName, pdfCreationDay, pdfPageCount, semanarioTitle } from './semanario';
import { siteOf, type RealSiteConfig } from './settings';
import { cut, hasRemovalMark } from './text';
import { VIDEO_SOURCE_LABEL, episodeSlugs, latestEpisodes, linkedAccountKeys, verifiedKeys, type VideoList, type VideoSource } from './youtube';

export type WpRoot = { name?: string; description?: string };

/** Where the content comes from (sources.ts: the network, politely; the tests: invented data). */
export interface Sources {
  root(): Promise<WpRoot | null>;
  categories(): Promise<WpTerm[]>;
  latestPosts(q: { perPage: number; categories?: number[]; excludeCategories?: number[] }): Promise<WpPost[]>;
  postsById(ids: number[]): Promise<WpPost[]>;
  media(ids: number[]): Promise<Map<number, WpMedia>>;
  homeHtml(): Promise<string | null>;
  /** A photo of the official site (downloaded and checked like an upload of the team). */
  photo(want: PhotoWant): Promise<FetchedPhoto>;
  /** The program's videos from the governor's channel (sources.ts: its list of long videos, its own feed, the official
   * API with a key, in that order), and what each source that did not serve said. */
  videos(programName: string): Promise<{ list: VideoList | null; misses: { source: VideoSource; reason: string }[] }>;
  thumbnail(videoId: string): Promise<FetchedPhoto>;
  drivePdf(id: string): Promise<{ bytes: Uint8Array; fileName: string | null } | null>;
  drivePageTitle(id: string): Promise<string | null>;
  /** Throws when the run took too long (the build must not hang on a slow site). */
  checkTime(): void;
  requests(): number;
}

export type BuildInput = {
  config: RealSiteConfig;
  /** The program's name as its titles say it (brand.programName without its version). */
  programName: string;
  tz: string;
  /** The configured official accounts (site.social_accounts and site.youtube_channel). */
  accounts: { url: string }[];
  /** When the site's API gives no name or tagline (the client's brand). */
  fallbackIdentity: { name: string; tagline: string };
  now: Date;
  log?: (line: string) => void;
};

export type BuildResult = {
  snapshot: RealSnapshot;
  /** The library's files by key (photos already cleaned of their metadata). */
  files: Map<string, Uint8Array>;
  /** Optional sources that did not answer (their part can come from the last good snapshot). */
  failed: ('youtube' | 'semanario')[];
};

const MAX_SIDE = 1600;
const GALLERY = 2;
const KIND_ORDER: Record<string, number> = { news: 0, episode: 1, document: 2 };

const clean = (s: string | undefined) => plainFromHtml(s ?? '').replace(/\s+/g, ' ').trim();

/** The site's name and tagline as WordPress keeps them («Name  Name - Tagline» in the name, an empty description). */
export function identityFrom(root: WpRoot | null, fallback: { name: string; tagline: string }): { name: string; tagline: string } {
  let name = clean(root?.name);
  let tagline = clean(root?.description);
  if (!tagline) {
    const m = /^(.+?)\s+[-–—|]\s+(.+)$/.exec(name);
    if (m) {
      const words = m[1].split(/\s+/);
      const half = words.length / 2;
      const repeated = words.length % 2 === 0 && words.slice(0, half).join(' ').toLowerCase() === words.slice(half).join(' ').toLowerCase();
      name = repeated ? words.slice(0, half).join(' ') : m[1];
      tagline = `${name} - ${m[2]}`;
    }
  }
  return { name: cut(name || fallback.name, 120), tagline: cut(tagline || fallback.tagline, 200) };
}

/** The addresses a page links (its <a href>), for the accounts the official site itself names. */
export function linksOf(html: string): string[] {
  return findAll(parseHtml(html), (el) => el.tag === 'a')
    .map((a) => (a.attrs.href ?? '').trim())
    .filter((h) => /^https?:\/\//i.test(h));
}

/** The weekly's title when its file says nothing: the edition's day («Edición del 15 de marzo de 2026»), so two
 * editions never read the same. */
export function editionTitle(day: string): string {
  return `Edición del ${fmtDay(day)}`;
}

export async function buildSnapshot(input: BuildInput, src: Sources): Promise<BuildResult> {
  const { config, tz } = input;
  const log = input.log ?? (() => {});
  const site = siteOf(config);
  const skipped: { ref: string; reason: string }[] = [];
  /** What was left out and why, cut to what the snapshot keeps (a long photo address never spoils the whole run). */
  const skip = (ref: string, reason: string) => skipped.push({ ref: cut(ref, 300), reason: cut(reason, 300) });
  const failed: BuildResult['failed'] = [];
  const media = new Map<string, RealMedia>();
  const files = new Map<string, Uint8Array>();
  const items: RealItem[] = [];
  const redirects = new Map<string, string>();
  const t0 = Date.now();

  /** A downloaded file into the library (once per content), or null when it does not pass its checks. */
  const addFile = (f: { bytes: Uint8Array; sha256: string; ext: string; mime: string; kind: 'image' | 'document'; width?: number; height?: number; alt?: string; caption?: string; title?: string }, ref: string): RealMedia | null => {
    const id = realIds.media(f.sha256);
    const have = media.get(id);
    if (have) return have;
    const row = {
      id, key: mediaKey(f.sha256, f.ext), kind: f.kind, mime: f.mime, bytes: f.bytes.length, sha256: f.sha256,
      ...(f.width ? { width: f.width, height: f.height } : {}),
      ...(f.alt !== undefined ? { alt: f.alt } : {}), ...(f.caption ? { caption: f.caption } : {}), ...(f.title ? { title: f.title } : {}),
    };
    // What a server of the demo serves from a function (Vercel stops a function's answer at 4.5 MB).
    if (row.bytes > REAL_FILE_MAX_BYTES) {
      skip(ref, `el archivo pasa de ${Math.round(REAL_FILE_MAX_BYTES / (1024 * 1024))} MB`);
      return null;
    }
    const ok = realMedia.safeParse(row);
    if (!ok.success) {
      skip(ref, ok.error.issues[0]?.message ?? 'archivo no válido');
      return null;
    }
    media.set(id, ok.data);
    files.set(ok.data.key, f.bytes);
    return ok.data;
  };
  const addPhoto = (got: FetchedPhoto, alt: string, caption: string, ref: string): RealMedia | null => {
    if (!got.ok) {
      skip(ref, `foto: ${got.reason}`);
      return null;
    }
    return addFile({ bytes: got.bytes, sha256: got.sha256, ext: got.ext, mime: got.mime, kind: 'image', width: got.width, height: got.height, alt, caption }, ref);
  };
  // Each item checked as the whole snapshot will check it (its draft, its size, no removal mark): one that does not fit
  // is left out and said, never a reason to lose the whole run.
  const addItem = (it: RealItem, ref: string): boolean => {
    const r = realItem.safeParse(it);
    if (!r.success) {
      skip(ref, r.error.issues[0]?.message ?? 'no tiene la forma esperada');
      return false;
    }
    items.push(it);
    return true;
  };

  // --- WordPress: who, which categories, the newest posts (the lists may not fail) ----------------------------------
  // The site's name and tagline are a courtesy: without them, the client's own.
  const root = await src.root().catch((e) => {
    skip('/wp-json/', (e as Error).message);
    return null;
  });
  const identity = identityFrom(root, input.fallbackIdentity);
  const categories = await src.categories();
  const bySlug = new Map(categories.map((c) => [c.slug, c.id]));
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const opinionId = bySlug.get('opinion');
  const exclude = ['biografia', 'informativo', 'opinion'].map((s) => bySlug.get(s)).filter((x): x is number => typeof x === 'number');
  const news = config.maxNews ? await src.latestPosts({ perPage: config.maxNews, excludeCategories: exclude }) : [];
  const opinion = config.maxOpinion && opinionId ? await src.latestPosts({ perPage: config.maxOpinion, categories: [opinionId] }) : [];
  log(`  WordPress: ${news.length} noticias y ${opinion.length} de opinión`);

  // The biography and the posts about taking office (the governor's page): optional.
  let pagePosts: WpPost[] = [];
  try {
    pagePosts = await src.postsById([config.bioPostId, ...config.officePostIds]);
  } catch (e) {
    skip('biografía', (e as Error).message);
  }

  // The home, for the weekly and for the accounts the official site links (optional). A home that does not answer, or
  // without a weekly that can be read, counts as the weekly failing: the last good one stays (prebuild.ts carryOver).
  let home: string | null = null;
  try {
    home = await src.homeHtml();
    if (home === null) skip('portada de la web oficial', 'no respondió o pasa de 5 MB');
  } catch (e) {
    skip('portada de la web oficial', (e as Error).message);
  }
  const weekly = home ? findSemanario(home, site.origin) : null;
  if (!weekly) failed.push('semanario');
  const homeLinks = home ? linksOf(home) : [];

  // --- The posts, planned; then every photo WordPress knows of them, in one go ----------------------------------------
  const ctx: PlanContext = { categories: catMap, ownHosts: site.ownHosts, tz };
  const planned: { plan: PostPlan; opinion: boolean }[] = [];
  const seenPosts = new Set<number>();
  for (const [list, isOpinion] of [[news, false], [opinion, true]] as const) {
    for (const post of list) {
      if (seenPosts.has(post.id)) continue;
      seenPosts.add(post.id);
      const r = planNews(post, ctx);
      if ('skip' in r) skip(`post ${post.id}`, r.skip);
      else planned.push({ plan: r.plan, opinion: isOpinion });
    }
  }
  const mediaIds = new Set<number>([config.heroMediaId, config.bioMediaId]);
  for (const { plan } of planned) {
    if (plan.featuredMediaId) mediaIds.add(plan.featuredMediaId);
    for (const img of plan.images.slice(0, GALLERY + 2)) if (img.attachmentId) mediaIds.add(img.attachmentId);
  }
  if (weekly?.cover?.attachmentId) mediaIds.add(weekly.cover.attachmentId);
  const wpMedia = await src.media([...mediaIds].sort((a, b) => a - b));

  // --- News and opinion --------------------------------------------------------------------------------------------
  const sourceLabel = site.host;
  const usedSlugs = new Set<string>();
  let newsCount = 0;
  let opinionCount = 0;
  for (const { plan, opinion: isOpinion } of planned) {
    const ref = `post ${plan.sourceId}`;
    const wants = photoWants(plan, wpMedia, site.ownHosts, MAX_SIDE);
    // The post's photo (or the first of its text), then up to two more for its gallery.
    let cover: RealMedia | null = null;
    const gallery: RealMedia[] = [];
    // At most six tries per post: a post with a long gallery of broken photos does not hold the build.
    const ordered = [...wants.filter((w) => w.role === 'cover'), ...wants.filter((w) => w.role === 'inline')].slice(0, 6);
    for (const w of ordered) {
      if (cover && gallery.length >= GALLERY) break;
      src.checkTime();
      const got = await src.photo(w.want);
      const index = cover ? gallery.length : null;
      const m = addPhoto(got, altFor(w.want, plan.title, index), captionFor(w.want), `${ref} · ${w.want.url}`);
      if (!m || m.id === cover?.id || gallery.some((g) => g.id === m.id)) continue;
      if (!cover) cover = m;
      else gallery.push(m);
    }
    const draft = newsDraft(plan, { coverId: cover?.id ?? null, galleryIds: gallery.map((g) => g.id) }, sourceLabel);
    let slug = plan.slug;
    if (usedSlugs.has(slug)) slug = slugWithId(plan.slug, plan.sourceId);
    if (usedSlugs.has(slug)) {
      skip(ref, 'su dirección ya la tiene otra nota');
      continue;
    }
    const sourcePath = plan.oldPath ?? oldPathOf(plan.sourceUrl, site.ownHosts) ?? '/';
    const ok = addItem(
      {
        id: realIds.news(plan.sourceId), kind: 'news', slug, draft: draft as Record<string, unknown>,
        source: { id: String(plan.sourceId), url: plan.sourceUrl, path: sourcePath, ...(plan.publishedAt ? { publishedAt: plan.publishedAt } : {}) },
      },
      ref,
    );
    if (!ok) continue;
    usedSlugs.add(slug);
    const to = postTarget(plan, slug);
    if (plan.oldPath && plan.oldPath !== to) redirects.set(plan.oldPath, to);
    if (isOpinion) opinionCount++;
    else newsCount++;
  }

  // A site that answers with nothing usable would leave the demo empty: that counts as not answering (the build keeps
  // the last good snapshot, or the invented content).
  if (!newsCount && !opinionCount) throw new Error('la web oficial no devolvió ninguna nota que se pueda mostrar');

  // --- The governor's page -------------------------------------------------------------------------------------------
  const bioPost = pagePosts.find((p) => p.id === config.bioPostId) ?? null;
  const bio = bioPost ? biographyOf(bioPost, ctx) : { biography: [] as TextNode[], honors: [] as TextNode[], sourceUrl: '' };
  if (!bioPost) skip(`post ${config.bioPostId}`, 'la biografía no se pudo leer');
  const office: TextNode[] = [];
  const officePosts = config.officePostIds
    .map((id) => pagePosts.find((p) => p.id === id))
    .filter((p): p is WpPost => !!p)
    .sort((a, b) => (a.date_gmt ?? a.date).localeCompare(b.date_gmt ?? b.date));
  for (const p of officePosts) office.push(...officeLeadOf(p, ctx));
  for (const id of config.officePostIds) if (!officePosts.some((p) => p.id === id)) skip(`post ${id}`, 'no se pudo leer');

  const pagePhoto = async (wpId: number, ref: string): Promise<string | null> => {
    const m = wpMedia.get(wpId);
    if (!m) {
      skip(ref, 'la foto no está en la biblioteca de la web oficial');
      return null;
    }
    const want = wantFromWp(m, site.ownHosts, MAX_SIDE);
    src.checkTime();
    return addPhoto(await src.photo(want), altFor(want, identity.name, null), captionFor(want), ref)?.id ?? null;
  };
  const heroMediaId = await pagePhoto(config.heroMediaId, `foto ${config.heroMediaId} (portada)`);
  const bioMediaId = await pagePhoto(config.bioMediaId, `foto ${config.bioMediaId} (gobernador)`);

  // --- YouTube: the program's episodes, and which accounts the channel links ---------------------------------------
  // None of its sources serving counts as YouTube not answering: the episodes and the accounts then come from the last
  // good snapshot (prebuild.ts carryOver). The accounts the official site's own home links count as verified too.
  const fromHome = verifiedKeys(input.accounts, linkedAccountKeys(homeLinks));
  let accounts = { verifiedHandles: fromHome, youtubeOk: false };
  let episodes = 0;
  try {
    const { list, misses } = await src.videos(input.programName);
    const said = misses.map((m) => `${VIDEO_SOURCE_LABEL[m.source]}: ${m.reason}`);
    if (!list) throw new Error(cut(said.join('; ') || 'el canal no respondió', 300));
    for (const line of said) log(`  YouTube, ${line}`);
    if (list.source !== 'playlist') log(`  YouTube: las emisiones salen de ${VIDEO_SOURCE_LABEL[list.source]}`);
    const fromChannel = verifiedKeys(input.accounts, linkedAccountKeys(list.descriptions));
    accounts = { verifiedHandles: [...new Set([...fromHome, ...fromChannel])].sort(), youtubeOk: true };
    const latest = latestEpisodes(list.entries, config.maxEpisodes, input.programName);
    const slugs = episodeSlugs(latest, input.programName);
    for (const e of latest) {
      const ref = `video ${e.videoId}`;
      const title = cut(scrubText(e.title).text, 160);
      if (hasRemovalMark(title)) {
        skip(ref, 'el título tenía datos personales');
        continue;
      }
      src.checkTime();
      const thumb = await src.thumbnail(e.videoId);
      const cover = addPhoto(thumb, cut(title, 300), '', `${ref} · miniatura`);
      const ok2 = addItem(
        {
          id: realIds.episode(e.videoId), kind: 'episode', slug: slugs.get(e.videoId)!,
          draft: { title, date: dayIn(tz, new Date(e.published)), youtubeId: e.videoId, coverId: cover?.id ?? null, ...(e.minutes && e.minutes <= 600 ? { minutes: e.minutes } : {}) },
        },
        ref,
      );
      if (ok2) episodes++;
    }
  } catch (e) {
    failed.push('youtube');
    skip('YouTube', (e as Error).message);
  }

  // --- The weekly: its cover from the official site, its PDF from Drive ---------------------------------------------
  let documents = 0;
  if (weekly) {
    try {
      const pdf = await src.drivePdf(weekly.driveId);
      if (!pdf) throw new Error('el PDF no se pudo bajar');
      if (String.fromCharCode(...pdf.bytes.subarray(0, 5)) !== '%PDF-') throw new Error('no es un PDF');
      // Its name: the Drive file's name or page when they say something (often it is only a number), else the config's.
      // Its title: that name when it says something, else the edition's day (two editions never read the same).
      const day = pdfCreationDay(pdf.bytes) ?? dayIn(tz, input.now);
      const pageTitle = meaningfulName(pdf.fileName) ? null : await src.drivePageTitle(weekly.driveId).catch(() => null);
      const fallback = config.semanarioName ?? 'Semanario';
      const name = cut(scrubText(semanarioTitle({ fileName: pdf.fileName, pageTitle, fallback })).text, 160);
      if (hasRemovalMark(name)) throw new Error('el nombre del archivo tenía datos personales');
      const named = name !== fallback;
      const title = named ? name : editionTitle(day);
      const sha = sha256Of(pdf.bytes);
      const fileTitle = cut(named ? name : `${fallback}, ${title.charAt(0).toLowerCase()}${title.slice(1)}`, 200);
      const file = addFile({ bytes: pdf.bytes, sha256: sha, ext: 'pdf', mime: 'application/pdf', kind: 'document', title: fileTitle }, 'Semanario (PDF)');
      if (!file) throw new Error('el PDF no pasó sus controles');
      let coverId: string | null = null;
      if (weekly.cover) {
        const m = weekly.cover.attachmentId ? wpMedia.get(weekly.cover.attachmentId) : undefined;
        const want = m
          ? wantFromWp(m, site.ownHosts, MAX_SIDE)
          : wantFromImage({ src: weekly.cover.src, alt: weekly.cover.alt, caption: '', attachmentId: null, linkHref: null }, site.ownHosts);
        if (!want.external) {
          src.checkTime();
          coverId = addPhoto(await src.photo(want), cut(fileTitle, 300), '', 'Semanario (portada)')?.id ?? null;
        }
      }
      const pages = pdfPageCount(pdf.bytes);
      const ok = addItem(
        {
          id: realIds.document(sha), kind: 'document', slug: `${slugFromTitle(name)}-${day}`.slice(0, 120).replace(/-+$/, ''),
          draft: { title, date: day, category: 'semanario', fileId: file.id, coverId, ...(pages ? { pages } : {}) },
        },
        'Semanario',
      );
      if (ok) documents++;
    } catch (e) {
      failed.push('semanario');
      skip('Semanario', (e as Error).message);
    }
  } else if (home) {
    skip('Semanario', 'la portada no tiene la sección del Semanario o su enlace a Drive');
  }

  // --- Together, sorted -----------------------------------------------------------------------------------------------
  const date = (it: RealItem) => String((it.draft as { date?: string }).date ?? '');
  items.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || date(b).localeCompare(date(a)) || a.id.localeCompare(b.id));
  // Only the files something shows (a photo brought for a post that was then left out goes too).
  const used = new Set<string>([heroMediaId, bioMediaId].filter((x): x is string => !!x));
  for (const it of items) {
    const d = it.draft as { coverId?: unknown; galleryIds?: unknown; fileId?: unknown };
    for (const v of [d.coverId, d.fileId, ...(Array.isArray(d.galleryIds) ? d.galleryIds : [])]) if (typeof v === 'string') used.add(v);
  }
  const mediaList = [...media.values()].filter((m) => used.has(m.id)).sort((a, b) => a.id.localeCompare(b.id));
  for (const m of media.values()) if (!used.has(m.id)) files.delete(m.key);
  const candidate: RealSnapshot = {
    version: 1,
    fetchedAt: input.now.toISOString(),
    source: site.origin,
    identity,
    accounts,
    media: mediaList,
    items,
    pages: { heroMediaId, bioMediaId, biography: bio.biography, office, honors: bio.honors, bioSourceUrl: bio.sourceUrl },
    redirects: [...redirects].map(([from, to]) => ({ from, to })).sort((a, b) => a.from.localeCompare(b.from)),
    report: {
      news: newsCount, opinion: opinionCount, episodes, photos: mediaList.filter((m) => m.kind === 'image').length, documents, skipped,
      mediaBytes: mediaList.reduce((n, m) => n + m.bytes, 0), requests: src.requests(), durationMs: Date.now() - t0,
    },
  };
  const checked = parseRealSnapshot(candidate);
  if (!checked.ok) throw new Error(`la foto de la web oficial no quedó válida: ${checked.error}`);
  return { snapshot: checked.snapshot, files, failed: [...new Set(failed)] };
}
