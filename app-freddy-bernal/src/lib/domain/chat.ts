// Mensajes, the team's internal network (R3, D-49 to D-59): the pure rules and the texts, one source for the pages,
// the actions, the guides and the tests. The database decides (supabase/migrations/20261028002400_internal_chat.sql);
// what is here only says it first, in Spanish, and paints the screens.
//
// The text rules are EXACT copies of the database's, compared on tests/unit/fixtures/chat-text-cases.ts and on
// generated texts (tests/rls/chat.test.ts): a change here is a change there, with a new migration.
//   stripRefs()            ⇔ public.chat_strip_refs()
//   hasMap()               ⇔ public.chat_has_map()
//   stripTimecodes()       ⇔ public.chat_strip_timecodes()
//   hasConcreteDateTime()  ⇔ public.text_has_concrete_datetime()
// The relative words («hoy», «mañana», «el lunes», «esta tarde») are the app's only (E1): the database lets them
// through, and the composer asks first (CHAT_RELATIVE_ASK) to whoever knows the agenda where Redes or política read.

import { DATETIME_PATTERNS, firstDateTime, looksLikeDateTime } from '@/lib/push/text';
import { ROLES, type Role, type TeamRole } from '@/lib/roles';
import { phonesIn } from './phones';

// ---------------------------------------------------------------------------------------------------------------
// Sizes (the database's CHECKs and chat_start())
// ---------------------------------------------------------------------------------------------------------------
export const CHAT_BODY_MAX = 2000;
export const CHAT_GROUP_MIN = 3;
export const CHAT_GROUP_MAX = 12;
export const CHAT_TITLE_MAX = 60;

// ---------------------------------------------------------------------------------------------------------------
// Texts
// ---------------------------------------------------------------------------------------------------------------
// On top of /mensajes and /mensajes/nueva, always.
export const CHAT_NOTICE = 'El jefe puede leer todas las conversaciones. Administración no las lee, y 360 tampoco. Lo que se escribe queda guardado y no se borra.';
// Under the title of each conversation.
export const CHAT_NOTICE_LINE = 'El jefe puede leer esta conversación. Administración y 360 no.';
// Next to the box.
export const CHAT_COMPOSER_LINE = 'Lo lee el jefe · queda guardado, no se borra';
// The notice accepted once before writing (D-59).
export const CHAT_ACK_TEXT = 'El jefe puede leer todas las conversaciones. Lo que escribes queda guardado y no se borra. Administración y 360 no las leen.';
export const CHAT_DEMO_NOTICE = 'En la demostración, lo nuevo (mensajes, grupos y los cambios de «Quién habla con quién») puede no verse con otra cuenta o en otro teléfono. No escribas nada real: en la demostración cualquiera que entre como jefe lo lee.';
// Only to whoever knows the agenda, only where Redes or política read (U13).
export const CHAT_AGENDA_NOTE = 'Aquí está Redes o política: sin fechas, horas, ni cuándo sales o llegas.';
export const CHAT_HIDDEN = 'Mensaje oculto: tenía una fecha o una hora de la agenda.';
export const CHAT_OTHER_SERVER = 'Esta conversación se creó en otro servidor de la demostración. Prueba con las que ya están.';
// {w} = the word found. While writing (a concrete date, time or map: the database refuses it).
export const CHAT_WHEN_WARN = '“{w}” no puede ir aquí';
// Before sending, Grabación with a bare time code («2:15»).
export const CHAT_TIMECODE_ASK = '¿{t} es un tiempo del video? Si es una hora, no va aquí.';
// Before sending, a relative word (E1): «Enviar igual» / «Corregir».
export const CHAT_RELATIVE_ASK = '“{w}”: ¿dice cuándo va el jefe? Si es de la agenda, no va aquí.';
// A phone (D-53), and a phone inside a link.
export const CHAT_PHONE_TEXT = 'Los teléfonos no van en los mensajes: los contactos van en la ficha, con doble factor.';
export const CHAT_PHONE_LINK_TEXT = 'Ese enlace tiene un número largo que parece un teléfono. Si es de la plataforma, pega su dirección; si no, quita el número.';

