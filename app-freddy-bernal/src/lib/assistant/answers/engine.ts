// 360's answer index (D-89): every question the team may ask, with its answer per role, from one place. Built once,
// lazily, from the curated entries (ANSWERS: the long tail in people's words) and from the help content itself (the
// role guides, «Para todos», the flows and administración's guide: src/lib/guides, the same source as /ayuda, so 360
// never drifts from it). Pure: no database, no I/O. The demo brain answers with the best entry; with a model chain the
// best ones go into the prompt as fichas (brain.ts pickFichas). Static, date-free text: answering never leaks the agenda.
import { ROLE_LABEL, TEAM_ROLES, type Role, type TeamRole } from '../../roles';
import { ADMIN_GUIDE, FLOWS, SHARED, allGuides } from '../../guides';
import { NO_MESSAGES_LINE } from '../../guides/shared';
import { everyoneSections } from '../../guides/sections';
import type { SectionGuide, Task } from '../../guides/types';
import { plain } from '../text';
import { ANSWERS, ANSWER_FILES, type Answer, type AnswerText } from './index';

// kind: what the entry is (it decides how it is matched and how 360 says it): a curated entry, a question of a guide's
// FAQ, a screen (what it is for), one thing done on a screen, something a role cannot do there, a task and one of its
// steps, the job (what the role does, never does, with whom, its day), a topic of «Para todos» and one of its lines, a
// step of a flow, and one of administración's notes.
export type Kind = 'curated' | 'faq' | 'screen' | 'item' | 'cannot' | 'task' | 'step' | 'job' | 'never' | 'with' | 'day' | 'topic' | 'line' | 'flow' | 'note';

export type Entry = {
  id: string;
  kind: Kind;
  source: string; // where it comes from, for the tests and the panel: 'curado:todos', 'boss:tasks.poner-fecha', 'shared:fecha'…
  roles: Role[] | null; // null = everyone (the team and administración)
  q: string[]; // ways it is asked: matched both ways
  doc?: string; // what it says: matched one way, at a lower weight
  a: AnswerText;
  go?: string; // a SCREENS href (the caller shows it only to whoever can open it)
  tutorial?: string; // a tour id (the caller offers it only to whoever has it)
  screen?: string; // the screen it is about (a small bonus there, and «¿qué es esto?»)
  next?: string; // a step's next step («¿y después?»)
  may?: boolean; // a «No…» to «¿puedo…?» (what a role cannot or never does): only for that question
};

export type Confidence = 'strong' | 'weak' | 'none';
export type Match = { entry: Entry; score: number; confidence: Confidence; text: string };

// ── Reading a question ─────────────────────────────────────────────────────────────────────────────────────────────

// What is written to save letters, dictated or said another way (Venezuelan shorthand, design point 12), read as the
// words it stands for. Applied on plain() text, word by word.
const SHORTHAND: [RegExp, string][] = [
  [/\b(?:q|k|ke|qe)\b/g, 'que'],
  [/\b(?:xq|pq|porq|xk|pk|porke|xque)\b/g, 'por que'],
  [/\b(?:kndo|qndo|cndo|cuado|kuando|cdo)\b/g, 'cuando'],
  [/\b(?:onde|aonde|adonde|dnd|dnde|dond)\b/g, 'donde'],
  [/\bd\b/g, 'de'],
  [/\bpal\b/g, 'para el'],
  [/\bpa\b/g, 'para'],
  [/\b(?:kiero|kero|qiero)\b/g, 'quiero'],
  [/\b(?:grax|grx|grasias|graciaas)\b/g, 'gracias'],
  [/\b(?:tb|tmb|tbn|tambn)\b/g, 'tambien'],
  [/\b(?:msj|msje|mje|mensj)\b/g, 'mensaje'],
  [/\b(?:msjs|mjes|msjes)\b/g, 'mensajes'],
  [/\b(?:cel|telf|tlf|tel|tlfn|celu)\b/g, 'telefono'],
  [/\b(?:xfa|xfavor|porfa|porfis|plis|please)\b/g, 'por favor'],
  [/\b(?:toy)\b/g, 'estoy'],
  [/\b(?:ta)\b/g, 'esta'],
  [/\b(?:tan|stan)\b/g, 'estan'],
  [/\b(?:sta)\b/g, 'esta'],
  [/\b(?:aki|aca)\b/g, 'aqui'],
  [/\b(?:nd|nada)\b/g, 'nada'],
  [/\b(?:ud|uds)\b/g, 'usted'],
  [/\b(?:info)\b/g, 'informacion'],
  [/\b(?:insta|ig)\b/g, 'instagram'],
  [/\b(?:fb)\b/g, 'facebook'],
  [/\b(?:yt)\b/g, 'youtube'],
  [/\b(?:tuit|tuits|twit|twits)\b/g, 'tweet'],
  [/\b(?:tik tok)\b/g, 'tiktok'],
  [/\b(?:(?:en|para|de|a) )x\b/g, ' twitter'],
  [/\bx\b/g, 'por'],
  [/\b(?:gobernador|gobernadora|gobe|gober)\b/g, 'jefe'],
  [/\b(?:camarografos?|camarografas?|camaras?|camarita)\b/g, 'grabacion'],
  [/\b(?:compa|compas|companeros?|companeras?|colegas?|panas?)\b/g, 'equipo'],
  [/\b(?:email|emails|mail|mails|gmail)\b/g, 'correo'],
  [/\b(?:chat|chats)\b/g, 'mensajes'],
  [/\b(?:notificaciones|notificacion)\b/g, 'avisos'],
  [/\b(?:clave|claves|password|contrasenas?)\b/g, 'contrasena'],
  [/\b(?:aplicacion|aplicaciones|aplicacio)\b/g, 'app'],
  [/\b(?:copies)\b/g, 'copy'],
  [/\bpara que\b/g, 'paraque'],
  [/\bdel? uno al? diez\b/g, 'de 1 a 10'],
  [/\b1 al 10\b/g, '1 a 10'],
];

/** plain(), with the shorthand read as words: what the index matches. */
export function readable(text: string): string {
  return SHORTHAND.reduce((t, [re, to]) => t.replace(re, to), plain(text)).replace(/\s+/g, ' ').trim();
}

