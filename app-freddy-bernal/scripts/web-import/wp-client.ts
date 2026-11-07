// Reading the old site, politely: only GET, one request at a time with a pause between them, a User-Agent that says
// who is asking and why, retries that wait (and listen to Retry-After) when the site is busy, and only the old site's
// own addresses (no redirect to another host is followed: nothing in an article can make the importer fetch an
// arbitrary address). It reads the public REST API (posts, categories, tags, media) and the photos.
import type { WpPost, WpTerm } from './mapping';
import type { WpMedia } from './media';

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

export const USER_AGENT = 'FB-Operaciones-360-importador/1.0 (migración de la web oficial a la plataforma nueva; solo lectura; una petición a la vez)';

export class ImportHttpError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
  }
}

export class TooBigError extends Error {
  override name = 'TooBigError';
}

export type HttpOptions = {
  fetcher: Fetcher;
  /** The old site's hosts (with and without www): the only ones it ever asks. */
  allowedHosts: readonly string[];
  /** Pause between two requests, in milliseconds. */
  delayMs: number;
  userAgent?: string;
  retries?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  log?: (line: string) => void;
};

const RETRY_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export class PoliteHttp {
  private lastAt = 0;
  requests = 0;
  constructor(private o: HttpOptions) {}

  private async wait(ms: number) {
    if (ms <= 0) return;
    await (this.o.sleep ?? ((t) => new Promise((r) => setTimeout(r, t))))(ms);
  }

  /** https, on the old site's hosts only (http of the old site becomes https). */
  allowed(raw: string): URL | null {
    try {
      const u = new URL(raw);
      const host = u.hostname.toLowerCase();
      if (!this.o.allowedHosts.includes(host)) return null;
      if (u.protocol === 'http:') u.protocol = 'https:';
      if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return null;
      return u;
    } catch {
      return null;
    }
  }

  /** One GET, with the pause, the retries and the redirects (only to the same hosts). */
  async get(raw: string, accept: string, timeoutMs = this.o.timeoutMs ?? 30_000): Promise<Response | null> {
    let url = this.allowed(raw);
    if (!url) throw new ImportHttpError(`No se pide una dirección fuera de la web vieja: ${raw.slice(0, 120)}`, null);
    const retries = this.o.retries ?? 4;
    for (let attempt = 0, hops = 0; ; ) {
      await this.wait(this.lastAt + this.o.delayMs - Date.now());
      let res: Response;
      try {
        this.requests++;
        res = await this.o.fetcher(url.toString(), {
          method: 'GET',
          redirect: 'manual',
          headers: { 'User-Agent': this.o.userAgent ?? USER_AGENT, Accept: accept },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (e) {
        this.lastAt = Date.now();
        if (++attempt > retries) throw new ImportHttpError(`La web vieja no respondió (${(e as Error).message}).`, null);
        this.o.log?.(`  (sin respuesta; se reintenta en ${2 ** attempt * 2} s)`);
        await this.wait(2 ** attempt * 2000);
        continue;
      }
      this.lastAt = Date.now();
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        const next = this.allowed(new URL(res.headers.get('location')!, url).toString());
        if (!next || ++hops > 3) throw new ImportHttpError(`La web vieja redirige fuera de sí misma: ${url.pathname}`, res.status);
        url = next;
        continue;
      }
      if (res.status === 404 || res.status === 410) return null;
      if (RETRY_STATUS.has(res.status)) {
        if (++attempt > retries) throw new ImportHttpError(`La web vieja respondió ${res.status} varias veces.`, res.status);
        const after = Number(res.headers.get('retry-after'));
        const ms = Number.isFinite(after) && after > 0 ? Math.min(after, 120) * 1000 : 2 ** attempt * 2000;
        this.o.log?.(`  (la web vieja está ocupada: ${res.status}; se espera ${Math.round(ms / 1000)} s)`);
        await res.body?.cancel().catch(() => {});
        await this.wait(ms);
        continue;
      }
      if (!res.ok) throw new ImportHttpError(`La web vieja respondió ${res.status} en ${url.pathname}.`, res.status);
      return res;
    }
  }

  /** JSON of at most `maxBytes` (8 MB unless said: a hundred posts with their text fit many times over). A bigger answer
   * is refused before it is read whole: it never fills the memory of the build. */
  async json<T>(raw: string, maxBytes = JSON_MAX_BYTES): Promise<{ data: T; headers: Headers } | null> {
    const res = await this.get(raw, 'application/json');
    if (!res) return null;
    let text: string;
    try {
      text = new TextDecoder('utf-8').decode(await readBody(res, maxBytes));
    } catch (e) {
      if ((e as Error).name === 'TooBigError') throw new ImportHttpError(`La web vieja devolvió demasiados datos en ${new URL(raw).pathname}.`, res.status);
      throw e;
    }
    try {
      return { data: JSON.parse(text) as T, headers: res.headers };
    } catch {
      throw new ImportHttpError(`La web vieja no devolvió datos legibles en ${new URL(raw).pathname}.`, res.status);
    }
  }

  /** A file, at most `maxBytes` (TooBigError past that); null when it is not there. */
  async bytes(raw: string, maxBytes: number): Promise<Uint8Array | null> {
    const res = await this.get(raw, 'image/avif,image/webp,image/png,image/jpeg,*/*;q=0.5', 60_000);
    if (!res) return null;
    return readBody(res, maxBytes);
  }
}

/** The JSON a request takes unless it says otherwise. */
export const JSON_MAX_BYTES = 8 * 1024 * 1024;

/** A response's body, at most `maxBytes` (TooBigError past that, read no further). */
async function readBody(res: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel().catch(() => {});
    throw new TooBigError(`más de ${maxBytes} bytes`);
  }
  if (!res.body) {
    const all = new Uint8Array(await res.arrayBuffer());
    if (all.length > maxBytes) throw new TooBigError(`más de ${maxBytes} bytes`);
    return all;
  }
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new TooBigError(`más de ${maxBytes} bytes`);
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
const MEDIA_FIELDS = 'id,source_url,mime_type,media_type,alt_text,caption,media_details';
const TERM_FIELDS = 'id,name,slug,link,count';

/** The old site's public WordPress API (/wp-json/wp/v2/…). */
export class WpApi {
  readonly base: string;
  constructor(
    private http: PoliteHttp,
    siteUrl: string,
  ) {
    this.base = `${siteUrl.replace(/\/+$/, '')}/wp-json/wp/v2`;
  }

  private url(path: string, params: Record<string, string | number | undefined>): string {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q.set(k, String(v));
    return `${this.base}/${path}?${q}`;
  }

  async categories(): Promise<WpTerm[]> {
    const out: WpTerm[] = [];
    for (let page = 1; page <= 20; page++) {
      const r = await this.http.json<WpTerm[]>(this.url('categories', { per_page: 100, page, _fields: TERM_FIELDS }));
      if (!r || !Array.isArray(r.data)) break;
      out.push(...r.data);
      if (page >= Number(r.headers.get('x-wp-totalpages') ?? 1)) break;
    }
    return out;
  }

  /** Posts, newest first, a page at a time (published since `since` when given), at most `limit`; or exactly `ids`. */
  async *posts(o: { since?: string | null; limit?: number | null; perPage?: number; ids?: number[] | null } = {}): AsyncGenerator<{ posts: WpPost[]; total: number }> {
    if (o.ids?.length) {
      for (let k = 0; k < o.ids.length; k += 100) {
        const chunk = o.ids.slice(k, k + 100);
        const r = await this.http.json<WpPost[]>(this.url('posts', { include: chunk.join(','), per_page: chunk.length, orderby: 'include', status: 'publish', _fields: POST_FIELDS }));
        if (r && Array.isArray(r.data) && r.data.length) yield { posts: r.data, total: Number(r.headers.get('x-wp-total') ?? r.data.length) };
      }
      return;
    }
    const perPage = Math.min(100, Math.max(1, o.perPage ?? 100));
    let left = o.limit ?? Infinity;
    // WordPress's «after» is exclusive: the last second of the day before.
    const after = o.since ? `${new Date(Date.parse(`${o.since}T00:00:00Z`) - 1000).toISOString().slice(0, 19)}` : undefined;
    for (let page = 1; left > 0; page++) {
      const r = await this.http.json<WpPost[]>(
        this.url('posts', { per_page: Math.min(perPage, left), page, orderby: 'date', order: 'desc', status: 'publish', after, _fields: POST_FIELDS }),
      );
      // Past the last page WordPress answers 400 («rest_post_invalid_page_number»), seen here as an error: stop.
      if (!r || !Array.isArray(r.data) || !r.data.length) return;
      const total = Number(r.headers.get('x-wp-total') ?? 0);
      const batch = r.data.slice(0, Number.isFinite(left) ? left : undefined);
      left -= batch.length;
      yield { posts: batch, total };
      if (page >= Number(r.headers.get('x-wp-totalpages') ?? 1)) return;
    }
  }

  /** How many posts and pages the site has (the X-WP-Total of a one-item list). */
  async counts(): Promise<{ posts: number | null; pages: number | null }> {
    const one = async (path: string) => {
      const r = await this.http.json<unknown[]>(this.url(path, { per_page: 1, _fields: 'id' }));
      const n = r ? Number(r.headers.get('x-wp-total')) : NaN;
      return Number.isFinite(n) ? n : null;
    };
    return { posts: await one('posts'), pages: await one('pages') };
  }

  async media(ids: number[]): Promise<Map<number, WpMedia>> {
    const out = new Map<number, WpMedia>();
    const list = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
    for (let k = 0; k < list.length; k += 100) {
      const chunk = list.slice(k, k + 100);
      const r = await this.http.json<WpMedia[]>(this.url('media', { include: chunk.join(','), per_page: 100, _fields: MEDIA_FIELDS }));
      for (const m of r && Array.isArray(r.data) ? r.data : []) if (m && typeof m.id === 'number') out.set(m.id, m);
    }
    return out;
  }

  async tags(ids: number[]): Promise<Map<number, WpTerm>> {
    const out = new Map<number, WpTerm>();
    const list = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
    for (let k = 0; k < list.length; k += 100) {
      const chunk = list.slice(k, k + 100);
      const r = await this.http.json<WpTerm[]>(this.url('tags', { include: chunk.join(','), per_page: 100, _fields: TERM_FIELDS }));
      for (const t of r && Array.isArray(r.data) ? r.data : []) if (t && typeof t.id === 'number') out.set(t.id, t);
    }
    return out;
  }
}
