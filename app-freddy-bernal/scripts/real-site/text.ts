// Sentences out of the official site's texts, never words: where the importer took out a piece of personal data it left
// a mark («[correo retirado]», scripts/web-import/pii.ts), and the public demo cannot show it (the database refuses to
// publish it: guard_web_item_ready), so the whole sentence that carries it goes. The 2014 biography's sentences about
// what he was doing «actualmente» go the same way. Pure.
import type { TextNode, TextRun } from '../../src/lib/web/blocks';
import { REMOVED_MARKS } from '../../src/lib/web/import-marks';

/** Whether a text carries one of the importer's marks. */
export const hasRemovalMark = (s: string): boolean => Object.values(REMOVED_MARKS).some((m) => s.includes(m));

// A period after one of these does not end a sentence («Dr. Ruiz», «Av. Principal», «N° 12», an initial «J. Pérez»).
const ABBREVIATION = /(?:^|[\s(«"“'])(?:\p{L}|Dr|Dra|Drs|Sr|Sra|Srta|Sres|Lic|Ing|Arq|Prof|Gral|Gob|Cnel|Tcnel|Tte|Cap|Sgto|Av|Avda|Sto|Sta|Nº|N°|No|Nro|Núm|Art|art|Pág|pág|Ud|Uds|Mons|Pbro|Esq|Urb|Edo|Mcpio|Dpto|Ej)\.$/u;
const BOUNDARY = /[.!?…]+["»”’)\]]*\s+/gu;
const STARTS_SENTENCE = /^[\p{Lu}\p{N}¿¡«"“(\-–—]/u;

/** Where each sentence of a text starts and ends (a sentence keeps the spaces after it). */
export function sentenceRanges(text: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let start = 0;
  for (const m of text.matchAll(BOUNDARY)) {
    const end = m.index + m[0].length;
    if (end >= text.length || !STARTS_SENTENCE.test(text.slice(end, end + 1))) continue;
    const upToMark = text.slice(start, m.index + 1);
    if (upToMark.endsWith('.') && ABBREVIATION.test(upToMark)) continue;
    out.push([start, end]);
    start = end;
  }
  if (start < text.length) out.push([start, text.length]);
  return out;
}

/** The text without the sentences `drop` says, spaces tidied. */
export function dropSentences(text: string, drop: (sentence: string) => boolean): string {
  const ranges = sentenceRanges(text);
  if (!ranges.some(([a, b]) => drop(text.slice(a, b)))) return text;
  return ranges
    .map(([a, b]) => text.slice(a, b))
    .filter((s) => !drop(s))
    .join('')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** The same over a paragraph's styled pieces (a sentence can span several). Empty when nothing is left. */
export function dropSentencesInRuns(runs: readonly TextRun[], drop: (sentence: string) => boolean): TextRun[] {
  const plain = runs.map((r) => r.text).join('');
  const cut = sentenceRanges(plain).filter(([a, b]) => drop(plain.slice(a, b)));
  if (!cut.length) return [...runs];
  const out: TextRun[] = [];
  let at = 0;
  for (const r of runs) {
    let t = '';
    for (let i = 0; i < r.text.length; i++) {
      const k = at + i;
      if (!cut.some(([a, b]) => k >= a && k < b)) t += r.text[i];
    }
    at += r.text.length;
    if (t) out.push({ ...r, text: t });
  }
  if (out.length) out[0] = { ...out[0], text: out[0].text.replace(/^\s+/, '') };
  if (out.length) out[out.length - 1] = { ...out[out.length - 1], text: out[out.length - 1].text.replace(/\s+$/, '') };
  const kept = out.filter((r) => r.text.length);
  return kept.some((r) => r.text.trim()) ? kept : [];
}

/** Structured text without the sentences `drop` says: a heading or a list item that carries one goes whole, and a node
 * left empty goes too. */
export function dropSentencesInNodes(nodes: readonly TextNode[], drop: (sentence: string) => boolean): TextNode[] {
  const out: TextNode[] = [];
  for (const n of nodes) {
    switch (n.type) {
      case 'paragraph': {
        if (n.runs) {
          const runs = dropSentencesInRuns(n.runs, drop);
          if (runs.length) out.push({ type: 'paragraph', runs });
        } else {
          const text = dropSentences(n.text ?? '', drop);
          if (text.trim()) out.push({ type: 'paragraph', text });
        }
        break;
      }
      case 'heading':
        if (!drop(n.text)) out.push(n);
        break;
      case 'list': {
        const items = n.items
          .map((it) => (typeof it === 'string' ? dropSentences(it, drop) : dropSentencesInRuns(it, drop)))
          .filter((it) => (typeof it === 'string' ? !!it.trim() : it.length > 0));
        if (items.length) out.push({ ...n, items });
        break;
      }
      case 'quote': {
        const text = dropSentences(n.text, drop);
        if (!text.trim()) break;
        const { cite, ...rest } = n;
        out.push(cite && !drop(cite) ? { ...rest, text, cite } : { ...rest, text });
        break;
      }
      default:
        out.push(n);
    }
  }
  return out;
}

/** The plain text of a paragraph or a heading (runs joined). */
export function plainOf(n: TextNode): string {
  if (n.type === 'paragraph') return n.runs ? n.runs.map((r) => r.text).join('') : (n.text ?? '');
  if (n.type === 'heading' || n.type === 'quote' || n.type === 'pending') return n.text;
  if (n.type === 'list') return n.items.map((it) => (typeof it === 'string' ? it : it.map((r) => r.text).join(''))).join(' ');
  return '';
}

/** Lower case, no accents, letters and numbers only: to compare a heading with a title. */
export const fold = (s: string): string =>
  s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9ñ]+/g, ' ').trim();

/** At most `max` characters, cut at a word. */
export function cut(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  const head = t.slice(0, max);
  const at = head.lastIndexOf(' ');
  return (at > max * 0.6 ? head.slice(0, at) : head).replace(/[\s,.;:–—-]+$/, '');
}
