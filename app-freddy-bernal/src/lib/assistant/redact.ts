// What a person writes passes through here BEFORE it goes to an AI provider and before it
// is stored ("Lo que preguntan", the conversation). Emails, phone numbers, times and dates
// become placeholders, so an event's date or time typed by mistake never leaves the server.

const MONTHS_FULL = 'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre';
const MONTHS_SHORT = 'ene|feb|mar|abr|may|jun|jul|ago|sept|sep|oct|nov|dic';
// A month, whole or short ("nov", "nov.", "dic"), never the start of another word ("marca", "dice").
const MONTH = String.raw`(?:${MONTHS_FULL}|(?:${MONTHS_SHORT})\.?)(?![a-záéíóúñ])`;
const WEEKDAYS = 'lunes|martes|mi[ée]rcoles|jueves|viernes|s[áa]bado|domingo';
// Hours written as words: "a las cinco", "la una y media".
const HOUR_WORDS = 'una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce';
const HOUR = String.raw`(?:\d{1,2}|${HOUR_WORDS})`;
const PART_OF_DAY = String.raw`de\s+la\s+(?:mañana|tarde|noche|madrugada)`;
// "a. m." / "p.m." / "pm" / "am" (with or without dots and spaces).
const MERIDIEM = String.raw`[ap]\.?\s?m\.?(?![a-záéíóúñ])`;
const NOT_LETTER = '(?![a-záéíóúñ])';

type Replacer = string | ((match: string, ...rest: unknown[]) => string);

// The replacer's last two arguments are always the offset and the whole text.
function where(rest: unknown[]): { offset: number; whole: string } {
  return { offset: rest.at(-2) as number, whole: rest.at(-1) as string };
}

// "9:16" is almost always the vertical video format, not a time (unless written "a las 9:16").
const timeOrRatio: Replacer = (m: string, ...rest: unknown[]) => {
  const { offset, whole } = where(rest);
  return m === '9:16' && !/las?\s+$/i.test(whole.slice(Math.max(0, offset - 6), offset)) ? m : '[hora]';
};

// Numbers that look like d/m but are sizes, ratios, versions or steps: "2.5 GB", "formato 4/5",
// "versión 1.2", "paso 1-2", "1-2 días", "24/7". Only possible days (1-31) and months (1-12).
const UNIT_AFTER = new RegExp(
  String.raw`^\s*(?:(?:gb|mb|kb|tb|px|fps|mbps|kbps|mp|hz|k|cm|mm|m|km|kg|seg|segundos?|s|min|minutos?|horas?|d[ií]as?|semanas?|meses|veces|millones?|mil|personas?)${NOT_LETTER}|%|x${NOT_LETTER})`,
  'i',
);
const NOT_DATE_BEFORE = /(?:versi[oó]n|v|pasos?|nivel|cap[ií]tulo|p[aá]gina|p[aá]g\.?|puntos?|formato|proporci[oó]n|relaci[oó]n|ratio|aspecto|tama[ñn]o|escala)\s*$/i;
const DATE_ARTICLE_BEFORE = /(?:\b(?:el|del|al|para|hasta|desde)|d[ií]a)\s+$/i;
const numericDate: Replacer = (m: string, ...rest: unknown[]) => {
  const { offset, whole } = where(rest);
  const [d, mo, y] = rest as [string, string, string | undefined];
  const day = Number(d);
  const month = Number(mo);
  if (day < 1 || day > 31 || month < 1 || month > 12) return m;
  if (y) return '[fecha]';
  const before = whole.slice(Math.max(0, offset - 16), offset);
  const after = whole.slice(offset + m.length, offset + m.length + 14);
  if (UNIT_AFTER.test(after) || NOT_DATE_BEFORE.test(before)) return m;
  if (m === '24/7' && !DATE_ARTICLE_BEFORE.test(before)) return m;
  return '[fecha]';
};

type Kind = 'contact' | 'when' | 'date';

