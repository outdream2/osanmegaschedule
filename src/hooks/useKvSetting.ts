// src/hooks/useKvSetting.ts
// 2026-08-06 · T-DB-Migrate-LocalStorage
//
// 범용 key-value settings 훅 · Supabase app_settings 테이블 (server /api/settings) 재활용
// - 목적: 여러 사용자·기기 간 공유되어야 하지만 신규 테이블을 만들기엔 과한 데이터를
//         `app_settings` 테이블 하나의 row (key/value JSONB) 로 이관.
// - 사용처 (초기): VAT 경비 · VAT 면세매출 · VAT 체크리스트 · 계약서 직군별 업무 텍스트
//
// 동작:
//   1) mount · 서버 GET /api/settings?key=<key>
//        · 성공 · value 로 상태 초기화 · localStorage 도 동기화 (다음 마운트 대비 캐시)
//        · 실패 · localStorage fallback (오프라인/서버 다운 시 UX 지속) · legacyStorageKey 도 시도
//   2) 레거시 마이그레이션 (mount 시 1회 · migrated 플래그 서버 저장 없이 판정)
//        · 서버 value 가 null (서버 미저장) 이고
//        · legacyStorageKey 에 값이 있으면
//        · → 서버로 자동 upload · 성공 시 legacyStorageKey 삭제
//        · 실패 시 legacy 유지 (silent) · 다음 마운트에서 재시도
//   3) 편집 · setValue(next) 호출 · 상태 즉시 반영 · localStorage 즉시 저장
//        · debounce 500ms · 서버 POST · 실패 silent (localStorage 는 유지)
//
// 회귀 방지:
//   · 서버가 죽어도 UI 는 계속 동작 (localStorage 로 이어감)
//   · 여러 탭 · storage 이벤트로 동기화 (선택 · enableStorageSync)
//   · sanitize 콜백으로 데이터 형태 검증 (필수 아님 · 값 그대로 저장할 수도 있음)

// 2026-08-16 · apiClient 마이그레이션
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/apiClient";

export interface UseKvSettingOptions<T> {
  /** app_settings.key · 서버 저장 key */
  key: string;
  /** 초기·fallback default 값 · 서버·로컬 둘 다 없을 때 사용 */
  defaultValue: T;
  /**
   * 레거시 localStorage key · 마운트 시 1회 마이그레이션.
   * 여러 개일 수 있음 (예: EXPENSE + TAXFREE 각각 별도 key 로 저장돼 있으면
   *   하나로 통합할 때 · 배열 전체 시도)
   * 마이그레이션 성공 시 · 서버로 upload 후 삭제.
   */
  legacyStorageKey?: string | string[];
  /**
   * 레거시 값 → 최종 저장 포맷 변환 (없으면 그대로 사용)
   * · 여러 개의 legacyStorageKey 를 하나로 병합할 때 사용
   */
  legacyToValue?: (rawByKey: Record<string, string>) => T | null;
  /**
   * 서버·로컬 값 검증·정규화 · 반환값이 저장된 상태.
   * · null 반환 시 · defaultValue 로 fallback
   */
  sanitize?: (raw: unknown) => T | null;
  /**
   * localStorage cache key · 서버 응답을 로컬에도 저장 (다음 마운트 즉시 사용).
   * 지정 없으면 `kv:${key}` 자동 사용.
   */
  cacheStorageKey?: string;
  /**
   * 다른 탭 storage 이벤트 반영 · 기본 true.
   */
  enableStorageSync?: boolean;
  /**
   * 서버 저장 debounce 시간 (ms) · 기본 500.
   */
  debounceMs?: number;
}

export interface UseKvSettingResult<T> {
  /** 현재 값 · 서버 로드 전에는 default · 로드 후 서버 값 */
  value: T;
  /** 값 변경 · 로컬 즉시 반영 · debounce 후 서버 저장 */
  setValue: (next: T | ((prev: T) => T)) => void;
  /** 서버 초기 로드 완료 여부 · UI 에서 로딩 스피너 등에 사용 */
  loaded: boolean;
  /** 마지막 서버 저장 상태 (선택) */
  saveState: "idle" | "saving" | "saved" | "error";
  /** 강제 서버 재조회 */
  reload: () => Promise<void>;
  /** debounce 취소 후 현재 값 즉시 서버 저장 */
  saveNow: () => Promise<boolean>;
}

function safeJsonParse(raw: string | null): unknown {
  if (raw == null) return undefined;
  try { return JSON.parse(raw); } catch { return undefined; }
}

function safeLocalGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeLocalSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* quota etc · silent */ }
}
function safeLocalRemove(key: string): void {
  try { localStorage.removeItem(key); } catch { /* silent */ }
}

