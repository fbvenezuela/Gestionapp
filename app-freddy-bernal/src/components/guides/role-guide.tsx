import Link from 'next/link';
import { ChevronDown, ExternalLink, PlayCircle } from 'lucide-react';
import type { Role } from '@/lib/roles';
import { canOpen } from '@/lib/assistant/screens';
import { flowById, tourHref, type RoleGuide, type SectionGuide, type Tour } from '@/lib/guides';
import { cn } from '@/lib/cn';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { Flowchart, ROLE_SHORT } from './flowchart';

// One role's guide (R3, design §5.4, U18): three tabs, «Tu trabajo» (the job description, the day, the rhythm and the
// questions), «Paso a paso» (each task, its flow and its tutorial) and «Cada pantalla» (grouped by menu entry, each
// screen a closed <details>). For someone else's role the tabs say «Su…». Server components: plain links, no state.

export type GuideTab = 'trabajo' | 'pasos' | 'pantallas';
export const GUIDE_TABS: GuideTab[] = ['trabajo', 'pasos', 'pantallas'];

export function parseGuideTab(v: string | undefined): GuideTab {
  return GUIDE_TABS.includes(v as GuideTab) ? (v as GuideTab) : 'trabajo';
}

export function tabLabel(tab: GuideTab, mine: boolean): string {
  if (tab === 'trabajo') return mine ? 'Tu trabajo' : 'Su trabajo';
  return tab === 'pasos' ? 'Paso a paso' : 'Cada pantalla';
}

