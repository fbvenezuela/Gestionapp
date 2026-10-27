import 'server-only';
import { ROLE_LABEL, type Role } from '../roles';
import { PERSONA, ROLE_BRIEFS, type AssistantProfile } from './config';
import { chat, type ChatMessage, type ChatOptions, type Link } from './providers';
import { EVENT_NOUNS, aboutEvent, asksAboutPublishing, asksRoute, asksWhenWhere, eventThread, mentionsEvent } from './events';
import { scrubTeamFicha, scrubTeamScript } from './guard';
import { carriesWhen, hasDate, hasPlaceOrContact, redact, redactDeep, redactEventSpeech, redactLandmarks, redactQuoted } from './redact';
import { fillHuecos, plain, sentences, HUECO, type Huecos } from './text';
import { ANY_TOKEN, NO_TITLES, Placeholders, type TitleSet } from './titles';
import { runTool, toSpecs, type Tool, type ToolCtx, type ToolRun } from './tools';

// The readings of a question (when, where, how to get there, publishing) live with the shared detector.
export { asksAboutPublishing, asksPlace, asksRoute, asksSchedule, asksWhenWhere, eventAt, withoutWhenWhere } from './events';

// The brain (manual §7, §8, §10, §11): the system prompt in layers, the tool loop, the
// output filter and the server's nets. The prompt is a preference; the filter and the nets
// are the guarantee.

export const DEGRADED_TEXT = 'No pude consultar bien ahora mismo. Ya avisé al equipo.';
export const DEGRADED_UNNOTIFIED = 'No pude consultar bien ahora mismo. Si es urgente, escríbele a administración.';
export const PROMISE_FALLBACK = 'Ahora no consigo avisar al equipo por aquí. Escríbele directo a administración, por favor.';
export const AGENDA_FALLBACK = 'La fecha, la hora y el lugar de los eventos no los manejo: se ven en la Agenda, solo para quien tiene permiso.';
export const LIMIT_TEXT = 'Llevamos un buen rato conversando. Dame un respiro y seguimos en un rato; si es urgente, escríbele a administración.';

export const MAX_TOKENS = 700;
export const TEMPERATURE = 0.6;
export const CORRECTIVE_TEMPERATURE = 0.5;
const MAX_ROUNDS = 3;
const MAX_CALLS = 4;
/** The whole model turn fits inside the window's wait (REQUEST_TIMEOUT_MS = 45 s in the window). */
export const TURN_BUDGET_MS = 40_000;

// origin: 'plataforma' or 'equipo' for a ficha; 'fabrica', 'equipo' or 'conversacion' for a script.
export type Ficha = { key: string | null; title: string; body: string; tags: string[]; origin?: string };
// points: how well it matched (3 per whole trigger said, 1 per word of 4+ letters; assistant_scripts_for).
export type ChosenScript = { key: string | null; topic: string; script: string; always: boolean; origin?: string; points?: number };
export type HistoryMsg = { who: 'persona' | 'asistente'; body: string };

export type TurnContext = {
  profile: AssistantProfile;
  huecos: Huecos;
  roles: Role[];
  personName: string;
  knowledge: Ficha[] | null; // null = could not be read (declared, never silently omitted)
  scripts: ChosenScript[];
  history: HistoryMsg[];
};

// restore: on the model path, `text` carries the placeholders of the titles (titles.ts); this puts the
// real names back for the person, after the filter and the nets have looked at the placeholders.
// goTo: a screen the demo brain points to without a tool («¿dónde está la biblioteca?»).
export type BrainOutput = { text: string; model: string; provider: string | null; tokensIn: number; tokensOut: number; calls: ToolRun[]; restore?: (t: string) => string; goTo?: string };

