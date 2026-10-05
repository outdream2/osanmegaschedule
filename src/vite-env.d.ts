/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_VAPID_PUBLIC_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// 2026-10-05 · 모바일 앱(WebView) bridge marker · 네이티브 앱이 WebView 로드 시 주입
//   · 서버 refresh 수명(90일) 적용 조건의 1차 신호 (2차 신호: UA osan-app/osanmega-app)
interface Window {
  osanApp?: boolean;
  OsanApp?: boolean;
}
