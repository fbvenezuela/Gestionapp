import type { Metadata } from 'next';
import { PublicChrome } from '@/components/web/public-chrome';
import { DEFAULT_OG_IMAGE, defaultDescription, robotsMeta, siteTitle } from '@/lib/web/seo';
import { getSite } from '@/lib/web/site';

// The public website (D-91, design §1–§2): its own light frame, not the panel's (no assistant, no service worker, no
// panel scripts; src/app/layout.tsx is only the <html>). Every page reads published content as anon (D-96) and is
// cached; the frame reads the site's settings (navigation, footer, channels, banner). Nothing is indexed until
// SITE_INDEXABLE=true (D-95): robots meta here, X-Robots-Tag in next.config.ts, robots.txt in src/app/robots.ts.

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSite();
  return {
    metadataBase: new URL(site.baseUrl),
    title: { default: siteTitle(site), template: `%s · ${site.name}` },
    description: defaultDescription(site),
    applicationName: siteTitle(site),
    robots: robotsMeta(site.indexable),
    openGraph: { type: 'website', siteName: siteTitle(site), locale: 'es_VE', images: [{ ...DEFAULT_OG_IMAGE, alt: site.wordmark }] },
    twitter: { card: 'summary_large_image' },
    formatDetection: { telephone: false, email: false, address: false },
    // The panel's installable app is not the website: no manifest and no «add to home screen» as the panel here.
    manifest: null,
    appleWebApp: null,
  };
}

export default async function WebLayout({ children }: { children: React.ReactNode }) {
  const site = await getSite();
  return <PublicChrome site={site}>{children}</PublicChrome>;
}
