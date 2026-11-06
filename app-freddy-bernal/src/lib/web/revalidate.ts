import 'server-only';
import { revalidatePath, revalidateTag } from 'next/cache';
import { forgetRedirects } from './redirect-map';
import { pathsForItem } from './routes';
import type { WebKind } from './schema';
import { WEB_TAG } from './tags';

// What the administrator calls after it changes something the public website shows (call these from Server Actions or
// Route Handlers, after the database committed). The pages and their data are cached as anon with tags (cache.ts) and
// also refresh by themselves every minute (tags.ts), so a scheduled item appears on time without anyone calling here;
// these make a change visible on the very next visit. `{ expire: 0 }`: the next request regenerates the page instead
// of being served the old one while it does (whoever just pressed «Publicar» sees the result).
//
//   revalidateWebItem(kind, slug)  publish, schedule, cancel a schedule, archive, unarchive or restore a published item
//   revalidateWebSettings()        navigation, footer, channels, banner, structured data (web_settings)
//   revalidateWebRedirects()       the list of old addresses (web_redirects)
//   revalidateAttended()           «lo atendido» published or withdrawn
//   revalidateWebStats()           the public figures (also refresh by themselves every five minutes)
//   revalidateWebCatalogs()        municipalities, parishes or request categories
//   revalidateWeb()                everything above at once (after an import, for instance)

const NOW = { expire: 0 } as const;

export function revalidateWebItem(kind: WebKind, slug?: string | null): void {
  revalidateTag(WEB_TAG.kind(kind), NOW);
  for (const path of pathsForItem(kind, slug)) revalidatePath(path);
  revalidatePath('/sitemap.xml');
}

export function revalidateWebSettings(): void {
  revalidateTag(WEB_TAG.settings, NOW);
}

/** The redirect lookup keeps the list in memory a minute per server (redirect-map.ts): this server forgets it now; the
 * proxy's own memory of each address also lasts at most a minute. */
export function revalidateWebRedirects(): void {
  forgetRedirects();
  revalidateTag(WEB_TAG.redirects, NOW);
}

export function revalidateAttended(): void {
  revalidateTag(WEB_TAG.attended, NOW);
}

export function revalidateWebStats(): void {
  revalidateTag(WEB_TAG.stats, NOW);
}

export function revalidateWebCatalogs(): void {
  revalidateTag(WEB_TAG.catalogs, NOW);
}

export function revalidateWeb(): void {
  for (const tag of [WEB_TAG.all, WEB_TAG.settings, WEB_TAG.catalogs, WEB_TAG.attended, WEB_TAG.stats]) revalidateTag(tag, NOW);
  revalidateWebRedirects();
  revalidatePath('/sitemap.xml');
}
