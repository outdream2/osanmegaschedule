// src/hooks/useSaleStatusFilter.ts
// 2026-08-28 · 사용자 지시 · 판매중 필터 프레임워크 · D안 (Segmented)
// 2026-09-10 · 사용자 지시 · localStorage 사용 X · 코드에서만 · 매 세션 default 강제
//   · 사용자 조작 · in-memory 만 · 새로고침 시 · 기본값 (active) 복귀
//   · storageKey · syncUrl 옵션 · 하위 호환 유지 (실제 저장 X)
//
// 상품 리스트 · 검색창 옆 3-way 필터 · "전체 / 판매중 / 판매중지"
// 기본값 · "active" (판매중) · 초도물량 등 dirty 데이터 · UI 에서 자동 제외
//
// 사용:
//   const { value, setValue, matches } = useSaleStatusFilter();
//   const filtered = products.filter(p => matches(p.sale_status));

import { useCallback, useState } from "react";

export type SaleStatusFilter = "all" | "active" | "inactive";

/** 판매중 정확 매칭 · trim + 대소문자 무시 · 한글 "판매중" 표준 */
export function isActiveStatus(saleStatus: string | null | undefined): boolean {
  return String(saleStatus ?? "").trim() === "판매중";
}

export interface UseSaleStatusFilterOptions {
  /** 하위 호환 · 실제 저장 X · 무시 */
  storageKey?: string;
  defaultValue?: SaleStatusFilter;
  /** 하위 호환 · 실제 URL 반영 X · 무시 */
  syncUrl?: boolean;
}

export interface UseSaleStatusFilterResult {
  value: SaleStatusFilter;
  setValue: (v: SaleStatusFilter) => void;
  /** row.sale_status → 이 필터 통과 여부 */
  matches: (saleStatus: string | null | undefined) => boolean;
}

export function useSaleStatusFilter(options?: UseSaleStatusFilterOptions): UseSaleStatusFilterResult {
  const defaultValue: SaleStatusFilter = options?.defaultValue ?? "active";
  // 2026-09-10 · 사용자 지시 · localStorage 사용 안 함 · 매 마운트 · defaultValue 로 초기화
  const [value, setValue] = useState<SaleStatusFilter>(defaultValue);

  const matches = useCallback((saleStatus: string | null | undefined): boolean => {
    if (value === "all") return true;
    const active = isActiveStatus(saleStatus);
    return value === "active" ? active : !active;
  }, [value]);

  return { value, setValue, matches };
}
