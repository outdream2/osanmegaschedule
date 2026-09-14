// src/lib/settingsApi.ts
// 2026-09-14 · 프레임워크 · KV 설정 API 클라이언트 래퍼
//   · server/routes/settings/settings.ts (KV settings endpoints)
//   · 5+ 호출 사이트 통합 · 단순 GET/POST · key/value 패턴

import { api } from "./apiClient";

/** GET /api/settings?key=... · KV 설정 값 조회 */
export async function getSetting<T = unknown>(key: string): Promise<T | null> {
  const { data } = await api.get<{ value?: T }>(`/api/settings?key=${encodeURIComponent(key)}`);
  return (data?.value ?? null) as T | null;
}

/** POST /api/settings · KV 설정 값 저장 (관리자 · 서버 authorize) */
export async function saveSetting<T = unknown>(key: string, value: T): Promise<void> {
  await api.post("/api/settings", { key, value });
}
