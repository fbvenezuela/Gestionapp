import 'server-only';
import { looksLikeDateTime } from '../push/text';
import { BOSS_NAMES, aboutEvent, asksPlace, eventIsSubject, eventSignals, mentionsEvent, namedTitleWords, placeAfterA, type EventSignal } from './events';
import { carriesDay, carriesHour, carriesWhen, hasDate, hasDateOrTime, hasPlaceName, hasPlaceOrContact, neutralForChecks, redactForTeam, redactKeepTimes, redactQuoted, redactStrict } from './redact';
import { plain, sentences } from './text';
import { ANY_TOKEN, NO_TITLES, Placeholders, type TitleSet } from './titles';

// What 360 prepares (a notice to a whole role) and what it is taught (scripts and fichas, which go to
// the AI provider): never an event's date, time, day, place or contacts. One place, used by both
// brains, by the tool and again when administration confirms. «About an event» is the shared detector
// (events.ts). Nothing here runs at import time.

const asSet = (t: TitleSet | string[] | undefined): TitleSet => (Array.isArray(t) ? { events: t, pieces: [], places: [] } : t ?? NO_TITLES);
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// ---------------------------------------------------------------------------
// A notice to a whole role. It is not where the agenda goes.
// - It never carries contacts, an address or a place by its name («al hotel Tamá», «a la casa comunal»).
// - If it names no event, its days and hours are the team's («suban el material antes de las 3 pm»,
//   «manden las fotos esta tarde»): they stay as they are; only a day with an hour that is not a
//   deadline is refused («el sábado a las 6, lleven baterías» is someone's agenda).
// - If it names an event (the shared detector), it goes only as a team instruction («suban…»,
//   «revisen…», «hay que…») and says nothing about the event itself. Every word of it, in every clause,
//   before and after the event, is the instruction: the team's verbs, the work and its tools, the
//   event's words and its titles' words (a title reaches every role), the little words and a few that
//   say how soon or how well; a deadline for the team's work is left out first («suban el material
//   antes de las 3 pm», «tienen hasta el mediodía», «hoy suben…»). Any other word says something of the
//   event («este finde hay feria», «Tamá: la feria», «noviembre trae feria», «… en Alto Verde», «la
//   feria es…»), and so does a place of an event by its name or a day, hour or contact left. Getting
//   ready for the event («tengan las cámaras listas antes de las 7») is the event's hour, not a deadline.
// Matched on the notice folded (lower case, no accents), with the placeholders the rules leave.
// ---------------------------------------------------------------------------
const VERBS = 'suban|suben|manden|mandan|envien|envian|revisen|revisan|carguen|cargan|aprueben|aprueban|publiquen|publican|editen|editan|corrijan|completen|terminen|entreguen|descarguen|programen|actualicen|guarden|tengan|graben|lleven|preparen|armen|hagan|pongan|usen|avisen|pidan|escriban|marquen|anoten|recuerden|eviten|borren|quiten|agreguen|verifiquen|confirmen|respondan|contesten|cambien|traigan|busquen|compartan';
const CLITIC = '(?:lo|la|los|las|le|les|me|nos)?';
// The team asked to do something: its verb («suban», «revisen»), or «hay / tienen / deben que…» + an
// infinitive, «les toca» + an infinitive.
const TEAM_INSTRUCTION = new RegExp(
  String.raw`\b(?:${VERBS})${CLITIC}\b|\b(?:hay|tienen|tenemos|deben|debemos|necesitamos)\b[^.;!?]{0,30}?\b(?:que|para)\s+[a-z]+(?:ar|er|ir)${CLITIC}\b|\b(?:deben|debemos|pueden|necesitan)\s+[a-z]+(?:ar|er|ir)${CLITIC}\b|\b(?:les|nos|te) toca\s+[a-z]+(?:ar|er|ir)${CLITIC}\b`,
);
// What the team hands in (a deadline is for this, not for getting ready for the event: «tengan el
// material…» is a deadline, «tengan las cámaras listas…» is the event's hour).
const WORK_OBJECT = String.raw`(?:(?:el|la|los|las|todo el|todos los|todas las)\s+)?(?:material|materiales|fotos?|videos?|piezas?|copies|copys?|tomas|storyboard|crudos?|archivos?|portadas?|tweets?|tanda)`;
const DELIVER = String.raw`tengan${CLITIC}\s+(?:listos?\s+|listas?\s+)?${WORK_OBJECT}|(?:suban|suben|manden|mandan|envien|envian|revisen|revisan|carguen|cargan|aprueben|aprueban|publiquen|publican|editen|editan|corrijan|completen|terminen|entreguen|descarguen|programen|actualicen)${CLITIC}|(?:hay|tienen|tenemos|deben|debemos) (?:que |para )?(?:subir|mandar|enviar|revisar|cargar|aprobar|publicar|entregar|terminar|editar|corregir|completar|programar|actualizar)${CLITIC}`;
const EVENT_VERB = 'es|son|sera|seria|empiezan?|comienzan?|arrancan?|terminan?|dura|abre|cierra|sale|queda|quedo|pautad[ao]s?|movio|cambio|va|van';
const WEEKDAY = 'lunes|martes|miercoles|jueves|viernes|sabado|domingo';
const DAY = String.raw`pasado manana|manana|hoy|anoche|esta (?:noche|tarde)|${WEEKDAY}`;
// A deadline: what the team hands in, then «antes de / hasta / para / a más tardar» + an hour or a day,
// in the same clause and with no event verb in between («suban todo, la feria es hasta las…» is the
// event's); or «tienen hasta…».
const DEADLINE = new RegExp(
  String.raw`(?<=\b(?:${DELIVER})\b(?:(?!\b(?:${EVENT_VERB})\b)[^.;!?])*)\b(?:antes del?|hasta(?: el)?|para(?: el)?|a mas tardar(?: el| a)?)\s+(?:(?:las?\s+)?\[hora\]|(?:${DAY})\b)|\b(?:tienen|tenemos|tienes)\s+hasta(?:\s+(?:el|las?))?\s+(?:\[hora\]|(?:${DAY})\b)`,
  'g',
);
// A day said right next to what the team hands in: «suban hoy», «hoy suben», «mañana hay que subir»
// (not «la feria de mañana suban…»: that day is the feria's).
const TEAM_DAY = new RegExp(String.raw`\b(?:${DELIVER})\s+(?:mismo\s+)?(?:el\s+)?(?:${DAY})\b|(?<!\b(?:de|del|la|el)\s)\b(?:el\s+)?(?:${DAY})\s+(?:mismo\s+)?(?:${DELIVER})\b`, 'g');
// In a notice that names no event, any deadline the team is given counts («tengan listo… antes de las 7»).
const TEAM_LEAD = String.raw`(?:${VERBS})${CLITIC}|(?:hay|tienen|tenemos|deben|debemos) (?:que |para )?[a-z]+(?:ar|er|ir)${CLITIC}`;
const ANY_DEADLINE = new RegExp(
  String.raw`(?<=\b(?:${TEAM_LEAD})\b[^.;!?]*)\b(?:antes del?|hasta(?: el)?|para(?: el)?|a mas tardar(?: el| a)?)\s+(?:(?:las?\s+)?\[(?:hora|fecha)\]|(?:${DAY})\b)|\b(?:tienen|tenemos|tienes)\s+hasta(?:\s+(?:el|las?))?\s+(?:\[(?:hora|fecha)\]|(?:${DAY})\b)`,
  'g',
);
// The work handed in at an hour («suban el material a las 3»): a deadline too.
const DELIVER_AT = new RegExp(String.raw`(?<=\b(?:${DELIVER})\b[^.;!?]*)\ba\s+las?\s+\[hora\]`, 'g');
const DAY_LEFT = new RegExp(String.raw`\b(?:${DAY})\b`);
const DAY_WORDS = new RegExp(String.raw`\b(?:${DAY})\b`, 'g');
const CONTACT_ASK = /\b(?:contactos?|telefono|numero|llamo|hablo|busco|recibe)\b/;
// The words a notice that names an event may have: the little words, the work and the team's tools, the
// team's verbs (and their infinitives after «hay que», «tienen que»…), the event's words, the boss by
// his role or name, a few that say how soon or how well, and what neutralForChecks() leaves of a count
// («los 3 copies» → «varios copies»).
const SMALL = new Set('de del la el los las lo un una unos unas y e o u a al en con para por sin su sus mi mis tu tus este esta estos estas ese esa esos esas eso esto que se le les me te nos ya si no todo toda todos todas cada mismo misma tambien'.split(' '));
const WORK = new Set('pieza piezas video videos material materiales copy copys copies storyboard foto fotos toma tomas reel reels tweet tweets tuit tuits tanda portada portadas version versiones archivo archivos crudo crudos final finales edicion clip clips historia historias publicacion publicaciones post posts carrusel miniatura miniaturas audio audios frase frases ficha fichas tecnica bloque bloques plano planos dron apoyo red redes instagram insta facebook tiktok threads twitter youtube drive whatsapp grupo carpeta enlace link plataforma app biblioteca pestana pantalla resultados metricas cifras datos texto textos guion subtitulos musica logo vertical horizontal formato camara camaras bateria baterias tripode tripodes microfono microfonos luces chaleco chalecos credencial credenciales carnet toldo toldos extension memoria memorias tarjeta tarjetas equipos supervision despacho grabacion secretaria administracion admin semaforo verde verdes amarillo amarilla amarillas rojo roja rojas color colores plantilla plantillas formula formulas voz cierre hashtag hashtags etiqueta etiquetas mencion menciones cambios comentarios observaciones correcciones chequeo'.split(' '));
const FILLER = new Set('listo lista listos listas cargado cargada cargados cargadas bien antes pronto posible urgente favor porfa gracias cuanto rato completo completa completos completas aprobado aprobada aprobados aprobadas editado editada editados editadas revisado revisada revisados revisadas orden puedan hola buenas equipo gente muchachos chicos atentos pendientes recordatorio importante ojo jefe varios varias proporcion inicio dos tres cuatro cinco seis siete ocho nueve diez'.split(' '));
const INFINITIVES = 'subir|mandar|enviar|revisar|cargar|aprobar|publicar|editar|corregir|completar|terminar|entregar|descargar|programar|actualizar|guardar|tener|grabar|llevar|preparar|armar|hacer|poner|usar|avisar|pedir|escribir|marcar|anotar|recordar|evitar|borrar|quitar|agregar|verificar|confirmar|responder|contestar|cambiar|traer|buscar|compartir';
const TEAM_WORD = new RegExp(String.raw`^(?:${VERBS}|${INFINITIVES})${CLITIC}$`);
const HELPERS = /\b(?:(?:hay|tienen|tenemos|deben|debemos|necesitamos) (?:que|para)|(?:les|nos|te) toca|deben|debemos|pueden|necesitan|necesitamos)\b/g;
const EVENT_WORD = /^(?:eventos?|actos?|actividad|actividades|agenda|jornadas?|entregas?|reunion|reuniones|recorridos?|inauguracion|inauguraciones|visitas?|ferias?|asambleas?|urbanismos?|caravanas?|cabildos?|conversatorios?|foros?|juramentacion|encuentros?|operativos?)$/;
const TOKEN_WORD = 'zzevento';

