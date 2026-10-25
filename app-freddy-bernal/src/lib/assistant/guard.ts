import 'server-only';
import { looksLikeDateTime } from '../push/text';
import { asksPlace, eventAt } from './brain';
import { carriesWhen, hasDate, hasDateOrTime, hasPlaceName, hasPlaceOrContact, neutralForChecks, redactKeepTimes, redactQuoted, redactStrict } from './redact';
import { plain, sentences } from './text';
import { NO_TITLES, namesTitle, type TitleSet } from './titles';

// The checks that keep an event's date, time, day, place and contacts out of what 360 prepares
// (a notice to a whole role) and out of what it is taught (scripts and fichas, which go to the AI
// provider). One place, used by both brains, by the tool and again when administration confirms.
// Nothing here runs at import time: brain.ts imports tools.ts, which imports this file.

// Who records or the boss: an event even without an event word («el jefe estará el sábado…», «Kevin
// graba la toma a las 9:30»).
const EVENT_SUBJECT = /\b(?:jefe|graba|graban|grabamos|grabara|grabaran|grabaremos|grabando|grabar|grabacion|grabaciones)\b/;
// An event's or an event place's placeholder («[[E1]]», «[[L1]]»), also as a model may alter it, and
// the scripts' title hueco («[titulo]», what «Así se contesta» leaves of a title).
const EVENT_TOKEN = /\[{1,2}\s*[EeLl]\s*\d{1,4}\s*\]{1,2}|\[titulo\]/;

/**
 * The text is about an event: an event word, an event's placeholder, or a title or event place this
 * person can see (whole, or by a name in it: «Tariba» for «Toma aérea Tariba»). With `subject`, also
 * who records or the boss.
 */
export function namesEvent(text: string, titles: TitleSet = NO_TITLES, o: { subject?: boolean } = {}): boolean {
  const t = String(text ?? '');
  return (
    eventAt(t) >= 0 ||
    EVENT_TOKEN.test(t) ||
    (!!o.subject && EVENT_SUBJECT.test(plain(t))) ||
    namesTitle(t, titles.events, { byName: true }) ||
    namesTitle(t, titles.places)
  );
}

// ---------------------------------------------------------------------------
// A notice to a whole role. It is not where the agenda goes: whatever it says, it carries no day,
// relative day, hour, part of the day, date, place or contact, except a when that is the team's own
// work («suban el material antes de las 3 pm», «hoy suben…», «suban hoy…», «mañana hay que subir…»).
// About an event (an event word, a title this person can see, the boss or who records), it also
// carries no place said by its name («en Pueblo Nuevo», «en la Hacienda El Trapiche»), no bare
// landmark («desde la plaza»), no loose number («arranca 8») and no question of where or whom to call.
// Matched on the notice folded (lower case, no accents), with the placeholders the rules leave.
// ---------------------------------------------------------------------------
// The team's verb as said to the team («suban», «revisan»), or «hay / tienen que» + its infinitive:
// a bare infinitive can be the event's («la feria va a terminar antes de las…»).
const TEAM_DOES = String.raw`(?:suban|suben|manden|mandan|envien|envian|revisen|revisan|carguen|cargan|aprueben|aprueban|publiquen|publican)(?:lo|la|los|las)?|entreguen|terminen|editen|corrijan|completen|tengan|(?:hay|tienen|tenemos|deben|debemos) (?:que )?(?:subir|mandar|enviar|revisar|cargar|aprobar|publicar|entregar|terminar|editar|corregir|completar|tener)`;
const EVENT_VERB = 'es|son|sera|seria|empiezan?|comienzan?|arrancan?|terminan?|dura|abre|cierra|sale|queda|quedo|pautad[ao]s?|movio|cambio|va|van';
const WEEKDAY = 'lunes|martes|miercoles|jueves|viernes|sabado|domingo';
const DAY = String.raw`pasado manana|manana|hoy|anoche|esta (?:noche|tarde)|${WEEKDAY}`;
// A deadline for the team: what the team does, then «antes de / hasta / para / a más tardar» + an hour
// or a day, in the same clause and with no event verb in between («suban todo, la feria es hasta las…»
// is the event's). The event's own hour or day is not one: nothing for the team before it.
const DEADLINE = new RegExp(
  String.raw`(?<=\b(?:${TEAM_DOES})\b(?:(?!\b(?:${EVENT_VERB})\b)[^.;!?])*)\b(?:antes del?|hasta(?: el)?|para(?: el)?|a mas tardar(?: el| a)?)\s+(?:las?\s+\[hora\]|(?:${DAY})\b)`,
  'g',
);
// A day said right next to the team's verb: «suban hoy», «hoy suben», «mañana hay que subir» (not
// «la feria de mañana suban…»: that day is the feria's).
const TEAM_DAY = new RegExp(String.raw`\b(?:${TEAM_DOES})\s+(?:mismo\s+)?(?:el\s+)?(?:${DAY})\b|(?<!\b(?:de|del|la|el)\s)\b(?:el\s+)?(?:${DAY})\s+(?:mismo\s+)?(?:${TEAM_DOES})\b`, 'g');
const DAY_LEFT = new RegExp(String.raw`\b(?:${DAY})\b`);
const DAY_WORDS = new RegExp(String.raw`\b(?:${DAY})\b`, 'g');
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const CONTACT_ASK = /\b(?:contactos?|telefono|numero|llamo|hablo|busco|recibe)\b/;

