import Link from 'next/link';
import { requireRole } from '@/lib/auth/session';
import { listDrafts } from '@/lib/assistant/admin';
import { cn } from '@/lib/cn';
import { PageHeader } from '@/components/ui/page';
import { TABS, parseTab, tabHref } from '@/components/assistant/panel-core';
import { ActionsTab, ConversationsTab, DraftsTab, HealthTab, HeardTab, KnowledgeTab, ProfileTab, ScriptsTab, type SP } from './sections';
import { TabStrip } from './tab-strip';

export const metadata = { title: 'Asistente' };

// Ajustes → Asistente (docs/ASISTENTE.md «El panel», manual §13): only administration.
// Escalation notices link here with ?conversacion=<id>; each tab is a plain ?tab= link.
export default async function AssistantPanelPage({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await requireRole('admin');
  const sp = await searchParams;
  const tab = parseTab(sp.tab, sp.conversacion);
  const pending = (await listDrafts(s, 'pendiente')).length;
  const current = TABS.find((t) => t.key === tab)!;

  return (
    <>
      <PageHeader title="Asistente" subtitle="Lo que sabe, cómo contesta y cómo le va. Solo administración lo ve." back={{ href: '/ajustes', label: 'Ajustes' }} />
      <nav aria-label="Secciones del asistente" className="mb-5">
        <TabStrip current={tab} className="-mx-4 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          {TABS.map((t) => {
            const active = t.key === tab;
            return (
              <li key={t.key} className="shrink-0 snap-start">
                <Link
                  href={tabHref(t.key)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-sm font-semibold',
                    active ? 'border-accent bg-accent text-on-accent' : 'border-border bg-surface text-text-2 hover:bg-surface-2 hover:text-text',
                  )}
                >
                  {t.label}
                  {t.key === 'confirmar' && pending ? (
                    <span className={cn('grid min-w-5 place-items-center rounded-full px-1 text-xs font-bold', active ? 'bg-surface text-text' : 'bg-warn-soft text-warn')}>
                      {pending}
                      <span className="sr-only"> pendientes</span>
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </TabStrip>
      </nav>

      <section aria-labelledby="asistente-tab">
        <h2 id="asistente-tab" className="mb-3 text-lg font-bold">{current.label}</h2>
        {tab === 'sabe' ? <KnowledgeTab s={s} sp={sp} /> : null}
        {tab === 'contesta' ? <ScriptsTab s={s} sp={sp} /> : null}
        {tab === 'conversaciones' ? <ConversationsTab s={s} sp={sp} /> : null}
        {tab === 'va' ? <HealthTab s={s} /> : null}
        {tab === 'preguntan' ? <HeardTab s={s} /> : null}
        {tab === 'confirmar' ? <DraftsTab s={s} sp={sp} /> : null}
        {tab === 'hizo' ? <ActionsTab s={s} /> : null}
        {tab === 'ajustes' ? <ProfileTab s={s} /> : null}
      </section>
    </>
  );
}
