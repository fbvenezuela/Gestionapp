import { ArrowUpRightIcon } from './icons';
import type { Site } from '@/lib/web/site-settings';
import { currentYear } from '@/lib/web/format';
import { ATTENTION, REPORT_HREF } from '@/lib/web/links';
import { NavList } from './nav-list';
import { ButtonLink, Container, UnverifiedMark, WebLink } from './ui';

// The footer (design §2, docs/diagnostico.md problems 3 and 7): the official channels from the one list of the site's
// settings (in production only the verified ones; the test version also shows the «por confirmar» ones, marked), the
// legal pages, a year that changes by itself, «not an emergency service», and the team's door to the panel.

const footLink = 'inline-flex min-h-11 items-center text-[15px] text-on-charcoal underline-offset-4 hover:underline focus-visible:outline-on-charcoal';

export function SiteFooter({ site }: { site: Site }) {
  const channels = [...(site.youtube ? [site.youtube] : []), ...site.accounts.filter((a) => a.url !== site.youtube?.url)];
  return (
    <footer className="mt-auto bg-charcoal text-on-charcoal">
      <Container className="grid gap-10 py-14 md:grid-cols-12">
        <div className="md:col-span-5">
          <p className="text-2xl font-bold tracking-tight">{site.name}</p>
          <p className="mt-1 text-base">{site.title}</p>
          {site.about ? <p className="mt-4 max-w-md text-[15px] leading-relaxed">{site.about}</p> : null}
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink href={REPORT_HREF} variant="action" size="sm" className="focus-visible:outline-on-charcoal">
              Hacer un reporte
            </ButtonLink>
            <ButtonLink href={ATTENTION.lookup} variant="light" size="sm" className="focus-visible:outline-on-charcoal">
              Consultar mi solicitud
            </ButtonLink>
          </div>
          <p className="mt-6 max-w-md text-[15px] font-medium leading-relaxed">{site.emergencyNotice}</p>
        </div>

        <nav aria-label="Mapa del sitio" className="md:col-span-3">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-[0.08em]">Secciones</h2>
          <NavList items={site.navigation} variant="footer" />
        </nav>

        <div className="md:col-span-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-[0.08em]">Canales oficiales</h2>
          {channels.length ? (
            <ul className="flex flex-col gap-1">
              {channels.map((c) => (
                <li key={c.url} className="flex flex-wrap items-center gap-x-1">
                  <a href={c.url} rel="noopener noreferrer nofollow" className={footLink}>
                    {c.networkLabel}
                    {c.handle ? <span className="ml-1.5">{c.handle}</span> : null}
                    <ArrowUpRightIcon className="ml-1 h-4 w-4" />
                  </a>
                  {c.verified ? null : <UnverifiedMark dark />}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[15px] leading-relaxed">Las cuentas oficiales se publican aquí cuando el equipo las verifica.</p>
          )}
          <WebLink href="/canales" className={`${footLink} mt-2 font-semibold underline`}>
            Cómo reconocer los canales auténticos
          </WebLink>
        </div>
      </Container>

      <div className="border-t border-on-charcoal/25">
        <Container className="flex flex-col gap-3 py-6 text-[15px] md:flex-row md:flex-wrap md:items-center md:gap-x-6">
          <p>
            © {currentYear()} {site.wordmark}
          </p>
          {site.legal.length ? (
            <ul className="flex flex-wrap gap-x-5">
              {site.legal.map((l) => (
                <li key={l.path}>
                  <WebLink href={l.path} className={footLink}>
                    {l.label}
                  </WebLink>
                </li>
              ))}
            </ul>
          ) : null}
          <WebLink href="/panel" className={`${footLink} md:ml-auto`}>
            Entrar (equipo)
          </WebLink>
          {site.demo ? <p className="w-full text-sm">{site.demoBanner}</p> : null}
        </Container>
      </div>
    </footer>
  );
}
