// 360 explains (design §4(c), 12/11; Juan: «asegúrate que el bot sepa todo … y cómo poder explicarlo»): «no entendí»,
// «más fácil», «paso a paso», «dame un ejemplo», «¿y después?», «¿para qué sirve?», «¿por qué?», «¿qué significa eso?»,
// «dime más». Pure: no database, no I/O.
// - explainAsk(question): whether the whole question is one of those asks (dictated and short forms, accents optional,
//   courtesy words allowed), the facet it asks for and the «lo de X» it names. «Lo de X» is a topic here, never an event,
//   unless X names an event, a title, a place or a day: the event detectors of events.ts decide, as they are.
// - explainAnswer(facet, topic, ctx): that facet of the topic (the index entry that answered the turn before), for this
//   person's role, from the guides (src/lib/guides) and «Explicado fácil» (src/lib/guides/explain.ts): never a text 360
//   already said in the thread, never after a turn about an event, and null when there is nothing new to say (then the
//   caller goes on with the steps of today, the agenda's refusal included).
// The hook in local.ts is wired in the next round (C-ENG): it stores `entryId` and `cursor` with each answer and passes
// them back here.
import { TEAM_ROLES, type Role, type TeamRole } from '../roles';
import { ADMIN_GUIDE, FLOWS, GLOSSARY, SHARED, allGuides, glossaryLine, sharedFor, toursForRoles } from '../guides';
import { facetsOf, type FacetText } from '../guides/explain';
import { everyoneSections } from '../guides/sections';
import type { Flow, FlowStep, GlossaryTerm, RoleGuide, SharedTopic, Task } from '../guides/types';
import { entryById, findAnswers, readable, textFor, tokens, WEAK, type Entry } from './answers/engine';
import { asksAgendaData, asksPlace, asksWhenIndirect, eventSignals, eventThread, type EventSignal } from './events';
import { canOpen } from './screens';
import { plain } from './text';
import type { TitleSet } from './titles';

// ── What is asked ──────────────────────────────────────────────────────────────────────────────────────────────────

/** What an explain ask wants of the topic (design §4(c)1). */
export type Facet = 'simpler' | 'steps' | 'example' | 'next' | 'purpose' | 'why' | 'meaning' | 'more';
/** The facet asked and, when the ask names it («no entendí lo de X», «¿qué significa X?», «¿y después de X?»), what of the topic. */
export type ExplainAsk = { facet: Facet; about?: string };
/**
 * `titles`: what this person can see (the event detectors read titles and places with it). `last`: 360's last answer in
 * the thread, so a bare «sí» or «dale» after its «¿Sigo?» goes on with the steps.
 */
export type AskOptions = { titles?: TitleSet; last?: string };

const NO_TITLES: TitleSet = { events: [], pieces: [], places: [] };

// The words around an ask that ask nothing: openers and courtesy before it, courtesy after it. «Entonces» opens a
// question only before something else («entonces, ¿cómo lo hago?»): alone it asks what comes next.
const LEAD = /^(?:(?:y|e|o|pero|ok|okey|okay|ya|aja|bueno|mira|oye|chamo|chama|pana|hola|epa|epale|disculpa|disculpe|perdon|perdona|360|ah|eh|mmm|vale|listo|gracias|muchas gracias|a ver|por favor|amigo|amiga|oiga|bro|mano|mana|si|entonces(?= \S))(?: |$))+/;
const TAIL = /(?: (?:por favor|gracias|muchas gracias|ok|ya|chamo|chama|pana|360|mejor|rapido|rapidito|bien|ahi|aqui|otra vez|de nuevo|amigo|amiga|bro|pues|entonces|si))+$/;
// What a «lo de X» says before its X.
const LO_DE = String.raw`(?:lo|eso|esto|la parte|el paso|el tema|la cosa) (?:de|del|que dice|que dijiste de|que dijiste del)`;
// Said more simply.
const SIMPLE = String.raw`(?:facil|facilito|sencillo|sencillito|simple|clarito|claro|despacio|despacito|en palabras sencillas|en palabras simples|en palabras faciles|con palabras sencillas|de otra forma|de otra manera|en cristiano|como (?:a|para) un nino|para un nino|sin palabras raras|sin tanto enredo|mas corto|en corto|resumido)`;
const UNDERSTOOD = '(?:entendi|entiendo|entendio|capte|capto|comprendi|comprendo|agarre|pille|cache)';
const DO_VERB =
  '(?:hago|hace|hacemos|activo|activa|uso|usa|lleno|llena|pongo|pone|subo|sube|armo|arma|mando|manda|reviso|revisa|apruebo|aprueba|cambio|cambia|veo|ve|marco|marca|quito|quita|agrego|agrega|abro|abre|leo|lee|consigo|saco|preparo|prepara|cargo|carga|creo|crea|escribo|escribe|configuro|configura|instalo|instala|programo|programa|publico|publica|elimino|elimina|archivo|archiva|muevo|mueve|pido|pide|bajo|baja|guardo|guarda)';
const ROLE_NAMES = '(?:el jefe|jefe|el despacho|despacho|politica|el ivt|ivt|grabacion|redes|administracion)';