export function GuideTabs({ slug, current, mine }: { slug: string; current: GuideTab; mine: boolean }) {
  return (
    <nav aria-label="Partes de la guía" className="mb-5">
      <ul className="flex flex-wrap gap-2">
        {GUIDE_TABS.map((t) => {
          const active = t === current;
          return (
            <li key={t}>
              <Link
                href={t === 'trabajo' ? `/ayuda/${slug}` : `/ayuda/${slug}?ver=${t}`}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-11 items-center whitespace-nowrap rounded-full border px-4 text-sm font-semibold',
                  active ? 'border-accent bg-accent text-on-accent' : 'border-border bg-surface text-text-2 hover:bg-surface-2 hover:text-text',
                )}
              >
                {tabLabel(t, mine)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

const Bullets = ({ items, ordered }: { items: string[]; ordered?: boolean }) => {
  const cls = cn('flex flex-col gap-1.5 pl-5 text-[15px]', ordered ? 'list-decimal' : 'list-disc');
  const lis = items.map((x, i) => <li key={i}>{x}</li>);
  return ordered ? <ol className={cls}>{lis}</ol> : <ul className={cls}>{lis}</ul>;
};

// ── «Tu trabajo» ──────────────────────────────────────────────────────────────────────────────────────────────────

export function JobTab({ guide, mine }: { guide: RoleGuide; mine: boolean }) {
  const { job, account } = guide;
  const your = mine ? 'Tu' : 'Su';
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardBody className="flex flex-col gap-2">
          <p className="label-caps">{mine ? 'Tu trabajo' : `El trabajo de ${guide.label}`}</p>
          <p className="text-lg font-semibold">{job.mission}</p>
        </CardBody>
      </Card>
      <Card solid>
        <CardHeader title="Lo que haces" />
        <CardBody>
          <Bullets items={job.responsibilities} />
        </CardBody>
      </Card>
      <Card solid>
        <CardHeader title="Nunca" />
        <CardBody>
          <Bullets items={job.never} />
        </CardBody>
      </Card>
      <Card solid>
        <CardHeader title={mine ? 'Con quién trabajas' : 'Con quién trabaja'} />
        <ul className="divide-y divide-border">
          {job.worksWith.map((w) => (
            <li key={w.role} className="px-4 py-3 text-[15px] sm:px-5">
              <b>{ROLE_SHORT[w.role]}.</b> {w.what}
            </li>
          ))}
        </ul>
      </Card>
      <Card solid>
        <CardHeader title={`${your} día`} subtitle="En orden, de lo primero a lo último." />
        <CardBody>
          <Bullets items={guide.day} ordered />
        </CardBody>
      </Card>
      <Card solid>
        <CardHeader title={`${your} ritmo`} subtitle="Cómo debería ir el trabajo." />
        <CardBody>
          <Bullets items={job.rhythm} />
        </CardBody>
      </Card>
      <Card solid>
        <CardHeader title={mine ? 'Tu cuenta' : 'Su cuenta'} />
        <CardBody>
          <dl className="grid gap-3 text-[15px] sm:grid-cols-2">
            <div>
              <dt className="label-caps">Menú</dt>
              <dd>{account.menu.join(', ')}</dd>
            </div>
            <div>
              <dt className="label-caps">En el teléfono</dt>
              <dd>
                {account.phoneBar.join(', ')}
                {account.more.length ? ` (en «Más»: ${account.more.join(', ')})` : ''}
              </dd>
            </div>
            <div>
              <dt className="label-caps">Crear</dt>
              <dd>{account.create.length ? account.create.join(', ') : 'No tiene el botón «Crear».'}</dd>
            </div>
            <div>
              <dt className="label-caps">Doble factor</dt>
              <dd>{account.twoFactor ? 'Sí: entra con el código del correo y el de su aplicación.' : 'No: entra con el código del correo.'}</dd>
            </div>
          </dl>
        </CardBody>
      </Card>
      <Faq faq={guide.faq} />
    </div>
  );
}

export function Faq({ faq }: { faq: { q: string; a: string }[] }) {
  return (
    <Card solid>
      <CardHeader title="Preguntas" />
      <div className="divide-y divide-border">
        {faq.map((f) => (
          <details key={f.q} className="group">
            <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 py-2 font-semibold [&::-webkit-details-marker]:hidden sm:px-5">
              <span className="min-w-0 flex-1">{f.q}</span>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <p className="px-4 pb-4 text-[15px] text-text-2 sm:px-5">{f.a}</p>
          </details>
        ))}
      </div>
    </Card>
  );
}

// ── «Paso a paso» ─────────────────────────────────────────────────────────────────────────────────────────────────

// The reader's own tutorial of this screen, when it can be started from a link (no [id] in its screen).
function tourLink(id: string | undefined, tours: readonly Tour[], home: string): string | null {
  const t = id ? tours.find((x) => x.id === id) : undefined;
  return t ? tourHref(t, home) : null;
}

export function TasksTab({ guide, tours, home, roles }: { guide: RoleGuide; tours: readonly Tour[]; home: string; roles: readonly Role[] }) {
  const mine = guide.role;
  return (
    <div className="flex flex-col gap-4">
      {guide.tasks.map((t) => {
        const flow = t.flow ? flowById(t.flow) : null;
        const tour = tourLink(t.tour, tours, home);
        return (
          <Card key={t.id} solid>
            <CardHeader title={t.title} subtitle={t.when} />
            <CardBody className="flex flex-col gap-3">
              <Bullets items={t.steps} ordered />
              {tour ? (
                <Link href={tour} className={buttonVariants({ variant: 'secondary', className: 'w-fit' })}>
                  <PlayCircle className="h-4 w-4" aria-hidden /> Ver el tutorial
                </Link>
              ) : null}
              {flow ? (
                <details className="group rounded-[var(--radius-control)] border border-border">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 font-semibold [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0 flex-1">Ver el flujo: {flow.title}</span>
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
                  </summary>
                  <div className="p-3">
                    <Flowchart flow={flow} mine={[mine]} roles={roles} />
                  </div>
                </details>
              ) : null}
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}

// ── «Cada pantalla» ───────────────────────────────────────────────────────────────────────────────────────────────

export function groupSections(sections: readonly SectionGuide[]): { menu: string; sections: SectionGuide[] }[] {
  const groups: { menu: string; sections: SectionGuide[] }[] = [];
  for (const s of sections) {
    const g = groups.find((x) => x.menu === s.menu);
    if (g) g.sections.push(s);
    else groups.push({ menu: s.menu, sections: [s] });
  }
  return groups;
}

export function ScreensTab({ guide, tours, home, roles }: { guide: RoleGuide; tours: readonly Tour[]; home: string; roles: readonly Role[] }) {
  return (
    <div className="flex flex-col gap-4">
      {groupSections(guide.sections).map((g) => (
        <section key={g.menu} aria-label={g.menu}>
          <h2 className="mb-2 text-lg font-bold">{g.menu}</h2>
          <Card solid>
            <div className="divide-y divide-border">
              {g.sections.map((s) => {
                const open = !s.screen.includes('[') && canOpen(s.screen, [...roles]);
                const tour = tourLink(s.tour, tours, home);
                return (
                  <details key={s.screen} className="group">
                    <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 py-2 font-semibold [&::-webkit-details-marker]:hidden sm:px-5">
                      <span className="min-w-0 flex-1">{s.title}</span>
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
                    </summary>
                    <div className="flex flex-col gap-3 px-4 pb-4 sm:px-5">
                      <div>
                        <p className="label-caps">Para qué es</p>
                        <p className="text-[15px]">{s.what}</p>
                      </div>
                      <div>
                        <p className="label-caps">Qué haces aquí</p>
                        <Bullets items={s.youDo} />
                      </div>
                      {s.cannot?.length ? (
                        <div>
                          <p className="label-caps">No puedes</p>
                          <Bullets items={s.cannot} />
                        </div>
                      ) : null}
                      {open || tour ? (
                        <div className="flex flex-wrap gap-2">
                          {open ? (
                            <Link href={s.screen} className={buttonVariants({ variant: 'secondary' })}>
                              <ExternalLink className="h-4 w-4" aria-hidden /> Abrir<span className="sr-only">: {s.title}</span>
                            </Link>
                          ) : null}
                          {tour ? (
                            <Link href={tour} className={buttonVariants({ variant: 'secondary' })}>
                              <PlayCircle className="h-4 w-4" aria-hidden /> Ver el tutorial<span className="sr-only">: {s.title}</span>
                            </Link>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </details>
                );
              })}
            </div>
          </Card>
        </section>
      ))}
    </div>
  );
}

