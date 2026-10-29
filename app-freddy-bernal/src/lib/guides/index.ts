// The entry point of the help content (R3, D-42): the guides of each role, the flows, the tutorials, «Para todos»,
// Administración's guide, and what 360 gets from them (sectionCards). Data only: the pages under /ayuda, the engine,
// 360 and scripts/guides-docs.mts read it from here.
import { homeFor, ROLE_LABEL, TEAM_ROLES, type Role, type TeamRole } from '../roles';
import { screenFor } from '../assistant/screens';
import type { RoleGuide, Tour } from './types';
import { HOME_NEXT, TOURS } from './tours';
import { BOSS_GUIDE } from './boss';
import { DISPATCH_GUIDE } from './dispatch';
import { POLITICS_GUIDE } from './politics';
import { IVT_GUIDE } from './ivt';
import { CAMERA_GUIDE } from './camera';
import { SOCIAL_GUIDE } from './social';

export { HOME_NEXT, HOME_SCREEN, TOURS } from './tours';
export { FLOWS, flowById } from './flows';
export { SHARED, sharedFor } from './shared';
export { ADMIN_GUIDE } from './admin';
export { GUIDE_SLUGS, GUIDE_TITLES, roleForSlug } from './slugs';
export type * from './types';

const GUIDES: Record<TeamRole, RoleGuide> = {
  boss: BOSS_GUIDE,
  dispatch: DISPATCH_GUIDE,
  politics: POLITICS_GUIDE,
  ivt: IVT_GUIDE,
  camera: CAMERA_GUIDE,
  social: SOCIAL_GUIDE,
};

export function guideFor(role: TeamRole): RoleGuide {
  return GUIDES[role];
}

/** The six guides, in the team's order. */
export function allGuides(): RoleGuide[] {
  return TEAM_ROLES.map((r) => GUIDES[r]);
}

/** The team roles among these (a person's menu roles), in the team's order. */
export function teamRolesOf(roles: readonly Role[]): TeamRole[] {
  return TEAM_ROLES.filter((r) => roles.includes(r));
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

/** Where a tutorial starts: its screen with ?tutorial=<id> (and its ?tab=), or null when the screen needs an id. */
export function tourHref(t: Tour, home: string): string | null {
  const screen = t.screen === '@home' ? home : t.screen;
  if (screen.includes('[')) return null;
  return `${screen}${screen.includes('?') ? '&' : '?'}tutorial=${t.id}`;
}

export type SectionCard = { key: string; roles: TeamRole[]; title: string; tags: string[]; body: string };

/**
 * 360's section cards (design §8.4): one per screen and role, `seccion:<screen>:<role>`, with what the screen is for
 * and what that role does there. The seed adds them with «no pisar»; they are not in the general scoring.
 */
export function sectionCards(): SectionCard[] {
  return allGuides().flatMap((g) =>
    g.sections.map((s) => {
      const screen = screenFor(s.screen);
      const tags = [...new Set([s.title, screen?.label, ...(screen?.nav ?? [])].filter((x): x is string => !!x))];
      return {
        key: `seccion:${s.screen}:${g.role}`,
        roles: [g.role],
        title: `${s.title} (${ROLE_LABEL[g.role]})`,
        tags,
        body: [s.what, ...s.youDo].join(' '),
      };
    }),
  );
}
