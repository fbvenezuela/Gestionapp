// The address and the heading of each role's guide (R3, D-42). Apart from index.ts so a client component (the tutorial
// engine's «Abrir la guía») can use them without carrying the guides themselves to the phone (design §4.6).
import { TEAM_ROLES, type TeamRole } from '../roles';

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
