self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  const title  = data.title  ?? '진열 보충 요청';
  const body   = data.body   ?? '새로운 진열 보충 요청이 도착했습니다.';
  const url    = data.url    ?? '/';
  const tag    = data.tag    ?? 'display-request';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag,
      requireInteraction: true,
      data: { url },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const existing = list.find((c) => c.url.includes(self.location.origin));
      if (existing) return existing.focus();
      return clients.openWindow(url);
    })
  );
});
