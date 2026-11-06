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
  'web_publisher',
  'attention_coordinator',
  'reports_operator',
  'complaints_operator',
  'aid_operator',
  'auditor',
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
  // The public website and the citizen attention desk (D-93, 06/11/2026).
  writer: 'Editor de la web',
  web_publisher: 'Aprobador de la web',
  attention_coordinator: 'Coordinador de atención',
  reports_operator: 'Responsable de área',
  complaints_operator: 'Operador de denuncias',
  aid_operator: 'Operador de ayudas',
  auditor: 'Consulta y auditoría',
};

// The team (cambios del 27/10/2026): six roles, «más nada». The lists in «Ver como…», the guides and the assistant.
export const TEAM_ROLES = ['boss', 'dispatch', 'politics', 'ivt', 'camera', 'social'] as const satisfies readonly Role[];
// The team plus Administración, the technical role (never in team lists or guides): who the assistant 360 serves, its
// knowledge cards, scripts and notices.
export const STAFF_ROLES = [...TEAM_ROLES, 'admin'] as const satisfies readonly Role[];
// No longer given; their history stays.
export const RETIRED_ROLES = ['secretary', 'supervisor'] as const satisfies readonly Role[];
// The public website and the citizen attention desk (D-93): the database gives them since
// 20261106000100_web_publica.sql (user_roles_assignable, guard_invitation_roles), always with 2FA and never in the same
// account as Administración (except the editor). No 360, guides, tutorials or Mensajes: they are not the team.
export const WEB_ROLES = ['writer', 'web_publisher', 'attention_coordinator', 'reports_operator', 'complaints_operator', 'auditor'] as const satisfies readonly Role[];
// What admin can give in Ajustes → Equipo: the team, Administración and the web's and the attention desk's roles (a
// responsible of an area with its areas). The database refuses anything else (user_roles_assignable,
// guard_invitation_roles) and the mixes with Administración (guard_role_mix).
export const INVITABLE_ROLES = [...STAFF_ROLES, ...WEB_ROLES] as const satisfies readonly Role[];
// Its two halves: the website's content (/admin/web) and the citizen requests (/admin/atencion).
export const WEB_CONTENT_ROLES = ['writer', 'web_publisher'] as const satisfies readonly Role[];
export const ATTENTION_ROLES = ['attention_coordinator', 'reports_operator', 'complaints_operator', 'auditor'] as const satisfies readonly Role[];
// Always with the second factor, whatever the editable list 'security.mfa_roles' says: every gate of the web and the
// attention desk asks the token for it (is_aal2(), 20261106000100_web_publica.sql), so without it they would see nothing.
export const MFA_ALWAYS: readonly Role[] = WEB_ROLES;
// In the enum, not assignable.
export const FUTURE_ROLES = ['aid_operator'] as const satisfies readonly Role[];

export type TeamRole = (typeof TEAM_ROLES)[number];
export type StaffRole = (typeof STAFF_ROLES)[number];
export type InvitableRole = (typeof INVITABLE_ROLES)[number];
export type WebRole = (typeof WEB_ROLES)[number];

export function isTeamRole(r: string | null | undefined): r is TeamRole {
  return (TEAM_ROLES as readonly string[]).includes(r ?? '');
}

export function isStaffRole(r: string | null | undefined): r is StaffRole {
  return (STAFF_ROLES as readonly string[]).includes(r ?? '');
}

export function isInvitableRole(r: string | null | undefined): r is InvitableRole {
  return (INVITABLE_ROLES as readonly string[]).includes(r ?? '');
}

export function isWebRole(r: string | null | undefined): r is WebRole {
  return (WEB_ROLES as readonly string[]).includes(r ?? '');
}

// Administración never holds the boss's or despacho's role in the same account: only the boss approves and only the
// boss and despacho write the agenda (D-41). The database refuses it too (guard_role_mix, guard_invitation_roles).
const NOT_WITH_ADMIN: readonly Role[] = ['boss', 'dispatch'];
// Nor the web's publisher or a role that reads the citizen requests (D-93: Administración never publishes and never
// reads a case); the editor of the web may share the account.
const NOT_WITH_ADMIN_WEB: readonly Role[] = ['web_publisher', 'attention_coordinator', 'reports_operator', 'complaints_operator', 'auditor'];
export const SELF_GRANT_MESSAGE = 'Tus propios roles los da otra persona de administración.';
export const ROLE_MIX_MESSAGE = 'Administración no puede ser también el jefe ni el despacho: usa otra cuenta.';
export const ADMIN_WEB_MIX_MESSAGE = 'Administración no publica la web ni lee las solicitudes ciudadanas: usa otra cuenta.';
// The boss reads every conversation and approves everything: the role is given only by the system, with
// `npm run db:first-admin -- <correo> "<nombre>" --jefe` (D-58; guard_boss_grant, 20261028002350_boss_grant.sql).
export const BOSS_GRANT_MESSAGE = 'El rol de jefe lo da el comando de instalación.';

