// The web's and Atención's guide as app data (WF-C, design §4(a)): the four docs ported 1:1 (guia-web.ts,
// manual-admin-web.ts, manual-atencion.ts, flujos-web.ts), the seven parts of «Guía de la web y sus flujos» (the PDF the
// managers read) and where each section is in «Ayuda y guías». Data and pure functions only. The docs come back out of
// it (src/lib/guides/render-web-md.ts, `npm run docs:guides`), /ayuda/web and /ayuda/atencion show it, and 360 reads it
// (only the boss and Administración: the web's and the desk's own roles get no guides and no 360).
import type { Role } from '../../roles';
import type { WebBlock, WebDoc, WebFlow, WebPage, WebPart, WebSection } from '../types';
import { GUIA_WEB } from './guia-web';
import { MANUAL_ADMIN_WEB } from './manual-admin-web';
import { MANUAL_ATENCION } from './manual-atencion';
import { FLUJOS_WEB } from './flujos-web';
import { fillClientWords, type ClientWords } from './words';

export { GUIA_WEB, MANUAL_ADMIN_WEB, MANUAL_ATENCION, FLUJOS_WEB };
export { CLIENT_HUECOS, clientWords, fillClientWords, type ClientWords } from './words';

/** The four docs, in the order the repository lists them. */
export const WEB_DOCS: readonly WebDoc[] = [GUIA_WEB, MANUAL_ADMIN_WEB, MANUAL_ATENCION, FLUJOS_WEB];

/** The PDF's seven parts: GUIA-WEB.md's chapters are parts 1, 2, 7 and 3; the manuals 4 and 5; the flows 6. */
export const WEB_PARTS: readonly WebPart[] = [
  { n: 1, title: 'La web, sección por sección', lede: 'Qué ve la persona en cada página y de qué pantalla del panel sale.' },
  { n: 2, title: 'El recorrido del ciudadano', lede: 'Lo que hace quien escribe a «Atención ciudadana», paso a paso.' },
  { n: 3, title: 'Quién hace qué', lede: 'Qué ve y qué hace cada rol en el panel.' },
  { n: 4, title: 'Administrar la web', lede: 'El menú «Web» del panel: cómo se escribe y se publica.' },
  { n: 5, title: 'Atención ciudadana', lede: 'El menú «Atención» del panel: cómo se atiende lo que llega.' },
  { n: 6, title: 'Los flujos', lede: 'Cada flujo dibujado en un diagrama, con lo que hay que saber.' },
  { n: 7, title: 'La versión de prueba', lede: 'Qué trae y cómo se practica con cada rol.' },
];

/** «4.10» → [4, 10]. */
export function pdfNumber(pdf: string): [number, number] {
  const [a, b] = pdf.split('.').map(Number);
  return [a, b ?? 0];
}
const byPdf = (x: { pdf: string }, y: { pdf: string }) => {
  const [a1, b1] = pdfNumber(x.pdf);
  const [a2, b2] = pdfNumber(y.pdf);
  return a1 - a2 || b1 - b2;
};

/** Every section of the four docs, in the docs' order (the flows doc's opening included; its flows apart). */
export function webSections(): WebSection[] {
  return WEB_DOCS.flatMap((d) => d.sections);
}

/** The eighteen flows, in their order (6.1 to 6.18). */
export function webFlows(): WebFlow[] {
  return [...(FLUJOS_WEB.flows ?? [])];
}

/** The doc a section or a flow comes from. */
export function webDocOf(id: string): WebDoc | null {
  return WEB_DOCS.find((d) => d.sections.some((s) => s.id === id) || (d.flows ?? []).some((f) => f.id === id)) ?? null;
}

/** A section or a flow by its id, or by its number in the PDF («4.8»). */
export function webEntry(idOrPdf: string): WebSection | WebFlow | null {
  return [...webSections(), ...webFlows()].find((x) => x.id === idOrPdf || x.pdf === idOrPdf) ?? null;
}

export function isWebFlow(x: WebSection | WebFlow): x is WebFlow {
  return 'nodes' in x;
}

