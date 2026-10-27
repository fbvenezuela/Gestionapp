// Role names and menus. This decides only what each person SEES in the menu;
// what they can read or change is decided by the database (RLS).

// Same values and order as the enum public.app_role (tests/unit/roles.test.ts checks it).
export const ROLES = [
  'admin',
  'boss',
  'dispatch',
  'politics',
  'ivt',
  'secretary',
  'social',
  'supervisor',
  'camera',
  'writer',
  'reports_operator',
  'complaints_operator',
  'aid_operator',
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administración',
  boss: 'Jefe',
  dispatch: 'Director de despacho',
  politics: 'Director de política',
  ivt: 'Director del IVT',
  // Retired on 27/10/2026: kept so the history (register, old approvals) still reads.
  secretary: 'Secretaría',
  social: 'Redes',
  supervisor: 'Supervisión política',
  camera: 'Grabación',
  writer: 'Redactor',
  reports_operator: 'Operador de reportes',
  complaints_operator: 'Operador de denuncias',
  aid_operator: 'Operador de ayudas',
};

// The team (cambios del 27/10/2026): six roles, «más nada». The lists in «Ver como…», the guides and the assistant.
export const TEAM_ROLES = ['boss', 'dispatch', 'politics', 'ivt', 'camera', 'social'] as const satisfies readonly Role[];
// What admin can give: the team plus Administración, the technical role (never in team lists or guides). The
// database refuses anything else (user_roles_assignable, guard_invitation_roles).
export const INVITABLE_ROLES = [...TEAM_ROLES, 'admin'] as const satisfies readonly Role[];
// No longer given; their history stays.
export const RETIRED_ROLES = ['secretary', 'supervisor'] as const satisfies readonly Role[];
// Phase 3 (public site): in the enum, not assignable yet.
export const FUTURE_ROLES = ['writer', 'reports_operator', 'complaints_operator', 'aid_operator'] as const satisfies readonly Role[];

export type TeamRole = (typeof TEAM_ROLES)[number];
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export function isTeamRole(r: string | null | undefined): r is TeamRole {
  return (TEAM_ROLES as readonly string[]).includes(r ?? '');
}

export function isInvitableRole(r: string | null | undefined): r is InvitableRole {
  return (INVITABLE_ROLES as readonly string[]).includes(r ?? '');
}

export type NavItem = { href: string; label: string; icon: string; roles: Role[]; mobile?: Role[] };

// Order matters: the first 4-5 visible items for a role go to the mobile bottom bar
// (`mobile` lists the roles that get the item in the bar).
// The boss «tiene todo, hasta lo de redes»: the Redes screens are in his menu (on the phone, under «Más»).
export const NAV: NavItem[] = [
  { href: '/jefe', label: 'Inicio', icon: 'home', roles: ['boss'], mobile: ['boss'] },
  { href: '/hoy', label: 'Hoy', icon: 'sun', roles: ['admin', 'dispatch', 'politics', 'ivt', 'social', 'camera'], mobile: ['admin', 'dispatch', 'politics', 'ivt', 'social', 'camera'] },
  { href: '/agenda', label: 'Agenda', icon: 'calendar', roles: ['admin', 'boss', 'dispatch', 'social', 'camera'], mobile: ['admin', 'boss', 'dispatch', 'social', 'camera'] },
  { href: '/aprobar', label: 'Por aprobar', icon: 'check', roles: ['boss', 'admin'], mobile: ['boss'] },
  { href: '/piezas', label: 'Piezas', icon: 'film', roles: ['admin', 'social', 'boss'], mobile: ['admin', 'social'] },
  { href: '/tweets', label: 'Tweets', icon: 'message', roles: ['admin', 'social', 'boss'], mobile: ['social'] },
  { href: '/publicar', label: 'Publicar', icon: 'send', roles: ['admin', 'social', 'boss'], mobile: ['social'] },
  { href: '/resultados', label: 'Resultados', icon: 'chart', roles: ['admin', 'social', 'boss'] },
  { href: '/biblioteca', label: 'Biblioteca', icon: 'folder', roles: ['admin', 'social', 'dispatch', 'boss'], mobile: ['dispatch'] },
  { href: '/jefe/digital', label: 'Digital', icon: 'sparkles', roles: ['boss'], mobile: ['boss'] },
  { href: '/ajustes', label: 'Ajustes', icon: 'settings', roles: ['admin'], mobile: ['admin'] },
];

// The «Crear» menu in the top bar. Each entry mirrors what the database lets that role insert.
export const CREATE_ITEMS: { href: string; label: string; roles: Role[] }[] = [
  { href: '/agenda/nuevo', label: 'Nuevo evento', roles: ['admin', 'dispatch'] },
  { href: '/piezas/nueva', label: 'Nueva pieza', roles: ['admin', 'social', 'boss'] },
  { href: '/tweets/nueva', label: 'Tweets de la semana', roles: ['admin', 'social', 'boss'] },
  { href: '/publicar/nueva', label: 'Nueva publicación', roles: ['admin', 'social', 'boss'] },
];

export function createFor(roles: Role[]) {
  return CREATE_ITEMS.filter((c) => c.roles.some((r) => roles.includes(r)));
}

export function navFor(roles: Role[]) {
  const visible = NAV.filter((n) => n.roles.some((r) => roles.includes(r)));
  const flagged = visible.filter((n) => n.mobile?.some((r) => roles.includes(r)));
  // Phone bar: up to 5 slots. If anything does not fit, the 5th slot becomes «Más»
  // with the rest, so every page in the menu can be reached from the phone.
  const fits = flagged.length === visible.length && flagged.length <= 5;
  const mobile = fits ? flagged : flagged.slice(0, 4);
  const more = visible.filter((n) => !mobile.includes(n));
  return { visible, mobile, more };
}

// Where each person lands. Director de política and Director del IVT land on Hoy until their own screens
// (fichas de obra, municipios) arrive.
export function homeFor(roles: Role[]): string {
  if (roles.includes('boss') && !roles.includes('admin')) return '/jefe';
  return '/hoy';
}

export function canSeeSchedule(roles: Role[]) {
  return roles.some((r) => r === 'admin' || r === 'boss' || r === 'dispatch');
}
