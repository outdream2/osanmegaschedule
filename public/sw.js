// 2026-09-03 · v2 · 한글 깨짐 fix · UTF-8 명시 decode · 브라우저 강제 재등록
//   · 이전 · event.data.json() 은 default UTF-8 이지만 · 일부 브라우저 (구버전 Chrome/Firefox) · CP949 fallback
//   · 이후 · event.data.arrayBuffer() → TextDecoder('utf-8') 명시 decode → JSON.parse
//   · sw.js 버전 변경 (주석) · 브라우저가 새 파일로 인식 · 이전 캐시 무효화
self.addEventListener('push', (event) => {
  let data = {};
  try {
    if (event.data) {
      const buf = event.data.arrayBuffer();
      const text = new TextDecoder('utf-8').decode(buf);
      data = JSON.parse(text);
    }
  } catch (e) {
    try { data = event.data?.json() ?? {}; } catch { data = {}; }
  }
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