/**
 * The page of «Ayuda y guías» a number is on: Atención's manual (part 5) and the desk's flows (6.1 to 6.11) are in
 * /ayuda/atencion; the rest of the guide, the web's flows and the flows' opening, in /ayuda/web.
 */
export function webPageOf(pdf: string): WebPage {
  const [a, b] = pdfNumber(pdf);
  return a === 5 || (a === 6 && b >= 1 && b <= 11) ? 'atencion' : 'web';
}

export const WEB_PAGE_HREF: Record<WebPage, string> = { web: '/ayuda/web', atencion: '/ayuda/atencion' };

/** The two rows «Ayuda y guías» adds under «La guía de cada persona», with the page's title, in that order. */
export const WEB_GUIDE_ROWS: readonly { page: WebPage; href: string; label: string; detail: string }[] = [
  { page: 'web', href: WEB_PAGE_HREF.web, label: 'La web', detail: 'Qué tiene la web, cómo se escribe y se publica, y la versión de prueba' },
  { page: 'atencion', href: WEB_PAGE_HREF.atencion, label: 'Atención ciudadana', detail: 'Cómo se atiende lo que la gente manda desde la web' },
];

/**
 * The web's guide rows a person gets in «Ayuda y guías»: only the boss and Administración, who have «Web» and «Atención»
 * in their menu. The web's and the desk's own roles get no guides (WEB_ROLES), and neither does the rest of the team.
 * `roles`: the session's roles (not «Ver como»: the pages check the real ones, requireRole('boss', 'admin')).
 */
export function webGuideRows(roles: readonly Role[]): typeof WEB_GUIDE_ROWS {
  return roles.includes('boss') || roles.includes('admin') ? WEB_GUIDE_ROWS : [];
}

export type WebPartView = { part: WebPart; sections: WebSection[]; flows: WebFlow[] };

/**
 * What one part shows on one page, in the PDF's order: its sections and flows of that page, and its opening (N.0)
 * wherever the part shows (the flows' opening is on both pages). Null when the part has nothing of that page.
 */
export function webPart(n: number, page: WebPage): WebPartView | null {
  const part = WEB_PARTS.find((p) => p.n === n);
  if (!part) return null;
  const inPart = (x: { pdf: string }) => pdfNumber(x.pdf)[0] === n;
  const sections = webSections()
    .filter((s) => inPart(s) && (webPageOf(s.pdf) === page || pdfNumber(s.pdf)[1] === 0))
    .sort(byPdf);
  const flows = webFlows()
    .filter((f) => inPart(f) && webPageOf(f.pdf) === page)
    .sort(byPdf);
  return flows.length > 0 || sections.some((s) => webPageOf(s.pdf) === page) ? { part, sections, flows } : null;
}

/** The parts a page shows, in order: /ayuda/web parts 1, 2, 3, 4, 6 (the web's flows) and 7; /ayuda/atencion 5 and 6. */
export function webPartsOf(page: WebPage): WebPartView[] {
  return WEB_PARTS.map((p) => webPart(p.n, page)).filter((x): x is WebPartView => x !== null);
}

/** Where a section or a flow is read in the app: its page, its part and its anchor. */
export function webHref(idOrPdf: string): string | null {
  const x = webEntry(idOrPdf);
  if (!x) return null;
  const page = WEB_PAGE_HREF[webPageOf(x.pdf)];
  if (isWebFlow(x)) return `${page}?flujo=${x.id}`;
  const [n, m] = pdfNumber(x.pdf);
  if (n === 0) return page;
  return m === 0 ? `${page}?parte=${n}` : `${page}?parte=${n}#${x.id}`;
}

/** The texts of a block, one per paragraph, item or cell (huecos unfilled). */
export function blockTexts(b: WebBlock): string[] {
  switch (b.kind) {
    case 'p':
      return [b.text];
    case 'list':
    case 'steps':
      return [...b.items];
    case 'note':
      return [...b.paras];
    case 'table':
      return [...b.head, ...b.rows.flat()];
  }
}

/** Every text of a section or a flow that a person reads (huecos unfilled): title, blocks; a flow's line, nodes, labels
 * and «Qué hay que saber». 360's fields are apart (webFacetTexts). */