/** A text with its {w} or {t} filled. */
export function fillWord(template: string, word: string): string {
  return template.replace('{w}', word).replace('{t}', word);
}

// ---------------------------------------------------------------------------------------------------------------
// The text rules: exact copies of the database's
// ---------------------------------------------------------------------------------------------------------------
// JavaScript's \s, written out (the database spells it the same way).
const SP = '[\\t\\n\\v\\f\\r \\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff]';
// Word characters: ASCII and the Latin-1 letters, both cases written out.
const W = 'A-Za-z0-9_À-ÖØ-öø-ÿ';

const REF = '/(?:eventos|piezas|aprobar|obras|reportes|publicar|tweets|mensajes)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\\?[a-z]+=[a-z]+(?:&[a-z]+=[a-z]+)*)?';
const X_POST = /(?<![a-z0-9-])((?:x|twitter)\.com\/[a-z0-9_]{1,15})\/status\/[0-9]{15,20}/gi;

/** `text` without the exact in-app references (/eventos/<uuid>…) and the number of an X post. */
export function stripRefs(text: string): string {
  return (text ?? '').replace(new RegExp(REF, 'gi'), ' ').replace(X_POST, '$1 ');
}

const MAP_LINK = /(?:maps\.google\.|google\.[a-z.]{2,6}\/maps|goo\.gl\/maps|maps\.app\.goo\.gl|waze\.com|maps\.apple\.com|openstreetmap\.org|(?<![a-z0-9_])geo:)/i;
const COORDS = new RegExp(`-?[0-9]{1,2}\\.[0-9]{3,}${SP}*,${SP}*-?[0-9]{1,3}\\.[0-9]{3,}`);
const DMS = new RegExp(`[0-9]{1,3}${SP}*°${SP}*[0-9]{1,2}${SP}*['′’]`);
const PLUS_CODE = /(?<![a-z0-9])[23456789cfghjmpqrvwx]{4,8}\+[23456789cfghjmpqrvwx]{2,3}(?![a-z0-9])/i;

/** What hasMap() found, said for the person, or null. */
export function mapWord(text: string): string | null {
  const t = (text ?? '').normalize('NFKC');
  if (MAP_LINK.test(t)) return 'un enlace de mapas';
  if (COORDS.test(t) || DMS.test(t) || PLUS_CODE.test(t)) return 'unas coordenadas';
  return null;
}

/** A map link, coordinates or a plus code (the exact place). */
export function hasMap(text: string): boolean {
  return mapWord(text) !== null;
}

const TIMECODE_SOURCE =
  `(?<!(?<![${W}])(?:a|las?|desde|hasta|para|tipo)${SP}{1,3})(?<![${W}])[0-9]{1,2}:[0-9]{2}(?![${W}])` +
  `(?!${SP}*(?:[ap]\\.?${SP}?m\\.?(?![${W}])|h(?:s|rs?|oras?)?(?![${W}]))` +
  `|${SP}+de(?:${SP}+la)?${SP}+(?:ma[ñÑ]ana|tarde|noche|madrugada)(?![${W}])` +
  `|${SP}+del?${SP}+d[iíÍ]a(?![${W}]))`;

/** The bare video time codes in `text` («en el 2:15»), as written, in order. */
export function timecodesIn(text: string): string[] {
  return [...(text ?? '').matchAll(new RegExp(TIMECODE_SOURCE, 'gi'))].map((m) => m[0]);
}

/** `text` without its bare video time codes (Grabación only). */
export function stripTimecodes(text: string): string {
  return (text ?? '').replace(new RegExp(TIMECODE_SOURCE, 'gi'), ' ');
}

