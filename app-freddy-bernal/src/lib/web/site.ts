import 'server-only';
import { cache } from 'react';
import { env, isDemo } from '../env';
import { rawSettings } from './cache';
import { normalizeSite, type Site } from './site-settings';

export type { Site, NavLink, PublicChannel, Contact } from './site-settings';

/** Where the public website lives (canonical links, sitemap, Open Graph): SITE_URL, else the app's address. */
export function siteBaseUrl(): string {
  return (env.site.url || env.appUrl).replace(/\/+$/, '');
}

/** The public website's settings as the pages show them (once per request; cached as anon with the tag web:settings). */
export const getSite = cache(async (): Promise<Site> =>
  normalizeSite(await rawSettings(), { demo: isDemo(), indexable: env.site.indexable, baseUrl: siteBaseUrl() }),
);
