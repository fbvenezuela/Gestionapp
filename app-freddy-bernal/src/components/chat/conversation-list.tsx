import Link from 'next/link';
import { BellOff, Users } from 'lucide-react';
import { cn } from '@/lib/cn';
import { fmtDateTime } from '@/lib/time';
import type { ConversationSummary } from '@/lib/data/chat';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { TeamChannelButton } from './team-channel-button';

// «Mensajes» (design §5.3): «Todo el equipo» always first, then my conversations, newest first. The list of «Avisos»:
// a dot and bold for what is new, the other person (or the group) with their role, one line of the last message, the
// time, and a crossed bell when silenced. Solid card: no blur behind a long list.

function Row({ c }: { c: ConversationSummary }) {
  const unread = c.unread > 0;
  return (
    <Link href={`/mensajes/${c.id}`} className="flex gap-3 px-4 py-3 hover:bg-surface-2">
      <span className={cn('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', unread ? 'bg-accent' : 'bg-transparent')} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className={cn('min-w-0 truncate', unread && 'font-semibold')}>{c.title}</span>
          {c.roles ? <Chip>{c.roles}</Chip> : null}
          {c.kind === 'group' ? <span className="text-xs text-text-2">{c.memberCount} personas</span> : null}
          {c.muted ? (
            <span className="inline-flex items-center gap-1 text-xs text-text-2">
              <BellOff className="h-3.5 w-3.5" aria-hidden /> Silenciada
            </span>
          ) : null}
        </span>
        {c.last ? (
          <>
            <span className={cn('block truncate text-sm text-text-2', c.last.hidden && 'italic')}>
              {c.last.by}: {c.last.text}
            </span>
            <span className="block text-xs text-text-2">{fmtDateTime(c.last.at)}</span>
          </>
        ) : (
          <span className="block text-sm text-text-2">Todavía no hay mensajes.</span>
        )}
        {unread ? <span className="sr-only">. {c.unread === 1 ? '1 mensaje sin leer' : `${c.unread} mensajes sin leer`}</span> : null}
      </span>
    </Link>
  );
}

export function ConversationList({ rows }: { rows: ConversationSummary[] }) {
  const team = rows.find((r) => r.kind === 'team');
  const rest = rows.filter((r) => r.kind !== 'team');
  return (
    <Card solid data-tour="chat-list">
      <ul className="divide-y divide-border">
        <li data-tour="chat-team">
          {team ? (
            <Row c={team} />
          ) : (
            <TeamChannelButton>
              <Users className="h-5 w-5 shrink-0 text-text-2" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block">Todo el equipo</span>
                <span className="block text-sm text-text-2">Aquí escriben todos y lo lee todo el equipo.</span>
              </span>
            </TeamChannelButton>
          )}
        </li>
        {rest.map((c) => (
          <li key={c.id}>
            <Row c={c} />
          </li>
        ))}
      </ul>
    </Card>
  );
}
