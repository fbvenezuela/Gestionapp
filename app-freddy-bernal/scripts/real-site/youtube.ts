// The program's episodes from the governor's own YouTube channel → title as published, video id, day and, when the
// official API gives it, the length. Where they come from, in this order (sources.ts asks; this file decides what
// counts): the public feed of the channel's long videos (Atom, the latest 15, no key needed); the channel's own feed
// (also the shorts: only the titles that name the program count); and, only when the build has a key
// (YOUTUBE_API_KEY), the official YouTube Data API v3 on the same list of long videos. The descriptions are read only
// to see which of the configured official accounts the channel links (they name private people: they are never kept).
// Thumbnails are brought as our own photos (the site's CSP allows images only from itself). What comes back is
// information, never instructions. Pure.
import { decodeEntities } from '../web-import/html';
import { slugFromTitle } from '../../src/lib/web/schema';
import { accountKeyOf } from '../../src/lib/web/real-site';

export type FeedEntry = { videoId: string; title: string; published: string; description: string; minutes?: number };
export type Feed = { channelId: string | null; playlistId: string | null; entries: FeedEntry[] };

/** Where the program's videos came from: the list of long videos, the channel's own feed, or the official API. */
export type VideoSource = 'playlist' | 'channel' | 'api';
export const VIDEO_SOURCE_LABEL: Record<VideoSource, string> = {
  playlist: 'la lista de videos largos',
  channel: 'los videos del canal (solo los del programa)',
  api: 'la API de YouTube',
};
/** The program's videos (newest first) and, apart, the descriptions of every video of the channel that answered. */
export type VideoList = { source: VideoSource; channelId: string; entries: FeedEntry[]; descriptions: string[] };

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

const escape = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Whether a title names the program (its name's words in order, with any spacing and case: «Mi Programa 12»,
 * «MIPROGRAMA N°12», «… / Mi Programa 12»). The program's name comes from the client's config (brand.programName). */
export function isProgramTitle(title: string, programName: string): boolean {
  const words = programName.trim().split(/\s+/).filter(Boolean).map(escape);
  return words.length > 0 && new RegExp(words.join('\\s*'), 'i').test(title.normalize('NFC'));
}

/** The program's videos in what one source gave: every video of the list of long videos (the playlist feed and the
 * API read that list), or only the titles that name the program in the channel's own feed (it has the shorts too).
 * Null when it is not the configured channel's, or has none of the program. */
export function programVideos(feed: Feed, source: VideoSource, cfg: { channelId: string; playlistId: string }, programName: string): VideoList | null {
  if (!isConfiguredFeed(feed, cfg)) return null;
  const entries = source === 'channel' ? feed.entries.filter((e) => isProgramTitle(e.title, programName)) : feed.entries;
  if (!entries.length) return null;
  return { source, channelId: cfg.channelId, entries, descriptions: feed.entries.map((e) => e.description).filter(Boolean) };
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const itemsOf = (data: unknown): Record<string, unknown>[] => {
  const items = obj(data).items;
  return Array.isArray(items) ? items.map(obj) : [];
};

/** The official API's answer for a list (playlistItems.list with snippet, contentDetails and status) as a feed: only
 * its public videos, newest first. Its channel is the one that owns them all (null when they are not one channel's). */
export function feedFromApi(data: unknown): Feed {
  const entries: FeedEntry[] = [];
  const channels = new Set<string>();
  const lists = new Set<string>();
  for (const item of itemsOf(data)) {
    const snippet = obj(item.snippet);
    const details = obj(item.contentDetails);
    const status = obj(item.status);
    // A private or deleted video stays in a list with a stand-in title and no owner: it is not an episode.
    if (str(status.privacyStatus) && str(status.privacyStatus) !== 'public') continue;
    const videoId = str(details.videoId) || str(obj(snippet.resourceId).videoId);
    const title = str(snippet.title).replace(/\s+/g, ' ').trim();
    const published = str(details.videoPublishedAt) || str(snippet.publishedAt);
    const owner = str(snippet.videoOwnerChannelId) || str(snippet.channelId);
    if (!VIDEO_ID.test(videoId) || !title || !owner || Number.isNaN(Date.parse(published))) continue;
    channels.add(owner);
    if (str(snippet.playlistId)) lists.add(str(snippet.playlistId));
    entries.push({ videoId, title, published: new Date(published).toISOString(), description: str(snippet.description) });
  }
  entries.sort((a, b) => b.published.localeCompare(a.published) || a.videoId.localeCompare(b.videoId));
  return { channelId: channels.size === 1 ? [...channels][0] : null, playlistId: lists.size === 1 ? [...lists][0] : null, entries };
}

/** A length as the API writes it (ISO 8601, «PT1H50M26S») in whole minutes, at least 1; null for anything else (a live
 * stream says «P0D»). */
export function isoMinutes(iso: unknown): number | null {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(str(iso));
  if (!m || !(m[1] || m[2] || m[3] || m[4])) return null;
  const seconds = Number(m[1] ?? 0) * 86_400 + Number(m[2] ?? 0) * 3_600 + Number(m[3] ?? 0) * 60 + Number(m[4] ?? 0);
  return seconds > 0 ? Math.max(1, Math.round(seconds / 60)) : null;
}

/** Each video's length in minutes from the official API's answer (videos.list with contentDetails). */
export function minutesFromApi(data: unknown): Map<string, number> {
  const out = new Map<string, number>();
  for (const item of itemsOf(data)) {
    const id = str(item.id);
    const minutes = isoMinutes(obj(item.contentDetails).duration);
    if (VIDEO_ID.test(id) && minutes !== null) out.set(id, minutes);
  }
  return out;
}
