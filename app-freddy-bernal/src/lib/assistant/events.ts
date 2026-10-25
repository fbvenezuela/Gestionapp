import 'server-only';
import { brand } from '../client-config';
import { carriesEventWhen, hasPlace, hasPlaceByName, hasPlaceName } from './redact';
import { plain } from './text';
import { NO_TITLES, namesTitle, type TitleSet } from './titles';

// Is this about an event? One detector for every place that asks (docs/ASISTENTE.md «Lo que habla de
// un evento lo contesta 360 sin IA»): which brain answers a turn, how much of a question is masked,
// when an answer is held to the agenda rule, what a notice may say, what 360 may be taught and what an
// «aviso al equipo» tells Supervisión. A turn about an event never goes to an AI provider: the demo
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
  [/\b(?:onde|aonde|adonde)\b/g, 'donde'],
  [/\b(?:q|k|ke)\b/g, 'que'],
  [/\bd\b/g, 'de'],
  [/\bxq\b/g, 'porque'],
];
/** plain(), with the shorthand read as the words it stands for. */
export function spoken(text: string): string {
  return SHORTHAND.reduce((t, [re, to]) => t.replace(re, to), plain(text));
}
// A work product or a thing of the platform: «lo del copy», «¿dónde queda el material?» are not an event.
export const WORK = /\b(piezas?|videos?|material|materiales|copy|copies|storyboard|fotos?|tomas|reels?|publica\w*|tweets?|tuits?|tanda)\b/;
export const PLATFORM = new RegExp(
  String.raw`${WORK.source}|\b(avisos?|campana|contrasena|clave|codigo|ajustes|pantalla|pestana|boton|menu|panel|biblioteca|resultados|metricas|perfil|formulas?|semaforo|plazos?|version|archivos?|enlace|link|plantilla|dron|vertical|horizontal|formato|microfono|app|aplicacion|asistente|buscador)\b`,
);
// «Lo de la cancha», «lo del puente», «lo d Tariba»: an event by another name, whoever can see it or not.
// Not a thing of the platform («lo del copy»), a role's («lo de Redes»), the person's own («lo de mi
// clave») nor the huecos a saved script leaves («lo de [titulo]», «lo de el lugar»: «lugar» asks where).
const LO_DE = /\blo del? (?:(?:la|el|los|las) )?([a-z0-9]+)/g;
const NOT_AN_EVENT_AFTER = /^(?:mi|mis|tu|tus|su|sus|nuestro|nuestra|que|siempre|arriba|abajo|antes|nuevo|como|cuanto|cada|redes|supervision|despacho|grabacion|secretaria|administracion|admin|equipo|titulo|lugar)$/;
const namesByLoDe = (p: string) => [...p.matchAll(LO_DE)].some((m) => !NOT_AN_EVENT_AFTER.test(m[1]) && !PLATFORM.test(m[1]));
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
// On the way there, a goal («llegar a más gente», «a la meta», «a tiempo») is not a place.
export const GOAL = /\b(?:gente|personas|seguidores|publico|audiencia|alcance|metas?|vistas|likes|comunidad|usuarios|tiempo|temprano)\b/;

// The place or the contacts of something («en lugar de», «sitio web» or «dirección de correo» are not).
// «Por dónde se entra» only with somewhere to go into: alone or «a la plataforma», it asks how to log in.
const PLACE_WORDS = String.raw`direccion(?! (?:de )?(?:correo|email|electronica))|como llego|como llegar|como se llega|por donde se entra(?= al? (?!(?:la )?(?:plataforma|app|aplicacion|sistema)\b))|en que parte (?:queda|quedan|es)|quedan? (?:lejos|cerca)|(?<!en |primer |segundo )lugar|ubicacion|sitio(?! web)|(?<!como )contactos?|telefono (?:de|del|para)|numero de telefono|con quien hablo|a quien llamo|a quien busco|quien me recibe`;
const DAYS = String.raw`hoy|manana|pasado manana|esta semana|la semana|proxima semana|fin de semana|lunes|martes|miercoles|jueves|viernes|sabado|domingo`;
// The place phrases first: the longest one is taken (and stripped) whole, «por donde se entra a…» too.
const ASK_WORDS = String.raw`${PLACE_WORDS}|cuando|a que hora|que hora|hora|que dia|que fecha|fecha|donde|por donde`;
// Asked as a schedule: when, at what time, which day, where, how to get there, whom to call; or
// «¿qué hay / hay algo…?» with a day. A day alone («¿qué hago hoy?») is not.
// How long until it («¿cuántos días faltan para…?»): a when. Whether it still holds («¿se suspendió?»,
// «¿sigue en pie?»): about an event, but the demo brain answers it with how the event is going.
const UNTIL_ASK = String.raw`cuantos? (?:dias? )?faltan? para|cuanto falta para|falta mucho para`;
const STILL_ON = /\b(?:se (?:suspendio|suspende|cancelo|cancela|pospuso|pospone|aplazo|aplaza)|sigue en pie)\b/;
const SCHEDULE = new RegExp(
  String.raw`\b(?:${ASK_WORDS}|${UNTIL_ASK})\b|\b(?:que hay|hay algo|hay eventos?|que tiene|que tienen|que tenemos)\b.*\b(?:${DAYS})\b|\b(?:es|son|sera|seria) (?:en|de|por) la (?:manana|tarde|noche)\b`,
);
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
  String.raw`\b(?:donde|cuando) (?:es que )?(?:se |lo |la |los |las |me |te )?(?:subo|sube|subimos|cargo|carga|pongo|pone|veo|reviso|revisa|apruebo|aprueba|edito|edita|descargo|descarga|busco|busca|encuentro|consigo|consigue|guardo|guarda|escribo|escribe|anoto|anota|marco|marca|cambio|cambia|creo|crea|armo|arma|propongo|propone|mando|manda|envio|envia|activo|activa|configuro|configura|invito|invita|pido|pide|elijo|elige|asigno|asigna|pego|pega|abro|grabo)\b|\bcuando (?:hay que|se debe|debo|debemos|conviene|se usa|uso|usamos)\b`,
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

