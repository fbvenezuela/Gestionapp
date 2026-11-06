import { MenuIcon, XIcon } from './icons';
import type { Site } from '@/lib/web/site-settings';
import { ATTENTION, REPORT_HREF } from '@/lib/web/links';
import { MenuCloser } from './menu-closer';
import { NavList } from './nav-list';
import { ButtonLink, Container, WebLink } from './ui';

// The website's header (design §2, the brief's «botones visibles»): the name in letters (no invented logo, D-95), the
// two citizen actions always in sight — «Hacer un reporte» in the brand's orange and «Consultar mi solicitud» — and the
// sections. On a phone the sections live in a native <details> menu that opens on the first tap with no JavaScript;
// from 1024 px they are a bar under the name. Not sticky: a sticky bar would cover what the keyboard focuses.

export function SiteHeader({ site }: { site: Site }) {
  return (
    <header className="relative z-30 border-b border-border bg-ivory">
      <Container className="flex items-center gap-3 py-3">
        <WebLink href="/" className="mr-auto flex min-h-12 flex-col justify-center leading-tight">
          <span className="text-[19px] font-bold tracking-tight text-text sm:text-[22px]">{site.name}</span>
          <span className="text-[13px] font-medium text-text-2 sm:text-sm">{site.title}</span>
        </WebLink>
        <div className="hidden items-center gap-2 md:flex">
          <ButtonLink href={REPORT_HREF} variant="action" size="sm">
            Hacer un reporte
          </ButtonLink>
          <ButtonLink href={ATTENTION.lookup} variant="outline" size="sm">
            Consultar mi solicitud
          </ButtonLink>
        </div>
        <details className="group lg:hidden">
          <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-full border-2 border-text px-4 text-[15px] font-semibold text-text [&::-webkit-details-marker]:hidden">
            <MenuIcon className="h-5 w-5 group-open:hidden" />
            <XIcon className="hidden h-5 w-5 group-open:block" />
            <span className="group-open:hidden">Menú</span>
            <span className="hidden group-open:inline">Cerrar</span>
          </summary>
          <nav aria-label="Secciones" className="absolute inset-x-0 top-full z-40 max-h-[calc(100dvh-5rem)] overflow-y-auto border-b border-border bg-surface shadow-[var(--glass-shadow-pop)]">
            <Container className="py-3">
              <NavList items={site.navigation} variant="menu" />
            </Container>
            <MenuCloser />
          </nav>
        </details>
      </Container>
      {/* On a phone the two actions get their own row: side by side, both always visible. */}
      <Container className="grid grid-cols-2 gap-2 pb-3 md:hidden">
        <ButtonLink href={REPORT_HREF} variant="action" size="sm" className="px-2 text-sm">
          Hacer un reporte
        </ButtonLink>
        <ButtonLink href={ATTENTION.lookup} variant="outline" size="sm" className="px-2 text-sm">
          Consultar mi solicitud
        </ButtonLink>
      </Container>
      <nav aria-label="Principal" className="hidden border-t border-border lg:block">
        <Container>
          <NavList items={site.navigation} variant="bar" />
        </Container>
      </nav>
    </header>
  );
}
