import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ConfirmProvider } from './hooks/useConfirm';
import './index.css';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(console.error);
  });
}

// 2026-08-12 · Phase 5 · 부팅 시 · brand_identity KV 를 fetch 로 조회 · document.title / favicon runtime 교체
//   · 실패/미설정 시 index.html 기본값 그대로 유지 (하드코딩 fallback)
//   · useKvSetting 훅은 React 컴포넌트 내부에서만 호출 가능하므로 · 여기서는 REST API 직접 호출
//   · 서버 규약: GET /api/settings?key=brand_identity → { value: BrandIdentity | null }
fetch('/api/settings?key=brand_identity', { credentials: 'include' })
  .then((r) => (r.ok ? r.json() : null))
  .then((data) => {
    const brand = data?.value;
    if (!brand || typeof brand !== 'object') return;
    if (typeof brand.appTitle === 'string' && brand.appTitle.trim()) {
      document.title = brand.appTitle;
    }
    if (typeof brand.faviconUrl === 'string' && brand.faviconUrl.trim()) {
      let link = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = brand.faviconUrl;
    }
  })
  .catch(() => {
    // 조용히 실패 · index.html 기본값 유지
  });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfirmProvider>
      <App />
    </ConfirmProvider>
  </StrictMode>,
);
