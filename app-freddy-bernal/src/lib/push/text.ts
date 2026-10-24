// Guard for every text that leaves the platform toward a phone (push) or into the digest.
// Notification titles/bodies are written without an event's date or time (rule 4); this is a
// second lock: anything that LOOKS like a date, a time or a phone number is removed.
// False positives (e.g. «versión 2.1») are fine: losing a detail is better than leaking one.

const MONTHS = 'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre';
const MONTHS_SHORT = 'ene|feb|mar|abr|may|jun|jul|ago|sept?|oct|nov|dic';
const WEEKDAYS = 'lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo';
const WEEKDAYS_SHORT = 'lun|mar|mi[eé]|jue|vie|s[aá]b|dom';
const L = 'a-záéíóúüñ'; // letters, for "not followed by a letter"
// Hours written in words («a las nueve», «a la una y media»).
const HOUR_WORDS = 'una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce';
const MINUTE_WORDS = 'media|cuarto|cinco|diez|quince|veinte|veinticinco|\\d{1,2}';
// «y media», «menos cuarto», «y 15», «en punto», «19h», «19 horas»
const AFTER_HOUR = `(?:\\s+(?:y|menos)\\s+(?:${MINUTE_WORDS}))?(?:\\s+en\\s+punto)?`;
const HOUR_SUFFIX = '(?:\\s*(?:h|hs|hrs?|horas?)\\.?)?';
const DAYPART = '(?:\\s+(?:de\\s+la\\s+)?(?:mañana|tarde|noche|madrugada))?';

const PATTERNS: RegExp[] = [
  // ISO date or date-time: 2026-10-24, 2026-10-24T13:00:00Z
  /\b\d{4}-\d{1,2}-\d{1,2}(?:[T\s]\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?/gi,
  // Phone numbers (site contacts), 10+ digits: 0414-1234567, +58 414 123 4567, (0276) 555-1234
  /\(?\+?\d(?:[\s().-]{0,2}\d){9,}/g,
  // Numeric dates: 24/10, 24-10-2026, 24.10.26
  /\b\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?\b/g,
  // Short weekday before a day number: «sáb 24»
  new RegExp(`(?<![${L}])(?:${WEEKDAYS_SHORT})\\.?\\s+(?=\\d)`, 'gi'),
  // Day + month: «24 de octubre de 2026», «24 oct», «24 de oct.», «25-oct», «25/oct/2026»
  new RegExp(`\\b\\d{1,2}(?:\\s+(?:de\\s+)?|\\s*[/.-]\\s*)(?:${MONTHS}|${MONTHS_SHORT})\\.?(?![${L}])(?:\\s+(?:del?\\s+)?\\d{4}|\\s*[/.-]\\s*\\d{2,4})?`, 'gi'),
  // Month + day: «octubre 24», «oct. 25», «oct 25»
  new RegExp(`(?<![${L}])(?:${MONTHS})\\s+\\d{1,2}\\b`, 'gi'),
  new RegExp(`(?<![${L}])(?:${MONTHS_SHORT})(?:\\.\\s*|\\s+)\\d{1,2}\\b`, 'gi'),
  // «a las 9», «desde las 8», «a las 9:30 p. m.», «a la 1 de la tarde», «a las 19h», «las 7 y media»
  new RegExp(`(?<![${L}])(?:a\\s+)?las?\\s+\\d{1,2}(?:(?::|h)\\d{2})?${HOUR_SUFFIX}(?:\\s*(?:a\\.?\\s?m|p\\.?\\s?m)\\.?)?${AFTER_HOUR}${DAYPART}(?![${L}\\d])`, 'gi'),
  // Hours in words: «a las nueve», «a la una y media», «a las ocho en punto de la noche»
  new RegExp(`(?<![${L}])(?:a\\s+)?las?\\s+(?:${HOUR_WORDS})${AFTER_HOUR}${DAYPART}(?![${L}])`, 'gi'),
  // Clock times: 9:30, 14h30, 9:30 a. m., 21:00 hrs
  new RegExp(`\\b\\d{1,2}(?::|h)\\d{2}(?:\\s*(?:a\\.?\\s?m\\.?|p\\.?\\s?m\\.?|hrs?\\.?|horas?)(?![${L}]))?`, 'gi'),
  // 9am, 9 p. m.
  new RegExp(`\\b\\d{1,2}\\s*(?:a\\.?\\s?m|p\\.?\\s?m)\\.?(?![${L}])`, 'gi'),
  // «nueve de la noche», «9 de la mañana» (no «las» before)
  new RegExp(`(?<![${L}\\d])(?:${HOUR_WORDS}|\\d{1,2})${AFTER_HOUR}\\s+de\\s+la\\s+(?:mañana|tarde|noche|madrugada)(?![${L}])`, 'gi'),
  // «19h», «19 horas», «19 hrs», «8hs»
  new RegExp(`\\b\\d{1,2}\\s*(?:h|hs|hrs?|horas?)\\.?(?![${L}\\d])`, 'gi'),
  // «de la mañana/tarde/noche», «mediodía», «medianoche»
  new RegExp(`(?<![${L}])(?:de\\s+la\\s+(?:mañana|tarde|noche)|mediod[ií]a|medianoche)(?![${L}])`, 'gi'),
  // Weekdays and relative days
  new RegExp(`(?<![${L}])(?:${WEEKDAYS}|pasado\\s+mañana|mañana|hoy|anoche|esta\\s+(?:noche|tarde))(?![${L}])`, 'gi'),
];

// Removes anything that looks like a date, a time or a phone number, and tidies the rest.
export function stripDateTime(s: string): string {
  let out = s ?? '';
  for (const re of PATTERNS) out = out.replace(re, ' ');
  return out
    .replace(/\(\s*[,;:·-]?\s*\)/g, ' ')
    .replace(/«\s*»/g, ' ')
    .replace(/\s+([,.;:!?»)])/g, '$1')
    .replace(/([«(¿¡])\s+/g, '$1')
    .replace(/([,;:·-]\s*){2,}/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,;:·.-]+|[\s,;:·-]+$/g, '')
    .trim();
}

function clip(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

// Final push text: guarded and short (phones cut long texts anyway).
export function pushText(title: string, body?: string): { title: string; body: string } {
  const t = clip(stripDateTime(title), 80) || 'Tienes un aviso nuevo';
  return { title: t, body: clip(stripDateTime(body ?? ''), 160) };
}

// True if the text still contains something that looks like a date, time or phone.
export function looksLikeDateTime(s: string): boolean {
  return PATTERNS.some((re) => {
    re.lastIndex = 0;
    const hit = re.test(s);
    re.lastIndex = 0;
    return hit;
  });
}
