// src/hooks/useMonthFilter.ts
// 2026-10-06 · 사용자 지시 · 기간필터 공통 hook (최소 공통화 · STANDARD)
//
// 흐름:
//   MonthToggleSelector
//          ↓
//      useMonthFilter   (frontend state + serialization)
//          ↓
//      months_list      (query param · "YM,YM" 과거→최근 정렬)
//          ↓
//      parseMonthsList  (server/lib/periodFilter)
//          ↓
//      각 route 의 DATE SSOT (purchase_date/sale_date/sent_at/created_at …)
//
// 사용 예 (신규 화면):
//   const { selectedMonths, setSelectedMonths, monthsList } = useMonthFilter();
//   const url = `/api/XXX?months_list=${encodeURIComponent(monthsList)}`;
//   <MonthToggleSelector selectedMonths={selectedMonths} onChange={setSelectedMonths} minOne />
//
// 설계 결정:
//   · 큰 framework 만들지 않음 · state + serializer 만 공통화
//   · default = [currentYm()] · 사용자 지시 "페이지 기본 = 첫 탭 메뉴" 와 일관
//   · URL 조립 · 각 화면 fetch 분기 패턴이 다양하므로 각 화면이 담당
//   · 날짜 축 의미 (purchase_date vs sent_at …) 는 서버 route 책임 · hook 에 포함 X

import { useCallback, useMemo, useState } from "react";
import { currentYm, monthsListParam } from "../components/common/MonthToggleSelector";

export interface UseMonthFilterOptions {
  /** 초기 선택 월 리스트 · default [currentYm()] (이번 달 1개) */
  initial?: string[];
}

export interface UseMonthFilterResult {
  /** 선택 월 리스트 · ["2026-07","2026-10"] 등 비연속 가능 */
  selectedMonths: string[];
  setSelectedMonths: (v: string[]) => void;
  /**
   * 서버 query 용 · 과거→최근 정렬 "YM,YM" · 비어있으면 ""
   *   · encodeURIComponent 는 호출처에서 적용
   */
  monthsList: string;
  /** URLSearchParams 에 months_list 를 세팅 (빈값이면 skip) · chaining 가능 */
  appendTo: (params: URLSearchParams) => URLSearchParams;
}

export function useMonthFilter(opts?: UseMonthFilterOptions): UseMonthFilterResult {
  const [selectedMonths, setSelectedMonths] = useState<string[]>(
    () => opts?.initial ?? [currentYm()],
  );
  const monthsList = useMemo(() => monthsListParam(selectedMonths), [selectedMonths]);
  const appendTo = useCallback(
    (params: URLSearchParams) => {
      if (monthsList) params.set("months_list", monthsList);
      return params;
    },
    [monthsList],
  );
  return { selectedMonths, setSelectedMonths, monthsList, appendTo };
}

/**
 * URLSearchParams 에 months_list 를 세팅 (빈값이면 skip) · hook 외부에서도 사용 가능
 *   · props 로 받은 selectedMonths 를 처리할 때 유용 (예: VendorPaymentPanel)
 */
export function appendMonthsList(params: URLSearchParams, monthsList: string): URLSearchParams {
  if (monthsList) params.set("months_list", monthsList);
  return params;
}
