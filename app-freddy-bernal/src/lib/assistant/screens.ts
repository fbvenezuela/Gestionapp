// Destinations for the «Ir a…» button (manual §12). The roles are COPIED from each page's
// own access check (requireRole / requireSession) — a test compares them with the code so
// they never drift apart. null = any signed-in team member (the page calls requireSession).
// A button that bounces is worse than no button: if the person can't open it, no button.
import type { Role } from '../roles';
import { CHAT_SCREENS } from '../chat-screens';
import { HELP_SCREENS } from '../guides/screens';
import { REDES_SCREENS, redesSectionLabel } from '../redes-screens';
import { plain } from './text';

export type Screen = {
  href: string; // static path, or a pattern with [id] (any [name] is one segment: /ayuda/[rol])
  label: string;
  roles: Role[] | null;
  phrases: string[]; // phrases (never a lone word) that name this screen
  file: string; // page file under src/app, for the test
  // Words that name it in a question that asks where something is («¿dónde está la biblioteca?»,
  // «llévame a ajustes»): only there a lone word is enough. And what it is for, in a few words.
  nav?: string[];
  about?: string;
};

const BASE_SCREENS: Screen[] = [
  { href: '/hoy', label: 'Hoy', roles: null, file: '(panel)/hoy/page.tsx', phrases: ['pantalla de hoy', 'pantalla hoy', 'en hoy', 'lo que espera por mi'], nav: ['hoy', 'inicio'], about: 'lo que te toca' },
  { href: '/avisos', label: 'Avisos', roles: null, file: '(panel)/avisos/page.tsx', phrases: ['mis avisos', 'tus avisos', 'ver los avisos', 'la campana'], nav: ['avisos', 'notificaciones', 'campana', 'campanita'], about: 'la campana de arriba' },
  { href: '/perfil', label: 'Mi perfil', roles: null, file: '(panel)/perfil/page.tsx', phrases: ['mi perfil', 'tu perfil', 'activar avisos', 'activa los avisos', 'preferencias de avisos'], nav: ['perfil', 'mi cuenta', 'preferencias'], about: 'en el menú de tu cuenta, arriba a la derecha' },
  { href: '/buscar', label: 'Buscar', roles: null, file: '(panel)/buscar/page.tsx', phrases: ['el buscador', 'buscar un evento', 'buscar una pieza'], nav: ['buscador', 'lupa'], about: 'la lupa de arriba' },
  { href: '/agenda', label: 'Agenda', roles: ['admin', 'boss', 'dispatch', 'social', 'camera', 'ivt'], file: '(panel)/agenda/page.tsx', phrases: ['la agenda', 'mis eventos', 'el calendario', 'mis visitas de obra'], nav: ['agenda', 'calendario', 'mis eventos', 'los eventos'], about: 'los eventos que tu rol puede ver' },
  { href: '/agenda/nuevo', label: 'Nuevo evento', roles: ['boss', 'dispatch'], file: '(panel)/agenda/nuevo/page.tsx', phrases: ['nuevo evento', 'crear un evento', 'cargar un evento', 'visita de obra nueva'], nav: ['nuevo evento'], about: 'en «Crear», arriba' },
  { href: '/agenda/por-fecha', label: 'Por ponerle fecha', roles: ['admin', 'boss', 'dispatch'], file: '(panel)/agenda/por-fecha/page.tsx', phrases: ['por ponerle fecha', 'ponerle fecha', 'fichas sin fecha'], nav: ['por ponerle fecha'], about: 'las fichas del IVT y de política que esperan fecha y hora' },
  { href: '/obras', label: 'Fichas de obra', roles: ['admin', 'boss', 'dispatch', 'ivt'], file: '(panel)/obras/page.tsx', phrases: ['fichas de obra', 'las obras del ivt', 'obras por ponerle fecha'], nav: ['obras', 'fichas de obra', 'ficha de obra'], about: 'la ficha de cada obra antes de la visita del jefe, sin fecha' },
  { href: '/obras/nueva', label: 'Nueva ficha de obra', roles: ['admin', 'boss', 'dispatch', 'ivt'], file: '(panel)/obras/nueva/page.tsx', phrases: ['nueva ficha de obra', 'cargar una obra', 'cargar la ficha de la obra'], nav: ['nueva ficha de obra'], about: 'en «Crear», arriba' },
  { href: '/municipios', label: 'Municipios', roles: ['admin', 'boss', 'dispatch', 'politics'], file: '(panel)/municipios/page.tsx', phrases: ['los municipios', 'reportes por municipio', 'fichas vencidas'], nav: ['municipios', 'vencidas'], about: 'los eventos y avances de cada municipio, con lo vencido arriba' },
  { href: '/reportes/nuevo', label: 'Nueva ficha comunitaria', roles: ['boss', 'dispatch', 'politics'], file: '(panel)/reportes/nuevo/page.tsx', phrases: ['nueva ficha comunitaria', 'reporte comunitario', 'cargar un reporte'], nav: ['ficha comunitaria', 'nuevo reporte'], about: 'en «Crear», arriba' },
  { href: '/aprobar', label: 'Por aprobar', roles: ['boss', 'admin'], file: '(panel)/aprobar/page.tsx', phrases: ['por aprobar', 'aprobar las verdes', 'aprobar los tweets'], nav: ['por aprobar', 'aprobar', 'apruebo', 'aprueba', 'boton de aprobar', 'semaforo'], about: 'las piezas que esperan aprobación salen por color; abres una y ahí está el botón Aprobar' },
  // «Piezas» became the board of Redes by format (R4, D-60): /piezas only sends here.
  { href: '/redes', label: 'Redes', roles: ['admin', 'social', 'boss'], file: '(panel)/redes/page.tsx', phrases: ['pantalla de redes', 'la parte de redes', 'el area de redes', 'inicio de redes', 'las piezas', 'lista de piezas', 'tus piezas', 'tablero de redes'], nav: ['redes', 'area de redes', 'parte de redes', 'piezas', 'mis piezas', 'reels', 'posts', 'carruseles', 'historias', 'fin de mes', 'tablero'], about: 'el tablero y una sección por formato (reels, posts, carruseles, historias, YouTube y fin de mes), el feed y los tweets' },
  { href: '/piezas/nueva', label: 'Nueva pieza', roles: ['admin', 'social', 'boss'], file: '(panel)/piezas/nueva/page.tsx', phrases: ['nueva pieza', 'crear una pieza', 'crea la pieza'], nav: ['nueva pieza'], about: 'en «Crear», arriba' },
  { href: '/tweets', label: 'Tweets', roles: ['admin', 'social', 'boss'], file: '(panel)/tweets/page.tsx', phrases: ['los tweets', 'tweets de la semana', 'dias de tweets'], nav: ['tweets', 'tuits'], about: 'los tweets de la semana' },
  { href: '/tweets/nueva', label: 'Nueva tanda de tweets', roles: ['admin', 'social', 'boss'], file: '(panel)/tweets/nueva/page.tsx', phrases: ['subir la tanda', 'nueva tanda', 'cargar los tweets', 'pegar el documento'], nav: ['nueva tanda', 'tanda'], about: 'se pega o se sube el documento de la semana' },
  { href: '/publicar', label: 'Publicar', roles: ['admin', 'social', 'boss'], file: '(panel)/publicar/page.tsx', phrases: ['en publicar', 'pantalla de publicar', 'ya lo publique', 'publicar a mano'], nav: ['publicar', 'publico', 'publicaciones'], about: 'lo aprobado, listo para publicar a mano' },
  { href: '/publicar/nueva', label: 'Nueva publicación', roles: ['admin', 'social', 'boss'], file: '(panel)/publicar/nueva/page.tsx', phrases: ['nueva publicacion', 'crear una publicacion'] },
  { href: '/publicar/espontanea', label: 'Lo que publicó el jefe', roles: ['admin', 'social', 'boss'], file: '(panel)/publicar/espontanea/page.tsx', phrases: ['lo que publico el jefe', 'publico por su cuenta'], nav: ['lo que publico el jefe'], about: 'en Publicar' },
  { href: '/resultados', label: 'Resultados', roles: ['admin', 'social', 'boss'], file: '(panel)/resultados/page.tsx', phrases: ['en resultados', 'los resultados', 'cargar las metricas', 'a que hora nos va mejor'], nav: ['resultados', 'metricas', 'estadisticas', 'como nos va'], about: 'las métricas y a qué hora nos va mejor' },
  { href: '/biblioteca', label: 'Biblioteca', roles: ['admin', 'social', 'dispatch', 'boss'], file: '(panel)/biblioteca/page.tsx', phrases: ['la biblioteca', 'material por dia'], nav: ['biblioteca'], about: 'el material de los eventos ya realizados, por día' },
  { href: '/jefe', label: 'Inicio', roles: ['boss', 'admin'], file: '(panel)/jefe/page.tsx', phrases: ['te toca aprobar', 'inicio del jefe'], nav: ['inicio', 'te toca aprobar'], about: 'lo vencido, lo que te toca aprobar y cuatro botones: Política, Obras, Redes y Digital' },
  { href: '/jefe/politica', label: 'Política', roles: ['boss', 'admin'], file: '(panel)/jefe/politica/page.tsx', phrases: ['en politica', 'calificar los eventos', 'calificar un evento'], nav: ['politica', 'lo que voy a decir'], about: 'los eventos que esperan tu decisión y «Lo que voy a decir»' },
  { href: '/jefe/digital', label: 'Digital', roles: ['boss', 'admin'], file: '(panel)/jefe/digital/page.tsx', phrases: ['en digital', 'pantalla digital', 'lo que se publico'], nav: ['digital', 'lo publicado', 'se publico'], about: 'lo publicado y cómo nos va' },
  { href: '/ajustes', label: 'Ajustes', roles: ['admin'], file: '(panel)/ajustes/page.tsx', phrases: ['en ajustes', 'los ajustes'], nav: ['ajustes', 'configuracion'], about: 'equipo, categorías, fórmulas, horarios, reglas por red, marca, buzón y registro' },
  { href: '/ajustes/equipo', label: 'Equipo', roles: ['admin'], file: '(panel)/ajustes/equipo/page.tsx', phrases: ['ajustes equipo', 'invitar a alguien', 'cerrar las sesiones', 'cierra sus sesiones'], nav: ['equipo', 'usuarios', 'invitaciones'], about: 'invitar, roles y sesiones' },
  { href: '/ajustes/categorias', label: 'Categorías', roles: ['admin'], file: '(panel)/ajustes/categorias/page.tsx', phrases: ['ajustes categorias', 'editar las categorias'], nav: ['categorias'], about: 'en Ajustes' },
  { href: '/ajustes/formulas', label: 'Fórmulas', roles: ['admin'], file: '(panel)/ajustes/formulas/page.tsx', phrases: ['ajustes formulas', 'editar las formulas'], nav: ['formulas'], about: 'las fórmulas de los copies, en Ajustes' },
  { href: '/ajustes/horarios', label: 'Horarios', roles: ['admin'], file: '(panel)/ajustes/horarios/page.tsx', phrases: ['horarios de tweets', 'ajustes horarios'], nav: ['horarios', 'franjas', 'mejores horas'], about: 'los horarios de los tweets y las mejores horas, en Ajustes' },
  { href: '/ajustes/redes', label: 'Reglas por red', roles: ['admin'], file: '(panel)/ajustes/redes/page.tsx', phrases: ['reglas por red', 'ajustes reglas'], nav: ['reglas por red', 'reglas de video'], about: 'duración, medidas y peso de cada red, en Ajustes' },
  { href: '/ajustes/marca', label: 'Marca', roles: ['admin'], file: '(panel)/ajustes/marca/page.tsx', phrases: ['textos de la marca', 'ajustes marca'], nav: ['marca', 'hashtags', 'cierres'], about: 'textos, saludo, cierres y hashtags, en Ajustes' },
  { href: '/ajustes/buzon', label: 'Buzón', roles: ['admin'], file: '(panel)/ajustes/buzon/page.tsx', phrases: ['el buzon', 'buzon de correos'], nav: ['buzon', 'correos'], about: 'todos los correos que generó la plataforma, en Ajustes' },
  { href: '/ajustes/registro', label: 'Registro de cambios', roles: ['admin'], file: '(panel)/ajustes/registro/page.tsx', phrases: ['registro de cambios', 'quien hizo que'], nav: ['registro', 'registro de cambios', 'historial de cambios', 'quien borro', 'quien cambio', 'quien edito', 'quien hizo'], about: 'quién hizo qué, en Ajustes' },
  { href: '/ajustes/asistente', label: 'Asistente', roles: ['admin'], file: '(panel)/ajustes/asistente/page.tsx', phrases: ['panel del asistente', 'ajustes del asistente'], nav: ['asistente', 'por confirmar'], about: 'lo que sé, cómo contesto y lo que dejé por confirmar, en Ajustes' },
  // Reached only through a tool (they need an id).
  { href: '/piezas/[id]', label: 'Abrir la pieza', roles: ['admin', 'social', 'boss'], file: '(panel)/piezas/[id]/page.tsx', phrases: [] },
  { href: '/aprobar/[id]', label: 'Abrir la pieza', roles: ['boss', 'admin'], file: '(panel)/aprobar/[id]/page.tsx', phrases: [] },
  { href: '/obras/[id]', label: 'Abrir la ficha de obra', roles: ['admin', 'boss', 'dispatch', 'ivt'], file: '(panel)/obras/[id]/page.tsx', phrases: [] },
  { href: '/reportes/[id]', label: 'Abrir la ficha comunitaria', roles: ['admin', 'boss', 'dispatch', 'politics'], file: '(panel)/reportes/[id]/page.tsx', phrases: [] },
  { href: '/eventos/[id]', label: 'Abrir el evento', roles: null, file: '(panel)/eventos/[id]/page.tsx', phrases: [] },
  { href: '/publicar/[id]', label: 'Abrir la publicación', roles: ['admin', 'social', 'boss'], file: '(panel)/publicar/[id]/page.tsx', phrases: [] },
  { href: '/tweets/[id]', label: 'Abrir la tanda', roles: ['admin', 'social', 'boss'], file: '(panel)/tweets/[id]/page.tsx', phrases: [] },
];

