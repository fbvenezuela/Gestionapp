// The server POSTs to whatever endpoint a browser registered, so only the real push services
// are accepted (no internal addresses, no other hosts).
const HOSTS = new Set(['fcm.googleapis.com', 'android.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com']);
const SUFFIXES = ['.push.apple.com', '.notify.windows.com', '.push.services.mozilla.com'];

export function isAllowedEndpoint(raw: string): boolean {
  if (typeof raw !== 'string' || raw.length > 1000) return false;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return false;
  const host = u.hostname.toLowerCase();
  return HOSTS.has(host) || SUFFIXES.some((s) => host.endsWith(s));
}
