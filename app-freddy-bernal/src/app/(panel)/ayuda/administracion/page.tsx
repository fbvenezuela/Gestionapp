import Link from 'next/link';
import { ChevronDown, ExternalLink } from 'lucide-react';
import { requireRole } from '@/lib/auth/session';
import { canOpen } from '@/lib/assistant/screens';
import { ADMIN_GUIDE } from '@/lib/guides';
import { PageHeader } from '@/components/ui/page';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { Faq } from '@/components/guides/role-guide';

export const metadata = { title: 'Guía de administración' };

// Administración's own guide, apart from the team's (R3, D-43): the settings, the team's accounts and 360's panel,
// and what is not Administración's (Mensajes, the boss's role, the agenda).
export default async function AdminGuidePage() {
  const s = await requireRole('admin');
  const g = ADMIN_GUIDE;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageHeader title="Guía de administración" subtitle="Aparte de las guías del equipo." back={{ href: '/ayuda', label: 'Ayuda y guías' }} />
      <Card>
        <CardBody>
          <p className="text-lg font-semibold">{g.mission}</p>
        </CardBody>
      </Card>
      <Card solid>
        <CardHeader title="Lo que no es de administración" />
        <CardBody>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[15px]">
            {g.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </CardBody>
      </Card>
      <Card solid>
        <CardHeader title="Cada pantalla" />
        <div className="divide-y divide-border">
          {g.sections.map((x) => {
            const open = x.screen && canOpen(x.screen, s.roles) ? x.screen : null;
            return (
              <details key={x.title} className="group">
                <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 py-2 font-semibold [&::-webkit-details-marker]:hidden sm:px-5">
                  <span className="min-w-0 flex-1">{x.title}</span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <div className="flex flex-col gap-3 px-4 pb-4 sm:px-5">
                  <div>
                    <p className="label-caps">Para qué es</p>
                    <p className="text-[15px]">{x.what}</p>
                  </div>
                  <div>
                    <p className="label-caps">Qué haces aquí</p>
                    <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[15px]">
                      {x.youDo.map((d) => (
                        <li key={d}>{d}</li>
                      ))}
                    </ul>
                  </div>
                  {x.cannot?.length ? (
                    <div>
                      <p className="label-caps">No puedes</p>
                      <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[15px]">
                        {x.cannot.map((d) => (
                          <li key={d}>{d}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {open ? (
                    <Link href={open} className={buttonVariants({ variant: 'secondary', className: 'w-fit' })}>
                      <ExternalLink className="h-4 w-4" aria-hidden /> Abrir<span className="sr-only">: {x.title}</span>
                    </Link>
                  ) : null}
                </div>
              </details>
            );
          })}
        </div>
      </Card>
      <Faq faq={g.faq} />
    </div>
  );
}
