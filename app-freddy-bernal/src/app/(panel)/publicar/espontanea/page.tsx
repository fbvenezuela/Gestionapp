import { requireRole } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui/page';
import { SpontaneousForm } from './spontaneous-form';

export const metadata = { title: 'Lo que publicó el jefe' };

export default async function SpontaneousPage() {
  await requireRole('admin', 'social', 'boss');
  return (
    <>
      <PageHeader
        title="Registrar lo que publicó el jefe"
        subtitle="Para lo que el jefe subió por su cuenta (un video espontáneo, una historia). Se registra después, con su link, para que cuente en resultados."
        back={{ href: '/publicar', label: 'Publicar' }}
      />
      <SpontaneousForm />
    </>
  );
}
