// 360 explains the web's and Atención's guide (design §4(c), WF-C): the same asks as explain.ts («no entendí», «paso a
// paso», «dame un ejemplo», «¿y después?», «¿para qué sirve?», «¿por qué?», «dime más», «sí» after «¿Sigo?»), for a topic
// that is a section or a flow of src/lib/guides/web (an entry `web:<section>…` or `webflujo:<flow>…` of the index).
// From the section's own 360 fields (easy, example, why, what, tasks) when the guide has them, else from what the guide
// says, never a text said before in the thread, and null when there is nothing new (the caller goes on as today). Never
// a receipt's code or key, not even the demo's or an example's (design §4(e)): a section that prints them is only
// pointed to (its own entry is the fixed line, engine.ts `quiet`), and any other text that has one is left out.
// Pure: no database, no I/O.
import type { Role } from '../roles';
import type { Audience, GlossaryTerm, GlossaryText, RoleText, WebBlock, WebFlow, WebSection, WebTask } from '../guides/types';
import { hasReceiptCode } from '../guides/check';
import { glossaryLine } from '../guides/glossary';
import { PANEL_SCREENS, WEB_GLOSSARY, isWebFlow, webEntry, webFlows, webHref } from '../guides/web';
import { WEAK, entryById, findAnswers, textFor, tokens, type Entry } from './answers/engine';
import { saysIf, sentenceSaying, sentencesOf, type Facet } from './explain';
import { canOpen } from './screens';
import { plain } from './text';

export type WebExplained = { text: string; entryId: string; goTo?: string; cursor?: number };
// `asked`: the question the topic answered in this thread (WF-C2): the section a curated answer of the web is about.
type Ctx = { roles: Role[]; said?: string[]; cursor?: number; about?: string; asked?: string };

const PAGE = 3;
const PAGE_LETTERS = 440;
const end = (s: string) => (/[.!?…»)]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);
const lcFirst = (s: string) => (s.startsWith('«') ? s : s.charAt(0).toLowerCase() + s.slice(1));
const clean = (t: string) =>
  t
    .replace(/\s*\((?:ver|véase)\s+(?:\[§[a-z0-9-]+\](?:,\s*|\s+y\s+)?)+\)/g, '')
    .replace(/\[§([a-z0-9-]+)\]/g, (_m, id: string) => webEntry(id)?.title ?? '')
    .replace(/\*\*/g, '')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\s+([.,;:])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

/** The section or flow of a web entry's id, and the entry's own place in it (a task, a step, a box). */
function placeOf(id: string): { x: WebSection | WebFlow; rest: string } | null {
  const m = /^(web|webflujo):([a-z0-9-]+)(?::(.*))?$/.exec(id);
  if (!m) return null;
  const x = webEntry(m[2]);
  return x ? { x, rest: m[3] ?? '' } : null;
}
const audienceOf = (roles: Role[]): Audience | 'default' => (roles.includes('boss') ? 'boss' : roles.includes('admin') ? 'admin' : 'default');
function forRole(t: RoleText | undefined, roles: Role[]): string | undefined {
  if (t === undefined) return undefined;
  const s = typeof t === 'string' ? t : (t[audienceOf(roles)] ?? t.default);
  return sayable(s) ? s : undefined;
}
// Someone named in a text of the web or of Atención: whose step or rule it is («¿y quién lo hace?»).
const WHO_NAMED = /\b(?:jefe|tu|administracion|coordinacion|coordinador\w*|responsables? de area|operador\w* de denuncias|auditoria|editor\w*|aprobador\w*|quien aprueba|quienes atienden|la persona|cualquier persona|nadie)\b/;
/** A text 360 may say: one without a receipt's code or key. */
const sayable = (t: string | undefined): t is string => !!t && !hasReceiptCode(t);
/** A section whose text 360 never says (it prints the demo receipts, keys or example codes): its entry only points. */
const quietOf = (x: WebSection | WebFlow) => !isWebFlow(x) && !!entryById(`web:${x.id}`)?.quiet;
const wasSaid = (text: string, said: string[]) => {
  const p = plain(text);
  return !!p && said.some((s) => plain(s).includes(p));
};
/** The guide's button for a section or a flow, when this person can open it. */
const guideOf = (x: WebSection | WebFlow, roles: Role[]) => {
  const h = webHref(x.id);
  return h && canOpen(h, roles) ? h : undefined;
};

