// Destinations for the «Ir a…» button (manual §12). The roles are COPIED from each page's
// own access check (requireRole / requireSession) — a test compares them with the code so
// they never drift apart. null = any signed-in team member (the page calls requireSession).
// A button that bounces is worse than no button: if the person can't open it, no button.
import type { Role } from '../roles';
import { plain } from './text';

export type Screen = {
  href: string; // static path, or a pattern with [id]
  label: string;
  roles: Role[] | null;
  phrases: string[]; // phrases (never a lone word) that name this screen
  file: string; // page file under src/app, for the test
};

export const SCREENS: Screen[] = [
  { href: '/hoy', label: 'Hoy', roles: null, file: '(panel)/hoy/page.tsx', phrases: ['pantalla de hoy', 'pantalla hoy', 'en hoy', 'lo que espera por mi'] },
  { href: '/avisos', label: 'Avisos', roles: null, file: '(panel)/avisos/page.tsx', phrases: ['mis avisos', 'tus avisos', 'ver los avisos', 'la campana'] },
  { href: '/perfil', label: 'Mi perfil', roles: null, file: '(panel)/perfil/page.tsx', phrases: ['mi perfil', 'tu perfil', 'activar avisos', 'activa los avisos', 'preferencias de avisos'] },
  { href: '/buscar', label: 'Buscar', roles: null, file: '(panel)/buscar/page.tsx', phrases: ['el buscador', 'buscar un evento', 'buscar una pieza'] },
  { href: '/agenda', label: 'Agenda', roles: ['admin', 'boss', 'dispatch', 'secretary', 'social', 'camera'], file: '(panel)/agenda/page.tsx', phrases: ['la agenda', 'mis eventos', 'el calendario'] },
  { href: '/agenda/nuevo', label: 'Nuevo evento', roles: ['admin', 'dispatch', 'secretary'], file: '(panel)/agenda/nuevo/page.tsx', phrases: ['nuevo evento', 'crear un evento', 'proponer un evento', 'propon un evento', 'cargar un evento'] },
  { href: '/aprobar', label: 'Por aprobar', roles: ['supervisor', 'admin', 'boss'], file: '(panel)/aprobar/page.tsx', phrases: ['por aprobar', 'aprobar las verdes', 'aprobar los tweets'] },
  { href: '/piezas', label: 'Piezas', roles: ['admin', 'social'], file: '(panel)/piezas/page.tsx', phrases: ['las piezas', 'lista de piezas', 'tus piezas'] },
  { href: '/piezas/nueva', label: 'Nueva pieza', roles: ['admin', 'social'], file: '(panel)/piezas/nueva/page.tsx', phrases: ['nueva pieza', 'crear una pieza', 'crea la pieza'] },
  { href: '/tweets', label: 'Tweets', roles: ['admin', 'social', 'supervisor'], file: '(panel)/tweets/page.tsx', phrases: ['los tweets', 'tweets de la semana', 'dias de tweets'] },
  { href: '/tweets/nueva', label: 'Nueva tanda de tweets', roles: ['admin', 'social'], file: '(panel)/tweets/nueva/page.tsx', phrases: ['subir la tanda', 'nueva tanda', 'cargar los tweets', 'pegar el documento'] },
  { href: '/publicar', label: 'Publicar', roles: ['admin', 'social'], file: '(panel)/publicar/page.tsx', phrases: ['en publicar', 'pantalla de publicar', 'ya lo publique', 'publicar a mano'] },
  { href: '/publicar/nueva', label: 'Nueva publicación', roles: ['admin', 'social'], file: '(panel)/publicar/nueva/page.tsx', phrases: ['nueva publicacion', 'crear una publicacion'] },
  { href: '/publicar/espontanea', label: 'Lo que publicó el jefe', roles: ['admin', 'social'], file: '(panel)/publicar/espontanea/page.tsx', phrases: ['lo que publico el jefe', 'publico por su cuenta'] },
  { href: '/resultados', label: 'Resultados', roles: ['admin', 'social', 'supervisor', 'boss'], file: '(panel)/resultados/page.tsx', phrases: ['en resultados', 'los resultados', 'cargar las metricas', 'a que hora nos va mejor'] },
  { href: '/biblioteca', label: 'Biblioteca', roles: ['admin', 'social', 'supervisor', 'dispatch'], file: '(panel)/biblioteca/page.tsx', phrases: ['la biblioteca', 'material por dia'] },
  { href: '/jefe', label: 'Inicio', roles: ['boss', 'admin'], file: '(panel)/jefe/page.tsx', phrases: ['te toca aprobar', 'inicio del jefe'] },
  { href: '/jefe/politica', label: 'Política', roles: ['boss', 'admin'], file: '(panel)/jefe/politica/page.tsx', phrases: ['en politica', 'calificar los eventos', 'calificar un evento'] },
  { href: '/jefe/digital', label: 'Digital', roles: ['boss', 'admin'], file: '(panel)/jefe/digital/page.tsx', phrases: ['en digital', 'pantalla digital'] },
  { href: '/ajustes', label: 'Ajustes', roles: ['admin'], file: '(panel)/ajustes/page.tsx', phrases: ['en ajustes', 'los ajustes'] },
  { href: '/ajustes/equipo', label: 'Equipo', roles: ['admin'], file: '(panel)/ajustes/equipo/page.tsx', phrases: ['ajustes equipo', 'invitar a alguien', 'cerrar las sesiones', 'cierra sus sesiones'] },
  { href: '/ajustes/categorias', label: 'Categorías', roles: ['admin'], file: '(panel)/ajustes/categorias/page.tsx', phrases: ['ajustes categorias', 'editar las categorias'] },
  { href: '/ajustes/formulas', label: 'Fórmulas', roles: ['admin'], file: '(panel)/ajustes/formulas/page.tsx', phrases: ['ajustes formulas', 'editar las formulas'] },
  { href: '/ajustes/horarios', label: 'Horarios', roles: ['admin'], file: '(panel)/ajustes/horarios/page.tsx', phrases: ['horarios de tweets', 'ajustes horarios'] },
  { href: '/ajustes/redes', label: 'Reglas por red', roles: ['admin'], file: '(panel)/ajustes/redes/page.tsx', phrases: ['reglas por red', 'ajustes reglas'] },
  { href: '/ajustes/marca', label: 'Marca', roles: ['admin'], file: '(panel)/ajustes/marca/page.tsx', phrases: ['textos de la marca', 'ajustes marca'] },
  { href: '/ajustes/buzon', label: 'Buzón', roles: ['admin'], file: '(panel)/ajustes/buzon/page.tsx', phrases: ['el buzon', 'buzon de correos'] },
  { href: '/ajustes/registro', label: 'Registro de cambios', roles: ['admin'], file: '(panel)/ajustes/registro/page.tsx', phrases: ['registro de cambios', 'quien hizo que'] },
  { href: '/ajustes/asistente', label: 'Asistente', roles: ['admin'], file: '(panel)/ajustes/asistente/page.tsx', phrases: ['panel del asistente', 'ajustes del asistente'] },
  // Reached only through a tool (they need an id).
  { href: '/piezas/[id]', label: 'Abrir la pieza', roles: ['admin', 'social'], file: '(panel)/piezas/[id]/page.tsx', phrases: [] },
  { href: '/aprobar/[id]', label: 'Abrir la pieza', roles: ['supervisor', 'admin', 'boss'], file: '(panel)/aprobar/[id]/page.tsx', phrases: [] },
  { href: '/eventos/[id]', label: 'Abrir el evento', roles: null, file: '(panel)/eventos/[id]/page.tsx', phrases: [] },
  { href: '/publicar/[id]', label: 'Abrir la publicación', roles: ['admin', 'social'], file: '(panel)/publicar/[id]/page.tsx', phrases: [] },
  { href: '/tweets/[id]', label: 'Abrir la tanda', roles: ['admin', 'social', 'supervisor'], file: '(panel)/tweets/[id]/page.tsx', phrases: [] },
];

export type GoTo = { href: string; label: string };

function patternOf(href: string): RegExp {
  const esc = href.replace(/[.*+?^${}()|\\]/g, '\\$&').replaceAll('[id]', '[^/?#]+');
  return new RegExp(`^${esc}(?:[?#].*)?$`);
}

/** The screen a concrete href belongs to (exact path first, then [id] patterns). */
export function screenFor(href: string): Screen | null {
  const path = href.split(/[?#]/)[0];
  return SCREENS.find((s) => s.href === path) ?? SCREENS.find((s) => s.href.includes('[id]') && patternOf(s.href).test(href)) ?? null;
}

export function canOpen(href: string, roles: Role[]): boolean {
  const s = screenFor(href);
  if (!s) return false;
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
    if (href && canOpen(href, roles)) return { href, label: screenFor(href)!.label };
  }
  for (const text of [o.answer, o.question]) {
    if (!text) continue;
    const s = screensIn(text).find((x) => !x.href.includes('[id]') && canOpen(x.href, roles));
    if (s) return { href: s.href, label: s.label };
  }
  return null;
}
