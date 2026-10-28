// Service worker: keeps the app shell and static files so the app opens without signal.
// Pages and data always try the network first (they are private and per-user) and are
// never stored, so nothing sensitive stays in the cache.
// It also shows phone notifications (Web Push). A notification only opens the app: nothing
// is ever approved or changed from it.
// v2 (R3): offline.html says where the guide is; a new name makes installed phones fetch it again.
const CACHE = 'fb-shell-v2';
const SHELL = ['/offline.html', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Immutable build assets: cache first.
  if (url.pathname.startsWith('/_next/static/')) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
            return res;
          }),
      ),
    );
    return;
  }

  // Page navigations: network, and a friendly offline page if there is no signal.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/offline.html')));
  }
});

// Push: ALWAYS show a notification (iOS revokes the permission after silent pushes).
self.addEventListener('push', (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { body: e.data ? e.data.text() : '' };
  }
  const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
  const path = str(d.url, 300);
  const url = path.startsWith('/') && !path.startsWith('//') ? path : '/avisos';
  const tag = str(d.tag, 64) || str(d.kind, 64) || 'aviso';
  // A new notice with the same tag replaces the old one: renotify makes it ring again. A grouped
  // update («Tienes 3 avisos nuevos») comes with silent: it replaces quietly.
  const silent = d.silent === true;
  e.waitUntil(
    self.registration.showNotification(str(d.title, 120) || 'Tienes un aviso nuevo', {
      body: str(d.body, 240),
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag,
      renotify: !silent,
      silent,
      lang: 'es',
      data: { url },
    }),
  );
});

// Tap on a notification: focus an open window of the app (and take it to the page), or open one.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const raw = (e.notification.data && e.notification.data.url) || '/avisos';
  let target = new URL(raw, self.location.origin);
  if (target.origin !== self.location.origin) target = new URL('/avisos', self.location.origin);
  e.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const win = wins.find((c) => new URL(c.url).origin === self.location.origin);
      if (win) {
        try {
          const focused = await win.focus();
          if (focused && 'navigate' in focused) await focused.navigate(target.href).catch(() => {});
          return;
        } catch {
          // fall through: open a new window
        }
      }
      await self.clients.openWindow(target.href);
    })(),
  );
});
