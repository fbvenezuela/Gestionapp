import { requireRole, db } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui/page';
import { contentCategories, municipalities, peopleWithRole } from '@/lib/data/common';
import { NewEventForm } from './new-event-form';

export const metadata = { title: 'Nuevo evento' };

// The boss and despacho put things on the shared agenda (§3). What the boss creates is accepted at once; despacho's
// waits for him. «Visita de obra» (?tipo=obra) is the same form, marked as a visit.
export default async function NewEventPage({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const s = await requireRole('boss', 'dispatch');
  const { tipo } = await searchParams;
  const kind = tipo === 'obra' ? 'obra_visit' : 'event';
  const data = await db(s, async (sql) => ({
    categories: await contentCategories(sql),
    municipalities: await municipalities(sql),
    cameras: await peopleWithRole(sql, 'camera'),
  }));
  const boss = s.roles.includes('boss') && !s.roles.includes('dispatch');
  return (
    <>
      <PageHeader
        title={kind === 'obra_visit' ? 'Nueva visita de obra' : 'Nuevo evento'}
        subtitle={
          boss
            ? 'Queda aceptado de una vez en tu agenda; el despacho se entera.'
            : 'La ficha técnica es la base de todo: mientras más completa, mejor sale el contenido. Llega al jefe «por decidir».'
        }
        back={{ href: '/agenda', label: 'Agenda' }}
      />
      <NewEventForm key={kind} kind={kind} {...data} />
    </>
  );
}
