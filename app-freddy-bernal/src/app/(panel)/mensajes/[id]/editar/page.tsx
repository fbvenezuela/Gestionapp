import { notFound } from 'next/navigation';
import { Archive, ArchiveRestore } from 'lucide-react';
import { requireRole, db } from '@/lib/auth/session';
import { channelEditor } from '@/lib/data/chat';
import { canApprove } from '@/lib/data/review';
import { PageHeader } from '@/components/ui/page';
import { Card } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { ChannelForm } from '@/components/chat/channel-form';
import { ArchiveButton } from '@/components/chat/archive-button';
import { BossSecondFactor } from '@/components/chat/boss-second-factor';

// Fixed: never a channel's name in <title>.
export const metadata = { title: 'Editar canal' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// «Editar canal» (R5, D-80, D-85, D-86): the boss with the second factor changes the name, the description and who is
// in it (one «Guardar»), and archives the channel or takes it out of the archive. «Todo el equipo» is not edited here.
export default async function EditChannelPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireRole('boss');
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { ok, c } = await db(s, async (sql) => {
    const can = await canApprove(sql);
    return { ok: can, c: can ? await channelEditor(sql, id.toLowerCase()) : null };
  });
  if (!ok) {
    return (
      <>
        <PageHeader title="Editar canal" back={{ href: `/mensajes/${id}`, label: 'Volver al canal' }} />
        <BossSecondFactor />
      </>
    );
  }
  if (!c) notFound();
  return (
    <>
      <PageHeader title="Editar canal" back={{ href: `/mensajes/${c.id}`, label: c.title }} />
      <ChannelForm mode="edit" me={s.userId} people={c.people} initial={c} />
      <Card className="mt-6 flex flex-col gap-2 p-4">
        <h2 className="text-base font-semibold">{c.archived ? 'Archivado' : 'Archivar'}</h2>
        <p className="text-sm text-text-2">
          {c.archived ? 'Nadie escribe en él. Si lo sacas del archivo, vuelve a la lista tal cual.' : 'Cuando ya no se usa: se sigue leyendo en «Archivados», pero nadie escribe en él.'}
        </p>
        <div>
          <ArchiveButton id={c.id} title={c.title} archived={c.archived} className={buttonVariants({ variant: 'secondary' })}>
            {c.archived ? <ArchiveRestore className="h-4 w-4" aria-hidden /> : <Archive className="h-4 w-4" aria-hidden />}
            {c.archived ? 'Sacar del archivo' : 'Archivar canal'}
          </ArchiveButton>
        </div>
      </Card>
    </>
  );
}