// Mensajes and Ayuda (R3) and Redes by format (R4) keep their screens next to their own code (src/lib/chat-screens.ts,
// src/lib/guides/screens.ts, src/lib/redes-screens.ts); they import only the Screen type from here, so there is no
// import cycle at run time.
export const SCREENS: Screen[] = [...BASE_SCREENS, ...CHAT_SCREENS, ...HELP_SCREENS, ...REDES_SCREENS];

export type GoTo = { href: string; label: string };

// A question that asks where a screen is, or to go there: «¿dónde está…?», «¿dónde veo…?», «¿dónde
// apruebo?», «¿en qué parte…?», «¿cómo llego a…?», «llévame a…», «abre…», «ir a…».
// «¿Cómo edito las fórmulas?», «¿cómo cambio los horarios?»: where that is done.
const WHERE_IS = /\b(?:donde|en que parte|en que pantalla|en que menu|en que seccion|como (?:llego|entro|voy) (?:a|al)|llevame|lleveme|abre|abreme|abrir|ir a|ir al|como (?:edito|cambio|configuro|modifico|ajusto))\b/;
const navCache = new Map<string, string[]>();
const navOf = (s: Screen) => navCache.get(s.href) ?? (navCache.set(s.href, [...(s.nav ?? []), ...s.phrases].map((p) => plain(p))), navCache.get(s.href)!);

