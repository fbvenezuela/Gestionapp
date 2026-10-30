import 'server-only';
import { brand } from '../client-config';
import { carriesEventWhen, hasPlace, hasPlaceByName, hasPlaceName, redactPlacesAfterA } from './redact';
import { plain } from './text';
import { NO_TITLES, ORDINARY, namesTitle, titleIndex, titlesNamed, type TitleIndex, type TitleSet } from './titles';

// Is this about an event? One detector for every place that asks (docs/ASISTENTE.md «Lo que habla de
// un evento lo contesta 360 sin IA»): which brain answers a turn, how much of a question is masked,
// when an answer is held to the agenda rule, what a notice may say, what 360 may be taught and what an
// «aviso al equipo» tells administración. A turn about an event never goes to an AI provider: the demo
// brain answers it, with the event tools and the agenda refusal. So this leans to «yes»: a question
// that only looks like one costs a demo answer instead of a model one, never a leak.

// «Encuentro» and «operativo» are also «I find» and «working»: only with an article they are events.
export const EVENT_NOUNS = String.raw`eventos?|actos?|actividad|actividades|agenda|jornadas?|entregas?|reunion|reuniones|recorridos?|inauguracion|inauguraciones|visitas?|ferias?|asambleas?|urbanismos?|caravanas?|cabildos?|conversatorios?|foros?|juramentacion|rueda de prensa`;
export const EVENT_WORDS = new RegExp(String.raw`\b(${EVENT_NOUNS}|(?:el|un|del|al|ese|este|los|unos) (?:encuentros?|operativos?))\b`);
// An event word typed with one letter wrong, missing, extra or swapped («feira», «evnto», «jornda»). Not
// the words that are one letter from an ordinary one («entrega» / «entrego», «visita» / «visitar»).
const TYPO_TARGETS = 'evento eventos feria ferias jornada jornadas recorrido recorridos caravana caravanas asamblea asambleas inauguracion reunion reuniones conversatorio juramentacion cabildo'.split(' ');
function oneOff(a: string, b: string): boolean {
  if (a === b || Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) {
    const diff = [...a].map((c, k) => (c === b[k] ? -1 : k)).filter((k) => k >= 0);
    return diff.length === 1 || (diff.length === 2 && diff[1] === diff[0] + 1 && a[diff[0]] === b[diff[1]] && a[diff[1]] === b[diff[0]]);
  }
  const [s, l] = a.length < b.length ? [a, b] : [b, a];
  for (let k = 0; k <= s.length; k++) if (l.slice(0, k) + l.slice(k + 1) === s) return true;
  return false;
}
const NOT_TYPO = new Set('seria serias veria verias furia'.split(' '));
const typedEventWord = (p: string) => p.split(' ').some((w) => w.length >= 4 && !NOT_TYPO.has(w) && TYPO_TARGETS.some((t) => oneOff(w, t)));
// The boss by his role, his name or his title (from the client's settings: nothing of him in the code),
// or someone recording (not Grabación the role, nor «¿cuándo hay que grabar con dron?», a step).
export const BOSS_NAMES = [...String(brand.clientName ?? '').split(/\s+/), String(brand.clientTitle ?? '').split(/\s+/)[0] ?? '']
  .map((w) => w.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, ''))
  .filter((w) => w.length >= 4);
