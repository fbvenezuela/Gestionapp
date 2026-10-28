import Link from 'next/link';
import { Bell } from 'lucide-react';
import { requireSession, db } from '@/lib/auth/session';
import { PageHeader, EmptyState } from '@/components/ui/page';
import { Card } from '@/components/ui/card';
import { fmtDateTime } from '@/lib/time';
import { MarkAllRead } from './mark-all-read';

export const metadata = { title: 'Avisos' };

export default async function NoticesPage() {
  const s = await requireSession();
  const rows = await db(s, (sql) =>
    sql.query<{ id: string; title: string; body: string; link: string | null; read_at: string | null; created_at: string }>(
      `select id, title, body, link, read_at, created_at from public.notifications order by created_at desc limit 100`,
    ),
  );
  return (
    <>
      <PageHeader title="Avisos" actions={rows.some((r) => !r.read_at) ? <MarkAllRead /> : undefined} />
      {rows.length === 0 ? (
        <EmptyState icon={<Bell className="h-8 w-8" />} title="No tienes avisos." />
      ) : (
        <Card solid>
          <ul className="divide-y divide-border">
            {rows.map((r) => {
              const inner = (
                <>
                  <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${r.read_at ? 'bg-transparent' : 'bg-accent'}`} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className={`block ${r.read_at ? '' : 'font-semibold'}`}>{r.title}</span>
                    {r.body ? <span className="block text-sm text-text-2">{r.body}</span> : null}
                    <span className="block text-xs text-muted">{fmtDateTime(r.created_at)}</span>
                  </span>
                </>
              );
              return (
                <li key={r.id}>
                  {r.link ? <Link href={r.link} className="flex gap-3 px-4 py-3 hover:bg-surface-2">{inner}</Link> : <div className="flex gap-3 px-4 py-3">{inner}</div>}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}