/** A 360 task this person does: one with no audience of its own, or one with theirs (WebTask.audience). */
const doesIt = (t: WebTask, roles: Role[]) => !t.audience || (t.audience as readonly string[]).includes(audienceOf(roles));
/** A section with a how-to that only the other one does (the boss publishes, Administración gives the roles). */
const othersTask = (x: WebSection | WebFlow, roles: Role[]) => (x.tasks ?? []).some((t) => !doesIt(t, roles));
/** This person's own «No: …» of a section, for a how-to that is someone else's (never its steps as theirs). */
function cannotOf(x: WebSection | WebFlow, roles: Role[]): string | undefined {
  const aud = audienceOf(roles);
  if (aud === 'default' || !othersTask(x, roles)) return undefined;
  const line = (x.cannot?.[aud] ?? []).find(sayable);
  return line ? end(clean(line)) : undefined;
}

/**
 * The numbered steps of a section or a flow's main path (without a box that has a code). A section's: the 360 task the
 * topic is (its id says «tarea:<id>»), else this person's first one with no code in it; the guide's list the topic is
 * («pasos:<n>», its n-th list of steps, as the index numbers them); else its first list of steps, unless the section is
 * one 360 never says or its how-tos are someone else's (WebTask.audience: then none, and `cannotOf` says why).
 */
function stepsOf(x: WebSection | WebFlow, roles: Role[], rest = ''): string[] {
  if (isWebFlow(x)) {
    const byId = new Map(x.nodes.map((n) => [n.id, n]));
    const out: string[] = [];
    const seen = new Set<string>();
    let n = x.nodes[0];
    while (n && !seen.has(n.id)) {
      seen.add(n.id);
      if (sayable(n.text)) out.push(end(clean(n.text)));
      const exits = x.edges.filter((e) => e.from === n!.id && !e.dotted);
      const next = exits.find((e) => /^s[ií]$/i.test(e.label ?? '')) ?? exits[0];
      n = next ? byId.get(next.to)! : undefined!;
    }
    return out;
  }
  const mine = (x.tasks ?? []).filter((t) => doesIt(t, roles) && t.steps.every(sayable));
  const asked = /^tarea:([a-z0-9-]+)/.exec(rest)?.[1];
  const task = mine.find((t) => t.id === asked) ?? mine[0];
  if (task) return task.steps.map((s) => end(clean(s)));
  if (quietOf(x) || othersTask(x, roles)) return [];
  // The index's lists of steps (engine.ts webUnits): not part 1's (the order of a page), none with a code.
  const list = /^pasos:(\d+)/.exec(rest)?.[1];
  const lists = x.pdf.startsWith('1.') ? [] : x.blocks.filter((b): b is Extract<WebBlock, { kind: 'steps' }> => b.kind === 'steps' && b.items.length > 0 && b.items.every(sayable));
  if (list !== undefined && lists[Number(list)]) return lists[Number(list)].items.map((s) => end(clean(s)));
  const block = x.blocks.find((b) => b.kind === 'steps');
  return block && block.kind === 'steps' && block.items.every(sayable) ? block.items.map((s) => end(clean(s))) : [];
}
/**
 * What a section says, unit by unit: its 360 items, then its paragraphs and lists (none of a quiet one's). `guideFirst`:
 * the guide's own words before the items, for what something is for (an item says what is on the screen, the guide's
 * first paragraph what it is).
 */
