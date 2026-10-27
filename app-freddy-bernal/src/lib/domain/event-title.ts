import { DateTime } from 'luxon';
import { TZ } from '@/lib/time';

// Event titles reach every role (Redes too), the notices and the phones: they never
// carry the event's when, which has its own fields (rule 4). Pure, so it can be tested; the actions
// (src/lib/actions/events.ts) pick the date to check against. Two kinds of check:
// - always refused, because they can only be a when (alwaysWhen):
//   · an hour: a clock (9:30, 3 pm, 21 hrs, 12 m), «la una», «las N» and two hours joined as a range
//     («de 8 a 12», «8-12», «entre 9 y 10»), unless something counted follows («a las 3 escuelas», «de 8 a
//     12 años», «entre 8 y 10 personas») or a month (then they are days: «8 a 12 de marzo»); with an hour
//     suffix (a las 12m, 8h a 12h) nothing is counted;
//   · a weekday, hoy, pasado mañana, esta noche, mediodía;
//   · a numeric date with its year (15/3/2027) or after «el» (el 28/10), and a written one with a year
//     that can be scheduled, last year to two ahead (15 de marzo de 2027); another number, or one
//     followed by what it counts, is not its year («19 de abril de 1810», «23 de Enero, 1500 bolsas»);
// - refused when it is the event's own date (dateMentions): «23 de enero», «enero 23», «1.º de mayo»,
//   «23/1», «23-ene», «el 23», «mañana», every day of a list or span («8 al 12 de marzo», «los días 8
//   y 9»), and a capitalized day word followed by a name: Escuela Domingo Savio on a Sunday, Mañana
//   Deportiva the day before. A place named after a date («Barrio 23 de Enero») passes on any other
//   day. Whoever cannot see the event's date cannot add a new one either: checking it against the
//   date would tell them the date.
export const DATED = 'El título no lleva fecha ni hora: eso va en sus campos.';