export function useKvSetting<T>(opts: UseKvSettingOptions<T>): UseKvSettingResult<T> {
  const {
    key,
    defaultValue,
    legacyStorageKey,
    legacyToValue,
    sanitize,
    cacheStorageKey,
    enableStorageSync = true,
    debounceMs = 500,
  } = opts;

  const cacheKey = cacheStorageKey ?? `kv:${key}`;

  // ── 초기값 · localStorage 캐시 (있으면) 로 즉시 렌더 (서버 응답 대기 X)
  const [value, setValueState] = useState<T>(() => {
    const cached = safeJsonParse(safeLocalGet(cacheKey));
    if (cached !== undefined) {
      const cleaned = sanitize ? sanitize(cached) : (cached as T);
      if (cleaned !== null && cleaned !== undefined) return cleaned as T;
    }
    return defaultValue;
  });

  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  // 2026-08-12 · race 방어 · 초기 서버 응답 도착 전에 사용자가 setValue 로 편집하면
  //   후속 서버 응답으로 사용자 편집이 덮이지 않도록 · 편집 발생 후엔 서버 응답 무시.
  const hasUserEditedRef = useRef(false);

  // stable ref for options that shouldn't retrigger effects
  const sanitizeRef = useRef(sanitize);
  sanitizeRef.current = sanitize;
  const legacyToValueRef = useRef(legacyToValue);
  legacyToValueRef.current = legacyToValue;
  const defaultValueRef = useRef(defaultValue);
  defaultValueRef.current = defaultValue;

  // ── 서버 GET · apiClient (401 refresh 자동)
  const fetchServer = useCallback(async (): Promise<{ ok: boolean; value: unknown | null }> => {
    try {
      const { data } = await api.get<{ value?: unknown }>(`/api/settings?key=${encodeURIComponent(key)}`);
      return { ok: true, value: data?.value ?? null };
    } catch {
      return { ok: false, value: null };
    }
  }, [key]);

  // ── 서버 POST (debounced 아님 · 즉시)
  const saveToServer = useCallback(async (next: T): Promise<boolean> => {
    try {
      await api.post("/api/settings", { key, value: next });
      return true;
    } catch {
      return false;
    }
  }, [key]);

  const reload = useCallback(async () => {
    const { ok, value: serverVal } = await fetchServer();
    if (!ok) return;
    const cleaned = sanitizeRef.current
      ? sanitizeRef.current(serverVal)
      : (serverVal as T | null);
    if (cleaned !== null && cleaned !== undefined) {
      setValueState(cleaned as T);
      safeLocalSet(cacheKey, JSON.stringify(cleaned));
    }
  }, [fetchServer, cacheKey]);

  // ── mount · 서버 로드 + 레거시 마이그레이션
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { ok, value: serverVal } = await fetchServer();
      if (cancelled) return;
      // 사용자가 이미 편집을 시작했다면 · 초기 서버값으로 덮지 않음 (race 방어)
      if (hasUserEditedRef.current) { setLoaded(true); return; }

      // 서버 값이 있고 유효 → 그것을 사용
      if (ok && serverVal !== null && serverVal !== undefined) {
        const cleaned = sanitizeRef.current
          ? sanitizeRef.current(serverVal)
          : (serverVal as T);
        if (cleaned !== null && cleaned !== undefined) {
          setValueState(cleaned as T);
          safeLocalSet(cacheKey, JSON.stringify(cleaned));
        }
        setLoaded(true);
        return;
      }

      // 서버 값이 null (or 조회 실패) · legacy 마이그레이션 시도
      if (ok && legacyStorageKey) {
        const keys = Array.isArray(legacyStorageKey) ? legacyStorageKey : [legacyStorageKey];
        const rawByKey: Record<string, string> = {};
        let hasAny = false;
        for (const lk of keys) {
          const raw = safeLocalGet(lk);
          if (raw != null) {
            rawByKey[lk] = raw;
            hasAny = true;
          }
        }

        if (hasAny) {
          // 변환 → 최종 값
          let migrated: T | null = null;
          if (legacyToValueRef.current) {
            migrated = legacyToValueRef.current(rawByKey);
          } else if (keys.length === 1) {
            // 단일 legacy key · JSON parse 시도
            const parsed = safeJsonParse(rawByKey[keys[0]]);
            migrated = sanitizeRef.current
              ? sanitizeRef.current(parsed)
              : (parsed as T | null);
          }

          if (migrated !== null && migrated !== undefined) {
            // 서버로 upload 시도
            const uploaded = await saveToServer(migrated);
            if (!cancelled) {
              setValueState(migrated);
              safeLocalSet(cacheKey, JSON.stringify(migrated));
              if (uploaded) {
                // 성공 · legacy 삭제 (다음 마이그레이션 스킵)
                for (const lk of keys) safeLocalRemove(lk);
              }
              setLoaded(true);
              return;
            }
          }
        }
      }

      // 서버·legacy 모두 실패 · defaultValue 유지 (초기값)
      if (!cancelled) setLoaded(true);
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]); // 의도적 · fetchServer/saveToServer 는 key 로만 재생성

  // ── 다른 탭 storage 이벤트
  useEffect(() => {
    if (!enableStorageSync) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== cacheKey) return;
      const parsed = safeJsonParse(e.newValue);
      if (parsed === undefined) return;
      const cleaned = sanitizeRef.current ? sanitizeRef.current(parsed) : (parsed as T);
      if (cleaned !== null && cleaned !== undefined) {
        setValueState(cleaned as T);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [cacheKey, enableStorageSync]);

  // ── setValue · 로컬 즉시 · debounce 서버 저장
  const setValue = useCallback((next: T | ((prev: T) => T)) => {
    hasUserEditedRef.current = true; // race 방어 · 초기 서버 응답이 이 편집을 덮지 못하게
    setValueState(prev => {
      const resolved = typeof next === "function"
        ? (next as (p: T) => T)(prev)
        : next;
      safeLocalSet(cacheKey, JSON.stringify(resolved));
      // schedule server save
      if (saveTimer.current) clearTimeout(saveTimer.current);
      setSaveState("saving");
      saveTimer.current = setTimeout(async () => {
        const ok = await saveToServer(valueRef.current);
        setSaveState(ok ? "saved" : "error");
      }, debounceMs);
      return resolved;
    });
  }, [cacheKey, debounceMs, saveToServer]);

  // cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  /** debounce 취소 후 현재 값 즉시 서버 저장 */
  const saveNow = useCallback(async (): Promise<boolean> => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveState("saving");
    const ok = await saveToServer(valueRef.current);
    setSaveState(ok ? "saved" : "error");
    return ok;
  }, [saveToServer]);

  return { value, setValue, loaded, saveState, reload, saveNow };
}

export default useKvSetting;
