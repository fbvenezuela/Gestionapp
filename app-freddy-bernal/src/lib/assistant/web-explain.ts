// 360 explains the web's and Atención's guide (design §4(c), WF-C): the same asks as explain.ts («no entendí», «paso a
// paso», «dame un ejemplo», «¿y después?», «¿para qué sirve?», «¿por qué?», «dime más», «sí» after «¿Sigo?»), for a topic
// that is a section or a flow of src/lib/guides/web (an entry `web:<section>…` or `webflujo:<flow>…` of the index).
// From the section's own 360 fields (easy, example, why, what, tasks) when the guide has them, else from what the guide
// says, never a text said before in the thread, and null when there is nothing new (the caller goes on as today). Never
// a receipt's code or key, not even the demo's or an example's (design §4(e)): a section that prints them is only
// pointed to (its own entry is the fixed line, engine.ts `quiet`), and any other text that has one is left out.
// Pure: no database, no I/O.
import type { Role } from '../roles';
import type { Audience, RoleText, WebBlock, WebFlow, WebSection, WebTask } from '../guides/types';
import { hasReceiptCode } from '../guides/check';
import { PANEL_SCREENS, isWebFlow, webEntry, webHref } from '../guides/web';
import { entryById, textFor, tokens, type Entry } from './answers/engine';
import { sentencesOf, type Facet } from './explain';
import { canOpen } from './screens';
import { plain } from './text';

export type WebExplained = { text: string; entryId: string; goTo?: string; cursor?: number };
type Ctx = { roles: Role[]; said?: string[]; cursor?: number; about?: string };

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
function partNamed(x: WebSection | WebFlow, roles: Role[], about: string): string | null {
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
    if (share > top) [best, top] = [t, share];
  }
  return top >= 0.6 ? best : null;
}
/** A section's own question that asks what it is for («¿Para qué sirve la vista previa?», «¿Para qué es…?»). */
const PURPOSE_Q = /^¿?\s*para\s+qu[eé]\s+(?:sirve|sirven|es|son)\b/i;
/** The section a curated answer of the web is about: the one its button's anchor names, else the panel screen's. */
function sectionOfCurated(e: Entry): WebSection | null {
  if (!e.go) return null;
  const anchor = /#([a-z0-9-]+)$/.exec(e.go)?.[1];
  const byAnchor = anchor ? webEntry(anchor) : undefined;
  if (byAnchor && !isWebFlow(byAnchor)) return byAnchor;
  const panel = PANEL_SCREENS.find((p) => p.screen === e.go!.split(/[?#]/)[0]);
  const x = panel ? webEntry(panel.section) : undefined;
  return x && !isWebFlow(x) ? x : null;
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

/**
 * That facet of a web topic for this person, or null. `topic`: the entry that answered the turn before (its id is
 * `web:<section>…` or `webflujo:<flow>…`); `cursor`: where its steps go on after a «¿Sigo?».
 */
export function webExplain(facet: Facet, topic: Entry | string | null | undefined, ctx: Ctx): WebExplained | null {
  const e = typeof topic === 'string' ? entryById(topic) : topic;
  if (!e || !e.domain || e.domain === 'equipo') return null;
  if (e.roles && !e.roles.some((r) => ctx.roles.includes(r))) return null;
  // (A curated answer of the web, «¿qué es «De la web vieja»?», is explained from the section it is about, with its own
  // words as what was said: «rest» says it is not the section itself.)
  const curated = e.kind === 'curated' ? sectionOfCurated(e) : null;
  const place = curated ? { x: curated as WebSection | WebFlow, rest: 'curado' } : placeOf(e.id);
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
      return fresh([named ? { text: named, ...own } : null, what ? { text: end(clean(what)), ...own } : null, ...asked.map((t) => ({ text: end(clean(t)), ...own })), first ? { text: `${title}: ${lcFirst(first)}`, ...own } : null]);
    }
    case 'steps': {
      // A how-to that only the other one does: this person's own «No: …» of the section, never its steps as theirs.
      const not = steps.length ? undefined : cannotOf(x, roles);
      const rest = not ? 'Cómo lo hace quien le toca está en la guía, en «Ayuda y guías»: toca el botón.' : 'Esos son todos los pasos. Para verlos con calma, están en «Ayuda y guías»: toca el botón.';
      return fresh([stepsFrom(at ?? 0), stepsFrom(0), not ? { text: not, ...own } : null, guide ? { text: rest, ...own, goTo: guide } : null]);
    }
    case 'next': {
      const nx = e.next ? entryById(e.next) : undefined;
      if (nx) return fresh([{ text: `Después: ${lcFirst(textFor(nx.a, roles))}`, entryId: nx.id, ...(guide ? { goTo: guide } : {}) }]);
      if (at !== undefined && at < steps.length) {
        const k = at;
        const left = k + 1 < steps.length;
        return fresh([{ text: `Después: ${lcFirst(steps[k])}${left ? ' ¿Sigo?' : ''}`, ...own, ...(left ? { cursor: k + 1 } : {}) }]);
      }
      return guide ? fresh([{ text: `Ahí termina: ${lcFirst(title)}. Lo ves completo en la guía: toca el botón.`, ...own, goTo: guide }]) : null;
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