/** Why this role cannot be given (on) to this person, or null. Taking a role away is never refused here. Your own
 * roles and the mix with Administración say so first (the more specific reason); then the boss's role, never here. */
export function roleGrantProblem(p: { isSelf: boolean; roles: readonly Role[]; role: Role }): string | null {
  if (p.roles.includes(p.role)) return null;
  if (p.isSelf) return SELF_GRANT_MESSAGE;
  const mixes = (list: readonly Role[]) => (p.role === 'admin' ? p.roles.some((r) => list.includes(r)) : list.includes(p.role) && p.roles.includes('admin'));
  if (mixes(NOT_WITH_ADMIN)) return ROLE_MIX_MESSAGE;
  if (mixes(NOT_WITH_ADMIN_WEB)) return ADMIN_WEB_MIX_MESSAGE;
  return p.role === 'boss' ? BOSS_GRANT_MESSAGE : null;
}

// Who reads a community report's contacts (§4.2: «solo las ven el director de política, el despacho y el jefe»), with
// 2FA. Administración keeps the main part only (community_report_private policies, D-41).
export function canSeeReportContacts(roles: readonly Role[]) {
  return roles.some((r) => r === 'boss' || r === 'dispatch' || r === 'politics');
}

// `also`: screens a hub item stands for (Redes for the boss): it lights up there when no item of that menu is the screen's own.
export type NavItem = { href: string; label: string; icon: string; roles: Role[]; mobile?: Role[]; also?: string[] };

// Order matters: the first 4-5 visible items for a role go to the mobile bottom bar
// (`mobile` lists the roles that get the item in the bar).
// The boss «tiene todo, hasta lo de redes» (§3): his menu is Inicio, Agenda, Por aprobar, Redes, Obras, Municipios and
// Digital; «Redes» is his door to the same screens Redes uses (Tweets, Publicar, Resultados, Biblioteca), which he still
// opens. On the phone: Inicio, Agenda, Por aprobar, Redes and «Más».
// «Redes» is also Redes' and administración's (R4, D-60): it opens the board of Redes by format (Reels, Posts…, the feed)
// where «Piezas» used to be. Redes: Hoy, Agenda, Redes, Tweets, Publicar, Resultados, Biblioteca (phone: Hoy, Agenda,
// Redes, Tweets and «Más»). /piezas sends to /redes; each piece keeps its address /piezas/[id].
// Director del IVT and Director de política land on their own screens (Obras, Municipios) instead of Hoy.
export const NAV: NavItem[] = [
  { href: '/jefe', label: 'Inicio', icon: 'home', roles: ['boss'], mobile: ['boss'] },
  { href: '/hoy', label: 'Hoy', icon: 'sun', roles: ['admin', 'dispatch', 'social', 'camera'], mobile: ['admin', 'dispatch', 'social', 'camera'] },
  // The IVT's agenda is «Mis visitas de obra» (the visits born from its fichas, with their date).
  { href: '/agenda', label: 'Agenda', icon: 'calendar', roles: ['admin', 'boss', 'dispatch', 'social', 'camera', 'ivt'], mobile: ['admin', 'boss', 'dispatch', 'social', 'camera', 'ivt'] },
  { href: '/aprobar', label: 'Por aprobar', icon: 'check', roles: ['boss', 'admin'], mobile: ['boss'] },
  { href: '/redes', label: 'Redes', icon: 'megaphone', roles: ['admin', 'social', 'boss'], mobile: ['admin', 'social', 'boss'], also: ['/piezas', '/tweets', '/publicar', '/resultados', '/biblioteca'] },
  { href: '/obras', label: 'Obras', icon: 'hardhat', roles: ['admin', 'boss', 'dispatch', 'ivt'], mobile: ['dispatch', 'ivt'] },
  { href: '/municipios', label: 'Municipios', icon: 'map', roles: ['admin', 'boss', 'dispatch', 'politics'], mobile: ['dispatch', 'politics'] },
  { href: '/tweets', label: 'Tweets', icon: 'message', roles: ['admin', 'social'], mobile: ['social'] },
  { href: '/publicar', label: 'Publicar', icon: 'send', roles: ['admin', 'social'], mobile: ['social'] },
  { href: '/resultados', label: 'Resultados', icon: 'chart', roles: ['admin', 'social'] },
  { href: '/biblioteca', label: 'Biblioteca', icon: 'folder', roles: ['admin', 'social', 'dispatch'], mobile: ['dispatch'] },
  { href: '/jefe/digital', label: 'Digital', icon: 'sparkles', roles: ['boss'] },
  // The public website and the citizen attention desk (D-91, D-93): their own screens, inside the panel. The editors and
  // publishers get «Web», the four roles of the attention desk get «Atención» (in their phone bar). The boss also has
  // both (he approves and publishes the web, reads the requests but denuncias, and their figures). Administración too,
  // each one where its permissions are: its «Web» opens the site's settings (the settings and the redirects are all it
  // changes there: it never writes or publishes content) and lights up on the other screens of the web; its «Atención»,
  // the desk's areas, catalogues and plazos (never a case). In «Más» on the phone.
  { href: '/admin/web', label: 'Web', icon: 'globe', roles: ['writer', 'web_publisher', 'boss'], mobile: ['writer', 'web_publisher'] },
  { href: '/admin/web/ajustes', label: 'Web', icon: 'globe', roles: ['admin'], also: ['/admin/web'] },
  { href: '/admin/atencion', label: 'Atención', icon: 'inbox', roles: [...ATTENTION_ROLES, 'boss', 'admin'], mobile: [...ATTENTION_ROLES] },
  { href: '/ajustes', label: 'Ajustes', icon: 'settings', roles: ['admin'], mobile: ['admin'] },
];

