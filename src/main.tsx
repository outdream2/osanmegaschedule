import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import axios from 'axios';
import App from './App.tsx';
import { ConfirmProvider } from './hooks/useConfirm';
import { installErrorReporter } from './lib/errorReporter';
import './index.css';

// 2026-08-16 · 프레임워크 · 클라이언트 에러 리포터 (window.error + unhandledrejection → /api/client-errors)
installErrorReporter();

// 2026-08-16 · #112-G · requireAuth 재활성화 후 · 모든 axios 요청 · 인증 쿠키 자동 포함
//   · same-origin 은 브라우저 기본으로 전송하나 · 명시로 안전 확보 (cross-origin 대비)
axios.defaults.withCredentials = true;

// 2026-08-16 · #112-S10 · Access token 만료 (401) → Refresh 자동 갱신 → 원 요청 재시도
//   · Refresh 도 실패 (REFRESH_EXPIRED) → 재로그인 필요 · 앱이 401 로 자동 로그아웃 처리 (기존 로직)
let refreshInFlight: Promise<boolean> | null = null;
async function tryRefresh(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await fetch("/api/auth/refresh", { method: "POST", credentials: "include" });
      return res.ok;
    } catch {
      return false;
    } finally {
      setTimeout(() => { refreshInFlight = null; }, 0);
    }
  })();
  return refreshInFlight;
}
axios.interceptors.response.use(
  (r) => r,
  async (error) => {
    const status = error?.response?.status;
    const config = error?.config;
    const url: string = config?.url ?? "";
    // /api/auth/* 는 refresh 시도 X (무한 루프 방지)
    if (status === 401 && config && !config.__retried && !url.startsWith("/api/auth/")) {
      config.__retried = true;
      const ok = await tryRefresh();
      if (ok) return axios(config); // 새 access 로 원 요청 재시도
    }
    return Promise.reject(error);
  },
);

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
