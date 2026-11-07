// The program's episodes from the governor's own YouTube channel: its public feed of long videos (Atom, the latest 15,
// no key needed) → title as published, video id and day. The descriptions are read only to see which of the configured
// official accounts the channel links (they name private people: they are never kept). Thumbnails are brought as our
// own photos (the site's CSP allows images only from itself). Pure.
import { decodeEntities } from '../web-import/html';
import { slugFromTitle } from '../../src/lib/web/schema';
import { accountKeyOf } from '../../src/lib/web/real-site';

export type FeedEntry = { videoId: string; title: string; published: string; description: string };
export type Feed = { channelId: string | null; playlistId: string | null; entries: FeedEntry[] };

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

function textOf(raw: string): string {
  const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(raw);
  return (cdata ? cdata[1] : decodeEntities(raw)).trim();
}

/** The text of the first <name>…</name> in a piece of XML (null when absent). */
function tag(xml: string, name: string): string | null {
  const n = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)</${n}>`).exec(xml);
  return m ? textOf(m[1]) : null;
}

/** A YouTube feed (videos.xml): the channel, the list and its entries, newest first. */
export function parseFeed(xml: string): Feed {
  const src = typeof xml === 'string' ? xml : '';
  const firstEntry = src.indexOf('<entry');
  const head = firstEntry >= 0 ? src.slice(0, firstEntry) : src;
  const entries: FeedEntry[] = [];
  for (const m of src.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/g)) {
    const e = m[1];
    const videoId = tag(e, 'yt:videoId') ?? '';
    const title = (tag(e, 'title') ?? '').replace(/\s+/g, ' ').trim();
    const published = tag(e, 'published') ?? '';
    if (!VIDEO_ID.test(videoId) || !title || Number.isNaN(Date.parse(published))) continue;
    entries.push({ videoId, title, published: new Date(published).toISOString(), description: tag(e, 'media:description') ?? '' });
  }
  entries.sort((a, b) => b.published.localeCompare(a.published) || a.videoId.localeCompare(b.videoId));
  // The list's channel (a channel's own feed says it too, and so does each entry).
  const channelId = tag(head, 'yt:channelId') || tag(src, 'yt:channelId') || null;
  return { channelId, playlistId: tag(head, 'yt:playlistId') || null, entries };
}

/** The episode's number in its title («<Programa> 261», «<PROGRAMA> N°235 // …», «<Programa>: 219»), or null. */
export function episodeNumber(title: string, programName: string): number | null {
  const words = programName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!words.length) return null;
  const m = new RegExp(`${words.join('\\s*')}\\D{0,6}(\\d{2,4})`, 'i').exec(title.normalize('NFC'));
  return m ? Number(m[1]) : null;
}

/** A video id as a piece of an address (lower case; «_» becomes «-»). */
const idSlug = (videoId: string) => videoId.toLowerCase().replace(/_/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

/** The episodes' addresses, in the order given (newest first): «<programa>-<n>» for the first video with that number,
 * the same plus its video id for another part of that episode; the title and the id when there is no number. */
export function episodeSlugs(entries: readonly { videoId: string; title: string }[], programName: string): Map<string, string> {
  const prefix = slugFromTitle(programName) || 'episodio';
  const used = new Set<string>();
  const out = new Map<string, string>();
  for (const e of entries) {
    const n = episodeNumber(e.title, programName);
    const base = n !== null ? `${prefix}-${n}` : `${slugFromTitle(e.title).slice(0, 90).replace(/-+$/, '') || prefix}-${idSlug(e.videoId)}`;
    let slug = base;
    if (used.has(slug)) slug = `${base}-${idSlug(e.videoId)}`;
    for (let k = 2; used.has(slug); k++) slug = `${base}-${idSlug(e.videoId)}-${k}`;
    used.add(slug);
    out.set(e.videoId, slug.slice(0, 120).replace(/-+$/, ''));
  }
  return out;
}

/** The two thumbnails YouTube makes of a video (the big one first). */
export function thumbnailUrls(videoId: string): { url: string; fallbackUrl: string } {
  return { url: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`, fallbackUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` };
}

/** The accounts linked in some texts («network:handle», src/lib/web/real-site.ts accountKeyOf). */
export function linkedAccountKeys(texts: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const t of texts) {
    for (const m of t.matchAll(/https?:\/\/[^\s<>"'«»]+/gi)) {
      const key = accountKeyOf(m[0].replace(/[.,;:!?)\]]+$/, ''));
      if (key) out.add(key);
    }
  }
  return out;
}

/** The configured accounts the channel links (their keys, sorted). */
export function verifiedKeys(accounts: readonly { url: string }[], linked: ReadonlySet<string>): string[] {
  const keys = new Set<string>();
  for (const a of accounts) {
    const k = accountKeyOf(a.url);
    if (k && linked.has(k)) keys.add(k);
  }
  return [...keys].sort();
}

/** Whether a feed is the configured channel's list of long videos. */
export function isConfiguredFeed(feed: Feed, cfg: { channelId: string; playlistId: string }): boolean {
  return feed.channelId === cfg.channelId && (feed.playlistId === null || feed.playlistId === cfg.playlistId);
}