const L = 'a-záéíóúüñ';
const once = (re: RegExp) => new RegExp(re.source, re.flags.replace('g', ''));
// The patterns of looksLikeDateTime() without the 2nd (a phone), the 14th («de la tarde», «mediodía») and the 15th
// (weekdays and relative days); of the 14th, «mediodía» and «medianoche» stay, and a weekday followed by a day number
// («el sábado 24», «domingo 3») stays. As text_has_concrete_datetime().
const CONCRETE: RegExp[] = [
  ...DATETIME_PATTERNS.filter((_, i) => i !== 1 && i !== 13 && i !== 14),
  new RegExp(`(?<![${L}])(?:mediod[ií]a|medianoche)(?![${L}])`, 'gi'),
  new RegExp(`(?<![${L}])(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo),?${SP}+(?:de${SP}+)?[0-9]{1,2}(?![a-z0-9_])`, 'gi'),
].map(once);

// What the composer asks about (E1): the 14th and 15th patterns, and a few more ways of saying when.
const RELATIVE: RegExp[] = [
  DATETIME_PATTERNS[13],
  DATETIME_PATTERNS[14],
  new RegExp(`(?<![${L}])(?:(?:este|el)\\s+)?fin(?:es)?\\s+de\\s+semana(?![${L}])`, 'i'),
  new RegExp(`(?<![${L}])(?:en|por)\\s+la\\s+(?:mañana|tarde|noche)(?![${L}])`, 'i'),
  new RegExp(`(?<![${L}])(?:(?:la|esta)\\s+)?(?:pr[oó]xima\\s+semana|semana\\s+que\\s+viene)(?![${L}])`, 'i'),
].map(once);

function firstOf(patterns: readonly RegExp[], text: string): string | null {
  let best: { at: number; text: string } | null = null;
  for (const re of patterns) {
    const m = re.exec(text);
    if (m && (!best || m.index < best.at || (m.index === best.at && m[0].length > best.text.length))) best = { at: m.index, text: m[0] };
  }
  return best ? best.text.trim() : null;
}

/** The first concrete date or time of `text` (a clock time, a calendar date), as written after NFKC, or null. */
export function firstConcreteDateTime(text: string): string | null {
  return firstOf(CONCRETE, (text ?? '').normalize('NFKC'));
}

/** A concrete date or time: a clock time («10:30», «3 pm», «a las 3», «15h») or a calendar date («12 de noviembre»,
 * «12/11», a date ISO). Not «hoy», «mañana» nor a weekday. */
export function hasConcreteDateTime(text: string): boolean {
  const t = (text ?? '').normalize('NFKC');
  return t !== '' && CONCRETE.some((re) => re.test(t));
}

/** The first relative word of `text` («mañana», «el lunes», «esta tarde», «el fin de semana»), or null. */
export function firstRelativeWhen(text: string): string | null {
  return firstOf(RELATIVE, (text ?? '').normalize('NFKC'));
}

// ---------------------------------------------------------------------------------------------------------------
// Who knows the agenda (mirrors of the database's functions, only to paint and to warn)
// ---------------------------------------------------------------------------------------------------------------
const has = (roles: readonly Role[], ...these: Role[]) => roles.some((r) => these.includes(r));

/** The author knows the agenda (the write rule): boss, despacho, IVT, Grabación or admin. chat_author_knows_agenda(). */
export function knowsAgenda(roles: readonly Role[]): boolean {
  return has(roles, 'boss', 'dispatch', 'ivt', 'camera', 'admin');
}

/** Grabación and none of the roles that know the whole agenda: bare time codes pass. chat_author_camera_only(). */
export function cameraOnly(roles: readonly Role[]): boolean {
  return has(roles, 'camera') && !has(roles, 'boss', 'dispatch', 'ivt', 'admin');
}

/** May read a message that had a date of the agenda (besides the boss with 2FA). chat_reader_knows_agenda(). */
export function readerKnowsAgenda(roles: readonly Role[]): boolean {
  return has(roles, 'boss', 'dispatch', 'ivt', 'camera') && !has(roles, 'politics', 'social');
}

// ---------------------------------------------------------------------------------------------------------------
// What a message would be refused for (or asked about) before it is sent
// ---------------------------------------------------------------------------------------------------------------
export type ChatTextProblem =
  | { kind: 'phone'; inLink: boolean }
  | { kind: 'when'; word: string }
  | { kind: 'timecode'; word: string }
  | { kind: 'relative'; word: string };

