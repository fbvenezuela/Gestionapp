import type { ReactNode } from 'react';
import { FlaskConicalIcon } from './icons';
import type { Site } from '@/lib/web/site-settings';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';

// The frame of every public page (the (web) layout and the 404 page): «Saltar al contenido», the demo banner, the
// header, the page and the footer. Its own light frame: none of the panel's (no assistant, no service worker, no panel
// scripts, D-91). An opaque ivory background over the panel's glass one.

/** D-95: the test version says so on every page, fixed (it cannot be closed). */
export function DemoBanner({ text }: { text: string }) {
  return (
    <aside aria-label="Versión de prueba" className="bg-charcoal text-on-charcoal">
      <p className="mx-auto flex max-w-6xl items-center justify-center gap-2 px-4 py-2 text-center text-sm font-semibold sm:px-6">
        <FlaskConicalIcon className="h-4 w-4 shrink-0" />
        {text}
      </p>
    </aside>
  );
}

export function PublicChrome({ site, children }: { site: Site; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-ivory text-text">
      <a
        href="#contenido"
        className="sr-only z-50 rounded-full bg-action px-5 py-3 font-semibold text-on-action focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Saltar al contenido
      </a>
      {site.demo ? <DemoBanner text={site.demoBanner} /> : null}
      <SiteHeader site={site} />
      <main id="contenido" tabIndex={-1} className="flex-1 focus:outline-none">
        {children}
      </main>
      <SiteFooter site={site} />
    </div>
  );
}
