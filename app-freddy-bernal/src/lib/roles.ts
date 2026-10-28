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

// `also`: screens a hub item stands for (Redes for the boss): it lights up there when no item of that menu is the screen's own.
export type NavItem = { href: string; label: string; icon: string; roles: Role[]; mobile?: Role[]; also?: string[] };

// Order matters: the first 4-5 visible items for a role go to the mobile bottom bar
// (`mobile` lists the roles that get the item in the bar).
// The boss «tiene todo, hasta lo de redes» (§3): his menu is Inicio, Agenda, Por aprobar, Redes, Obras, Municipios and
// Digital; «Redes» is his door to the same screens Redes uses (Piezas, Tweets, Publicar, Resultados, Biblioteca), which
// he still opens. On the phone: Inicio, Agenda, Por aprobar, Redes and «Más».
// Director del IVT and Director de política land on their own screens (Obras, Municipios) instead of Hoy.
export const NAV: NavItem[] = [
  { href: '/jefe', label: 'Inicio', icon: 'home', roles: ['boss'], mobile: ['boss'] },
  { href: '/hoy', label: 'Hoy', icon: 'sun', roles: ['admin', 'dispatch', 'social', 'camera'], mobile: ['admin', 'dispatch', 'social', 'camera'] },
  // The IVT's agenda is «Mis visitas de obra» (the visits born from its fichas, with their date).
  { href: '/agenda', label: 'Agenda', icon: 'calendar', roles: ['admin', 'boss', 'dispatch', 'social', 'camera', 'ivt'], mobile: ['admin', 'boss', 'dispatch', 'social', 'camera', 'ivt'] },
  { href: '/aprobar', label: 'Por aprobar', icon: 'check', roles: ['boss', 'admin'], mobile: ['boss'] },
  { href: '/redes', label: 'Redes', icon: 'megaphone', roles: ['boss'], mobile: ['boss'], also: ['/piezas', '/tweets', '/publicar', '/resultados', '/biblioteca'] },
  { href: '/obras', label: 'Obras', icon: 'hardhat', roles: ['admin', 'boss', 'dispatch', 'ivt'], mobile: ['dispatch', 'ivt'] },
  { href: '/municipios', label: 'Municipios', icon: 'map', roles: ['admin', 'boss', 'dispatch', 'politics'], mobile: ['dispatch', 'politics'] },
  { href: '/piezas', label: 'Piezas', icon: 'film', roles: ['admin', 'social'], mobile: ['admin', 'social'] },
  { href: '/tweets', label: 'Tweets', icon: 'message', roles: ['admin', 'social'], mobile: ['social'] },
  { href: '/publicar', label: 'Publicar', icon: 'send', roles: ['admin', 'social'], mobile: ['social'] },
  { href: '/resultados', label: 'Resultados', icon: 'chart', roles: ['admin', 'social'] },
  { href: '/biblioteca', label: 'Biblioteca', icon: 'folder', roles: ['admin', 'social', 'dispatch'], mobile: ['dispatch'] },
  { href: '/jefe/digital', label: 'Digital', icon: 'sparkles', roles: ['boss'] },
  { href: '/ajustes', label: 'Ajustes', icon: 'settings', roles: ['admin'], mobile: ['admin'] },
];

// The «Crear» menu in the top bar. Each entry mirrors what the database lets that role insert. The agenda is the
// boss's and despacho's (can_manage_agenda()); administración reads it only.
export const CREATE_ITEMS: { href: string; label: string; roles: Role[] }[] = [
  { href: '/agenda/nuevo', label: 'Nuevo evento', roles: ['boss', 'dispatch'] },
  { href: '/agenda/nuevo?tipo=obra', label: 'Visita de obra', roles: ['boss', 'dispatch'] },
  { href: '/obras/nueva', label: 'Ficha de obra', roles: ['admin', 'boss', 'dispatch', 'ivt'] },
  { href: '/reportes/nuevo', label: 'Ficha comunitaria', roles: ['admin', 'boss', 'dispatch', 'politics'] },
  { href: '/piezas/nueva', label: 'Nueva pieza', roles: ['admin', 'social', 'boss'] },
  { href: '/tweets/nueva', label: 'Tweets de la semana', roles: ['admin', 'social', 'boss'] },
  { href: '/publicar/nueva', label: 'Nueva publicación', roles: ['admin', 'social', 'boss'] },
];

export function createFor(roles: Role[]) {
  return CREATE_ITEMS.filter((c) => c.roles.some((r) => roles.includes(r)));
}

function onScreen(pathname: string, href: string) {
  // The boss's Inicio also covers Política (its own screen, reached from the tile).
  if (href === '/jefe') return pathname === '/jefe' || pathname.startsWith('/jefe/politica');
  return pathname === href || pathname.startsWith(href + '/');
}

/** Whether a menu item is the current screen: its own path, or (a hub like Redes) one it stands for that has no item of
 * its own in this menu (`menu` = every item this person has, bar and «Más» together). */
export function isNavActive(pathname: string, item: NavItem, menu: NavItem[]): boolean {
  if (onScreen(pathname, item.href)) return true;
  return !!item.also?.some((h) => onScreen(pathname, h)) && !menu.some((o) => onScreen(pathname, o.href));
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

// Where each person lands. The boss on his Inicio; the Director del IVT on the obra fichas and the Director de
// política on the municipalities (cambios del 27/10/2026, §4), when that is their only role.
export function homeFor(roles: Role[]): string {
  if (roles.includes('boss') && !roles.includes('admin')) return '/jefe';
  if (roles.length && roles.every((r) => r === 'ivt')) return '/obras';
  if (roles.length && roles.every((r) => r === 'politics')) return '/municipios';
  return '/hoy';
}

export function canSeeSchedule(roles: Role[]) {
  return roles.some((r) => r === 'admin' || r === 'boss' || r === 'dispatch');
}

// Who writes the agenda (create, put the date, move, cancel): the boss and despacho. The database decides too
// (can_manage_agenda(), with 2FA).
export function canManageAgenda(roles: Role[]) {
  return roles.some((r) => r === 'boss' || r === 'dispatch');
}
