import { requireRole, db } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui/page';
import { contentCategories, municipalities, peopleWithRole } from '@/lib/data/common';
import { NewEventForm } from './new-event-form';

export const metadata = { title: 'Nuevo evento' };

export default async function NewEventPage() {
  const s = await requireRole('admin', 'dispatch');
  const data = await db(s, async (sql) => ({
    categories: await contentCategories(sql),
    municipalities: await municipalities(sql),
    cameras: await peopleWithRole(sql, 'camera'),
  }));
  return (
    <>
      <PageHeader title="Nuevo evento" subtitle="La ficha técnica es la base de todo: mientras más completa, mejor sale el contenido." back={{ href: '/agenda', label: 'Agenda' }} />
      <NewEventForm {...data} />
    </>
  );
}
