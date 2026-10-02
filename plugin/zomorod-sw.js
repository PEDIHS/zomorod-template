/* Zomorod PWA: notification-only worker. NEVER cache subscription pages or tokens. */
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()); });
self.addEventListener('push', (event) => {
  let msg = {};
  try { msg = event.data ? event.data.json() : {}; } catch (_) { msg = {}; }
  const title = String(msg.title || 'زمرد').slice(0, 70);
  const body = String(msg.body || 'اعلان جدید').slice(0, 180);
  event.waitUntil(self.registration.showNotification(title, {
    body, icon: '/api/zomorod/pwa/icon/192.png',
    badge: '/api/zomorod/pwa/icon/192.png',
    tag: 'zomorod-' + Date.now(), data: { url: '/' }
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
    const current = clients.find(c => new URL(c.url).origin === self.location.origin && new URL(c.url).pathname.startsWith('/sub/'));
    if (current) return current.focus();
    // Never embed a subscription token in the notification payload.
    return self.clients.openWindow('/');
  }));
});
