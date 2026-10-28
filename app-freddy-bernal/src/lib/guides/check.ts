// The rules the help content keeps (R3, design §7.2, U16, U17), shared by the tests and the docs script: no concrete
// date or time, no phone, and every «…» is a label that exists on a screen. Data and pure functions only.
//
// «» is ONLY for what the screen says (buttons, tabs, menus, titles). Quotes and examples go with “ ” («escribe “lo
// antes posible”»). Each «…» of the guides and the tutorials must be found as text in src/ outside src/lib/guides/, or
// match one of LABEL_PATTERNS (the counted ones: «Aprobar todas las verdes (n)»), or be in LABEL_ALLOW.
import { hasConcreteDateTime, hasMap } from '../domain/chat';
import { phonesIn } from '../domain/phones';

/**
 * A concrete date or time (U17): a date with a number («30/10», «30 de octubre»), a clock time («9:00», «10 am»),
 * «a las N», or the exact place (a map link, coordinates). Words that describe a routine («cada mañana», «el lunes»,
 * «esta tarde») are fine: they are not the agenda. Only for the guides and the tutorials; the messages and the seeds
 * keep their own, stricter detectors.
 */
export function concreteDateTime(text: string): boolean {
  return hasConcreteDateTime(text) || hasMap(text);
}

export function hasPhone(text: string): boolean {
  return phonesIn(text).length > 0;
}

/** The labels a text quotes with «…», at the top level: «Ver todo en «Por aprobar»» is one label, with its inner one. */
export function quotedLabels(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '«') {
      if (depth === 0) start = i + 1;
      depth++;
    } else if (c === '»' && depth > 0) {
      depth--;
      if (depth === 0) out.push(text.slice(start, i));
    }
  }
  return out;
}

/** Whether every «» of the text is closed (an open one hides the rest of the text from the label check). */
export function balancedQuotes(text: string): boolean {
  let depth = 0;
  for (const c of text) {
    if (c === '«') depth++;
    else if (c === '»' && --depth < 0) return false;
  }
  return depth === 0;
}

// The counted labels, written with «n» in the guides: each pattern says what the screen builds («Aprobar todas las
// verdes (3)») and `source` is the piece of code that builds it, which must still be in src/ (the test checks it).
export const LABEL_PATTERNS: { re: RegExp; source: string }[] = [
  { re: /^Aprobar todas las verdes \(n\)$/, source: 'Aprobar todas las verdes (${n})' },
  { re: /^Programar en n redes$/, source: 'Programar en ${' },
  { re: /^Aprobar los n$/, source: 'Aprobar los {counts.draft}' },
  { re: /^Esperan tu decisión \(n\)$/, source: 'Esperan tu decisión (${' },
  { re: /^Por ponerle fecha \(n\)$/, source: 'Por ponerle fecha (${' },
  { re: /^Piezas \(n\)$/, source: 'Piezas ({data.pieces.length})' },
  { re: /^Tweets \(n\)$/, source: 'Tweets ({data.tweets.length})' },
  { re: /^n tweets por aprobar$/, source: "'tweets por aprobar'" },
  { re: /^Quedan n días de tweets$/, source: 'Quedan ${stock.daysLeft} días de tweets' },
  { re: /^Falló la publicación en…$/, source: 'Falló la publicación en ${' },
  { re: /^Publicada en n$/, source: 'Publicada en ' },
  { re: /^(?:7|30|90) días$/, source: '{d} días' },
];

// Labels the screens build in code in a way a plain search cannot find, or say only to some people. Keep it short.
export const LABEL_ALLOW: string[] = [
  // The chips of the review levels (src/lib/domain/review.ts builds them with an emoji in the select).
  'Verde',
  'Amarillo',
  'Rojo',
];

// First names and places of the demo seed: never in a guide or a tutorial (they describe the work, not the demo).
export const DEMO_WORDS: string[] = [
  'Daniela',
  'Yorman',
  'Kevin',
  'Mariela',
  'Rubén',
  'Elio',
  'Fabián',
  'Carla',
  'El Mirador',
  'La Quebrada',
  'Las Palmas',
  'La Ermita',
  'El Rincón',
  'Nuevo Amanecer',
];

// «toca» as an order (U6): the page stays still while a tutorial runs, so a step says «lo tocas cuando cierres el
// tutorial». Labels are left out first («Te toca aprobar» is the screen's).
const ORDER = /(?<!\b(?:te|le|les|me|nos)\s)\b(?:toca|tócal[oa]s?|pulsa|presiona|haz clic|dale clic)\b/i;
export function hasOrder(text: string): boolean {
  let plain = text;
  for (const l of quotedLabels(text)) plain = plain.replace(`«${l}»`, ' ');
  return ORDER.test(plain);
}
