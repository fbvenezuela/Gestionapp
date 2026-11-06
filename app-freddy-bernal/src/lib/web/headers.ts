import { NEVER_INDEXED, PUBLIC_SEGMENTS } from './routes';

// The HTTP headers of the app (next.config.ts headers(), design §7, docs/diagnostico.md problem 16). Every address gets
// the base security headers; the public website's pages also get a Content-Security-Policy and a narrower
// Permissions-Policy. The panel keeps what it had (no CSP: it loads Google's Drive picker and its own tools).
//
// CSP of the website, without nonces (a nonce would make every page dynamic and lose the static, cached pages; the guide
// in node_modules/next/dist/docs, «Content Security Policy», «Without Nonces»): scripts and styles from the site itself
// (Next's inline bootstrap needs 'unsafe-inline'), images from the site, data:/blob: (previews of a photo before
// sending), the OpenStreetMap tiles of the citizen form's map and the storage of the media library; frames only from
// youtube-nocookie.com (the video loads when someone taps it) and, when Turnstile is configured, Cloudflare's widget.
// Nothing else may be loaded, framed or posted to. Pure: next.config.ts reads it while building, tests check it.

export type HeaderRule = { source: string; headers: { key: string; value: string }[] };

export type CspOptions = {
  /** next dev: React needs eval and the hot reload a websocket. */
  dev: boolean;
  /** The site is served over https (SITE_URL): ask the browser to upgrade any http address. */
  upgradeInsecure: boolean;
  /** Where the media library's files live besides the site (the Supabase project in production). */
  imageOrigins?: string[];
  /** Cloudflare Turnstile is on (both keys set). */
  turnstile?: boolean;
};

export const YOUTUBE_EMBED_ORIGIN = 'https://www.youtube-nocookie.com';
export const OSM_TILE_ORIGINS = ['https://tile.openstreetmap.org', 'https://*.tile.openstreetmap.org'] as const;
export const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';

export function publicCsp(o: CspOptions): string {
  const turnstile = o.turnstile ? [TURNSTILE_ORIGIN] : [];
  const directives = [
    "default-src 'self'",
    `script-src ${["'self'", "'unsafe-inline'", ...(o.dev ? ["'unsafe-eval'"] : []), ...turnstile].join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${["'self'", 'data:', 'blob:', ...OSM_TILE_ORIGINS, ...(o.imageOrigins ?? [])].join(' ')}`,
    "font-src 'self'",
    `connect-src ${["'self'", ...(o.dev ? ['ws:', 'wss:'] : []), ...turnstile].join(' ')}`,
    `frame-src ${[YOUTUBE_EMBED_ORIGIN, ...turnstile].join(' ')}`,
    "media-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(o.upgradeInsecure ? ['upgrade-insecure-requests'] : []),
  ];
  return directives.join('; ');
}

/** The base headers of every address (as before the website). */
export const BASE_SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(self)' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
] as const;

/** The website asks for nothing but the location (the citizen form's «Usar mi ubicación», only on tap). */
export const PUBLIC_PERMISSIONS_POLICY = 'camera=(), microphone=(), geolocation=(self), payment=(), usb=(), browsing-topics=()';

/** The source patterns of the website's pages: the home and every public section with what hangs from it. */
export function publicSources(): string[] {
  const sections = PUBLIC_SEGMENTS.join('|');
  return ['/', `/:section(${sections})`, `/:section(${sections})/:rest*`];
}

/** Every header rule, in order (a later rule that sets the same header wins for the addresses it matches). */
export function securityHeaderRules(o: { csp: CspOptions; indexable: boolean }): HeaderRule[] {
  const rules: HeaderRule[] = [{ source: '/:path*', headers: [...BASE_SECURITY_HEADERS] }];
  const csp = publicCsp(o.csp);
  for (const source of publicSources()) {
    rules.push({
      source,
      headers: [
        { key: 'Content-Security-Policy', value: csp },
        { key: 'Permissions-Policy', value: PUBLIC_PERMISSIONS_POLICY },
      ],
    });
  }
  // D-95: nothing is indexed until the site is (SITE_INDEXABLE=true); the panel, the private lookup and the API never.
  const noindex = [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }];
  if (!o.indexable) rules.push({ source: '/:path*', headers: noindex });
  else for (const path of NEVER_INDEXED) rules.push({ source: `${path}/:path*`, headers: noindex });
  return rules;
}