const SUBJECT = new RegExp(String.raw`\b(jefe|${BOSS_NAMES.map((w) => `${w}|`).join('')}graba|graban|grabamos|grabara|grabaran|grabaremos|grabando|(?:toca|va a|van a|vamos a|voy a) grabar)\b`);
// What is written to save letters or as it is said («kndo», «onde», «lo d la»): read as the words.
const SHORTHAND: [RegExp, string][] = [
  [/\b(?:kndo|qndo|cndo|cuado|kuando)\b/g, 'cuando'],
  [/\b(?:onde|aonde|adonde|dnd|dnde|dond)\b/g, 'donde'],
  [/\b(?:q|k|ke|qe)\b/g, 'que'],
  [/\bd\b/g, 'de'],
  [/\b(?:xq|pq|porq|xk|pk|porke|xque)\b/g, 'porque'],
  // D-89: more of what is typed to save letters («q hay pa hoy», «donde stan mis eventos», «q me falta x hacer»).
  [/\bpal\b/g, 'para el'],
  [/\bpa\b/g, 'para'],
  [/\bstan\b/g, 'estan'],
  [/\b(?:sta|ta)\b/g, 'esta'],
  [/\b(?:kmo|cmo|komo)\b/g, 'como'],
  [/\b(?:kiero|kero|qiero)\b/g, 'quiero'],
  [/\b(?:tng|tngo)\b/g, 'tengo'],
  [/\b(?:msj|msje|mje)\b/g, 'mensaje'],
  [/\b(?:tb|tmb|tbn)\b/g, 'tambien'],
  [/\b(?:aki)\b/g, 'aqui'],
  [/\bx (?=hacer|subir|aprobar|decidir|ponerle|poner|calificar|revisar|publicar|grabar|completar|llenar|leer|ver)/g, 'por '],
];
const spokenFolded = (p: string) => SHORTHAND.reduce((t, [re, to]) => t.replace(re, to), p);
/** plain(), with the shorthand read as the words it stands for. */
export function spoken(text: string): string {
  return spokenFolded(plain(text));
}
// A work product or a thing of the platform: «lo del copy», «¿dónde queda el material?» are not an event.
export const WORK = /\b(piezas?|videos?|material|materiales|copy|copies|storyboard|fotos?|tomas|reels?|publica\w*|tweets?|tuits?|tanda)\b/;
export const PLATFORM = new RegExp(
  String.raw`${WORK.source}|\b(avisos?|campanas?|contrasenas?|claves?|codigos?|ajustes|pantallas?|pestanas?|boton|botones|menu|panel|biblioteca|resultados|metricas|perfil|formulas?|semaforo|plazos?|version|versiones|archivos?|enlaces?|links?|plantillas?|dron|vertical|horizontal|formatos?|microfono|app|aplicacion|asistente|buscador|registro|buzon|categorias?|invitacion|invitaciones|correos?|notificaciones|sesion|sesiones|permisos?|fichas?)\b`,
);
// Words of the platform that are often on the agenda too (a sesión, a campaña, a registro, a panel, with
// what they are of: «la sesión de fotos»): the platform's only with what makes them the screen («el
// registro de cambios», «la campana de avisos», «mi sesión», «el panel del asistente»).
// «Mi sesión de fotos» is on the agenda: the login session is never «de» something.
const SESSION_VERB = 'cerrar|cierro|cierra|cierran|cerre|cerraron|iniciar|inicio|inicia';
const AGENDA_THINGS = new RegExp(String.raw`\b(?<!\b(?:${SESSION_VERB}) |\b(?:${SESSION_VERB}) (?:la|las|mi|mis|su|sus) )(?:(?:sesion|sesiones) de [a-z]+|(?<!\b(?:mi|mis|tu|tus|su|sus) )(?:sesion|sesiones)\b)|\b(?:campanas?|registros?|panel|paneles)\b(?! (?:de cambios|del asistente|de avisos|de arriba|de la app))(?: de [a-z]+)?`, 'g');
const AGENDA_THING_WORD = /^(?:sesion|sesiones|campanas?|registros?|panel|paneles)$/;
/** The text without the agenda-ish words of the platform that nothing ties to a screen. */
export function withoutAgendaThings(text: string): string {
  return spoken(text).replace(AGENDA_THINGS, ' ');
}
/** It names a thing of the platform (a sesión, a campaña, a registro or a panel only with what makes them the screen). */
export function namesPlatform(text: string): boolean {
  return PLATFORM.test(withoutAgendaThings(text));
}
// «Lo de la cancha», «lo del puente», «lo d Tariba»: an event by another name, whoever can see it or not.
// Not a thing of the platform («lo del copy»; «lo de la sesión» can be one), a role's («lo de Redes»), the
// person's own («lo de mi clave») nor the huecos a saved script leaves («lo de [titulo]», «lo de el
// lugar»: «lugar» asks where).
const LO_DE = /\blo del? (?:(?:la|el|los|las) )?([a-z0-9]+)/g;
const NOT_AN_EVENT_AFTER = /^(?:mi|mis|tu|tus|su|sus|nuestro|nuestra|que|siempre|arriba|abajo|antes|nuevo|como|cuanto|cada|redes|supervision|despacho|grabacion|secretaria|administracion|admin|equipo|titulo|lugar)$/;
const namesByLoDe = (p: string) => [...p.matchAll(LO_DE)].some((m) => !NOT_AN_EVENT_AFTER.test(m[1]) && (!PLATFORM.test(m[1]) || AGENDA_THING_WORD.test(m[1])));
// A word of a visible title that points to that event alone («la cancha», «el puente», «las viviendas»,
// «la escuela»): a content word of 5+ letters that is not an ordinary word of place names, an event's
// kind (judged as an event word), a work or platform word, a role, a goal, a time or a question word.
// Said alone, as the subject of something happening too («la cancha es…»), it names that event.
const NOT_DISTINCT = new Set(
  'redes supervision despacho grabacion secretaria administracion equipo semana semanas manana tarde noche lunes martes miercoles jueves viernes sabado domingo enero febrero marzo abril mayo junio julio agosto septiembre setiembre octubre noviembre diciembre entre hasta desde hacia durante contra cuando donde porque todos todas nuestro nuestra'.split(' '),
);
const isDistinctWord = (w: string) =>
  w.length >= 5 && !ORDINARY.has(w) && !NOT_DISTINCT.has(w) && !EVENT_WORDS.test(w) && !PLATFORM.test(w) && !GOAL.test(w) && !/^(?:encuentros?|operativos?)$/.test(w);