// ---------------------------------------------------------------------------
// Which fichas go into this turn: the relevant ones, not all of them (a turn should weigh
// about 2.000 tokens). The person's role ficha and the agenda rule always go.
// ---------------------------------------------------------------------------
const ROLE_FICHA: Partial<Record<Role, string>> = {
  admin: 'guia:rol-administracion',
  boss: 'guia:rol-jefe',
  dispatch: 'guia:rol-despacho',
  politics: 'guia:rol-politica',
  ivt: 'guia:rol-ivt',
  social: 'guia:rol-redes',
  camera: 'guia:rol-grabacion',
};
const COMMON = new Set(
  ('como para esta este estos todo todos pero cuando donde queda quedan tiene tengo puedo quiero hacer hace sale salen cual cuales sobre desde hasta porque entonces ahora algo alguien solo bien dime saber ' +
    'hago hice haga necesito debo deberia dice dicen dijo pasa paso salio pongo favor porfa ayuda ayudame cosa cosas mucho mucha muy usted ustedes ' +
    // Questions and fillers (round 6): «¿cuánto puede pesar…?» is about the weight, «¿qué significa…?» about what follows.
    'cuanto cuanta cuantos cuantas puede pueden podria tener tienen significa dejo poner pone ponen ' +
    // «¿Qué llevo a la cancha?» is about what to bring there, which no ficha says («ningún aviso lleva…»).
    'lleva llevo llevas llevan llevamos lleven llevar').split(' '),
);
// Short words that still say what is asked («¿cómo cambio el rol?», «la red», «el CSV»).
const SHORT = new Set(['rol', 'red', 'csv', 'app']);
// Words that name the platform, events in general or trouble: they say little of what is asked («¿cómo
// duplico un evento?» is about duplicating, «hay un error en el copy» about the copy). They count, but at a third.
const GENERIC_WORDS = new Set(['plataforma', 'app', 'aplicacion', 'sistema', 'pagina', 'error', 'errores', 'problema', 'problemas', 'falla', 'fallas']);
const EVENT_NOUN = new RegExp(`^(?:${EVENT_NOUNS})$`);
const isGeneric = (w: string) => GENERIC_WORDS.has(w) || EVENT_NOUN.test(w);
// The content a question is about (S5, ronda 5): «el copy es muy largo» is about the copy, not «largo».
const OBJECTS = new Set(['copy', 'copies', 'video', 'videos', 'pieza', 'piezas', 'tweet', 'tweets', 'foto', 'fotos', 'material', 'storyboard', 'portada', 'reel', 'reels', 'ficha']);

/** Crude Spanish stem, enough to match «invito» with «invita» or «propongo» with «proponer». */
export function stem(w: string): string {
  return w.length <= 4 ? w.slice(0, 3) : w.length <= 6 ? w.slice(0, 4) : w.slice(0, 5);
}

// The verbs whose root changes («apruebo» / «aprobar», «pido» / «pedir», «propuesta» / «proponer»), read as one.
const ROOTS: [RegExp, string][] = [
  [/\baprueb/g, 'aprob'],
  [/\bpid(?=o\b|e\b|en\b|an\b|io\b|ieron\b)/g, 'ped'],
  [/\bcierr/g, 'cerr'],
  [/\bpierd/g, 'perd'],
  [/\bmuev/g, 'mov'],
  [/\bvuelv/g, 'volv'],
  [/\bencuentr/g, 'encontr'],
  [/\bmuestr/g, 'mostr'],
  [/\bprueb/g, 'prob'],
  [/\bcorrij/g, 'correg'],
  [/\b(?:propuest|propus|propong)/g, 'propon'],
  // «correo» is not «corregir» (the same first letters).
  [/\bcorreos?\b/g, 'mail'],
  // The same thing said two ways («la aplicación» / «la app», «el celular» / «el teléfono»).
  [/\baplicacion(?:es)?\b/g, 'app'],
  [/\bcelular(?:es)?\b/g, 'telefono'],
  // A gerund as its verb («subiendo» / «subir», «grabando» / «grabar»; not «cuando»).
  [/\b([a-z]{3,})iendo\b/g, '$1i'],
  [/\b([a-z]{3,})ando\b/g, '$1a'],
];
/** plain(), with the verbs whose root changes written with one root. */
export function canon(text: string): string {
  return ROOTS.reduce((t, [re, to]) => t.replace(re, to), plain(text));
}

/**
 * Whether a text (folded with canon(), with a space before it) has a word of the question: a word that
 * starts with its stem and shares with it at least three quarters of the shorter of the two («invito» /
 * «invitar», «piezas» / «pieza», but «cuanto» is not «cuando», «instalo» is not «instagram» and «internet»
 * is not «intercambio»); a 4-letter word only with its 4th letter or, if that is a vowel, another vowel
 * («copy» / «copies», «subo» / «subir», but «logo» is not «logros» and «dice» is not «dictar»).
 */