// Screens anyone has that only say where things land (the bell, Hoy, the search, one's profile): another
// screen named in the same question is the one asked for («¿dónde veo los avisos que dejó preparados el
// asistente?» is Asistente).
const GENERAL = new Set(['/avisos', '/hoy', '/buscar', '/perfil']);

/**
 * The screen a «where is it / take me there» question names, by its label, its phrases or its nav
 * words (a lone word is enough here); null if the question is not one or names no screen. With the
 * person's roles, a screen they can open goes first («¿dónde veo lo que se publicó?» is Digital for the
 * boss, Publicar for Redes); then one that is not a general one; then the first named («¿dónde cambio los
 * horarios de los tweets?» is Horarios), the longer name and then its own label on a tie. When none of
 * them can be opened, the first one: the caller says it is not of this role.
 */
export function navTarget(text: string, roles?: Role[]): Screen | null {
  if (!WHERE_IS.test(` ${plain(text)} `)) return null;
  return screenNamed(text, roles);
}

/**
 * The screen a text names by its label, its phrases or its nav words (a lone word is enough), ranked as navTarget does;
 * null when it names none. `skip`: words that do not count here («tutoriales» names Ayuda, but «¿hay tutoriales?»
 * asks for one of them).
 */
export function screenNamed(text: string, roles?: Role[], skip: readonly string[] = []): Screen | null {
  const t = ` ${plain(text)} `;
  const skipped = new Set(skip.map((w) => plain(w)));
  type Hit = { s: Screen; at: number; len: number; label: boolean; open: boolean; general: boolean };
  const hits: Hit[] = [];
  for (const s of SCREENS) {
    if (s.href.includes('[')) continue;
    let first: Hit | null = null;
    for (const w of [plain(s.label), ...navOf(s)]) {
      const at = w && !skipped.has(w) ? t.indexOf(` ${w} `) : -1;
      if (at >= 0 && (!first || at < first.at || (at === first.at && w.length > first.len))) {
        first = { s, at, len: w.length, label: w === plain(s.label), open: !roles || canOpen(s.href, roles), general: GENERAL.has(s.href) };
      }
    }
    if (first) hits.push(first);
  }
  const rank = (a: Hit, b: Hit) => Number(b.open) - Number(a.open) || Number(a.general) - Number(b.general) || a.at - b.at || b.len - a.len || Number(b.label) - Number(a.label);
  return hits.sort(rank)[0]?.s ?? null;
}