// A number word is a count only before what it counts («las tres piezas»); alone it is an hour
// («Suban las fotos de la feria, ocho.»).
const COUNT_WORD = new Set('dos tres cuatro cinco seis siete ocho nueve diez'.split(' '));

/** A word of the notice (folded, a deadline left out) that is not the team's instruction: it says something of the event. */
function saysMoreThanTheWork(t: string, named: Set<string>): boolean {
  const allowed = (w: string) => SMALL.has(w) || WORK.has(w) || FILLER.has(w) || TEAM_WORD.test(w) || EVENT_WORD.test(w) || w === TOKEN_WORD || named.has(w) || BOSS_NAMES.includes(w);
  const ws = t.replace(HELPERS, ' ').split(/[^a-z0-9]+/).filter(Boolean);
  return ws.some((w, k) => !allowed(w) || (COUNT_WORD.has(w) && !WORK.has(ws[k + 1] ?? '')));
}

// A sentence of a notice that names an event and asks the team for nothing says something of it
// («Suban las fotos de la feria. Escuela.»). A title as a heading before a colon is the same sentence.
const NOTICE_SENTENCES = /[.;!?\n]+/;
// «A las 6 lleven el dron»: an hour something happens at, not a deadline (unless it is for the work handed in).
const AT_HOUR = /\ba\s+las?\s+\[hora\]/;

