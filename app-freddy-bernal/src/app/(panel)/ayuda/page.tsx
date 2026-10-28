import { BookOpen, LayoutList, PlayCircle, ShieldCheck, Users, Workflow } from 'lucide-react';
import { menuRoles, requireSession } from '@/lib/auth/session';
import { homeFor, TEAM_ROLES } from '@/lib/roles';
import { screenFor } from '@/lib/assistant/screens';
import { GUIDE_SLUGS, GUIDE_TITLES, SHARED, guideFor, teamRolesOf, tourHref, toursForRoles } from '@/lib/guides';
import { PageHeader } from '@/components/ui/page';
import { Card } from '@/components/ui/card';
import { HelpList, HelpRow, type HelpItem } from '@/components/guides/help-list';
import { SharedTopics } from '@/components/guides/shared-topics';
import { OfferReset } from '@/components/guides/offer-reset';

export const metadata = { title: 'Ayuda' };

// Ayuda y guías (R3, D-42, D-46, design §5.4): the guide of the person's role (it follows «Ver como»: menu roles),
// every screen, the flows between roles, «Para todos» and the tutorials of their screens. The boss and Administración
// also get every role's guide; Administración, its own. The guides are read here, on the server: nothing of them goes
// to the phone but this page.
export default async function HelpPage() {
  const s = await requireSession();
  const roles = menuRoles(s);
  const team = teamRolesOf(roles);
  const admin = s.roles.includes('admin');
  const home = homeFor(roles);
  const tours = toursForRoles(roles, { admin })
    .map((t) => ({ t, href: tourHref(t, home) }))
    .filter((x): x is { t: (typeof x)['t']; href: string } => x.href !== null);
  const several = team.length > 1;
  const everyone = s.roles.includes('boss') || admin;

  const tourItems: HelpItem[] = tours.map(({ t, href }) => ({
    href,
    label: t.title,
    detail: t.screen === '@home' ? 'En tu pantalla de inicio' : `En ${screenFor(t.screen.split('?')[0])?.label ?? 'su pantalla'}`,
    icon: PlayCircle,
  }));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageHeader title="Ayuda y guías" subtitle="La guía de tu trabajo, lo que se hace en cada pantalla, cómo va el trabajo entre todos y los tutoriales." />

      <Card solid>
        <div className="divide-y divide-border">
          {team.length ? (
            <>
              <div data-tour="help-mine" className="divide-y divide-border">
                {team.map((r) => (
                  <HelpRow
                    key={r}
                    href={`/ayuda/${GUIDE_SLUGS[r]}`}
                    label={several ? `Mi trabajo, paso a paso: ${guideFor(r).label}` : 'Mi trabajo, paso a paso'}
                    detail="Qué haces, tu día y cada tarea, paso a paso"
                    icon={BookOpen}
                  />
                ))}
              </div>
              <div data-tour="help-sections" className="divide-y divide-border">
                {team.map((r) => (
                  <HelpRow
                    key={r}
                    href={`/ayuda/${GUIDE_SLUGS[r]}?ver=pantallas`}
                    label={several ? `Qué se hace en cada pantalla: ${guideFor(r).label}` : 'Qué se hace en cada pantalla'}
                    detail="Cada pantalla de tu menú, con sus botones"
                    icon={LayoutList}
                  />
                ))}
              </div>
            </>
          ) : null}
          <div data-tour="help-flows">
            <HelpRow href="/ayuda/flujos" label="Cómo va el trabajo entre todos" detail="Cómo pasa el trabajo de un rol a otro" icon={Workflow} />
          </div>
        </div>
      </Card>

      {tourItems.length ? (
        <HelpList
          data-tour="help-tours"
          title="Tutoriales de mis pantallas"
          subtitle="Cada uno te lleva a su pantalla y te la muestra paso a paso. Los de un evento o una pieza están en «Mi cuenta» → «Ver el tutorial de esta pantalla», con la pantalla abierta."
          items={tourItems}
          footer={<OfferReset userId={s.userId} />}
        />
      ) : null}

      <SharedTopics topics={SHARED} id="para-todos" />

      {everyone ? (
        <HelpList
          title="La guía de cada persona"
          subtitle="Lo que hace cada rol del equipo."
          items={TEAM_ROLES.map((r) => ({ href: `/ayuda/${GUIDE_SLUGS[r]}`, label: GUIDE_TITLES[r], detail: guideFor(r).job.mission, icon: Users }))}
        />
      ) : null}
      {admin ? (
        <HelpList
          title="Administración"
          items={[{ href: '/ayuda/administracion', label: 'Guía de administración', detail: 'Equipo, ajustes, el asistente y lo que no es tuyo', icon: ShieldCheck }]}
        />
      ) : null}
      <p className="text-sm text-text-2">La guía necesita señal: la plataforma no guarda páginas en el teléfono, por privacidad.</p>
    </div>
  );
}
