// TLS for postgres.js connections. Shared by the app (./index.ts) and the scripts in scripts/,
// so it has no imports. A real host (Supabase) always gets TLS, even when the connection string
// forgot ?sslmode=require. A database on this same machine (local work, tests, the CI service
// container) goes without, as before. When the URL says sslmode (or ssl) itself, the URL decides.

const LOCAL = new Set(['', 'localhost', '127.0.0.1', '::1']);

// Spread it into the postgres() options: `postgres(url, { ...pgTls(url), max: 1 })`. It returns no
// `ssl` key at all when the URL decides, because postgres.js lets any `ssl` key, even undefined,
// win over the URL.
export function pgTls(url: string): { ssl?: 'require' } {
  const q = url.indexOf('?');
  const params = new URLSearchParams(q >= 0 ? url.slice(q + 1) : '');
  if (params.has('sslmode') || params.has('ssl') || params.has('sslrootcert')) return {};
  return dbHosts(url).every(isLocal) ? {} : { ssl: 'require' };
}

// Host names of a connection string, read the way postgres.js reads them (it allows a
// comma-separated list). An unreadable host counts as remote: TLS by default.
function dbHosts(url: string): string[] {
  let part = url.slice(url.indexOf('://') + 3).split(/[?/]/)[0];
  part = part.slice(part.lastIndexOf('@') + 1);
  try {
    part = decodeURIComponent(part);
  } catch {
    return ['?'];
  }
  return part.split(',').map((h) => (h.startsWith('[') ? h.slice(1, h.indexOf(']')) : h.split(':')[0]).toLowerCase());
}

// Loopback names and addresses, `*.localhost`, and a Unix socket path (it has a slash).
function isLocal(host: string): boolean {
  return LOCAL.has(host) || host.endsWith('.localhost') || /^127\.\d+\.\d+\.\d+$/.test(host) || host.includes('/');
}
