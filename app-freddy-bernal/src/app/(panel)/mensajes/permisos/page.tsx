import { requireRole, db } from '@/lib/auth/session';
import { isDemo } from '@/lib/env';
import { chatRules } from '@/lib/data/chat';
import { PageHeader } from '@/components/ui/page';
import { ChatTabs } from '@/components/chat/chat-tabs';
import { RulesEditor } from '@/components/chat/rules-editor';

export const metadata = { title: 'Quién habla con quién' };

// «Quién habla con quién» (R3, D-51): the boss opens or closes Mensajes between pairs of roles, and decides whether
// only he writes in «Todo el equipo». Administración does not (RLS).
export default async function ChatRulesPage() {
  const s = await requireRole('boss');
  const { pairs, team } = await db(s, (sql) => chatRules(sql));
  return (
    <>
      <PageHeader title="Quién habla con quién" back={{ href: '/mensajes', label: 'Mensajes' }} />
      <ChatTabs current="permisos" />
      <RulesEditor pairs={pairs} team={team} demo={isDemo()} />
    </>
  );
}
