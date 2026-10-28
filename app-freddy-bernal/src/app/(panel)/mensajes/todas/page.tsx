import Link from 'next/link';
import { Eye, MessagesSquare } from 'lucide-react';
import { requireRole, db } from '@/lib/auth/session';
import { fmtDateTime } from '@/lib/time';
import { allConversations } from '@/lib/data/chat';
import { PageHeader, EmptyState } from '@/components/ui/page';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { ChatTabs } from '@/components/chat/chat-tabs';

export const metadata = { title: 'Todas las conversaciones' };

// Every conversation of the team, for the boss with 2FA (R3, D-50): the ones he is not part of he only reads, and
// reading them marks nothing as read for anyone. 30 a page, newest movement first.
export default async function AllConversationsPage({ searchParams }: { searchParams: Promise<{ pagina?: string }> }) {
  const s = await requireRole('boss');
  const asked = Number((await searchParams).pagina);
  const page = Number.isInteger(asked) && asked > 0 ? asked : 0;
  const { rows, more } = await db(s, (sql) => allConversations(sql, s, page));
  const href = (p: number) => (p ? `/mensajes/todas?pagina=${p}` : '/mensajes/todas');
  return (
    <>
      <PageHeader title="Todas las conversaciones" back={{ href: '/mensajes', label: 'Mensajes' }} />
      <ChatTabs current="todas" />
      <div role="note" className="mb-4 flex items-start gap-2 rounded-[var(--radius-card)] border border-border bg-info-soft px-3 py-2.5 text-[15px] text-text">
        <Eye className="mt-0.5 h-5 w-5 shrink-0 text-info" aria-hidden />
        <p>Solo lectura: lo que no es tuyo no se marca como leído.</p>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={<MessagesSquare className="h-8 w-8" />} title="Todavía nadie escribió en Mensajes." />
      ) : (
        <Card solid>
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/mensajes/${r.id}`} className="flex flex-col gap-1 px-4 py-3 hover:bg-surface-2">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{r.title}</span>
                    {r.mine ? <Chip tone="accent">Eres parte</Chip> : null}
                  </span>
                  {r.members.length ? (
                    <span className="text-sm text-text-2">{r.members.map((m) => `${m.name}${m.roles ? ` (${m.roles})` : ''}`).join(' · ')}</span>
                  ) : (
                    <span className="text-sm text-text-2">Todo el equipo</span>
                  )}
                  <span className="text-xs text-text-2">
                    {r.count === 1 ? '1 mensaje' : `${r.count} mensajes`}
                    {r.lastAt ? ` · el último ${fmtDateTime(r.lastAt)}` : ''}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {page > 0 || more ? (
        <nav aria-label="Páginas" className="mt-4 flex justify-between gap-2">
          {page > 0 ? (
            <Link href={href(page - 1)} className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-accent-ink underline underline-offset-2">Más nuevas</Link>
          ) : <span />}
          {more ? (
            <Link href={href(page + 1)} className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-accent-ink underline underline-offset-2">Más antiguas</Link>
          ) : null}
        </nav>
      ) : null}
    </>
  );
}