// ---------------------------------------------------------------------------
// Always refused
// ---------------------------------------------------------------------------
const HOUR = String.raw`(?:0?[1-9]|1\d|2[0-3]|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)`;
const MIN = String.raw`(?:[:.][0-5]\d)?`;
// An hour's suffix: h, hrs, am/pm and the m of «12m». After it, never more letters or digits.
const SUFFIX = String.raw`h|hs|hrs|[ap]\.?\s?m\.?|m\.?`;
const NUM_END = String.raw`(${SUFFIX})?(?![\p{L}\d]|[.,]\d)`;
const ALWAYS: RegExp[] = [
  /(?<![\d.,:/])(?:[01]?\d|2[0-3])\s?[:h]\s?[0-5]\d(?![\d.,:])/iu,
  /(?<![\d.,])(?:(?:[01]?\d|2[0-3])\.[0-5]\d|(?:[01]\d|2[0-3])[0-5]\d)\s?(?:h|hs|hrs?|horas)(?!\p{L})/iu,
  /(?<!(?:^|\P{L})(?:de|por|durante|cada|en|unas|unos)\s+)(?<![\p{L}\d.,])(?:1[3-9]|2[0-3])\s?(?:h|hs|hrs?|horas)(?!\p{L})/iu,
  // 3 pm, 9:30 a.m. and noon written the Venezuelan way: 12 m, 12m.
  /(?<![\p{L}\d.,])(?:(?:[01]?\d|2[0-3])(?:[:.h][0-5]\d)?\s?[ap]\.?\s?|12(?:[:.]00)?\s?)m\.?(?![\p{L}\p{N}])/iu,
  new RegExp(String.raw`(?<![\p{L}\d.,])${HOUR}${MIN}\s+(?:y\s+(?:media|cuarto)|en\s+punto|(?:de|en|por)\s+la\s+(?:mañana|tarde|noche|madrugada))(?!\p{L})`, 'iu'),
  /(?<!\p{L})(?:mediod[ií]a|medianoche|hoy|pasado\s+mañana|est[ae]\s+(?:noche|tarde|mañana))(?!\p{L})/iu,
  /(?<!\p{L})(?:lun|mar|mi[eé]|jue|vie|s[aá]b|dom)\.?\s?(?:0?[1-9]|[12]\d|3[01])(?!\d)/iu,
  /(?<![\d.,/-])(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\s?([/.-])\s?\d{1,2}\s?\1\s?(?:\d{4}|\d{2}))(?!\d)/u,
];
// What follows an hour can be counted («las 3 escuelas»). What can follow an hour without being counted
// are the language's function words ending in -s (a closed class), verbs in -mos and the hour's own words.
const NOT_COUNTED = new Set(
  ('antes después despues tras pues mientras entonces además ademas apenas jamás jamas quizás quizas detrás detras atrás atras ' +
    'más mas menos todos todas ambos ambas unos unas los las les nos sus mis tus estos estas esos esas aquellos aquellas ' +
    'otros otras varios varias algunos algunas muchos muchas pocos pocas demás demas nosotros nosotras ustedes ellos ellas ' +
    'mismos mismas nuestros nuestras juntos juntas horas hrs hs exactas pasadas puntuales').split(' '),
);
const counted = (rest: string) => {
  const w = /^\s+(\p{L}+)/u.exec(rest)?.[1]?.toLowerCase();
  return !!w && w.endsWith('s') && !w.endsWith('mos') && !NOT_COUNTED.has(w);
};
// «la una» is always an hour; «las N» unless counted. Groups: 1 = «las», 2 = suffix.
const AT_HOUR = new RegExp(String.raw`(?<!\p{L})(?:la\s+(?:0?1|una)|(las)\s+${HOUR})${MIN}${NUM_END}`, 'giu');
// Two hours joined by «-», «a», «hasta» or «entre … y» are a range. Its ends differ («1 a 1» is not one),
// and a month after it makes them days (8 a 12 de marzo). Groups: 1 and 3 = the ends, 2 and 4 = suffixes.
const END = String.raw`(?:las\s+)?(${HOUR})${MIN}`;
const RANGES = [
  new RegExp(String.raw`(?<![\p{L}\d.,:/-])${END}(${SUFFIX})?(?:\s*[-–—]\s*|\s+(?:a|hasta)\s+)${END}${NUM_END}`, 'giu'),
  new RegExp(String.raw`(?<!\p{L})entre\s+${END}(${SUFFIX})?\s+y\s+${END}${NUM_END}`, 'giu'),
];
const sameHour = (a: string, b: string) => a.toLowerCase().replace(/^0/, '') === b.toLowerCase().replace(/^0/, '');
const WEEKDAY = /(?<!\p{L})(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bados?|domingos?)(?!\p{L})/giu;
// A capitalized day word followed by a name is a name too (Escuela Domingo Savio, Mañana Deportiva).
// Santo Domingo is always a name.
const SANTO_BEFORE = /(?<!\p{L})(?:santo|sto\.)\s+$/iu;
const NAME_AFTER = /^\s+(?!(?:De|Del|La|Las|El|Los|Y|En|A|Al)(?!\p{L}))\p{Lu}\p{Ll}/u;
const withName = (t: string, word: string, end: number) => {
  const after = t.slice(end);
  return NAME_AFTER.test(after) ? `${word}${/^\s+\p{L}+/u.exec(after)![0]}` : null;
};

// Titles are at most 140 characters (the action's schema). Longer text is never matched: the
// patterns are only meant, and only fast, for a title.
export const MAX_TITLE = 140;

export function alwaysWhen(t: string, now?: DateTime): boolean {
  if (t.length > MAX_TITLE) return false;
  if (ALWAYS.some((re) => re.test(t))) return true;
  const rest = (m: RegExpMatchArray) => t.slice(m.index! + m[0].length);
  for (const m of t.matchAll(AT_HOUR)) if (!m[1] || m[2] || !counted(rest(m))) return true;
  for (const re of RANGES) {
    for (const m of t.matchAll(re)) {
      if (!sameHour(m[1], m[3]) && (m[2] || m[4] || !(counted(rest(m)) || MONTH_AFTER.test(rest(m))))) return true;
    }
  }
  for (const m of t.matchAll(WEEKDAY)) {
    if (/^domingo$/i.test(m[0]) && SANTO_BEFORE.test(t.slice(0, m.index))) continue;
    if (m[0] === 'Domingo' && withName(t, m[0], m.index + m[0].length)) continue;
    return true;
  }
  return dateMentions(t, now).some((d) => d.always);
}