export function hasWord(text: string, w: string): boolean {
  if (w.length !== 4) {
    const s = ` ${stem(w)}`;
    for (let at = text.indexOf(s); at >= 0; at = text.indexOf(s, at + 1)) {
      const end = text.indexOf(' ', at + 1);
      const u = text.slice(at + 1, end < 0 ? text.length : end);
      let k = 0;
      while (k < u.length && k < w.length && u[k] === w[k]) k++;
      if (k >= Math.ceil(0.75 * Math.min(u.length, w.length))) return true;
    }
    return false;
  }
  const vowel = /[aeiouy]/.test(w[3]);
  for (let at = text.indexOf(` ${w.slice(0, 3)}`); at >= 0; at = text.indexOf(` ${w.slice(0, 3)}`, at + 1)) {
    const next = text[at + 4] ?? '';
    if (next === w[3] || (vowel && /[aeiouy]/.test(next))) return true;
  }
  return false;
}

/** The words of a text that say something (4+ letters, not the common ones; a few short ones too). */
export function keyWords(text: string): string[] {
  return canon(text).split(' ').filter((w) => (w.length >= 4 || SHORT.has(w)) && !COMMON.has(w));
}

// The platform's data fichas (formulas, categories, video rules per network, best hours) answer when the
// question names what they are about (one of their tags or title words, as said): «¿cómo instalo la
// app?» is not about Instagram's rules. Otherwise they count at a third.
const DATA_FICHA = /^auto:(?:formula|categorias|red|horas)/;
const NOT_A_NAME = new Set(['copies', 'copy', 'video', 'videos', 'publicar', 'reglas', 'mejores', 'horas', 'fichas']);
function namesItsObject(f: Ficha, asked: Set<string>): boolean {
  const own = [...plain(f.title).split(' '), ...f.tags.flatMap((t) => plain(t).split(' '))].filter((w) => w.length >= 3 && !NOT_A_NAME.has(w));
  return own.some((w) => asked.has(w) || asked.has(`${w}s`) || asked.has(`${w}es`) || (w.endsWith('s') && asked.has(w.slice(0, -1))));
}
// «¿Cómo hago / armo un evento?» asks how one is created: on a tie, the ficha that says «crear» goes first.
const MAKE = /\bcomo (?:(?:se|lo|la|los|las|le|les|me|te|nos) )*(?:hago|hacer|hace|hacemos|armo|armar|arma|monto|montar)\b/;
export const makesOne = (text: string) => MAKE.test(plain(text));

// cover: how much of the question (by weight) the ficha has, 0 to 1; words: how many words of the
// question it has; titled: one of them is in its title or its tags.
export type ScoredFicha = { f: Ficha; n: number; cover: number; words: number; titled: boolean };
/**
 * How well each ficha answers a text. Per word of the question, the best place it shows up in a ficha
 * (title 3, tags 2, body 1), times how rare it is among the fichas; the words of events in general count
 * at a third and the content asked about («el copy») at one and a half. Then by how much of the question
 * the ficha covers: a word no ficha has («¿cómo duplico…?») counts against every ficha, so a match on
 * «evento» alone stays weak. Two words in a row as asked add to it; on a tie, a guide ficha (how it is
 * done) goes before the platform's data ones.
 */
export function scoreFichas(all: Ficha[], text: string): ScoredFicha[] {
  // One entry per root: «apruebo» and «aprobar» are the same word here.
  const words = [...new Map(keyWords(text).map((w) => [stem(w), w])).values()];
  const docs = all.map((f) => ({ f, title: ` ${canon(f.title)}`, tags: ` ${canon(f.tags.join(' '))}`, body: ` ${canon(f.body)}` }));
  const bias = (w: string) => (isGeneric(w) ? 1 / 3 : OBJECTS.has(w) ? 1.5 : 1);
  // The verb of a how-to («¿cómo lo corrijo?»): a verb no ficha has says less than a thing no ficha has
  // («¿cómo cambio el logo?»).
  const verb = /\bcomo (?:(?:se|lo|la|los|las|le|les|me|te|nos) )*([a-z]+)/.exec(canon(text))?.[1];
  // Rare words weigh more: «señal» says more than «video», which half the fichas mention. A word no
  // ficha has weighs as the rarest (half for the verb of a how-to), for the coverage only.
  const weight = new Map(
    words.map((w) => {
      const df = docs.filter((d) => hasWord(d.title, w) || hasWord(d.tags, w) || hasWord(d.body, w)).length;
      const unknown = Math.log(1 + docs.length) * (w === verb ? 0.5 : 1);
      return [w, { w: df ? Math.log(1 + docs.length / df) * bias(w) : 0, cover: (df ? Math.log(1 + docs.length / df) : unknown) * bias(w) }];
    }),
  );
  const total = words.reduce((n, w) => n + (weight.get(w)?.cover ?? 0), 0);
  // Two words of the question in a row, as asked («las verdes», «de una vez», «subir a rojo»).
  const asked = canon(text).split(' ').filter(Boolean);
  const keys = new Set(words);
  const pairs = asked.slice(1).flatMap((w, k) => (keys.has(w) || keys.has(asked[k]) ? [` ${asked[k]} ${stem(w)}`] : []));
  const said = new Set(plain(text).split(' '));
  const make = makesOne(text);
  return docs
    .map((d) => {
      let n = 0;
      let covered = 0;
      let found = 0;
      let titled = false;
      for (const w of words) {
        const field = hasWord(d.title, w) ? 3 : hasWord(d.tags, w) ? 2 : hasWord(d.body, w) ? 1 : 0;
        if (!field) continue;
        n += field * (weight.get(w)?.w ?? 0);
        covered += weight.get(w)?.cover ?? 0;
        found++;
        titled ||= field > 1;
      }
      if (n) n += 1.2 * pairs.filter((x) => d.title.includes(x) || d.tags.includes(x) || d.body.includes(x)).length;
      const guide = d.f.key?.startsWith('guia:') ? 1.05 : 1;
      const data = DATA_FICHA.test(d.f.key ?? '') && !namesItsObject(d.f, said) ? 1 / 3 : 1;
      const creates = make && d.title.includes(' crea') ? 1.1 : 1;
      const cover = total ? covered / total : 0;
      return { f: d.f, n: n * (0.4 + 0.6 * cover) * guide * data * creates, cover, words: found, titled };
    })
    .sort((a, b) => b.n - a.n);
}