export type NoticeIssue = 'la fecha' | 'el día' | 'la hora' | 'el lugar' | 'los contactos';
const KINDS: NoticeIssue[] = ['la fecha', 'el día', 'la hora', 'el lugar', 'los contactos'];

/** What a notice to a whole role carries that only the Agenda may (empty: it can go). */
export function noticeIssues(text: string, titles: string[] = []): NoticeIssue[] {
  const raw = String(text ?? '');
  const issues = new Set<NoticeIssue>();
  // Ratios, «Hoy» the screen, how long something takes («tienen 24 h») and counts first; then every
  // rule but the bare day words, which are judged here, next to the team's verb or not.
  const t = fold(redactStrict(neutralForChecks(raw))).replace(DEADLINE, ' ').replace(TEAM_DAY, ' ');
  if (/\[fecha\]/.test(t)) issues.add('la fecha');
  if (/\[hora\]/.test(t)) issues.add('la hora');
  if (/\[(?:numero|correo)\]/.test(t)) issues.add('los contactos');
  if (/\[direccion\]/.test(t)) issues.add('el lugar');
  if (DAY_LEFT.test(t)) issues.add('el día');
  // Whatever the rules above missed and the phone's guard sees («Toma 9.30»).
  if (looksLikeDateTime(t.replace(DAY_WORDS, ' '))) issues.add('la hora');
  if (namesEvent(raw, { events: titles, pieces: [], places: [] }, { subject: true })) {
    if (hasPlaceName(raw)) issues.add('el lugar');
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
  return `Ese aviso trae ${listOf(issues)}, y un aviso a todo un rol no lo lleva: lo de los eventos solo va en la Agenda. Un plazo para el trabajo del equipo sí puede ir. Dilo así y lo preparo.`;
}

// ---------------------------------------------------------------------------
// What 360 is taught (scripts and fichas): it goes to the AI provider in every matching turn.
// ---------------------------------------------------------------------------
export const DATES_MESSAGE = 'Quita las fechas: lo que sabe el asistente va al proveedor de IA y la agenda nunca sale de aquí.';
export const CONTACTS_MESSAGE = 'Quita los teléfonos, correos y direcciones: lo que sabe el asistente va al proveedor de IA.';
export const EVENT_WHEN_MESSAGE = 'Si habla de un evento, quítale la hora y el día: la agenda nunca sale de aquí.';

/**
 * Why this can't be taught to 360, or null. `said` is what 360 says or knows (a script's answers, a
 * ficha's title and body); `asked` is what a person asks (a script's topic); `titles`, the event
 * titles the admin can see. Times alone are fine (tweet slots, best hours). A ficha (`whole`) is
 * judged whole: if any part of it names an event (an event word, a title, who records, the boss), no
 * time or day of any kind anywhere in it. A script is judged sentence by sentence, the same way. In
 * what a person asks («Persona: ¿a qué hora es el evento de mañana?») only a written date or time
 * counts: a question is not a fact.
 */
export function teachingProblem(o: { said: string[]; asked?: string[]; titles?: string[]; whole?: boolean }): string | null {
  const all = [...o.said, ...(o.asked ?? [])].filter(Boolean);
  if (all.some((p) => hasDate(p))) return DATES_MESSAGE;
  if (all.some((p) => hasPlaceOrContact(p))) return CONTACTS_MESSAGE;
  const set: TitleSet = { events: o.titles ?? [], pieces: [], places: [] };
  const about = (s: string) => namesEvent(s, set, { subject: true });
  if (o.whole) {
    const text = o.said.join('\n');
    return about(text) && carriesWhen(text) ? EVENT_WHEN_MESSAGE : null;
  }
  const lines = [...o.said.flatMap((p) => p.split('\n')), ...(o.asked ?? []).map((p) => `Persona: ${p}`)];
  for (const line of lines) {
    const isAsked = /^\s*persona\s*:/i.test(line);
    // «Si dice «…» → [ASISTENTE]: …»: what the person says goes, the answer is checked.
    const text = line.replace(/^\s*si\s+dice\s+«[^»]*»\s*(?:→|->)?\s*/i, '');
    for (const s of sentences(text)) {
      if (!about(s)) continue;
      if (isAsked ? hasDateOrTime(neutralForChecks(s)) : carriesWhen(s)) return EVENT_WHEN_MESSAGE;
    }
  }
  return null;
}

/**
 * The safety net for what the team wrote, when it goes into the prompt (titles already placeholders):
 * scripts lose every date, time, day, place and contact (redactQuoted). A team ficha that names an
 * event anywhere (an event word, a title's placeholder or a name in a title the person can see, who
 * records, the boss) is scrubbed the same way,
 * title and body; one that names none keeps its times (tweet slots, best hours) and loses dates,
 * places and contacts. Factory and platform material keeps its wording.
 */
export function scrubTeamScript(text: string): string {
  return redactQuoted(text);
}

export function scrubTeamFicha(title: string, body: string, titles: TitleSet = NO_TITLES): [string, string] {
  const scrub = namesEvent(`${title}\n${body}`, titles, { subject: true }) ? redactQuoted : redactKeepTimes;
  return [scrub(title), scrub(body)];
}
