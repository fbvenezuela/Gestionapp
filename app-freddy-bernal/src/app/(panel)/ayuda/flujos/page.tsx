import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { menuRoles, requireSession } from '@/lib/auth/session';
import { FLOWS, flowById, teamRolesOf } from '@/lib/guides';
import { PageHeader } from '@/components/ui/page';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Flowchart, whoDoes } from '@/components/guides/flowchart';

export const metadata = { title: 'Cómo va el trabajo entre todos' };

// The flows between roles (R3, D-44, design §5.4): an index of the eight, and ?f=<id> opens one as a list of steps,
// with «tú» on the reader's own (menu roles: it follows «Ver como»). One column at every width.
export default async function FlowsPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const s = await requireSession();
  const roles = menuRoles(s);
  const mine = teamRolesOf(roles);
  const flow = flowById((await searchParams).f ?? '');

  if (flow) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader
          title="Cómo va el trabajo entre todos"
          subtitle={mine.length ? 'Los pasos que son tuyos dicen «tú».' : undefined}
          back={{ href: '/ayuda/flujos', label: 'Todos los flujos' }}
        />
        <h2 className="mb-1 text-xl font-bold">{flow.title}</h2>
        <p className="mb-4 text-[15px] text-text-2">Lo hacen: {whoDoes(flow.roles, 'y')}.</p>
        <Flowchart flow={flow} mine={mine} roles={roles} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Cómo va el trabajo entre todos" subtitle="Cómo pasa el trabajo de un rol a otro. Toca uno para verlo paso a paso." back={{ href: '/ayuda', label: 'Ayuda y guías' }} />
      <Card solid>
        <ul className="divide-y divide-border">
          {FLOWS.map((f) => {
            const yours = f.roles.some((r) => mine.includes(r));
            return (
              <li key={f.id}>
                <Link href={`/ayuda/flujos?f=${f.id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-surface-2">
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="font-semibold [overflow-wrap:anywhere]">{f.title}</span>
                    <span className="text-sm text-text-2">
                      {f.steps.length} pasos · {whoDoes(f.roles, 'y')}
                    </span>
                  </span>
                  {yours ? <Chip tone="accent">Te toca</Chip> : null}
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
