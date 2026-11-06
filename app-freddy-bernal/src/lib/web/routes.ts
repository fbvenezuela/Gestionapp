// The addresses of the app, as the proxy (src/proxy.ts) and next.config.ts see them. Pure and with no imports: the proxy
// runs apart from the pages and next.config.ts reads it while building.
//
//   PUBLIC_SEGMENTS  the first piece of every address of the public website (D-91), besides the home «/». They get the
//                    public security headers (CSP) and no session work in the proxy.
//   APP_SEGMENTS     every first piece that some route, file or folder of the app answers. An address whose first piece is
//                    not here would be a 404, so only those (and the old WordPress queries on «/») are looked up in the
//                    redirects of old addresses (web_redirects): nothing else pays for that lookup.
// tests/unit/web-routes.test.ts checks APP_SEGMENTS against src/app and public/.

export const PUBLIC_SEGMENTS = [
  'gobernador',
  'gestion',
  'actualidad',
  'reporte-bernal',
  'atencion',
  'transparencia',
  'canales',
  'aviso-de-privacidad',
  'condiciones-de-participacion',
  'accesibilidad',
] as const;

// Files at the root of the site that belong to the public website (search engines and social networks read them).
export const PUBLIC_FILES = ['robots.txt', 'sitemap.xml', 'opengraph-image', 'twitter-image'] as const;

const PANEL_SEGMENTS = [
  'acerca', 'admin', 'agenda', 'ajustes', 'aprobar', 'avisos', 'ayuda', 'biblioteca', 'buscar', 'condiciones', 'doble-factor', 'entrar',
  'eventos', 'hoy', 'jefe', 'mensajes', 'municipios', 'obras', 'panel', 'perfil', 'piezas', 'privacidad', 'publicar', 'redes', 'reportes',
  'resultados', 'sin-acceso', 'tweets',
];

// Framework folders, the API, the root files of src/app (icons, manifest) and the files of public/.
const OTHER_SEGMENTS = [
  '_next', 'api', '.well-known', 'manifest.webmanifest', 'icon.png', 'apple-icon.png', 'favicon.ico', 'sw.js', 'offline.html',
  'icon-192.png', 'icon-512.png', 'google124ecda45c0fc1d3.html',
];

export const APP_SEGMENTS: ReadonlySet<string> = new Set([...PUBLIC_SEGMENTS, ...PUBLIC_FILES, ...PANEL_SEGMENTS, ...OTHER_SEGMENTS]);

/** The first piece of a path: «/gestion/puente» → «gestion», «/» → «». */
export function firstSegment(pathname: string): string {
  return pathname.split('/')[1] ?? '';
}

/** Whether an address belongs to the public website (the home, its sections and its files for search engines). */
export function isPublicPath(pathname: string): boolean {
  if (pathname === '/') return true;
  const first = firstSegment(pathname);
  return (PUBLIC_SEGMENTS as readonly string[]).includes(first) || (PUBLIC_FILES as readonly string[]).some((f) => first.startsWith(f));
}

/** Whether some route of the app answers this first piece (otherwise the address would be a 404). */
export function isKnownSegment(segment: string): boolean {
  return segment === '' || APP_SEGMENTS.has(segment) || (PUBLIC_FILES as readonly string[]).some((f) => segment.startsWith(f));
}

// Addresses search engines never index, also when the site is indexable (robots.ts and the X-Robots-Tag header).
export const NEVER_INDEXED = ['/admin', '/panel', '/atencion/consultar', '/api'] as const;
