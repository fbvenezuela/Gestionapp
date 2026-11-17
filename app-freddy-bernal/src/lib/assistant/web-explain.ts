// 360 explains the web's and Atención's guide (design §4(c), WF-C): the same asks as explain.ts («no entendí», «paso a
// paso», «dame un ejemplo», «¿y después?», «¿para qué sirve?», «¿por qué?», «dime más», «sí» after «¿Sigo?»), for a topic
// that is a section or a flow of src/lib/guides/web (an entry `web:<section>…` or `webflujo:<flow>…` of the index).
// From the section's own 360 fields (easy, example, why, what, tasks) when the guide has them, else from what the guide
// says, never a text said before in the thread, and null when there is nothing new (the caller goes on as today).
// Pure: no database, no I/O.
import type { Role } from '../roles';
import type { Audience, RoleText, WebFlow, WebSection } from '../guides/types';
import { isWebFlow, webEntry, webHref } from '../guides/web';
import { entryById, textFor, type Entry } from './answers/engine';
import { sentencesOf, type Facet } from './explain';
import { canOpen } from './screens';
import { plain } from './text';

export type WebExplained = { text: string; entryId: string; goTo?: string; cursor?: number };
type Ctx = { roles: Role[]; said?: string[]; cursor?: number };

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
  if (typeof t === 'string') return t;
  return t[audienceOf(roles)] ?? t.default;
}
const wasSaid = (text: string, said: string[]) => {
  const p = plain(text);
  return !!p && said.some((s) => plain(s).includes(p));
};
/** The guide's button for a section or a flow, when this person can open it. */
const guideOf = (x: WebSection | WebFlow, roles: Role[]) => {
  const h = webHref(x.id);
  return h && canOpen(h, roles) ? h : undefined;
};

/** The numbered steps of a section (its 360 tasks, else its first list of steps), or a flow's main path. */
function stepsOf(x: WebSection | WebFlow): string[] {
  if (isWebFlow(x)) {
    const byId = new Map(x.nodes.map((n) => [n.id, n]));
    const out: string[] = [];
    const seen = new Set<string>();
    let n = x.nodes[0];
    while (n && !seen.has(n.id)) {
      seen.add(n.id);
      out.push(end(clean(n.text)));
      const exits = x.edges.filter((e) => e.from === n!.id && !e.dotted);
      const next = exits.find((e) => /^s[ií]$/i.test(e.label ?? '')) ?? exits[0];
      n = next ? byId.get(next.to)! : undefined!;
    }
    return out;
  }
  const task = x.tasks?.[0];
  if (task) return task.steps.map((s) => end(clean(s)));
  const block = x.blocks.find((b) => b.kind === 'steps');
  return block && block.kind === 'steps' ? block.items.map((s) => end(clean(s))) : [];
}
/** What a section says, unit by unit (its 360 items first, then its paragraphs and lists). */
function partsOf(x: WebSection | WebFlow, roles: Role[]): string[] {
  const own = (x.items ?? []).map((t) => forRole(t, roles)).filter((t): t is string => !!t).map((t) => end(clean(t)));
  if (isWebFlow(x)) return [...own, ...x.know.map((k) => end(clean(k)))];
  const fromBlocks = x.blocks.flatMap((b) => (b.kind === 'p' ? [b.text] : b.kind === 'list' ? b.items : b.kind === 'note' ? b.paras : [])).map((t) => clean(t)).filter((t) => t && !/:\s*$/.test(t)).map(end);
  return [...own, ...fromBlocks];
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
  const place = placeOf(e.id);
  if (!place) return null;
  const { x } = place;
  const roles = ctx.roles;
  const said = ctx.said ?? [];
  const guide = guideOf(x, roles);
  const own = { entryId: e.id };
  const title = clean(x.title).replace(/\s*\([^)]*\)\s*$/, '');
  const fresh = (list: (WebExplained | null)[]) => list.find((c): c is WebExplained => !!c && !!c.text && !wasSaid(c.text, said)) ?? null;
  const steps = stepsOf(x);
  const stepsFrom = (from: number): WebExplained | null => {
    if (from >= steps.length) return null;
    const p = page(from === 0 ? title : null, steps, from);
    return { text: p.text, ...own, ...(p.next !== undefined ? { cursor: p.next } : {}), ...(guide ? { goTo: guide } : {}) };
  };
  // Where the steps go on: the cursor of a «¿Sigo?», a story's own cursor, or the step this entry is.
  const stepNo = /(?:^|:)(?:pasos:\d+:|tarea:[a-z0-9-]+:)(\d+)$/.exec(place.rest)?.[1];
  const at = ctx.cursor ?? (e.kind === 'flowStory' ? e.cursor : stepNo ? Number(stepNo) : undefined);
  const lead = sentencesOf(textFor(e.a, roles));
  switch (facet) {
    case 'simpler':
      return fresh([
        forRole(x.easy, roles) ? { text: end(clean(forRole(x.easy, roles)!)), ...own } : null,
        lead[0] ? { text: `${lead[0]}${guide ? ' La guía lo explica con calma: toca el botón.' : ''}`, ...own, ...(guide ? { goTo: guide } : {}) } : null,
      ]);
    case 'example':
      return fresh([
        forRole(x.example, roles) ? { text: end(clean(forRole(x.example, roles)!)), ...own } : null,
        guide ? { text: 'La guía no trae un ejemplo de eso: lo explica completo en «Ayuda y guías». Toca el botón.', ...own, goTo: guide } : null,
      ]);
    case 'why': {
      const says = lead.find((s) => !wasSaid(s, said)) ?? lead[0];
      return fresh([
        x.why ? { text: end(clean(x.why)), ...own } : null,
        says ? { text: `La guía no da el porqué de eso. Lo que dice es esto: ${lcFirst(end(says))}`, ...own, ...(guide ? { goTo: guide } : {}) } : null,
        guide ? { text: 'La guía no da el porqué de eso. Está completa en «Ayuda y guías»: toca el botón.', ...own, goTo: guide } : null,
      ]);
    }
    case 'purpose': {
      const what = forRole(x.what, roles);
      const first = partsOf(x, roles)[0];
      return fresh([what ? { text: end(clean(what)), ...own } : null, first ? { text: `${title}: ${lcFirst(first)}`, ...own } : null]);
    }
    case 'steps':
      return fresh([stepsFrom(at ?? 0), stepsFrom(0), guide ? { text: 'Esos son todos los pasos. Para verlos con calma, están en «Ayuda y guías»: toca el botón.', ...own, goTo: guide } : null]);
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
