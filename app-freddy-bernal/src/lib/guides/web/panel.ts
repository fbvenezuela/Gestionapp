// The panel's «Web» and «Atención» screens in the boss's and Administración's own guides (APP-42, WF-C): each screen
// is told by one section of the web's data (its `what`, its first `items` and its `cannot`, for that audience), so the
// role guide (/ayuda/jefe, /ayuda/administracion and their docs), «Ayuda y guías» → «La web» / «Atención ciudadana» and
// 360 say one thing. Change a screen's text in its web section, never here. Data and pure functions only.
// It reads the four docs directly (not ./index), so the role guides can import it without a cycle.
import type { Audience, RoleText, WebSection } from '../types';
import { GUIA_WEB } from './guia-web';
import { MANUAL_ADMIN_WEB } from './manual-admin-web';
import { MANUAL_ATENCION } from './manual-atencion';
import { FLUJOS_WEB } from './flujos-web';
import { UNFILLED_HUECO } from './words';

/** One screen of «Web» or «Atención» in a role's guide: its address (a SCREENS href the audience opens), the menu entry
 * it is under, its name in the guide, the web section that tells it and how many of that section's items go in. */
export type PanelScreen = { screen: string; menu: 'Web' | 'Atención'; title: string; section: string; audience: Audience[]; items: number };

/**
 * The screens, in the menu's order, each one a static screen of «Web» or «Atención» in SCREENS (the test checks that a
 * screen is here for exactly the audiences that open it). The boss opens all but the desk's «Registro»; Administración,
 * all but the desk's «Mapa» and «Cifras» (deskAccess(): the cases are read by the desk and the boss, the figures by the
 * coordinator, the auditor and the boss; the audit trail is the auditor's and Administración's). Named «… de la web» and
 * «… de atención» where the team has a screen with the same word («Por aprobar», «Biblioteca»), as SCREENS does.
 */
export const PANEL_SCREENS: readonly PanelScreen[] = [
  { screen: '/admin/web', menu: 'Web', title: 'La web', section: 'pantalla-la-web', audience: ['boss', 'admin'], items: 4 },
  { screen: '/admin/web/por-aprobar', menu: 'Web', title: 'Por aprobar de la web', section: 'aprobar', audience: ['boss', 'admin'], items: 4 },
  { screen: '/admin/web/biblioteca', menu: 'Web', title: 'Biblioteca de la web', section: 'biblioteca', audience: ['boss', 'admin'], items: 4 },
  { screen: '/admin/web/ajustes', menu: 'Web', title: 'Ajustes del sitio', section: 'ajustes-del-sitio', audience: ['boss', 'admin'], items: 5 },
  { screen: '/admin/web/redirecciones', menu: 'Web', title: 'Redirecciones', section: 'redirecciones', audience: ['boss', 'admin'], items: 4 },
  { screen: '/admin/atencion', menu: 'Atención', title: 'Atención ciudadana', section: 'bandeja-y-tablero', audience: ['boss', 'admin'], items: 7 },
  { screen: '/admin/atencion/mapa', menu: 'Atención', title: 'Mapa de atención', section: 'mapa', audience: ['boss'], items: 2 },
  { screen: '/admin/atencion/estadisticas', menu: 'Atención', title: 'Cifras de atención', section: 'cifras', audience: ['boss'], items: 4 },
  { screen: '/admin/atencion/areas', menu: 'Atención', title: 'Áreas y plazos', section: 'areas-y-plazos', audience: ['boss', 'admin'], items: 6 },
  { screen: '/admin/atencion/registro', menu: 'Atención', title: 'Registro de atención', section: 'registro', audience: ['admin'], items: 4 },
];

/** A role text for this audience: its own, else the default; undefined when the text is not for it. */
export function roleTextFor(t: RoleText | undefined, a: Audience): string | undefined {
  if (t === undefined) return undefined;
  return typeof t === 'string' ? t : (t[a] ?? t.default);
}

/** «No: tú no …» → «Tú no …»: a «¿puedo…?» answer said as a line of the guide. */
export function cannotLine(text: string): string {
  const t = text.replace(/^No:\s*/, '');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

let SECTIONS: Map<string, WebSection> | null = null;
function sectionById(id: string): WebSection {
  SECTIONS ??= new Map([GUIA_WEB, MANUAL_ADMIN_WEB, MANUAL_ATENCION, FLUJOS_WEB].flatMap((d) => d.sections).map((s) => [s.id, s]));
  const s = SECTIONS.get(id);
  if (!s) throw new Error(`No hay sección de la web «${id}».`);
  return s;
}

export type PanelSection = { screen: string; menu: PanelScreen['menu']; title: string; what: string; youDo: string[] };

/**
 * The «Web» and «Atención» screens of this audience's guide, from the web's data: what the screen is for (its section's
 * `what`), what you do there (its first items) and what you do not (its `cannot`, said as lines). Texts that name the
 * client (a hueco) stay in the web's guide, where they are filled.
 */
export function webSectionsFor(a: Audience): PanelSection[] {
  const plain = (t: string | undefined): t is string => !!t && !UNFILLED_HUECO.test(t);
  return PANEL_SCREENS.filter((p) => p.audience.includes(a)).map((p) => {
    const s = sectionById(p.section);
    const what = roleTextFor(s.what, a);
    if (!plain(what)) throw new Error(`La sección «${p.section}» no tiene «para qué es» para ${a}.`);
    const items = (s.items ?? []).map((t) => roleTextFor(t, a)).filter(plain).slice(0, p.items);
    const cannot = (s.cannot?.[a] ?? []).filter(plain).map(cannotLine);
    return { screen: p.screen, menu: p.menu, title: p.title, what, youDo: [...items, ...cannot] };
  });
}