const RULES: [RegExp, Replacer, Kind][] = [
  // Emails.
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[correo]', 'contact'],
  // Dates written out: "lunes 3 de noviembre", "3 de noviembre de 2026", "el 3 de nov", "3 nov", "3-nov".
  [new RegExp(String.raw`\b(?:(?:${WEEKDAYS})\s+)?\d{1,2}(?:\s+de\s+|\s*[-/.]\s*|\s+)${MONTH}(?:,?\s+(?:de|del)\s+\d{2,4}|\s*[-/.]\s*\d{2,4}|\s+\d{4})?`, 'gi'), '[fecha]', 'date'],
  // "noviembre 3", "dic 24", "dic. 24".
  [new RegExp(String.raw`\b${MONTH}\s*\d{1,2}\b`, 'gi'), '[fecha]', 'date'],
  // Weekday followed by a day number: "el lunes 3".
  [new RegExp(String.raw`\b(?:${WEEKDAYS})\s+\d{1,2}\b`, 'gi'), '[fecha]', 'date'],
  // ISO dates and numeric dates: 2026-10-24, 24/10, 24-10-2026, 24.10.26. Never a piece of a
  // longer chain of digit groups ("0414-555-12-34" is a phone number, caught whole below).
  [/(?<!\d[/.-]?)\b\d{4}-\d{1,2}-\d{1,2}\b(?![/.-]\d)/g, '[fecha]', 'date'],
  [/(?<!\d[/.-]?)\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b(?![/.-]\d)/g, numericDate, 'date'],
  // Times: 10:30, 10:30 a. m., 3 p. m., 3pm, 15 hrs, "las 10 y media", "cuatro de la tarde",
  // "a las cinco", "sobre las 7", "tipo 3", "al mediodía".
  [new RegExp(String.raw`\b\d{1,2}[:h]\d{2}(?:\s*${MERIDIEM})?`, 'gi'), timeOrRatio, 'when'],
  [new RegExp(String.raw`\b\d{1,2}\s*${MERIDIEM}`, 'gi'), '[hora]', 'when'],
  [/\b\d{1,2}\s*hrs?\b/gi, '[hora]', 'when'],
  [new RegExp(String.raw`\b${HOUR}\s+(?:y\s+(?:media|cuarto)(?:\s+${PART_OF_DAY})?|${PART_OF_DAY})${NOT_LETTER}`, 'gi'), '[hora]', 'when'],
  [new RegExp(String.raw`\b(a|desde|hasta|sobre|tipo|para)\s+(las?\s+)?${HOUR}(?:\s+y\s+(?:\d{1,2}|media|cuarto))?${NOT_LETTER}(?!\s*(?:[/.,:]\d))`, 'gi'), timeAfter, 'when'],
  // "de las dos a las cuatro": only as a range ("cuál de las dos" is not a time).
  [new RegExp(String.raw`\bde\s+las?\s+${HOUR}${NOT_LETTER}(?=\s+(?:a|hasta)\s+la)`, 'gi'), 'de las [hora]', 'when'],
  [new RegExp(String.raw`\bde\s+las?\s+\d{1,2}\b`, 'gi'), 'de las [hora]', 'when'],
  [/\b(?:al\s+)?(?:mediod[ií]a|medianoche)(?![a-záéíóúñ])/gi, '[hora]', 'when'],
  // Phone numbers: 0414-1234567, +58 414 123 45 67, (0276) 555 1234, 0414-555-12-34.
  [/\+?\d[\d ().-]{7,}\d/g, '[numero]', 'contact'],
];

// "a las 5" → "a las [hora]", "tipo cinco" → "tipo [hora]". Without "la(s)" only "tipo" counts:
// "a 5 minutos", "para 3 redes" or "sobre 2 piezas" are not times.
function timeAfter(m: string, ...rest: unknown[]): string {
  const [lead, las] = rest as [string, string | undefined];
  if (!las && lead.toLowerCase() !== 'tipo') return m;
  return `${lead} ${las ? `${las.trim()} ` : ''}[hora]`;
}

function apply(text: string, kinds: Kind[]): string {
  let out = String(text ?? '');
  for (const [re, to, kind] of RULES) {
    if (!kinds.includes(kind)) continue;
    out = typeof to === 'string' ? out.replace(re, to) : out.replace(re, to as (m: string) => string);
  }
  return out;
}

export function redact(text: string): string {
  return apply(text, ['contact', 'date', 'when']);
}

/** True when the text carries something that looks like a date or a time of day. */
export function hasDateOrTime(text: string): boolean {
  return apply(text, ['date', 'when']) !== String(text ?? '');
}

/** True when the text carries something that looks like a date (times of day don't count). */
export function hasDate(text: string): boolean {
  return apply(text, ['date']) !== String(text ?? '');
}

/** True when redact() would change something (the text carried a time, date, email or phone). */
export function hasSensitive(text: string): boolean {
  return redact(text) !== String(text ?? '');
}
