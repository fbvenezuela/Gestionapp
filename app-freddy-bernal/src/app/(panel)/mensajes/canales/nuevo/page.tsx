import { requireRole, db } from '@/lib/auth/session';
import { chatPeopleForBoss } from '@/lib/data/chat';
import { canApprove } from '@/lib/data/review';
import { PageHeader } from '@/components/ui/page';
import { ChannelForm } from '@/components/chat/channel-form';
import { BossSecondFactor } from '@/components/chat/boss-second-factor';

export const metadata = { title: 'Nuevo canal' };

// «Nuevo canal» (R5, D-80): only the boss, with the second factor. A name, a short description and who goes; the
// bosses are in it on their own (the database puts them in).
export default async function NewChannelPage() {
  const s = await requireRole('boss');
  const { ok, people } = await db(s, async (sql) => ({ ok: await canApprove(sql), people: await chatPeopleForBoss(sql) }));
  return (
    <>
      <PageHeader title="Nuevo canal" back={{ href: '/mensajes', label: 'Mensajes' }} />
      {ok ? <ChannelForm mode="create" me={s.userId} people={people} /> : <BossSecondFactor />}
    </>
  );
}
