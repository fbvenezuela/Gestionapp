// The SAME cases for the app's Mensajes text rules and the database's (20261028002400_internal_chat.sql):
//   * concrete: hasConcreteDateTime()  ⇔ public.text_has_concrete_datetime()  (E1: only concrete dates and times)
//   * map:      hasMap()               ⇔ public.chat_has_map()
//   * refs:     stripRefs()            ⇔ public.chat_strip_refs()
//   * codes:    stripTimecodes()       ⇔ public.chat_strip_timecodes()
//   * guard:    chatTextProblem() and chatAgendaClear()  ⇔  what chat_message_guard() does with a message.
// tests/unit/chat-text-rules.test.ts checks the JavaScript against them; tests/rls/chat.test.ts checks the SQL against
// them and compares both on the generated texts below. All data here is invented (the uuids too).
import type { DemoUserKey } from '@/lib/db/seed-demo';

export const UUID = '3f2b8c1e-5d4a-4e6b-9c7d-0a1b2c3d4e5f';

export const CONCRETE_CASES: { text: string; concrete: boolean }[] = [
  // Clock times, every way.
  { text: 'Nos vemos 10:30', concrete: true },
  { text: 'Llega 3 pm', concrete: true },
  { text: 'llega a las 3', concrete: true },
  { text: 'a las 3 de la tarde', concrete: true },
  { text: 'llega 3 de la tarde', concrete: true },
  { text: 'Acto 15h', concrete: true },
  { text: 'Acto 19 horas', concrete: true },
  { text: 'A LAS NUEVE', concrete: true },
  { text: 'se movió a la una y media', concrete: true },
  { text: 'al mediodía', concrete: true },
  { text: 'MEDIANOCHE', concrete: true },
  { text: 'el jueves a las 10', concrete: true },
  { text: 'mañana a las 9 en la plaza', concrete: true },
  { text: 'a las 2:15', concrete: true },
  { text: '2:15 pm', concrete: true },
  { text: 'en el 2:15 está la toma del dron', concrete: true },
  { text: '_jueves-10am', concrete: true },
  { text: '１０:３０', concrete: true },
  // Calendar dates.
  { text: 'el 12 de noviembre', concrete: true },
  { text: 'queda para el 12/11', concrete: true },
  { text: 'el 12-11-2026', concrete: true },
  { text: 'el 2026-11-12', concrete: true },
  { text: 'https://app.ejemplo.test/agenda?dia=2026-10-30', concrete: true },
  { text: 'sáb 24', concrete: true },
  { text: 'oct. 25', concrete: true },
  { text: '23 de enero', concrete: true },
  // False positives, accepted (a place named for a date, «a las 3 escuelas»).
  { text: 'Barrio 23 de Enero', concrete: true },
  { text: 'llevamos a las 3 escuelas', concrete: true },
  // Relative words: not concrete (the composer asks; the database lets them through).
  { text: '', concrete: false },
  { text: 'hoy', concrete: false },
  { text: 'mañana te mando la frase', concrete: false },
  { text: '¿mañana grabamos?', concrete: false },
  { text: 'Pasado mañana se ve', concrete: false },
  { text: 'esta tarde', concrete: false },
  { text: 'ESTA NOCHE', concrete: false },
  { text: 'el lunes', concrete: false },
  { text: 'Entrega el viernes', concrete: false },
  { text: 'el fin de semana', concrete: false },
  { text: 'las tomas de la mañana', concrete: false },
  { text: 'anoche quedó lista', concrete: false },
  { text: 'Escuela Domingo Savio', concrete: false },
  // Plain texts, and a phone (text_has_phone() checks those, not this rule).
  { text: 'Llamar al 0414-1234567', concrete: false },
  { text: 'Beneficiados: unas 1.200 personas', concrete: false },
  { text: 'Lluvia fuerte en la zona', concrete: false },
  { text: 'Mañanita de lluvia', concrete: false },
  { text: 'Hoyos en la vía de acceso', concrete: false },
  { text: 'Aprobadas 3 piezas verdes', concrete: false },
];

