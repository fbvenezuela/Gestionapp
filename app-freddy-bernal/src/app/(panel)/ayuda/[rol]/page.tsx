import { notFound, redirect } from 'next/navigation';
import { menuRoles, requireSession } from '@/lib/auth/session';
import { homeFor } from '@/lib/roles';
import { GUIDE_TITLES, guideFor, roleForSlug, toursForRoles } from '@/lib/guides';
import { noPermissionUrl } from '@/components/shell/no-permission';
import { PageHeader } from '@/components/ui/page';
import { GuideTabs, JobTab, ScreensTab, TasksTab, parseGuideTab, tabLabel } from '@/components/guides/role-guide';

export const metadata = { title: 'Guía del rol' };

// The guide of one role (R3, D-42, design §5.4): /ayuda/jefe, /ayuda/despacho, /ayuda/politica, /ayuda/ivt,
// /ayuda/grabacion, /ayuda/redes, with ?ver=trabajo|pasos|pantallas. One's own role (menu roles: it follows «Ver
// como»), or any role for the boss and Administración. The links «Abrir» and «Ver el tutorial» are the reader's own:
// only what the reader can open, and only the reader's tutorials.
export default async function RoleGuidePage({ params, searchParams }: { params: Promise<{ rol: string }>; searchParams: Promise<{ ver?: string }> }) {
  const s = await requireSession();
  const { rol } = await params;
  const role = roleForSlug(rol);
  if (!role) notFound();
  const roles = menuRoles(s);
  const mine = roles.includes(role);
  if (!mine && !s.roles.includes('boss') && !s.roles.includes('admin')) redirect(noPermissionUrl(homeFor(s.roles)));
  const tab = parseGuideTab((await searchParams).ver);
  const guide = guideFor(role);
  const tours = toursForRoles(roles, { admin: s.roles.includes('admin') });
  const home = homeFor(roles);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={mine ? 'Tu guía' : GUIDE_TITLES[role]}
        subtitle={mine ? `${guide.label}: tu trabajo, paso a paso y cada pantalla.` : `Lo que hace ${guide.label}, paso a paso y en cada pantalla.`}
        back={{ href: '/ayuda', label: 'Ayuda y guías' }}
      />
      <GuideTabs slug={rol} current={tab} mine={mine} />
      <section aria-labelledby="guia-parte">
        <h2 id="guia-parte" className="sr-only">
          {tabLabel(tab, mine)}
        </h2>
        {tab === 'trabajo' ? <JobTab guide={guide} mine={mine} /> : null}
        {tab === 'pasos' ? <TasksTab guide={guide} tours={tours} home={home} roles={roles} /> : null}
        {tab === 'pantallas' ? <ScreensTab guide={guide} tours={tours} home={home} roles={roles} /> : null}
      </section>
    </div>
  );
}