function partsOf(x: WebSection | WebFlow, roles: Role[], guideFirst = false): string[] {
  const own = (x.items ?? []).map((t) => forRole(t, roles)).filter(sayable).map((t) => end(clean(t)));
  if (isWebFlow(x)) return [...own, ...x.know.filter(sayable).map((k) => end(clean(k)))];
  if (quietOf(x)) return own;
  const fromBlocks = x.blocks.flatMap((b) => (b.kind === 'p' ? [b.text] : b.kind === 'list' ? b.items : b.kind === 'note' ? b.paras : [])).filter(sayable).map((t) => clean(t)).filter((t) => t && !/:\s*$/.test(t)).map(end);
  return guideFirst ? [...fromBlocks, ...own] : [...own, ...fromBlocks];
}
/**
 * «No entendí lo de gana el más corto»: the part of the section that says X (its items, the guide's words, its rules, its
 * questions' answers, this person's steps), when it has most of X's words; else null (the facet goes on as without X).
 */
function partNamed(x: WebSection | WebFlow, roles: Role[], about: string, bonus?: (t: string) => number): string | null {
  const want = tokens(about).filter((w) => w.length >= 3);
  if (!want.length) return null;
  const like = (have: string[], w: string) => have.some((h) => h === w || (h.length >= 4 && w.length >= 4 && (h.startsWith(w) || w.startsWith(h))));
  const parts = [
    ...partsOf(x, roles),
    ...(x.rules ?? []).filter(sayable).map((r) => end(clean(r))),
    ...(x.faq ?? []).map((f) => forRole(f.a, roles)).filter(sayable).map((t) => end(clean(t))),
    ...stepsOf(x, roles),
  ];
  let best: string | null = null;
  let top = 0;
  for (const t of parts) {
    const have = tokens(t);
    const share = want.filter((w) => like(have, w)).length / want.length;
    // (A preference orders the parts that already say X; it never makes one.)
    const score = share + (bonus && share >= 0.6 ? bonus(t) : 0);
    if (score > top) [best, top] = [t, score];
  }
  return top >= 0.6 ? best : null;
}
/** A section's own question that asks what it is for («¿Para qué sirve la vista previa?», «¿Para qué es…?»). */
const PURPOSE_Q = /^¿?\s*para\s+qu[eé]\s+(?:sirve|sirven|es|son)\b/i;
/** A section's own question that asks what something is or what it is for («¿Qué son las respuestas guardadas?»). */
const DEFINE_Q = /^¿?\s*(?:qu[eé]\s+(?:es|son)|para\s+qu[eé]\s+(?:sirve|sirven|es|son))\b/i;
const likeRoot = (have: string[], w: string) => have.some((h) => h === w || (h.length >= 4 && w.length >= 4 && (h.startsWith(w) || w.startsWith(h))));
/** Whether a question of the guide asks what the person asked: most of its words are the person's. */
function sameAsk(guideQ: string, asked: string): boolean {
  const want = tokens(guideQ).filter((w) => w.length >= 3);
  const have = tokens(asked);
  return want.length > 0 && want.filter((w) => likeRoot(have, w)).length / want.length >= 0.6;
}
/** Whether most of a text's words were in one answer of the thread already (said again in other words). */
function nearSaid(text: string, said: string[]): boolean {
  const its = tokens(text).filter((w) => w.length >= 4);
  if (!its.length) return false;
  return said.some((x) => {
    const have = tokens(x);
    return its.filter((w) => likeRoot(have, w)).length / its.length >= 0.7;
  });
}
/**
 * The section a curated answer of the web is about: the one its button's anchor names, else the panel screen's; else
 * (WF-C2) the section or flow of the guide's first answers to what the person asked (or to the answer's own first way of
 * asking), when that text says a fair share of the curated answer's words.
 */