export const MAP_CASES: { text: string; map: boolean }[] = [
  { text: 'https://maps.google.com/?q=10.48,-66.87', map: true },
  { text: 'https://www.google.com/maps/place/Plaza', map: true },
  { text: 'https://www.google.co.ve/maps/@7.76,-72.22', map: true },
  { text: 'https://goo.gl/maps/AbC123', map: true },
  { text: 'https://maps.app.goo.gl/AbC123', map: true },
  { text: 'https://waze.com/ul?ll=7.7,-72.2', map: true },
  { text: 'https://maps.apple.com/?ll=7.7,-72.2', map: true },
  { text: 'https://www.openstreetmap.org/#map=18/7.7/-72.2', map: true },
  { text: 'GEO:7.76,-72.22', map: true },
  { text: '10.4806, -66.9036', map: true },
  { text: '7.7612,-72.2245', map: true },
  { text: '7°46\'12"N 72°13\'28"W', map: true },
  { text: 'Queda en 8C9X+2V', map: true },
  { text: '１０.４８０６, -６６.９０３６', map: true },
  // A false positive, accepted: two amounts written like coordinates.
  { text: 'entregamos 1.500, 2.000 bolsas', map: true },
  { text: '', map: false },
  { text: 'el mapa del sector va en la ficha', map: false },
  { text: 'La cancha de El Mirador', map: false },
  { text: 'https://x.com/maps', map: false },
  { text: 'geografía del sector', map: false },
  { text: 'Beneficiados: unas 1.200 personas', map: false },
  { text: 'Hace 30° de calor', map: false },
  { text: 'Sumamos 2+2', map: false },
];

// What stripRefs() leaves: only the exact in-app reference and the number of an X post go.
export const REF_CASES: { text: string; out: string }[] = [
  { text: `/eventos/${UUID}`, out: ' ' },
  { text: `Mira /eventos/${UUID}?tab=material`, out: 'Mira  ' },
  { text: `Mira /piezas/${UUID} y /aprobar/${UUID}`, out: 'Mira   y  ' },
  { text: `https://app.ejemplo.test/obras/${UUID}`, out: 'https://app.ejemplo.test ' },
  { text: `/EVENTOS/${UUID.toUpperCase()}`, out: ' ' },
  { text: `/mensajes/${UUID}?tab=a&ver=b`, out: ' ' },
  { text: `/eventos/${UUID}_jueves-10am`, out: ' _jueves-10am' },
  { text: `/municipios/${UUID}`, out: `/municipios/${UUID}` },
  { text: '/eventos/041455512340414555123404145551234041', out: '/eventos/041455512340414555123404145551234041' },
  { text: 'https://x.com/redesfb/status/1849204857203948573', out: 'https://x.com/redesfb ' },
  { text: 'https://twitter.com/redesfb/status/1849204857203948573?s=20', out: 'https://twitter.com/redesfb ?s=20' },
  { text: 'https://mobile.twitter.com/redes_fb/status/1849204857203948573', out: 'https://mobile.twitter.com/redes_fb ' },
  { text: 'https://x.com/04145551234/status/1849204857203948573', out: 'https://x.com/04145551234 ' },
  { text: 'https://x.com/0414-555-1234', out: 'https://x.com/0414-555-1234' },
  { text: 'https://x.com/redesfb/status/04145551234', out: 'https://x.com/redesfb/status/04145551234' },
  { text: 'https://ax.com/a/status/1849204857203948573', out: 'https://ax.com/a/status/1849204857203948573' },
  { text: 'https://wa.me/584145551234', out: 'https://wa.me/584145551234' },
];

