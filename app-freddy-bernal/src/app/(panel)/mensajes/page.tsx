import { redirect } from 'next/navigation';
import { MessagesSquare, PenSquare } from 'lucide-react';
import { requireRole, db } from '@/lib/auth/session';
import { homeFor } from '@/lib/roles';
import { isDemo } from '@/lib/env';
import { myConversations, noticeAccepted } from '@/lib/data/chat';
import { noPermissionUrl } from '@/components/shell/no-permission';
import { PageHeader, EmptyState } from '@/components/ui/page';
import { LinkButton } from '@/components/ui/button';
import { ChatNotice } from '@/components/chat/chat-notice';
import { ChatAckDialog } from '@/components/chat/chat-ack-dialog';
import { ChatTabs } from '@/components/chat/chat-tabs';
import { ConversationList } from '@/components/chat/conversation-list';

export const metadata = { title: 'Mensajes' };

// Mensajes (R3, D-49): the person's conversations; for the boss also «Todas» and «Quién habla con quién». The notice
// is always on top (D-50) and the first time a dialog asks to accept it (D-59).
export default async function MessagesPage() {
  const s = await requireRole('boss', 'dispatch', 'politics', 'ivt', 'camera', 'social');
  // An account with Administración is out of Mensajes even with a team role (D-49).
  if (s.roles.includes('admin')) redirect(noPermissionUrl(homeFor(s.roles)));
  const { rows, accepted } = await db(s, async (sql) => ({ rows: await myConversations(sql, s), accepted: await noticeAccepted(sql) }));
  const demo = isDemo();
  const others = rows.filter((r) => r.kind !== 'team');
  const write = (
    <span data-tour="chat-new">
      <LinkButton href="/mensajes/nueva">
        <PenSquare className="h-4 w-4" aria-hidden /> Escribirle a alguien
      </LinkButton>
    </span>
  );
  return (
    <>
      <ChatAckDialog accepted={accepted} demo={demo} />
      <PageHeader title="Mensajes" actions={write} />
      {s.roles.includes('boss') ? <ChatTabs current="mias" /> : null}
      <ChatNotice demo={demo} />
      <ConversationList rows={rows} />
      {others.length === 0 ? (
        <div className="mt-4">
          <EmptyState icon={<MessagesSquare className="h-8 w-8" />} title="Todavía no tienes conversaciones." action={<LinkButton href="/mensajes/nueva" variant="secondary">Escribirle a alguien</LinkButton>} />
        </div>
      ) : null}
    </>
  );
}
