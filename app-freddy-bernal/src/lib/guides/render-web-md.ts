// The web's and Atención's guide as Markdown (WF-C, design §4(a)): docs/GUIA-WEB.md, docs/MANUAL-ADMIN-WEB.md,
// docs/MANUAL-ATENCION.md and docs/FLUJOS-WEB.md, written back from src/lib/guides/web. The data was ported from the
// hand-written docs and this gives them back byte for byte (plus the line that says they are generated), so the
// managers' wording stays and the PDF «Guía de la web y sus flujos» keeps reading them. Pure: the client's words come in
// (clientWords()), never from the code. tests/unit/guides-docs.test.ts compares; scripts/guides-docs.mts writes them.
import type { WebBlock, WebDoc, WebFlow, WebFlowLine, Wrap } from './types';
import { fillClientWords, type ClientWords } from './web/words';

const GENERATED = (doc: WebDoc, extra = '') =>
  `<!-- Generado por \`npm run docs:guides\` desde src/lib/guides/web/ (${doc.id}.ts). No se edita a mano: se cambia la fuente y se corre otra vez.${extra} -->`;
// FLUJOS-WEB.md's line also keeps what its hand-written one asked of whoever draws.
const FLOWS_EXTRA = ' Cada diagrama se revisa para que quepa en una hoja A4 con la letra legible.';

/** The doc's lines for a text: as many words as fit in `width` with the prefix (`first`, then `cont`); null = one line. */
export function greedyLines(text: string, width: number | null, first: string, cont: string): string[] {
  if (width === null) return [first + text];
  const words = text.split(' ');
  const out: string[] = [];
  let cur = first + words[0];
  for (const w of words.slice(1)) {
    if (cur.length + 1 + w.length <= width) cur += ` ${w}`;
    else {
      out.push(cur);
      cur = cont + w;
    }
  }
  out.push(cur);
  return out;
}

/** The lines a stored wrap gives (each length, a space between), or null when it no longer fits the text. */
export function wrapFits(text: string, wrap: Wrap): string[] | null {
  if (!wrap.length || wrap.reduce((a, n) => a + n, 0) + wrap.length - 1 !== text.length) return null;
  const out: string[] = [];
  let at = 0;
  for (let i = 0; i < wrap.length; i++) {
    const piece = text.slice(at, at + wrap[i]);
    if (!piece || piece !== piece.trim() || (i < wrap.length - 1 && text[at + wrap[i]] !== ' ')) return null;
    out.push(piece);
    at += wrap[i] + 1;
  }
  return out;
}

function lines(text: string, wrap: Wrap | undefined, width: number | null, first: string, cont: string): string {
  const fit = wrap ? wrapFits(text, wrap) : null;
  return (fit ? fit.map((l, i) => (i === 0 ? first : cont) + l) : greedyLines(text, width, first, cont)).join('\n');
}

/** One block as the doc prints it (texts already filled by `fill`). `lead` goes before a paragraph's text (the date). */
function blockMd(b: WebBlock, width: number | null, fill: (s: string) => string, lead = ''): string {
  switch (b.kind) {
    case 'p':
      return lines(lead + fill(b.text), b.wrap, width, '', '');
    case 'list':
      return b.items.map((t, i) => lines(fill(t), b.wrap?.[i], width, '- ', '  ')).join('\n');
    case 'steps':
      return b.items
        .map((t, i) => {
          const pre = `${i + 1}. `;
          return lines(fill(t), b.wrap?.[i], width, pre, ' '.repeat(pre.length));
        })
        .join('\n');
    case 'table': {
      const row = (r: readonly string[]) => `| ${r.map(fill).join(' | ')} |`;
      return [row(b.head), `|${'---|'.repeat(b.head.length)}`, ...b.rows.map(row)].join('\n');
    }
    case 'note':
      return b.paras.map((t, i) => lines(fill(t), b.wrap?.[i], width, '> ', '> ')).join('\n>\n');
  }
}

/** GUIA-WEB.md and the two manuals: the title, the generated line, then each section (heading and blocks). */
function proseMd(doc: WebDoc, fill: (s: string) => string): string {
  const parts = doc.sections.map((s, si) => {
    const head = s.heading ? [`${'#'.repeat(s.heading.level)} ${s.heading.num} ${fill(s.title)}`] : [];
    const blocks = s.blocks.map((b, bi) => blockMd(b, doc.width, fill, si === 0 && bi === 0 && !s.heading && doc.date ? `**${doc.date}.** ` : ''));
    return [...head, ...blocks].join('\n\n');
  });
  return [`# ${fill(doc.title)}`, '', GENERATED(doc), parts.join('\n\n')].join('\n') + '\n';
}

// ── The flows (Mermaid) ───────────────────────────────────────────────────────────────────────────────────────────────

const SHAPE = { box: ['["', '"]'], round: ['("', '")'], decision: ['{"', '"}'] } as const;

/**
 * The drawing's lines: the flow's `layout` when it still covers every edge once and writes every node once; otherwise
 * (a flow changed or new) each source that is not written yet goes on its own line before its first edge, each target
 * in full on its first edge, and a node with no edge at the end.
 */
