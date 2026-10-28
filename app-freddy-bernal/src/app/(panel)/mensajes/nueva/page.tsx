import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth/session';
import { homeFor } from '@/lib/roles';
import { noPermissionUrl } from '@/components/shell/no-permission';
import { PageHeader } from '@/components/ui/page';

export const metadata = { title: 'Escribirle a alguien' };

// «Escribirle a alguien» (R3, D-49): one person or a group.
// Paso 0 (integrator): the base page (its access). WP-B builds the screen.
export default async function NewConversationPage() {
  const s = await requireRole('boss', 'dispatch', 'politics', 'ivt', 'camera', 'social');
  // An account with Administración is out of Mensajes even with a team role (D-49).
  if (s.roles.includes('admin')) redirect(noPermissionUrl(homeFor(s.roles)));
  return <PageHeader title="Escribirle a alguien" back={{ href: '/mensajes', label: 'Mensajes' }} />;
}
