// An article of the old site (WordPress HTML) → the website's structured text (src/lib/web/blocks.ts: headings,
// paragraphs, lists and quotes, with bold, italic and links). Never HTML: what comes out is data that the site's own
// renderer draws, and every link passes safeHref (https, http, mailto or a path of this site). What does not fit is
// taken apart, never pasted:
//   * photos → found here (with their alternative text and caption) and brought to the library by the importer: they
//     go to the news item's photo and gallery, not inside the text;
//   * a YouTube video (iframe, embed or a link alone on its line) → the item's video (the site shows it with the lite
//     player); a second one becomes a link «Ver el video en YouTube»;
//   * scripts, styles, forms, other frames and objects → out; a post of X, Instagram, TikTok or Facebook → a link to it;
//   * a table → a list of its rows; WordPress shortcodes left as text → out;
//   * links of the old site → paths of this site (after the switch the redirects take them to the new address);
//   * emails, phones and ID numbers → out, with a mark (pii.ts), and the item flagged for review.
// Pure.
import { safeHref, textNode, type TextNode, type TextRun } from '../../src/lib/web/blocks';
import { classesOf, findAll, hasClass, parseHtml, textOf, type HtmlElement, type HtmlNode } from './html';
import { addPii, hrefCarriesPii, noPii, scrubText, type PiiCounts } from './pii';
import { REVIEW_FLAGS, type ReviewFlag } from '../../src/lib/web/import-marks';

// What a person must review in an imported draft, and its words (shared with the editor: src/lib/web/import-marks.ts).
export type { ReviewFlag };
export const FLAG_TEXT: Record<ReviewFlag, string> = REVIEW_FLAGS;

export type FoundImage = {
  /** The address in the article (the <img>), absolute. */
  src: string;
  alt: string;
  caption: string;
  /** WordPress's id of the photo (class wp-image-123), when the article says it. */
  attachmentId: number | null;
  /** The link around the photo (usually the full-size file). */
  linkHref: string | null;
};

export type ConvertOptions = {
  /** The article's address, to read relative links. */
  baseUrl: string;
  /** The old site's hosts (with and without www): their links become paths of this site. */
  ownHosts: readonly string[];
};

export type Converted = {
  body: TextNode[];
  images: FoundImage[];
  videos: string[];
  flags: Set<ReviewFlag>;
  pii: PiiCounts;
};

const LIMITS = { nodes: 200, paragraphChars: 4000, runChars: 2000, runs: 60, listItems: 50, headingChars: 200, quoteChars: 1000, citeChars: 200 };

// Left out with what they hold.
const DROP = new Set([
  'script', 'style', 'noscript', 'template', 'head', 'meta', 'link', 'title', 'form', 'input', 'button', 'select', 'option', 'optgroup', 'textarea',
  'map', 'area', 'canvas', 'math', 'svg', 'datalist', 'output', 'progress', 'meter', 'dialog',
]);
// Players and frames of other pages: out, and the item flagged.
const EMBEDS = new Set(['object', 'embed', 'video', 'audio', 'applet', 'frame', 'frameset', 'portal']);
const BLOCKS = new Set([
  'p', 'div', 'section', 'article', 'header', 'footer', 'main', 'aside', 'nav', 'center', 'address', 'details', 'summary', 'hgroup', 'fieldset',
  'legend', 'dl', 'dt', 'dd', 'caption', 'figcaption', 'body', 'html', 'pre', 'menu', 'dir',
]);
const BOLD = new Set(['strong', 'b']);
const ITALIC = new Set(['em', 'i', 'cite', 'dfn', 'var']);
// Sharing buttons, related posts, ads and the like that plugins put inside the content.
const NOISE_CLASS = /^(sharedaddy|jp-relatedposts|jp-post-flair|wpcnt|addtoany_|heateor_|sd-sharing|wp-block-buttons|post-views|yarpp-related|crp_related|essb_|social-share|share-buttons)/i;
// WordPress shortcodes that some old posts keep as text.
const SHORTCODE = /\[\/?(?:caption|embed|gallery|video|audio|playlist|wpvideo|youtube|vimeo|vc_\w+|et_pb_\w+|fusion_\w+|av_\w+|su_\w+|tdc?_\w+|rev_slider|contact-form-7|metaslider|smartslider3|dt_\w+)(?:\s[^\]]*)?\]/gi;
// Characters written by code point (an invisible one written as itself cannot be told apart, and some end a line).
const ch = (...cps: number[]) => cps.map((c) => String.fromCodePoint(c)).join('');
// Soft hyphen, zero-width spaces and joiners, word joiner, byte order mark: nothing to show.
const INVISIBLE = new RegExp(`[${ch(0xad, 0x200b, 0x200c, 0x200d, 0x2060, 0xfeff)}]`, 'g');
// Every kind of space (no-break, thin, ideographic…) and line separators: one plain space, as a browser shows them.
const SPACES = new RegExp(`[\\s${ch(0xa0, 0x1680)}${ch(0x2000)}-${ch(0x200a)}${ch(0x2028, 0x2029, 0x202f, 0x205f, 0x3000)}]+`, 'g');

