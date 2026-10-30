import { redirect } from 'next/navigation';
import { Hash, Plus } from 'lucide-react';
import { requireRole, db } from '@/lib/auth/session';
import { homeFor } from '@/lib/roles';
import { CHAT_EMPTY_BOSS, CHAT_EMPTY_MEMBER } from '@/lib/domain/chat';
import { myChannels } from '@/lib/data/chat';
import { noPermissionUrl } from '@/components/shell/no-permission';
import { PageHeader, EmptyState } from '@/components/ui/page';
import { LinkButton } from '@/components/ui/button';
import { ChannelList } from '@/components/chat/channel-list';

export const metadata = { title: 'Mensajes' };

// Mensajes (R5, D-79): «Todo el equipo» and the channels the person is in. The boss arms them («Nuevo canal») and is
// in every one. No notice: each channel shows who is in it.
export default async function MessagesPage() {
  const s = await requireRole('boss', 'dispatch', 'politics', 'ivt', 'camera', 'social');
  // An account with Administración is out of Mensajes even with a team role (D-82).
  if (s.roles.includes('admin')) redirect(noPermissionUrl(homeFor(s.roles)));
  const { rows, archived } = await db(s, (sql) => myChannels(sql, s));
  const boss = s.roles.includes('boss');
  const channels = rows.filter((r) => r.kind !== 'team').length + archived.length;
  const newChannel = (
    <span data-tour="chat-new-channel">
      <LinkButton href="/mensajes/canales/nuevo">
        <Plus className="h-4 w-4" aria-hidden /> Nuevo canal
      </LinkButton>
    </span>
  );
  return (
    <>
      <PageHeader title="Mensajes" actions={boss ? newChannel : undefined} />
      <ChannelList rows={rows} archived={archived} />
      {channels === 0 ? (
        boss ? (
          <div className="mt-4">
            <EmptyState icon={<Hash className="h-8 w-8" />} title={CHAT_EMPTY_BOSS} />
          </div>
        ) : (
          <p className="mt-4 px-1 text-[15px] text-text-2">{CHAT_EMPTY_MEMBER}</p>
        )
      ) : null}
    </>
  );
}