// Each ask, whole (after the openers and the courtesy): its facet, and its X in the group named `about`.
const ASKS: [Facet, RegExp][] = [
  // simpler: «no entendí», «no te entendí», «no capté», «¿cómo así?», «explícamelo más fácil», «en palabras sencillas».
  ['simpler', new RegExp(String.raw`^no (?:te |le |lo |la )?${UNDERSTOOD}(?: (?:bien|muy bien|nada|ni papa|mucho|casi nada|todo|eso|esto|esa parte|lo que dijiste|lo que me dijiste|tu respuesta|la respuesta|lo ultimo|eso ultimo|ni media|nada de nada))*$`)],
  ['simpler', new RegExp(String.raw`^no (?:te |le )?${UNDERSTOOD} (?:${LO_DE}|la diferencia entre) (?<about>.+)$`)],
  ['simpler', new RegExp(String.raw`^no (?:te |le )?${UNDERSTOOD} (?<about>(?:el|la|los|las) .+)$`)],
  ['simpler', new RegExp(String.raw`^no me (?:quedo|queda) (?:muy |bien )?claro(?: (?:eso|esto))?$`)],
  ['simpler', new RegExp(String.raw`^no me (?:quedo|queda) claro ${LO_DE} (?<about>.+)$`)],
  ['simpler', /^(?:como asi|como es eso|como es la cosa|como como|que quieres decir|que quisiste decir|a que te refieres|no se que es eso|no se de que hablas|no entiendo que es eso)$/],
  ['simpler', new RegExp(String.raw`^(?:que quisiste decir|que quieres decir|a que te refieres) con (?:${LO_DE} )?(?<about>.+)$`)],
  ['simpler', new RegExp(String.raw`^(?:explica\w*|dime\w*|dilo|decirlo|ponlo|ponmelo|repite\w*|cuenta\w*|echame el cuento)(?: (?:eso|esto|lo|todo|eso mismo|otra vez|de nuevo|pero|mas|un poco mas|un poquito mas|bien|de forma|de manera|en forma))* ${SIMPLE}(?: (?:${LO_DE}|sobre) (?<about>.+))?$`)],
  ['simpler', /^(?:mas|bien|super|muy) (?:facil|facilito|sencillo|simple|claro|clarito|corto)$/],
  ['simpler', new RegExp(String.raw`^${SIMPLE}$`)],
  ['simpler', /^(?:explica|explicame|explicamelo|explicamela|explicanos|explicate)$/],
  ['simpler', new RegExp(String.raw`^(?:explica|explicame|explicamelo) ${LO_DE} (?<about>.+)$`)],
  // steps: «paso a paso (porfa)», «por pasos», «¿qué hago primero?», «¿y cómo lo hago?».
  ['steps', new RegExp(String.raw`^(?:(?:dimelo|dime|explicamelo|explicame|explica|dame|damelo|ponmelo|ensename|ensenamelo|muestramelo|cuentamelo)(?: (?:lo|eso|esto|todo))? )?(?:paso a paso|por pasos|pasito a pasito|en pasos|punto por punto)(?: (?:como (?:lo|la|los|las|se) ${DO_VERB}(?: (?:eso|esto))?|${LO_DE} (?<about>.+)))?$`)],
  ['steps', /^(?:(?:dime|dame|cuales son) )?(?:los )?pasos$/],
  ['steps', /^(?:que hago primero|por donde empiezo|como empiezo|con que empiezo|que hago de primero)$/],
  ['steps', new RegExp(String.raw`^como (?:lo |la |los |las |se )${DO_VERB}(?: (?:eso|esto))?$`)],
  ['steps', /^(?:como (?:hago|se hace|le hago) (?:eso|esto)|(?:eso|esto) como se hace)$/],
  // example: «dame un ejemplo», «¿por ejemplo?», «¿cómo sería?».
  ['example', /^(?:(?:dame|deme|da|danos|ponme|pon|ponnos|dime|muestrame|ensename|me das|me da|me pones|me puedes dar|me podrias dar|puedes dar|puedes darme|podrias dar|podrias darme|tienes|hay|regalame|echame|quiero|necesito|con) )?(?:un |algun |unos |otro |un buen )?(?:ejemplo|ejemplito|ejemplos|caso)(?: (?:de|del|con|sobre|para) (?<about>.+))?$/],
  ['example', /^(?:por ejemplo|como por ejemplo|como seria|como seria eso|como seria en la practica|en la practica|en la vida real|con un ejemplo|(?:explica\w*|dime\w*|dimelo) con un ejemplo|ponme un caso|un caso real|como cual|como que)$/],
  // next: «¿y después?», «¿y luego?», «¿qué sigue?», «¿y entonces?».
  ['next', /^(?:despues|luego|entonces|ahora)(?: (?:de eso|de esto|de ahi|de alli))?(?: que(?: (?:sigue|pasa|hago|viene|toca|hacemos|sucede|se hace))?)?$/],
  ['next', /^(?:que sigue|que viene|que toca|cual es el siguiente paso|el siguiente paso|siguiente paso|el siguiente|que mas sigue|que pasa despues|que hago despues|que viene despues|que sigue despues|luego que|despues que|que pasa luego|que pasa entonces|que hago luego|luego que hago)$/],
  ['next', new RegExp(String.raw`^(?:despues|luego|entonces) que hace (?<about>${ROLE_NAMES})$`)],
  ['next', /^(?:despues|luego) quien (?:lo|la|los|las) (?:usa|lee|ve|recibe|aprueba|hace|sigue|revisa|publica|graba)$/],
  ['next', /^(?:despues|luego) de (?<about>.+?)(?: que(?: (?:sigue|pasa|hago|viene|toca|hacemos|sucede|se hace))?)?$/],
  ['next', /^que (?:pasa|sucede) (?:despues|luego) de (?<about>.+)$/],
  // purpose: «¿para qué sirve (eso)?», «¿pa' qué?».
  ['purpose', /^(?:(?:eso|esto) )?paraque(?: (?:sirve|sirven|es|son|me sirve|nos sirve|se usa|existe|seria))?(?: (?:eso|esto))?$/],
  ['purpose', /^(?:eso|esto|lo) de (?<about>.+?) paraque(?: (?:sirve|sirven|es|son|se usa))?$/],
  ['purpose', /^paraque (?:sirve|sirven|es|son|se usa|me sirve) (?:eso de |lo de |esto de )?(?<about>.+)$/],
  ['purpose', /^(?:de que (?:sirve|me sirve|nos sirve)(?: (?:eso|esto))?|con que fin|(?:cual es )?(?:el|su) (?:objetivo|proposito|chiste|punto)(?: de (?:eso|esto))?)$/],
  // why: «¿por qué?», «¿y eso por qué?», «¿por qué es así?».
  ['why', /^(?:(?:eso|esto) )?por que(?: (?:eso|esto|asi|es asi|sera|seria|no|tanto|es eso|pasa eso|pasa))*$/],
  ['why', /^por que (?:es|se hace|funciona|tiene que ser|hay que hacerlo|lo hacen|esta|quedo) (?:asi|de esa forma|de esa manera)$/],
  ['why', /^(?:(?:cual es|dime) )?(?:la|el) (?:razon|motivo)(?: de (?:eso|esto))?$|^(?:por que razon|por que motivo|por cual razon|a que se debe)$/],
  ['why', new RegExp(String.raw`^por que ${LO_DE} (?<about>.+)$`)],
  // meaning: «¿qué significa (eso | X)?».
  ['meaning', /^que (?:significa|significan|quiere decir|quieren decir) (?:eso|esto|esa palabra|esas palabras|eso que dijiste|lo que dijiste)$/],
  ['meaning', /^que (?:es|son) (?:eso|esa palabra|eso que dijiste)$|^(?:eso|esa palabra) que (?:significa|quiere decir|es)$|^que (?:significa|quiere decir)$/],
  ['meaning', new RegExp(String.raw`^que (?:significa|significan|quiere decir|quieren decir) (?:${LO_DE} |la palabra |el |la |los |las |lo |un |una )?(?<about>.+)$`)],
  ['meaning', new RegExp(String.raw`^que (?:es|son) (?:${LO_DE}|eso de|esto de) (?<about>.+)$`)],
  ['meaning', /^(?:eso|lo|esto) de (?<about>.+?) que (?:es|son|significa|significan|quiere decir)$/],
  // more: «dime más», «¿algo más?», «sigue».
  ['more', /^(?:sigue|siga|continua|continue|seguimos|sigamos|dale sigue|sigue pues|adelante|continuemos|sigue sigue|termina|terminalo)$/],
  ['more', /^(?:dime|cuentame|explicame|dame|di|ensename|muestrame|quiero saber) (?:mas|algo mas|un poco mas|mas cosas|mas detalles|el resto|lo demas|lo que falta|todo)(?: (?:de eso|sobre eso|de esto|sobre esto))?$/],
  ['more', /^(?:algo mas|mas|mas detalles|mas informacion|el resto|lo demas|lo que falta|los demas pasos|el resto de los pasos|los otros pasos|que otros pasos|faltan pasos|hay mas|que mas hay|que otra cosa)$/],
];
// A bare yes after 360's «¿Sigo?»: go on.
const YES = /^(?:si|dale|ok|okey|claro|va|vale|si por favor|si dale|si claro|por favor|aja|listo|de una|sigue|si sigue|perfecto|bueno|esta bien|si porfa)$/;
const ASKED_TO_GO_ON = /¿Sigo\?\s*$/;
// «¿Y qué más?» is «what else?»; «¿qué más?» alone is a greeting (local.ts small talk).
const WHAT_ELSE = /^y (?:que mas|que otra cosa)$/;

// The event detectors: a «lo de X» or a whole ask that names an event, a title, a place, a day or an hour is not an
// explain ask (the agenda's steps answer it). Whoever records or the boss named alone («lo del jefe», «lo de quién
// graba») is not an event.
const BLOCK: EventSignal[] = ['word', 'title', 'place', 'token', 'ask', 'agenda', 'when'];
const blocked = (text: string, titles: TitleSet) => {
  const s = eventSignals(text, titles);
  return BLOCK.some((b) => s.has(b)) || asksPlace(text) || asksWhenIndirect(text);
};
// What «no entiendo …» says about the app itself (local.ts LOST: the tutorials), not about the topic.
const ABOUT_THE_APP = /^(?:(?:la|esta|tu|esa) (?:app|pantalla|parte|seccion)|nada|como (?:se )?usa\w*|que hacer|que hago)$/;

/**
 * The explain ask a question is, or null: the whole question is one (see ASKS), with no event in it. `about`: the X of a
 * «lo de X», a «¿qué significa X?» or a «¿y después de X?», as plain words (at most eight).
 */
export function explainAsk(question: string, o: AskOptions = {}): ExplainAsk | null {
  const titles = o.titles ?? NO_TITLES;
  const raw = String(question ?? '');
  if (raw.length > 160) return null;
  const t = readable(raw);
  if (!t) return null;
  // The agenda asked as such, or any event signal in the whole ask (but its «lo de», read below on its own X).
  if (asksAgendaData(raw) || blocked(raw.replace(/\blo\s+del?\b/gi, ' '), titles)) return null;
  const tail = t.replace(TAIL, '');
  if (o.last && ASKED_TO_GO_ON.test(o.last) && YES.test(tail)) return { facet: 'more' };
  if (WHAT_ELSE.test(tail)) return { facet: 'more' };
  let core = tail.replace(LEAD, '').replace(TAIL, '').trim() || t.replace(LEAD, '').trim() || tail;
  if (!core) return null;
  // «No entendí, dame un ejemplo»: the second ask says what is wanted.
  const after = /^no (?:te |le )?(?:entendi|entiendo|capte|comprendi)(?: nada| bien)? (.+)$/.exec(core)?.[1];
  if (after && ASKS.some(([, re]) => re.test(after))) core = after;
  for (const [facet, re] of ASKS) {
    const m = re.exec(core);
    if (!m) continue;
    const about = m.groups?.about?.trim();
    if (!about) return { facet };
    if (about.split(' ').length > 8 || about.length > 70 || ABOUT_THE_APP.test(about)) return null;
    if (blocked(about, titles)) return null;
    return { facet, about };
  }
  return null;
}

