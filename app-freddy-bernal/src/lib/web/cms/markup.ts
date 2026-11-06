import type { TextNode, TextRun } from '../blocks';

// The structured text of the website (src/lib/web/blocks.ts: headings, paragraphs, lists, quotes and «por completar»
// slots, with bold, italic and links) as the editor writes it: one box per piece, and inside a paragraph or a list a
// tiny markup that the toolbar writes for the person — **negrita**, *cursiva* and [texto](https://enlace). It is turned
// into runs here (never HTML: the site's renderer draws the runs, React escapes the text, links pass safeHref when the
// item is checked), and back. A backslash keeps a sign as it is (\* \[ \] \\); a sign that opens and never closes is
// plain text. Pure, shared by the editor (browser) and the server.

type Tok = { t: 'text'; v: string } | { t: 'bold' } | { t: 'italic' } | { t: 'link'; label: string; href: string };

const ESCAPABLE = '\\*[]';

function readLink(src: string, at: number): { label: string; href: string; end: number } | null {
  let j = at + 1;
  let label = '';
  while (j < src.length) {
    const c = src[j];
    if (c === '\\' && j + 1 < src.length && ESCAPABLE.includes(src[j + 1])) {
      label += src[j + 1];
      j += 2;
      continue;
    }
    if (c === ']') break;
    if (c === '[' || c === '\n') return null;
    label += c;
    j++;
  }
  if (src[j] !== ']' || src[j + 1] !== '(') return null;
  const close = src.indexOf(')', j + 2);
  if (close < 0) return null;
  const href = src.slice(j + 2, close).trim();
  if (!href || /\s/.test(href) || !label.trim()) return null;
  return { label, href, end: close + 1 };
}

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let buf = '';
  const flush = () => {
    if (buf) out.push({ t: 'text', v: buf });
    buf = '';
  };
  for (let i = 0; i < src.length; ) {
    const c = src[i];
    if (c === '\\' && i + 1 < src.length && ESCAPABLE.includes(src[i + 1])) {
      buf += src[i + 1];
      i += 2;
      continue;
    }
    if (c === '*') {
      flush();
      if (src[i + 1] === '*') {
        out.push({ t: 'bold' });
        i += 2;
      } else {
        out.push({ t: 'italic' });
        i += 1;
      }
      continue;
    }
    if (c === '[') {
      const link = readLink(src, i);
      if (link) {
        flush();
        out.push({ t: 'link', label: link.label, href: link.href });
        i = link.end;
        continue;
      }
    }
    buf += c;
    i++;
  }
  flush();
  return out;
}

const sameStyle = (a: TextRun, b: TextRun) => !!a.bold === !!b.bold && !!a.italic === !!b.italic && (a.href ?? '') === (b.href ?? '');

/** «Hola **mundo**» → runs with their bold, italic and link. */
export function markupToRuns(src: string): TextRun[] {
  const toks = tokenize(src);
  // A sign that never closes is plain text: the last of an odd count.
  for (const kind of ['bold', 'italic'] as const) {
    const at = toks.map((t, i) => (t.t === kind ? i : -1)).filter((i) => i >= 0);
    if (at.length % 2 === 1) toks[at[at.length - 1]] = { t: 'text', v: kind === 'bold' ? '**' : '*' };
  }
  const runs: TextRun[] = [];
  let bold = false;
  let italic = false;
  const push = (text: string, href?: string) => {
    if (!text) return;
    const run: TextRun = { text, ...(bold ? { bold: true } : {}), ...(italic ? { italic: true } : {}), ...(href ? { href } : {}) };
    const last = runs[runs.length - 1];
    if (last && sameStyle(last, run)) last.text += text;
    else runs.push(run);
  };
  for (const t of toks) {
    if (t.t === 'bold') bold = !bold;
    else if (t.t === 'italic') italic = !italic;
    else if (t.t === 'link') push(t.label, t.href);
    else push(t.v);
  }
  return runs;
}

const escape = (s: string) => s.replace(/[\\*[\]]/g, (m) => `\\${m}`);

/** Runs → the markup the editor shows (the inverse of markupToRuns). */
export function runsToMarkup(runs: readonly TextRun[]): string {
  return runs
    .filter((r) => r.text)
    .map((r) => {
      let s = r.href ? `[${escape(r.text)}](${r.href.replace(/\)/g, '%29')})` : escape(r.text);
      if (r.italic) s = `*${s}*`;
      if (r.bold) s = `**${s}**`;
      return s;
    })
    .join('');
}

