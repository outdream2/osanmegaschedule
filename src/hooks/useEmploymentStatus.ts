// src/hooks/useEmploymentStatus.ts
// 2026-08-20 · #175 · 본인 재직 상태 훅
//   · GET /api/employees/{id} · retireDate 조회 · getEmploymentStatus 로 파생
//   · 모듈 레벨 캐시 (session 당 1회 fetch) · listener 패턴 (useVendors / usePagePermissions 준용)
//   · admin (level >= 9) · fetch 스킵 · 사이드바에서 항상 노출 (사직서 관리용)
//   · 사용처
//       · SideNav · document-writer 항목 필터 (pending_resignation 만 노출 · admin 제외)
//       · 그 외 유사 gate 재사용 가능
import { useEffect, useState } from "react";
import { api } from "../lib/apiClient";
import type { AuthSession } from "../types";
import {
  getEmploymentStatus,
  type EmploymentStatus,
} from "../lib/employmentStatus";

// ── 모듈 레벨 캐시 · session id 별 · 재로그인 시 invalidate 가능 ─────────────
const CACHE_EVENT = "employment-status-updated";
let cachedRetireDate: string | null | undefined = undefined; // undefined = 미조회
let cachedForEmployeeId: number | null = null;
let inflight: Promise<string | null> | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((l) => l());
}

async function fetchRetireDate(employeeId: number): Promise<string | null> {
  if (cachedForEmployeeId === employeeId && cachedRetireDate !== undefined) {
    return cachedRetireDate ?? null;
  }
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await api.get<{ retireDate?: string | null }>(
        `/api/employees/${employeeId}`,
      );
      const rd = res.data?.retireDate ?? null;
      cachedRetireDate = rd;
      cachedForEmployeeId = employeeId;
      notify();
      return rd;
    } catch (err) {
      // 조회 실패 시 · 안전측 · active 로 fallback (사직서 미노출)
      console.warn(`[useEmploymentStatus] fetch 실패 · employeeId=${employeeId} · fallback active`, err);
      cachedRetireDate = null;
      cachedForEmployeeId = employeeId;
      notify();
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** 캐시 무효화 · 로그아웃 / retireDate 변경 후 호출 */
export function invalidateEmploymentStatus(): void {
  cachedRetireDate = undefined;
  cachedForEmployeeId = null;
  try {
    window.dispatchEvent(new CustomEvent<null>(CACHE_EVENT));
  } catch {
    /* silent */
  }
}

export interface UseEmploymentStatusResult {
  status: EmploymentStatus | null; // null = admin (스킵) or 세션 없음
  loading: boolean;
}

/**
 * 본인 재직 상태 훅.
 *   · session.level >= 9 (admin) · fetch 스킵 · status=null / loading=false
 *   · session.employeeId 없음 · status=null / loading=false
 *   · 그 외 · GET /api/employees/{id} · retireDate 파생
 */
export function useEmploymentStatus(
  session: AuthSession | null,
): UseEmploymentStatusResult {
  const level = session?.level ?? 0;
  const isAdmin = level >= 9;
  const employeeId = session?.employeeId;

  const skip = isAdmin || !employeeId;

  const [status, setStatus] = useState<EmploymentStatus | null>(() => {
    if (skip) return null;
    if (
      cachedForEmployeeId === employeeId &&
      cachedRetireDate !== undefined
    ) {
      return getEmploymentStatus(cachedRetireDate);
    }
    return null;
  });
  const [loading, setLoading] = useState<boolean>(() => {
    if (skip) return false;
    return !(
      cachedForEmployeeId === employeeId && cachedRetireDate !== undefined
    );
  });

  useEffect(() => {
    if (skip) {
      setStatus(null);
      setLoading(false);
      return;
    }
    let alive = true;

    // 초기 fetch
    setLoading(!(cachedForEmployeeId === employeeId && cachedRetireDate !== undefined));
    fetchRetireDate(employeeId!).then((rd) => {
      if (!alive) return;
      setStatus(getEmploymentStatus(rd));
      setLoading(false);
    });

    // 캐시 업데이트 이벤트 구독
    const onCacheUpdate = () => {
      if (!alive) return;
      if (
        cachedForEmployeeId === employeeId &&
        cachedRetireDate !== undefined
      ) {
        setStatus(getEmploymentStatus(cachedRetireDate));
        setLoading(false);
      }
    };
    listeners.add(onCacheUpdate);

    const onInvalidate = () => {
      // 재fetch
      fetchRetireDate(employeeId!).then((rd) => {
        if (alive) setStatus(getEmploymentStatus(rd));
      });
    };
    window.addEventListener(CACHE_EVENT, onInvalidate);

    return () => {
      alive = false;
      listeners.delete(onCacheUpdate);
      window.removeEventListener(CACHE_EVENT, onInvalidate);
    };
  }, [employeeId, skip]);

  return { status, loading };
}