// Words that say nothing of what is asked (articles, prepositions, fillers, auxiliaries).
const STOP = new Set(
  ('a al ante con contra de del desde en entre hacia hasta para por segun sin sobre tras el la lo los las un una unos unas y e o u ni que se me te le les nos mi mis tu tus su sus ' +
    'es son era fue sea ser estar esta estan este esto estos esa ese eso esas esos aquel ya si muy mas pero como cual cuales hay algo alguien alguna algun algunos ' +
    'todo toda todos todas otro otra otros otras cada mismo misma tambien solo aqui ahi alla asi bien pues osea tipo cosa cosas ahora ahorita luego entonces bueno oye ' +
    'hola porfa favor puedo puede pueden podemos podria podrian quiero quiere quieres necesito necesita tengo tienes tiene tienen tener hago haces hace hacen hacer ' +
    'voy vas va van vamos ir dime decir digo dice saber se sabes yo tu usted el ella ellos nosotros eh ah okey ok vale dale gracias epa buenas buenos dias tarde ' +
    'deberia debo debe hice hizo cuanto cuanta cuantos cuantas sera seria tan tanto pasa paso eso estoy estas estamos mucho mucha muchos poco nada ese cuando donde quien quienes ' +
    'porque por que aja verdad realmente exactamente queda quedan quedo quede quedaron estaba estaban estuvo estaria').split(' '),
);
// Question words and negation: they shape a question («¿dónde…?», «¿quién…?», «no me llega») and weigh little.
const LIGHT: Record<string, number> = { donde: 0.5, quien: 0.6, quienes: 0.6, cuando: 0.4, no: 0.6, nunca: 0.6, despues: 0.4, antes: 0.4, porque: 0.3, mio: 0.4, paraque: 0.5 };
// The person's own («mi nombre», «mis avisos», «tu perfil»): one light word.
const MINE = new Set(['mi', 'mis', 'tu', 'tus']);

// Verbs whose root changes, and the same thing said two ways: read as one root.
const IRREGULAR = new Map<string, string>(
  Object.entries({
    pongo: 'pon', pones: 'pon', pone: 'pon', ponen: 'pon', poner: 'pon', ponga: 'pon', pongan: 'pon', puse: 'pon', puso: 'pon', pusieron: 'pon', ponle: 'pon', ponerle: 'pon', ponerla: 'pon', ponerlo: 'pon', ponerse: 'pon', ponemos: 'pon', puesto: 'pon', puesta: 'pon',
    veo: 'ver', ve: 'ver', ves: 'ver', ver: 'ver', vemos: 'ver', vio: 'ver', vi: 'ver', visto: 'ver', vista: 'ver', vea: 'ver', verlo: 'ver', verla: 'ver', verlos: 'ver', ven: 'ver',
    salgo: 'sal', sale: 'sal', salen: 'sal', salir: 'sal', salio: 'sal', salga: 'sal', salgan: 'sal', salimos: 'sal', sali: 'sal',
    subi: 'sub', subio: 'sub', subieron: 'sub', suba: 'sub', suban: 'sub', subirlo: 'sub', subirla: 'sub', subirlos: 'sub', subido: 'sub', subida: 'sub', subidas: 'sub', subidos: 'sub',
    apruebo: 'aprob', aprueba: 'aprob', aprueban: 'aprob', apruebe: 'aprob', aprueben: 'aprob', apruebas: 'aprob',
    pido: 'ped', pide: 'ped', piden: 'ped', pida: 'ped', pidio: 'ped', pidieron: 'ped', pedido: 'ped', pedidos: 'ped', pedidas: 'ped',
    cierro: 'cerr', cierra: 'cerr', cierran: 'cerr', cierre: 'cerr',
    pierdo: 'perd', pierde: 'perd', perdi: 'perd', perdio: 'perd', perdido: 'perd',
    muevo: 'mov', mueve: 'mov', mueven: 'mov', mueva: 'mov', movi: 'mov', movio: 'mov', movida: 'mov', movido: 'mov',
    vuelvo: 'volv', vuelve: 'volv', vuelven: 'volv', volvio: 'volv',
    encuentro: 'encontr', encuentra: 'encontr', encuentran: 'encontr',
    muestro: 'mostr', muestra: 'mostr', muestran: 'mostr', muestrame: 'mostr', mostrar: 'mostr', mostrarme: 'mostr', muestras: 'mostr',
    pruebo: 'prob', prueba: 'prob', probar: 'prob',
    corrijo: 'correg', corrige: 'correg', corrigen: 'correg', corregir: 'correg', corregi: 'correg', corrigio: 'correg', corregido: 'correg',
    propongo: 'propon', propone: 'propon', proponer: 'propon', propuesta: 'propon', propuestas: 'propon', propuse: 'propon', propuso: 'propon', propuesto: 'propon',
    elijo: 'eleg', elige: 'eleg', eligen: 'eleg', elegir: 'eleg', elegi: 'eleg',
    sigo: 'segu', sigue: 'segu', siguen: 'segu', seguir: 'segu', siguiente: 'segu',
    escrito: 'escrib', escrita: 'escrib', escritos: 'escrib', escribo: 'escrib', escribir: 'escrib', escribe: 'escrib', escribelo: 'escrib',
    entiendo: 'entend', entiende: 'entend', entender: 'entend',
    empiezo: 'empez', empieza: 'empez', empiezan: 'empez', empezar: 'empez',
    consigo: 'consegu', consigue: 'consegu', conseguir: 'consegu',
    digo: 'dec', dice: 'dec', dicen: 'dec', dijo: 'dec', diga: 'dec',
    doy: 'dar', da: 'dar', dan: 'dar', dar: 'dar', dio: 'dar', di: 'dar',
    traigo: 'trae', traer: 'trae', trae: 'trae',
    llego: 'lleg', llega: 'lleg', llegan: 'lleg', llegar: 'lleg', llegue: 'lleg',
    escojo: 'escog', escoge: 'escog',
    envio: 'envi', envia: 'envi', envian: 'envi', enviar: 'envi', envie: 'envi', enviado: 'envi',
    celular: 'telefon', celulares: 'telefon', telefono: 'telefon', telefonos: 'telefon',
    correo: 'mail', correos: 'mail',
    leo: 'leer', lee: 'leer', leen: 'leer', leer: 'leer', lees: 'leer', leyendo: 'leer', leido: 'leer', lei: 'leer',
    estado: 'estado', estados: 'estado',
    copy: 'copy', tweet: 'tweet', tweets: 'tweet', reel: 'reel', reels: 'reel',
    video: 'vide', videos: 'vide',
    jefe: 'jefe', jefa: 'jefe',
    app: 'app', apps: 'app',
    fotico: 'foto', foticos: 'foto', fotos: 'foto', foto: 'foto',
  }),
);
const SUFFIXES = 'amientos imientos amiento imiento aciones iciones acion icion adoras adores adora ador mente ando iendo aron ieron arian arias aria ados adas idos idas ado ada ido ida amos emos imos aban aba ian ar er ir an en as es os a e o s'.split(' ');

