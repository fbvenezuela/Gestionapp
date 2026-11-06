// The addresses of the public website (D-91) and the old WordPress addresses (docs/diagnostico.md §5): every first piece
// a route answers is known (so only would-be 404s are looked up in web_redirects), the public sections are the ones that
// get the CSP and no session work, redirects never leave the site, and publishing refreshes the right pages.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  APP_SEGMENTS, CRAWL_DISALLOWED, NEVER_INDEXED, PUBLIC_SEGMENTS, firstSegment, isKnownSegment, isPublicPath, itemPath, pagePath, pathsForItem,
} from '@/lib/web/routes';
import { legacyPlan, lookupKeys, normalizeOldPath, redirectStatus, safeTarget } from '@/lib/web/redirects';

const APP = path.join(process.cwd(), 'src', 'app');

/** The first pieces of every address src/app answers (route groups are transparent) and the files of public/. */
function answeredSegments(): string[] {
  const out = new Set<string>();
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (/^\(.*\)$/.test(e.name)) walk(path.join(dir, e.name));
        else out.add(e.name);
      } else if (dir === APP && /\.(png|ico|txt|xml)$/.test(e.name)) out.add(e.name);
    }
  };
  walk(APP);
  for (const f of fs.readdirSync(path.join(process.cwd(), 'public'))) out.add(f);
  return [...out];
}

describe('las direcciones que la app contesta', () => {
  it('APP_SEGMENTS conoce cada carpeta de src/app y cada archivo de public/ (si no, una dirección buena se buscaría como vieja)', () => {
    const missing = answeredSegments().filter((s) => !isKnownSegment(s));
    expect(missing).toEqual([]);
  });

  it('las secciones de la web existen como rutas del grupo (web), salvo /atencion que es del flujo ciudadano', () => {
    const web = fs.readdirSync(path.join(APP, '(web)'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
    for (const s of PUBLIC_SEGMENTS) if (s !== 'atencion') expect(web, s).toContain(s);
  });

  it('isPublicPath: la portada, las secciones y los archivos para buscadores; nunca el panel ni la API', () => {
    for (const p of ['/', '/gestion', '/gestion/una-obra', '/actualidad/semanario', '/atencion/nueva', '/canales', '/robots.txt', '/sitemap.xml', '/opengraph-image']) {
      expect(isPublicPath(p), p).toBe(true);
    }
    for (const p of ['/panel', '/hoy', '/admin/web', '/entrar', '/api/web/redireccion', '/privacidad', '/gestionar']) expect(isPublicPath(p), p).toBe(false);
  });

  it('firstSegment e isKnownSegment', () => {
    expect(firstSegment('/gestion/puente')).toBe('gestion');
    expect(firstSegment('/')).toBe('');
    expect(isKnownSegment('2026')).toBe(false);
    expect(isKnownSegment('wp-content')).toBe(false);
    expect(isKnownSegment('__nextjs_original-stack-frame')).toBe(true);
    expect(APP_SEGMENTS.has('panel')).toBe(true);
  });
});

describe('las direcciones viejas: solo se busca lo que sería un 404', () => {
  const plan = (url: string) => {
    const u = new URL(url, 'https://sitio.test');
    return legacyPlan(u.pathname, u.searchParams);
  };

  it('una dirección de la app nunca se busca (ninguna petición normal paga la consulta)', () => {
    for (const u of ['/', '/gestion', '/actualidad/una-nota', '/hoy', '/api/cron/tick', '/_next/static/x.js', '/?utm_source=x']) expect(plan(u), u).toEqual({ kind: 'none' });
  });

  it('las de WordPress que serían 404 se buscan tal cual (sin la barra final)', () => {
    expect(plan('/2026/11/una-nota-vieja/')).toEqual({ kind: 'lookup', path: '/2026/11/una-nota-vieja' });
    expect(plan('/categoria/tachira/')).toEqual({ kind: 'lookup', path: '/categoria/tachira' });
    expect(plan('/wp-content/uploads/2024/05/foto.jpg')).toEqual({ kind: 'lookup', path: '/wp-content/uploads/2024/05/foto.jpg' });
    expect(plan('/?p=123')).toEqual({ kind: 'lookup', path: '/?p=123' });
    expect(plan('/?page_id=9')).toEqual({ kind: 'lookup', path: '/?page_id=9' });
  });

  it('la búsqueda de WordPress pasa a la de actualidad sin tabla', () => {
    expect(plan('/?s=agua%20potable')).toEqual({ kind: 'search', to: '/actualidad?q=agua%20potable' });
    expect(plan('/?s=')).toEqual({ kind: 'search', to: '/actualidad' });
  });

  it('una consulta rara en la portada no se busca', () => {
    expect(plan('/?p=<script>')).toEqual({ kind: 'none' });
  });

  it('lookupKeys guarda las dos formas; normalizeOldPath rechaza lo que no es una dirección de este sitio', () => {
    expect(lookupKeys('/2014/07/biografia/')).toEqual(['/2014/07/biografia', '/2014/07/biografia/']);
    expect(lookupKeys('/?p=12')).toEqual(['/?p=12']);
    for (const bad of ['//otro.test/x', 'https://otro.test', '/a b', '/a\\b', '/']) expect(normalizeOldPath(bad), bad).toBeNull();
  });

  it('un destino de la tabla solo puede ser de este sitio (nunca un redirect abierto)', () => {
    expect(safeTarget('/gobernador')).toBe('/gobernador');
    expect(safeTarget('/actualidad?q=agua')).toBe('/actualidad?q=agua');
    for (const bad of ['//evil.test', 'https://evil.test', '/\\evil.test', 'javascript:alert(1)', '', null, 42, `/${'a'.repeat(600)}`]) expect(safeTarget(bad), String(bad)).toBeNull();
  });

  it('el código es 301 salvo que la tabla diga otro permitido', () => {
    expect(redirectStatus(301)).toBe(301);
    expect(redirectStatus(308)).toBe(308);
    expect(redirectStatus(200)).toBe(301);
    expect(redirectStatus('301')).toBe(301);
  });
});

describe('dónde vive cada contenido y qué se refresca al publicarlo', () => {
  it('itemPath y pagePath', () => {
    expect(itemPath('news', 'una-nota')).toBe('/actualidad/una-nota');
    expect(itemPath('project', 'un-puente')).toBe('/gestion/un-puente');
    expect(itemPath('page', 'inicio')).toBe('/');
    expect(itemPath('page', 'gobernador')).toBe('/gobernador');
    expect(itemPath('episode', 'programa-1')).toBeNull();
    expect(itemPath('news', '../admin')).toBeNull();
    expect(pagePath('una-pagina-cualquiera')).toBeNull();
  });

  it('pathsForItem incluye las listas que lo muestran y su propia página', () => {
    expect(pathsForItem('news', 'una-nota')).toEqual(['/', '/actualidad', '/actualidad/una-nota']);
    expect(pathsForItem('page', 'inicio')).toEqual(['/']);
    expect(pathsForItem('document')).toEqual(['/transparencia', '/actualidad/semanario', '/gobernador']);
  });

  it('robots.txt deja fuera el panel, el admin, la consulta privada y la API; nunca las páginas públicas de la plataforma', () => {
    for (const p of NEVER_INDEXED) expect(CRAWL_DISALLOWED).toContain(p);
    for (const p of ['/hoy', '/entrar', '/agenda']) expect(CRAWL_DISALLOWED).toContain(p);
    for (const p of ['/acerca', '/privacidad', '/condiciones', '/gestion', '/']) expect(CRAWL_DISALLOWED).not.toContain(p);
  });
});
