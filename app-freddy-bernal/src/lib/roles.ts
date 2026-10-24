// Role names and menus. This decides only what each person SEES in the menu;
// what they can read or change is decided by the database (RLS).

export const ROLES = [
  'admin',
  'boss',
  'dispatch',
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
  secretary: 'Secretaría',
  social: 'Redes',
  supervisor: 'Supervisión política',
  camera: 'Grabación',
  writer: 'Redactor',
  reports_operator: 'Operador de reportes',
  complaints_operator: 'Operador de denuncias',
  aid_operator: 'Operador de ayudas',
};

// Roles that can be invited today (phase 1). The rest arrive with the public site.
export const INVITABLE_ROLES: Role[] = ['admin', 'boss', 'dispatch', 'secretary', 'social', 'supervisor', 'camera'];

export type NavItem = { href: string; label: string; icon: string; roles: Role[]; mobile?: Role[] };

// Order matters: the first 4-5 visible items for a role go to the mobile bottom bar
// (`mobile` lists the roles that get the item in the bar).
export const NAV: NavItem[] = [
  { href: '/jefe', label: 'Inicio', icon: 'home', roles: ['boss'], mobile: ['boss'] },
  { href: '/hoy', label: 'Hoy', icon: 'sun', roles: ['admin', 'dispatch', 'secretary', 'social', 'supervisor', 'camera'], mobile: ['admin', 'dispatch', 'secretary', 'social', 'supervisor', 'camera'] },
  { href: '/agenda', label: 'Agenda', icon: 'calendar', roles: ['admin', 'boss', 'dispatch', 'secretary', 'social', 'camera'], mobile: ['admin', 'boss', 'dispatch', 'secretary', 'social', 'camera'] },
  { href: '/aprobar', label: 'Por aprobar', icon: 'check', roles: ['supervisor', 'admin', 'boss'], mobile: ['supervisor', 'boss'] },
  { href: '/piezas', label: 'Piezas', icon: 'film', roles: ['admin', 'social'], mobile: ['admin', 'social'] },
  { href: '/tweets', label: 'Tweets', icon: 'message', roles: ['admin', 'social', 'supervisor'], mobile: ['social'] },
  { href: '/publicar', label: 'Publicar', icon: 'send', roles: ['admin', 'social'], mobile: ['social'] },
  { href: '/resultados', label: 'Resultados', icon: 'chart', roles: ['admin', 'social', 'supervisor', 'boss'], mobile: ['supervisor', 'boss'] },
  { href: '/biblioteca', label: 'Biblioteca', icon: 'folder', roles: ['admin', 'social', 'supervisor', 'dispatch'], mobile: ['dispatch'] },
  { href: '/jefe/digital', label: 'Digital', icon: 'sparkles', roles: ['boss'], mobile: ['boss'] },
  { href: '/ajustes', label: 'Ajustes', icon: 'settings', roles: ['admin'], mobile: ['admin'] },
];

export function navFor(roles: Role[]) {
  const visible = NAV.filter((n) => n.roles.some((r) => roles.includes(r)));
  const mobile = visible.filter((n) => n.mobile?.some((r) => roles.includes(r))).slice(0, 5);
  return { visible, mobile };
}

export function homeFor(roles: Role[]): string {
  if (roles.includes('boss') && !roles.includes('admin')) return '/jefe';
  return '/hoy';
}

export function canSeeSchedule(roles: Role[]) {
  return roles.some((r) => r === 'admin' || r === 'boss' || r === 'dispatch');
}
