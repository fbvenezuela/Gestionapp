// Personal data in the old site's texts (docs/diagnostico.md, problem 8: Gmail addresses inside 18 articles; some
// carry phone numbers too): the importer takes them out and leaves a mark that says what was there («[correo
// retirado]», src/lib/web/import-marks.ts), and the item is flagged for a person to review. Nothing found here is ever
// printed or saved: the report counts, never shows.
//
//   * Emails: name@domain.tld, also written «name (arroba) domain.com» or «name [at] domain.com».
//   * Phones: the platform's own detector (src/lib/domain/phones.ts: Venezuelan ways of writing them, never an amount
//     with dots or a date), narrowed to the shapes of a real number — an area code 02xx, a mobile 04xx, 0800/0500, or
//     an international +… — so a year range («2019-2025») or an article's figures are never taken for one.
//   * ID card numbers of people (V- or E-, or after «C.I.» / «cédula»): «V-12.345.678», «C.I. 12345678».
// Pure.
import { phonesIn } from '../../src/lib/domain/phones';
import { REMOVED_MARKS } from '../../src/lib/web/import-marks';

export type PiiCounts = { emails: number; phones: number; ids: number };
export const noPii = (): PiiCounts => ({ emails: 0, phones: 0, ids: 0 });
export const addPii = (a: PiiCounts, b: PiiCounts) => {
  a.emails += b.emails;
  a.phones += b.phones;
  a.ids += b.ids;
};
export const piiTotal = (c: PiiCounts) => c.emails + c.phones + c.ids;

const LOCAL = "[A-Za-z0-9._%+'-]+";
const LABEL = '[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?';
const AT = String.raw`(?:@|\s*[\[(](?:at|arroba)[\])]\s*)`;
const DOT = String.raw`(?:\.|\s*[\[(](?:dot|punto)[\])]\s*)`;
const EMAIL = new RegExp(`(?<![A-Za-z0-9._%+-])${LOCAL}${AT}${LABEL}(?:${DOT}${LABEL})*\\.[A-Za-z]{2,24}(?![A-Za-z0-9-])`, 'gi');

// A Venezuelan number, by its digits: 02xx (landline), 04xx (mobile), 0800/0500, written with its 0 or with the 58
// (a bare 10-digit run without either is more often a reference or an amount than a phone).
const VE_PHONE = /^(?:58|0)(?:2\d{2}|4[12]\d|80\d|50\d)\d{7}$/;

export function isRealPhone(candidate: string): boolean {
  const digits = candidate.replace(/\D/g, '');
  if (candidate.trim().startsWith('+')) return digits.length >= 8 && digits.length <= 15;
  return VE_PHONE.test(digits);
}

/** The phones written in a text (as written), only the ones shaped like a real number. */
export function realPhonesIn(text: string): string[] {
  return phonesIn(text).filter(isRealPhone);
}

// «V-12.345.678», «E-81234567», «V 12345678» (the letter, a separator, 6 to 8 digits with or without dots).
const ID_LETTER = /(?<![\p{L}\p{N}])[VvEe]\s?[-.]?\s?\d{1,2}(?:\.?\d{3}){2}(?![\p{N}])/gu;
// «C.I. 12.345.678», «cédula de identidad N° V-12345678», «cedula 12345678»: the keyword stays, the number goes.
const ID_WORD = /((?:\bC\.\s?I\.?|\bc[ée]dula(?:\s+de\s+identidad)?)(?:\s*(?:n[°º.o]?|nro\.?|número|numero))?\s*:?\s*)((?:[VvEe]\s?[-.]?\s?)?\d{1,2}(?:\.?\d{3}){2})(?![\p{N}])/giu;

function replaceAll(text: string, find: string, mark: string): string {
  return find ? text.split(find).join(mark) : text;
}

/** A text without emails, phones or ID numbers, each replaced by its mark, and how many of each went. */
export function scrubText(text: string): { text: string; found: PiiCounts } {
  const found = noPii();
  if (!text) return { text, found };
  let out = text.replace(EMAIL, () => {
    found.emails++;
    return REMOVED_MARKS.email;
  });
  out = out.replace(ID_WORD, (_m, word: string) => {
    found.ids++;
    return `${word}${REMOVED_MARKS.id}`;
  });
  out = out.replace(ID_LETTER, () => {
    found.ids++;
    return REMOVED_MARKS.id;
  });
  // The detector reads the text in NFKC; a phone it returns is searched as written, then in that form.
  for (const phone of realPhonesIn(out)) {
    const before = out;
    out = replaceAll(out, phone, REMOVED_MARKS.phone);
    if (out === before) out = replaceAll(out.normalize('NFKC'), phone, REMOVED_MARKS.phone);
    if (out !== before) found.phones++;
  }
  return { text: out, found };
}

/** Whether a link carries personal data in itself (mailto:, tel:, WhatsApp, an email or a phone inside the address). */
export function hrefCarriesPii(href: string): keyof PiiCounts | null {
  const h = href.trim();
  if (/^mailto:/i.test(h)) return 'emails';
  if (/^(?:tel|sms|callto|whatsapp):/i.test(h)) return 'phones';
  let decoded = h;
  try {
    decoded = decodeURIComponent(h);
  } catch {
    // keep it as written
  }
  if (/(?:^|\/\/)(?:wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com|web\.whatsapp\.com)\b/i.test(decoded)) return 'phones';
  if (new RegExp(EMAIL.source, 'i').test(decoded)) return 'emails';
  // A phone hidden in the address (…?phone=584141234567): only long digit runs, never an article's slug or an id.
  for (const run of decoded.match(/\+?\d[\d ().-]{8,}\d/g) ?? []) if (isRealPhone(run)) return 'phones';
  return null;
}
