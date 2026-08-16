import { createClient } from "@supabase/supabase-js";

// 2026-08-12 · 브라우저 + 서버 겸용 · process 는 브라우저에 없어서 ReferenceError · 환경 감지
//   · 서버(Node.js): process.env.SUPABASE_URL / SUPABASE_KEY (기존)
//   · 브라우저(Vite):  import.meta.env.VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
//   · env 없으면 · 서버는 즉시 throw · 브라우저는 null client (실제 사용 시점에 실패 · 편집 UI 만 크래시 방지)
const isServer = typeof window === "undefined";
const url = isServer
  ? (process as any).env?.SUPABASE_URL
  : (import.meta as any).env?.VITE_SUPABASE_URL;
const key = isServer
  ? (process as any).env?.SUPABASE_KEY
  : (import.meta as any).env?.VITE_SUPABASE_ANON_KEY;

// 2026-08-16 · 서버 부팅 크래시 fix · throw 제거 · warn 로 격하
//   · env 없으면 서버 부팅은 성공 · API 호출 시 500 반환 (graceful degradation)
//   · 프론트만 편집 (env 관리자 UI) · 부팅 후 env 설정 가능
if (isServer && (!url || !key)) {
  // eslint-disable-next-line no-console
  console.warn(
    "[supabase/client] SUPABASE_URL / SUPABASE_KEY 가 서버 env 에 없습니다. " +
    "supabase 사용 API 호출 시 500 반환 · env 설정 후 재시작 필요."
  );
}
if (!isServer && (!url || !key)) {
  // eslint-disable-next-line no-console
  console.warn(
    "[supabase/client] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 가 .env 에 없습니다. " +
    "브라우저 Storage 업로드 등 프론트 supabase 기능이 동작하지 않습니다."
  );
}

export const supabase = (url && key)
  ? createClient(url, key)
  : (null as any);