// ── What it is about ───────────────────────────────────────────────────────────────────────────────────────────────

/**
 * `roles`: the person's menu roles. `screen`: the SCREENS pattern the person is on. `said`: 360's answers in this thread,
 * oldest first (never said twice). `earlier`: the person's questions before this one, oldest first (a thread about an
 * event gets no explain answer). `titles`: what this person can see. `cursor`: stored with the previous answer, the
 * next step to say on «¿Sigo?». `about`: explainAsk()'s about. `tours`: the tutorial ids this person has (default: those
 * of `roles`).
 */
export type ExplainContext = {
  roles: Role[];
  screen?: string | null;
  said?: string[];
  earlier?: string[];
  titles?: TitleSet;
  cursor?: number;
  about?: string;
  tours?: string[];
};

/**
 * What 360 says. `entryId`: the topic to store with this answer (the next explain ask's topic; a flow's whole story is
 * `flujo:<id>`). `cursor`: where the steps go on («¿Sigo?»), unset when all were said. `goTo`: a SCREENS href this person
 * can open. `tutorial`: a tour id this person has (the caller offers it through ver_tutorial, as sayEntry does).
 */
export type ExplainAnswer = { facet: Facet; text: string; entryId: string; goTo?: string; tutorial?: string; cursor?: number };

type Section = { screen?: string; title: string; what: string; youDo: string[]; cannot?: string[]; tour?: string };
type Unit =
  | { kind: 'task'; id: string; role: TeamRole; guide: RoleGuide; task: Task; step?: number }
  | { kind: 'screen'; id: string; role: Role; guide?: RoleGuide; section: Section; item?: number }
  | { kind: 'flow'; id: string; flow: Flow; step?: number }
  | { kind: 'topic'; id: string; topic: SharedTopic; line?: number }
  | { kind: 'term'; id: string; term: GlossaryTerm }
  | { kind: 'job'; id: string; role: Role; guide?: RoleGuide }
  | { kind: 'entry'; id: string; entry: Entry };

const guideBySlug = (slug: string) => allGuides().find((g) => g.slug === slug);
const ADMIN_EVERYONE = () => everyoneSections('dispatch').filter((x) => x.screen === '/avisos' || x.screen === '/buscar' || x.screen === '/perfil');

/** The unit of the guides an entry id is (or is part of): a task and its step, a screen and its item, a flow and its step… */
function unitOf(id: string, e?: Entry): Unit | null {
  let m = /^([a-z]+):paso-a-paso:([a-z0-9-]+)(?::(\d+))?$/.exec(id);
  if (m) {
    const guide = guideBySlug(m[1]);
    const task = guide?.tasks.find((t) => t.id === m![2]);
    if (guide && task) return { kind: 'task', id: `${m[1]}:paso-a-paso:${m[2]}`, role: guide.role, guide, task, ...(m[3] ? { step: Number(m[3]) - 1 } : {}) };
  }
  m = /^([a-z]+):pantalla:(\d+)(?::(?:hace|no):(\d+))?$/.exec(id);
  if (m) {
    const guide = m[1] === 'admin' ? undefined : guideBySlug(m[1]);
    const section = m[1] === 'admin' ? ADMIN_GUIDE.sections[Number(m[2])] : guide?.sections[Number(m[2])];
    if (section) return { kind: 'screen', id: `${m[1]}:pantalla:${m[2]}`, role: guide?.role ?? 'admin', ...(guide ? { guide } : {}), section, ...(m[3] && /:hace:/.test(id) ? { item: Number(m[3]) } : {}) };
  }
  m = /^admin:todos:(\d+)(?::(?:hace|no):(\d+))?$/.exec(id);
  if (m) {
    const section = ADMIN_EVERYONE()[Number(m[1])];
    if (section) return { kind: 'screen', id: `admin:todos:${m[1]}`, role: 'admin', section, ...(m[2] && /:hace:/.test(id) ? { item: Number(m[2]) } : {}) };
  }
  m = /^flujo:([a-z-]+)(?::([a-z0-9-]+))?$/.exec(id);
  if (m) {
    const flow = FLOWS.find((f) => f.id === m![1]);
    const step = m[2] ? flow?.steps.findIndex((s) => s.id === m![2]) : undefined;
    if (flow && (step === undefined || step >= 0)) return { kind: 'flow', id: `flujo:${flow.id}`, flow, ...(step !== undefined ? { step } : {}) };
  }
  m = /^todos:([a-z0-9-]+)(?::(\d+))?(?::admin)?$/.exec(id);
  if (m) {
    const topic = SHARED.find((t) => t.id === m![1]);
    if (topic) return { kind: 'topic', id: `todos:${topic.id}`, topic, ...(m[2] ? { line: Number(m[2]) } : {}) };
  }
  m = /^palabra:([a-z0-9-]+)$/.exec(id);
  if (m) {
    const term = GLOSSARY.find((g) => g.id === m![1]);
    if (term) return { kind: 'term', id, term };
  }
  m = /^([a-z]+):trabajo(?::\d+)?$/.exec(id);
  if (m) {
    const guide = m[1] === 'admin' ? undefined : guideBySlug(m[1]);
    if (guide || m[1] === 'admin') return { kind: 'job', id: `${m[1]}:trabajo`, role: guide?.role ?? 'admin', ...(guide ? { guide } : {}) };
  }
  return e ? { kind: 'entry', id, entry: e } : null;
}

// The guide unit a curated answer is about (a task, a screen, a flow, a topic of «Para todos», a word), for this person:
// asked the way the curated answer is asked (its ways of asking and its own text), the guide's entries that come first
// after the curated ones vote for their unit (the first more than the next ones); the curated answer's tutorial votes
// for the task, or else the screen, of the person's guide that has it. The unit wins only by a clear margin: a wrong one
// would explain another thing.
const relatedCache = new Map<string, string | null>();
const UNIT_KINDS = new Set(['task', 'step', 'screen', 'item', 'flow', 'topic', 'line', 'term']);
const VOTE_MIN = 1.2;
const VOTE_MARGIN = 1.6;
function relatedOf(e: Entry, roles: Role[]): Unit | null {
  const key = `${e.id}|${[...roles].sort().join(',')}`;
  if (!relatedCache.has(key)) relatedCache.set(key, relatedId(e, roles));
  const id = relatedCache.get(key);
  return id ? unitOf(id, entryById(id)) : null;
}
function relatedId(e: Entry, roles: Role[]): string | null {
  const votes = new Map<string, number>();
  for (const q of [...e.q.slice(0, 8), textFor(e.a, roles)]) {
    const found = findAnswers(q, { roles, limit: 8 }).filter((x) => x.entry.kind !== 'curated' && UNIT_KINDS.has(x.entry.kind) && x.score >= WEAK);
    const seen = new Set<string>();
    let w = 1;
    for (const m of found) {
      const u = unitOf(m.entry.id, m.entry);
      if (!u || u.kind === 'entry' || seen.has(u.id)) continue;
      seen.add(u.id);
      votes.set(u.id, (votes.get(u.id) ?? 0) + w * m.score);
      w /= 2;
      if (seen.size >= 3) break;
    }
  }
  if (e.tutorial) {
    const mine = allGuides().filter((g) => roles.includes(g.role));
    const task = mine.flatMap((g) => g.tasks.filter((t) => t.tour === e.tutorial).map((t) => `${g.slug}:paso-a-paso:${t.id}`));
    const screen = mine.flatMap((g) => g.sections.map((s, k) => (s.tour === e.tutorial ? `${g.slug}:pantalla:${k}` : null)).filter((x): x is string => !!x));
    const by = task.length === 1 ? task[0] : task.length === 0 && screen.length === 1 ? screen[0] : null;
    if (by) votes.set(by, (votes.get(by) ?? 0) + 1);
  }
  const ranked = [...votes.entries()].sort((a, b) => b[1] - a[1]);
  const [best, second] = ranked;
  if (!best || best[1] < VOTE_MIN || (second && best[1] < second[1] * VOTE_MARGIN)) return null;
  // And the unit says what the curated answer says: a fair share of its words («Cambiar nombre» of a month is not «¿cómo
  // cambio mi nombre?», answered with Mi perfil).
  const u = unitOf(best[0], entryById(best[0]));
  const said = new Set(tokens(textFor(e.a, roles)).filter((w) => w.length >= 4));
  const has = new Set(u ? tokens(unitText(u, roles)) : []);
  const share = said.size ? [...said].filter((w) => has.has(w)).length / said.size : 0;
  return share >= OVERLAP ? best[0] : null;
}
// The share of a curated answer's words its unit must say.
const OVERLAP = 0.25;
/** All a unit says, for the overlap above. */
function unitText(u: Unit, roles: Role[]): string {
  if (u.kind === 'task') return [u.task.title, u.task.when, ...u.task.steps].join(' ');
  if (u.kind === 'screen') return [u.section.title, u.section.what, ...u.section.youDo, ...(u.section.cannot ?? [])].join(' ');
  if (u.kind === 'flow') return [u.flow.title, ...u.flow.steps.flatMap((s) => [s.text, ...(s.branches ?? []).map((b) => b.text)])].join(' ');
  if (u.kind === 'topic') return [u.topic.title, ...topicLines(u.topic, roles)].join(' ');
  if (u.kind === 'term') return [u.term.term, ...u.term.aka, u.term.text].join(' ');
  if (u.kind === 'job') return u.guide ? [u.guide.job.mission, ...u.guide.job.responsibilities, ...u.guide.job.never].join(' ') : ADMIN_GUIDE.mission;
  return textFor(u.entry.a, roles);
}