// ---------------------------------------------------------------------------
// Dates: refused on the event's own day
// ---------------------------------------------------------------------------
// A date a title names: `on` says whether it is a given day, `key` compares it with another title's,
// `name` says it may be a place's name (then the message points to «A dónde se va»).
export type DateMention = { text: string; key: string; on: (d: DateTime) => boolean; always: boolean; name: boolean };
const MONTH = 'ene(?:ro)?|feb(?:rero)?|mar(?:zo)?|abr(?:il)?|may(?:o)?|jun(?:io)?|jul(?:io)?|ago(?:sto)?|sep(?:t(?:iembre)?)?|set(?:iembre)?|oct(?:ubre)?|nov(?:iembre)?|dic(?:iembre)?';
const MONTH_NO: Record<string, number> = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12 };
// What joins a day to its month (23 de enero, 23 enero, 23-ene, 23/ene). Group 1 = the separator.
const TO_MONTH = String.raw`(\s+de\s+|\s+|\s?[/.-]\s?)(?:${MONTH})\.?(?!\p{L})`;
const MONTH_AFTER = new RegExp(`^${TO_MONTH}`, 'iu');
const DAY_NUM = String.raw`(?:0?[1-9]|[12]\d|3[01])(?:ro|ero|\.?[°º])?`;
// A day in words is its position + 1 (primero de mayo, quince de marzo).
const DAY_WORDS = ('primero|uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince diecis[eé]is ' +
  'diecisiete dieciocho diecinueve veinte veintiuno veintid[oó]s veintitr[eé]s veinticuatro veinticinco veintis[eé]is ' +
  'veintisiete veintiocho veintinueve treinta treinta\\s+y\\s+uno').split(' ');
