import { requireRole } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui/page';

export const metadata = { title: 'Todas las conversaciones' };

// Every conversation of the team, for the boss with 2FA (R3, D-50): the ones he is not part of he only reads.
// Paso 0 (integrator): the base page (its access). WP-B builds the screen.
export default async function AllConversationsPage() {
  await requireRole('boss');
  return <PageHeader title="Todas las conversaciones" back={{ href: '/mensajes', label: 'Mensajes' }} />;
}
