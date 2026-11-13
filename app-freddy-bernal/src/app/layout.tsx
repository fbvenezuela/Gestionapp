import type { Metadata, Viewport } from 'next';
import { Montserrat } from 'next/font/google';
import { brand } from '@/lib/client-config';
import { env } from '@/lib/env';
import './globals.css';

const montserrat = Montserrat({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-montserrat', display: 'swap' });

/** Absolute addresses for what a page shares (the default image of src/app/opengraph-image.tsx is at the root): the
 * website's address (SITE_URL), else the app's. A malformed SITE_URL never takes the app down. */
function baseUrl(): URL {
  for (const candidate of [env.site.url, env.appUrl, 'http://localhost:3000']) {
    try {
      if (candidate) return new URL(candidate);
    } catch {
      // try the next one
    }
  }
  return new URL('http://localhost:3000');
}

export const metadata: Metadata = {
  metadataBase: baseUrl(),
  title: { default: brand.appName, template: `%s · ${brand.shortName}` },
  description: 'La app interna del equipo: agenda, material, piezas, aprobación y publicaciones.',
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: brand.shortName, statusBarStyle: 'default' },
  // Google Search Console proves the domain is ours when Google asks it to publish the OAuth app (docs/DRIVE.md).
  ...(process.env.GOOGLE_SITE_VERIFICATION ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } } : {}),
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: brand.themeColor,
};

// The root of both faces of the app: the public website (src/app/(web), its own light frame) and the team's panel
// (its groups wrap themselves in PanelChrome: glass switch, «Sin señal», toasts and the service worker). Nothing here
// runs in the browser.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-VE" className={montserrat.variable} suppressHydrationWarning>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