// What stripTimecodes() leaves (Grabación only): bare video time codes go; an hour stays.
export const TIMECODE_CASES: { text: string; out: string }[] = [
  { text: 'en el 2:15 está la toma del dron', out: 'en el   está la toma del dron' },
  { text: 'del 2:15 al 3:40 va el saludo', out: 'del   al   va el saludo' },
  { text: 'el 2:15 del video', out: 'el   del video' },
  { text: '0:45', out: ' ' },
  { text: 'a las 2:15', out: 'a las 2:15' },
  { text: 'A LAS 2:15', out: 'A LAS 2:15' },
  { text: 'desde las 2:15', out: 'desde las 2:15' },
  { text: 'tipo 2:15 llegamos', out: 'tipo 2:15 llegamos' },
  { text: 'la 2:15', out: 'la 2:15' },
  { text: '2:15 pm', out: '2:15 pm' },
  { text: '2:15 p. m.', out: '2:15 p. m.' },
  { text: '2:15 h', out: '2:15 h' },
  { text: '2:15hs', out: '2:15hs' },
  { text: '2:15 horas', out: '2:15 horas' },
  { text: '2:15 de la tarde', out: '2:15 de la tarde' },
  { text: '2:15 DE LA MAÑANA', out: '2:15 DE LA MAÑANA' },
  { text: '2:15 del día', out: '2:15 del día' },
  { text: 'casa 2:15 a mi', out: 'casa   a mi' },
  { text: 'x2:15', out: 'x2:15' },
];

// What chat_message_guard() does with a message: from that author (a person of the demo), in a conversation where
// Redes or política read (hides) or not. 'ok' with the agenda_clear it keeps. The rows of §3.2 (19 to 30).
export type GuardCase = { text: string; author: DemoUserKey; hides: boolean; result: 'ok' | 'phone' | 'when'; agendaClear?: boolean };
export const GUARD_CASES: GuardCase[] = [
  // 19-20: the boss.
  { text: 'mañana te mando la frase', author: 'boss', hides: true, result: 'ok', agendaClear: true },
  { text: 'Esta tarde lo vemos', author: 'boss', hides: true, result: 'ok', agendaClear: true },
  { text: 'Nos vemos 10:30', author: 'boss', hides: true, result: 'when' },
  { text: 'Llego al mediodía', author: 'boss', hides: true, result: 'when' },
  { text: 'mañana a las 9 en la plaza', author: 'boss', hides: false, result: 'ok', agendaClear: false },
  { text: 'mañana a las 9 en la plaza', author: 'dispatch', hides: false, result: 'ok', agendaClear: false },
  // 21-22: despacho and the IVT where política reads.
  { text: 'el jueves a las 10', author: 'dispatch', hides: true, result: 'when' },
  { text: '23 de enero', author: 'ivt', hides: true, result: 'when' },
  { text: 'el lunes lo revisamos', author: 'ivt', hides: true, result: 'ok', agendaClear: true },
  // 23: Redes does not know the agenda.
  { text: '¿mañana grabamos?', author: 'social', hides: true, result: 'ok', agendaClear: true },
  { text: 'el jueves a las 10', author: 'social', hides: true, result: 'ok', agendaClear: true },
  { text: 'el jueves a las 10', author: 'politics', hides: true, result: 'ok', agendaClear: true },
  // 24-25: Grabación.
  { text: 'en el 2:15 está la toma del dron', author: 'camera', hides: true, result: 'ok', agendaClear: true },
  { text: 'del 2:15 al 3:40 va el saludo', author: 'camera', hides: true, result: 'ok', agendaClear: true },
  { text: 'el sábado a las 9 en la escuela', author: 'camera', hides: true, result: 'when' },
  { text: 'a las 2:15', author: 'camera', hides: true, result: 'when' },
  { text: '2:15 pm', author: 'camera', hides: true, result: 'when' },
  { text: 'mañana', author: 'camera', hides: true, result: 'ok', agendaClear: true },
  { text: 'a las 2:15', author: 'camera', hides: false, result: 'ok', agendaClear: false },
  { text: 'en el 2:15 está la toma del dron', author: 'dispatch', hides: true, result: 'when' },
  // 26: a phone, for everyone and everywhere.
  { text: 'llámalo al 0414 555 12 34', author: 'social', hides: true, result: 'phone' },
  { text: 'llámalo al 0414 555 12 34', author: 'boss', hides: false, result: 'phone' },
  { text: 'llámalo al ０４１４ ５５５ １２ ３４', author: 'camera', hides: false, result: 'phone' },
  // 27: the in-app reference and the number of an X post are taken out.
  { text: `Mira /eventos/${UUID}`, author: 'social', hides: true, result: 'ok', agendaClear: true },
  { text: 'https://x.com/redesfb/status/1849204857203948573', author: 'social', hides: true, result: 'ok', agendaClear: true },
  { text: `Ya está en /piezas/${UUID}`, author: 'dispatch', hides: true, result: 'ok', agendaClear: true },
  // 28: a phone inside a link.
  { text: 'https://wa.me/584145551234', author: 'social', hides: true, result: 'phone' },
  { text: 'https://x.com/0414-555-1234', author: 'social', hides: true, result: 'phone' },
  { text: 'https://x.com/04145551234/status/1849204857203948573', author: 'social', hides: true, result: 'phone' },
  { text: '/eventos/041455512340414555123404145551234041', author: 'social', hides: true, result: 'phone' },
  // 29: a date in a link, a map, coordinates, a tail after the reference.
  { text: 'https://app.ejemplo.test/agenda?dia=2026-10-30', author: 'dispatch', hides: true, result: 'when' },
  { text: 'https://maps.google.com/?q=10.48,-66.87', author: 'dispatch', hides: true, result: 'when' },
  { text: '10.4806, -66.9036', author: 'dispatch', hides: true, result: 'when' },
  { text: `/eventos/${UUID}_jueves-10am`, author: 'dispatch', hides: true, result: 'when' },
  { text: 'https://maps.google.com/?q=10.48,-66.87', author: 'dispatch', hides: false, result: 'ok', agendaClear: false },
  // 30: Redes with a map.
  { text: 'https://maps.google.com/?q=10.48,-66.87', author: 'social', hides: true, result: 'ok', agendaClear: true },
];

