// src/hooks/useSaleStatusFilter.ts
// 2026-08-28 · 사용자 지시 · 판매중 필터 프레임워크 · D안 (Segmented + localStorage 지속)
//
// 상품 리스트 · 검색창 옆 3-way 필터 · "전체 / 판매중 / 판매중지"
// 기본값 · "active" (판매중) · 초도물량 등 dirty 데이터 · UI 에서 자동 제외
//
// 사용:
//   const { value, setValue, matches } = useSaleStatusFilter();
//   const filtered = products.filter(p => matches(p.sale_status));
//
// 옵션:
//   storageKey     · localStorage key (기본 "saleStatusFilter" · 페이지별 분리 원하면 override)
//   defaultValue   · 초기값 (기본 "active")
//   syncUrl        · URL ?sale=all|active|inactive 참조 (기본 false · 추후 확장용)
import { useCallback, useEffect, useState } from "react";

export type SaleStatusFilter = "all" | "active" | "inactive";

const VALID_VALUES: readonly SaleStatusFilter[] = ["all", "active", "inactive"] as const;

function isValidValue(v: unknown): v is SaleStatusFilter {
  return typeof v === "string" && (VALID_VALUES as readonly string[]).includes(v);
}

/** 판매중 정확 매칭 · trim + 대소문자 무시 · 한글 "판매중" 표준 */
export function isActiveStatus(saleStatus: string | null | undefined): boolean {
  return String(saleStatus ?? "").trim() === "판매중";
}

export interface UseSaleStatusFilterOptions {
  storageKey?: string;
  defaultValue?: SaleStatusFilter;
  syncUrl?: boolean;
}

export interface UseSaleStatusFilterResult {
  value: SaleStatusFilter;
  setValue: (v: SaleStatusFilter) => void;
  /** row.sale_status → 이 필터 통과 여부 */
  matches: (saleStatus: string | null | undefined) => boolean;
}

export function useSaleStatusFilter(options?: UseSaleStatusFilterOptions): UseSaleStatusFilterResult {
  const storageKey = options?.storageKey ?? "saleStatusFilter";
  const defaultValue: SaleStatusFilter = options?.defaultValue ?? "active";
  const syncUrl = options?.syncUrl ?? false;

  const [value, setValueState] = useState<SaleStatusFilter>(() => {
    // 1) URL query (syncUrl=true)
    if (syncUrl && typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const q = params.get("sale");
      if (isValidValue(q)) return q;
    }
    // 2) localStorage
    if (typeof window !== "undefined") {
      try {
        const stored = window.localStorage.getItem(storageKey);
        if (isValidValue(stored)) return stored;
      } catch { /* localStorage 미지원 · quota · SSR */ }
    }
    return defaultValue;
  });

  const setValue = useCallback((v: SaleStatusFilter) => {
    setValueState(v);
    if (typeof window !== "undefined") {
      try { window.localStorage.setItem(storageKey, v); } catch { /* skip */ }
      if (syncUrl) {
        const url = new URL(window.location.href);
        if (v === "active") url.searchParams.delete("sale");  // 기본값은 URL 생략 (short URL)
        else url.searchParams.set("sale", v);
        window.history.replaceState({}, "", url.toString());
      }
    }
  }, [storageKey, syncUrl]);

  // 다른 탭에서 값 변경 시 · storage event 동기화
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== storageKey || e.newValue == null) return;
      if (isValidValue(e.newValue) && e.newValue !== value) setValueState(e.newValue);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [storageKey, value]);

  const matches = useCallback((saleStatus: string | null | undefined): boolean => {
    if (value === "all") return true;
    const active = isActiveStatus(saleStatus);
    return value === "active" ? active : !active;
  }, [value]);

  return { value, setValue, matches };
}
