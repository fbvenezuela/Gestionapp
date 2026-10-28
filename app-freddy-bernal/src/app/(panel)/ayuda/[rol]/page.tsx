import { notFound, redirect } from 'next/navigation';
import { menuRoles, requireSession } from '@/lib/auth/session';
import { homeFor } from '@/lib/roles';
import { GUIDE_TITLES, roleForSlug } from '@/lib/guides';
import { noPermissionUrl } from '@/components/shell/no-permission';
import { PageHeader } from '@/components/ui/page';

export const metadata = { title: 'Guía del rol' };

// The guide of one role (R3, D-42): /ayuda/jefe, /ayuda/despacho, /ayuda/politica, /ayuda/ivt, /ayuda/grabacion,
// /ayuda/redes. One's own role (menu roles: it follows «Ver como»), or any role for the boss and Administración.
// Paso 0 (integrator): the base page (its access). WP-D builds the screen.
export default async function RoleGuidePage({ params }: { params: Promise<{ rol: string }> }) {
  const s = await requireSession();
  const { rol } = await params;
  const role = roleForSlug(rol);
  if (!role) notFound();
  const mine = menuRoles(s).includes(role);
  if (!mine && !s.roles.includes('boss') && !s.roles.includes('admin')) redirect(noPermissionUrl(homeFor(s.roles)));
  return <PageHeader title={mine ? 'Tu guía' : GUIDE_TITLES[role]} back={{ href: '/ayuda', label: 'Ayuda y guías' }} />;
}
