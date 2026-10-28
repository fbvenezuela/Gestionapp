import { requireRole } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui/page';

export const metadata = { title: 'Guía de administración' };

// Administración's own guide, apart from the team's (R3, D-43).
// Paso 0 (integrator): the base page (its access). WP-D builds the screen.
export default async function AdminGuidePage() {
  await requireRole('admin');
  return <PageHeader title="Guía de administración" back={{ href: '/ayuda', label: 'Ayuda y guías' }} />;
}
