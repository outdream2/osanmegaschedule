// apps/sync-agent/src/main/supabaseClient.ts
// 2026-10-03 저녁 · Phase 2 · ERP → Supabase Gateway · main process Supabase client
//
// 중요:
//   · Renderer 에는 절대 노출하지 않음 (IPC 핸들러만 통함)
//   · SERVICE_ROLE_KEY 는 process.env 에서 로드 (project root/.env 포함)
//   · 그 외 안전한 저장 방법 (safeStorage) 는 Phase 3 설계
//   · 민감정보 로그 금지

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

// 2026-10-04 · Electron main 환경 전역 WebSocket stub
//   · @supabase/supabase-js v2 createClient 가 Realtime 생성 시 전역 WebSocket 참조 요구
//   · ERP sync 는 REST 전용 (SELECT/INSERT/UPDATE) · Realtime subscribe 없음
//   · stub 은 subscribe 시도 시만 throw · 평시 쿼리는 영향 X
//   · ws package 추가 아님 · 전역 polyfill 만 (사용자 지시 준수)
if (typeof (globalThis as { WebSocket?: unknown }).WebSocket === "undefined") {
  class WebSocketStub {
    constructor() {
      throw new Error("ERP sync REST only · Realtime subscribe 미사용");
    }
  }
  (globalThis as { WebSocket?: unknown }).WebSocket = WebSocketStub;
}

let cachedClient: SupabaseClient | null = null;

/** 간단 .env 파서 (dotenv 패키지 없이) · iregenSoap.ts 패턴 재사용 */
function parseEnvFile(path: string): Record<string, string> {
  try {
    if (!existsSync(path)) return {};
    const raw = readFileSync(path, "utf8");
    const out: Record<string, string> = {};
    for (const rawLine of raw.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (key) out[key] = val;
    }
    return out;
  } catch {
    return {};
  }
}

function envVal(key: string): string | undefined {
  const p = process.env[key];
  if (p && p.trim()) return p.trim();
  // __dirname (dev) = apps/sync-agent/out/main · 그 상위로 올라가 project root
  const syncAgentEnv = resolve(__dirname, "../../.env");
  const projectRootEnv = resolve(__dirname, "../../../../.env");
  for (const path of [syncAgentEnv, projectRootEnv]) {
    const m = parseEnvFile(path);
    if (m[key] && m[key].trim()) return m[key].trim();
  }
  return undefined;
}

/** sync-agent 가 사용할 Supabase client (lazy) */
export function getSupabaseClient(): SupabaseClient | null {
  if (cachedClient) return cachedClient;
  const url = envVal("SUPABASE_URL");
  const key = envVal("SUPABASE_SERVICE_ROLE_KEY") ?? envVal("SUPABASE_KEY");
  if (!url || !key) {
    console.warn("[supabaseClient] SUPABASE_URL 또는 SUPABASE_KEY 없음 · ERP Sync 비활성");
    return null;
  }
  cachedClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "public" },
  });
  console.log("[supabaseClient] 초기화 OK · url=***/" + url.split("/").slice(-1)[0]);
  return cachedClient;
}

/** 설정 상태 조회 (민감정보 노출 X) */
export function getSupabaseStatus(): { present: boolean; urlSuffix: string | null } {
  const url = envVal("SUPABASE_URL");
  const key = envVal("SUPABASE_SERVICE_ROLE_KEY") ?? envVal("SUPABASE_KEY");
  const present = !!(url && key);
  const urlSuffix = url ? url.split("/").slice(-1)[0] : null;
  return { present, urlSuffix };
}