// ---------------------------------------------------------------------------
// The detector.
// ---------------------------------------------------------------------------
/**
 * What makes a text about an event:
 * - `word`: an event word, also typed with one letter off («la feria», «el acto», «la agenda», «feira»);
 * - `title`: a particular event: a title this person can see, whole, by a name in it («Tariba»), by a run
 *   of its capitalised words or by two of its words in a row («toma aérea»); or «lo de…» something that
 *   is not a thing of the platform («lo de la cancha», «lo d Tariba»), whoever can see it or not;
 * - `place`: an event's place this person can see, whole, by a name in it («La Quebrada») or by the run
 *   of its capitalised words («Alto Verde»);
 * - `token`: an event's or a place's placeholder, or the scripts' «[titulo]»;
 * - `subject`: the boss (by his role, his name or his title) or someone recording («Kevin graba…»);
 * - `ask`: asked when, where, how to get there, whom to call, how long until it or whether it still
 *   holds (not when to publish, not a step);
 * - `agenda`: shaped like the agenda without naming anything: a date, an hour or an address the person
 *   typed (what redact() left of it), an address or a landmark, somewhere by its Name («pa Alto Verde»,
 *   «en el hotel Tamá»), a bare landmark with something happening («es en la cancha»), or a day or an
 *   hour that is not their own work next to something happening or moving, to recording or to a place
 *   («salimos pasado mañana temprano desde la plaza»);
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
  if (namesTitle(p, titles.events, { byName: true, words: true }) || namesByLoDe(p)) out.add('title');
  if (namesTitle(p, titles.places, { byName: true })) out.add('place');
  if (EVENT_TOKEN.test(t)) out.add('token');
  if (SUBJECT.test(p)) out.add('subject');
  const publishing = asksAboutPublishing(t);
  if ((asksSchedule(t) || STILL_ON.test(p) || (asksRoute(t) && !GOAL.test(p))) && !publishing) out.add('ask');
  if (AGENDA_MARK.test(t) || hasPlace(t)) out.add('agenda');
  else if (!publishing && !PUBLISHING_TOPIC.test(p)) {
    const when = carriesEventWhen(t);
    const named = hasPlaceName(t);
    if (when) out.add('when');
    if (hasPlaceByName(t) || (when && (OCCURRENCE.test(p) || RECORDING.test(p) || named)) || (named && OCCURRENCE.test(p))) out.add('agenda');
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

export function eventIsSubject(text: string): boolean {
  const t = String(text ?? '').replace(/\[titulo\]/g, ' ').replace(/\[{1,2}\s*[EeLl]\s*\d{1,4}\s*\]{1,2}/g, ' zzevento ');
  return t.split(/[.;:!?¡¿\n]+/).some((c) => subjectIn(spoken(c).split(' ').filter(Boolean)));
}

function subjectIn(ws: string[]): boolean {
  const verbAt = (j: number) => OCCURRENCE_WORD.test(ws[j] ?? '') || (ws[j] === 'se' && /^(?:hace|hacen|hara|haran|movio|cambio|mudo|paso|corrio|adelanto|atraso|reprogramo|suspendio|cancelo|pospuso|aplazo)$/.test(ws[j + 1] ?? ''));
  for (let k = 0; k < ws.length; k++) {
    if (EVENT_TOKEN_WORD.test(ws[k])) {
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
      if (EVENT_TOKEN_WORD.test(ws[j] ?? '')) return true;
    }
  }
  return false;
}
