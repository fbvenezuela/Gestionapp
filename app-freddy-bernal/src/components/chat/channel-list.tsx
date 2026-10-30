import Link from 'next/link';
import { BellOff, Hash, Users } from 'lucide-react';
import { cn } from '@/lib/cn';
import { fmtDateTime } from '@/lib/time';
import { CHAT_TEAM_LINE } from '@/lib/domain/chat';
import type { ChannelSummary } from '@/lib/data/chat';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { TeamChannelButton } from './team-channel-button';
import { peopleCount } from './chat-core';

// «Mensajes» (R5, D-79): «Todo el equipo» always first, then my channels, newest first; the archived ones folded at the
// end in «Archivados». Each row: a dot and bold for what is new, the channel's name, how many are in it, a crossed
// bell when silenced, one line of the last message and its time. Solid card: no blur behind a long list.

function Row({ c }: { c: ChannelSummary }) {
  const unread = c.unread > 0;
  const Icon = c.kind === 'team' ? Users : Hash;
  return (
    <Link href={`/mensajes/${c.id}`} className="flex gap-3 px-4 py-3 hover:bg-surface-2">
      <span className={cn('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', unread ? 'bg-accent' : 'bg-transparent')} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <Icon className="h-4 w-4 shrink-0 text-text-2" aria-hidden />
          <span className={cn('min-w-0 [overflow-wrap:anywhere]', unread && 'font-semibold')}>{c.title}</span>
          {c.kind === 'channel' ? <span className="text-xs text-text-2">{peopleCount(c.memberCount)}</span> : null}
          {c.archived ? <Chip>Archivado</Chip> : null}
          {c.muted ? (
            <span className="inline-flex items-center gap-1 text-xs text-text-2">
              <BellOff className="h-3.5 w-3.5" aria-hidden /> Silenciado
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
          <span className="block truncate text-sm text-text-2">{c.kind === 'team' ? CHAT_TEAM_LINE : c.description ?? 'Todavía no hay mensajes.'}</span>
        )}
        {unread ? <span className="sr-only">. {c.unread === 1 ? '1 mensaje sin leer' : `${c.unread} mensajes sin leer`}</span> : null}
      </span>
    </Link>
  );
}

export function ChannelList({ rows, archived }: { rows: ChannelSummary[]; archived: ChannelSummary[] }) {
  const team = rows.find((r) => r.kind === 'team');
  const rest = rows.filter((r) => r.kind !== 'team');
  return (
    <>
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
                  <span className="block text-sm text-text-2">{CHAT_TEAM_LINE}</span>
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
      {archived.length ? (
        <details className="mt-4">
          <summary className="inline-flex min-h-11 cursor-pointer items-center px-1 text-[15px] font-semibold text-text-2">
            Archivados ({archived.length})
          </summary>
          <Card solid className="mt-2">
            <ul className="divide-y divide-border">
              {archived.map((c) => (
                <li key={c.id}>
                  <Row c={c} />
                </li>
              ))}
            </ul>
          </Card>
        </details>
      ) : null}
    </>
  );
}