const DAY_WORD = `(?:${[...DAY_WORDS].reverse().join('|')})`;
const dayOfWord = (w: string) => DAY_WORDS.findIndex((p) => new RegExp(`^(?:${p})$`, 'iu').test(w)) + 1;
// Days in a list or span share its month or article: «8, 9 y 10 de marzo», «8 al 12», «del 3 al 10».
const JOIN = String.raw`(?:\s*,\s*(?:y\s+)?|\s+(?:y|o|al|a|hasta)\s+(?:el\s+)?|\s*[-–—]\s*)`;
const list = (day: string) => `(${day}(?:${JOIN}${day})*)`;
const DAY_TOKEN = new RegExp(String.raw`(\d{1,2})(?:ro|ero|\.?[°º])?|(${DAY_WORD})`, 'giu');
const SPAN = /^\s*(?:[-–—]|(?:al|a|hasta)(?!\p{L}))/iu;
const ENTRE = /(?<!\p{L})entre\s+(?:el\s+)?$/iu;
// What joins two dates into a span: «al», «a», «hasta», a dash; after «entre», «y».
const JOINT = /^\s*(?:[-–—]\s*|(?:al|a|hasta)\s+(?:el\s+)?)$/iu;
const ENTRE_JOINT = /^\s+y\s+(?:el\s+)?$/iu;
// The days a list names, each one saying where it is written and if a span joins it to the one before
// (8 al 12, 8-12, entre 8 y 12): then it names the days between too.
const daysIn = (s: string, entre: boolean) => {
  const out: { day: number; at: number; span: boolean }[] = [];
  let end = -1;
  for (const d of s.matchAll(DAY_TOKEN)) {
    const span = end >= 0 && (SPAN.test(s.slice(end, d.index)) || (entre && out.length === 1));
    out.push({ day: d[1] ? +d[1] : dayOfWord(d[2]), at: d.index!, span });
    end = d.index! + d[0].length;
  }
  return out;
};
type Day = { day: number; month: number };
// The days strictly between two (wrapping the year end); a span longer than three months is not followed.
const between = (a: Day, b: Day): Day[] => {
  const start = DateTime.utc(2028, a.month, a.day); // a leap year: 29 de febrero exists
  let end = DateTime.utc(2028, b.month, b.day);
  if (!start.isValid || !end.isValid) return [];
  if (end < start) end = end.plus({ years: 1 });
  const out: Day[] = [];
  if (end.diff(start, 'days').days > 92) return out;
  for (let d = start.plus({ days: 1 }); d < end; d = d.plus({ days: 1 })) out.push({ day: d.day, month: d.month });
  return out;
};
// Day first (23 de enero, 1.º de mayo, quince de marzo, 23-ene) or month first (enero 23, oct. 28).
// Groups: 1 = the days, 2 = what joins them to the month; month first: 1 = month, 2 = the days.
const DAY_MONTH = new RegExp(String.raw`(?<![\p{L}\d.,])${list(`(?:${DAY_NUM}|${DAY_WORD})`)}${TO_MONTH}`, 'giu');
const MONTH_DAY = new RegExp(String.raw`(?<!\p{L})(${MONTH})\.?\s+${list(DAY_NUM)}(?![\p{L}\d]|[.,:]\d)`, 'giu');
// A year after the day and month makes it a date, if it is one that can be scheduled and nothing counted
// follows (19 de abril de 1810 is a commemoration, 23 de Enero 2000 familias a count).
const YEAR_AFTER = /^\s*[,/.-]?\s*(?:del?\s+)?(\d{4})(?!\d)/iu;
const yearAfter = (rest: string, now: DateTime) => {
  const y = YEAR_AFTER.exec(rest);
  return !!y && +y[1] >= now.year - 1 && +y[1] <= now.year + 2 && !counted(rest.slice(y[0].length));
};
// 23/1, 23-1; «8-12 de marzo» is a span of days, not December 8.
const NUMERIC = new RegExp(String.raw`(?<![\d.,/-])(0?[1-9]|[12]\d|3[01])\s?([/-])\s?(0?[1-9]|1[0-2])(?![\d]|[.,/-]\d)`, 'gu');
// «el 23», «del 1ro», «día 8», «los días 8 y 9», «del 8 al 12» and a bare «8 al 12».
const DAY_ONLY = new RegExp(
  String.raw`(?<!\p{L})(?:(?:el|del|al)\s+(?:d[ií]a\s+)?|d[ií]a\s+|los\s+d[ií]as\s+|(?<![\d.,:/-])(?=${DAY_NUM}\s+al\s+${DAY_NUM}(?![\p{L}\d])))${list(DAY_NUM)}(?![\p{L}\d%°º]|\s?[/.-]\s?\d|${TO_MONTH})`,
  'giu',
);
// A bare «N al M» after something counted or numbered is not days: «torres 1 al 4», «km 8 al 12».
const NUMBERED = new Set('km kms m mts metro metros kilometro kilometros n nro no numero torre bloque manzana edificio etapa fase modulo piso casa lote parcela'.split(' '));
const WORD_BEFORE = /(\p{L}+)\.?°?\s+$/u;
function numberedWork(before: string, match: string): boolean {
  if (!/^\d/.test(match)) return false;
  const w = WORD_BEFORE.exec(before)?.[1]?.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  if (!w) return false;
  return NUMBERED.has(w) || (w.endsWith('s') && w !== 'dias' && !NOT_COUNTED.has(w));
}
const TOMORROW = /(?<!\p{L})mañana(?!\p{L})/giu;
// «la mañana», «cada mañana» are the morning; «pasado mañana» and «esta mañana» are always refused.
const NOUN_BEFORE = /(?<!\p{L})(?:la|una|un|el|cada|toda|esa|aquella|en|por|buena|media|esta|pasado)\s+$/iu;
const DATE_ARTICLE = /(?<!\p{L})(?:el|del|al|d[ií]a)\s+$/iu;
const SUNDAY_NAME = /(?<!\p{L})Domingo(?!\p{L})/gu;

const dayMonth = (text: string, day: number, month: number, always = false, name = false): DateMention => ({
  text, key: `${day}/${month}`, on: (d) => d.day === day && d.month === month, always, name,
});
const monthNo = (m: string) => MONTH_NO[m.slice(0, 3).toLowerCase()];