// A 4-letter word of a title («café», «obra») counts only as the subject of something happening («el
// café es en semana santa»), and not one that is said of anything («esta», «todo», «hora») nor the work
// («la toma es vertical»).
const NOT_SHORT = new Set('como esta este esto todo toda cada pero ante tras hace solo bien sera aqui alla hora dias ayer anos mesa toma post clip logo'.split(' '));
const isShortWord = (w: string) => w.length === 4 && !NOT_SHORT.has(w) && !ORDINARY.has(w) && !NOT_DISTINCT.has(w) && !EVENT_WORDS.test(w) && !PLATFORM.test(w) && !GOAL.test(w);
// The forms people make of a distinctive word: its root (without its plural and its last vowel: cancha
// → canch, puente → puent, viviendas → viviend, productores → productor) and a short ending. Made
// smaller or bigger, as anyone says or types it («canchita», «puentecito», «puentesito», «canchitica»,
// «productorcito», «canchón», «canchota», «canchazo»); and the other gender: after a root that lost its
// vowel, «-o» or «-a» («techado» for «techada»), after one that ends in a consonant only «-a»
// («productora»; «saludo» is not «salud»). A gerund is no other gender («viviendo», «haciendo»).
const SIZE_ENDING = String.raw`(?:e?[cs])?(?:it|ic|ill)(?:it|ic)?[oa]s?|on(?:[ae]s?|es)?|ot[ea]s?|az[oa]s?`;
const SIZE = new RegExp(`^(?:${SIZE_ENDING})$`);
const AFTER_VOWEL_ROOT = new RegExp(`^(?:[ao]s?|${SIZE_ENDING})$`);
const AFTER_CONSONANT_ROOT = new RegExp(`^(?:as?|${SIZE_ENDING})$`);
// Only made smaller, for a 4-letter word (below): «cafecito», «obrita».
const SMALL = /^(?:e?[cs])?(?:it|ic)(?:it|ic)?[oa]s?$/;
const GENDER = /^[ao]s?$/;
const GERUND = /ndos?$/;
// The longest ending above.
const MAX_ENDING = 9;
// Made smaller or bigger, the root is spelled as it sounds: after «-ca», «-co», «-ga», «-go» the c is qu
// and the g gu («finca» → «finquita», «banco» → «banquito», «fábrica» → «fabriquita», «bodega» →
// «bodeguita»), a z is a c («terraza» → «terracita», «lápiz» → «lapicito»), and «-io», «-ia» lose the i
// («estadio» → «estadito», «farmacia» → «farmacita»). That spelling takes only those endings.
function spelledRoot(root: string, lost: string): string {
  if (root.endsWith('z')) return `${root.slice(0, -1)}c`;
  if (lost !== 'a' && lost !== 'o') return '';
  if (root.endsWith('c')) return `${root.slice(0, -1)}qu`;
  if (root.endsWith('g')) return `${root}u`;
  if (root.endsWith('i') && root.length >= 5) return root.slice(0, -1);
  return '';
}
// Per list of titles: each distinctive word, and each root (as written and as spelled made smaller), to
// the titles (their places in the list) that have it; the 4-letter words apart, with their roots.
type Distinct = {
  words: Map<string, number[]>;
  vowelRoots: Map<string, number[]>;
  consonantRoots: Map<string, number[]>;
  spelledRoots: Map<string, number[]>;
  short: Set<string>;
  shortRoots: Set<string>;
};
const NO_DISTINCT: Distinct = { words: new Map(), vowelRoots: new Map(), consonantRoots: new Map(), spelledRoots: new Map(), short: new Set(), shortRoots: new Set() };
// Kept per index of the titles (the same object for the same titles, turn after turn).
const distinctCache = new WeakMap<TitleIndex, Distinct>();
// What a word of a title is for these checks, worked out once per word: distinctive, a 4-letter one, its
// root (4+ letters, or none), whether the root lost a vowel, and the root as spelled made smaller. A
// 4-letter word's roots are the word and the word without its last vowel, each also so spelled
// («cafe» for «cafecito», «obr» for «obrita», «poc» for «pocito»).
type WordKind = { distinct: boolean; short: boolean; root: string; vowel: boolean; spelled: string; shortRoots: string[] };
const wordKinds = new Map<string, WordKind>();
function wordKind(w: string): WordKind {
  let k = wordKinds.get(w);
  if (!k) {
    const bare = w.replace(/(?:es|s)$/, '');
    const root = bare.replace(/[aeo]$/, '');
    const lost = root === bare ? '' : bare.slice(-1);
    const short = isShortWord(w);
    const spelled = root.length >= 4 ? spelledRoot(root, lost) : '';
    const small = short ? [w, root, spelledRoot(root, lost)].filter((r) => r.length >= 3) : [];
    k = { distinct: isDistinctWord(w), short, root: root.length >= 4 ? root : '', vowel: !!lost, spelled: spelled.length >= 4 ? spelled : '', shortRoots: small };
    if (wordKinds.size >= 50_000) wordKinds.clear();
    wordKinds.set(w, k);
  }
  return k;
}
const addTo = (m: Map<string, number[]>, k: string, ks: number[]) => {
  const a = m.get(k);
  if (a) a.push(...ks);
  else m.set(k, [...ks]);
};
export function distinctTitleWords(titles: string[]): Distinct {
  if (!Array.isArray(titles) || !titles.length) return NO_DISTINCT;
  const ix = titleIndex(titles);
  let d = distinctCache.get(ix);
  if (!d) {
    d = { words: new Map(), vowelRoots: new Map(), consonantRoots: new Map(), spelledRoots: new Map(), short: new Set(), shortRoots: new Set() };
    for (const [w, ks] of ix.words) {
      const k = wordKind(w);
      if (k.short) {
        d.short.add(w);
        for (const r of k.shortRoots) d.shortRoots.add(r);
      }
      if (!k.distinct) continue;
      d.words.set(w, ks);
      if (k.root) addTo(k.vowel ? d.vowelRoots : d.consonantRoots, k.root, ks);
      if (k.spelled) addTo(d.spelledRoots, k.spelled, ks);
    }
    distinctCache.set(ix, d);
  }
  return d;
}
const NONE: number[] = [];
// The titles a word of the text names by one of their distinctive words: the same word in the singular
// or the plural («vivienda» for «viviendas», «productor» for «productores»), or a form of it (above).
// An ordinary word never does («santa» of «semana santa» is no form of «Santos»).
function distinctHits(w: string, d: Distinct, first = false): number[] {
  if (w.length < 5 || ORDINARY.has(w) || NOT_DISTINCT.has(w)) return NONE;
  const out: number[] = [];
  const add = (ks: number[] | undefined) => {
    if (ks) out.push(...ks);
    return first && out.length > 0;
  };
  if (add(d.words.get(w)) || add(d.words.get(`${w}s`)) || add(d.words.get(`${w}es`))) return out;
  if (w.endsWith('s') && add(d.words.get(w.slice(0, -1)))) return out;
  if (w.endsWith('es') && add(d.words.get(w.slice(0, -2)))) return out;
  for (let n = Math.max(4, w.length - MAX_ENDING); n < w.length; n++) {
    const [root, rest] = [w.slice(0, n), w.slice(n)];
    const vowel = d.vowelRoots.get(root);
    if (vowel && AFTER_VOWEL_ROOT.test(rest) && !(GENDER.test(rest) && GERUND.test(w)) && add(vowel)) return out;
    const consonant = d.consonantRoots.get(root);
    if (consonant && AFTER_CONSONANT_ROOT.test(rest) && add(consonant)) return out;
    const spelled = d.spelledRoots.get(root);
    if (spelled && SIZE.test(rest) && add(spelled)) return out;
  }
  return out;
}
// A 4-letter word of a title, or it made smaller («el cafecito», «la obrita»).
function isShortForm(w: string, d: Distinct): boolean {
  if (d.short.has(w)) return true;
  if (w.length < 6 || !d.shortRoots.size || ORDINARY.has(w) || NOT_DISTINCT.has(w)) return false;
  for (let n = 3; n <= 4; n++) if (d.shortRoots.has(w.slice(0, n)) && SMALL.test(w.slice(n))) return true;
  return false;
}
const isDistinct = (w: string, d: Distinct) => distinctHits(w, d, true).length > 0;
const namesByWord = (p: string, titles: string[]) => {
  const d = distinctTitleWords(titles);
  return d.words.size > 0 && p.split(' ').some((w) => isDistinct(w, d));
};