/** The unit of the topic for this person: its own, or the one a curated answer is about (or its own text, when none). */
function unitFor(topic: Entry | string, roles: Role[]): Unit | null {
  const id = typeof topic === 'string' ? topic : topic.id;
  const e = typeof topic === 'string' ? entryById(topic) : topic;
  if (e?.kind === 'curated') return relatedOf(e, roles) ?? { kind: 'entry', id: e.id, entry: e };
  return unitOf(id, e);
}

// ── Saying it ──────────────────────────────────────────────────────────────────────────────────────────────────────

const ucFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const lcFirst = (s: string) => (s.startsWith('«') || /^\p{Lu}[\p{Ll}]+ →/u.test(s) || /^(?:IVT|Redes|Grabación|Política|Digital|Municipios|Obras|Hoy|Publicar|Resultados|Biblioteca|Agenda|Mensajes|Tweets|X|Instagram)\b/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));
const end = (s: string) => (/[.!?…»)]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);
const forRole = (t: FacetText | undefined, roles: Role[]): string | undefined => (t === undefined ? undefined : textFor(t, roles) || undefined);

// The roles a step of a flow names, said to this person: «Redes», «el jefe o el despacho», «tú».
const WHO: Record<TeamRole, string> = { boss: 'el jefe', dispatch: 'el despacho', politics: 'política', ivt: 'el IVT', camera: 'Grabación', social: 'Redes' };
const TO_WHO: Record<TeamRole, string> = { boss: 'al jefe', dispatch: 'al despacho', politics: 'a política', ivt: 'al IVT', camera: 'a Grabación', social: 'a Redes' };
const list = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} o ${xs.at(-1)}` : (xs[0] ?? ''));
/** «Después le toca a Redes: …», «Después te toca a ti: …» (the asker's own step), «Después: …» (everyone). */
function turnOf(step: FlowStep, roles: Role[]): string {
  const mine = step.roles.filter((r) => roles.includes(r));
  const others = step.roles.filter((r) => !roles.includes(r));
  if (step.roles.length >= 5) return 'Después';
  if (!others.length) return 'Después te toca a ti';
  return `Después le toca ${list([...others.map((r) => TO_WHO[r]), ...(mine.length ? ['a ti'] : [])])}`;
}
const stepText = (s: FlowStep) => lcFirst(end(s.text));

/** Whether this text (or most of it) was already said in the thread. */
function wasSaid(text: string, said: string[]): boolean {
  const core = plain(text.replace(/\s*¿Sigo\?\s*$/, ''));
  if (!core) return true;
  return said.some((x) => {
    const p = plain(x);
    return p === core || (core.length >= 40 && p.includes(core));
  });
}

// The person's tutorials and buttons.
const toursOf = (ctx: ExplainContext) => new Set(ctx.tours ?? toursForRoles(ctx.roles, { admin: ctx.roles.includes('admin') }).map((t) => t.id));
const opens = (href: string | undefined, roles: Role[]) => (href && canOpen(href, roles) ? href : undefined);
const guideHref = (u: Unit, roles: Role[]): string | undefined => {
  const slug = 'guide' in u && u.guide ? u.guide.slug : undefined;
  return opens(slug ? `/ayuda/${slug}` : roles.includes('admin') && !TEAM_ROLES.some((r) => roles.includes(r)) ? '/ayuda/administracion' : '/ayuda', roles);
};
const flowsHref = (roles: Role[]) => opens('/ayuda/flujos', roles);

// The steps of a unit: a task's, a flow's (who does each), a topic's lines.
function stepsOf(u: Unit, roles: Role[]): string[] {
  if (u.kind === 'task') return u.task.steps;
  if (u.kind === 'flow') return u.flow.steps.map((s) => `${ucFirst(s.roles.length >= 5 ? 'cada quien' : s.roles.every((r) => roles.includes(r)) ? 'tú' : list(s.roles.map((r) => WHO[r])))}: ${stepText(s)}`);
  if (u.kind === 'topic') return topicLines(u.topic, roles);
  return [];
}
const topicLines = (t: SharedTopic, roles: Role[]) => (roles.includes('admin') && !TEAM_ROLES.some((r) => roles.includes(r)) ? (sharedFor({ messages: false }).find((x) => x.id === t.id)?.body ?? t.body) : t.body);

// A page of steps: up to three, about 440 letters at most, «¿Sigo?» when more are left.
const PAGE = 3;
const PAGE_LETTERS = 440;
function stepsPage(title: string | null, steps: string[], from: number): { text: string; next?: number } {
  const out: string[] = [];
  let len = title ? title.length + 16 : 0;
  let k = from;
  for (; k < steps.length && out.length < PAGE; k++) {
    const line = `${k + 1}) ${end(steps[k])}`;
    if (out.length && len + line.length > PAGE_LETTERS) break;
    out.push(line);
    len += line.length + 1;
  }
  const more = k < steps.length;
  const head = title && from === 0 ? `${title}, paso a paso: ` : '';
  return { text: `${head}${out.join(' ')}${more ? ' ¿Sigo?' : ''}`, ...(more ? { next: k } : {}) };
}

// How far the steps were already said in the thread: an answer of the last ones that listed them («Cargar una ficha…,
// paso a paso: 1) … 2) …»), up to the last step it has, in order from the first (an answer that only tells the task in
// its own words said none of them).
function saidUpTo(steps: string[], said: string[]): number {
  let upTo = -1;
  for (const x of said.slice(-3)) {
    if (!/(?:^|\s)1\) /.test(x) && !/(?:^|\s)\d+\) /.test(x)) continue;
    const r = plain(x);
    for (let k = upTo + 1; k < steps.length; k++) {
      const p = plain(steps[k]);
      if (!p || !r.includes(p.slice(0, Math.min(p.length, 60)))) break;
      upTo = k;
    }
  }
  return upTo;
}

// The step of its flow a task is: one of the task's role, the one that shares most of its labels and words.
function flowStepOf(task: Task, role: TeamRole): { flow: Flow; index: number } | null {
  const flow = task.flow ? FLOWS.find((f) => f.id === task.flow) : undefined;
  if (!flow) return null;
  const labels = (t: string) => new Set([...t.matchAll(/«([^«»]+)»/g)].map((m) => plain(m[1])));
  const mine = [task.title, task.when, ...task.steps].join(' ');
  const myLabels = labels(mine);
  const myWords = new Set(tokens(mine));
  let best = -1;
  let bestScore = 0;
  flow.steps.forEach((s, k) => {
    if (!s.roles.includes(role)) return;
    const text = [s.text, ...(s.branches ?? []).map((b) => b.text)].join(' ');
    const score = [...labels(text)].filter((l) => myLabels.has(l)).length * 2 + tokens(text).filter((w) => myWords.has(w)).length * 0.25;
    if (score > bestScore) [best, bestScore] = [k, score];
  });
  return best >= 0 ? { flow, index: best } : null;
}

// The step that comes after one of a flow: its «Sí» way out (or the first that goes on), else the next one.
function flowNext(flow: Flow, index: number): number | null {
  const s = flow.steps[index];
  const way = s.branches?.find((b) => /^S[ií](?![\p{L}])/u.test(b.label) && b.to) ?? s.branches?.find((b) => b.to);
  const to = way?.to ? flow.steps.findIndex((x) => x.id === way.to) : index + 1;
  return to > index && to < flow.steps.length ? to : null;
}
// After the asker's own steps: the next step of the flow that someone else does (design §4(c)3 next (i)).
function flowNextOther(flow: Flow, index: number, roles: Role[]): number | null {
  let k = flowNext(flow, index);
  for (let n = 0; k !== null && n < flow.steps.length; n++) {
    if (!flow.steps[k].roles.every((r) => roles.includes(r))) return k;
    k = flowNext(flow, k);
  }
  return k;
}

// A step of a flow said as what comes next: «Después le toca a Redes: …». When it is the asker's own, and `more`, who
// comes after it too («Después te toca a ti: … Luego le toca al jefe: …»), within about 360 letters.
function flowTurn(flow: Flow, n: number, roles: Role[], more: boolean): Candidate {
  const s = flow.steps[n];
  let text = `${turnOf(s, roles)}: ${stepText(s)}`;
  let last = s;
  const after = more && s.roles.every((r) => roles.includes(r)) ? flowNextOther(flow, n, roles) : null;
  if (after !== null) {
    const t = flow.steps[after];
    const line = `${turnOf(t, roles).replace(/^Después/, 'Luego')}: ${stepText(t)}`;
    if (text.length + line.length <= 360) {
      text = `${text} ${line}`;
      last = t;
    }
  }
  return { text, entryId: `flujo:${flow.id}:${last.id}`, ...(s.href && canOpen(s.href, roles) ? { goTo: s.href } : {}) };
}

// Whether X says what the task as a whole does («¿y después de aprobarla?» of «Aprobar una amarilla o una roja»).
function aboutTitle(title: string, about: string): boolean {
  const verb = tokens(title)[0];
  const want = tokens(about).filter((w) => w.length >= 3);
  return !!verb && want.length > 0 && want.length <= 2 && want.some((w) => w === verb || (w.length >= 4 && verb.length >= 4 && (w.startsWith(verb) || verb.startsWith(w))));
}

// The next step of the flow (from this one on) that this role does.
function flowNextBy(flow: Flow, index: number, role: TeamRole): number | null {
  let k = flowNext(flow, index);
  for (let n = 0; k !== null && n < flow.steps.length; n++) {
    if (flow.steps[k].roles.includes(role)) return k;
    k = flowNext(flow, k);
  }
  return null;
}
const ROLE_WORDS: [RegExp, TeamRole][] = [
  [/\bjefe\b/, 'boss'],
  [/\bdespacho\b/, 'dispatch'],
  [/\bpolitica\b/, 'politics'],
  [/\bivt\b/, 'ivt'],
  [/\bgrabacion\b/, 'camera'],
  [/\bredes\b/, 'social'],
];
/** The team role a «¿y después qué hace X?» names, or null. */
function roleNamed(about: string): TeamRole | null {
  const a = readable(about);
  if (a.split(' ').length > 2) return null;
  return ROLE_WORDS.find(([re]) => re.test(a))?.[1] ?? null;
}

// The parts of a unit a «lo de X» can be about: its own (a task's steps, a screen's items, a flow's steps and ways out, a
// topic's lines), then what the guide says of the same around it (the screens of the task's tutorial, its flow, its
// role's questions) and its «Explicado fácil». `own`: a part of the unit itself (a task's step says «Es el paso N»).
type Part = { text: string; step?: number; own: boolean };
function partsOf(u: Unit, roles: Role[]): Part[] {
  const extra = (texts: (string | undefined)[]): Part[] => texts.filter((t): t is string => !!t).map((text) => ({ text, own: false }));
  const easy = [forRole(facetsOf(u.id)?.easy, roles)];
  const faq = (g?: RoleGuide) => (g ? g.faq.map((f) => `${f.q} ${f.a}`) : []);
  if (u.kind === 'task') {
    const own = u.task.steps.map((text, step) => ({ text, step, own: true }));
    // The task's screens and its flow say more of the same labels («Guardar borrador»: todavía no le llega al jefe).
    const fs = flowStepOf(u.task, u.role);
    const flow = fs ? fs.flow.steps.flatMap((s) => [s.text, ...(s.branches ?? []).map((b) => b.text)]) : [];
    const screens = u.guide.sections.filter((s) => s.tour && s.tour === u.task.tour).flatMap((s) => [...s.youDo, ...(s.cannot ?? [])]);
    return [...own, { text: u.task.when, own: true }, ...extra([...screens, ...flow, ...faq(u.guide), ...easy])];
  }
  if (u.kind === 'screen') return [{ text: u.section.what, own: true }, ...u.section.youDo.map((text) => ({ text, own: true })), ...(u.section.cannot ?? []).map((text) => ({ text: `No puedes: ${lcFirst(text)}`, own: true })), ...extra([...faq(u.guide), ...easy])];
  if (u.kind === 'flow') return [...u.flow.steps.flatMap((s, k) => [{ text: stepsOf(u, roles)[k], step: k, own: true }, ...(s.branches ?? []).map((b) => ({ text: `${b.label}: ${b.text}`, step: k, own: true }))]), ...extra(easy)];
  if (u.kind === 'topic') return [...topicLines(u.topic, roles).map((text, step) => ({ text, step, own: true })), ...extra(easy)];
  if (u.kind === 'term') return [{ text: u.term.text, own: true }, ...extra(easy)];
  if (u.kind === 'job') return [...(u.guide ? [u.guide.job.mission, ...u.guide.job.responsibilities, ...u.guide.job.never] : [ADMIN_GUIDE.mission]).map((text) => ({ text, own: true })), ...extra([...faq(u.guide), ...easy])];
  return sentencesOf(textFor(u.entry.a, roles)).map((text) => ({ text, own: true }));
}

// A part that says what X is (asked what it means or what it is for): the label or the word, then «:» within a few words
// («Arriba, «Vencidas en los municipios»: las que pasaron…», «Guardar borrador» si te falta algo: todavía no…»), X «es»
// or «son» right after it, or the guide's question «¿Qué es una ficha vencida?». Read lower case and without accents, with
// the punctuation.
const fold = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const definesWord = (text: string, w: string) => {
  const stem = w.slice(0, Math.max(4, w.length - 1)).replace(/[^a-z0-9]/g, '');
  if (stem.length < 3) return false;
  return new RegExp(String.raw`\b${stem}[a-z]*»?(?: \([^)]*\))?(?: [a-z]+){0,4}:|\b${stem}[a-z]* (?:es|son) |que (?:es|son) (?:una?|el|la|los|las) (?:[a-z]+ ){0,2}${stem}`).test(fold(text));
};

const TURNS = new Set(['sin', 'no', 'nunca', 'menos', 'solo', 'nada']);
/** The part of the unit that says X best (its labels named whole first, then its words; what defines X, asked what it means), or null. */
function partAbout(u: Unit, about: string, roles: Role[], define = false, last = false): Part | null {
  const want = tokens(about).filter((w) => w.length >= 3);
  if (!want.length) return null;
  const a = ` ${readable(about)} `;
  // A phrase with a word that turns its meaning around and that tokens() leaves out («sin programar» is «programar» to
  // it): the part must say the phrase itself.
  const phrase = readable(about).replace(ARTICLES, '').trim();
  const whole = phrase.split(' ').some((w) => TURNS.has(w)) ? phrase : null;
  const scored = partsOf(u, roles).filter((p) => !whole || ` ${readable(p.text)} `.includes(` ${whole} `)).map((p) => {
    const labels = [...p.text.matchAll(/«([^«»]+)»/g)].map((m) => readable(m[1]));
    const named = labels.some((l) => l.length >= 3 && (a.includes(` ${l} `) || ` ${l} `.includes(a)));
    const have = tokens(p.text);
    const like = (w: string) => have.some((h) => h === w || (h.length >= 4 && w.length >= 4 && (h.startsWith(w) || w.startsWith(h))));
    const share = want.filter(like).length / want.length;
    const defines = define && want.some((w) => definesWord(p.text, w));
    return { p, score: share + (named ? 0.5 : 0) + (defines ? 0.4 : 0) + (p.own ? 0.1 : 0) };
  });
  // The best (the last of the best, «¿y después de …?»: the step where it is done).
  let best: { p: Part; score: number } | null = null;
  for (const x of scored) if (!best || x.score > best.score || (last && x.score === best.score)) best = x;
  if (!best || best.score < 0.6) return null;
  // A part around it that says the same and more («Los teléfonos solo van en los contactos. Para ver los contactos…»).
  const said = plain(best.p.text);
  const fuller = best.p.own ? scored.find((x) => !x.p.own && plain(x.p.text).includes(said) && plain(x.p.text).length > said.length) : undefined;
  return fuller ? { ...fuller.p, step: best.p.step } : best.p;
}

// The colours of the semáforo, said alone («¿qué significa roja?»), and other names of a word the glossary does not list.
// Never «programado»: it is also the state of a ficha comunitaria (por hacerse), as the glossary says; the topic's own
// parts answer it.
const MORE_NAMES: Record<string, string[]> = {
  semaforo: ['rojo', 'roja', 'rojas', 'rojos', 'amarillo', 'amarilla', 'amarillas', 'amarillos', 'verde', 'verdes', 'el color', 'los colores'],
  trancado: ['trancada', 'trancadas', 'trancados'],
};
const namesOf = (g: GlossaryTerm) => [g.term, ...g.aka, ...(MORE_NAMES[g.id] ?? [])];
const ARTICLES = /^(?:(?:el|la|los|las|un|una|lo|eso|esa|ese|esto|esta|este|eso de|lo de) )+/;
/** A word of «Palabras de la app» that X names (one of its names, whole), and whether X is only that name. */
function termNamed(about: string): { g: GlossaryTerm; only: boolean } | null {
  const bare = readable(about).replace(ARTICLES, '').trim();
  for (const g of GLOSSARY) if (namesOf(g).map((n) => readable(n)).includes(bare)) return { g, only: true };
  // (Inside more words, only its own names: «la marca roja» of a network is not the semáforo.)
  for (const g of GLOSSARY) if ([g.term, ...g.aka].some((n) => ` ${bare} `.includes(` ${readable(n)} `))) return { g, only: false };
  return null;
}
/** The first word of «Palabras de la app» a text uses («¿qué significa eso?»: the word of the answer before). */
function termIn(text: string): GlossaryTerm | null {
  const t = ` ${readable(text.replace(/«[^«»]*»/g, ' '))} `;
  let best: { g: GlossaryTerm; at: number } | null = null;
  for (const g of GLOSSARY) {
    for (const n of [g.term, ...g.aka]) {
      const at = t.indexOf(` ${readable(n)} `);
      if (at >= 0 && (!best || at < best.at)) best = { g, at };
    }
  }
  return best?.g ?? null;
}

const facetText = (u: Unit, key: 'easy' | 'example' | 'why', roles: Role[]) => forRole(facetsOf(u.id)?.[key], roles);
const termFacet = (g: GlossaryTerm, key: 'easy' | 'example' | 'why', roles: Role[]) => forRole(facetsOf(`palabra:${g.id}`)?.[key], roles);
// A word's line as the index says it to this person («Programar» to whoever does not publish says who publishes).
const termLine = (g: GlossaryTerm, roles: Role[]) => textFor(entryById(`palabra:${g.id}`)?.a ?? glossaryLine(g), roles);

// What a unit is, in the guide's words (its «Para qué es», the task's title and «Cuándo», the word's meaning).
function guideText(u: Unit, roles: Role[]): string {
  if (u.kind === 'task') return `${u.task.title}: ${lcFirst(end(u.task.when))}`;
  if (u.kind === 'screen') return `${u.section.title.replace(/: /g, ', ')}: ${lcFirst(end(u.section.what))}`;
  if (u.kind === 'flow') return `${u.flow.title}: ${stepsOf(u, roles)[0] ?? ''}`;
  if (u.kind === 'topic') return topicLines(u.topic, roles)[0] ?? '';
  if (u.kind === 'term') return termLine(u.term, roles);
  if (u.kind === 'job') return u.guide ? u.guide.job.mission : ADMIN_GUIDE.mission;
  return textFor(u.entry.a, roles);
}
// What a unit is called: a task's or a screen's title; a curated answer's id, without its file's prefix («red-carrusel»
// is «carrusel»: the word of «Palabras de la app» it names is what it is about; its ways of asking name anything).
const nameOf = (u: Unit): string =>
  u.kind === 'task' ? u.task.title : u.kind === 'screen' ? u.section.title : u.kind === 'entry' ? u.entry.id.replace(/^curado:[a-z]+-/, '').replace(/-/g, ' ') : '';
const tourOfUnit = (u: Unit): string | undefined => (u.kind === 'task' ? u.task.tour : u.kind === 'screen' ? u.section.tour : u.kind === 'entry' ? u.entry.tutorial : undefined);

type Candidate = Omit<ExplainAnswer, 'facet'>;

// ── The facets ─────────────────────────────────────────────────────────────────────────────────────────────────────

function simpler(u: Unit, ctx: ExplainContext, tours: Set<string>): Candidate[] {
  const out: Candidate[] = [];
  const easy = facetText(u, 'easy', ctx.roles);
  if (easy) out.push({ text: easy, entryId: u.id });
  // The word of «Palabras de la app» its title names, said simply, and its first step.
  const name = nameOf(u);
  const g = name ? termIn(name) : null;
  const first = stepsOf(u, ctx.roles)[0];
  if (g) out.push({ text: [termFacet(g, 'easy', ctx.roles) ?? termLine(g, ctx.roles), first ? `Lo primero: ${lcFirst(end(first))}` : ''].filter(Boolean).join(' '), entryId: u.id });
  // Its first sentence, and the tutorial when there is one.
  const tour = tourOfUnit(u);
  const lead = sentencesOf(guideText(u, ctx.roles))[0];
  if (lead && tour && tours.has(tour)) out.push({ text: `${lead} ¿Te lo muestro? Toca el botón y te lo enseño en la pantalla.`, entryId: u.id, tutorial: tour });
  return out;
}

function stepsFacet(u: Unit, ctx: ExplainContext, tours: Set<string>): Candidate[] {
  const said = ctx.said ?? [];
  const steps = stepsOf(u, ctx.roles);
  const tour = tourOfUnit(u);
  const tutorial = tour && tours.has(tour) ? tour : undefined;
  if (steps.length) {
    // From the cursor, else after what the last answers already said (the guide's «paso a paso» says the first ones).
    const from = ctx.cursor ?? saidUpTo(steps, said) + 1;
    const title = u.kind === 'task' ? u.task.title : u.kind === 'flow' ? u.flow.title : u.kind === 'topic' ? u.topic.title : null;
    if (from < steps.length) {
      const page = stepsPage(title, steps, from);
      return [{ text: page.text, entryId: u.id, ...(tutorial ? { tutorial } : {}), ...(page.next !== undefined ? { cursor: page.next } : {}), ...(u.kind === 'flow' ? { goTo: flowsHref(ctx.roles) } : {}) }];
    }
    // All of them were said: the tutorial shows them on the screen.
    if (tutorial) return [{ text: 'Ya te dije todos los pasos. Si quieres, te los muestro en la pantalla: toca el botón.', entryId: u.id, tutorial }];
    return [];
  }
  // A screen: its tutorial; else the task of that screen.
  if (u.kind === 'screen') {
    const out: Candidate[] = [];
    if (tutorial) out.push({ text: `Te lo muestro paso a paso en la pantalla: toca el botón y te enseño ${lcFirst(u.section.title.replace(/: .*$/, ''))}.`, entryId: u.id, tutorial });
    const task = u.guide?.tasks.find((t) => t.tour && t.tour === u.section.tour);
    if (task && u.guide) out.push(...stepsFacet({ kind: 'task', id: `${u.guide.slug}:paso-a-paso:${task.id}`, role: u.guide.role, guide: u.guide, task }, { ...ctx, cursor: undefined }, tours));
    return out;
  }
  return [];
}

function example(u: Unit, ctx: ExplainContext): Candidate[] {
  const out: Candidate[] = [];
  const ex = facetText(u, 'example', ctx.roles);
  if (ex) out.push({ text: ex, entryId: u.id });
  // The example of the word its title names.
  const name = nameOf(u);
  const g = name ? termIn(name) : null;
  const gx = g ? termFacet(g, 'example', ctx.roles) : undefined;
  if (gx && g) out.push({ text: gx, entryId: `palabra:${g.id}` });
  return out;
}

function next(u: Unit, ctx: ExplainContext): Candidate[] {
  const said = ctx.said ?? [];
  const roles = ctx.roles;
  // «¿Y después qué hace Grabación?»: the next step of the flow that role does.
  const who = ctx.about ? roleNamed(ctx.about) : null;
  if (u.kind === 'task') {
    const steps = u.task.steps;
    // Where the person is in the task: the step asked about, the cursor, the step the topic was, or what was said.
    const whole = ctx.about && !who ? aboutTitle(u.task.title, ctx.about) : false;
    const at = ctx.about && !who && !whole ? partAbout(u, ctx.about, roles, false, true)?.step : whole ? steps.length - 1 : undefined;
    const pos = at ?? (ctx.cursor !== undefined ? ctx.cursor - 1 : (u.step ?? (saidUpTo(steps, said) >= 0 ? saidUpTo(steps, said) : steps.length - 1)));
    if (pos + 1 < steps.length && !who) {
      const k = pos + 1;
      const left = k + 1 < steps.length;
      return [{ text: `Después: ${lcFirst(end(steps[k]))}${left ? ' ¿Sigo?' : ''}`, entryId: u.id, ...(left ? { cursor: k + 1 } : {}) }];
    }
    // At its end: the next step of its flow that someone else does (or the one the role asked about does).
    const fs = flowStepOf(u.task, u.role);
    const n = fs ? (who ? flowNextBy(fs.flow, fs.index, who) : flowNext(fs.flow, fs.index)) : null;
    if (fs && n !== null) return [flowTurn(fs.flow, n, roles, !who)];
    return [];
  }
  if (u.kind === 'flow') {
    const from = (ctx.about && !who ? partAbout(u, ctx.about, roles)?.step : undefined) ?? u.step ?? (ctx.cursor !== undefined ? ctx.cursor - 1 : 0);
    const n = who ? flowNextBy(u.flow, from, who) : flowNext(u.flow, from);
    if (n === null) return [{ text: `Ahí termina el camino: ${lcFirst(u.flow.title)}. Lo ves completo en «Ayuda y guías», en «Cómo va el trabajo entre todos».`, entryId: u.id, ...(flowsHref(roles) ? { goTo: flowsHref(roles) } : {}) }];
    return [flowTurn(u.flow, n, roles, !who)];
  }
  if (u.kind === 'topic') return more(u, ctx);
  return [];
}

function purpose(u: Unit, ctx: ExplainContext): Candidate[] {
  const roles = ctx.roles;
  const out: Candidate[] = [];
  const easy = facetText(u, 'easy', roles);
  if (u.kind === 'term') out.push({ text: termLine(u.term, roles), entryId: u.id });
  if (u.kind === 'screen') out.push({ text: guideText(u, roles), entryId: u.id });
  if (easy) out.push({ text: easy, entryId: u.id });
  if (u.kind === 'task') {
    const fs = flowStepOf(u.task, u.role);
    const n = fs ? flowNextOther(fs.flow, fs.index, roles) : null;
    const after = fs && n !== null ? ` Con eso, ${lcFirst(turnOf(fs.flow.steps[n], roles).replace(/^Después /, ''))}: ${stepText(fs.flow.steps[n])}` : '';
    out.push({ text: `${guideText(u, roles)}${after}`, entryId: u.id });
  }
  if (u.kind === 'flow' || u.kind === 'topic' || u.kind === 'job') out.push({ text: guideText(u, roles), entryId: u.id });
  return out;
}

// Without a reason in the data: the guide does not give it (or, for a curated answer of 360, 360 does not have it).
const noWhy = (u: Unit) => (u.kind === 'entry' ? 'De eso no tengo el porqué.' : 'La guía no da el porqué de eso.');

function why(u: Unit, ctx: ExplainContext): Candidate[] {
  const roles = ctx.roles;
  const out: Candidate[] = [];
  const w = facetText(u, 'why', roles);
  if (w) out.push({ text: w, entryId: u.id });
  // Without a reason in the guide: what the guide says, and the guide.
  const go = guideHref(u, roles);
  const says = sentencesOf(guideText(u, roles)).find((s) => !wasSaid(s, ctx.said ?? [])) ?? null;
  if (says) out.push({ text: `${noWhy(u)} ${u.kind === 'entry' ? 'Lo que sé es esto' : 'Lo que dice es esto'}: ${lcFirst(end(says))}`, entryId: u.id, ...(go ? { goTo: go } : {}) });
  if (go) out.push({ text: `${noWhy(u)} Tu guía completa está en «Ayuda y guías»: toca el botón.`, entryId: u.id, goTo: go });
  return out;
}

function meaning(u: Unit | null, ctx: ExplainContext): Candidate[] {
  const roles = ctx.roles;
  const said = ctx.said ?? [];
  const out: Candidate[] = [];
  // The word of the answer before (or of the question before).
  const g = termIn(said.at(-1) ?? '') ?? termIn(ctx.earlier?.at(-1) ?? '');
  if (u?.kind === 'term') {
    const easy = termFacet(u.term, 'easy', roles);
    if (easy) out.push({ text: easy, entryId: u.id });
  }
  if (g) {
    out.push({ text: termLine(g, roles), entryId: `palabra:${g.id}` });
    const easy = termFacet(g, 'easy', roles);
    if (easy) out.push({ text: easy, entryId: `palabra:${g.id}` });
  }
  return out;
}

function more(u: Unit, ctx: ExplainContext): Candidate[] {
  const roles = ctx.roles;
  const said = ctx.said ?? [];
  const out: Candidate[] = [];
  const steps = stepsOf(u, roles);
  // Steps: the next page (from the cursor, else after what was said).
  if (steps.length) {
    const from = ctx.cursor ?? saidUpTo(steps, said) + 1;
    if (from > 0 && from < steps.length) {
      const page = stepsPage(null, steps, from);
      out.push({ text: page.text, entryId: u.id, ...(page.next !== undefined ? { cursor: page.next } : {}) });
    }
  }
  // A screen: what is done there that was not said, then what cannot be done.
  if (u.kind === 'screen') {
    const items = [...u.section.youDo.map((x) => end(ucFirst(x))), ...(u.section.cannot ?? []).map((x) => `No puedes: ${lcFirst(end(x))}`)];
    const left = items.filter((x) => !wasSaid(x, said));
    const pick: string[] = [];
    for (const x of left) {
      if (pick.length && [...pick, x].join(' ').length > PAGE_LETTERS) break;
      pick.push(x);
      if (pick.length >= PAGE) break;
    }
    if (pick.length) out.push({ text: `En ${lcFirst(u.section.title.replace(/: /g, ', '))}, además: ${lcFirst(pick.join(' '))}`, entryId: u.id });
  }
  // A word: its example, then said simply.
  if (u.kind === 'term') {
    const ex = termFacet(u.term, 'example', roles);
    if (ex) out.push({ text: ex, entryId: u.id });
  }
  // A job: what else it does.
  if (u.kind === 'job' && u.guide) {
    const rest = u.guide.job.responsibilities.filter((x) => !wasSaid(x, said)).slice(0, 2);
    if (rest.length) out.push({ text: `También te toca: ${rest.map((x) => lcFirst(x.replace(/[.]$/, ''))).join('; ')}.`, entryId: u.id });
  }
  // A curated answer that was cut: its sentences after the cut.
  if (u.kind === 'entry') {
    const all = sentencesOf(textFor(u.entry.a, roles));
    const rest = all.filter((s) => !wasSaid(s, said));
    if (rest.length && rest.length < all.length) out.push({ text: rest.slice(0, 2).join(' '), entryId: u.id });
  }
  // The rest is in the guide.
  const go = guideHref(u, roles);
  if (go) out.push({ text: 'Lo demás está en tu guía, en «Ayuda y guías»: toca el botón y la abres ahí mismo.', entryId: u.id, goTo: go });
  return out;
}

// What X of a «lo de X» is, in the topic: the word of «Palabras de la app» it names, or the part of the topic that says it.
// X only a word's name («¿qué significa tanda?», «no entendí lo de roja»): the word first. X more than that («lo de la
// cajita del nivel», «lo de antes de aprobar»): the part of the topic that says it first, then the word.
function aboutCandidates(facet: Facet, u: Unit | null, about: string, ctx: ExplainContext, tours: Set<string>): Candidate[] {
  const roles = ctx.roles;
  // «¿Y después de avisar al jefe?», «¿y después qué hace Grabación?»: where the task or the flow goes on.
  if (facet === 'next') return u && (u.kind === 'task' || u.kind === 'flow') ? next(u, ctx) : [];
  // «Paso a paso lo de…», «dime más de…»: the steps of the topic, the rest of it.
  if (facet === 'steps') return u ? stepsFacet(u, { ...ctx, about: undefined }, tours) : [];
  if (facet === 'more') return u ? more(u, { ...ctx, about: undefined }) : [];
  const named = termNamed(about);
  const g = named?.g ?? null;
  const define = facet === 'meaning' || facet === 'purpose';
  const part = u ? partAbout(u, about, roles, define) : null;
  const word: Candidate[] = [];
  if (g) {
    const id = `palabra:${g.id}`;
    const line = termLine(g, roles);
    const easy = termFacet(g, 'easy', roles);
    const ex = termFacet(g, 'example', roles);
    const w = termFacet(g, 'why', roles);
    if (facet === 'example') {
      if (ex) word.push({ text: ex, entryId: id });
    } else if (facet === 'why') {
      if (w) word.push({ text: w, entryId: id });
    } else if (facet === 'simpler') {
      if (easy) word.push({ text: easy, entryId: id });
      word.push({ text: line, entryId: id });
    } else {
      word.push({ text: line, entryId: id });
      if (easy) word.push({ text: easy, entryId: id });
    }
  }
  const fromPart: Candidate[] = [];
  if (part && u) {
    if (facet === 'example') {
      const ex = facetText(u, 'example', roles);
      if (ex) fromPart.push({ text: ex, entryId: u.id });
    } else if (facet === 'why') {
      const w = facetText(u, 'why', roles);
      if (w) fromPart.push({ text: w, entryId: u.id });
      const go = guideHref(u, roles);
      fromPart.push({ text: `${noWhy(u)} ${u.kind === 'entry' ? 'Lo que sé es esto' : 'Lo que dice es esto'}: ${lcFirst(end(part.text))}`, entryId: u.id, ...(go ? { goTo: go } : {}) });
    } else {
      const step = part.own && part.step !== undefined && u.kind === 'task' ? part.step : undefined;
      fromPart.push({ text: step !== undefined ? `Es el paso ${step + 1}: ${lcFirst(end(part.text))}` : end(ucFirst(part.text)), entryId: u.id, ...(step !== undefined ? { cursor: step + 1 } : {}) });
    }
  }
  // X more than a word's name and nothing of the topic says it («¿qué significa «Sin programar»?» after another topic):
  // not the word («Programar»); the answers of today take that question.
  if (named && !named.only && !part) return [];
  return named?.only || !part ? [...word, ...fromPart] : [...fromPart, ...word];
}

/**
 * That facet of the topic for this person (see the header), or null: no topic, a role with no 360, a thread about an
 * event, or nothing left that was not said. `topic`: the index entry that answered the turn before (an Entry, or its id
 * as stored with that answer: `flujo:<id>` stands for a whole flow).
 */
export function explainAnswer(facet: Facet, topic: Entry | string | null | undefined, ctx: ExplainContext): ExplainAnswer | null {
  const roles = ctx.roles;
  // The web's and Atención's roles get no 360 (D-90): nothing to explain to them here.
  if (!roles.some((r) => TEAM_ROLES.includes(r as TeamRole) || r === 'admin')) return null;
  // Never after a turn about an event: that thread keeps the agenda's steps (and its refusal).
  if (ctx.earlier?.length && eventThread(ctx.earlier, ctx.titles ?? NO_TITLES).at(-1)) return null;
  const said = ctx.said ?? [];
  const u = topic ? unitFor(topic, roles) : null;
  // «¿Qué significa eso?» can work from the answer before alone; anything else needs a topic.
  if (!u && facet !== 'meaning') return null;
  if (u && !allowed(u, roles)) return null;
  const tours = toursOf(ctx);
  let list: Candidate[] | null = null;
  if (ctx.about) list = aboutCandidates(facet, u, ctx.about, ctx, tours);
  else if (facet === 'meaning') list = meaning(u, ctx);
  else if (u) {
    list =
      facet === 'simpler' ? simpler(u, ctx, tours)
      : facet === 'steps' ? stepsFacet(u, ctx, tours)
      : facet === 'example' ? example(u, ctx)
      : facet === 'next' ? next(u, ctx)
      : facet === 'purpose' ? purpose(u, ctx)
      : facet === 'why' ? why(u, ctx)
      : more(u, ctx);
  }
  const pick = (list ?? []).find((c) => c.text && !wasSaid(c.text, said));
  if (!pick) return null;
  const text = clip(pick.text);
  const goTo = opens(pick.goTo, roles);
  const tutorial = pick.tutorial && tours.has(pick.tutorial) ? pick.tutorial : undefined;
  return { facet, text, entryId: pick.entryId, ...(goTo ? { goTo } : {}), ...(tutorial ? { tutorial } : {}), ...(pick.cursor !== undefined ? { cursor: pick.cursor } : {}) };
}

// A unit for this person: a role's guide only to that role (or the boss, who reads every guide, never asks about another
// role's task as his own: the topic came from his own answers), administración's screens only to administración, a flow
// only to the roles whose guide has it (as the index gives its steps).
function allowed(u: Unit, roles: Role[]): boolean {
  if (u.kind === 'task' || u.kind === 'job' || u.kind === 'screen') return roles.includes(u.role);
  // Administración is out of Mensajes (D-49), with any other role too: not its topic of «Para todos», not its flow.
  if (u.kind === 'flow') return (u.flow.id !== 'mensajes' || !roles.includes('admin')) && allGuides().some((g) => g.flows.includes(u.flow.id) && roles.includes(g.role));
  if (u.kind === 'topic') return u.topic.id !== 'mensajes' || !roles.includes('admin');
  if (u.kind === 'entry') return u.entry.roles === null || u.entry.roles.some((r) => roles.includes(r));
  return true;
}

/** The sentences of a text, never cutting a «label» in two («Sin señal. Lo que escribas…» is one label). */
export function sentencesOf(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '«') depth++;
    else if (c === '»') depth = Math.max(0, depth - 1);
    const ends = depth === 0 && (/[.!?…]/.test(c) || (c === '»' && /[.!?…]/.test(text[i - 1] ?? ''))) && (i + 1 === text.length || /\s/.test(text[i + 1]));
    if (ends) {
      // A sentence ends here (and the quote that closes right after it, «… se envía cuando vuelva.»).
      const piece = text.slice(start, i + 1).trim();
      if (piece) out.push(piece);
      start = i + 1;
    }
  }
  const rest = text.slice(start).trim();
  if (rest) out.push(rest);
  return out;
}

// Up to about 460 letters, by whole sentences (as local.ts says an answer), never cutting «¿Sigo?» from its steps.
function clip(t: string): string {
  if (t.length <= 480) return t;
  let out = '';
  for (const x of sentencesOf(t)) {
    if (`${out} ${x}`.trim().length > 460) break;
    out = `${out} ${x}`.trim();
  }
  return out || `${t.slice(0, 457).replace(/\s+\S*$/, '')}…`;
}

// For the tests: the guide unit an entry is explained from (a curated answer's related unit), by id.
export function explainUnitId(topic: Entry | string, roles: Role[]): string | null {
  return unitFor(topic, roles)?.id ?? null;
}
