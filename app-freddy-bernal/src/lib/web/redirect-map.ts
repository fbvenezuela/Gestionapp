import 'server-only';
import { withAnon } from '../db';
import { lookupKeys, redirectStatus, safeTarget, type RedirectStatus } from './redirects';

// The redirects of old addresses (web_redirects), read as anon (D-96) one old address at a time — its few candidate
// forms by the table's unique index — and each answer kept in memory a minute per server: the proxy asks for the ones
// that would be a 404 (/api/web/redireccion) and a section's page for its missing items. The table is never read whole:
// with the old site imported it holds some 25.000 rows (scripts/web-import). revalidate.ts forgets the answers when the
// team changes the list.

export type RedirectHit = { to: string; status: RedirectStatus };

const TTL_MS = 60_000;
const MAX_REMEMBERED = 5000;
type Memo = { at: number; hit: Promise<RedirectHit | null> };
const g = globalThis as unknown as { __fbWebRedirects?: Map<string, Memo> };

async function load(keys: string[]): Promise<RedirectHit | null> {
  const rows = await withAnon((sql) =>
    sql.query<{ from_path: string; to_path: string; status_code: number }>(
      `select from_path, to_path, status_code from public.web_redirects where from_path = any ($1::text[])`,
      [keys],
    ),
  );
  // The first candidate that has a redirect wins (as written before its other forms), never one back to itself.
  for (const key of keys) {
    const row = rows.find((r) => r.from_path === key);
    const to = row ? safeTarget(row.to_path) : null;
    if (row && to && !keys.includes(to)) return { to, status: redirectStatus(row.status_code) };
  }
  return null;
}

/** Where an old address goes now, or null (also when it would send to itself). Throws if the table cannot be read. */
export async function findRedirect(path: string): Promise<RedirectHit | null> {
  const keys = lookupKeys(path);
  if (!keys.length) return null;
  const memo = (g.__fbWebRedirects ??= new Map());
  const known = memo.get(keys[0]);
  if (known && Date.now() - known.at < TTL_MS) return known.hit;
  const hit = load(keys);
  if (memo.size >= MAX_REMEMBERED) memo.delete(memo.keys().next().value!);
  const entry = { at: Date.now(), hit };
  memo.set(keys[0], entry);
  hit.catch(() => {
    if (memo.get(keys[0]) === entry) memo.delete(keys[0]);
  });
  return hit;
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