/**
 * The words (folded, without the little ones) of the titles a text names: whole, by a name or a run of
 * capitals in one, by two of its words in a row or by a distinctive word of it, and the forms of those
 * words the text made («la canchita»). What a notice that names an event may repeat of it, and what is
 * the event's name in a question, not its topic. The text is folded once and looked up in an index of
 * the titles (read once per list), never title by title.
 */
export function namedTitleWords(text: string, titles: string[]): Set<string> {
  const words = new Set<string>();
  if (!Array.isArray(titles) || !titles.length) return words;
  const folded = plain(text);
  const named = new Set(titlesNamed(folded, titles, { byName: true, words: true }));
  const d = distinctTitleWords(titles);
  for (const w of new Set(spokenFolded(folded).split(' '))) {
    const hits = distinctHits(w, d);
    if (!hits.length) continue;
    words.add(w);
    for (const k of hits) named.add(k);
  }
  const ix = titleIndex(titles);
  for (const k of named) for (const w of ix.wordsOf(k)) words.add(w);
  return words;
}
// An event's or an event place's placeholder («[[E1]]», «[[L1]]»), also as a model may alter it, and
// the scripts' title hueco («[titulo]», what «Así se contesta» leaves of a title).
export const EVENT_TOKEN = /\[{1,2}\s*[EeLl]\s*\d{1,4}\s*\]{1,2}|\[titulo\]/;
// What redact() left of a date, an hour or an address the person typed.
const AGENDA_MARK = /\[(?:fecha|hora|direccion)\]/;
// Something happening or moving: «la feria es…», «arranca…», «sale…», «salimos…», «queda…», «será…».
// «Cómo va» asks how it is going; «me / te / les toca» is someone's turn.
const OCCURRENCE_WORDS = 'es son sera seran seria serian empieza empiezan empezara empezaran empezo comienza comienzan comenzara comenzo arranca arrancan arrancamos arrancara arrancaran arranco sale salen salimos salgo saldra saldran saldre saldremos salio parte parten partimos parto partira partiran llega llegan llegamos llego llegara llegaran llegare queda quedan quedo quedara termina terminan terminara termino cierra cierran cerrara abre abren abrira vamos voy ire ira iran viene vienen vengo venimos vendra vendran dura duran durara estare estara estaran estaremos cae caen pautado pautada pautados pautadas reprogramado reprogramada suspendido suspendida'.split(' ');
const OCCURRENCE_PHRASES = String.raw`(?<!\bcomo )va|(?<!\bcomo )van|(?<!\b(?:me|te|le|les|nos) )tocan?|se (?:movio|cambio|mudo|paso|corrio|adelanto|atraso|reprogramo|hace|hacen|hara|haran)|nos (?:vemos|encontramos|reunimos)`;
export const OCCURRENCE = new RegExp(String.raw`\b(?:${OCCURRENCE_WORDS.join('|')}|${OCCURRENCE_PHRASES})\b`);
// Recording, in any form: with a day or an hour it is someone's agenda («mañana grabo en Táriba»).
const RECORDING = /\bgrab[a-z]*\b/;
// Publishing: its days and hours are the best hours, not an event's («los tweets salen a las 9»).
const PUBLISHING_TOPIC = /\b(tweets?|tuits?|publica\w*|publico|publique\w*|posteo|reels?|historias|stories|instagram|insta|facebook|tiktok|threads|twitter|youtube|redes|mejor(?:es)? horas?|franjas?)\b/;
// A where, a when or a way whose subject is a thing of the platform («¿dónde está la biblioteca?», «¿dónde
// se ve el semáforo?», «¿cuándo vence el plazo?», «¿cuándo le llega el correo de invitación?», «¿a qué hora
// se cierra la semana de tweets?», «¿esto se va a la biblioteca?») asks for a screen or a rule, not for the
// agenda: alone it is no event (with an event, a title or a place it already is one). Only right after the
// question, with a verb of where a thing is («está», «queda», «se ve»…) or a rule's verb before what it is
// for («vence el plazo», «llega el correo»), never a verb of something happening in between: «¿a qué hora
// es la sesión?», «¿a qué hora voy a la sesión?» and «¿a qué hora sale Kevin con copies?» ask for someone's
// agenda. A word that is often on the agenda too (a sesión, a campaña, a registro, a panel) counts only
// with what makes it the screen («el registro de cambios», «la campana de avisos», «mi sesión»).
const SCREEN_THINGS = String.raw`biblioteca|ajustes|pantallas?|pestanas?|boton|botones|menu|resultados|metricas|perfil|formulas?|semaforo|plazos?|version|versiones|archivos?|enlaces?|links?|plantillas?|app|aplicacion|asistente|buscador|buzon|categorias?|invitacion|invitaciones|correos?|notificaciones|permisos?|avisos?|contrasena|clave|codigo|tweets?|tuits?|tanda|copies|copy|fichas?|storyboard|piezas?|publicaciones?|registro de cambios|historial de cambios|campana de (?:avisos|arriba)|campanita|panel del asistente`;
const WHERE_VERB = 'esta|estan|queda|quedan|ve|ven|aparece|aparecen|encuentro|encuentra|veo|consigo';
const RULE_VERB = 'vence|vencen|cierra|cierran|abre|abren|llega|llegan';
const RULE_THINGS = String.raw`plazos?|correos?|invitacion|invitaciones|codigos?|tweets?|tuits?|tanda|semana|avisos?|notificaciones`;
const NOT_HAPPENING = `(?!(?:${OCCURRENCE_WORDS.join('|')}|va|van)\\b)`;
// Between the question and the thing, a word or two («la lista de tweets»), not who it is with
// («¿dónde está Kevin con copies?» asks for Kevin). «Es» or «son» only before a deadline («¿cuándo es el
// plazo?»; «¿a qué hora es la invitación del alcalde?» is the agenda). The login session never is «de
// fotos» or «de grabación».
const ABOUT_THE_PLATFORM = new RegExp(
  String.raw`\b(?:donde|cuando|a que hora|que dia|en que parte|en que lugar) (?:(?:se|le|me|te|nos|les) )?(?:(?:(?:${WHERE_VERB}) )?(?:(?:el|la|los|las|mi|mis|tu|tus|su|sus|un|una) )?(?:${NOT_HAPPENING}(?!con\b)[a-z]+ ){0,2}(?:${SCREEN_THINGS})|(?:${RULE_VERB}) (?:(?:el|la|los|las|mi|mis|tu|tus|su|sus) )?(?:${RULE_THINGS})|(?:es|son) (?:(?:el|la|los|las|mi|mis|tu|tus|su|sus) )?plazos?|(?:${WHERE_VERB}) (?:mi|mis|tu|tus|su|sus) sesion(?:es)?(?! de\b))\b|\b(?:se va|se van|llegar|llego|llega|llegan) (?:a|al|para|pa|pal|hasta) (?:(?:la|el|los|las|mi|mis) )?(?:${SCREEN_THINGS})\b`,
);
const ABOUT_THE_PLATFORM_ALL = new RegExp(ABOUT_THE_PLATFORM.source, 'g');
// Each sentence and what «y», «o», «pero» or a comma join, judged alone, and in each what is left once the
// platform's part is taken out: a where about the platform does not clear a when about the agenda next to
// it («¿Dónde está la biblioteca? ¿Y a qué hora llega la comitiva?», «… la biblioteca, a qué hora
// llega…», «… o a qué hora…», «… pero a qué hora…», or dictated with no commas at all). A part with no
// question word of its own that goes on with the question before it takes that one's question word, if
// something happens in it or it starts with a subject of its own: «¿a qué hora cierra la tanda y llega la
// comitiva?» is judged as «a qué hora llega la comitiva», «¿dónde están la biblioteca y la comitiva?» as
// «dónde la comitiva» (and «¿dónde está la biblioteca y el botón?» as «dónde el botón»: the platform's).
// Not «…, que no la veo», nor a question of its own («… y qué pasa si no llego?», «… y cómo la uso?»).
const CLAUSES = /([.;:!?¿¡\n]+|,|\s+(?:y|e|o|u|ni|pero)\s+)/i;
const SENTENCE_END = /[.;:!?¿¡\n]/;
const OWN_SUBJECT = /^(?:el|la|los|las|un|una|unos|unas|mi|mis|tu|tus|su|sus|este|esta|estos|estas|ese|esa|esos|esas)\b/;
const OWN_QUESTION = /^(?:que|como|quien|quienes|cual|cuales|cuant[oa]s?|por que|para que|porque|si)\b/;
const asksAny = (t: string) => {
  const p = spoken(t);
  return asksSchedule(t) || STILL_ON.test(p) || (asksRoute(t) && !GOAL.test(p));
};
/** Every part of the text that asks when, where or the way is about a thing of the platform. */
function onlyAboutThePlatform(t: string): boolean {
  let any = false;
  // The question word of the last part that asked, in this sentence.
  let asking = '';
  const parts = t.split(CLAUSES);
  for (let k = 0; k < parts.length; k += 2) {
    if (k > 0 && SENTENCE_END.test(parts[k - 1])) asking = '';
    let p = spoken(parts[k]);
    if (!p) continue;
    if (asksAny(p)) asking = ASK_WORD.exec(p)?.[0] ?? '';
    else if (asking && !OWN_QUESTION.test(p) && (OCCURRENCE.test(p) || OWN_SUBJECT.test(p)) && asksAny(`${asking} ${p}`)) p = `${asking} ${p}`;
    else continue;
    if (!ABOUT_THE_PLATFORM.test(p) || asksAny(p.replace(ABOUT_THE_PLATFORM_ALL, ' '))) return false;
    any = true;
  }
  return any;
}
// On the way there, a goal («llegar a más gente», «a la meta», «a tiempo») is not a place.
export const GOAL = /\b(?:gente|personas|seguidores|publico|audiencia|alcance|metas?|vistas|likes|comunidad|usuarios|tiempo|temprano)\b/;

