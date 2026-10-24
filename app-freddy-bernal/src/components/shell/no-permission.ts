// Shared by requireRole() (server) and the banner (client): where to send someone who opens a
// screen that is not for their role.
export const NO_PERMISSION_PARAM = 'sin-permiso';

export function noPermissionUrl(home: string): string {
  return `${home}${home.includes('?') ? '&' : '?'}${NO_PERMISSION_PARAM}=1`;
}
