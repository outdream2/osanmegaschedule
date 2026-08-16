// src/hooks/usePagePermissions.ts
// 2026-08-16 · 페이지 권한 · 전역 fetch 캐시 (한 번만 · 모든 컴포넌트 공유)
//   · SideNav 에서 hidden 필터 · 다른 곳에서도 재사용 가능
//   · axios GET /api/permissions · 서버 값 없으면 DEFAULT_PERMISSIONS
//   · 편집은 PermissionsPage 에서 별도 저장 후 새로고침 필요 (혹은 window.dispatchEvent 로 무효화)

// 2026-08-16 · apiClient 로 통일 · 401 refresh + 에러 정규화 자동
import { useEffect, useState } from "react";
import { api } from "../lib/apiClient";
import { DEFAULT_PERMISSIONS, type PagePermissions } from "../types";

const CACHE_EVENT = "page-permissions-updated";
let cachedPerms: PagePermissions | null = null;
let inflight: Promise<PagePermissions> | null = null;

async function fetchPerms(): Promise<PagePermissions> {
  if (cachedPerms) return cachedPerms;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await api.get<Partial<PagePermissions>>("/api/permissions");
      const merged: PagePermissions = { ...DEFAULT_PERMISSIONS, ...(res.data ?? {}) };
      cachedPerms = merged;
      return merged;
    } catch {
      cachedPerms = DEFAULT_PERMISSIONS;
      return DEFAULT_PERMISSIONS;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** PermissionsPage 저장 후 호출 · 캐시 무효화 + 브로드캐스트 */
export function invalidatePagePermissions(): void {
  cachedPerms = null;
  try {
    window.dispatchEvent(new CustomEvent<null>(CACHE_EVENT));
  } catch { /* silent */ }
}

/** 페이지 권한 훅 · fetch on mount · 캐시 히트 시 즉시 반환 */
export function usePagePermissions(): { perms: PagePermissions; loading: boolean } {
  const [perms, setPerms] = useState<PagePermissions>(cachedPerms ?? DEFAULT_PERMISSIONS);
  const [loading, setLoading] = useState<boolean>(!cachedPerms);

  useEffect(() => {
    let alive = true;
    fetchPerms().then((p) => {
      if (!alive) return;
      setPerms(p);
      setLoading(false);
    });
    // 캐시 무효화 이벤트 수신 · 재fetch
    const handler = () => {
      fetchPerms().then((p) => { if (alive) setPerms(p); });
    };
    window.addEventListener(CACHE_EVENT, handler);
    return () => {
      alive = false;
      window.removeEventListener(CACHE_EVENT, handler);
    };
  }, []);

  return { perms, loading };
}