// The place or the contacts of something («en lugar de», «sitio web» or «dirección de correo» are not),
// and how far it is («¿qué tan lejos queda…?», «¿a cuánto queda…?»).
// «Por dónde se entra» only with somewhere to go into: alone or «a la plataforma», it asks how to log in.
const PLACE_WORDS = String.raw`direccion(?! (?:de )?(?:correo|email|electronica))|como llego|como llegar|como se llega|por donde se entra(?= al? (?!(?:la )?(?:plataforma|app|aplicacion|sistema)\b))|en que parte (?:queda|quedan|es)|quedan? (?:lejos|cerca)|que tan (?:lejos|cerca)|a cuanto (?:queda|quedan)|estan? (?:lejos|cerca)|(?<!en |primer |segundo )lugar|ubicacion|sitio(?! web)|(?<!como )contactos?|telefono (?:de|del|para)|numero de telefono|con quien hablo|a quien llamo|a quien busco|quien me recibe`;
const DAYS = String.raw`hoy|manana|pasado manana|esta semana|la semana|proxima semana|fin de semana|lunes|martes|miercoles|jueves|viernes|sabado|domingo`;
// The place phrases first: the longest one is taken (and stripped) whole, «por donde se entra a…» too.
const ASK_WORDS = String.raw`${PLACE_WORDS}|cuando|a que hora|que hora|hora|que dia|que fecha|fecha|donde|por donde`;
// Asked as a schedule: when, at what time, which day, where, how to get there, whom to call; or
// «¿qué hay / hay algo…?» with a day. A day alone («¿qué hago hoy?») is not.
// How long until it («¿cuántos días faltan para…?»): a when. Whether it still holds («¿se suspendió?»,
// «¿sigue en pie?»): about an event, but the demo brain answers it with how the event is going.
const UNTIL_ASK = String.raw`cuantos? (?:dias? )?faltan? (?:para|pa|pal)|cuanto falta (?:para|pa|pal)|falta mucho (?:para|pa|pal)`;
const STILL_ON = /\b(?:se (?:suspendio|suspende|cancelo|cancela|pospuso|pospone|aplazo|aplaza)|sigue en pie)\b/;
const SCHEDULE = new RegExp(
  String.raw`\b(?:${ASK_WORDS}|${UNTIL_ASK})\b|\b(?:que hay|hay algo|hay eventos?|que tiene|que tienen|que tenemos)\b.*\b(?:${DAYS})\b|\b(?:es|son|sera|seria) (?:en|de|por) la (?:manana|tarde|noche)\b`,
);
// The question word a part asks with («a que hora», «donde»…), for the part that goes on with it.
const ASK_WORD = new RegExp(String.raw`\b(?:${ASK_WORDS}|${UNTIL_ASK})\b`);
const WHEN_WHERE_WORDS = String.raw`\b(?:${ASK_WORDS}|dia|${DAYS}|proximos?|proximas?|vienen)\b`;
const WHEN_WHERE = new RegExp(`${SCHEDULE.source}|${WHEN_WHERE_WORDS}`);
const PLACE = new RegExp(String.raw`\b(?:${PLACE_WORDS})\b`);
// How to get somewhere («¿cómo hago para llegar a la feria?», «¿cómo se va pa' la feria?», «… hasta
// la feria?»). It is the agenda only next to an event («para llegar a más gente» is not); «se va a
// publicar» is the future.
const ROUTE = /\b(?:para llegar|llegar al?|se va (?:al|pal|pa|hasta|(?:a|para) (?:la|el|los|las|lo)))\b/;
// «¿Dónde subo el material?», «¿dónde se cambia la contraseña?», «¿cuándo grabo en vertical?» or
// «¿cuándo hay que grabar con dron?» ask for a screen or a step, not for a place or a time («¿dónde se
// encuentra…?», «¿cuándo abre…?» do).
const DOING = new RegExp(
  String.raw`\b(?:donde|cuando) (?:es que )?(?:se |lo |la |los |las |me |te )?(?:subo|sube|subimos|cargo|carga|pongo|pone|veo|reviso|revisa|apruebo|aprueba|edito|edita|descargo|descarga|busco|busca|encuentro|consigo|consigue|guardo|guarda|escribo|escribe|anoto|anota|marco|marca|cambio|cambia|creo|crea|armo|arma|propongo|propone|mando|manda|envio|envia|activo|activa|configuro|configura|invito|invita|pido|pide|elijo|elige|asigno|asigna|pego|pega|abro|grabo|dejo|deja|comento|comenta)\b|\bcuando (?:hay que|se debe|debo|debemos|conviene|se usa|uso|usamos)\b`,
  'g',
);
// Who records, when: «¿a qué hora graba Kevin?» is the agenda even without an event word; «¿cuándo
// grabo en vertical?» is a how-to.
const WHEN_SUBJECT = /\b(evento|acto|jefe|graba|graban|grabamos|grabara|grabaran|grabaremos|grabando|grabacion|(?:toca|va a|van a|vamos a) grabar)\b/;

