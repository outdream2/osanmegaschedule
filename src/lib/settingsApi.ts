// src/lib/settingsApi.ts
// 2026-09-14 · 프레임워크 · KV 설정 API 클라이언트 래퍼
//   · server/routes/settings/settings.ts (KV settings endpoints)
//   · 5+ 호출 사이트 통합 · 단순 GET/POST · key/value 패턴

import { api } from "./apiClient";

// 2026-10-13 · 긴급 fix · ERR_INSUFFICIENT_RESOURCES 폭주 fix
//   · 콘솔: brand_identity + page_visibility GET 반복 폭주 (브라우저 소켓 소진)
//   · 원인: 여러 useKvSetting hook 인스턴스 (AppNavHeader + 각 Page) 가 동일 key 동시 fetch
//   · fix: inflight promise dedupe (동시 호출 1회 네트워크) + 5초 TTL micro-cache
//   · 저장 (saveSetting / patchSettings) 성공 시 캐시 invalidate
const _settingCache = new Map<string, { value: unknown; expireAt: number }>();
const _inflight = new Map<string, Promise<unknown>>();
const SETTING_TTL_MS = 5000;

function _invalidate(key: string): void {
  _settingCache.delete(key);
  _inflight.delete(key);
}

/** GET /api/settings?key=... · KV 설정 값 조회 · inflight dedupe + TTL 캐시 */
export async function getSetting<T = unknown>(key: string): Promise<T | null> {
  // 캐시 hit · TTL 안
  const cached = _settingCache.get(key);
  if (cached && Date.now() < cached.expireAt) {
    return cached.value as T | null;
  }
  // inflight 공유 (여러 hook 동시 호출 → 네트워크 1회)
  const inflight = _inflight.get(key);
  if (inflight) {
    return inflight as Promise<T | null>;
  }
  const p = (async () => {
    try {
      const { data } = await api.get<{ value?: T }>(`/api/settings?key=${encodeURIComponent(key)}`);
      const value = (data?.value ?? null) as T | null;
      _settingCache.set(key, { value, expireAt: Date.now() + SETTING_TTL_MS });
      return value;
    } finally {
      _inflight.delete(key);
    }
  })();
  _inflight.set(key, p);
  return p;
}

/** POST /api/settings · KV 설정 값 저장 (관리자 · 서버 authorize)
 *  · WHOLE-OBJECT upsert · 전체 치환이 명시적으로 필요한 경우만 사용
 *  · 하위 호환 유지 (storage_locations · season_ranges · page_permissions 등 whole-object 저장 route)
 *  · business settings (all_settings) 는 `patchSettings` 사용 권장 (lost-update 방지)
 */
export async function saveSetting<T = unknown>(key: string, value: T): Promise<void> {
  await api.post("/api/settings", { key, value });
  _invalidate(key);
}

/** 2026-10-07 · Phase 2 · P0-5 OPTION A · atomic jsonb_set patch (lost-update 방지)
 *  · POST /api/settings/patch · path-level partial update
 *  · 서로 다른 top-level path 동시 쓰기 → 둘 다 반영 (DB atomic)
 *  · 같은 path 동시 쓰기 → last-write-wins (명시적)
 *  · 반환 · 서버 측 최종 settings value (patch 적용 후)
 */
export interface SettingsPatchItem {
  path: string[];
  value: unknown;
}
export async function patchSettings<T = unknown>(
  key: string,
  patches: SettingsPatchItem[],
): Promise<T | null> {
  const { data } = await api.post<{ ok: boolean; value: T | null }>(
    "/api/settings/patch",
    { key, patches },
  );
  _invalidate(key);
  return (data?.value ?? null) as T | null;
}