export type NoticeIssue = 'la fecha' | 'el día' | 'la hora' | 'el lugar' | 'los contactos' | 'datos del evento';
/** A notice to a whole role is short; longer text is refused before any check runs on it. */
export const NOTICE_MAX = 500;
export const NOTICE_TOO_LONG = `Un aviso a todo un rol va corto: máximo ${NOTICE_MAX} letras.`;
const KINDS: NoticeIssue[] = ['la fecha', 'el día', 'la hora', 'el lugar', 'los contactos', 'datos del evento'];

/** What a notice to a whole role carries that only the Agenda may (empty: it can go). `titles`: what the person who prepares it can see. */
export function noticeIssues(text: string, titlesIn: TitleSet | string[] = NO_TITLES): NoticeIssue[] {
  const titles = asSet(titlesIn);
  const raw = String(text ?? '');
  const issues = new Set<NoticeIssue>();
  // Ratios, «Hoy» the screen, how long something takes («tienen 24 h») and counts first; then every rule
  // but the bare day words, which are judged here. A placeholder is an event's name, not a number.
  const strict = redactStrict(neutralForChecks(raw.replace(ANY_TOKEN, ` ${TOKEN_WORD} `)));
  const event = aboutEvent(raw, titles, { when: false });
  if (/\[(?:numero|correo)\]/.test(strict)) issues.add('los contactos');
  if (/\[direccion\]/.test(strict)) issues.add('el lugar');
  if (!event) {
    // A place by its name or a landmark is someone's agenda («lleven toldo a la casa comunal»).
    if (hasPlaceName(raw) || placeAfterA(raw, titles)) issues.add('el lugar');
    // No event named: a day alone or an hour alone is the team's («cambien su contraseña esta semana»,
    // «manden las fotos esta tarde», «antes de las 3 pm»). A day with an hour, past any deadline, is
    // someone's agenda («el sábado a las 6, lleven baterías»).
    const left = fold(strict).replace(ANY_DEADLINE, ' ').replace(TEAM_DAY, ' ');
    const day = /\[fecha\]/.test(left) || DAY_LEFT.test(left);
    if (day && (/\[hora\]/.test(left) || looksLikeDateTime(left.replace(DAY_WORDS, ' ')))) {
      issues.add(/\[fecha\]/.test(left) ? 'la fecha' : 'el día');
      issues.add('la hora');
    }
    // An hour something happens at («a las 6 lleven el dron»), not a deadline nor the work handed in at it.
    if (AT_HOUR.test(left.replace(DELIVER_AT, ' ')) && !PUBLISHING.test(plain(raw))) issues.add('la hora');
  } else {
    if (!TEAM_INSTRUCTION.test(fold(raw))) issues.add('datos del evento');
    // Each sentence that names the event asks the team for something.
    if (raw.split(NOTICE_SENTENCES).some((c) => c.trim() && mentionsEvent(c, titles) && !TEAM_INSTRUCTION.test(fold(c)))) issues.add('datos del evento');
    // Every word, a deadline left out (the words of the titles it names are fine, not every title the
    // person can see: «Suban las fotos de la feria. Escuela.»; an hour typed into one is not).
    const t = fold(strict).replace(DEADLINE, ' ').replace(TEAM_DAY, ' ');
    if (saysMoreThanTheWork(t, namedTitleWords(raw, titles.events))) issues.add('datos del evento');
    // An event's place by its name, outside a title said whole («… a Alto Verde», «de La Quebrada»).
    if (eventSignals(new Placeholders({ events: titles.events, pieces: [], places: [] }).mask(raw), titles).has('place')) issues.add('el lugar');
    if (/\[fecha\]/.test(t)) issues.add('la fecha');
    if (/\[hora\]/.test(t)) issues.add('la hora');
    if (DAY_LEFT.test(t)) issues.add('el día');
    // Whatever the rules above missed and the phone's guard sees («Toma 9.30»).
    if (looksLikeDateTime(t.replace(DAY_WORDS, ' '))) issues.add('la hora');
    if (hasPlaceName(raw) || placeAfterA(raw, titles)) issues.add('el lugar');
    if (asksPlace(raw)) issues.add(CONTACT_ASK.test(plain(raw)) ? 'los contactos' : 'el lugar');
    // A number left that is not a count, a deadline or a placeholder: «la feria arranca 8».
    if (/\d/.test(t.replace(/\[[a-z]+\]/g, ' '))) issues.add('la hora');
  }
  return KINDS.filter((k) => issues.has(k));
}