export type ChatTextContext = {
  // Redes or política read this conversation (chat_hides_agenda_for_me()).
  hidesAgenda: boolean;
  // The author's roles (all of them: admin counts as knowing the agenda).
  authorRoles: readonly Role[];
  // The person already said «Sí, es del video» / «Enviar igual».
  timecodeOk?: boolean;
  relativeOk?: boolean;
};

/** What the agenda rule checks, as chat_message_guard(): Grabación alone has its bare time codes taken out, unless the
 * message also has a relative day («mañana 7:00 salimos»: the strict looksLikeDateTime() finds it), and then the time
 * code counts as an hour. `codes` = the time codes taken out. */
function agendaText(raw: string, roles: readonly Role[]): { t: string; codes: string[] } {
  if (!cameraOnly(roles)) return { t: raw, codes: [] };
  const codes = timecodesIn(raw);
  const stripped = stripTimecodes(raw);
  return codes.length && looksLikeDateTime(stripped) ? { t: raw, codes: [] } : { t: stripped, codes };
}

function phoneInLink(text: string, phones: string[]): boolean {
  return phones.some((p) => {
    const at = text.indexOf(p);
    if (at < 0) return false;
    const start = text.slice(0, at).search(/\S*$/);
    const end = at + p.length + (text.slice(at + p.length).match(/^\S*/)?.[0].length ?? 0);
    return /\/|www\./i.test(text.slice(start, at) + text.slice(at + p.length, end));
  });
}

/**
 * Why a message is not sent, or what to ask first. The same order as chat_message_guard(): a phone, for everyone and
 * everywhere; then, only from whoever knows the agenda where Redes or política read: a concrete date, time or map
 * (refused), a bare time code of Grabación (asked), a relative word (asked, E1). Nothing for whoever does not know
 * the agenda: they cannot leak it.
 */
export function chatTextProblem(text: string, ctx: ChatTextContext): ChatTextProblem | null {
  const raw = stripRefs((text ?? '').normalize('NFKC'));
  const phones = phonesIn(raw);
  if (phones.length) return { kind: 'phone', inLink: phoneInLink(raw, phones) };
  if (!ctx.hidesAgenda || !knowsAgenda(ctx.authorRoles)) return null;
  const { t, codes } = agendaText(raw, ctx.authorRoles);
  const when = firstConcreteDateTime(t) ?? mapWord(t);
  if (when) return { kind: 'when', word: when };
  if (codes.length && !ctx.timecodeOk) return { kind: 'timecode', word: codes[0].trim() };
  const relative = firstRelativeWhen(t);
  if (relative && !ctx.relativeOk) return { kind: 'relative', word: relative };
  return null;
}

/** What chat_message_guard() keeps in agenda_clear for a message that passes: false when its author knows the agenda
 * and it has a concrete date, time or map (in a conversation without Redes or política). */
export function chatAgendaClear(text: string, authorRoles: readonly Role[]): boolean {
  if (!knowsAgenda(authorRoles)) return true;
  const { t } = agendaText(stripRefs((text ?? '').normalize('NFKC')), authorRoles);
  return !(hasConcreteDateTime(t) || hasMap(t));
}

/**
 * Why a group's name is not saved: a phone, a date, a time or a map, whoever is in the group (the strict rule of
 * chat_start(): nobody is asked before a name is saved, everyone in it reads it every time, and a name has no
 * agenda_clear, so a member who gains Redes or política later still reads it).
 */
export function chatTitleProblem(title: string): ChatTextProblem | null {
  const phones = phonesIn(title ?? '');
  if (phones.length) return { kind: 'phone', inLink: phoneInLink((title ?? '').normalize('NFKC'), phones) };
  if (looksLikeDateTime(title ?? '')) return { kind: 'when', word: firstDateTime(title ?? '') ?? '' };
  const map = mapWord(title ?? '');
  return map ? { kind: 'when', word: map } : null;
}