// The «Crear» menu in the top bar. Each entry mirrors what the database lets that role insert. The agenda is the
// boss's and despacho's (can_manage_agenda()); administración reads it only.
export const CREATE_ITEMS: { href: string; label: string; roles: Role[] }[] = [
  { href: '/agenda/nuevo', label: 'Nuevo evento', roles: ['boss', 'dispatch'] },
  { href: '/agenda/nuevo?tipo=obra', label: 'Visita de obra', roles: ['boss', 'dispatch'] },
  { href: '/obras/nueva', label: 'Ficha de obra', roles: ['admin', 'boss', 'dispatch', 'ivt'] },
  // Not Administración: the report's contacts are política's, despacho's and the boss's only (D-41).
  { href: '/reportes/nuevo', label: 'Ficha comunitaria', roles: ['boss', 'dispatch', 'politics'] },
  // «¿Qué quieres crear?» on the board of Redes (R4, D-70); /piezas/nueva stays for a piece born from an event.
  { href: '/redes?crear=1', label: 'Nueva pieza', roles: ['admin', 'social', 'boss'] },
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
  // One item per label: an account that is Administración and also edits the web gets the editor's «Web» (the first).
  const visible = NAV.filter((n) => n.roles.some((r) => roles.includes(r))).filter((n, i, all) => all.findIndex((o) => o.label === n.label) === i);
  const flagged = visible.filter((n) => n.mobile?.some((r) => roles.includes(r)));
  // Phone bar: up to 5 slots. If anything does not fit, the 5th slot becomes «Más»
  // with the rest, so every page in the menu can be reached from the phone.
  const fits = flagged.length === visible.length && flagged.length <= 5;
  const mobile = fits ? flagged : flagged.slice(0, 4);
  const more = visible.filter((n) => !mobile.includes(n));
  return { visible, mobile, more };
}

// Where each person lands. The boss on his Inicio; the Director del IVT on the obra fichas and the Director de
// política on the municipalities (cambios del 27/10/2026, §4), when that is their only role. The web's and the attention
// desk's people (D-91) on their screen when that is all they do: the requests first (they have due dates), then the
// website. Someone of the team who also edits the web keeps the team's home.
export function homeFor(roles: Role[]): string {
  if (roles.includes('boss') && !roles.includes('admin')) return '/jefe';
  if (roles.length && roles.every((r) => r === 'ivt')) return '/obras';
  if (roles.length && roles.every((r) => r === 'politics')) return '/municipios';
  if (roles.length && roles.every((r) => isWebRole(r))) {
    return roles.some((r) => (ATTENTION_ROLES as readonly Role[]).includes(r)) ? '/admin/atencion' : '/admin/web';
  }
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