export function listOf(items: string[]): string {
  return items.length > 1 ? `${items.slice(0, -1).join(', ')} y ${items.at(-1)}` : items[0] ?? '';
}

/** What the tool says when a notice can't go, in plain words. */
export function noticeRefusal(issues: NoticeIssue[]): string {
  return `Ese aviso trae ${listOf(issues)}, y un aviso a todo un rol no lo lleva: lo de los eventos solo va en la Agenda. Si nombra un evento, solo le pide algo al equipo («suban el material de la feria»), y un plazo para ese trabajo sí puede ir. Dilo así y lo preparo.`;
}

// ---------------------------------------------------------------------------
// What 360 is taught (scripts and fichas): it goes to the AI provider in every matching turn. The
// team's fichas and scripts are for how the team works, never about one event.
// ---------------------------------------------------------------------------
export const DATES_MESSAGE = 'Quita las fechas: lo que sabe el asistente va al proveedor de IA y la agenda nunca sale de aquí.';
export const CONTACTS_MESSAGE = 'Quita los teléfonos, correos y direcciones: lo que sabe el asistente va al proveedor de IA.';
export const EVENT_WHEN_MESSAGE = 'Si habla de un evento, quítale la hora y el día: la agenda nunca sale de aquí.';
export const EVENT_NAMED_MESSAGE = 'Quita el evento: lo que sabe el asistente es cómo trabaja el equipo, no lo de un evento en particular (su nombre, su lugar o cuándo es). Va al proveedor de IA y la agenda nunca sale de aquí.';

