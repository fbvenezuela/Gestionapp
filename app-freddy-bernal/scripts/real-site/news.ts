// The official site's posts → what the demo shows, with the importer's own pieces (scripts/web-import: planPost and
// draftOf for the news draft and its old address, convertArticle for the text, the PII scrub, the photo choice), and
// three rules of the demo on top (design §2):
//   * no removal mark ever reaches the public: the sentence that carries one goes; a post whose title carries one is
//     left out (the database would refuse it anyway: guard_web_item_ready);
//   * no author (Yoast's «Escrito por» is who uploaded it; columns are signed inside the text), and the source named;
//   * every photo with a real alternative text: WordPress's, else its caption, else the post's title («(foto 2)» for the
//     gallery's), never the importer's «[Por escribir]» (that one waits for a person, and the demo has none).
// Pure.
import type { TextNode } from '../../src/lib/web/blocks';
import { dayIn } from '../../src/lib/web/cms/drafts';
import { fmtDay } from '../../src/lib/web/format';
import { isAltPlaceholder } from '../../src/lib/web/import-marks';
import type { Snapshot } from '../../src/lib/web/schema';
import { REAL_DRAFT_MAX } from '../../src/lib/web/real-site';
import { convertArticle } from '../web-import/convert';
import { draftOf, gmtIso, planPost, type PostPlan, type WpPost, type WpTerm } from '../web-import/mapping';
import { wantFromImage, wantFromWp, type PhotoWant, type WpMedia } from '../web-import/media';
import { cut, dropSentences, dropSentencesInNodes, fold, hasRemovalMark, plainOf } from './text';

export type PlanContext = { categories: Map<number, WpTerm>; ownHosts: readonly string[]; tz: string };

/** A post as the demo keeps it, or why it is left out. */
export function planNews(post: WpPost, ctx: PlanContext): { plan: PostPlan } | { skip: string } {
  const plan = planPost(post, ctx);
  if (plan.refused) return { skip: plan.refused };
  if (hasRemovalMark(plan.title)) return { skip: 'el título tenía datos personales' };
  plan.body = dropSentencesInNodes(plan.body, hasRemovalMark);
  if (plan.excerpt) plan.excerpt = dropSentences(plan.excerpt, hasRemovalMark) || undefined;
  if (plan.seoDescription) plan.seoDescription = dropSentences(plan.seoDescription, hasRemovalMark) || undefined;
  return { plan };
}

/** The news draft: the importer's, without the author and with its source; past the size the database keeps, its last
 * paragraphs go (like the importer). */
export function newsDraft(plan: PostPlan, media: { coverId: string | null; galleryIds: string[] }, sourceLabel: string): Snapshot<'news'> {
  const make = () => {
    const d = draftOf(plan, media);
    delete d.author;
    return { ...d, sources: [{ label: sourceLabel, url: plan.sourceUrl }] };
  };
  let draft = make();
  while (JSON.stringify(draft).length > REAL_DRAFT_MAX && plan.body.length > 1) {
    plan.body = plan.body.slice(0, Math.floor(plan.body.length * 0.9));
    draft = make();
  }
  return draft;
}

export type Wanted = { want: PhotoWant; role: 'cover' | 'inline' };

/** The photos of a post to try, in order: its photo, then the ones in its text (WordPress's when it knows them); one
 * file once (by WordPress id or by original address), never one of another site. */
export function photoWants(plan: PostPlan, wpMedia: Map<number, WpMedia>, ownHosts: readonly string[], maxSide: number): Wanted[] {
  const out: Wanted[] = [];
  const seen = new Set<string>();
  const push = (want: PhotoWant, role: Wanted['role']) => {
    if (want.external) return;
    const keys = [want.key, want.oldPath ? `path:${want.oldPath}` : ''].filter(Boolean);
    if (keys.some((k) => seen.has(k))) return;
    keys.forEach((k) => seen.add(k));
    out.push({ want, role });
  };
  if (plan.featuredMediaId) {
    const m = wpMedia.get(plan.featuredMediaId);
    if (m) push(wantFromWp(m, ownHosts, maxSide), 'cover');
  }
  for (const img of plan.images) {
    const m = img.attachmentId ? wpMedia.get(img.attachmentId) : undefined;
    push(m ? wantFromWp(m, ownHosts, maxSide, { alt: img.alt, caption: img.caption }) : wantFromImage(img, ownHosts), 'inline');
  }
  return out;
}

/** An alt that is only a file's name («photo_0000000000000000000_y», «IMG_1234.jpg») says nothing. */
export function looksLikeFileName(s: string): boolean {
  const t = s.trim();
  return !/\s/.test(t) && (/_/.test(t) || /\d{4,}/.test(t) || /\.(?:jpe?g|png|webp|gif|heic)$/i.test(t));
}