function sectionOfCurated(e: Entry, roles: Role[], asked?: string): WebSection | WebFlow | null {
  const anchor = e.go ? /#([a-z0-9-]+)$/.exec(e.go)?.[1] : undefined;
  const byAnchor = anchor ? webEntry(anchor) : undefined;
  if (byAnchor && !isWebFlow(byAnchor)) return byAnchor;
  const panel = e.go ? PANEL_SCREENS.find((p) => p.screen === e.go!.split(/[?#]/)[0]) : undefined;
  const x = panel ? webEntry(panel.section) : undefined;
  if (x && !isWebFlow(x)) return x;
  const said = new Set(tokens(textFor(e.a, roles)).filter((w) => w.length >= 4));
  for (const q of [asked, e.q[0]].filter((t): t is string => !!t)) {
    const found = findAnswers(q, { roles, limit: 8 }).filter((m) => m.entry.kind !== 'curated' && /^(?:web|webflujo):/.test(m.entry.id) && m.score >= WEAK);
    for (const m of found.slice(0, 3)) {
      const at = placeOf(m.entry.id);
      if (!at) continue;
      const has = new Set(tokens([at.x.title, ...partsOf(at.x, roles), ...stepsOf(at.x, roles)].join(' ')));
      const share = said.size ? [...said].filter((w) => has.has(w)).length / said.size : 0;
      if (share >= 0.3) return at.x;
    }
  }
  return null;
}
function page(title: string | null, steps: string[], from: number): { text: string; next?: number } {
  const out: string[] = [];
  let k = from;
  for (; k < steps.length && out.length < PAGE; k++) {
    const line = `${k + 1}) ${steps[k]}`;
    if (out.length && [...out, line].join(' ').length > PAGE_LETTERS) break;
    out.push(line);
  }
  const more = k < steps.length;
  return { text: `${title ? `${title}, paso a paso: ` : ''}${out.join(' ')}${more ? ' ¿Sigo?' : ''}`, ...(more ? { next: k } : {}) };
}

// ── Where a thread is in a section's steps or in a flow (WF-C2) ─────────────────────────────────────────────────────

// A step was said when the thread's last answers have its beginning, or every label it quotes.
const labelsOf = (t: string) => [...t.matchAll(/«([^«»]+)»/g)].map((m) => plain(m[1])).filter(Boolean);
function stepSaid(step: string, said: string[]): boolean {
  const p = plain(step);
  const labels = labelsOf(step);
  return said.slice(-3).some((x) => {
    const r = plain(x);
    return (!!p && r.includes(p.slice(0, Math.min(p.length, 60)))) || (labels.length > 0 && labels.every((l) => r.includes(l)));
  });
}
/** How far the thread said the steps, in order from the first (−1: none). */
function saidThrough(steps: string[], said: string[]): number {
  let k = -1;
  while (k + 1 < steps.length && stepSaid(steps[k + 1], said)) k++;
  return k;
}
const likeWord = (have: string[], w: string) => have.some((h) => h === w || (h.length >= 4 && w.length >= 4 && (h.startsWith(w) || w.startsWith(h))));
/** The step that says X (most of its words), or −1. */
function stepAbout(steps: string[], about: string): number {
  const want = tokens(about).filter((w) => w.length >= 3);
  if (!want.length) return -1;
  let best = -1;
  let top = 0;
  steps.forEach((st, k) => {
    const share = want.filter((w) => likeWord(tokens(st), w)).length / want.length;
    if (share > top || (share === top && share > 0)) [best, top] = [k, share];
  });
  return top >= 0.6 ? best : -1;
}
/**
 * What comes after X in the web's flows (6.1-6.18): the box of a flow this person reads that says X best (or the text
 * just said), and the box after it on its main path, with the one after that when both are short. Null when no box says
 * enough of X.
 */
function flowAfter(x: string, roles: Role[], said: string[], within?: WebFlow): { text: string; flow: WebFlow } | null {
  const want = tokens(x).filter((w) => w.length >= 3);
  if (!want.length) return null;
  let best: { flow: WebFlow; k: number; score: number } | null = null;
  for (const f of within ? [within] : webFlows()) {
    if (!f.audience.some((a) => roles.includes(a as Role))) continue;
    const path = stepsOf(f, roles);
    path.forEach((t, k) => {
      if (k + 1 >= path.length) return;
      const share = want.filter((w) => likeWord(tokens(t), w)).length / want.length;
      if (share >= 0.6 && (!best || share > best.score)) best = { flow: f, k, score: share };
    });
  }
  if (!best) return null;
  const { flow, k } = best;
  const path = stepsOf(flow, roles);
  const next = path.slice(k + 1).filter((t) => !wasSaid(t, said));
  if (!next.length) return null;
  const text = next[1] && next[0].length + next[1].length < 260 ? `Después: ${lcFirst(next[0])} ${next[1]}` : `Después: ${lcFirst(next[0])}`;
  return { text, flow };
}

// ── The words of «Palabras de la web» and «Palabras de la atención» (WF-C, src/lib/guides/web/glossary.ts) ──────────
// A word asked what it means («¿qué es borrador en la web?») is the topic `palabra:<id>`: explained from its own fields
// (easy, example, why) first, then from the section of the guide that explains it (its `section`, when this person reads
// it). «¿Qué significa eso?» after any answer of the web or Atención says the first of these words that answer named.

const webTermOf = (id: string): GlossaryTerm | null => (id.startsWith('palabra:') ? (WEB_GLOSSARY.find((g) => `palabra:${g.id}` === id) ?? null) : null);
/** A word's text for this person (its own, or the one for everyone else). */
function termText(t: GlossaryText | undefined, roles: Role[]): string | undefined {
  const s = typeof t === 'string' || t === undefined ? t : (roles.map((r) => t[r]).find((x): x is string => !!x) ?? t.default);
  return sayable(s) ? s : undefined;
}
// The words a text names, by their names said whole, first named first (the boss's and Administración's).
function termsNamedIn(text: string): GlossaryTerm[] {
  const t = ` ${plain(text.replace(/«([^«»]*)»/g, ' $1 '))} `;
  const at = (g: GlossaryTerm) => Math.min(...[g.term, ...g.aka].map((n) => t.indexOf(` ${plain(n)} `)).filter((k) => k >= 0), Infinity);
  return WEB_GLOSSARY.map((g) => ({ g, k: at(g) }))
    .filter((x) => x.k < Infinity)
    .sort((a, b) => a.k - b.k || b.g.term.length - a.g.term.length)
    .map((x) => x.g);
}
/** «¿Qué significa eso?» of an answer of the web or Atención: the first word of the glossary it named, not said yet. */
function meaningOf(said: string[], roles: Role[]): WebExplained | null {
  for (const g of termsNamedIn(said.at(-1) ?? '')) {
    const id = `palabra:${g.id}`;
    for (const line of [glossaryLine(g), termText(g.easy, roles)]) if (line && !wasSaid(line, said)) return { text: line, entryId: id };
  }
  return null;
}
function termExplain(facet: Facet, e: Entry, g: GlossaryTerm, ctx: Ctx): WebExplained | null {
  const roles = ctx.roles;
  const said = ctx.said ?? [];
  const own = { entryId: e.id };
  const fresh = (list: (WebExplained | null | undefined)[]) => list.find((c): c is WebExplained => !!c && !!c.text && !wasSaid(c.text, said)) ?? null;
  const as = (t: string | undefined, go?: string) => (t ? { text: end(t), ...own, ...(go ? { goTo: go } : {}) } : null);
  // The section that explains it, when this person reads it (its entry is for their audience), and its place in the guide.
  const section = g.section ? entryById(`web:${g.section}`) : undefined;
  const readsIt = !!section && (!section.roles || section.roles.some((r) => roles.includes(r)));
  const x = readsIt && g.section ? webEntry(g.section) : null;
  const guide = x ? guideOf(x, roles) : undefined;
  const fromSection = (f: Facet) => (readsIt && section ? webExplain(f, section, { ...ctx, about: undefined }) : null);
  const easy = termText(g.easy, roles);
  const example = termText(g.example, roles);
  const why = termText(g.why, roles);
  const first = sentencesOf(g.text)[0];
  switch (facet) {
    case 'simpler':
    case 'meaning':
      return fresh([as(easy), fromSection('simpler'), as(first && `${first}${guide ? ' La guía lo explica con calma: toca el botón.' : ''}`, guide)]);
    case 'example':
      return fresh([as(example), fromSection('example')]);
    case 'why':
      return fresh([as(why), fromSection('why'), as(first && `La guía no da el porqué de eso. Lo que dice es esto: ${lcFirst(end(first))}`, guide)]);
    case 'purpose': {
      // What it is for: what its meaning says it is for («… sirve para conocer la app…», «…, para que ningún enlace se
      // pierda»), said on its own («Es para…»); then the section's own «¿Para qué sirve…?» of this word, then the
      // section's.
      const m = /\bsirve para\s+([^.;]+)|,\s+para\s+([^.;]+)/i.exec(g.text);
      const forWhat = m ? `Es para ${m[1] ?? m[2]}` : undefined;
      const names = [g.term, ...g.aka].map((n) => ` ${plain(n)} `);
      const asked = x && !isWebFlow(x) ? (x.faq ?? []).filter((f) => PURPOSE_Q.test(f.q) && names.some((n) => ` ${plain(f.q)} `.includes(n))).map((f) => forRole(f.a, roles)) : [];
      return fresh([as(forWhat), ...asked.map((t) => as(t && clean(t), guide)), fromSection('purpose'), as(easy)]);
    }
    case 'more':
      return fresh([as(example), fromSection('more')]);
    case 'steps':
    case 'next':
      return fromSection(facet);
    default:
      return null;
  }
}

/**
 * That facet of a web topic for this person, or null. `topic`: the entry that answered the turn before (its id is
 * `web:<section>…`, `webflujo:<flow>…` or, for a word of the web's or Atención's glossary, `palabra:<id>`); `cursor`:
 * where its steps go on after a «¿Sigo?».
 */
export function webExplain(facet: Facet, topic: Entry | string | null | undefined, ctx: Ctx): WebExplained | null {
  const e = typeof topic === 'string' ? entryById(topic) : topic;
  if (!e || !e.domain || e.domain === 'equipo') return null;
  if (e.roles && !e.roles.some((r) => ctx.roles.includes(r))) return null;
  const term = e.kind === 'term' ? webTermOf(e.id) : null;
  if (term) return termExplain(facet, e, term, ctx);
  // «¿Qué significa eso?» after an answer of the web or Atención: the first word of its glossary that answer named.
  if (facet === 'meaning' && !ctx.about) return meaningOf(ctx.said ?? [], ctx.roles);
  // (A curated answer of the web, «¿qué es «De la web vieja»?», is explained from the section it is about, with its own
  // words as what was said: «rest» says it is not the section itself.)
  const curated = e.kind === 'curated' ? sectionOfCurated(e, ctx.roles, ctx.asked) : null;
  const place = curated ? { x: curated, rest: 'curado' } : placeOf(e.id);
  if (!place) return null;
  const { x } = place;
  const roles = ctx.roles;
  const said = ctx.said ?? [];
  const guide = guideOf(x, roles);
  const own = { entryId: e.id };
  const title = clean(x.title).replace(/\s*\([^)]*\)\s*$/, '');
  const fresh = (list: (WebExplained | null)[]) => list.find((c): c is WebExplained => !!c && !!c.text && !wasSaid(c.text, said)) ?? null;
  const steps = stepsOf(x, roles, place.rest);
  const stepsFrom = (from: number): WebExplained | null => {
    if (from >= steps.length) return null;
    const p = page(from === 0 ? title : null, steps, from);
    return { text: p.text, ...own, ...(p.next !== undefined ? { cursor: p.next } : {}), ...(guide ? { goTo: guide } : {}) };
  };
  // Where the steps go on: the cursor of a «¿Sigo?», a story's own cursor, or the step this entry is.
  const stepNo = /(?:^|:)(?:pasos:\d+:|tarea:[a-z0-9-]+:)(\d+)$/.exec(place.rest)?.[1];
  const at = ctx.cursor ?? (e.kind === 'flowStory' ? e.cursor : stepNo ? Number(stepNo) : undefined);
  const lead = sentencesOf(textFor(e.a, roles));
  // The «lo de X» of the ask, when the section says it (design §4(c)1: X is a topic, never an event).
  const named = ctx.about ? partNamed(x, roles, ctx.about) : null;
  // A curated answer is narrower than its section (WF-C2): what the section says of the curated answer's own subject (its
  // first way of asking) goes before the section's whole «para qué es», unless it says again what the thread said.
  const ownPart = place.rest === 'curado' && !ctx.about && e.q[0] ? partNamed(x, roles, e.q[0]) : null;
  const ownFresh = ownPart && !nearSaid(ownPart, said) ? ownPart : null;
  // The section's own «¿Qué es…?» or «¿Para qué sirve…?» of what the person asked about («¿qué son las respuestas
  // guardadas?» → its answer, to «¿y pa' qué sirven?»).
  const subject = [ctx.asked, e.q[0]].filter((t): t is string => !!t);
  const defines = (x.faq ?? []).filter((f) => DEFINE_Q.test(f.q) && subject.some((q) => sameAsk(f.q, q))).map((f) => forRole(f.a, roles)).filter(sayable);
  switch (facet) {
    case 'simpler': {
      // The section's «dicho más fácil» is about the whole section: one of its items, rules or questions («Vencidas» of
      // «Cifras») is said again, plainly, with the guide (never the whole section's instead).
      const whole = place.rest === '' || /^(?:tarea|pasos):/.test(place.rest);
      return fresh([
        named ? { text: `${named}${guide ? ' La guía lo explica con calma: toca el botón.' : ''}`, ...own, ...(guide ? { goTo: guide } : {}) } : null,
        whole && forRole(x.easy, roles) ? { text: end(clean(forRole(x.easy, roles)!)), ...own } : null,
        lead[0] ? { text: `${lead[0]}${guide ? ' La guía lo explica con calma: toca el botón.' : ''}`, ...own, ...(guide ? { goTo: guide } : {}) } : null,
      ]);
    }
    case 'example':
      return fresh([
        forRole(x.example, roles) ? { text: end(clean(forRole(x.example, roles)!)), ...own } : null,
        guide ? { text: 'La guía no trae un ejemplo de eso: lo explica completo en «Ayuda y guías». Toca el botón.', ...own, goTo: guide } : null,
      ]);
    case 'why': {
      const says = named ?? lead.find((s) => !wasSaid(s, said)) ?? lead[0];
      return fresh([
        sayable(x.why) ? { text: end(clean(x.why)), ...own } : null,
        says ? { text: `La guía no da el porqué de eso. Lo que dice es esto: ${lcFirst(end(says))}`, ...own, ...(guide ? { goTo: guide } : {}) } : null,
        guide ? { text: 'La guía no da el porqué de eso. Está completa en «Ayuda y guías»: toca el botón.', ...own, goTo: guide } : null,
      ]);
    }
    case 'purpose': {
      // What it is for: its «para qué es», its own «¿Para qué sirve…?», then the first thing the guide says of it that
      // was not said (the guide's words before 360's items, which say what is on the screen).
      const what = forRole(x.what, roles);
      const asked = (x.faq ?? []).filter((f) => PURPOSE_Q.test(f.q)).map((f) => forRole(f.a, roles)).filter(sayable);
      const first = partsOf(x, roles, true).find((t) => !wasSaid(t, said));
      return fresh([named ? { text: named, ...own } : null, ...defines.map((t) => ({ text: end(clean(t)), ...own })), ownFresh ? { text: ownFresh, ...own } : null, what ? { text: end(clean(what)), ...own } : null, ...asked.map((t) => ({ text: end(clean(t)), ...own })), first ? { text: `${title}: ${lcFirst(first)}`, ...own } : null]);
    }
    case 'steps': {
      // A how-to that only the other one does: this person's own «No: …» of the section, never its steps as theirs.
      const not = steps.length ? undefined : cannotOf(x, roles);
      const rest = not ? 'Cómo lo hace quien le toca está en la guía, en «Ayuda y guías»: toca el botón.' : 'Esos son todos los pasos. Para verlos con calma, están en «Ayuda y guías»: toca el botón.';
      return fresh([stepsFrom(at ?? 0), stepsFrom(0), not ? { text: not, ...own } : null, guide ? { text: rest, ...own, goTo: guide } : null]);
    }
    case 'next': {
      const nx = e.next ? entryById(e.next) : undefined;
      const byNext = nx ? fresh([{ text: `Después: ${lcFirst(textFor(nx.a, roles))}`, entryId: nx.id, ...(guide ? { goTo: guide } : {}) }]) : null;
      if (byNext) return byNext;
      // Where the thread is in the steps (WF-C2): the cursor or this entry's step; the step after the one X names
      // («¿y después de asignarlo?»); else after the last one the thread said.
      const named = ctx.about ? stepAbout(steps, ctx.about) : -1;
      const k = at ?? (named >= 0 ? named + 1 : saidThrough(steps, said) + 1);
      if (k < steps.length && (at !== undefined || named >= 0 || k > 0 || !ctx.about)) {
        const left = k + 1 < steps.length;
        const step = fresh([{ text: `Después: ${lcFirst(steps[k])}${left ? ' ¿Sigo?' : ''}`, ...own, ...(left ? { cursor: k + 1 } : {}), ...(guide ? { goTo: guide } : {}) }]);
        if (step) return step;
      }
      // At the end of the steps, or X is not one of them: what comes after it in the web's flows (the section's own
      // flow first), then what the section goes on to say; only then «Ahí termina».
      const after = flowAfter(ctx.about ?? said.at(-1) ?? '', roles, said, isWebFlow(x) ? x : undefined) ?? (isWebFlow(x) ? null : flowAfter(ctx.about ?? said.at(-1) ?? '', roles, said));
      if (after) {
        const go = guideOf(after.flow, roles) ?? guide;
        const c = fresh([{ text: after.text, ...own, ...(go ? { goTo: go } : {}) }]);
        if (c) return c;
      }
      const rest = isWebFlow(x) ? [] : partsOf(x, roles, true).filter((t) => !wasSaid(t, said) && !lead.some((l) => plain(l) === plain(t)));
      if (rest.length && (at !== undefined || named >= 0 || saidThrough(steps, said) >= 0)) {
        const c = fresh([{ text: `Después, en ${lcFirst(title)}: ${lcFirst(rest[0])}`, ...own, ...(guide ? { goTo: guide } : {}) }]);
        if (c) return c;
      }
      return guide ? fresh([{ text: `Ahí termina: ${lcFirst(title)}. Lo ves completo en la guía: toca el botón.`, ...own, goTo: guide }]) : null;
    }
    case 'whatif':
    case 'who':
    case 'when': {
      // The follow-ups of a thread (WF-C2): the part of the section that says X, with what the ask prefers of it (a «si
      // …», someone named, a «cuando …»).
      if (!ctx.about && facet !== 'who') return null;
      // (A curated answer's own sentence that says it first: what 360 just said, said again alone, never the whole answer
      // again.)
      const own0 = place.rest === 'curado' ? sentenceSaying(facet, ctx.about, textFor(e.a, roles)) : null;
      if (own0 && !said.some((s) => plain(s) === plain(end(own0)))) return { text: end(own0), ...own, ...(guide ? { goTo: guide } : {}) };
      const prefer = facet === 'whatif' ? (t: string) => (saysIf(t) ? 0.3 : 0) : facet === 'who' ? (t: string) => (WHO_NAMED.test(plain(t)) ? 0.4 : 0) : (t: string) => (/\b(?:cuando|al|antes|despues|apenas|cada)\b/i.test(t) ? 0.3 : 0);
      const part = ctx.about ? partNamed(x, roles, ctx.about, prefer) : (partsOf(x, roles).find((t) => WHO_NAMED.test(plain(t))) ?? null);
      if (!part || (facet === 'who' && !WHO_NAMED.test(plain(part)))) return null;
      return fresh([{ text: end(part), ...own, ...(guide ? { goTo: guide } : {}) }]);
    }
    case 'more': {
      if (at !== undefined && at < steps.length) return fresh([stepsFrom(at)]);
      const left = partsOf(x, roles).filter((t) => !wasSaid(t, said) && !lead.some((s) => plain(s) === plain(t)));
      const pick: string[] = [];
      for (const t of left) {
        if (pick.length && [...pick, t].join(' ').length > PAGE_LETTERS) break;
        pick.push(t);
        if (pick.length >= PAGE) break;
      }
      return fresh([
        pick.length ? { text: pick.join(' '), ...own, ...(guide ? { goTo: guide } : {}) } : null,
        guide ? { text: 'Lo demás está en la guía, en «Ayuda y guías»: toca el botón y la abres ahí mismo.', ...own, goTo: guide } : null,
      ]);
    }
    default:
      return null;
  }
}
