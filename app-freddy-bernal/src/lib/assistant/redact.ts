// What a person writes passes through here BEFORE it goes to an AI provider and before it
// is stored ("Lo que preguntan", the conversation). Emails, phone numbers, times, dates and
// addresses become placeholders, so an event's date, time or place typed by mistake never
// leaves the server.

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

type Kind = 'contact' | 'when' | 'date' | 'place';

// Addresses: a street word followed by a number or a Name («calle 3», «carrera 5 con calle 7»,
// «av. Libertador», «sector La Ermita», «casa N° 12», «km 8», «piso 2»). A street word alone or
// before an ordinary word («la vía de publicar», «el sector salud», «la casa comunal») stays, and so
// do «vía WhatsApp» (only «vía a/al/hacia…» is a road) and «el sector Salud». Only abbreviations take
// a period («av. Libertador»): «la calle. Mañana…» is a sentence end.
// Street words match in any case; the Name needs its capital (no «i» flag: it would fold \p{Lu}).
const ci = (w: string) =>
  w.replace(/[a-z]/g, (c) => `[${c}${c.toUpperCase()}${({ a: 'áÁ', e: 'éÉ', i: 'íÍ', o: 'óÓ', u: 'úÚ' } as Record<string, string>)[c] ?? ''}]`);
const words = (list: string) => `(?:${list.split(' ').map(ci).join('|')})`;
const ABBR = String.raw`${words('avda av cra urb edif apto km')}\.?`;
const WITH_NUMBER = String.raw`(?:${words('calles calle carreras carrera avenidas avenida transversal diagonal vereda pasaje callejon prolongacion autopista carretera troncal via sector urbanizacion barrio edificio torre quinta local apartamento piso manzana parcela casa kilometro')}|${ABBR})`;
const WITH_NAME = String.raw`(?:${words('calle carrera avenida transversal vereda pasaje callejon prolongacion autopista carretera troncal sector urbanizacion barrio caserio aldea residencias edificio')}|${words('avda av cra urb edif')}\.?|${words('via')}\s+${words('a al hacia para')})`;
const WITH_ARTICLE = String.raw`(?:${words('sector barrio urbanizacion caserio aldea avenida residencias quinta')}|${words('avda av urb')}\.?)`;
// Capitalized words that follow a street word without being a place: networks, apps, fields.
const NOT_PLACE = words('whatsapp instagram facebook tiktok telegram drive youtube threads twitter gmail zoom meet salud educacion publico publica privado privada comercio cultura deporte deportes turismo agricola electrico social productivo version');
const START = String.raw`(?<![\p{L}\d])`;
const END = String.raw`(?![\p{L}\d])`;
// «15-B» or «15B» (not «10K», a race).
const NUMBER = String.raw`\d+(?:-?[a-jl-zA-JL-Z])?${END}`;
const NUMBER_MARK = String.raw`(?:(?:[nN](?:[°º]|[rR][oO]\.?|[oO]\.)|[nN][uú]mero|#)\s*)?`;
const NAME = String.raw`(?:(?:de|del|la|las|los|el|a|al)\s+)*(?!${NOT_PLACE}${END})\p{Lu}\p{L}*(?:\s+(?:(?:de|del|la|las|los|el|y)\s+)*\p{Lu}\p{L}*)*`;
const PLACE_RULES: RegExp[] = [
  // «calle 3», «carrera 5 con calle 7», «casa N° 12-34», «casa 15-B», «km 8», «entre carreras 3 y 4».
  new RegExp(
    String.raw`${START}${WITH_NUMBER}\s*${NUMBER_MARK}${NUMBER}(?:\s*(?:con|y|entre|esquina(?:\s+con)?|esq\.?|[-/#])\s*(?:(?:${words('calles calle carreras carrera avenidas avenida')}|${words('av cra')}\.?)\s*)?${NUMBER})*`,
    'gu',
  ),
  // «av. Libertador», «sector El Mirador», «vía a San Cristóbal», «urbanización Los Pinos».
  new RegExp(String.raw`${START}${WITH_NAME}\s+${NAME}`, 'gu'),
  // Written in lower case, with its article: «sector la ermita», «barrio el carmen», «quinta La Esperanza».
  new RegExp(String.raw`${START}${WITH_ARTICLE}\s+(?:[lL]a|[eE]l|[lL]os|[lL]as|[sS]an|[sS]anta|[sS]anto)\s+\p{L}+${END}`, 'gu'),
];

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
  ...PLACE_RULES.map((re): [RegExp, Replacer, Kind] => [re, '[direccion]', 'place']),
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
  return apply(text, ['contact', 'date', 'when', 'place']);
}

/**
 * redact() on every string inside a value (objects and arrays walked, keys kept): what a tool
 * returns, before it goes to an AI provider. With keepTimes, times of day stay (the best hours
 * to publish are not the agenda); dates, addresses and contacts go all the same.
 */
export function redactDeep(value: unknown, o: { keepTimes?: boolean } = {}): unknown {
  const kinds: Kind[] = o.keepTimes ? ['contact', 'date', 'place'] : ['contact', 'date', 'when', 'place'];
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return apply(v, kinds);
    if (v instanceof Date) return '[fecha]';
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(value);
}

/** True when the text carries something that looks like a date or a time of day. */
export function hasDateOrTime(text: string): boolean {
  return apply(text, ['date', 'when']) !== String(text ?? '');
}

/** True when the text carries something that looks like a date (times of day don't count). */
export function hasDate(text: string): boolean {
  return apply(text, ['date']) !== String(text ?? '');
}

/** True when redact() would change something (the text carried a time, date, email, phone or address). */
export function hasSensitive(text: string): boolean {
  return redact(text) !== String(text ?? '');
}
