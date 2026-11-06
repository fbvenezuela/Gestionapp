// Search engines, social networks and the security headers of the public website (docs/diagnostico.md problems 4, 5
// and 16; D-95): unique titles that name the person once, canonical links, noindex until SITE_INDEXABLE, robots.txt,
// structured data whose sameAs carries only VERIFIED accounts, JSON-LD that no content can break out of, and a CSP that
// allows youtube-nocookie and the map tiles and nothing else, on the website's pages only.
import { describe, expect, it } from 'vitest';
import { normalizeSite, type Site } from '@/lib/web/site-settings';
import {
  DEFAULT_OG_IMAGE, clip, describe as description, jsonLdHtml, newsArticleJsonLd, organizationJsonLd, pageMetadata, pageTitle, personJsonLd,
  robotsFile, robotsMeta, siteTitle, websiteJsonLd,
} from '@/lib/web/seo';
import { BASE_SECURITY_HEADERS, OSM_TILE_ORIGINS, PUBLIC_PERMISSIONS_POLICY, TURNSTILE_ORIGIN, YOUTUBE_EMBED_ORIGIN, publicCsp, publicSources, securityHeaderRules } from '@/lib/web/headers';
import { NEVER_INDEXED, PUBLIC_SEGMENTS } from '@/lib/web/routes';

const BASE = 'https://web.prueba.test';
const site = (raw: Record<string, unknown> = {}, opts: Partial<{ demo: boolean; indexable: boolean }> = {}): Site =>
  normalizeSite(raw, { demo: opts.demo ?? false, indexable: opts.indexable ?? false, baseUrl: BASE });

const ACCOUNTS = [
  { network: 'youtube', handle: '@Activo', url: 'https://www.youtube.com/@Activo', verified: true, active: true },
  { network: 'instagram', handle: '@porconfirmar', url: 'https://www.instagram.com/porconfirmar/', verified: false, active: true },
  { network: 'youtube', handle: '@Viejo', url: 'https://www.youtube.com/@Viejo', verified: true, active: false },
];

describe('títulos y descripciones', () => {
  it('el nombre sale una sola vez (la web vieja lo repetía dos veces)', () => {
    const s = site();
    expect(pageTitle('Actualidad', s)).toBe(`Actualidad · ${s.name}`);
    expect(pageTitle(`Quién es ${s.name}, gobernador`, s)).toBe(`Quién es ${s.name}, gobernador`);
    expect(pageTitle(`QUIÉN ES ${s.name.toUpperCase()}`, s)).toBe(`QUIÉN ES ${s.name.toUpperCase()}`);
    expect(pageTitle('   ', s)).toBe(s.name);
    const t = pageTitle(`Gestión y obras`, s);
    expect(t.split(s.name)).toHaveLength(2);
  });

  it('siteTitle: «Nombre, cargo» con el cargo en minúscula inicial', () => {
    expect(siteTitle({ name: 'Ana Pérez', title: 'Gobernadora de Prueba' })).toBe('Ana Pérez, gobernadora de Prueba');
  });

  it('clip y describe cortan en una palabra y en una línea', () => {
    expect(clip('uno dos tres cuatro', 100)).toBe('uno dos tres cuatro');
    const c = clip('palabra '.repeat(40), 60);
    expect(c.length).toBeLessThanOrEqual(60);
    expect(c.endsWith('…')).toBe(true);
    expect(description('', '  ', 'tercera\n\nlínea')).toBe('tercera línea');
    expect(description(undefined, null)).toBe('');
  });
});

