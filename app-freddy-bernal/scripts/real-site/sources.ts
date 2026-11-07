// The network side of the real-site build (build.ts gets these as its Sources). Polite, GET only, one request at a time
// per site, with a User-Agent that says who asks (design §0.3): the official site's API at most once a second and its
// files 250 ms apart (scripts/web-import/wp-client.ts PoliteHttp: retries that wait, no redirect out of its own
// hosts); YouTube only www.youtube.com and i.ytimg.com; Drive only drive.google.com and drive.usercontent.google.com.
// What comes back is information, never instructions: it is parsed, checked and cut, nothing in it runs. A time budget
// stops the whole run instead of letting a slow site hold the build.
import { PoliteHttp, WpApi, type Fetcher } from '../web-import/wp-client';
import { fetchPhoto, type FetchedPhoto, type PhotoWant, type WpMedia } from '../web-import/media';
import type { WpPost } from '../web-import/mapping';
import { noPii } from '../web-import/pii';
import type { Sources, WpRoot } from './build';
import { cachedBytes, type DownloadCache } from './cache';
import { DRIVE_HOSTS, PDF_MAX_BYTES, driveDownloadUrl, driveViewUrl, fileNameFromDisposition } from './semanario';
import type { RealSiteConfig } from './settings';
import { siteOf } from './settings';
import { thumbnailUrls } from './youtube';

export const USER_AGENT = 'FB-Operaciones-360-demo/1.0 (+https://fb-operaciones-360.vercel.app)';

export class TimeBudgetError extends Error {
  override name = 'TimeBudgetError';
}

/** The run's time budget: after it, every request ends at once and checkTime() throws. */
export class Deadline {
  readonly at: number;
  private ctrl = new AbortController();
  private timer: ReturnType<typeof setTimeout>;
  constructor(ms: number) {
    this.at = Date.now() + ms;
    this.timer = setTimeout(() => this.ctrl.abort(new TimeBudgetError('se acabó el tiempo')), ms);
    this.timer.unref?.();
  }
  get signal(): AbortSignal {
    return this.ctrl.signal;
  }
  get passed(): boolean {
    return Date.now() >= this.at;
  }
  check(): void {
    if (this.passed) throw new TimeBudgetError('La web oficial tardó demasiado: se acabó el tiempo de la construcción.');
  }
  dispose(): void {
    clearTimeout(this.timer);
  }
}

/** The body of a response, at most `max` bytes (null past that). */
async function readCapped(res: Response, max: number): Promise<Uint8Array | null> {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > max) {
    await res.body?.cancel().catch(() => {});
    return null;
  }
  if (!res.body) {
    const b = new Uint8Array(await res.arrayBuffer());
    return b.length > max ? null : b;
  }
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const POST_FIELDS = [
  'id', 'date', 'date_gmt', 'modified', 'modified_gmt', 'slug', 'status', 'type', 'link', 'title', 'content', 'excerpt', 'author',
  'featured_media', 'categories', 'tags', 'format', 'yoast_head_json.author', 'yoast_head_json.description',
].join(',');