/** A list item or a paragraph's content: plain text when it has no style, else runs. */
export function markupToInline(src: string): string | TextRun[] {
  const runs = markupToRuns(src);
  if (!runs.length) return '';
  if (runs.length === 1 && !runs[0].bold && !runs[0].italic && !runs[0].href) return runs[0].text;
  return runs;
}

export function inlineToMarkup(v: string | readonly TextRun[]): string {
  return typeof v === 'string' ? escape(v) : runsToMarkup(v);
}

// --- The editor's boxes ----------------------------------------------------------------------------------------------
export const EDIT_TYPES = {
  paragraph: 'Párrafo',
  h2: 'Título',
  h3: 'Subtítulo',
  list: 'Lista',
  olist: 'Lista numerada',
  quote: 'Cita',
  pending: 'Por completar',
} as const;
export type EditType = keyof typeof EDIT_TYPES;
/** One box of the editor: its kind, its text (markup in paragraphs and lists, one item per line) and a quote's author. */
export type EditNode = { type: EditType; text: string; cite?: string };

const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** Whatever was saved (a draft may be half done) → the editor's boxes. Unknown pieces are left out. */
export function nodesToEdit(nodes: unknown): EditNode[] {
  if (!Array.isArray(nodes)) return [];
  const out: EditNode[] = [];
  for (const n of nodes as Record<string, unknown>[]) {
    if (!n || typeof n !== 'object') continue;
    switch (n.type) {
      case 'paragraph':
        out.push({ type: 'paragraph', text: Array.isArray(n.runs) ? runsToMarkup(n.runs as TextRun[]) : escape(str(n.text)) });
        break;
      case 'heading':
        out.push({ type: n.level === 3 ? 'h3' : 'h2', text: str(n.text) });
        break;
      case 'list':
        out.push({
          type: n.ordered ? 'olist' : 'list',
          text: (Array.isArray(n.items) ? n.items : []).map((i) => (Array.isArray(i) ? runsToMarkup(i as TextRun[]) : escape(str(i)))).join('\n'),
        });
        break;
      case 'quote':
        out.push({ type: 'quote', text: str(n.text), ...(str(n.cite) ? { cite: str(n.cite) } : {}) });
        break;
      case 'pending':
        out.push({ type: 'pending', text: str(n.text) });
        break;
    }
  }
  return out;
}

/** The editor's boxes → structured text (empty boxes are left out). */
export function editToNodes(edits: readonly EditNode[]): TextNode[] {
  const out: TextNode[] = [];
  for (const e of edits) {
    const text = e.text.trim();
    if (!text) continue;
    switch (e.type) {
      case 'paragraph': {
        const inline = markupToInline(e.text.replace(/^\s+|\s+$/g, ''));
        if (typeof inline === 'string') {
          if (inline) out.push({ type: 'paragraph', text: inline });
        } else out.push({ type: 'paragraph', runs: inline });
        break;
      }
      case 'h2':
      case 'h3':
        out.push({ type: 'heading', level: e.type === 'h2' ? 2 : 3, text: text.replace(/\s*\n\s*/g, ' ') });
        break;
      case 'list':
      case 'olist': {
        const items = e.text
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
          .map((l) => markupToInline(l))
          .filter((i) => (typeof i === 'string' ? i : i.length));
        if (items.length) out.push({ type: 'list', ...(e.type === 'olist' ? { ordered: true } : {}), items });
        break;
      }
      case 'quote':
        out.push({ type: 'quote', text, ...(e.cite?.trim() ? { cite: e.cite.trim() } : {}) });
        break;
      case 'pending':
        out.push({ type: 'pending', text });
        break;
    }
  }
  return out;
}

/** The first words of a structured text (summaries in lists and diffs). */
export function plainText(nodes: unknown, max = 160): string {
  const parts: string[] = [];
  for (const n of Array.isArray(nodes) ? (nodes as Record<string, unknown>[]) : []) {
    if (!n || typeof n !== 'object') continue;
    if (typeof n.text === 'string') parts.push(n.text);
    else if (Array.isArray(n.runs)) parts.push((n.runs as TextRun[]).map((r) => r.text).join(''));
    else if (Array.isArray(n.items)) parts.push((n.items as unknown[]).map((i) => (typeof i === 'string' ? i : Array.isArray(i) ? (i as TextRun[]).map((r) => r.text).join('') : '')).join(' · '));
  }
  const s = parts.join(' ').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}