describe('metadatos de cada página y noindex', () => {
  it('canónica, Open Graph y Twitter con la imagen por defecto cuando no hay foto', () => {
    const s = site();
    const m = pageMetadata({ title: 'Canales oficiales', description: 'Las cuentas.', path: '/canales' }, s);
    expect(m.title).toEqual({ absolute: `Canales oficiales · ${s.name}` });
    expect(m.alternates).toEqual({ canonical: '/canales' });
    expect(m.openGraph).toMatchObject({ url: '/canales', locale: 'es_VE', type: 'website', images: [{ url: DEFAULT_OG_IMAGE.url }] });
    expect(m.twitter).toMatchObject({ card: 'summary_large_image', images: [DEFAULT_OG_IMAGE.url] });
  });

  it('una nota es «article» con su fecha y su sección', () => {
    const m = pageMetadata({ title: 'Una nota', path: '/actualidad/una-nota', type: 'article', publishedTime: '2026-11-04', section: 'Noticia' }, site());
    expect(m.openGraph).toMatchObject({ type: 'article', publishedTime: '2026-11-04', section: 'Noticia' });
  });

  it('nada se indexa hasta SITE_INDEXABLE=true; una página puede pedir noindex aunque el sitio sí se indexe', () => {
    expect(robotsMeta(false)).toEqual({ index: false, follow: false });
    expect(pageMetadata({ title: 'A', path: '/a' }, site({}, { indexable: false })).robots).toEqual({ index: false, follow: false });
    expect(pageMetadata({ title: 'A', path: '/a' }, site({}, { indexable: true })).robots).toEqual({ index: true, follow: true });
    expect(pageMetadata({ title: 'A', path: '/a', noindex: true }, site({}, { indexable: true })).robots).toEqual({ index: false, follow: false });
  });

  it('robots.txt: en la versión de prueba no se rastrea nada; en producción, todo menos el panel, la consulta privada y la API', () => {
    const closed = robotsFile({ indexable: false, baseUrl: BASE });
    expect(closed.sitemap).toBeUndefined();
    const rule = Array.isArray(closed.rules) ? closed.rules[0] : closed.rules;
    expect(rule.disallow).toEqual(expect.arrayContaining(['/', ...NEVER_INDEXED]));
    const open = robotsFile({ indexable: true, baseUrl: BASE });
    const r = Array.isArray(open.rules) ? open.rules[0] : open.rules;
    expect(r.allow).toBe('/');
    expect(r.disallow).toEqual(expect.arrayContaining([...NEVER_INDEXED]));
    expect(r.disallow).not.toContain('/');
    expect(open.sitemap).toBe(`${BASE}/sitemap.xml`);
  });
});

describe('datos estructurados', () => {
  it('Person: nombre, cargo, organización y sameAs SOLO con las cuentas verificadas y activas', () => {
    const p = personJsonLd(site({ 'site.social_accounts': ACCOUNTS }, { demo: true }));
    expect(p).toMatchObject({ '@type': 'Person', '@id': `${BASE}/#persona`, url: `${BASE}/gobernador` });
    expect(p.sameAs).toEqual(['https://www.youtube.com/@Activo']);
    expect((p.worksFor as { '@id': string })['@id']).toBe(`${BASE}/#organizacion`);
    expect(typeof p.jobTitle).toBe('string');
  });

  it('sin cuentas verificadas, sameAs no se manda (nunca vacío ni con las «por confirmar»)', () => {
    const p = personJsonLd(site({ 'site.social_accounts': ACCOUNTS.filter((a) => !a.verified) }, { demo: true }));
    expect('sameAs' in p).toBe(false);
  });

  it('GovernmentOrganization: su portal solo si está verificado', () => {
    const portal = { label: 'Portal', url: 'https://portal.prueba.test', verified: false };
    expect('url' in organizationJsonLd(site({ 'site.institutional_portal': portal }))).toBe(false);
    expect(organizationJsonLd(site({ 'site.institutional_portal': { ...portal, verified: true } })).url).toBe('https://portal.prueba.test');
  });

  it('WebSite con la búsqueda de actualidad; NewsArticle con titular corto, fechas, autor y editor', () => {
    const s = site();
    expect(websiteJsonLd(s)).toMatchObject({ '@type': 'WebSite', url: `${BASE}/` });
    const n = newsArticleJsonLd({ url: `${BASE}/actualidad/x`, title: 'T'.repeat(200), datePublished: '2026-11-04', author: 'Prensa' }, s);
    expect((n.headline as string).length).toBeLessThanOrEqual(110);
    expect(n).toMatchObject({ '@type': 'NewsArticle', datePublished: '2026-11-04', dateModified: '2026-11-04', author: { '@type': 'Organization', name: 'Prensa' } });
    expect((n.publisher as { '@id': string })['@id']).toBe(`${BASE}/#persona`);
    expect('image' in n).toBe(false);
  });

  it('jsonLdHtml: ningún texto del contenido cierra el script ni abre otra etiqueta, y el JSON sigue siendo el mismo', () => {
    const data = { headline: '</script><script>alert(1)</script> & <b>', sep: 'a\u2028b\u2029c' };
    const html = jsonLdHtml(data);
    expect(html).not.toMatch(/[<>&\u2028\u2029]/);
    expect(html).toContain('\\u003c/script\\u003e');
    expect(JSON.parse(html)).toEqual(data);
  });
});

