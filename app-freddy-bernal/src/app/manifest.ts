import type { MetadataRoute } from 'next';
import { brand } from '@/lib/client-config';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: brand.appName,
    short_name: brand.shortName,
    description: 'Plataforma interna del equipo',
    // The panel's entry (D-91): `/` is the public website. The id stays the old start address, so the app already
    // installed on a phone is the same app and simply opens here from now on.
    id: '/',
    start_url: '/panel',
    display: 'standalone',
    background_color: '#F7F7F5',
    theme_color: brand.themeColor,
    lang: 'es-VE',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