export function webTexts(x: WebSection | WebFlow): string[] {
  if (isWebFlow(x)) return [x.title, x.who, ...x.nodes.map((n) => n.text), ...x.edges.flatMap((e) => (e.label ? [e.label] : [])), ...x.know];
  return [x.title, ...x.blocks.flatMap(blockTexts)];
}

/** The texts of 360's fields of a section or a flow (empty in the port; the next round fills them). */
export function webFacetTexts(x: WebSection | WebFlow): string[] {
  const role = (t: unknown): string[] => (typeof t === 'string' ? [t] : t && typeof t === 'object' ? Object.values(t as Record<string, string>) : []);
  return [
    ...role(x.what),
    ...(x.items ?? []).flatMap(role),
    ...(x.tasks ?? []).flatMap((t) => [t.title, t.when ?? '', ...t.steps].filter(Boolean)),
    ...Object.values(x.cannot ?? {}).flat(),
    ...(x.rules ?? []),
    ...(x.faq ?? []).flatMap((f) => [f.q, ...role(f.a)]),
    ...role(x.easy),
    ...role(x.example),
    ...(x.why ? [x.why] : []),
  ];
}

// ── References («ver [§ajustes-del-sitio]») ───────────────────────────────────────────────────────────────────────

/** A reference to another section or flow: «[§id]». The docs print each one as the number they use for it («ver
 * 4.13»); «Ayuda y guías» as the PDF's number, linked; 360 as it likes (never the bare marker). */
export const WEB_REF = /\[§([a-z0-9-]+)\]/g;

/** The ids a text points at, in order. */
export function webRefs(text: string): string[] {
  return [...text.matchAll(WEB_REF)].map((m) => m[1]);
}

/** A web text ready to read: the client's words filled, and each reference as `ref` says (the PDF's number by default). */
export function fillWebText(text: string, words: ClientWords, ref: (id: string) => string = (id) => webEntry(id)?.pdf ?? ''): string {
  return fillClientWords(text, words).replace(WEB_REF, (_m, id: string) => ref(id));
}

// GUIA-WEB.md names the two manuals in words where the PDF gives a number or a part: «(ver el manual de la web, punto 6)»
// is 4.6 there, «El detalle está en el manual de la web.» is part 4. The manuals and the flows already say the PDF's.
const marker = (pdf: string) => {
  const x = webEntry(pdf);
  return x ? `[§${x.id}]` : pdf;
};
const GUIA_WORDS: [RegExp | string, string | ((m: string, n: string) => string)][] = [
  [/\(ver\s+el\s+manual\s+de\s+la\s+web,\s+punto\s+(\d+)\)/g, (_m, n) => `(ver ${marker(`4.${n}`)})`],
  [/\(ver\s+el\s+manual\s+de\s+atención,\s+punto\s+(\d+)\)/g, (_m, n) => `(ver ${marker(`5.${n}`)})`],
  ['El detalle está en el manual de la web.', 'El detalle está en la parte 4.'],
  ['El manual de atención trae el detalle:', 'La parte 5 trae el detalle:'],
  ['paso a paso: el manual de la web.', 'paso a paso: la parte 4.'],
  ['paso a paso: el manual de atención.', 'paso a paso: la parte 5.'],
  ['con lo que hay que saber: los flujos de la web y de la atención ciudadana.', 'con lo que hay que saber: la parte 6.'],
];

/**
 * A text as «Guía de la web y sus flujos» says it, the way «Ayuda y guías» shows it: GUIA-WEB.md's words for the two
 * manuals become the PDF's references and parts («(ver el manual de la web, punto 6)» → «(ver [§bloques-y-formato])»,
 * «el manual de la web» → «la parte 4»), as the PDF does. The other docs already say them.
 */
export function pdfText(doc: WebDoc | null, text: string): string {
  if (doc?.id !== 'guia-web') return text;
  let t = text;
  for (const [from, to] of GUIA_WORDS) {
    if (typeof from === 'string') t = t.replaceAll(from, to as string);
    else t = t.replace(from, to as (m: string, n: string) => string);
  }
  return t;
}