export function pickFichas(all: Ficha[], text: string, roles: Role[], max = 6, withMust = true): Ficha[] {
  const must = withMust ? all.filter((f) => f.key === 'guia:agenda-privada' || roles.some((r) => ROLE_FICHA[r] === f.key)) : [];
  const scored = scoreFichas(all, text).filter((x) => !must.includes(x.f) && x.n >= 2);
  return [...must, ...scored.slice(0, max).map((x) => x.f)];
}

/** The key of the person's role ficha (for «¿puedo…?» and «¿qué hago yo aquí?»). */
export function roleFichaKeys(roles: Role[]): string[] {
  return roles.map((r) => ROLE_FICHA[r]).filter((k): k is string => !!k);
}

// ---------------------------------------------------------------------------
// The system prompt, layer by layer. What is critical is repeated at the end.
// ---------------------------------------------------------------------------
export function systemPrompt(ctx: TurnContext, tools: Tool[], question: string, ph: Placeholders = new Placeholders(NO_TITLES)): string {
  const f = (t: string) => fillHuecos(t, ctx.huecos);
  // What the team wrote (a ficha of theirs, a script of theirs or saved from a conversation) gets the
  // titles as placeholders and is scrubbed again here, whatever got past the checks when it was
  // saved; a team ficha is judged whole (its title can name the event its body gives the hour of).
  // Factory scripts and platform fichas keep their wording (the tweet slots, the best hours).
  const ficha = (x: Ficha): [string, string] => {
    const [title, body] = [ph.mask(f(x.title)), ph.mask(f(x.body))];
    return x.origin === 'equipo' ? scrubTeamFicha(title, body, ph.titles) : [title, body];
  };
  const script = (x: ChosenScript, t: string) => (x.origin === 'fabrica' ? ph.mask(f(t)) : scrubTeamScript(ph.mask(f(t)), ph.titles));
  const name = ctx.profile.name;
  const L: string[] = [];

  // 1. The trade (what doesn't change), with the name from the settings.
  L.push('## QUIÉN ERES');
  L.push(f(PERSONA.who));
  L.push(`Te llamas ${name}. Si te preguntan tu nombre, dilo siempre («${name}»), cada vez de una forma distinta. Nunca digas que no tienes nombre.`);
  L.push(`Así te presentas: ${f(ctx.profile.intro)}`);
  L.push(f(PERSONA.personality));
  L.push(f(PERSONA.language));
  L.push('Cómo escribes:');
  for (const s of PERSONA.style) L.push(`- ${f(s)}`);
  L.push('Lo que no haces nunca:');
  for (const s of PERSONA.never) L.push(`- ${f(s)}`);

  // 2. How to use the tools.
  L.push('', '## CÓMO USAS LAS HERRAMIENTAS');
  L.push('- Si piden algo que una herramienta hace, llámala. No describas lo que vas a hacer: hazlo y cuenta el resultado.');
  L.push('- Nunca digas que avisaste al equipo sin llamar a avisar_al_equipo.');
  L.push('- Si piden hablar con una persona, o dudan de que sirvas, no lo discutas: llama a avisar_al_equipo y di que ya avisaste. Esta regla gana sobre las demás.');
  L.push('- Para saludar, charlar o dar las gracias, ninguna herramienta.');
  L.push('- Si una herramienta devuelve varios candidatos, no elijas tú: pregunta cuál.');
  L.push('- Si devuelve un error o nada, dilo con palabras normales; no lo escondas ni inventes un resultado.');
  L.push('- Las que preparan algo no lo mandan: di a cuántas personas iría y que falta que administración lo confirme.');
  L.push(`- Herramientas que tienes ahora: ${tools.map((t) => t.name).join(', ') || 'ninguna'}. Si piden algo que ninguna hace, dilo y ofrece avisar a administración.`);
  L.push('- Los nombres de los eventos, de las piezas y de los lugares te llegan como marcas: [[E1]], [[P1]], [[L1]]. Para nombrar uno, escribe su marca tal cual, con los dos corchetes: la plataforma pone el nombre real. No son huecos: no los rellenes, no inventes marcas ni adivines qué nombre hay detrás.');

  // 3. The job, per role. It gives or takes no permission: the platform decides that.
  L.push('', '## A QUIÉN ATIENDES');
  L.push(`Atiendes solo al equipo interno de ${ctx.huecos.app}. Te escribe ${ctx.personName || 'alguien del equipo'}${ctx.huecos.person ? ` (dile ${ctx.huecos.person})` : ''}, con rol: ${ctx.roles.map((r) => ROLE_LABEL[r]).join(', ')}.`);
  for (const r of ctx.roles) {
    const b = ROLE_BRIEFS[r];
    if (b) L.push(`Oficio de ${b.label}: ${f(b.oficio)}`);
  }
  L.push('El oficio no da ni quita permisos: lo que esta persona puede ver lo decide la plataforma. Si una herramienta no le devuelve algo, es que no le toca.');

  // 4. Data and fichas. An absent datum is declared, never omitted.
  L.push('', '## LO QUE SABES (FICHAS)');
  if (ctx.knowledge === null) {
    L.push('Ahora mismo no tienes las fichas (no se pudieron leer). No inventes datos de la plataforma: si la respuesta depende de ellas, di «Déjame confirmarlo con el equipo» y ofrece avisar a administración.');
  } else {
    const picked = pickFichas(ctx.knowledge, `${question} ${ctx.history.filter((h) => h.who === 'persona').slice(-2).map((h) => h.body).join(' ')}`, ctx.roles, 4);
    if (!picked.length) L.push('No hay fichas sobre esto. Si te preguntan algo que no está aquí ni en una herramienta, dilo sin inventar.');
    let used = 0;
    for (const x of picked) {
      const [title, body] = ficha(x);
      const line = `- ${title}: ${body}`;
      if (used + line.length > 5000) break;
      used += line.length;
      L.push(line);
    }
  }

  // 5. Who is asking (their own things come from the tools, as facts to use).
  L.push('', '## QUIEN PREGUNTA');
  L.push(`Nombre: ${ctx.personName || 'sin dato'}. Lo suyo (pendientes, piezas, avisos) lo consultas con las herramientas; nunca lo supongas.`);

  // 6. Examples: «ASÍ CONTESTAS».
  if (ctx.scripts.length) {
    L.push('', '## ASÍ CONTESTAS');
    L.push('Ejemplos escritos por el equipo. No los copies letra por letra: son el tono y el fondo. Elige entre las variantes, mezcla, acorta. Nunca la misma frase dos veces en una conversación. Lo que va entre corchetes se rellena con el dato real (de las fichas o de una herramienta) o se calla. Cuando un ejemplo diga [usa …], llama a esa herramienta de verdad.');
    for (const s of ctx.scripts) L.push(`### ${script(s, s.topic)}${s.always ? ' (siempre)' : ''}`, script(s, s.script));
  }

  // 7. The last thing read weighs most.
  L.push('', '## LO MÁS IMPORTANTE (REPITO)');
  L.push(`- Te llamas ${name}.`);
  L.push('- Nunca das fecha, hora, dirección, cómo llegar ni contactos de un evento: no los tienes. Si los piden, se ven en la Agenda, solo para quien tiene permiso.');
  L.push('- Nunca dices que avisaste sin haber llamado a avisar_al_equipo.');
  L.push('- Si un dato no está en las fichas ni en lo que devolvió una herramienta, no lo inventes.');
  L.push('- Las marcas como [[E1]] se copian tal cual.');
  L.push('- Una o dos frases, texto plano, sin markdown.');
  return L.join('\n');
}