// Publishing: its days and hours are the tweet slots and the best hours, not an event's.
const PUBLISHING = /\b(tweets?|tuits?|publica\w*|publique\w*|post\w*|reels?|historias|stories|instagram|insta|facebook|tiktok|threads|twitter|youtube|redes|mejor(?:es)? horas?|franjas?)\b/;
// A particular event: a title or an event's place the admin can see, or a title's placeholder (not the
// scripts' «[titulo]» hueco, which stands for any title).
const SPECIFIC: EventSignal[] = ['title', 'place'];
const TITLE_TOKEN = /\[{1,2}\s*[EeLl]\s*\d{1,4}\s*\]{1,2}/;
const namesOne = (s: string, set: TitleSet) => TITLE_TOKEN.test(s) || SPECIFIC.some((k) => eventSignals(s, set).has(k));

/**
 * Why this can't be taught to 360, or null. `said` is what 360 says or knows (a script's answers and
 * notes, a ficha's title and body); `asked` is what a person asks (a script's topic, and its «Persona:»
 * lines); `titles`, what the admin can see. Rejected:
 * - a date, a phone, an email or an address, anywhere;
 * - next to an event (the shared detector's mentions: an event word, a title, an event's place, a
 *   placeholder, the boss, who records), a time or a day of any kind: a ficha judged whole, a script
 *   sentence by sentence (in what a person asks only a written date or time counts: a question is not
 *   a fact);
 * - a day with an hour anywhere in what 360 says, unless it is about publishing (tweet slots, best hours);
 * - the shape of the agenda in a sentence of what 360 says (the shared detector's `agenda` with its
 *   `when`: a day or an hour with something happening, recording or a place by its name, «nos vamos de
 *   madrugada desde la gobernación»);
 * - a particular event: a title, a name or a run of capitalised words in one, two of its words in a row,
 *   an event's place, a placeholder, «lo de la cancha»; or an event that happens or that there is («el
 *   acto de entrega arranca…», «la feria es…», «en noviembre hay feria»).
 * Times alone are fine (tweet slots, best hours); so is talking of events in general («cómo se crea un
 * evento»).
 */
