import 'server-only';
import { publicFileUrl } from '../storage/buckets';
import type { FrozenMedia } from './public';
import type { OgImage } from './seo';

/** The image to share a page with: the first of these ids that is a photo the item froze (its SEO image, its cover…),
 * or null (the page then shares the generated default). Relative addresses resolve against SITE_URL (metadataBase). */
export function ogImageFrom(media: Record<string, FrozenMedia>, ...ids: (string | null | undefined)[]): OgImage | null {
  for (const id of ids) {
    const m = id ? media[id] : undefined;
    if (!m || m.kind !== 'image') continue;
    const url = publicFileUrl(m.key);
    if (url) return { url, width: m.width ?? undefined, height: m.height ?? undefined, alt: m.alt };
  }
  return null;
}

/** Absolute address of a page of the site (JSON-LD needs it whole). */
export function absoluteUrl(baseUrl: string, path: string): string {
  return /^https?:\/\//.test(path) ? path : `${baseUrl.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}