// ---------------------------------------------------------------------------
// Output filter (§10). Whatever is forbidden and detectable by text is also removed in
// code. Revealing sentences go WHOLE (split by sentence). It NEVER leaves the answer empty.
// ---------------------------------------------------------------------------
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFD]/g;
const REVEALING = /(?<![\p{L}])(como (una? )?(ia|inteligencia artificial|modelo de lenguaje)|soy (una ia|un modelo de lenguaje|un bot|un programa|un asistente virtual)|modelo de lenguaje)(?![\p{L}])/iu;

function dropSentences(text: string, bad: (s: string) => boolean): string {
  if (!sentences(text).some(bad)) return text;
  return sentences(text).filter((s) => !bad(s)).join(' ').trim();
}

export function filterOutput(t: string, assistantName?: string): string {
  const original = String(t ?? '');
  const base = original.replace(CONTROL, '');
  let x = base
    .replace(/\*\*(.+?)\*\*/gs, '$1')
    .replace(/__(.+?)__/gs, '$1')
    .replace(/(^|[\s(])\*(\S[^*\n]*?)\*(?=[\s.,;:!?)]|$)/g, '$1$2')
    .replace(/(^|[\s(])_(\S[^_\n]*?)_(?=[\s.,;:!?)]|$)/g, '$1$2')
    .replace(/`{1,3}([^`]+?)`{1,3}/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/\[([^\]\n]+)\]\((?:https?:\/\/|\/)[^)\s]*\)/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  // A copied script line: "[ASISTENTE]: …" or "Name: …".
  const prefixes = ['\\[ASISTENTE\\]', 'Asistente', ...(assistantName ? [assistantName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')] : [])];
  x = x.replace(new RegExp(`^(?:${prefixes.join('|')})\\s*:\\s*`, 'i'), '');
  // A title's placeholder («[[E1]]») is not an unfilled hueco: it becomes the real name later.
  const steps = [(s: string) => REVEALING.test(s), (s: string) => HUECO.test(s.replace(ANY_TOKEN, ''))];
  for (const bad of steps) {
    const y = dropSentences(x, bad);
    if (y) x = y;
  }
  return x || base.trim() || original.trim();
}

/** A separate check that what goes out is human text (manual §10): more than 8 characters, at
 * least half of them letters, and no runs of dots. «¡De nada!» passes; «ok» or «1234…» don't. */
export function looksLikeText(t: string | null | undefined): boolean {
  const s = String(t ?? '').trim();
  if (s.length <= 8 || /[.…]{4,}/.test(s)) return false;
  const letters = (s.match(/\p{L}/gu) ?? []).length;
  return letters >= 3 && letters / s.length >= 0.5;
}

// ---------------------------------------------------------------------------
// The server's nets (§11).
// ---------------------------------------------------------------------------
const NOT_LETTER = '(?![\\p{L}])';
const PROMISE = new RegExp(
  [
    `(?<![\\p{L}])(ya|le|les)\\s+avis[eé]${NOT_LETTER}`,
    `(?<![\\p{L}])avisé${NOT_LETTER}`,
    `(?<![\\p{L}])notifiqu[eé]${NOT_LETTER}`,
    `(?<![\\p{L}])le pas[eé]${NOT_LETTER}`,
    `(?<![\\p{L}])pas[eé] tu mensaje`,
    `(?<![\\p{L}])te (escribir[aá]n?|contactar[aá]n?|van a (escribir|contactar|llamar)|llamar[aá]n?)${NOT_LETTER}`,
    `(?<![\\p{L}])alguien del equipo te (escribe|escribir[aá]|contacta|contactar[aá]|llama|llamar[aá])${NOT_LETTER}`,
  ].join('|'),
  'iu',
);

/** Says (not offers) that the team was told. Questions ("¿quieres que avise?") are offers. */
export function promisesNotice(text: string): boolean {
  return sentences(text).some((s) => !/[¿?]/.test(s) && PROMISE.test(s));
}

/** Is this turn about an event (so a date or time in the answer breaks the agenda rule)? An event lookup, or the question by the shared detector (events.ts). */
export function aboutEvents(question: string, calls: ToolRun[] = [], titles: TitleSet = NO_TITLES): boolean {
  return calls.some((c) => c.tool === 'buscar_evento') || aboutEvent(question, titles);
}

// Tools whose answers carry publishing hours or days, never an event's.
const PUBLISH_TOOLS = new Set(['mejores_horas', 'reglas_de_video', 'dias_de_tweets']);

/** A turn about publishing: asked about it (or used the best-hours tools) and touched no event tool. */
export function publishingTurn(question: string, calls: ToolRun[] = []): boolean {
  if (calls.some((c) => !PUBLISH_TOOLS.has(c.tool))) return false;
  return calls.some((c) => c.tool === 'mejores_horas' || c.tool === 'dias_de_tweets') || asksAboutPublishing(question);
}

// An event place's placeholder: a where.
const PLACE_TOKEN = /\[{1,2}\s*[Ll]\s*\d{1,4}\s*\]{1,2}/;

/**
 * An answer about events that carries a date, a time, a day (also «hoy», «mañana» or «temprano»), a
 * place or a contact breaks the agenda rule, in any way of writing them that is detected. About events:
 * the question (the shared detector, events.ts), an event lookup, or, with `answerToo` (what a model
 * wrote), an answer that names an event itself (an event word, a title's placeholder, the boss or who
 * records). In a turn about publishing, times and weekdays are the best hours and days (allowed) but a
 * date or a place still breaks it. A title's placeholder is not a when (an event place's placeholder is
 * a where); ratios («4/5»), «Hoy» the screen and how long something takes don't count.
 */
export function breaksAgendaRule(answer: string, question: string, calls: ToolRun[] = [], titles: TitleSet = NO_TITLES, o: { answerToo?: boolean } = {}): boolean {
  if (!aboutEvents(question, calls, titles) && !(o.answerToo && mentionsEvent(answer, titles))) return false;
  if (PLACE_TOKEN.test(answer)) return true;
  const t = String(answer ?? '').replace(ANY_TOKEN, 'el evento');
  if (hasPlaceOrContact(t)) return true;
  return publishingTurn(question, calls) ? hasDate(t) : carriesWhen(t);
}

/**
 * The person's question as it is stored and sent to a provider (already through redact()). A landmark
 * with its name or its adjective («frente a la alcaldía de Táriba», «la cancha techada de El Mirador»)
 * is a place in any question and goes (on the model path a title the person typed is already a
 * placeholder by then). About an event (the shared detector, events.ts, without its bare «a day or an
 * hour» signal), how-to or not, places said by name go too («en Pueblo Nuevo»), and so do its days and
 * parts of the day («la toma de pasado mañana»), except a day said for the person's own work («mañana
 * subo el material») and the days of a question about publishing. Otherwise days are ordinary words
 * («¿qué tengo hoy?») and stay: such a question is answered by 360 and left out of any later thread.
 */
export function guardQuestion(question: string, titles: TitleSet = NO_TITLES): string {
  const q = String(question ?? '');
  if (!aboutEvent(q, titles, { when: false })) return redactLandmarks(q);
  return redactEventSpeech(q, { when: !asksAboutPublishing(q) });
}

// ---------------------------------------------------------------------------
// The model path: chain + tool loop (max 4 calls per round, 3 rounds, the last without tools).
// ---------------------------------------------------------------------------
/**
 * What a tool returned, as it goes to the provider: every string scrubbed here, in one place, so
 * a new tool is covered too. The titles the person can see become placeholders first (an event
 * title can carry a date, a time or an address typed into it in any form); then every string is
 * redacted. The best-hours tools keep their times of day; dates, addresses and contacts go from all.
 */
export function toolMessage(run: ToolRun, ph?: Placeholders): string {
  const value = run.ok ? run.result ?? null : { error: run.error };
  return JSON.stringify(redactDeep(ph ? ph.maskDeep(value) : value, { keepTimes: PUBLISH_TOOLS.has(run.tool) }));
}

export type ModelTurnInput = {
  ctx: TurnContext;
  question: string; // as stored: already redacted (redact + guardQuestion)
  typed?: string; // what the person wrote: sent with the titles as placeholders, then the same locks
  tools: Tool[];
  toolCtx: ToolCtx;
  chain: Link[];
  chatOptions?: Partial<ChatOptions>;
  titles?: TitleSet; // what this person can see, read as the person (titles.ts loadTitles)
};

export async function modelTurn(i: ModelTurnInput): Promise<BrainOutput> {
  // One set of placeholders for the whole turn: the same title is the same «[[E1]]» everywhere.
  const titles = i.titles ?? NO_TITLES;
  const ph = new Placeholders(titles);
  // What the person typed, now and earlier: a title or an event's place they type goes as its
  // placeholder too (masked before the redaction, so it is recognised whole), then the stored locks.
  const asked = (t: string) => guardQuestion(redact(ph.mask(t)), titles);
  // What was said about an event stays with 360: an earlier question about one (the shared detector),
  // one that went on with it, and the answers to them are left out of the thread the provider sees.
  const withEvent = eventThread(i.ctx.history.filter((h) => h.who === 'persona').map((h) => h.body), titles);
  let k = -1;
  const thread = i.ctx.history.filter((h) => {
    if (h.who === 'persona') k++;
    return !withEvent[k];
  });
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt(i.ctx, i.tools, i.question, ph) },
    // The thread is scrubbed too. Earlier answers quote titles as they are («Toma 9.30»): those go as
    // placeholders, and the rest of the answer gets the second lock, like a tool's result.
    ...thread.map((h): ChatMessage => (h.who === 'persona' ? { role: 'user', content: asked(h.body) } : { role: 'assistant', content: redactQuoted(ph.mask(h.body)) })),
    { role: 'user', content: asked(i.typed ?? i.question) },
  ];
  const specs = toSpecs(i.tools);
  const calls: ToolRun[] = [];
  let tokensIn = 0;
  let tokensOut = 0;
  let model = '';
  let provider: string | null = null;
  let text = '';
  // Later rounds start from the link that answered: a dead or slow first link is not asked again
  // every round. And the whole turn has one budget, below the window's wait.
  let chain = i.chain;
  const deadline = i.chatOptions?.deadline ?? Date.now() + TURN_BUDGET_MS;
  const ask = async (withTools: boolean, temperature = TEMPERATURE) => {
    const r = await chat(messages, { ...i.chatOptions, chain, deadline, tools: withTools && specs.length ? specs : undefined, maxTokens: MAX_TOKENS, temperature });
    const k = chain.findIndex((l) => l.raw === r.link);
    if (k > 0) chain = chain.slice(k);
    tokensIn += r.usage.prompt_tokens;
    tokensOut += r.usage.completion_tokens;
    model = r.link;
    provider = r.provider;
    return r;
  };

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const last = round === MAX_ROUNDS - 1;
    let r: Awaited<ReturnType<typeof ask>>;
    try {
      r = await ask(!last);
    } catch (e) {
      // What the tools already did in earlier rounds must still be reported and saved.
      throw Object.assign(e as Error, { partial: { text: '', model, provider, tokensIn, tokensOut, calls } satisfies BrainOutput });
    }
    // The last round goes without tools: tool calls that come back anyway are NOT run (an empty
    // text then ends degraded, honestly).
    if (last || !r.toolCalls.length) {
      text = r.text;
      break;
    }
    const batch = r.toolCalls.slice(0, MAX_CALLS);
    messages.push({ role: 'assistant', content: r.text || null, tool_calls: batch });
    for (const c of batch) {
      // A lookup by a placeholder («[[E1]]») runs with the real title; what comes back is masked again.
      const run = await runTool(c.function.name, ph.restoreArgs(c.function.arguments), i.tools, i.toolCtx);
      calls.push(run);
      // The error goes back as it is: hidden, the model would invent that it worked.
      messages.push({ role: 'tool', tool_call_id: c.id, content: toolMessage(run, ph) });
    }
  }

  // Corrective round (lower temperature, no tools): an answer about events with a date or time.
  if (text && breaksAgendaRule(text, i.question, calls, titles, { answerToo: true })) {
    messages.push({ role: 'assistant', content: text });
    messages.push({ role: 'user', content: 'No me des fecha, hora ni lugar de ningún evento: tú no tienes la agenda. Contéstame de nuevo sin eso.' });
    try {
      const r = await ask(false, CORRECTIVE_TEMPERATURE);
      text = r.text && !breaksAgendaRule(r.text, i.question, calls, titles, { answerToo: true }) ? r.text : AGENDA_FALLBACK;
    } catch {
      text = AGENDA_FALLBACK;
    }
  }
  // Asked when or where an event is: the titles come back without their own date, time or place.
  const scrub = aboutEvents(i.question, calls, titles) && !publishingTurn(i.question, calls) && (asksWhenWhere(i.question) || asksRoute(i.question));
  return { text, model, provider, tokensIn, tokensOut, calls, restore: (t) => ph.restore(t, { scrub }) };
}