const usable = (s: string | undefined) => {
  const t = dropSentences((s ?? '').replace(/\s+/g, ' ').trim(), hasRemovalMark).trim();
  return t.length >= 3 && !isAltPlaceholder(t) && !looksLikeFileName(t) && !hasRemovalMark(t) ? t : null;
};

/** The photo's alternative text: WordPress's, else its caption, else the title (the gallery's «<título> (foto N)»). */
export function altFor(want: PhotoWant, title: string, galleryIndex: number | null): string {
  const own = want.altMissing ? null : usable(want.alt);
  const chosen = own ?? usable(want.caption);
  if (chosen) return cut(chosen, 300);
  const base = title.trim();
  if (galleryIndex === null) return cut(base, 300);
  const tail = ` (foto ${galleryIndex + 2})`;
  return `${cut(base, 300 - tail.length)}${tail}`;
}

/** Its caption, without a sentence that carries a mark (at most 500). */
export function captionFor(want: PhotoWant): string {
  return cut(dropSentences(want.caption ?? '', hasRemovalMark), 500);
}

// --- The governor's page -----------------------------------------------------------------------------------------------
const DASH_ITEM = /^\s*[-–—•]\s*(\S[\s\S]*)$/;
const isLabel = (n: TextNode) => {
  if (n.type !== 'paragraph' && n.type !== 'heading') return false;
  const t = plainOf(n).replace(/[:.]\s*$/, '').trim();
  return !!t && t.length <= 60 && t.split(/\s+/).length <= 6 && !DASH_ITEM.test(t);
};
const dashItem = (n: TextNode): string | null => {
  if (n.type !== 'paragraph') return null;
  const m = DASH_ITEM.exec(plainOf(n));
  return m ? m[1].trim() : null;
};

/** Paragraphs written as «– item» become a list, and a short line just before such a list becomes its heading. */
export function listsFromDashes(nodes: readonly TextNode[]): TextNode[] {
  const out: TextNode[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const items: string[] = [];
    let j = i;
    for (; j < nodes.length; j++) {
      const it = dashItem(nodes[j]);
      if (it === null) break;
      items.push(it.slice(0, 4000));
    }
    if (items.length) {
      const prev = out[out.length - 1];
      if (prev && isLabel(prev) && prev.type === 'paragraph') out[out.length - 1] = { type: 'heading', level: 3, text: plainOf(prev).replace(/[:.]\s*$/, '').trim().slice(0, 200) };
      for (let k = 0; k < items.length; k += 50) out.push({ type: 'list', items: items.slice(k, k + 50) });
      i = j - 1;
      continue;
    }
    out.push(nodes[i]);
  }
  return out;
}

/** The biography post: its paragraphs without the sentences about «actualmente» (written in 2014), and its honours
 * (from «Condecoraciones» on, as headings and lists). */
export function biographyOf(post: WpPost, ctx: PlanContext): { biography: TextNode[]; honors: TextNode[]; sourceUrl: string } {
  const plan = planPost(post, ctx);
  const nodes = listsFromDashes(dropSentencesInNodes(plan.body, hasRemovalMark));
  const at = nodes.findIndex((n) => (n.type === 'heading' || n.type === 'paragraph') && fold(plainOf(n)) === 'condecoraciones');
  const before = at >= 0 ? nodes.slice(0, at) : nodes;
  const after = at >= 0 ? nodes.slice(at + 1) : [];
  const biography = dropSentencesInNodes(before, (s) => /\bactualmente\b/i.test(s));
  return { biography, honors: after, sourceUrl: plan.sourceUrl };
}

/** A post about taking office: its date and its first paragraph as written (after the heading that repeats its title,
 * when it has one: the line before it is a kicker). */
export function officeLeadOf(post: WpPost, ctx: PlanContext): TextNode[] {
  const plan = planPost(post, ctx);
  const conv = convertArticle(post.content?.rendered ?? '', { baseUrl: plan.sourceUrl, ownHosts: ctx.ownHosts });
  const nodes = dropSentencesInNodes(conv.body, hasRemovalMark);
  const titleAt = nodes.findIndex((n, i) => i < 4 && n.type === 'heading' && fold(n.text) === fold(plan.title));
  const paragraphs = nodes.map((n, i) => ({ n, i })).filter(({ n }) => n.type === 'paragraph' && plainOf(n).trim());
  const words = (n: TextNode) => plainOf(n).trim().split(/\s+/).length;
  const lead =
    (titleAt >= 0 ? paragraphs.find(({ i }) => i > titleAt) : undefined) ?? paragraphs.find(({ n }) => words(n) >= 12) ?? paragraphs[0];
  if (!lead) return [];
  const text = plainOf(lead.n).replace(/[ \t]+/g, ' ').trim().slice(0, 4000);
  const at = gmtIso(post.date_gmt) ?? gmtIso(post.date);
  const day = at ? fmtDay(dayIn(ctx.tz, new Date(at))) : '';
  return [...(day ? [{ type: 'heading' as const, level: 3 as const, text: day }] : []), { type: 'paragraph', text }];
}