describe('cabeceras de seguridad', () => {
  const csp = (o: Partial<Parameters<typeof publicCsp>[0]> = {}) => publicCsp({ dev: false, upgradeInsecure: true, ...o });

  it('la CSP de la web: YouTube sin cookies y los mosaicos del mapa, nada más; sin eval en producción', () => {
    const c = csp();
    expect(c).toContain(`frame-src ${YOUTUBE_EMBED_ORIGIN}`);
    for (const o of OSM_TILE_ORIGINS) expect(c).toContain(o);
    expect(c).toContain("default-src 'self'");
    expect(c).toContain("object-src 'none'");
    expect(c).toContain("frame-ancestors 'none'");
    expect(c).toContain("form-action 'self'");
    expect(c).not.toContain('unsafe-eval');
    expect(c).not.toContain(TURNSTILE_ORIGIN);
    expect(c).not.toMatch(/https:\/\/www\.youtube\.com|google-analytics|\*\s|\s\*;/);
  });

  it('upgrade-insecure-requests solo con https; Turnstile solo cuando está configurado; eval solo en desarrollo', () => {
    expect(csp({ upgradeInsecure: false })).not.toContain('upgrade-insecure-requests');
    expect(csp()).toContain('upgrade-insecure-requests');
    expect(csp({ turnstile: true })).toContain(`frame-src ${YOUTUBE_EMBED_ORIGIN} ${TURNSTILE_ORIGIN}`);
    expect(csp({ dev: true })).toContain("'unsafe-eval'");
    expect(csp({ imageOrigins: ['https://proyecto.supabase.co'] })).toMatch(/img-src [^;]*https:\/\/proyecto\.supabase\.co/);
  });

  it('las reglas: las de siempre en todo; la CSP y la Permissions-Policy de la web solo en sus direcciones; noindex hasta abrir', () => {
    const rules = securityHeaderRules({ csp: { dev: false, upgradeInsecure: true }, indexable: false });
    expect(rules[0]).toEqual({ source: '/:path*', headers: [...BASE_SECURITY_HEADERS] });
    const withCsp = rules.filter((r) => r.headers.some((h) => h.key === 'Content-Security-Policy'));
    expect(withCsp.map((r) => r.source)).toEqual(publicSources());
    for (const r of withCsp) expect(r.headers).toContainEqual({ key: 'Permissions-Policy', value: PUBLIC_PERMISSIONS_POLICY });
    expect(publicSources()[0]).toBe('/');
    for (const s of PUBLIC_SEGMENTS) expect(publicSources()[2]).toContain(s);
    expect(publicSources().join(' ')).not.toMatch(/panel|admin|hoy|entrar/);
    expect(rules).toContainEqual({ source: '/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] });
    const open = securityHeaderRules({ csp: { dev: false, upgradeInsecure: true }, indexable: true });
    const noindex = open.filter((r) => r.headers.some((h) => h.key === 'X-Robots-Tag')).map((r) => r.source);
    expect(noindex).toEqual(NEVER_INDEXED.map((p) => `${p}/:path*`));
    expect(PUBLIC_PERMISSIONS_POLICY).toContain('geolocation=(self)');
    expect(BASE_SECURITY_HEADERS).toContainEqual({ key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' });
    expect(BASE_SECURITY_HEADERS).toContainEqual({ key: 'X-Content-Type-Options', value: 'nosniff' });
    expect(BASE_SECURITY_HEADERS.find((h) => h.key === 'Strict-Transport-Security')?.value).toMatch(/max-age=\d{8}/);
  });
});
