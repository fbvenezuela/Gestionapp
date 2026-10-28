import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireRole, db } from '@/lib/auth/session';
import { homeFor } from '@/lib/roles';
import { isDemo } from '@/lib/env';
import { cn } from '@/lib/cn';
import { chatPeople, noticeAccepted } from '@/lib/data/chat';
import { noPermissionUrl } from '@/components/shell/no-permission';
import { PageHeader } from '@/components/ui/page';
import { ChatNotice } from '@/components/chat/chat-notice';
import { ChatAckDialog } from '@/components/chat/chat-ack-dialog';
import { NewConversation } from '@/components/chat/new-conversation';

export const metadata = { title: 'Escribirle a alguien' };

// «Escribirle a alguien» (R3, D-49): one person or a group. Only the people I may write to now (chat_people()).
export default async function NewConversationPage({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const s = await requireRole('boss', 'dispatch', 'politics', 'ivt', 'camera', 'social');
  // An account with Administración is out of Mensajes even with a team role (D-49).
  if (s.roles.includes('admin')) redirect(noPermissionUrl(homeFor(s.roles)));
  const mode = (await searchParams).tipo === 'grupo' ? 'grupo' : 'persona';
  const { people, accepted } = await db(s, async (sql) => ({ people: await chatPeople(sql), accepted: await noticeAccepted(sql) }));
  const writable = people.filter((p) => p.canWrite).map(({ id, name, roles }) => ({ id, name, roles }));
  const demo = isDemo();
  const tabs = [
    { key: 'persona', href: '/mensajes/nueva', label: 'Una persona' },
    { key: 'grupo', href: '/mensajes/nueva?tipo=grupo', label: 'Un grupo' },
  ];
  return (
    <>
      <ChatAckDialog accepted={accepted} demo={demo} />
      <PageHeader title="Escribirle a alguien" back={{ href: '/mensajes', label: 'Mensajes' }} />
      <ChatNotice demo={demo} />
      <nav aria-label="A quién" className="mb-4">
        <ul className="flex gap-2">
          {tabs.map((t) => (
            <li key={t.key}>
              <Link
                href={t.href}
                replace
                aria-current={t.key === mode ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-11 items-center whitespace-nowrap rounded-full border px-4 text-sm font-semibold',
                  t.key === mode ? 'border-accent bg-accent text-on-accent' : 'border-border bg-surface text-text-2 hover:bg-surface-2 hover:text-text',
                )}
              >
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <NewConversation key={mode} mode={mode} people={writable} blocked={people.length - writable.length} myRoles={s.roles} />
    </>
  );
}