// A pattern's [param] (any name: [id], [rol]) stands for one segment of the path.
const PARAM = /\[[a-z]+\]/g;
function patternOf(href: string): RegExp {
  const esc = href.replace(/[.*+?^${}()|\\]/g, '\\$&').replace(PARAM, '[^/?#]+');
  return new RegExp(`^${esc}(?:[?#].*)?$`);
}

/** The screen a concrete href belongs to (exact path first, then the patterns with a [param]). */
export function screenFor(href: string): Screen | null {
  const path = href.split(/[?#]/)[0];
  return SCREENS.find((s) => s.href === path) ?? SCREENS.find((s) => s.href.includes('[') && patternOf(s.href).test(href)) ?? null;
}

// An account with Administración is out of Mensajes even with a team role (D-49): its pages send it away, so no
// button leads there.
const CHAT_HREFS = new Set(CHAT_SCREENS.map((s) => s.href));

export function canOpen(href: string, roles: Role[]): boolean {
  const s = screenFor(href);
  if (!s) return false;
  if (CHAT_HREFS.has(s.href) && roles.includes('admin')) return false;
  return s.roles === null ? roles.length > 0 : s.roles.some((r) => roles.includes(r));
}

/** Screens whose phrase appears in the text (a phrase, never a lone word), in list order. */
export function screensIn(text: string): Screen[] {
  const t = ` ${plain(text)} `;
  return SCREENS.filter((s) => s.phrases.some((p) => t.includes(` ${plain(p)} `)));
}

/**
 * The button for an answer: the destination of the tool that was used, if this person can
 * open it; otherwise a screen the answer (or else the question) names by phrase. Else null.
 */
export function pickGoTo(roles: Role[], o: { toolHrefs?: (string | null | undefined)[]; answer?: string; question?: string }): GoTo | null {
  for (const href of o.toolHrefs ?? []) {
    if (href && canOpen(href, roles)) return { href, label: redesSectionLabel(href) ?? screenFor(href)!.label };
  }
  // An answer that names several screens (the list of Ajustes) points to none of them.
  for (const text of [o.answer, o.question]) {
    if (!text) continue;
    const named = screensIn(text).filter((x) => !x.href.includes('['));
    if (text === o.answer && named.length > 1) continue;
    const s = named.find((x) => canOpen(x.href, roles));
    if (s) return { href: s.href, label: s.label };
  }
  return null;
}