// What the person asked, for these checks: the «[direccion]» placeholder is what redact() left of a
// place name («el evento del barrio San Carlos»), not the word «dirección», and the steps go.
function asked(question: string): string {
  const q = spoken(question.replace(/\[direccion\]/gi, ' '));
  const done = q.replace(DOING, ' ');
  // «¿Cuándo grabo en vertical y cuándo en horizontal?»: the second «cuándo» is the same step.
  return done === q ? q : done.replace(/\by (?:donde|cuando)\b/g, ' ');
}

/** Where the question first names an event (an event word; or who records or the boss, when it asks when or where), or -1. The demo brain's own reading of a question. */
export function eventAt(question: string): number {
  const q = spoken(question);
  const typo = typedEventWord(q) ? q.split(' ').findIndex((w) => w.length >= 4 && !NOT_TYPO.has(w) && TYPO_TARGETS.some((t) => oneOff(w, t))) : -1;
  const at = [EVENT_WORDS.exec(q)?.index, typo >= 0 ? q.split(' ').slice(0, typo).join(' ').length : undefined, asksWhenWhere(question) ? WHEN_SUBJECT.exec(q)?.index : undefined].filter(
    (n): n is number => n !== undefined,
  );
  return at.length ? Math.min(...at) : -1;
}

/** Any when or where in it, a day included («¿qué eventos hay mañana?»). */
export function asksWhenWhere(question: string): boolean {
  return WHEN_WHERE.test(asked(question));
}

/** Asked as a schedule (when, what time, where, how to get there, whom to call), not just a day named. */
export function asksSchedule(question: string): boolean {
  return SCHEDULE.test(asked(question));
}

/** Asks for the place or the contacts of something. */
export function asksPlace(question: string): boolean {
  return PLACE.test(asked(question));
}

/** Asks how to get somewhere (it is the agenda only about an event). */
export function asksRoute(question: string): boolean {
  return ROUTE.test(asked(question));
}

/** The question without its when/where (and way-there) words: what is left may name an event («la feria»). */
export function withoutWhenWhere(question: string): string {
  return spoken(question).replace(new RegExp(WHEN_WHERE_WORDS, 'g'), ' ').replace(new RegExp(ROUTE.source, 'g'), ' ').replace(/\s+/g, ' ').trim();
}

// «¿A qué hora publico el video del acto en TikTok?» asks for the best hours to publish, not
// for the agenda. «publico» (I publish) says it alone; «sale», «subir»… need a network named.
const PUBLISH_ME = /\b(publico|publicamos|lo publico|la publico|posteo|posteamos|tuiteo)\b/;
const PUBLISH_ANY = /\b(publicar|publicarlo|publicarla|publica|publicas|publiquemos|subo|subir|subirlo|subirla|subimos|sale|salga|postear)\b/;
const NETWORK = /\b(instagram|insta|ig|reel|reels|facebook|fb|tiktok|tik tok|threads|twitter|tweet|tweets|tuit|tuits|x|youtube|yt|redes)\b/;
const BEST_TIME = /\b(horario para publicar|hora de publicar|horas de publicar|nos va mejor)\b/;
const BEST_WORDS = /\bmejor(es)? (hora|horas|horario|dia|dias)\b/;