/** A crude root of a word: «apruebo» and «aprobar», «fotos» and «foto», «publicación» and «publicar» are one. */
export function rootOf(w: string): string {
  const irr = IRREGULAR.get(w);
  if (irr) return irr;
  // Clitics after an infinitive: «ponerle», «subirlo», «mandarles»; «publiqué» is «publicar», «pagué» is «pagar».
  const r = (w.length > 6 ? w.replace(/(ar|er|ir)(?:se)?(?:le|la|lo|les|las|los|me|te|nos)$/, '$1') : w).replace(/(?<=[a-z]{3})qu(e|en|es|emos)$/, 'c$1').replace(/(?<=[a-z]{3})gu(e|en|es|emos)$/, 'g$1');
  for (const s of SUFFIXES) if (r.length - s.length >= 3 && r.endsWith(s)) return r.slice(0, -s.length);
  return r;
}

// Two ways of saying the same thing: a word matches its group at 0.8.
const SYNONYMS: string[][] = [
  ['sub', 'carg', 'mont', 'colg'],
  ['cre', 'arm', 'mont'],
  ['borr', 'elimin'],
  ['cambi', 'modific', 'edit', 'correg', 'actualiz'],
  ['mand', 'envi'],
  ['ver', 'mir', 'leer'],
  // The obra fichas are the IVT's; the videos and the photos are the material.
  ['obr', 'ivt'],
  ['material', 'vide', 'foto'],
  ['sal', 'aparec'],
  ['entr', 'ingres'],
  ['llen', 'complet'],
  ['descarg', 'baj'],
  ['agreg', 'met', 'anad', 'inclu'],
  ['invit', 'agreg'],
  ['quit', 'sac'],
  ['equivoc', 'error', 'mal'],
  ['nuev', 'otr'],
  ['problem', 'fall', 'error'],
];
const SYN = new Map<string, Set<string>>();
for (const g of SYNONYMS) for (const r of g) SYN.set(r, new Set([...(SYN.get(r) ?? []), ...g.filter((x) => x !== r)]));

type Tok = { root: string; w: number; light: boolean };

/** The words of a text that say something, as roots (in order, repeated ones once). */
export function tokens(text: string): string[] {
  const out: string[] = [];
  for (const raw of readable(text).split(' ')) {
    const w = MINE.has(raw) ? 'mio' : raw;
    if (!w || (STOP.has(w) && !(w in LIGHT))) continue;
    if (w.length < 2 && !/^\d$/.test(w)) continue;
    const r = w in LIGHT ? w : rootOf(w);
    if (!out.includes(r)) out.push(r);
  }
  return out;
}

// How two roots match: the same (1), synonyms (0.8), or one is the other with a short ending («comunit» / «comunitari»,
// «histori» / «historial» do not: they differ by more than a quarter).
function likeness(a: string, b: string): number {
  if (a === b) return 1;
  if (SYN.get(a)?.has(b)) return 0.8;
  if (a.length < 5 || b.length < 5) return 0;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  if (!l.startsWith(s)) return 0;
  return l.length - s.length <= Math.max(1, Math.floor(s.length / 4)) ? 0.85 : 0;
}

// ── The entries ────────────────────────────────────────────────────────────────────────────────────────────────────

// A screen's name before an arrow keeps its capital («Publicar → «Registrar…»», «Agenda → «Mis eventos»»).
const lcFirst = (s: string) => (s.startsWith('«') || /^\p{Lu}[\p{Ll}]+ →/u.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));
const ucFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const end = (s: string) => (/[.!?…»)]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);
/** The «…» labels a text quotes (top level). */
function labelsOf(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '«') {
      if (depth === 0) start = i + 1;
      depth++;
    } else if (text[i] === '»' && depth > 0 && --depth === 0) out.push(text.slice(start, i));
  }
  return out;
}

// The labels of a text that are asked about by name (two words or more), not a button's verb («Poner en el copy»,
// «Marcar realizado» read as an order: asked with their words, they would answer «¿qué pongo en el copy?»).
const askedLabels = (text: string) => labelsOf(text).filter((l) => l.split(' ').length >= 2 && !/^\p{L}+(?:ar|er|ir)\b/u.test(l));

/** «Cargar una ficha comunitaria, paso a paso: 1) … 2) …», up to about 420 letters (the rest is in the guide). */
export function stepsAnswer(title: string, steps: string[]): string {
  const out: string[] = [];
  let len = title.length + 16;
  for (const [k, s] of steps.entries()) {
    const line = `${k + 1}) ${s}`;
    if (out.length && len + line.length > 420) break;
    out.push(line);
    len += line.length + 1;
  }
  const rest = out.length < steps.length ? ' El resto está en la guía de tu trabajo.' : '';
  return `${title}, paso a paso: ${out.join(' ')}${rest}`;
}

// Where a screen is said in an answer: «En Por aprobar», «En un evento, la pestaña Material», «En Ajustes → Equipo».
function placeOf(s: { title: string; screen?: string }): string {
  const t = s.title.replace(/: /g, ', ');
  const named = /^(?:Un|Una) /.test(t) ? lcFirst(t) : t;
  return s.screen?.startsWith('/ajustes/') ? `Ajustes → ${named}` : named;
}
function itemText(s: { title: string; screen?: string }, item: string): string {
  return `En ${placeOf(s)}: ${lcFirst(item)}`;
}
const staticScreen = (screen?: string) => (screen && !screen.includes('[') && !screen.includes('?') ? screen : undefined);