export function flowLayout(flow: WebFlow): WebFlowLine[] {
  const ids = flow.nodes.map((n) => n.id);
  if (flow.layout) {
    const edges = flow.layout.flatMap((l) => ('edge' in l ? [l.edge] : []));
    const written = flow.layout.flatMap((l) => {
      if ('node' in l) return [l.node];
      const e = flow.edges[l.edge];
      if (!e) return [];
      return l.def === 'both' ? [e.from, e.to] : l.def === 'from' ? [e.from] : l.def === 'to' ? [e.to] : [];
    });
    const sameEdges = edges.length === flow.edges.length && new Set(edges).size === edges.length && edges.every((k) => k >= 0 && k < flow.edges.length);
    const sameNodes = written.length === ids.length && new Set(written).size === ids.length && written.every((id) => ids.includes(id));
    if (sameEdges && sameNodes) return flow.layout;
  }
  const done = new Set<string>();
  const out: WebFlowLine[] = [];
  flow.edges.forEach((e, k) => {
    if (!done.has(e.from)) {
      out.push({ node: e.from });
      done.add(e.from);
    }
    if (!done.has(e.to)) {
      out.push({ edge: k, def: 'to' });
      done.add(e.to);
    } else out.push({ edge: k });
  });
  for (const id of ids) if (!done.has(id)) out.push({ node: id });
  return out;
}

// A label with anything but letters, digits, spaces, commas and «» goes quoted between pipes (Mermaid's rule for
// «Reabrir: En atención (con motivo)»).
const PIPE_LABEL = /[^\p{L}\p{N} ,«»]/u;

/** One flow as the doc's Mermaid, line by line. */
export function webFlowMermaid(flow: WebFlow, fill: (s: string) => string = (s) => s): string {
  const node = new Map(flow.nodes.map((n) => [n.id, n]));
  const full = (id: string) => {
    const n = node.get(id)!;
    const [a, b] = SHAPE[n.shape];
    return `${id}${a}${fill(n.text)}${b}`;
  };
  const out = ['flowchart TD'];
  for (const l of flowLayout(flow)) {
    if ('node' in l) {
      out.push(`  ${full(l.node)}`);
      continue;
    }
    const e = flow.edges[l.edge];
    const from = l.def === 'from' || l.def === 'both' ? full(e.from) : e.from;
    const to = l.def === 'to' || l.def === 'both' ? full(e.to) : e.to;
    const label = e.label === undefined ? undefined : fill(e.label);
    const op = e.dotted
      ? label === undefined
        ? ' -.-> '
        : ` -. ${label} .-> `
      : label === undefined
        ? ' --> '
        : PIPE_LABEL.test(label)
          ? ` -->|"${label}"| `
          : ` -- ${label} --> `;
    out.push(`  ${from}${op}${to}`);
  }
  return out.join('\n');
}

/** FLUJOS-WEB.md: the title, the opening (its note, the generated line, its paragraph), the list of flows, each flow. */
function flowsMd(doc: WebDoc, fill: (s: string) => string): string {
  const [opening] = doc.sections;
  const flows = doc.flows ?? [];
  const [note, ...rest] = opening.blocks;
  const out = [`# ${fill(doc.title)}`, '', blockMd(note, doc.width, fill), '', GENERATED(doc, FLOWS_EXTRA), ''];
  for (const b of rest) out.push(blockMd(b, doc.width, fill), '');
  out.push(flows.map((f) => `- [${fill(f.title)}](#${f.id})`).join('\n'));
  for (const f of flows) {
    out.push('', `<a id="${f.id}"></a>`, '', `## ${fill(f.title)}`, fill(f.who), '', '```mermaid', webFlowMermaid(f, fill), '```', '', '**Qué hay que saber**', ...f.know.map((k) => `- ${fill(k)}`));
  }
  return out.join('\n') + '\n';
}

// A reference to another section or flow, «[§aprobar]»: each doc prints the number it uses for it. The manuals and the
// flows say the PDF's («4.8»); GUIA-WEB.md says its own chapters, so the PDF's part 7 is its chapter 3 and part 3 its
// chapter 4 (parts 1 and 2 are the same).
const REF = /\[§([a-z0-9-]+)\]/g;
function docNumber(doc: WebDoc, pdf: string): string {
  if (doc.id !== 'guia-web') return pdf;
  const [a, b] = pdf.split('.');
  return `${a === '7' ? '3' : a === '3' ? '4' : a}.${b}`;
}

/** The four docs, by their path under the app's folder. */
export function renderWebDocs(docs: readonly WebDoc[], words: ClientWords): Record<string, string> {
  const pdfOf = new Map(docs.flatMap((d) => [...d.sections, ...(d.flows ?? [])].map((x) => [x.id, x.pdf] as const)));
  return Object.fromEntries(
    docs.map((d) => {
      const fill = (s: string) =>
        fillClientWords(s, words).replace(REF, (_m, id: string) => {
          const pdf = pdfOf.get(id);
          if (!pdf) throw new Error(`${d.file}: la referencia «[§${id}]» no es de ninguna sección.`);
          return docNumber(d, pdf);
        });
      return [d.file, d.flows ? flowsMd(d, fill) : proseMd(d, fill)];
    }),
  );
}
