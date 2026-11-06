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

// The team's screens (D-91: the panel keeps its addresses). The first three are the internal platform's public pages
// (registered with Google for the Drive app): readable by anyone, never part of the website.
export const PANEL_SEGMENTS = [
  'acerca', 'privacidad', 'condiciones',
  'admin', 'agenda', 'ajustes', 'aprobar', 'avisos', 'ayuda', 'biblioteca', 'buscar', 'doble-factor', 'entrar', 'eventos', 'hoy', 'jefe',
  'mensajes', 'municipios', 'obras', 'oficina', 'panel', 'perfil', 'piezas', 'publicar', 'redes', 'reportes', 'resultados', 'sin-acceso', 'tweets',
] as const;

// Framework folders, the API, the root files of src/app (icons, manifest) and the files of public/.
const OTHER_SEGMENTS = [
  '_next', 'api', '.well-known', 'manifest.webmanifest', 'icon.png', 'apple-icon.png', 'favicon.ico', 'sw.js', 'offline.html',
  'icon-192.png', 'icon-512.png', 'google124ecda45c0fc1d3.html',
  // Copied into public/ by the postinstall (scripts/copy-wasm.mjs; git-ignored): the video checker's WebAssembly.
  'mediainfo',
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

/** Whether some route of the app answers this first piece (otherwise the address would be a 404). The framework's own
 * addresses («/__nextjs…» while developing) count as known. */
export function isKnownSegment(segment: string): boolean {
  return (
    segment === '' ||
    segment.startsWith('__') ||
    APP_SEGMENTS.has(segment) ||
    (PUBLIC_FILES as readonly string[]).some((f) => segment.startsWith(f))
  );
}

// Addresses search engines never index, also when the site is indexable (robots.ts and the X-Robots-Tag header).
export const NEVER_INDEXED = ['/admin', '/panel', '/atencion/consultar', '/api'] as const;

// The team's screens robots.txt also keeps crawlers out of (they ask for a session and say noindex anyway). The internal
// platform's public pages (acerca, privacidad, condiciones) stay readable: Google checks them for the Drive app.
export const CRAWL_DISALLOWED: readonly string[] = [
  ...NEVER_INDEXED,
  ...PANEL_SEGMENTS.filter((s) => !['acerca', 'privacidad', 'condiciones', 'admin', 'panel'].includes(s)).map((s) => `/${s}`),
];

// --- Where each kind of content lives, and what to refresh when it changes (revalidate.ts) --------------------------
type Kind = 'page' | 'news' | 'project' | 'episode' | 'document' | 'notice' | 'faq' | 'indicator';

/** The home of the site is the page «inicio»; the other pages live at their own slug (only the website's sections). */
export function pagePath(slug: string): string | null {
  if (slug === 'inicio') return '/';
  return (PUBLIC_SEGMENTS as readonly string[]).includes(slug) ? `/${slug}` : null;
}

/** The address of a published item, for the kinds that have a page of their own (news, projects, pages). */
export function itemPath(kind: Kind, slug: string): string | null {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return null;
  if (kind === 'news') return `/actualidad/${slug}`;
  if (kind === 'project') return `/gestion/${slug}`;
  if (kind === 'page') return pagePath(slug);
  return null;
}

/** The pages that show a kind of content (lists and blocks), besides the item's own page. */
export const KIND_PATHS: Record<Kind, readonly string[]> = {
  page: [],
  news: ['/', '/actualidad'],
  project: ['/', '/gestion'],
  episode: ['/', '/reporte-bernal'],
  document: ['/transparencia', '/actualidad/semanario', '/gobernador'],
  notice: ['/'],
  faq: ['/atencion'],
  indicator: ['/'],
};

/** Every address to refresh when an item of this kind is published, scheduled, archived or restored. */
export function pathsForItem(kind: Kind, slug?: string | null): string[] {
  const own = slug ? itemPath(kind, slug) : null;
  return [...new Set([...KIND_PATHS[kind], ...(own ? [own] : [])])];
}