// The roles named for a step of a flow («el jefe o el despacho»).
const WHO: Record<TeamRole, string> = { boss: 'el jefe', dispatch: 'el despacho', politics: 'política', ivt: 'el IVT', camera: 'Grabación', social: 'Redes' };
const whoOf = (roles: TeamRole[]) => {
  const names = roles.map((r) => WHO[r]);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} o ${names.at(-1)}` : names[0] ?? '';
};

// What a screen is for, said: its name first unless what it says already names it, then what is done there, up to about
// 400 letters («Por ponerle fecha: las fichas del IVT y los reportes… Cada tarjeta dice…»).
function screenText(s: { title: string; screen?: string; what: string; youDo: string[] }): string {
  const name = placeOf(s).replace(/^Ajustes → /, '');
  const last = plain(s.title).split(' ').at(-1) ?? '';
  const first = plain(s.title).split(' ').slice(0, 2).join(' ');
  const named = new RegExp(`^(?:el|la|los|las|tu|tus) ${last}\\b`).test(plain(s.what)) || plain(s.what).startsWith(first);
  let out = named ? end(s.what) : `${ucFirst(name)}: ${lcFirst(end(s.what))}`;
  for (const item of s.youDo) {
    const next = `${out} ${end(ucFirst(item))}`;
    if (next.length > 400) break;
    out = next;
  }
  return out;
}

function screenEntries(role: Role, prefix: string, source: string, s: SectionGuide | (ReturnType<typeof adminSections>[number])): Entry[] {
  const out: Entry[] = [];
  const go = staticScreen(s.screen);
  const title = s.title;
  const base = { roles: [role], source, screen: s.screen?.split('?')[0], ...(go ? { go } : {}) };
  const tour = 'tour' in s ? s.tour : undefined;
  out.push({
    ...base,
    id: `${prefix}`,
    kind: 'screen',
    q: [title, `para que sirve ${title}`, `que es ${title}`, `que hago en ${title}`, `que hay en ${title}`, `donde esta ${title}`, `como funciona ${title}`],
    doc: s.what,
    a: screenText(s),
    ...(tour ? { tutorial: tour } : {}),
  });
  s.youDo.forEach((item, k) => {
    out.push({ ...base, id: `${prefix}:hace:${k}`, kind: 'item', q: askedLabels(item), doc: `${title}. ${item}`, a: end(itemText(s, item)) });
  });
  (s.cannot ?? []).forEach((item, k) => {
    out.push({ ...base, id: `${prefix}:no:${k}`, kind: 'cannot', may: true, q: [`puedo ${lcFirst(item)}`], doc: `${title}. ${item}`, a: end(`No puedes ${lcFirst(item)}`) });
  });
  return out;
}

function taskEntries(role: TeamRole, slug: string, t: Task): Entry[] {
  const source = `${role}:tasks.${t.id}`;
  const base = { roles: [role] as Role[], source, ...(t.tour ? { tutorial: t.tour } : {}) };
  const id = `${slug}:paso-a-paso:${t.id}`;
  // Asked by its title or its «Cuándo»; each step answers on its own (all the steps in one text would match anything).
  const out: Entry[] = [{ ...base, id, kind: 'task', q: [t.title, `como ${t.title}`, t.when], a: stepsAnswer(t.title, t.steps), go: `/ayuda/${slug}?ver=pasos` }];
  t.steps.forEach((step, k) => {
    const next = t.steps[k + 1];
    const text = `Para ${lcFirst(t.title)}: ${lcFirst(end(step))}${next && step.length < 90 ? ` Después: ${lcFirst(end(next))}` : ''}`;
    out.push({ ...base, id: `${id}:${k + 1}`, kind: 'step', q: askedLabels(step), doc: `${t.title}. ${step}`, a: text, ...(next ? { next: `${id}:${k + 2}` } : {}) });
  });
  return out;
}

type AdminSection = (typeof ADMIN_GUIDE.sections)[number];
function adminSections(): AdminSection[] {
  return ADMIN_GUIDE.sections;
}

function guideEntries(): Entry[] {
  const out: Entry[] = [];
  for (const g of allGuides()) {
    const role = g.role;
    const r = [role] as Role[];
    const slug = g.slug;
    const label = ROLE_LABEL[role];
    // «Tu trabajo»: what the role does, never does, with whom, and its day.
    out.push({
      id: `${slug}:trabajo`,
      kind: 'job',
      source: `${role}:job.mission`,
      roles: r,
      q: ['que hago yo', 'cual es mi trabajo', 'que hace mi rol', 'cual es mi funcion', 'de que se trata mi trabajo', 'que me toca hacer a mi', `que hace ${label}`, 'para que estoy en la plataforma', 'cual es mi responsabilidad'],
      a: `${g.job.mission} ${g.job.responsibilities.slice(0, 2).map((x) => end(x)).join(' ')}`,
      go: `/ayuda/${slug}`,
    });
    g.job.responsibilities.forEach((x, k) => out.push({ id: `${slug}:trabajo:${k}`, kind: 'job', source: `${role}:job.responsibilities`, roles: r, q: [], doc: x, a: end(`Te toca ${lcFirst(x)}`) }));
    out.push({
      id: `${slug}:nunca`,
      kind: 'never',
      source: `${role}:job.never`,
      roles: r,
      q: ['que no hago', 'que no debo hacer', 'que no me toca', 'que tengo prohibido', 'que no puedo hacer', 'que cosas no hago yo'],
      a: `No te toca: ${g.job.never.map((x) => lcFirst(x.replace(/[.]$/, ''))).join('; ')}.`,
    });
    g.job.never.forEach((x, k) => out.push({ id: `${slug}:nunca:${k}`, kind: 'never', may: true, source: `${role}:job.never`, roles: r, q: [`puedo ${lcFirst(x)}`], doc: x, a: end(`No: ${lcFirst(x)}`) }));
    out.push({
      id: `${slug}:con-quien`,
      kind: 'with',
      source: `${role}:job.worksWith`,
      roles: r,
      q: ['con quien trabajo', 'con quienes trabajo', 'quien me pasa el trabajo', 'a quien le paso lo mio', 'con quien me coordino'],
      a: g.job.worksWith.map((w) => `${ROLE_LABEL[w.role]}: ${lcFirst(end(w.what))}`).join(' '),
    });
    for (const w of g.job.worksWith) {
      const who = ROLE_LABEL[w.role];
      out.push({
        id: `${slug}:con:${w.role}`,
        kind: 'with',
        source: `${role}:job.worksWith`,
        roles: r,
        q: [`que hace ${who} por mi`, `que me da ${who}`, `que le paso a ${who}`, `que hago con ${who}`, `como trabajo con ${who}`],
        doc: w.what,
        a: `${who}: ${lcFirst(end(w.what))}`,
      });
    }
    out.push({
      id: `${slug}:dia`,
      kind: 'day',
      source: `${role}:day`,
      roles: r,
      q: ['como es mi dia', 'que hago cada dia', 'por donde empiezo', 'que hago primero', 'cual es mi rutina', 'que hago todos los dias', 'como empiezo el dia'],
      a: g.day.slice(0, 3).map((x) => end(x)).join(' '),
    });
    g.job.rhythm.forEach((x, k) => out.push({ id: `${slug}:ritmo:${k}`, kind: 'day', source: `${role}:job.rhythm`, roles: r, q: [], doc: x, a: end(x) }));
    g.day.forEach((x, k) => out.push({ id: `${slug}:dia:${k}`, kind: 'day', source: `${role}:day`, roles: r, q: [], doc: x, a: end(x) }));
    g.tasks.forEach((t, k) => {
      const list = taskEntries(role, slug, t);
      const after = g.tasks[k + 1];
      if (after && /^Después\b/.test(after.when)) list[0].next = `${slug}:paso-a-paso:${after.id}`;
      out.push(...list);
    });
    g.sections.forEach((s, k) => out.push(...screenEntries(role, `${slug}:pantalla:${k}`, `${role}:sections ${s.title}`, s)));
    g.faq.forEach((f, k) => out.push({ id: `${slug}:pregunta:${k}`, kind: 'faq', source: `${role}:faq`, roles: r, q: [f.q], doc: f.a, a: f.a }));
  }
  return out;
}

function sharedEntries(): Entry[] {
  const out: Entry[] = [];
  const team = [...TEAM_ROLES] as Role[];
  for (const t of SHARED) {
    // Administración has no Mensajes (D-49): the topic is the team's, and the envelope line says so (sharedFor).
    const roles: Role[] | null = t.id === 'mensajes' ? team : null;
    out.push({ id: `todos:${t.id}`, kind: 'topic', source: `shared:${t.id}`, roles, q: [t.title, `como funciona ${t.title}`, `que es ${t.title}`], doc: t.body[0], a: t.body.slice(0, 2).join(' '), ...(t.id === 'mensajes' ? { go: '/mensajes' } : t.id === 'ayuda' ? { go: '/ayuda' } : {}) });
    t.body.forEach((line, k) => {
      const envelope = line.startsWith('El sobre:');
      const id = `todos:${t.id}:${k}`;
      if (envelope) {
        out.push({ id, kind: 'line', source: `shared:${t.id}`, roles: team, q: askedLabels(line), doc: `${t.title}. ${line}`, a: line });
        out.push({ id: `${id}:admin`, kind: 'line', source: `shared:${t.id}`, roles: ['admin'], q: [], doc: NO_MESSAGES_LINE, a: NO_MESSAGES_LINE });
      } else out.push({ id, kind: 'line', source: `shared:${t.id}`, roles, q: askedLabels(line), doc: `${t.title}. ${line}`, a: line });
    });
  }
  return out;
}

function flowEntries(): Entry[] {
  const out: Entry[] = [];
  const guides = allGuides();
  for (const f of FLOWS) {
    const roles = guides.filter((g) => g.flows.includes(f.id)).map((g) => g.role as Role);
    f.steps.forEach((s, k) => {
      const branches = s.question && s.branches?.length ? ` ${s.question} ${s.branches.map((b) => `${b.label}: ${lcFirst(b.text)}`).join(' ')}` : '';
      const nextStep = f.steps[k + 1];
      out.push({
        id: `flujo:${f.id}:${s.id}`,
        kind: 'flow',
        source: `flows:${f.id} step ${k + 1}`,
        roles,
        q: askedLabels(s.text),
        doc: `${f.title}. ${s.text}${branches}`,
        a: `${ucFirst(whoOf(s.roles))}: ${lcFirst(end(s.text))}${branches}`,
        ...(nextStep ? { next: `flujo:${f.id}:${nextStep.id}` } : {}),
      });
    });
  }
  return out;
}

function adminEntries(): Entry[] {
  const out: Entry[] = [];
  const r: Role[] = ['admin'];
  everyoneSections('dispatch')
    .filter((x) => x.screen === '/avisos' || x.screen === '/buscar' || x.screen === '/perfil')
    .forEach((x, k) => out.push(...screenEntries('admin', `admin:todos:${k}`, `admin:sections ${x.title}`, x)));
  out.push({ id: 'admin:trabajo', kind: 'job', source: 'admin:mission', roles: r, q: ['que hago yo', 'cual es mi trabajo', 'que hace administracion', 'que hace mi rol', 'cual es mi funcion'], a: ADMIN_GUIDE.mission, go: '/ayuda/administracion' });
  adminSections().forEach((s, k) => out.push(...screenEntries('admin', `admin:pantalla:${k}`, `admin:sections ${s.title}`, s)));
  ADMIN_GUIDE.notes.forEach((n, k) => out.push({ id: `admin:nota:${k}`, kind: 'note', source: 'admin:notes', roles: r, q: [], doc: n, a: n }));
  ADMIN_GUIDE.faq.forEach((f, k) => out.push({ id: `admin:pregunta:${k}`, kind: 'faq', source: 'admin:faq', roles: r, q: [f.q], doc: f.a, a: f.a }));
  return out;
}

function curatedEntries(list: Answer[], file: (a: Answer) => string): Entry[] {
  return list.map((x) => ({ id: `curado:${x.id}`, kind: 'curated' as const, source: `curado:${file(x)}`, roles: x.roles, q: x.q, a: x.a, ...(x.go ? { go: x.go } : {}), ...(x.tutorial ? { tutorial: x.tutorial } : {}) }));
}

// ── The index ──────────────────────────────────────────────────────────────────────────────────────────────────────

type Doc = { entry: number; toks: Tok[]; total: number; kind: 'q' | 'doc'; labels: string[]; weight: number; label: boolean };
// What a kind's text weighs as an answer: a line of the job or the day says less than a screen, a task or a question.
const KIND_WEIGHT: Partial<Record<Kind, number>> = { job: 0.85, day: 0.85, with: 0.95, flow: 0.95, never: 0.95, line: 0.9 };
type Index = { entries: Entry[]; docs: Doc[]; byKey: Map<string, number[]>; idf: Map<string, number>; unknown: number; labels: Map<string, number[]>; byId: Map<string, Entry>; asked: Map<string, Entry[]>; defines: Set<string> };

let INDEX: Index | null = null;
const key = (root: string) => root.slice(0, 4);

/** The entries, built once (the guides and the curated answers do not change while the server runs). */
export function allEntries(): Entry[] {
  return index().entries;
}

function index(): Index {
  if (INDEX) return INDEX;
  // The file of each curated entry, for its source tag.
  const files = new Map<Answer, string>(Object.entries(ANSWER_FILES).flatMap(([f, list]) => list.map((a): [Answer, string] => [a, f])));
  const entries = [...curatedEntries(ANSWERS, (a) => files.get(a) ?? 'respuestas'), ...guideEntries(), ...sharedEntries(), ...flowEntries(), ...adminEntries()];
  // Document frequency per root, over the entries (each entry once).
  const df = new Map<string, number>();
  const entryToks = entries.map((e) => new Set([...e.q, e.doc ?? ''].flatMap((t) => tokens(t))));
  for (const set of entryToks) for (const r of set) df.set(r, (df.get(r) ?? 0) + 1);
  const n = entries.length;
  const idf = new Map<string, number>();
  for (const [r, c] of df) idf.set(r, Math.log(1 + n / c));
  const weigh = (r: string): Tok => ({ root: r, w: r in LIGHT ? LIGHT[r] : idf.get(r) ?? Math.log(1 + n), light: r in LIGHT });
  const docs: Doc[] = [];
  const byKey = new Map<string, number[]>();
  const labels = new Map<string, number[]>();
  // «Label»: what it is. The entries that say what a label is, as `entry label`.
  const defines = new Set<string>();
  entries.forEach((e, k) => {
    for (const m of `${e.doc ?? ''} ${typeof e.a === 'string' ? e.a : (e.a.default ?? '')}`.matchAll(/«([^«»]{3,60})»:/g)) defines.add(`${k} ${readable(m[1])}`);
    const add = (text: string, kind: 'q' | 'doc') => {
      const toks = tokens(kind === 'doc' ? text.replace(/“[^”]*”/g, ' ') : text).map(weigh);
      if (!toks.length) return;
      const label = kind === 'q' && (e.kind === 'item' || e.kind === 'step' || e.kind === 'line' || e.kind === 'flow');
      const weight = label ? 0.8 : e.q.length || kind === 'q' ? 1 : (KIND_WEIGHT[e.kind] ?? 1);
      const d = docs.push({ entry: k, toks, total: toks.reduce((s, t) => s + t.w, 0), kind, labels: [], weight, label }) - 1;
      for (const t of toks) {
        const list = byKey.get(key(t.root)) ?? [];
        if (list.at(-1) !== d) list.push(d);
        byKey.set(key(t.root), list);
      }
    };
    for (const q of e.q) add(q, 'q');
    if (e.doc) add(e.doc, 'doc');
    // The screen's labels it quotes (two words or more): asked by name, they point here.
    for (const l of new Set([...labelsOf(e.doc ?? ''), ...labelsOf(typeof e.a === 'string' ? e.a : ''), ...e.q.flatMap(labelsOf)])) {
      const p = readable(l.replace(/\(n\)/g, ' '));
      if (p.split(' ').length < 2 || p.length < 8) continue;
      labels.set(p, [...(labels.get(p) ?? []), k]);
    }
  });
  // Each way of asking, word for word: asked exactly like that, it is the answer.
  const asked = new Map<string, Entry[]>();
  for (const e of entries) for (const q of e.q) asked.set(readable(q), [...(asked.get(readable(q)) ?? []), e]);
  INDEX = { entries, docs, byKey, idf, unknown: 0.6 * Math.log(1 + n), labels, byId: new Map(entries.map((e) => [e.id, e])), asked, defines };
  return INDEX;
}

/** An entry by its id (a step's next one). */
export function entryById(id: string): Entry | undefined {
  return index().byId.get(id);
}

/** What a screen is for, for these roles (its «screen» entry: «¿qué es esto?» on it). */
export function entryForScreen(screen: string, roles: Role[]): Entry | undefined {
  const path = screen.split('?')[0];
  return index().entries.find((e) => e.kind === 'screen' && e.screen === path && forRoles(e, roles));
}

/** Every label (in «») the help content quotes, as plain words: the screen's own names, never an event's. */
export function knownLabels(): string[] {
  return [...index().labels.keys()];
}

// ── Matching ───────────────────────────────────────────────────────────────────────────────────────────────────────

// The thresholds (tuned on the TRAIN banks, design §A): strong answers on their own; weak only competes with the
// fichas and never beats «No estoy seguro…» alone.
export const STRONG = 0.62;
export const WEAK = 0.45;

export type FindOptions = { roles: Role[]; screen?: string | null; limit?: number; extra?: string };

// A question about what something is or where («¿qué es…?», «¿qué sale en…?»): a label named whole is what it asks.
const WHAT_IS = /\b(?:que es|que son|que significa\w*|que quiere decir|que sale en|que hay en|que dice|paraque sirve|paraque es|donde esta|donde veo|que hago en|como (?:uso|funciona))\b/;
// A question that asks what, how, where, who… (not yes or no).
const WH_ASK = /^(?:y |pero |entonces |oye )?(?:que|como|donde|cuando|quien|quienes|cual|cuales|cuanto|cuantos|cuantas|por que|paraque|de que|en que|a que|con que)\b/;
// Someone named in an answer: a role, the boss, administración.
const NAMES_SOMEONE = /\b(?:jefe|despacho|politica|ivt|grabacion|redes|administracion|solo el)\b/;
const forRoles = (e: Entry, roles: Role[]) => e.roles === null || e.roles.some((r) => roles.includes(r));

/** The text of an entry for these roles: the asker's role key (team order, administración last), else `default`. */
export function textFor(a: AnswerText, roles: Role[]): string {
  if (typeof a === 'string') return a;
  for (const r of [...TEAM_ROLES, 'admin' as const]) if (roles.includes(r) && typeof a[r] === 'string') return a[r]!;
  return a.default ?? Object.values(a).find((x): x is string => typeof x === 'string') ?? '';
}

/**
 * The entries that answer a question, best first, for these roles: each paraphrase scored by how much of the question
 * it has and how much of it the question has (rare words weigh more), a bonus for two words in a row as asked and for
 * a label of the screen named whole, a small one on the screen the person is on; what an entry says (`doc`) counts one
 * way and less. `extra`: topic words of the question before (a follow-up), at half weight.
 */
const PROFILE = rootOf('perfil');
// The kinds of thing a label names («la lista…», «el botón…», «la pestaña…»).
const LABEL_KIND = new Set(['lista', 'boton', 'pestaña', 'casilla', 'seccion', 'pantalla', 'chip', 'opcion', 'campo', 'menu', 'aviso', 'tarjeta'].map((w) => rootOf(plain(w))));
// What is asked, weighed (the follow-up's words at half), and its pairs of words in a row.
type Asked = { toks: { root: string; w: number }[]; total: number; pairs: string[]; text: string; own: string[] };
function askedOf(question: string, extra?: string): Asked | null {
  const ix = index();
  const own = tokens(question);
  // «Mi nombre», «mi teléfono», «mis avisos»: the person's own things live in Mi perfil (not «el nombre» of a category).
  const mine = own.some((r, k) => r === 'mio' && /^(?:nomb|tele|mail|avis|foto|cuen|dato)/.test(own[k + 1] ?? '')) && !own.includes(PROFILE);
  const more = [...(extra ? tokens(extra).filter((t) => !own.includes(t)) : []), ...(mine ? [PROFILE] : [])];
  const weigh = (r: string, half = false) => (r in LIGHT ? LIGHT[r] : ix.idf.get(r) ?? ix.unknown) * (half ? 0.5 : 1);
  const toks = [...own.map((r) => ({ root: r, w: weigh(r) })), ...more.map((r) => ({ root: r, w: weigh(r, true) }))];
  // Only the light words, or nothing: no real question (a «¿dónde?» alone).
  if (!toks.length || toks.every((t) => t.root in LIGHT)) return null;
  return { toks, total: toks.reduce((n, t) => n + t.w, 0), pairs: own.slice(1).map((r, k) => `${own[k]} ${r}`), text: readable(question), own: own.filter((r) => !(r in LIGHT)) };
}

// How well one text answers: a way of asking ('q') both ways, what an entry says ('doc') one way and less.
function scoreDoc(a: Asked, toks: Tok[], total: number, kind: 'q' | 'doc'): number {
  let got = 0;
  let found = 0;
  let first = toks.length;
  let last = -1;
  const seen = new Array<number>(toks.length).fill(0);
  for (const t of a.toks) {
    let m = 0;
    let at = -1;
    toks.forEach((u, k) => {
      const l = likeness(t.root, u.root);
      if (l > m) [m, at] = [l, k];
    });
    if (!m) continue;
    got += t.w * m;
    if (!(t.root in LIGHT) || t.root === 'no') {
      found++;
      first = Math.min(first, at);
      last = Math.max(last, at);
    }
    seen[at] = Math.max(seen[at], m);
  }
  if (!found) return 0;
  const cq = got / a.total;
  let s: number;
  if (kind === 'q') {
    // How much of the paraphrase the question has: what is asked weighs more (F with beta 1.5).
    const cp = toks.reduce((n, u, k) => n + u.w * seen[k], 0) / total;
    s = cq && cp ? (3.25 * cq * cp) / (2.25 * cp + cq) : 0;
    // A way of asking of another kind («¿por qué no…?», «¿quién…?», «¿dónde…?» for a «¿cómo…?»): less.
    const other = toks.filter((u) => u.light && !a.toks.some((t) => t.root === u.root)).length;
    s *= Math.pow(0.9, Math.min(2, other));
  } else {
    // A long text has many words: it answers one way, at a discount that grows with its length, and better when the
    // words asked are close together in it.
    const density = found / Math.max(1, last - first + 1);
    s = cq * 0.78 * Math.min(1, Math.pow(14 / Math.max(toks.length, 1), 0.3)) * (0.85 + 0.15 * density);
  }
  const text = ` ${toks.map((u) => u.root).join(' ')} `;
  return s + (kind === 'q' ? 0.06 : 0.03) * a.pairs.filter((p) => text.includes(` ${p} `)).length;
}

/**
 * The entries that answer a question, best first, for these roles: each paraphrase scored by how much of the question
 * it has and how much of it the question has (rare words weigh more), a bonus for two words in a row as asked and for
 * a label of the screen named whole, a small one on the screen the person is on; what an entry says (`doc`) counts one
 * way and less. `extra`: topic words of the question before (a follow-up), at half weight.
 */
export function findAnswers(question: string, o: FindOptions): Match[] {
  const ix = index();
  const a = askedOf(question, o.extra);
  if (!a) return [];
  // Candidates: the docs that share a key with a word asked.
  const cand = new Set<number>();
  for (const t of a.toks) for (const d of ix.byKey.get(key(t.root)) ?? []) cand.add(d);
  // One word that says something («¿y dónde queda eso?», «¿qué es la receptividad?») answers strongly only from a way of
  // asking (a question or a title), never from a text that happens to have it.
  const oneWord = a.toks.filter((t) => !(t.root in LIGHT)).length <= 1;
  // A short question (up to three words that say something): every one of them counts. A text, or a button's name, that
  // lacks one is no sure answer («¿cómo pido cambios en un copy?» is not «¿Pedir cambios también?» of the design).
  const short = a.own.length <= 3;
  const best = new Map<number, number>();
  // The entries whose best match lacks a word of a short question: never sure, whatever they add below.
  const partial = new Set<number>();
  for (const d of cand) {
    const doc = ix.docs[d];
    if (!forRoles(ix.entries[doc.entry], o.roles)) continue;
    let s = scoreDoc(a, doc.toks, doc.total, doc.kind) * doc.weight;
    if (oneWord && doc.kind === 'doc') s = Math.min(s, STRONG - 0.01);
    const lacks = short && (doc.kind === 'doc' || doc.label) && !a.own.every((r) => doc.toks.some((u) => likeness(r, u.root) > 0));
    if (s && (best.get(doc.entry) === undefined || s > best.get(doc.entry)!)) {
      best.set(doc.entry, s);
      if (lacks) partial.add(doc.entry);
      else partial.delete(doc.entry);
    }
  }
  // A label of the screen asked by name, whole («Hoy en la agenda», «Enviar igual»): its entries go first. A label
  // quoted by many entries says less («Tweets de la semana» is everywhere).
  const quoted = labelsOf(question).map((l) => readable(l));
  for (const [l, list] of ix.labels) {
    if (!` ${a.text} `.includes(` ${l} `)) continue;
    const mine = list.filter((k) => forRoles(ix.entries[k], o.roles));
    // Asked what it is, the label can come after its kind of thing («¿qué es la lista Antes de aprobar?»): that word
    // does not count.
    const total = a.toks.reduce((n, t) => n + (LABEL_KIND.has(t.root) ? 0 : t.w), 0) || a.total;
    const part = tokens(l).reduce((n, r) => n + (a.toks.find((t) => t.root === r)?.w ?? 0), 0) / total;
    if (!quoted.includes(l) && !(part >= 0.6 && WHAT_IS.test(a.text))) continue;
    const bonus = Math.min(0.24, 0.06 * l.split(' ').length) / Math.sqrt(Math.max(1, mine.length));
    // Asked what it is: the entry that says it («Antes de aprobar»: …) more.
    const what = WHAT_IS.test(a.text);
    for (const k of mine) if (best.has(k)) best.set(k, best.get(k)! + bonus + (what && ix.defines.has(`${k} ${l}`) ? 0.08 : 0));
  }
  const who = a.toks.some((t) => t.root === 'quien' || t.root === 'quienes');
  const wh = WH_ASK.test(a.text);
  const why = /\b(?:por que|porque|paraque)\b/.test(a.text);
  const howTo = /^(?:y )?como (?!(?:va|van|esta|estan|quedo|salio|es|son)\b)/.test(a.text) || /\b(?:como (?:hago|se hace|le hago|lo hago)|que (?:tengo|hay) que hacer|que hago) para\b/.test(a.text);
  const exactly = new Set(ix.asked.get(a.text) ?? []);
  const out: Match[] = [];
  for (const [k, s0] of best) {
    const e = ix.entries[k];
    let s = s0;
    if (exactly.has(e)) s += 0.05;
    // «¿Quién…?» is answered by someone named, never by what a screen is.
    if (who && (e.kind === 'screen' || !NAMES_SOMEONE.test(plain(textFor(e.a, o.roles))))) s *= 0.72;
    // «¿Cómo…?» is answered by a task or one of its steps (not by a line that happens to have its words).
    if (howTo && (e.kind === 'task' || e.kind === 'step')) s += e.kind === 'task' ? 0.05 : 0.02;
    // …and not by what a screen is (its name shares the words: «¿cómo subo la tanda?» and «Una tanda de tweets»).
    if (howTo && e.kind === 'screen') s *= 0.85;
    // The answer to another kind of question: a «No.» or a «Sí,» to a «¿qué…?» or a «¿quién…?»; a «Porque…» to what
    // does not ask why.
    const said = textFor(e.a, o.roles);
    if (wh && !why && /^(?:No|Sí)[.,:]/.test(said)) s *= who ? 0.75 : 0.85;
    else if (!why && /^Porque\b/.test(said)) s *= 0.85;
    if (o.screen && e.screen && e.screen === o.screen) s += 0.04;
    if (e.kind === 'curated') s += 0.03;
    if (partial.has(k)) s = Math.min(s, STRONG - 0.01);
    out.push({ entry: e, score: s, confidence: s >= STRONG ? 'strong' : s >= WEAK ? 'weak' : 'none', text: textFor(e.a, o.roles) });
  }
  out.sort((x, y) => y.score - x.score);
  // One word, and another entry says it almost as well as the first («¿qué tengo que hacer para publicar?»: a question
  // of the guide, a task, the screen): none of them is a sure answer, unless the first is asked word for word.
  if (oneWord && !exactly.has(out[0]?.entry) && out.length > 1 && out[0].confidence === 'strong' && out[1].score >= out[0].score - 0.1)
    for (const m of out) if (m.score >= out[0].score - 0.1) m.confidence = 'weak';
  return out.slice(0, o.limit ?? 8);
}

/** How well a ficha (a card of the database: the team's or the platform's) answers, on the same scale as the entries. */
export function scoreFicha(question: string, f: { title: string; tags: string[]; body: string }, extra?: string): number {
  const ix = index();
  const a = askedOf(question, extra);
  if (!a) return 0;
  const weigh = (r: string): Tok => ({ root: r, w: r in LIGHT ? LIGHT[r] : ix.idf.get(r) ?? ix.unknown, light: r in LIGHT });
  const as = (text: string) => tokens(text).map(weigh);
  const sum = (t: Tok[]) => t.reduce((n, u) => n + u.w, 0);
  const title = as([f.title, ...f.tags].join(' '));
  // Sentence by sentence, with its title, as the guides' entries are (a card's sentence is what 360 says of it).
  const parts = f.body.split(/(?<=[.!?…])\s+/).map((x) => as(`${f.title}. ${x}`)).filter((t) => t.length);
  return Math.max(title.length ? scoreDoc(a, title, sum(title), 'q') * 0.9 : 0, ...parts.map((t) => scoreDoc(a, t, sum(t), 'doc')));
}

/** The best entry, or null. */
export function bestAnswer(question: string, o: FindOptions): Match | null {
  return findAnswers(question, { ...o, limit: 1 })[0] ?? null;
}
