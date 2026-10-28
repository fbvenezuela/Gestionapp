// The entry point of the help content (R3, D-42). Paso 0: the tutorials a person gets and the guides' slugs. WP-D
// adds guideFor(role), allGuides() and sectionCards() here.
import { homeFor, TEAM_ROLES, type Role, type TeamRole } from '../roles';
import type { Tour } from './types';
import { HOME_NEXT, TOURS } from './tours';

export { HOME_NEXT, HOME_SCREEN, TOURS } from './tours';
export type * from './types';

// /ayuda/<slug> for each role's guide (Administración has its own page, /ayuda/administracion).
export const GUIDE_SLUGS: Record<TeamRole, string> = {
  boss: 'jefe',
  dispatch: 'despacho',
  politics: 'politica',
  ivt: 'ivt',
  camera: 'grabacion',
  social: 'redes',
};

// The heading of someone else's guide («Tu guía» when it is the reader's own).
export const GUIDE_TITLES: Record<TeamRole, string> = {
  boss: 'Guía del jefe',
  dispatch: 'Guía de Despacho',
  politics: 'Guía de Política',
  ivt: 'Guía del IVT',
  camera: 'Guía de Grabación',
  social: 'Guía de Redes',
};

export function roleForSlug(slug: string): TeamRole | null {
  return TEAM_ROLES.find((r) => GUIDE_SLUGS[r] === slug) ?? null;
}

// The tutorial of each role's home screen, the one `bienvenida` chains to (design §6.3).
export const HOME_TOURS: Record<TeamRole, string> = {
  boss: 'jefe-inicio',
  dispatch: 'hoy-despacho',
  politics: 'municipios',
  ivt: 'obras',
  camera: 'hoy-grabacion',
  social: 'hoy-redes',
};

/** The tutorial of the person's home (homeFor(roles)), among `tours`; with two roles, the one whose home that is. */
export function homeTourFor(roles: readonly Role[], tours: readonly Tour[] = TOURS): Tour | null {
  const home = homeFor([...roles]);
  for (const r of TEAM_ROLES) {
    if (!roles.includes(r) || homeFor([r]) !== home) continue;
    const t = tours.find((x) => x.id === HOME_TOURS[r] && x.roles.includes(r));
    if (t) return t;
  }
  return null;
}

const isChatScreen = (screen: string) => /^\/mensajes(?:[/?]|$)/.test(screen);

/**
 * The tutorials of these roles: the panel passes the menu roles (menuRoles, so they follow «Ver como»). A session with
 * Administración never gets Mensajes' (an account with admin is out of Mensajes, D-49), even when viewing as a team
 * role. `bienvenida`'s `next` becomes the id of this person's home tutorial, or goes away when there is none.
 */
export function toursForRoles(roles: readonly Role[], opts: { admin?: boolean } = {}): Tour[] {
  const mine = TOURS.filter((t) => t.roles.some((r) => roles.includes(r)) && !(opts.admin && isChatScreen(t.screen)));
  return mine.map((t) => {
    if (t.next !== HOME_NEXT) return t;
    const next = homeTourFor(roles, mine)?.id;
    const rest = { ...t };
    delete rest.next;
    return next ? { ...rest, next } : rest;
  });
}
