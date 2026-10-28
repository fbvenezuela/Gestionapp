import { requireRole } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui/page';

export const metadata = { title: 'Quién habla con quién' };

// «Quién habla con quién» (R3, D-51): the boss opens or closes Mensajes between pairs of roles.
// Paso 0 (integrator): the base page (its access). WP-B builds the screen.
export default async function ChatRulesPage() {
  await requireRole('boss');
  return <PageHeader title="Quién habla con quién" back={{ href: '/mensajes', label: 'Mensajes' }} />;
}