/** The question is about when or where to publish (best hours, a network), not about an event's schedule. */
export function asksAboutPublishing(question: string): boolean {
  const q = plain(question);
  return PUBLISH_ME.test(q) || BEST_TIME.test(q) || ((PUBLISH_ANY.test(q) || BEST_WORDS.test(q)) && NETWORK.test(q)) || (BEST_WORDS.test(q) && /\bpublic/.test(q));
}

// «a» + a Name is a place («lleven el dron a Táriba», «¿qué llevo a Táriba?») unless the Name is someone
// of the team («a Kevin», the boss). Without the team's names (`titles.people`), every Name is a place.
const peopleCache = new WeakMap<string[], Set<string>>();
function personTest(titles: TitleSet): (w: string) => boolean {
  const list = Array.isArray(titles?.people) ? titles.people : [];
  let people = peopleCache.get(list);
  if (!people) peopleCache.set(list, (people = new Set(list)));
  const known = people;
  return (w) => known.has(plain(w)) || BOSS_NAMES.includes(plain(w));
}
/** Somewhere said as «a» + a Name that is not someone of the team. */
export function placeAfterA(text: string, titles: TitleSet = NO_TITLES): boolean {
  const t = String(text ?? '');
  return redactPlacesAfterA(t, personTest(titles)) !== t;
}
/** «a» + a Name that is not someone of the team, as «a [direccion]». */
export function redactPlaceAfterA(text: string, titles: TitleSet = NO_TITLES): string {
  return redactPlacesAfterA(String(text ?? ''), personTest(titles));
}

// ---------------------------------------------------------------------------
// The detector.
// ---------------------------------------------------------------------------
/**
 * What makes a text about an event:
 * - `word`: an event word, also typed with one letter off («la feria», «el acto», «la agenda», «feira»);
 * - `title`: a particular event: a title this person can see, whole, by a name in it («Tariba»), by a run
 *   of its capitalised words, by two of its words in a row («toma aérea») or by one distinctive word of
 *   it, also made smaller or bigger or of the other gender («la cancha», «el puentesito», «las
 *   viviendas», «el techado»), or by a 4-letter word of it as the subject of something happening («el
 *   café es…»); or «lo de…» something that is not a thing of the platform («lo de la cancha», «lo d
 *   Tariba»), whoever can see it or not;
 * - `place`: an event's place this person can see, whole, by a name in it («La Quebrada») or by the run
 *   of its capitalised words («Alto Verde»);
 * - `token`: an event's or a place's placeholder, or the scripts' «[titulo]»;
 * - `subject`: the boss (by his role, his name or his title) or someone recording («Kevin graba…»);
 * - `ask`: asked when, where, how to get there, whom to call, how long until it or whether it still
 *   holds (not when to publish, not a step, not about a thing of the platform: «¿dónde está la biblioteca?»);
 * - `agenda`: shaped like the agenda without naming anything: a date, an hour or an address the person
 *   typed (what redact() left of it), an address or a landmark, somewhere by its Name («pa Alto Verde»,
 *   «en el hotel Tamá», «a Táriba» when Táriba is no one of the team), a bare landmark with something
 *   happening («es en la cancha»), or a day or an hour that is not their own work next to something
 *   happening or moving, to recording or to a place («salimos pasado mañana temprano desde la plaza»);
 * - `when`: in a question, any day or hour that is not their own work nor about publishing («¿qué llevo
 *   el sábado?»). A notice is judged without it: its days are the team's unless it names an event.
 * The shorthand is read as words first («kndo», «onde», «lo d la»).
 */
export type EventSignal = 'word' | 'title' | 'place' | 'token' | 'subject' | 'ask' | 'agenda' | 'when';

export function eventSignals(text: string, titles: TitleSet = NO_TITLES): Set<EventSignal> {
  const t = String(text ?? '');
  const p = spoken(t);
  const out = new Set<EventSignal>();
  if (EVENT_WORDS.test(p) || typedEventWord(p)) out.add('word');
  if (namesTitle(p, titles.events, { byName: true, words: true }) || namesByWord(p, titles.events) || namesByLoDe(p) || shortWordIsSubject(t, titles.events)) out.add('title');
  if (namesTitle(p, titles.places, { byName: true })) out.add('place');
  if (EVENT_TOKEN.test(t)) out.add('token');
  if (SUBJECT.test(p)) out.add('subject');
  const publishing = asksAboutPublishing(t);
  if (asksAny(t) && !publishing && !onlyAboutThePlatform(t)) out.add('ask');
  if (AGENDA_MARK.test(t) || hasPlace(t)) out.add('agenda');
  else if (!publishing && !PUBLISHING_TOPIC.test(p)) {
    const when = carriesEventWhen(t);
    const named = hasPlaceName(t);
    if (when) out.add('when');
    if (hasPlaceByName(t) || placeAfterA(t, titles) || (when && (OCCURRENCE.test(p) || RECORDING.test(p) || named)) || (named && OCCURRENCE.test(p))) out.add('agenda');
  }
  return out;
}

/**
 * The text is about an event (any signal): see eventSignals(). With `when: false` (a notice, a team
 * ficha) a day or an hour alone does not make it one.
 */
export function aboutEvent(text: string, titles: TitleSet = NO_TITLES, o: { when?: boolean } = {}): boolean {
  const s = eventSignals(text, titles);
  if (o.when === false) s.delete('when');
  return s.size > 0;
}

/** Signals that name the event itself (not only a when, a where or a question about one). */
export const MENTIONS: EventSignal[] = ['word', 'title', 'place', 'token', 'subject'];

/** The text names an event (an event word, a title, an event's place, a placeholder, the boss or who records). */
export function mentionsEvent(text: string, titles: TitleSet = NO_TITLES): boolean {
  const s = eventSignals(text, titles);
  return MENTIONS.some((m) => s.has(m));
}