export function dateMentions(t: string, now: DateTime = DateTime.now().setZone(TZ)): DateMention[] {
  const out: DateMention[] = [];
  if (t.length > MAX_TITLE) return out;
  const after = (m: RegExpMatchArray) => t.slice(m.index! + m[0].length);
  const entre = (m: RegExpMatchArray) => ENTRE.test(t.slice(0, m.index));
  // Day first. The last day may be a place's name (Barrio 23 de Enero) and gets the hint; a list is
  // only dates. In a span a day after the next one is in the month before (28 al 2 de marzo), and a span
  // from the date before (del 28 de febrero al 2 de marzo) names the days between.
  let prev: { end: number; day: Day; entre: boolean } | null = null;
  for (const m of t.matchAll(DAY_MONTH)) {
    const toks = daysIn(m[1], entre(m));
    const always = yearAfter(after(m), now);
    const days: Day[] = [];
    for (let i = toks.length - 1, month = monthNo(m[0].slice(m[1].length + m[2].length)); i >= 0; i--) {
      if (toks[i + 1]?.span && toks[i].day > toks[i + 1].day) month = month === 1 ? 12 : month - 1;
      days[i] = { day: toks[i].day, month };
    }
    const joint = prev ? t.slice(prev.end, m.index) : '';
    if (prev && (JOINT.test(joint) || (prev.entre && ENTRE_JOINT.test(joint)))) {
      for (const b of between(prev.day, days[0])) out.push(dayMonth(m[0], b.day, b.month, always));
    }
    days.forEach((d, i) => {
      if (toks[i].span) for (const b of between(days[i - 1], d)) out.push(dayMonth(m[0], b.day, b.month, always));
      const last = i === days.length - 1;
      out.push(dayMonth(last ? m[0].slice(toks[i].at) : m[0], d.day, d.month, always, last && !/[/.-]/.test(m[2])));
    });
    prev = { end: m.index + m[0].length, day: days[days.length - 1], entre: entre(m) };
  }
  for (const m of t.matchAll(MONTH_DAY)) {
    const month = monthNo(m[1]);
    const toks = daysIn(m[2], entre(m));
    toks.forEach(({ day, span }, i) => {
      for (const d of [...(span ? between({ day: toks[i - 1].day, month }, { day, month }) : []), { day, month }]) {
        out.push(dayMonth(m[0], d.day, d.month, yearAfter(after(m), now)));
      }
    });
  }
  for (const m of t.matchAll(NUMERIC)) {
    if (MONTH_AFTER.test(after(m))) continue;
    out.push(dayMonth(m[0], +m[1], +m[3], DATE_ARTICLE.test(t.slice(0, m.index))));
  }
  // Without a month a span counts the days as if it crossed a 31-day month when it goes back (del 28 al 2).
  for (const m of t.matchAll(DAY_ONLY)) {
    if (numberedWork(t.slice(0, m.index), m[0])) continue;
    const toks = daysIn(m[1], entre(m));
    toks.forEach(({ day, span }, i) => {
      const from = toks[i - 1]?.day ?? 0;
      const gap = span && from !== day ? between({ day: from, month: 1 }, { day, month: from < day ? 1 : 2 }) : [];
      for (const n of [...gap.map((b) => b.day), day]) out.push({ text: m[0], key: String(n), on: (d) => d.day === n, always: false, name: false });
    });
  }
  const tomorrow = now.plus({ days: 1 });
  for (const m of t.matchAll(TOMORROW)) {
    if (NOUN_BEFORE.test(t.slice(0, m.index))) continue;
    const name = m[0] === 'Mañana' ? withName(t, m[0], m.index + m[0].length) : null;
    out.push(dayMonth(name ?? m[0], tomorrow.day, tomorrow.month, false, !!name));
  }
  for (const m of t.matchAll(SUNDAY_NAME)) {
    const name = SANTO_BEFORE.test(t.slice(0, m.index)) ? null : withName(t, m[0], m.index + m[0].length);
    if (name) out.push({ text: name, key: 'domingo', on: (d) => d.weekday === 7, always: false, name: true });
  }
  return out;
}

// A title naming the event's own date, or (when that date is hidden from the person) a date its
// stored title did not already name.
export function datedTitle(title: string, own: DateTime | null, before = '', now?: DateTime): DateMention | undefined {
  const named = dateMentions(title, now);
  if (own) return named.find((d) => d.on(own));
  const had = new Set(dateMentions(before, now).map((d) => d.key));
  return named.find((d) => !had.has(d.key));
}

export const datedMessage = (d: DateMention) => (d.name ? `${DATED} Si «${d.text}» es el nombre del sitio, ponlo en «A dónde se va».` : DATED);
