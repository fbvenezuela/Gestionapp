// Old addresses (D-91, docs/diagnostico.md §5): the WordPress site's links keep working with a 301 to the new address.
// The table web_redirects (filled by the importer or by hand) says where each one goes; this file decides WHEN to look,
// so no ordinary request pays for it. Pure: the proxy (src/proxy.ts) and the pages use it.
//
//   * An address whose first piece no route answers (routes.ts) would be a 404: «/2026/11/una-nota», «/categoria/salud»,
//     «/tag/agua», «/feed», «/wp-content/uploads/…». Those are looked up.
//   * The home with WordPress's queries: «/?s=agua» is a search (it goes to /actualidad?q=agua, no table needed) and
//     «/?p=123», «/?page_id=…», «/?cat=…», «/?tag=…» are looked up as written («/?p=123»).
//   * A section's missing item («/actualidad/titulo-viejo») is looked up by its page before answering 404.

import { firstSegment, isKnownSegment } from './routes';

const WP_QUERY_KEYS = ['p', 'page_id', 'cat', 'tag', 'author', 'm'] as const;

/** What the proxy does with an address: nothing, a search on /actualidad, or look it up in web_redirects. */
export type LegacyPlan = { kind: 'none' } | { kind: 'search'; to: string } | { kind: 'lookup'; path: string };

export function legacyPlan(pathname: string, search: URLSearchParams): LegacyPlan {
  if (pathname === '/') {
    const q = search.get('s');
    if (q !== null) {
      const words = q.trim().slice(0, 120);
      return { kind: 'search', to: words ? `/actualidad?q=${encodeURIComponent(words)}` : '/actualidad' };
    }
    for (const key of WP_QUERY_KEYS) {
      const v = search.get(key);
      if (v !== null && /^[\w-]{1,80}$/.test(v)) return { kind: 'lookup', path: `/?${key}=${v}` };
    }
    return { kind: 'none' };
  }
  if (isKnownSegment(firstSegment(pathname))) return { kind: 'none' };
  const path = normalizeOldPath(pathname);
  return path ? { kind: 'lookup', path } : { kind: 'none' };
}

/** «/2026/11/una-nota/» and «/2026/11/una-nota» are the same old address: without the last slash, at most 500
 * characters, never «//host». Null when it cannot be an address of this site. */
export function normalizeOldPath(pathname: string): string | null {
  if (!pathname.startsWith('/') || pathname.startsWith('//') || /[\s\\]/.test(pathname)) return null;
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return p.length >= 2 && p.length <= 500 ? p : null;
}

// WordPress serves every photo in several sizes («foto-300x200.jpg», «foto-scaled.jpg»): the importer keeps one redirect
// per original (scripts/web-import), and a size is looked up as its original.
const WP_SIZE = /-(?:\d{1,5}x\d{1,5}|scaled|rotated|e\d{10,13})(?=\.[A-Za-z0-9]{2,5}$)/;

/** The candidates a path is stored under: as written and with its final slash (the importer may keep it); with its
 * escapes in lower case (WordPress writes «%c3%b1», a browser may send «%C3%B1»); and, for an old upload, its original. */
export function lookupKeys(path: string): string[] {
  const p = normalizeOldPath(path);
  if (!p) return [];
  const forms = [p, p.replace(/%[0-9A-F]{2}/g, (m) => m.toLowerCase())];
  if (/^\/wp-content\/uploads\//.test(p)) {
    let base = p;
    for (let k = 0; k < 2 && WP_SIZE.test(base); k++) base = base.replace(WP_SIZE, '');
    forms.push(base);
  }
  const out = new Set<string>();
  for (const f of forms) {
    out.add(f);
    if (!f.includes('?')) out.add(`${f}/`);
  }
  return [...out];
}

/** An old address that answers 410 («ya no existe») instead of 404 when the redirects do not know it: the old site's
 * files (/wp-content/…). Search engines then drop them sooner. Everything else is a plain 404. */
export function goneWhenMissing(path: string): boolean {
  return /^\/wp-content\//.test(path);
}

/** A target from the table, only if it is an address of this site (no open redirect, ever). */
export function safeTarget(to: unknown): string | null {
  return typeof to === 'string' && /^\/(?!\/)[^\s\\]*$/.test(to) && to.length <= 500 ? to : null;
}

export const REDIRECT_STATUSES = [301, 302, 307, 308] as const;
export type RedirectStatus = (typeof REDIRECT_STATUSES)[number];

export function redirectStatus(n: unknown): RedirectStatus {
  return (REDIRECT_STATUSES as readonly unknown[]).includes(n) ? (n as RedirectStatus) : 301;
}