// A question that goes on with the one before it instead of standing alone: it starts with «y»,
// «pero», «bueno»…, points back («eso», «allá», «ese video») or is a few words («ok», «¿quién la cubre?»).
const GOES_ON = /^(?:y|e|pero|entonces|bueno|ok|okey|ya|dale|vale|o sea|osea|tambien|igual)\b|\b(?:eso|esa|ese|esos|esas|ahi|alla|alli|aca|aquel|aquella|lo mismo)\b/;
export function goesOn(question: string): boolean {
  const p = spoken(question);
  return GOES_ON.test(p) || p.split(' ').filter(Boolean).length <= 3;
}

/**
 * Which questions of a thread, in order, are 360's: one about an event, and one that goes on with one
 * that was («¿cómo va la feria?», «¿y quién la cubre?», «¿y llevo el dron?»). One that stands alone
 * («¿cómo hago un copy?») is not, and the thread a provider sees leaves out the ones that are.
 */
export function eventThread(questions: string[], titles: TitleSet = NO_TITLES): boolean[] {
  let last = false;
  return questions.map((q) => (last = aboutEvent(q, titles) || (last && goesOn(q))));
}

// The event as the subject of something happening, read word by word in each sentence: an event word
// not after «de», «para»… («de cada evento son…» is not), maybe with its «de …» («el acto de entrega»),
// then the verb (maybe after «ya», «no», «se», «que»: «la caravana sale…», «la feria ya arranca…», «la
// feria que es…»); the verb first for starting or arriving («arranca la feria»); or the event that there
// is («hay feria», «habrá asamblea», «noviembre trae feria»). For what 360 is taught, which talks of
// events in general («cómo se cubre un acto», «abre el evento» stay).
const PREPS = new Set('de del para por con en a al sin sobre desde hasta entre tras segun hacia'.split(' '));
const DETS = new Set('el la los las un una unos unas este esta estos estas ese esa esos esas cada su sus lo'.split(' '));
const BETWEEN = new Set('ya no se solo siempre tambien nunca recien que todavia aun'.split(' '));
const EVENT_TOKEN_WORD = /^(?:eventos?|actos?|actividad|actividades|jornadas?|entregas?|reunion|reuniones|recorridos?|inauguracion|inauguraciones|visitas?|ferias?|asambleas?|caravanas?|cabildos?|conversatorios?|foros?|juramentacion|zzevento)$/;
// «Toca» is also «tap» («toca «Crear»»): left out here, but for «toca feria» (no article).
const OCCURRENCE_WORD = new RegExp(`^(?:${OCCURRENCE_WORDS.join('|')}|va|van)$`);
// The verb first only for starting or arriving («arranca la feria»): «abre el evento» is an instruction.
const INVERTED = /^(?:arranca|arrancan|arrancara|empieza|empiezan|empezara|comienza|comienzan|comenzara|llega|llegan|llegara|sera|seran|viene|vienen)$/;
// There is one, with no article or with «este», «ese», «otro»: «hay feria», «habrá asamblea», «toca
// jornada», «noviembre trae feria», «hay otra entrega» («si hay un evento sin material…» is general).
const THERE_IS = /^(?:hay|habra|habia|hubo|toca|tocara|trae|traera)$/;
const DEMONSTRATIVE = new Set('este esta ese esa otro otra'.split(' '));

/** With `titles` (what the person can see), a distinctive word of a title counts as the event too («la cancha es…», «el puente arranca…»), and here a 4-letter one too («el café es…»). */
export function eventIsSubject(text: string, titles: TitleSet | string[] = NO_TITLES): boolean {
  const t = String(text ?? '').replace(/\[titulo\]/g, ' ').replace(/\[{1,2}\s*[EeLl]\s*\d{1,4}\s*\]{1,2}/g, ' zzevento ');
  const d = distinctTitleWords(Array.isArray(titles) ? titles : titles?.events ?? []);
  const isEvent = (w: string) => EVENT_TOKEN_WORD.test(w) || isDistinct(w, d) || isShortForm(w, d);
  return t.split(/[.;:!?¡¿\n]+/).some((c) => subjectIn(spoken(c).split(' ').filter(Boolean), isEvent));
}

// A 4-letter word of a visible title as the subject of something happening («el café es en semana santa»).
function shortWordIsSubject(text: string, titles: string[]): boolean {
  const d = distinctTitleWords(titles);
  return d.short.size > 0 && text.split(/[.;:!?¡¿\n]+/).some((c) => subjectIn(spoken(c).split(' ').filter(Boolean), (w) => isShortForm(w, d)));
}

function subjectIn(ws: string[], isEvent: (w: string) => boolean): boolean {
  const verbAt = (j: number) => OCCURRENCE_WORD.test(ws[j] ?? '') || (ws[j] === 'se' && /^(?:hace|hacen|hara|haran|movio|cambio|mudo|paso|corrio|adelanto|atraso|reprogramo|suspendio|cancelo|pospuso|aplazo)$/.test(ws[j + 1] ?? ''));
  for (let k = 0; k < ws.length; k++) {
    if (isEvent(ws[k])) {
      const [w1, w2] = [ws[k - 1] ?? '', ws[k - 2] ?? ''];
      if (THERE_IS.test(w1) || (DEMONSTRATIVE.has(w1) && THERE_IS.test(w2) && w2 !== 'toca')) return true;
      let b = k - 1;
      while (b >= 0 && DETS.has(ws[b])) b--;
      if (b >= 0 && PREPS.has(ws[b])) continue;
      let j = k + 1;
      // Its «de …» first: «el acto de entrega arranca», «la feria de los productores es…».
      for (let n = 0; n < 2 && (ws[j] === 'de' || ws[j] === 'del'); n++) {
        j++;
        while (DETS.has(ws[j] ?? '')) j++;
        j++;
      }
      for (let n = 0; n < 2 && BETWEEN.has(ws[j] ?? '') && !verbAt(j); n++) j++;
      if (verbAt(j)) return true;
    } else if (INVERTED.test(ws[k])) {
      const j = DETS.has(ws[k + 1] ?? '') ? k + 2 : k + 1;
      if (isEvent(ws[j] ?? '')) return true;
    }
  }
  return false;
}
