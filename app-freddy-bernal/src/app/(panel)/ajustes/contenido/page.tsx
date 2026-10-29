import { SlidersHorizontal } from 'lucide-react';
import { requireRole } from '@/lib/auth/session';
import { PageHeader, EmptyState } from '@/components/ui/page';

export const metadata = { title: 'Cupo y pilares' };

// Ajustes → Cupo y pilares (R4, D-68, D-70): the month's quota per format, the pillars and «Piezas eliminadas» with
// «Recuperar». Administración with 2FA, like the rest of Ajustes (requireSession asks for it).
// Paso 0 (integrator): the base page (its access). WP-C2 builds it and adds its link in Ajustes.
export default async function ContentSettingsPage() {
  await requireRole('admin');
  return (
    <>
      <PageHeader title="Cupo y pilares" subtitle="El cupo del mes de cada formato y los pilares del contenido." back={{ href: '/ajustes', label: 'Ajustes' }} />
      <EmptyState icon={<SlidersHorizontal className="h-8 w-8" />} title="Todavía no hay cupo ni pilares guardados." />
    </>
  );
}
