import type { Metadata, Viewport } from 'next';
import { Montserrat } from 'next/font/google';
import { Toaster } from 'sonner';
import { brand } from '@/lib/client-config';
import { OfflineBanner } from '@/components/shell/offline-banner';
import { SwRegister } from '@/components/shell/sw-register';
import './globals.css';

const montserrat = Montserrat({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-montserrat', display: 'swap' });

export const metadata: Metadata = {
  title: { default: brand.appName, template: `%s · ${brand.shortName}` },
  description: 'Plataforma interna del equipo: agenda, material, piezas, aprobación y publicaciones.',
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: brand.shortName, statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: brand.themeColor,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-VE" className={montserrat.variable}>
      <body className="min-h-dvh antialiased">
        <OfflineBanner />
        {children}
        <Toaster position="top-center" richColors closeButton />
        <SwRegister />
      </body>
    </html>
  );
}
