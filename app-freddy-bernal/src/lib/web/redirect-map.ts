import 'server-only';
import { withAnon } from '../db';
import { lookupKeys, redirectStatus, safeTarget, type RedirectStatus } from './redirects';

// The redirects of old addresses (web_redirects), read as anon (D-96) once a minute per server and kept in memory: the
// proxy asks for the ones that would be a 404 (/api/web/redireccion) and a section's page for its missing items, and
// none of them goes to the database each time. revalidate.ts forgets them when the team changes the list.

export type RedirectHit = { to: string; status: RedirectStatus };

const TTL_MS = 60_000;
type Memo = { at: number; map: Promise<Map<string, RedirectHit>> };
const g = globalThis as unknown as { __fbWebRedirects?: Memo };

async function load(): Promise<Map<string, RedirectHit>> {
  const rows = await withAnon((sql) =>
    sql.query<{ from_path: string; to_path: string; status_code: number }>(`select from_path, to_path, status_code from public.web_redirects`),
  );
  const map = new Map<string, RedirectHit>();
  for (const r of rows) {
    const to = safeTarget(r.to_path);
    if (to) map.set(r.from_path, { to, status: redirectStatus(r.status_code) });
  }
  return map;
}

function current(): Promise<Map<string, RedirectHit>> {
  const memo = g.__fbWebRedirects;
  if (memo && Date.now() - memo.at < TTL_MS) return memo.map;
  const map = load();
  const next = { at: Date.now(), map };
  g.__fbWebRedirects = next;
  map.catch(() => {
    if (g.__fbWebRedirects === next) g.__fbWebRedirects = undefined;
  });
  return map;
}

/** Where an old address goes now, or null (also when it would send to itself). Throws if the table cannot be read. */
export async function findRedirect(path: string): Promise<RedirectHit | null> {
  const keys = lookupKeys(path);
  if (!keys.length) return null;
  const map = await current();
  for (const key of keys) {
    const hit = map.get(key);
    if (hit && !keys.includes(hit.to)) return hit;
  }
  return null;
}

/** The same, never throwing (a page about to answer 404 asks it: if the table cannot be read, it is a 404). */
export async function findRedirectOrNull(path: string): Promise<RedirectHit | null> {
  try {
    return await findRedirect(path);
  } catch (e) {
    console.error('[web] no se pudieron leer las redirecciones:', (e as Error).message);
    return null;
  }
}

export function forgetRedirects(): void {
  g.__fbWebRedirects = undefined;
}