// Generated texts on the edges of the four rules: references, X links, map hosts, coordinates, time codes and their
// context words, accents, capitals and full-width digits, joined at random with a fixed seed (the same every run).
const PIECES = [
  `/eventos/${UUID}`, `/piezas/${UUID}?tab=material`, `/EVENTOS/${UUID.toUpperCase()}`, `/eventos/${UUID}_`, 'x.com/redesfb/status/1849204857203948573',
  'twitter.com/0414/status/1849204857203948573', 'x.com/a/status/04145551234', '/eventos/', '/piezas/', '/municipios/', UUID, UUID.toUpperCase(), '?tab=material', '&ver=b', '_', 'x.com/', 'twitter.com/', 'ax.com/',
  'redesfb', '/status/', '1849204857203948573', '04145551234', '0414', '555', '1234', 'https://', 'maps.google.com', 'google.com/maps',
  'goo.gl/maps', 'waze.com', 'geo:', 'geografía', '10.4806', ',', ', ', '-66.9036', '7°', '46', "'", '′', '"', '8C9X', '+', '2V', '+2V',
  '2:15', '0:45', '10:30', '1:02:15', 'a las', 'A LAS', 'la', 'las', 'tipo', 'desde', 'hasta', 'para', 'casa', 'ella', 'pm', 'p. m.', 'a.m.',
  'a mi', 'h', 'hs', 'horas', 'de la tarde', 'DE LA MAÑANA', 'del día', 'del video', 'mañana', 'hoy', 'jueves', 'sáb', '24', 'de', 'enero',
  'Enero', '12/11', '2026-10-30', 'mediodía', 'MEDIANOCHE', '9', 'am', '１０', '：', '３０', 'é', 'Ñ', 'ſ', 'K', 'İ', 'ÿ', 'Ÿ', ' ', ' ', ' ',
  ' ', '\t', '\n', '-', '.', '/', ':', '?', '=', '&',
];

export function chatGeneratedTexts(count: number, seed = 20261028): string[] {
  let state = seed >>> 0;
  const next = () => (state = (Math.imul(state, 1103515245) + 12345) >>> 0) / 2 ** 32;
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const n = 1 + Math.floor(next() * 8);
    let s = '';
    for (let k = 0; k < n; k++) s += PIECES[Math.floor(next() * PIECES.length)] + (next() < 0.4 ? ' ' : '');
    out.push(s);
  }
  return out;
}