// ---------------------------------------------------------------------------------------------------------------
// Who talks to whom (D-51)
// ---------------------------------------------------------------------------------------------------------------
export type ChatPairRole = Exclude<TeamRole, 'boss'>;
// The names on «Quién habla con quién».
export const CHAT_ROLE_NAME: Record<ChatPairRole, string> = {
  dispatch: 'Despacho',
  politics: 'Política',
  ivt: 'IVT',
  social: 'Redes',
  camera: 'Grabación',
};
const enumOrder = (r: Role) => ROLES.indexOf(r);
const PAIR_ROLES = (Object.keys(CHAT_ROLE_NAME) as ChatPairRole[]).sort((a, b) => enumOrder(a) - enumOrder(b));

// The 10 pairs of different roles, role_a < role_b in the enum's order (as chat_rules keeps them).
export const CHAT_ROLE_PAIRS: { roleA: ChatPairRole; roleB: ChatPairRole; label: string }[] = PAIR_ROLES.flatMap((a, i) =>
  PAIR_ROLES.slice(i + 1).map((b) => ({ roleA: a, roleB: b, label: `${CHAT_ROLE_NAME[a]} ↔ ${CHAT_ROLE_NAME[b]}` })),
);

export type ChatRule = { roleA: Role; roleB: Role; allowed: boolean };

/** Whether two people may write to each other: chat_pair_allowed(). The boss always; an admin account never; with two
 * roles the most restrictive rule wins. */
export function pairAllowed(rolesA: readonly Role[], rolesB: readonly Role[], rules: readonly ChatRule[]): boolean {
  const team = (rs: readonly Role[]) => (rs.includes('admin') ? [] : rs.filter((r) => r === 'boss' || (PAIR_ROLES as readonly Role[]).includes(r)));
  const a = team(rolesA);
  const b = team(rolesB);
  if (!a.length || !b.length) return false;
  if (a.includes('boss') || b.includes('boss')) return true;
  const closed = new Set(rules.filter((r) => !r.allowed).map((r) => `${r.roleA}:${r.roleB}`));
  for (const x of a) {
    for (const y of b) {
      const [lo, hi] = enumOrder(x) <= enumOrder(y) ? [x, y] : [y, x];
      if (closed.has(`${lo}:${hi}`)) return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------------------------------------------
// Links to the platform inside a message (D-54)
// ---------------------------------------------------------------------------------------------------------------
export type ChatRefKind = 'event' | 'piece' | 'obra' | 'report' | 'publication' | 'tweets' | 'chat';
const SECTION_KIND: Record<string, ChatRefKind> = {
  eventos: 'event',
  piezas: 'piece',
  aprobar: 'piece',
  obras: 'obra',
  reportes: 'report',
  publicar: 'publication',
  tweets: 'tweets',
  mensajes: 'chat',
};

/** The in-app references of `text` (the ones stripRefs() takes out), once each, in order. */
export function linkRefs(text: string): { kind: ChatRefKind; id: string; href: string }[] {
  const out: { kind: ChatRefKind; id: string; href: string }[] = [];
  for (const m of (text ?? '').normalize('NFKC').matchAll(new RegExp(REF, 'gi'))) {
    const [, section, id] = /^\/([a-z]+)\/([0-9a-f-]{36})/i.exec(m[0])!;
    const href = m[0].replace(/^\/[a-z]+/i, (s) => s.toLowerCase()).replace(/[0-9a-f-]{36}/i, (s) => s.toLowerCase());
    if (!out.some((r) => r.href === href)) out.push({ kind: SECTION_KIND[section.toLowerCase()], id: id.toLowerCase(), href });
  }
  return out;
}

/** One line for a list: without links, at most 80 characters. */
export function previewOf(body: string): string {
  const plain = stripRefs(body ?? '')
    .replace(/https?:\/\/\S+|www\.\S+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!plain) return (body ?? '').trim() ? 'Un enlace' : '';
  return plain.length <= 80 ? plain : `${plain.slice(0, 79).trimEnd()}…`;
}
