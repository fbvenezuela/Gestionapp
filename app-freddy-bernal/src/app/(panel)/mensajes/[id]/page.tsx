import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { requireRole, db } from '@/lib/auth/session';
import { homeFor } from '@/lib/roles';
import { isDemo } from '@/lib/env';
import { CHAT_OTHER_SERVER } from '@/lib/domain/chat';
import { CHAT_MAX_PAGE, CHAT_PAGE, conversation } from '@/lib/data/chat';
import { noPermissionUrl } from '@/components/shell/no-permission';
import { Card } from '@/components/ui/card';
import { LinkButton } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { ChatNoticeLine } from '@/components/chat/chat-notice';
import { ChatAckDialog } from '@/components/chat/chat-ack-dialog';
import { ChatThread } from '@/components/chat/chat-thread';
import { ThreadMenu } from '@/components/chat/thread-menu';
import { chatRoles, firstName } from '@/components/chat/chat-core';

// Fixed: never a person's name or a message in <title>.
export const metadata = { title: 'Conversación' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// One conversation (R3, D-49 to D-54), the whole screen for writing (U11): no bottom bar here (nav.tsx). A bad id or
// one the person cannot read: «No encontramos esto»; in the demo, a conversation made on another server says so
// (D-57). «Ver anteriores» asks for 50 more (?n=).
export default async function ConversationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ n?: string }> }) {
  const s = await requireRole('boss', 'dispatch', 'politics', 'ivt', 'camera', 'social');
  // An account with Administración is out of Mensajes even with a team role (D-49).
  if (s.roles.includes('admin')) redirect(noPermissionUrl(homeFor(s.roles)));
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const asked = Number((await searchParams).n);
  const n = Number.isInteger(asked) ? Math.min(Math.max(asked, CHAT_PAGE), CHAT_MAX_PAGE) : CHAT_PAGE;
  const c = await db(s, (sql) => conversation(sql, s, id.toLowerCase(), n));
  const demo = isDemo();
  if (!c) {
    if (!demo) notFound();
    return (
      <Card className="mx-auto max-w-md p-6 text-center">
        <h1 className="text-lg font-bold">No encontramos esta conversación</h1>
        <p className="mt-1 text-[15px] text-text-2">{CHAT_OTHER_SERVER}</p>
        <LinkButton href="/mensajes" className="mt-4">
          Ir a Mensajes
        </LinkButton>
      </Card>
    );
  }
  const boss = s.roles.includes('boss');
  const others = c.members.filter((m) => m.id !== s.userId);
  return (
    <>
      <ChatAckDialog accepted={c.acked} demo={demo} />
      <header className="mb-3">
        <div className="flex items-center justify-between gap-2">
          <Link href="/mensajes" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-text-2 hover:text-text">
            <ChevronLeft className="h-4 w-4" aria-hidden /> Mensajes
          </Link>
          <ThreadMenu conversationId={c.id} isMember={c.isMember} muted={c.muted} boss={boss} onlyBoss={c.kind === 'direct' ? null : c.onlyBoss} />
        </div>
        <h1 className="text-[1.6rem] font-bold leading-tight tracking-[-0.01em] [overflow-wrap:anywhere] sm:text-[2rem]">{c.title}</h1>
        {c.kind === 'direct' ? (
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-text-2">
            {(c.isMember ? others : c.members).map((m) => (
              <Chip key={m.id}>{c.isMember ? chatRoles(m.roles) : `${firstName(m.name)} · ${chatRoles(m.roles)}`}</Chip>
            ))}
          </p>
        ) : (
          <details className="mt-1 text-sm text-text-2">
            <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium">{c.members.length} personas</summary>
            <ul className="mb-2 flex flex-col gap-1 pl-1">
              {c.members.map((m) => (
                <li key={m.id}>
                  {m.id === s.userId ? 'Tú' : m.name}
                  {m.roles.length ? ` · ${chatRoles(m.roles)}` : ''}
                  {m.active ? '' : ' (ya no está)'}
                </li>
              ))}
            </ul>
          </details>
        )}
        <div className="mt-1">
          <ChatNoticeLine demo={demo} />
        </div>
      </header>
      <ChatThread
        key={c.id}
        conversationId={c.id}
        me={s.userId}
        myName={s.name}
        myRole={chatRoles(s.roles)}
        initial={c.items}
        more={c.more}
        moreHref={`/mensajes/${c.id}?n=${n + CHAT_PAGE}`}
        firstUnreadId={c.firstUnreadId}
        isMember={c.isMember}
        readOnly={c.readOnly}
        hidesAgenda={c.hidesAgenda}
        agendaNote={c.agendaNote}
        authorRoles={s.roles}
        showNames={c.kind !== 'direct'}
      />
    </>
  );
}
