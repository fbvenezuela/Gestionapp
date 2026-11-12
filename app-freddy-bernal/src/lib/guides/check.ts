// The rules the help content keeps (R3, design §7.2, U16, U17), shared by the tests and the docs script: no concrete
// date or time, no phone, and every «…» is a label that exists on a screen. Data and pure functions only.
//
// «» is ONLY for what the screen says (buttons, tabs, menus, titles). Quotes and examples go with “ ” («escribe “lo
// antes posible”»). Each «…» of the guides and the tutorials must be found as text in src/ outside src/lib/guides/, or
// match one of LABEL_PATTERNS (the counted ones: «Aprobar todas las verdes (2)»), or be in LABEL_ALLOW.
import { hasConcreteDateTime, hasMap } from '../domain/chat';
import { phonesIn } from '../domain/phones';

/**
 * A concrete date or time (U17): a date with a number («30/10», «30 de octubre»), a clock time («9:00», «10 am»),
 * «a las N», or the exact place (a map link, coordinates). Words that describe a routine («cada mañana», «el lunes»,
 * «esta tarde») are fine: they are not the agenda. Only for the guides and the tutorials; the messages and the seeds
 * keep their own, stricter detectors.
 */
export function concreteDateTime(text: string): boolean {
  return hasConcreteDateTime(withoutRatios(text)) || hasMap(text);
}

// The four shapes of a picture or a video («9:16 es vertical, 16:9 es horizontal y 4:5, casi cuadrado», «1:1»): «9:16»
// reads as a clock time, so they go out before the check, unless the text says it is an hour («a las 9:16», «las 9:16»,
// «9:16 am», «9:16 de la mañana»), which still fails. Only here: the messages and the seeds keep their own detectors.
const RATIO =
  /(?<![\p{L}\p{N}:])(?<!(?:^|[^\p{L}])(?:a|las?|desde|hasta|para|tipo)\s{1,3})(?:9:16|16:9|4:5|1:1)(?![\p{N}:])(?!\s*(?:[ap]\.?\s?m\.?(?![\p{L}])|h(?:s|rs?|oras?)?(?![\p{L}])|de(?:\s+la)?\s+(?:mañana|tarde|noche|madrugada)(?![\p{L}])|del?\s+d[ií]a(?![\p{L}])))/giu;
/** `text` without the screen ratios that are not an hour. */
export function withoutRatios(text: string): string {
  return (text ?? '').normalize('NFKC').replace(RATIO, ' ');
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

// The counted labels: the guides write them with an example number, as the screen shows them on a given day
// («Aprobar todas las verdes (2)», «5 personas», «Mes 1 · 8 de 8»; «Ayuda y guías» says the numbers change), and the old
// «n» still passes. Each pattern says what the screen builds and `source` is the piece of code that builds it, which must
// still be in src/ (the test checks it).
export const LABEL_PATTERNS: { re: RegExp; source: string }[] = [
  { re: /^Aprobar todas las verdes \((?:n|\d+)\)$/, source: 'Aprobar todas las verdes (${n})' },
  { re: /^Programar en (?:n|\d+) redes$/, source: 'Programar en ${' },
  { re: /^Aprobar los (?:n|\d+)$/, source: 'Aprobar los {counts.draft}' },
  { re: /^Esperan tu decisión \((?:n|\d+)\)$/, source: 'Esperan tu decisión (${' },
  { re: /^Por ponerle fecha \((?:n|\d+)\)$/, source: 'Por ponerle fecha (${' },
  { re: /^Piezas \((?:n|\d+)\)$/, source: 'Piezas ({data.pieces.length})' },
  { re: /^Tweets \((?:n|\d+)\)$/, source: 'Tweets ({data.tweets.length})' },
  { re: /^(?:n|\d+) tweets por aprobar$/, source: "'tweets por aprobar'" },
  { re: /^Quedan (?:n|\d+) días de tweets$/, source: 'Quedan ${stock.daysLeft} días de tweets' },
  { re: /^Falló la publicación en…$/, source: 'Falló la publicación en ${' },
  { re: /^(?:7|30|90) días$/, source: '{d} días' },
  // Redes by format (R4): the month tabs, the feed's live line, its places and the card's chip, and the section bar.
  { re: /^Mes (?:n|\d+) · (?:x|\d+) de (?:y|\d+)$/, source: '${label} · ${count} de ${quotaLabel}' },
  { re: /^(?:n|\d+) de 24 espacios ocupados en este mes$/, source: 'de ${FEED_SIZE} espacios ocupados en este mes' },
  { re: /^Espacio #(?:nn|\d{2})$/, source: 'Espacio #${' },
  { re: /^Ya en Mes (?:n|\d+) · #(?:n|\d+)$/, source: 'Ya en ${month} · #${n}' },
  { re: /^En Feed · Mes (?:n|\d+) #(?:n|\d+)$/, source: 'En Feed · ${month} #${n}' },
  { re: /^Movida al #(?:n|\d+)$/, source: 'Movida al #${n}' },
  { re: /^n\/m$/, source: '${c.reviewed}/${c.quota}' },
  // The feed's menu on a filled place: the places before and after it (feed-core.ts).
  { re: /^Publicar (?:antes|después) \(#\d+\)$/, source: 'Publicar antes (#${num - 1})' },
  // The summary of the month, with its name (month-summary.tsx, the boss's Inicio).
  { re: /^Resumen del mes · Mes \d+$/, source: 'Resumen del mes · ${monthLabel}' },
  // The level box of the review room (review-room.tsx), and a network that passes (new-publication.tsx).
  { re: /^Nivel (?:verde|amarillo|rojo)$/, source: 'Nivel {LEVELS[l].label.toLowerCase()}' },
  { re: /^Todo bien para \p{L}[\p{L} ]*\.$/u, source: 'Todo bien para {c.label}.' },
  // «Mi cuenta» on a home with two tutorials names each one (help-menu-items.tsx).
  { re: /^Ver el tutorial: (?:Bienvenida|Cómo [^«»]+)$/, source: 'Ver el tutorial: ${title}' },
  // Mensajes: how many are in a channel (peopleCount, src/components/chat/chat-core.ts).
  { re: /^(?:N|\d+) personas$/, source: '${n} personas' },
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
