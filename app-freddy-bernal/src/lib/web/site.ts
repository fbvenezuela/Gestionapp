import 'server-only';
import { cache } from 'react';
import { env, isDemo } from '../env';
import { rawSettings } from './cache';
import { REAL_DEMO_BANNER, realContentShown } from './real-site';
import { normalizeSite, type Site } from './site-settings';

export type { Site, NavLink, PublicChannel, Contact } from './site-settings';

/** Where the public website lives (canonical links, sitemap, Open Graph): SITE_URL, else the app's address. Only an
 * http(s) address counts: a malformed SITE_URL falls back to the app's address instead of breaking every page. */
export function siteBaseUrl(): string {
  for (const candidate of [env.site.url, env.appUrl]) {
    try {
      const u = new URL(candidate);
      if (u.protocol === 'https:' || u.protocol === 'http:') return `${u.origin}${u.pathname}`.replace(/\/+$/, '');
    } catch {
      // try the next one
    }
  }
  return 'http://localhost:3000';
}

/** The public website's settings as the pages show them (once per request; cached as anon with the tag web:settings).
 * If the settings cannot be read, the starting values of the client's config: the header, the footer and the 404 page
 * still show (the page's own content decides whether it can). */
export const getSite = cache(async (): Promise<Site> => {
  const opts = { demo: isDemo(), indexable: env.site.indexable, baseUrl: siteBaseUrl() };
  let site: Site;
  try {
    site = normalizeSite(await rawSettings(), opts);
  } catch (e) {
    console.error('[web] no se pudieron leer los ajustes del sitio; se usan los iniciales:', (e as Error).message);
    site = normalizeSite({}, opts);
  }
  // With the official site's content (D-101) the band always says it is not the official site, whatever its setting.
  return realContentShown() ? { ...site, demoBanner: REAL_DEMO_BANNER } : site;
});
