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

if (isServer && (!url || !key)) {
  throw new Error("SUPABASE_URL and SUPABASE_KEY must be set (server env)");
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
