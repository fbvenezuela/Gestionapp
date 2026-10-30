import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { requireRole, db } from '@/lib/auth/session';
import { homeFor } from '@/lib/roles';
import { isDemo } from '@/lib/env';
import { CHAT_NOT_IN_LIST, CHAT_TEAM_LINE } from '@/lib/domain/chat';
import { CHAT_MAX_PAGE, CHAT_PAGE, channel } from '@/lib/data/chat';
import { canApprove } from '@/lib/data/review';
import { noPermissionUrl } from '@/components/shell/no-permission';
import { Card } from '@/components/ui/card';
import { LinkButton } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { ChatThread } from '@/components/chat/chat-thread';
import { ThreadMenu } from '@/components/chat/thread-menu';
import { MembersSheet } from '@/components/chat/members-sheet';
import { chatRoles } from '@/components/chat/chat-core';

// Fixed: never a channel's name or a message in <title>.
export const metadata = { title: 'Canal' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// One channel (R5, D-79 to D-86), the whole screen for writing (U11): no bottom bar here (nav.tsx). The header is
// short so the box stays in view with the keyboard open: the name, then one line with the description and «N personas»
// (the whole list, and the whole description, in «Miembros»). A bad id or a channel the person is not in: «No
// encontramos esto»; in the demo one neutral card, since it may also come from another server (D-88). «Ver
// anteriores» asks for 50 more (?n=).
export default async function ChannelPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ n?: string }> }) {
  const s = await requireRole('boss', 'dispatch', 'politics', 'ivt', 'camera', 'social');
  // An account with Administración is out of Mensajes even with a team role (D-82).
  if (s.roles.includes('admin')) redirect(noPermissionUrl(homeFor(s.roles)));
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const asked = Number((await searchParams).n);
  const n = Number.isInteger(asked) ? Math.min(Math.max(asked, CHAT_PAGE), CHAT_MAX_PAGE) : CHAT_PAGE;
  const { c, boss } = await db(s, async (sql) => ({ c: await channel(sql, s, id.toLowerCase(), n), boss: await canApprove(sql) }));
  if (!c) {
    if (!isDemo()) notFound();
    return (
      <Card className="mx-auto max-w-md p-6 text-center">
        <h1 className="text-lg font-bold">No encontramos este canal</h1>
        <p className="mt-1 text-[15px] text-text-2">{CHAT_NOT_IN_LIST}</p>
        <LinkButton href="/mensajes" className="mt-4">
          Ir a Mensajes
        </LinkButton>
      </Card>
    );
  }
  const description = c.kind === 'team' ? CHAT_TEAM_LINE : c.description;
  const header = (
    <header className="mb-3">
      <div className="flex items-center justify-between gap-2">
        <Link href="/mensajes" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-text-2 hover:text-text">
          <ChevronLeft className="h-4 w-4" aria-hidden /> Mensajes
        </Link>
        <ThreadMenu conversationId={c.id} kind={c.kind} title={c.title} muted={c.muted} boss={boss} onlyBoss={c.onlyBoss} archived={c.archived} />
      </div>
      <h1 className="flex flex-wrap items-center gap-2 text-[1.4rem] font-bold leading-tight tracking-[-0.01em] [overflow-wrap:anywhere] sm:text-[2rem]">
        <span className="min-w-0">{c.title}</span>
        {c.archived ? <Chip>Archivado</Chip> : null}
      </h1>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3">
        {description ? <p className="min-w-0 max-w-full truncate text-sm text-text-2">{description}</p> : null}
        <MembersSheet
          members={c.members}
          me={s.userId}
          description={c.kind === 'channel' ? c.description : null}
          editHref={boss && c.kind === 'channel' ? `/mensajes/${c.id}/editar` : undefined}
          className="max-w-full"
        />
      </div>
    </header>
  );
  return (
    <ChatThread
      key={c.id}
      header={header}
      conversationId={c.id}
      me={s.userId}
      myName={s.name}
      myRole={chatRoles(s.roles)}
      initial={c.items}
      more={c.more}
      moreHref={`/mensajes/${c.id}?n=${n + CHAT_PAGE}`}
      firstUnreadId={c.firstUnreadId}
      readOnly={c.readOnly}
      hidesAgenda={c.hidesAgenda}
      agendaNote={c.agendaNote}
      authorRoles={s.roles}
    />
  );
}