const YOUTUBE = /^(?:https?:)?\/\/(?:www\.|m\.|music\.)?(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?(?:[^#]*&)?v=|shorts\/|live\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/i;

/** The id of a YouTube video from any of its addresses (watch, embed, youtu.be, shorts, nocookie), or null. */
export function youtubeIdOf(url: string): string | null {
  const m = YOUTUBE.exec(url.trim());
  return m ? m[1] : null;
}

type Style = { bold: boolean; italic: boolean; href: string | null };
const PLAIN: Style = { bold: false, italic: false, href: null };

/** A paragraph being written: runs of text with their style, spaces collapsed the way a browser shows them. */
class Para {
  runs: TextRun[] = [];
  private last(): string {
    const r = this.runs[this.runs.length - 1];
    return r ? r.text.slice(-1) : '';
  }
  get empty(): boolean {
    return this.runs.every((r) => !r.text.trim());
  }
  add(raw: string, s: Style, keepLines = false) {
    let t = raw.replace(INVISIBLE, '');
    t = keepLines ? t.replace(/\r\n?/g, '\n').replace(/[^\S\n]+/g, ' ') : t.replace(SPACES, ' ');
    if (!t) return;
    const prev = this.last();
    if (prev === '' || prev === '\n' || prev === ' ') t = t.replace(/^ +/, '');
    if (!t) return;
    const run: TextRun = { text: t, ...(s.bold ? { bold: true } : {}), ...(s.italic ? { italic: true } : {}), ...(s.href ? { href: s.href } : {}) };
    const lastRun = this.runs[this.runs.length - 1];
    if (lastRun && !!lastRun.bold === !!run.bold && !!lastRun.italic === !!run.italic && (lastRun.href ?? null) === (run.href ?? null)) lastRun.text += t;
    else this.runs.push(run);
  }
  br() {
    const r = this.runs[this.runs.length - 1];
    if (!r) return;
    r.text = r.text.replace(/ +$/, '');
    this.runs.push({ text: '\n' });
  }
  /** The finished runs: trimmed at both ends, no space around a line break, styles merged, empty ones out. */
  done(): TextRun[] {
    const out: TextRun[] = [];
    for (const r of this.runs) {
      const lastRun = out[out.length - 1];
      if (lastRun && !!lastRun.bold === !!r.bold && !!lastRun.italic === !!r.italic && (lastRun.href ?? null) === (r.href ?? null)) lastRun.text += r.text;
      else out.push({ ...r });
    }
    for (const r of out) r.text = r.text.replace(/ *\n */g, '\n').replace(/\n{2,}/g, '\n');
    while (out.length && !out[0].text.replace(/^[\s\n]+/, '')) out.shift();
    if (out.length) out[0].text = out[0].text.replace(/^[\s\n]+/, '');
    while (out.length && !out[out.length - 1].text.replace(/[\s\n]+$/, '')) out.pop();
    if (out.length) out[out.length - 1].text = out[out.length - 1].text.replace(/[\s\n]+$/, '');
    // A link or a style on nothing but spaces is just a space.
    return out
      .filter((r) => r.text.length)
      .map((r) => (r.text.trim() ? r : { text: r.text }))
      .reduce<TextRun[]>((acc, r) => {
        const lastRun = acc[acc.length - 1];
        if (lastRun && !!lastRun.bold === !!r.bold && !!lastRun.italic === !!r.italic && (lastRun.href ?? null) === (r.href ?? null)) lastRun.text += r.text;
        else acc.push(r);
        return acc;
      }, []);
  }
}

const plainOf = (runs: readonly TextRun[]) => runs.map((r) => r.text).join('');
const isPlain = (runs: readonly TextRun[]) => runs.every((r) => !r.bold && !r.italic && !r.href);
const collapse = (s: string) => s.replace(INVISIBLE, '').replace(SPACES, ' ').trim();

/** Cut a text into pieces of at most `max` characters, after a space when there is one near the end (the space stays
 * with the first piece, so two pieces that end up in the same paragraph still read as two words). */
function chunks(text: string, max: number): string[] {
  const out: string[] = [];
  let rest = text;
  while (rest.length > max) {
    const space = rest.lastIndexOf(' ', max - 1);
    const cut = space >= max * 0.6 ? space + 1 : max;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest) out.push(rest);
  return out;
}

/** Runs → one or more paragraphs within the limits of the site's text (runs per paragraph, characters). */
function paragraphsOf(runs: TextRun[]): TextNode[] {
  if (!runs.length) return [];
  const pieces: TextRun[] = runs.flatMap((r) => (r.text.length <= LIMITS.runChars ? [r] : chunks(r.text, LIMITS.runChars).map((text) => ({ ...r, text }))));
  const groups: TextRun[][] = [];
  let cur: TextRun[] = [];
  let size = 0;
  for (const r of pieces) {
    if (cur.length && (cur.length >= LIMITS.runs || size + r.text.length > LIMITS.paragraphChars)) {
      groups.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(r);
    size += r.text.length;
  }
  if (cur.length) groups.push(cur);
  return groups.map((g) => (isPlain(g) ? { type: 'paragraph', text: plainOf(g) } : { type: 'paragraph', runs: g }));
}

// --- The walk --------------------------------------------------------------------------------------------------------
class Walker {
  nodes: TextNode[] = [];
  images: FoundImage[] = [];
  videos: string[] = [];
  flags = new Set<ReviewFlag>();
  pii = noPii();
  private para = new Para();
  private keepLines = 0;

  constructor(private o: ConvertOptions) {}

  flush() {
    const runs = this.para.done();
    this.para = new Para();
    if (!runs.length) return;
    // A YouTube address alone on its line (an embed WordPress could not draw) is the video.
    const alone = plainOf(runs).trim();
    const yt = /^\S+$/.test(alone) ? youtubeIdOf(alone) : null;
    if (yt) {
      this.video(yt);
      return;
    }
    this.nodes.push(...paragraphsOf(runs));
  }

  private push(node: TextNode) {
    this.flush();
    this.nodes.push(node);
  }

  private linkParagraph(text: string, href: string) {
    this.push({ type: 'paragraph', runs: [{ text, href }] });
  }

  private video(id: string) {
    if (this.videos.includes(id)) return;
    this.videos.push(id);
    if (this.videos.length > 1) {
      this.flags.add('video_extra');
      this.linkParagraph('Ver el video en YouTube', `https://www.youtube.com/watch?v=${id}`);
    }
  }

  /** A link of the article as this site keeps it, or null (dropped: an anchor, a script, personal data, not a page). */
  href(raw: string | undefined): string | null {
    const v = (raw ?? '').trim();
    if (!v || v.startsWith('#')) return null;
    const pii = hrefCarriesPii(v);
    if (pii) {
      this.pii[pii]++;
      this.flags.add(pii === 'emails' ? 'email_removed' : 'phone_removed');
      return null;
    }
    if (/^(?:javascript|data|vbscript|file|blob|about|chrome|intent):/i.test(v)) return null;
    let url: URL;
    try {
      url = new URL(v, this.o.baseUrl);
    } catch {
      return null;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (this.o.ownHosts.includes(url.hostname.toLowerCase())) {
      const path = (url.pathname.replace(/\/+$/, '') || '/') + url.search;
      if (/^\/wp-content\/uploads\/.+\.pdf$/i.test(url.pathname)) this.flags.add('pdf_link');
      return safeHref.safeParse(path).success ? path : null;
    }
    const abs = url.toString();
    return abs.length <= 500 && safeHref.safeParse(abs).success ? abs : null;
  }

  private image(el: HtmlElement, caption: string, linkHref: string | null) {
    const src = el.attrs.src || el.attrs['data-src'] || el.attrs['data-lazy-src'] || el.attrs['data-orig-file'] || '';
    let abs: string;
    try {
      abs = new URL(src.trim(), this.o.baseUrl).toString();
    } catch {
      return;
    }
    if (!/^https?:/i.test(abs) || abs.startsWith('data:')) return;
    const fromClass = /(?:^|\s)wp-image-(\d+)(?:\s|$)/.exec(el.attrs.class ?? '');
    const idText = fromClass?.[1] ?? el.attrs['data-id'] ?? el.attrs['data-attachment-id'] ?? '';
    const id = /^\d{1,12}$/.test(idText) ? Number(idText) : null;
    if (this.images.some((x) => x.src === abs && x.attachmentId === id)) return;
    this.images.push({ src: abs, alt: collapse(el.attrs.alt ?? ''), caption: collapse(caption), attachmentId: id, linkHref });
  }

  /** A figure-like box: its photos take its caption; an iframe or a quote inside is handled as itself. */
  private figure(el: HtmlElement, style: Style) {
    const capEl = el.children.find(
      (c): c is HtmlElement => c.type === 'element' && (c.tag === 'figcaption' || hasClass(c, /^(wp-caption-text|gallery-caption)$/) || (c.tag === 'dd' && hasClass(el, /^gallery-item$/))),
    );
    const imgs = findAll(el, (x) => x.tag === 'img');
    const caption = capEl ? textOf(capEl) : '';
    if (imgs.length === 1 && !findAll(el, (x) => x.tag === 'iframe' || x.tag === 'blockquote').length) {
      const a = findAll(el, (x) => x.tag === 'a' && findAll(x, (y) => y.tag === 'img').length > 0)[0];
      this.flush();
      this.image(imgs[0], caption, a ? this.href(a.attrs.href) : null);
      return;
    }
    // Several photos (a gallery), a video or something else: each piece as itself; the caption, if left alone, as text.
    for (const c of el.children) if (c !== capEl) this.walk(c, style);
    if (capEl && !imgs.length) {
      this.flush();
      this.walk(capEl, style);
      this.flush();
    }
  }

  private social(el: HtmlElement): boolean {
    const cls = classesOf(el).join(' ');
    let network: string | null = null;
    let permalink: string | undefined;
    const links = findAll(el, (x) => x.tag === 'a').map((a) => a.attrs.href ?? '');
    if (/twitter-tweet|twitter-video/.test(cls)) {
      network = 'X';
      permalink = [...links].reverse().find((h) => /(?:twitter|x)\.com\/[^/]+\/status\//i.test(h));
      // The post's words as a quote, without its picture links; who said it as the citation.
      const p = el.children.find((c): c is HtmlElement => c.type === 'element' && c.tag === 'p');
      const words = p ? collapse(textOf(p).replace(/\s*(?:pic\.twitter\.com|https?:\/\/t\.co)\/\S+/g, '')) : '';
      const by = collapse(el.children.filter((c) => c.type === 'text').map((c) => textOf(c)).join(' ')).replace(/^[—–-]\s*/, '');
      if (words && words.length <= LIMITS.quoteChars) {
        this.push({ type: 'quote', text: words, ...(by && by.length <= LIMITS.citeChars ? { cite: by } : {}) });
      }
    } else if (/instagram-media/.test(cls)) {
      network = 'Instagram';
      permalink = el.attrs['data-instgrm-permalink'] || links.find((h) => /instagram\.com\//i.test(h));
    } else if (/tiktok-embed/.test(cls)) {
      network = 'TikTok';
      permalink = el.attrs.cite || links.find((h) => /tiktok\.com\//i.test(h));
    } else if (/(?:^|\s)fb-(?:post|video)(?:\s|$)/.test(cls)) {
      network = 'Facebook';
      permalink = el.attrs['data-href'] || links.find((h) => /facebook\.com\//i.test(h));
    }
    if (!network) return false;
    this.flags.add('embed_replaced');
    const href = permalink ? this.href(permalink.replace(/\?.*$/, '')) : null;
    if (href) this.linkParagraph(`Ver la publicación en ${network}`, href);
    else this.flush();
    return true;
  }

  private iframe(el: HtmlElement) {
    const src = (el.attrs.src || el.attrs['data-src'] || '').trim();
    const yt = youtubeIdOf(src);
    if (yt) {
      this.flush();
      this.video(yt);
      return;
    }
    // A Facebook video or post plugin: a link to what it showed.
    const fb = /^(?:https?:)?\/\/(?:www\.)?facebook\.com\/plugins\/(?:video|post)\.php\?(.*)$/i.exec(src);
    if (fb) {
      const target = new URLSearchParams(fb[1]).get('href') ?? '';
      const href = /^https:\/\/(?:www\.|m\.|web\.)?(?:facebook\.com|fb\.watch)\//i.test(target) ? this.href(target) : null;
      this.flags.add('embed_replaced');
      if (href) this.linkParagraph('Ver la publicación en Facebook', href);
      return;
    }
    this.flags.add('embed_removed');
  }

  private heading(el: HtmlElement, style: Style) {
    // Photos or videos inside a heading still count.
    for (const x of findAll(el, (y) => y.tag === 'img' || y.tag === 'iframe')) {
      if (x.tag === 'img') this.image(x, '', null);
      else this.iframe(x);
    }
    const text = collapse(textOf(el));
    if (!text) return;
    if (text.length > LIMITS.headingChars) {
      this.flags.add('heading_long');
      this.flush();
      this.walk({ ...el, tag: 'p' }, { ...style, bold: true });
      this.flush();
      return;
    }
    const level = el.tag === 'h1' || el.tag === 'h2' ? 2 : 3;
    this.push({ type: 'heading', level, text });
  }

  /** The inline content of a subtree as runs (blocks inside joined with a space), photos and videos collected. */
  private inline(el: HtmlElement, style: Style): TextRun[] {
    const inner = new Walker(this.o);
    inner.images = this.images;
    inner.videos = this.videos;
    inner.flags = this.flags;
    inner.pii = this.pii;
    for (const c of el.children) inner.walk(c, style);
    inner.flush();
    const runs: TextRun[] = [];
    for (const n of inner.nodes) {
      if (n.type === 'paragraph') {
        if (runs.length) runs.push({ text: ' ' });
        runs.push(...(n.runs ?? [{ text: n.text ?? '' }]));
      } else if (n.type === 'heading' || n.type === 'quote') {
        if (runs.length) runs.push({ text: ' ' });
        runs.push({ text: n.text });
      } else if (n.type === 'list') {
        for (const it of n.items) {
          if (runs.length) runs.push({ text: ' ' });
          runs.push(...(typeof it === 'string' ? [{ text: it }] : it));
        }
      }
    }
    const p = new Para();
    for (const r of runs) p.add(r.text.replace(/\n/g, ' '), { bold: !!r.bold, italic: !!r.italic, href: r.href ?? null });
    return p.done();
  }

  private list(el: HtmlElement, style: Style) {
    const items: (string | TextRun[])[] = [];
    const addItems = (listEl: HtmlElement, prefix: string) => {
      for (const li of listEl.children) {
        if (li.type !== 'element') continue;
        if (li.tag !== 'li') {
          if (li.tag === 'ul' || li.tag === 'ol') addItems(li, prefix);
          continue;
        }
        const nested = li.children.filter((c): c is HtmlElement => c.type === 'element' && (c.tag === 'ul' || c.tag === 'ol'));
        const own: HtmlElement = { ...li, children: li.children.filter((c) => !nested.includes(c as HtmlElement)) };
        const runs = this.inline(own, style);
        if (runs.length) {
          if (prefix) runs[0] = { ...runs[0], text: `${prefix}${runs[0].text}` };
          const fitted = runs.length > LIMITS.runs || plainOf(runs).length > LIMITS.paragraphChars ? [{ text: plainOf(runs).slice(0, LIMITS.paragraphChars) }] : runs;
          items.push(isPlain(fitted) ? plainOf(fitted) : fitted);
        }
        for (const n of nested) addItems(n, `${prefix}– `);
      }
    };
    this.flush();
    addItems(el, '');
    for (let k = 0; k < items.length; k += LIMITS.listItems) {
      this.nodes.push({ type: 'list', ...(el.tag === 'ol' ? { ordered: true } : {}), items: items.slice(k, k + LIMITS.listItems) });
    }
  }

  private quote(el: HtmlElement, style: Style) {
    if (this.social(el)) return;
    // Its author: a <cite> or <footer> of the quote itself (one inside a sentence is just italics).
    const citeEl = el.children.find((c): c is HtmlElement => c.type === 'element' && (c.tag === 'cite' || c.tag === 'footer'));
    const body: HtmlElement = { ...el, children: el.children.filter((c) => c !== citeEl) };
    for (const x of findAll(body, (y) => y.tag === 'img')) this.image(x, '', null);
    const text = textOf(body)
      .replace(INVISIBLE, '')
      .split(/\n+/)
      .map(collapse)
      .filter(Boolean)
      .join('\n');
    if (!text) return;
    if (text.length > LIMITS.quoteChars) {
      // Too long for a quote: its paragraphs, in italics.
      this.flush();
      for (const c of body.children) this.walk(c, { ...style, italic: true });
      this.flush();
      return;
    }
    const cite = citeEl ? collapse(textOf(citeEl)).replace(/^[—–-]\s*/, '') : '';
    this.push({ type: 'quote', text, ...(cite && cite.length <= LIMITS.citeChars ? { cite } : {}) });
  }

  private table(el: HtmlElement, style: Style) {
    const rows = findAll(el, (x) => x.tag === 'tr');
    const items: string[] = [];
    for (const tr of rows) {
      const cells = tr.children.filter((c): c is HtmlElement => c.type === 'element' && (c.tag === 'td' || c.tag === 'th'));
      const texts = cells.map((c) => plainOf(this.inline(c, style)).trim()).filter(Boolean);
      if (texts.length) items.push(texts.join(' · ').slice(0, LIMITS.paragraphChars));
    }
    for (const x of findAll(el, (y) => y.tag === 'img' && !rows.length)) this.image(x, '', null);
    this.flush();
    if (!items.length) return;
    this.flags.add('table_flattened');
    for (let k = 0; k < items.length; k += LIMITS.listItems) this.nodes.push({ type: 'list', items: items.slice(k, k + LIMITS.listItems) });
  }

  walk(node: HtmlNode, style: Style) {
    if (node.type === 'text') {
      const t = node.text.replace(SHORTCODE, ' ');
      this.para.add(t, style, this.keepLines > 0);
      return;
    }
    const el = node;
    const tag = el.tag;
    if (DROP.has(tag)) return;
    if (EMBEDS.has(tag)) {
      this.flags.add('embed_removed');
      return;
    }
    if (classesOf(el).some((c) => NOISE_CLASS.test(c)) || el.attrs.id === 'jp-post-flair') return;
    if (tag === 'br') {
      this.para.br();
      return;
    }
    if (tag === 'hr') {
      this.flush();
      return;
    }
    if (tag === 'img') {
      this.image(el, '', style.href);
      return;
    }
    if (tag === 'iframe') {
      this.iframe(el);
      return;
    }
    if (/^h[1-6]$/.test(tag)) {
      this.heading(el, style);
      return;
    }
    if (tag === 'ul' || tag === 'ol') {
      this.list(el, style);
      return;
    }
    if (tag === 'blockquote') {
      this.quote(el, style);
      return;
    }
    if (tag === 'table') {
      this.table(el, style);
      return;
    }
    if (tag === 'figure' || hasClass(el, /^(wp-caption|gallery-item)$/)) {
      this.figure(el, style);
      return;
    }
    if (tag === 'div' && this.social(el)) return;
    if (tag === 'a') {
      const onlyImages = findAll(el, (x) => x.tag === 'img').length > 0 && !collapse(textOf(el));
      const href = this.href(el.attrs.href);
      if (onlyImages) {
        for (const c of el.children) this.walk(c, { ...style, href });
        return;
      }
      for (const c of el.children) this.walk(c, { ...style, href: href ?? style.href });
      return;
    }
    const next: Style = { bold: style.bold || BOLD.has(tag), italic: style.italic || ITALIC.has(tag), href: style.href };
    const block = BLOCKS.has(tag) || tag === 'li';
    if (block) this.flush();
    if (tag === 'pre') this.keepLines++;
    for (const c of el.children) this.walk(c, next);
    if (tag === 'pre') this.keepLines--;
    if (block) this.flush();
  }
}

/** Emails, phones and ID numbers out of every text of the body (also when a phone spans two styled pieces). */
function scrubNodes(nodes: TextNode[], pii: PiiCounts): TextNode[] {
  const scrubRuns = (runs: TextRun[]): TextRun[] => {
    const out = runs.map((r) => {
      const s = scrubText(r.text);
      addPii(pii, s.found);
      return { ...r, text: s.text };
    });
    const left = scrubText(plainOf(out));
    if (left.text !== plainOf(out)) {
      // Something spanned two pieces: the paragraph goes plain, without it.
      addPii(pii, left.found);
      return [{ text: left.text }];
    }
    return out;
  };
  const scrub = (text: string) => {
    const s = scrubText(text);
    addPii(pii, s.found);
    return s.text;
  };
  return nodes.map((n): TextNode => {
    switch (n.type) {
      case 'paragraph':
        return n.runs ? { type: 'paragraph', runs: scrubRuns(n.runs) } : { type: 'paragraph', text: scrub(n.text ?? '') };
      case 'heading':
        return { ...n, text: scrub(n.text).slice(0, LIMITS.headingChars) };
      case 'list':
        return { ...n, items: n.items.map((it) => (typeof it === 'string' ? scrub(it) : scrubRuns(it))) };
      case 'quote':
        return { ...n, text: scrub(n.text).slice(0, LIMITS.quoteChars), ...(n.cite ? { cite: scrub(n.cite).slice(0, LIMITS.citeChars) } : {}) };
      default:
        return n;
    }
  });
}

/** An article's HTML → the website's text, its photos and videos, what a person must review, and the personal data taken out. */
export function convertArticle(html: string, o: ConvertOptions): Converted {
  const w = new Walker(o);
  const root = parseHtml(html);
  for (const c of root.children) w.walk(c, PLAIN);
  w.flush();
  const pii = w.pii;
  let body = scrubNodes(w.nodes, pii);
  // Only what the site's schema takes (a node that does not fit is left out and the item flagged).
  const valid = body.filter((n) => textNode.safeParse(n).success);
  if (valid.length < body.length) w.flags.add('text_truncated');
  body = valid;
  if (body.length > LIMITS.nodes) {
    body = body.slice(0, LIMITS.nodes);
    w.flags.add('text_truncated');
  }
  if (pii.emails) w.flags.add('email_removed');
  if (pii.phones) w.flags.add('phone_removed');
  if (pii.ids) w.flags.add('id_removed');
  if (!body.length) w.flags.add('no_body');
  return { body, images: w.images, videos: w.videos, flags: w.flags, pii };
}

/** Plain text of the body (for the search of an automatic excerpt). */
export function bodyText(nodes: readonly TextNode[]): string {
  return nodes
    .map((n) => {
      if (n.type === 'paragraph') return n.runs ? plainOf(n.runs) : (n.text ?? '');
      if (n.type === 'list') return n.items.map((it) => (typeof it === 'string' ? it : plainOf(it))).join(' ');
      if (n.type === 'heading' || n.type === 'quote' || n.type === 'pending') return n.text;
      return '';
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Plain text of a bit of HTML (titles, excerpts, captions): entities decoded, tags and shortcodes out, spaces tidied. */
export function plainFromHtml(html: string): string {
  const root = parseHtml(html ?? '');
  const parts: string[] = [];
  const walk = (n: HtmlNode) => {
    if (n.type === 'text') parts.push(n.text);
    else if (!DROP.has(n.tag) && n.tag !== 'iframe') {
      if (n.tag === 'br' || BLOCKS.has(n.tag)) parts.push(' ');
      n.children.forEach(walk);
      if (BLOCKS.has(n.tag)) parts.push(' ');
    }
  };
  root.children.forEach(walk);
  return collapse(parts.join('').replace(SHORTCODE, ' '));
}
