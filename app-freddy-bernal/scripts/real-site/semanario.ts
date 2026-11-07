// The weekly («Semanario») as the official home shows it: a section titled «Semanario» with one cover photo linked to a
// PDF on Google Drive. Found in the home's HTML (scripts/web-import/html.ts reads it; nothing in it runs), its cover
// brought from the official site and its PDF from Drive (only drive.google.com / drive.usercontent.google.com, a PDF
// of at most 20 MB). The Drive address and its id are never written anywhere but the build's memory. Pure.
import { findAll, parseHtml, textOf, type HtmlElement, type HtmlNode } from '../web-import/html';
import { fold } from './text';

export type SemanarioRef = {
  driveId: string;
  cover: { src: string; attachmentId: number | null; alt: string } | null;
};

export const DRIVE_HOSTS = ['drive.google.com', 'drive.usercontent.google.com'] as const;
export const PDF_MAX_BYTES = 20 * 1024 * 1024;

/** The id of a Drive file from its addresses («/file/d/<id>/view», «/open?id=<id>», «/uc?id=<id>»), or null. */
export function driveFileId(href: string): string | null {
  let u: URL;
  try {
    u = new URL(href.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || !['drive.google.com', 'docs.google.com'].includes(u.hostname.toLowerCase())) return null;
  const inPath = /^\/file\/d\/([A-Za-z0-9_-]{10,200})(?:\/|$)/.exec(u.pathname);
  const id = inPath?.[1] ?? (/^\/(?:open|uc)$/.test(u.pathname) ? u.searchParams.get('id') : null);
  return id && /^[A-Za-z0-9_-]{10,200}$/.test(id) ? id : null;
}

/** Where Drive hands out the file itself (it redirects to drive.usercontent.google.com). */
export function driveDownloadUrl(id: string): string {
  return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`;
}
export function driveViewUrl(id: string): string {
  return `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`;
}

function elementsInOrder(root: HtmlNode): HtmlElement[] {
  return findAll(root, () => true);
}

const imageSrc = (img: HtmlElement) => {
  for (const k of ['data-src', 'data-lazy-src', 'data-orig-file', 'src']) {
    const v = (img.attrs[k] ?? '').trim();
    if (v && !/^data:/i.test(v)) return v;
  }
  return '';
};

/** The home's «Semanario» section: the Drive file its cover links, and the cover. Null when the home has none. */
export function findSemanario(html: string, baseUrl: string): SemanarioRef | null {
  const all = elementsInOrder(parseHtml(html));
  const at = all.findIndex((el) => /^h[1-6]$/.test(el.tag) && fold(textOf(el)) === 'semanario');
  if (at < 0) return null;
  for (let i = at + 1; i < all.length; i++) {
    const el = all[i];
    // The next section starts: the weekly had no Drive link.
    if (/^h[1-3]$/.test(el.tag)) return null;
    if (el.tag !== 'a') continue;
    const id = driveFileId(el.attrs.href ?? '');
    if (!id) continue;
    const img = findAll(el, (x) => x.tag === 'img')[0];
    let cover: SemanarioRef['cover'] = null;
    if (img) {
      const src = imageSrc(img);
      try {
        const abs = src ? new URL(src, baseUrl).toString() : '';
        const wp = /(?:^|\s)wp-image-(\d{1,12})(?:\s|$)/.exec(img.attrs.class ?? '');
        if (abs.startsWith('https://') || abs.startsWith('http://')) cover = { src: abs, attachmentId: wp ? Number(wp[1]) : null, alt: (img.attrs.alt ?? '').trim() };
      } catch {
        cover = null;
      }
    }
    return { driveId: id, cover };
  }
  return null;
}

/** «attachment; filename="x.pdf"» (or filename*=UTF-8''…) → «x.pdf». */
export function fileNameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const star = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(header);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, '')) || null;
    } catch {
      // fall through to the plain one
    }
  }
  const plain = /filename\s*=\s*("([^"]*)"|[^;]+)/i.exec(header);
  return plain ? (plain[2] ?? plain[1]).trim() || null : null;
}

/** A name that says something («Semanario N° 189», not «1_5082363512936728660.pdf»): its words, or null. */
export function meaningfulName(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw
    .replace(/\s+-\s+Google Drive\s*$/i, '')
    .replace(/\.pdf$/i, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = s.match(/\p{L}{3,}/gu) ?? [];
  return words.length >= 2 && s.length >= 6 && s.length <= 160 ? s : null;
}

/** The weekly's title: the Drive file's name or its page's title when they say something, else the configured name. */
export function semanarioTitle(o: { fileName: string | null; pageTitle: string | null; fallback: string }): string {
  return meaningfulName(o.fileName) ?? meaningfulName(o.pageTitle) ?? o.fallback;
}

const latin1 = (bytes: Uint8Array, from: number, to: number) => {
  let s = '';
  for (let i = from; i < Math.min(to, bytes.length); i++) s += String.fromCharCode(bytes[i]);
  return s;
};
/** The readable start and end of a PDF (its metadata lives there in practice). */
const pdfText = (bytes: Uint8Array) => `${latin1(bytes, 0, 64 * 1024)}\n${latin1(bytes, Math.max(0, bytes.length - 64 * 1024), bytes.length)}`;

/** The day a PDF was made («/CreationDate (D:20261015061736-04'00')» → «2026-10-15», in its own zone), or null. */
export function pdfCreationDay(bytes: Uint8Array): string | null {
  const m = /\/CreationDate\s*\(\s*D:(\d{4})(\d{2})(\d{2})/.exec(pdfText(bytes));
  if (!m) return null;
  const day = `${m[1]}-${m[2]}-${m[3]}`;
  return !Number.isNaN(Date.parse(`${day}T00:00:00Z`)) && new Date(`${day}T00:00:00Z`).toISOString().startsWith(day) ? day : null;
}

/** How many pages a PDF says it has (its page tree's /Count), or null. */
export function pdfPageCount(bytes: Uint8Array): number | null {
  const text = latin1(bytes, 0, bytes.length > 8 * 1024 * 1024 ? 8 * 1024 * 1024 : bytes.length);
  let best = 0;
  for (const m of text.matchAll(/\/Type\s*\/Pages\b[^>]*?\/Count\s+(\d{1,5})|\/Count\s+(\d{1,5})[^>]*?\/Type\s*\/Pages\b/g)) {
    best = Math.max(best, Number(m[1] ?? m[2]));
  }
  return best >= 1 && best <= 5000 ? best : null;
}
