// The importer reads the old site politely (scripts/web-import/wp-client.ts): GET only, one at a time with a pause, a
// User-Agent that says who asks, retries that wait (Retry-After included), only the old site's own hosts (no redirect
// to another host is followed), files with a size cap; and the WordPress API page by page. A fake site answers here.
import { describe, it, expect } from 'vitest';
import { PoliteHttp, TooBigError, USER_AGENT, WpApi, type Fetcher } from '../../scripts/web-import/wp-client';

type Call = { url: string; init: RequestInit };
function fake(answer: (url: URL, n: number) => Response) {
  const calls: Call[] = [];
  const fetcher: Fetcher = async (url, init) => {
    calls.push({ url, init });
    return answer(new URL(url), calls.length);
  };
  return { calls, fetcher };
}
function http(fetcher: Fetcher, waits: number[] = []) {
  return new PoliteHttp({ fetcher, allowedHosts: ['sitio-viejo.test', 'www.sitio-viejo.test'], delayMs: 1000, sleep: async (ms) => void waits.push(ms) });
}
const json = (data: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json', ...headers } });

describe('pedir con cortesía', () => {
  it('solo GET, con su User-Agent, una a la vez y con la pausa entre una y otra', async () => {
    const waits: number[] = [];
    const f = fake(() => json({ ok: true }));
    const h = http(f.fetcher, waits);
    await h.json('https://sitio-viejo.test/wp-json/wp/v2/posts');
    await h.json('https://sitio-viejo.test/wp-json/wp/v2/posts?page=2');
    expect(f.calls.map((c) => c.init.method)).toEqual(['GET', 'GET']);
    expect(f.calls.every((c) => (c.init.headers as Record<string, string>)['User-Agent'] === USER_AGENT)).toBe(true);
    expect(USER_AGENT).toMatch(/importador/);
    // The second waited for the pause (most of the second, since the first had just finished).
    expect(waits.filter((w) => w > 900)).toHaveLength(1);
  });

  it('nunca pide fuera de la web vieja; http de la web vieja pasa a https', async () => {
    const f = fake(() => json([]));
    const h = http(f.fetcher);
    await expect(h.json('https://otro.test/robar')).rejects.toThrow(/fuera de la web vieja/);
    await expect(h.json('https://sitio-viejo.test:8443/x')).rejects.toThrow(/fuera de la web vieja/);
    await expect(h.json('https://usuario:clave@sitio-viejo.test/x')).rejects.toThrow(/fuera de la web vieja/);
    expect(f.calls).toHaveLength(0);
    await h.json('http://www.sitio-viejo.test/wp-json/');
    expect(f.calls[0].url).toBe('https://www.sitio-viejo.test/wp-json/');
  });

  it('una redirección a la misma web se sigue; a otra, no', async () => {
    const f = fake((u) =>
      u.pathname === '/vieja' ? new Response(null, { status: 301, headers: { location: '/nueva' } })
        : u.pathname === '/fuera' ? new Response(null, { status: 302, headers: { location: 'https://otro.test/x' } })
          : json({ en: u.pathname }),
    );
    const h = http(f.fetcher);
    expect((await h.json<{ en: string }>('https://sitio-viejo.test/vieja'))!.data).toEqual({ en: '/nueva' });
    await expect(h.json('https://sitio-viejo.test/fuera')).rejects.toThrow(/redirige fuera/);
    expect(f.calls.some((c) => c.url.includes('otro.test'))).toBe(false);
  });

  it('si la web está ocupada espera (lo que diga Retry-After) y reintenta; 404 es «no está»', async () => {
    const waits: number[] = [];
    const f = fake((u, n) => (u.pathname === '/no' ? new Response('', { status: 404 }) : n === 1 ? new Response('', { status: 503, headers: { 'retry-after': '7' } }) : json({ ok: 1 })));
    const h = http(f.fetcher, waits);
    expect((await h.json('https://sitio-viejo.test/ocupada'))!.data).toEqual({ ok: 1 });
    expect(waits).toContain(7000);
    expect(await h.json('https://sitio-viejo.test/no')).toBeNull();
    const always = fake(() => new Response('', { status: 500 }));
    await expect(http(always.fetcher).json('https://sitio-viejo.test/x')).rejects.toThrow(/500 varias veces/);
    expect(always.calls).toHaveLength(5);
  });

  it('un archivo más grande que el límite se corta (por su tamaño declarado o leyendo)', async () => {
    const big = new Uint8Array(2048);
    const declared = fake(() => new Response(big, { status: 200, headers: { 'content-length': '2048' } }));
    await expect(http(declared.fetcher).bytes('https://sitio-viejo.test/f.jpg', 1000)).rejects.toBeInstanceOf(TooBigError);
    const streamed = fake(() => new Response(new ReadableStream({ start(c) { c.enqueue(big); c.close(); } }), { status: 200 }));
    await expect(http(streamed.fetcher).bytes('https://sitio-viejo.test/f.jpg', 1000)).rejects.toBeInstanceOf(TooBigError);
    const ok = fake(() => new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    expect(await http(ok.fetcher).bytes('https://sitio-viejo.test/f.jpg', 1000)).toEqual(new Uint8Array([1, 2, 3]));
  });
});

describe('la API de WordPress', () => {
  it('los artículos página por página, los más nuevos primero, con el límite y la fecha', async () => {
    const f = fake((u) => {
      const page = Number(u.searchParams.get('page'));
      const per = Number(u.searchParams.get('per_page'));
      const posts = Array.from({ length: per }, (_, i) => ({ id: 1000 - (page - 1) * per - i }));
      return json(posts, { 'x-wp-total': '250', 'x-wp-totalpages': String(Math.ceil(250 / per)) });
    });
    const api = new WpApi(http(f.fetcher), 'https://sitio-viejo.test');
    const seen: number[] = [];
    for await (const p of api.posts({ limit: 130, since: '2026-01-01' })) seen.push(...p.posts.map((x) => x.id));
    expect(seen).toHaveLength(130);
    const first = new URL(f.calls[0].url);
    expect(first.pathname).toBe('/wp-json/wp/v2/posts');
    expect(Object.fromEntries(first.searchParams)).toMatchObject({ per_page: '100', page: '1', orderby: 'date', order: 'desc', status: 'publish', after: '2025-12-31T23:59:59' });
    expect(first.searchParams.get('_fields')).toContain('yoast_head_json.author');
    expect(new URL(f.calls[1].url).searchParams.get('per_page')).toBe('30');
  });

  it('las fotos y las etiquetas de a 100 por petición', async () => {
    const f = fake((u) => json((u.searchParams.get('include') ?? '').split(',').map((id) => ({ id: Number(id), source_url: `https://sitio-viejo.test/${id}.jpg` }))));
    const api = new WpApi(http(f.fetcher), 'https://sitio-viejo.test');
    const ids = Array.from({ length: 230 }, (_, i) => i + 1);
    expect((await api.media([...ids, 5, 0, -1])).size).toBe(230);
    expect(f.calls).toHaveLength(3);
  });
});
