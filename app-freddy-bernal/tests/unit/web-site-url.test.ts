// Where the public website says it lives (canonical links, sitemap, Open Graph, JSON-LD): SITE_URL when it is a real
// http(s) address, else the app's address, never a broken page because SITE_URL was written without its https://.
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/web/cache', () => ({ rawSettings: async () => ({}) }));

async function baseWith(siteUrl: string, appUrl: string): Promise<string> {
  vi.resetModules();
  vi.stubEnv('SITE_URL', siteUrl);
  vi.stubEnv('APP_URL', appUrl);
  const { siteBaseUrl } = await import('@/lib/web/site');
  return siteBaseUrl();
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('siteBaseUrl', () => {
  it('SITE_URL sin la barra final', async () => {
    expect(await baseWith('https://freddybernal.example/', 'https://app.example')).toBe('https://freddybernal.example');
  });

  it('un SITE_URL mal escrito o que no es http(s) deja la dirección de la app', async () => {
    expect(await baseWith('freddybernal.example', 'https://app.example')).toBe('https://app.example');
    expect(await baseWith('javascript:alert(1)', 'https://app.example/')).toBe('https://app.example');
  });

  it('sin ninguna de las dos, la del servidor local', async () => {
    expect(await baseWith('', '')).toBe('http://localhost:3000');
  });
});