export function teachingProblem(o: { said: string[]; asked?: string[]; titles?: TitleSet | string[]; whole?: boolean }): string | null {
  const all = [...o.said, ...(o.asked ?? [])].filter(Boolean);
  if (all.some((p) => hasDate(p))) return DATES_MESSAGE;
  if (all.some((p) => hasPlaceOrContact(p))) return CONTACTS_MESSAGE;
  const set = asSet(o.titles);
  const about = (s: string) => mentionsEvent(s, set);
  // What 360 says (a script's answers and notes; the person's lines and «Si dice «…»» go with what is asked).
  const lines = o.whole ? [o.said.join('\n')] : o.said.flatMap((p) => p.split('\n'));
  const asks = [...(o.asked ?? [])];
  const knows: string[] = [];
  for (const line of lines) {
    if (!o.whole && /^\s*persona\s*:/i.test(line)) {
      asks.push(line);
      continue;
    }
    const quoted = /^\s*si\s+dice\s+«([^»]*)»\s*(?:→|->)?\s*/i.exec(line);
    if (quoted) asks.push(quoted[1]);
    knows.push(quoted ? line.slice(quoted[0].length) : line);
  }
  const said = knows.join('\n');
  if (o.whole ? about(said) && carriesWhen(said) : knows.some((l) => sentences(l).some((s) => about(s) && carriesWhen(s)))) return EVENT_WHEN_MESSAGE;
  if (asks.some((a) => sentences(a).some((s) => about(s) && hasDateOrTime(neutralForChecks(s))))) return EVENT_WHEN_MESSAGE;
  if (carriesDay(said) && carriesHour(said) && !PUBLISHING.test(plain(said))) return EVENT_WHEN_MESSAGE;
  // The agenda's shape in a sentence of what 360 says: a day or an hour with something happening,
  // recording or a place by its name («nos vamos de madrugada desde la gobernación»). Not in what is
  // about publishing (a network's video rules, the best hours).
  const agendaShape = (x: string) => {
    const g = eventSignals(x, set);
    return g.has('agenda') && g.has('when');
  };
  if (!PUBLISHING.test(plain(said)) && knows.some((l) => sentences(l).some(agendaShape))) return EVENT_NAMED_MESSAGE;
  if (namesOne(said, set) || asks.some((a) => namesOne(a, set)) || eventIsSubject(said, set)) return EVENT_NAMED_MESSAGE;
  return null;
}

/**
 * The safety net for what the team wrote, when it goes into the prompt (titles and place names already
 * placeholders): scripts lose every date, time, day, place and contact (redactQuoted, the same time
 * rules as every check). Team material about an event anywhere (the shared detector) also loses a place
 * said by its name («en el hotel Tamá»). A team ficha with neither an event nor a day keeps its times
 * (tweet slots, best hours) and loses dates, places and contacts. Factory and platform material keeps
 * its wording.
 */
export function scrubTeamScript(text: string, titles: TitleSet = NO_TITLES): string {
  return aboutEvent(text, titles, { when: false }) ? redactForTeam(text) : redactQuoted(text);
}

export function scrubTeamFicha(title: string, body: string, titles: TitleSet = NO_TITLES): [string, string] {
  const whole = `${title}\n${body}`;
  const scrub = aboutEvent(whole, titles, { when: false }) ? redactForTeam : carriesDay(whole) ? redactQuoted : redactKeepTimes;
  return [scrub(title), scrub(body)];
}