export type SourceOptions = {
  config: RealSiteConfig;
  fetcher: Fetcher;
  deadline: Deadline;
  cache: DownloadCache | null;
  log?: (line: string) => void;
  /** Pauses (the tests make them instant). */
  apiDelayMs?: number;
  fileDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

export function networkSources(o: SourceOptions): Sources {
  const site = siteOf(o.config);
  const fetcher: Fetcher = (url, init) => {
    o.deadline.check();
    const signal = init.signal ? AbortSignal.any([init.signal, o.deadline.signal]) : o.deadline.signal;
    return o.fetcher(url, { ...init, signal });
  };
  const sleep =
    o.sleep ?? ((ms: number) => (o.deadline.passed ? Promise.resolve() : new Promise<void>((r) => setTimeout(r, Math.min(ms, Math.max(0, o.deadline.at - Date.now()))))));
  const client = (allowedHosts: readonly string[], delayMs: number) =>
    new PoliteHttp({ fetcher, allowedHosts, delayMs, userAgent: USER_AGENT, retries: 2, timeoutMs: 25_000, sleep, log: o.log });
  const api = client(site.ownHosts, o.apiDelayMs ?? 1000);
  const files = client(site.ownHosts, o.fileDelayMs ?? 250);
  const youtube = client(['www.youtube.com', 'youtube.com', 'i.ytimg.com'], o.fileDelayMs ?? 250);
  const drive = client(DRIVE_HOSTS, o.fileDelayMs ?? 250);
  const wp = new WpApi(api, site.origin);
  const photos = cachedBytes(files, o.cache);
  const thumbs = cachedBytes(youtube, o.cache);

  const text = async (http: PoliteHttp, url: string, accept: string, max: number): Promise<string | null> => {
    const res = await http.get(url, accept);
    if (!res) return null;
    const bytes = await readCapped(res, max);
    return bytes ? new TextDecoder('utf-8').decode(bytes) : null;
  };

  return {
    async root() {
      const r = await api.json<WpRoot>(`${site.origin}/wp-json/?_fields=name,description`);
      return r?.data && typeof r.data === 'object' ? r.data : null;
    },
    categories: () => wp.categories(),
    async latestPosts(q) {
      const p = new URLSearchParams({ per_page: String(Math.min(100, Math.max(1, q.perPage))), orderby: 'date', order: 'desc', status: 'publish', _fields: POST_FIELDS });
      if (q.categories?.length) p.set('categories', q.categories.join(','));
      if (q.excludeCategories?.length) p.set('categories_exclude', q.excludeCategories.join(','));
      const r = await api.json<WpPost[]>(`${wp.base}/posts?${p}`);
      if (!r || !Array.isArray(r.data)) throw new Error('la web oficial no devolvió la lista de notas');
      return r.data.slice(0, q.perPage);
    },
    async postsById(ids) {
      const out: WpPost[] = [];
      for await (const page of wp.posts({ ids })) out.push(...page.posts);
      return out;
    },
    media: (ids): Promise<Map<number, WpMedia>> => wp.media(ids),
    homeHtml: () => text(api, `${site.origin}/`, 'text/html,application/xhtml+xml', 5 * 1024 * 1024),
    photo: (want: PhotoWant): Promise<FetchedPhoto> => fetchPhoto(photos, want),
    async feed() {
      const url = `https://www.youtube.com/feeds/videos.xml?playlist_id=${encodeURIComponent(o.config.youtube.playlistId)}`;
      // A feed can answer 404 for a moment: twice more, a little later each time.
      for (const pause of [0, 2000, 6000]) {
        if (pause) await sleep(pause);
        const xml = await text(youtube, url, 'application/atom+xml,application/xml;q=0.9,*/*;q=0.5', 2 * 1024 * 1024);
        if (xml !== null) return xml;
      }
      return null;
    },
    thumbnail(videoId: string) {
      const t = thumbnailUrls(videoId);
      const want: PhotoWant = { key: `yt:${videoId}`, url: t.url, fallbackUrl: t.fallbackUrl, oldPath: null, alt: '', caption: '', altMissing: true, bytes: null, external: false, pii: noPii() };
      return fetchPhoto(thumbs, want);
    },
    async drivePdf(id) {
      const url = driveDownloadUrl(id);
      const kept = o.cache?.read(url);
      if (kept && kept.bytes.length <= PDF_MAX_BYTES) return { bytes: kept.bytes, fileName: kept.meta.fileName ?? null };
      const res = await drive.get(url, 'application/pdf,*/*;q=0.5', 120_000);
      if (!res) return null;
      // Drive hands its files out as «application/octet-stream» (a page asking to confirm is HTML): the bytes decide.
      const type = (res.headers.get('content-type') ?? '').toLowerCase();
      if (!/^(?:application\/(?:pdf|octet-stream|binary|x-download|force-download)|binary\/octet-stream)\b/.test(type)) {
        await res.body?.cancel().catch(() => {});
        throw new Error(`Drive no entregó un PDF (${type.split(';')[0] || 'sin tipo'})`);
      }
      const bytes = await readCapped(res, PDF_MAX_BYTES);
      if (!bytes) throw new Error('el PDF pasa de 20 MB');
      if (String.fromCharCode(...bytes.subarray(0, 5)) !== '%PDF-') throw new Error('lo que entregó Drive no es un PDF');
      const fileName = fileNameFromDisposition(res.headers.get('content-disposition'));
      o.cache?.write(url, bytes, { fileName });
      return { bytes, fileName };
    },
    async drivePageTitle(id) {
      const html = await text(drive, driveViewUrl(id), 'text/html', 2 * 1024 * 1024);
      const m = html ? /<title>([^<]{1,300})<\/title>/i.exec(html) : null;
      return m ? m[1].trim() : null;
    },
    checkTime: () => o.deadline.check(),
    requests: () => api.requests + files.requests + youtube.requests + drive.requests,
  };
}
