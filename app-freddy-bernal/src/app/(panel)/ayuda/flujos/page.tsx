import { requireSession } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui/page';

export const metadata = { title: 'Cómo va el trabajo entre todos' };

// The flows between roles (R3, D-44): an index, and ?f=<id> opens one.
// Paso 0 (integrator): the base page (its access). WP-D builds the screen.
export default async function FlowsPage() {
  await requireSession();
  return <PageHeader title="Cómo va el trabajo entre todos" back={{ href: '/ayuda', label: 'Ayuda y guías' }} />;
}
