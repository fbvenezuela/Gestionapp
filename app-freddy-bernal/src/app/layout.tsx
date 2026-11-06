import type { Metadata, Viewport } from 'next';
import { Montserrat } from 'next/font/google';
import { brand } from '@/lib/client-config';
import './globals.css';

const montserrat = Montserrat({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-montserrat', display: 'swap' });

export const metadata: Metadata = {
  title: { default: brand.appName, template: `%s · ${brand.shortName}` },
  description: 'Plataforma interna del equipo: agenda, material, piezas, aprobación y publicaciones.',
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
