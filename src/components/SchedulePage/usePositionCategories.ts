// src/components/SchedulePage/usePositionCategories.ts
// #342 · 2026-09-23 · 필터 탭 직군 · settings.wageRates SSOT 파생 · 하드코딩 제거
import { useMemo } from "react";
import type { WageRate } from "../../hooks/useSettings";

/**
 * settings.wageRates keys 를 기반으로 필터 탭 카테고리 순서를 동적으로 파생한다.
 *
 * - wageRates 에 등록된 직군이 곧 "공식 카테고리"
 * - "전체" 는 항상 첫 번째, "기타" 는 항상 마지막
 * - wageRates 가 비어있을 때 · 폴백 순서 사용
 *
 * @param wageRates  settings.wageRates (Record<string, WageRate>)
 * @returns  카테고리 배열 (예: ["전체", "약사", "캐셔", "물류", "기타"])
 */
export function usePositionCategories(wageRates: Record<string, WageRate>): string[] {
  return useMemo(() => {
    const keys = Object.keys(wageRates).filter(k => k.trim() !== "");
    // wageRates 가 비어있으면 레거시 폴백 순서 유지
    const base = keys.length > 0 ? keys : ["약사", "사원", "창고", "매장"];
    return ["전체", ...base, "기타"];
  }, [wageRates]);
}

/**
 * positionToCategory 의 동적 버전.
 * wageRates keys 를 카테고리로 사용해 직군을 분류한다.
 *
 * - 정확 매칭 우선
 * - "물류" 포함 → "물류" 카테고리가 있으면 해당, 없으면 "기타"
 * - 매칭 실패 → "기타"
 */
export function positionToCategoryDynamic(
  pos: string,
  wageRateKeys: string[],
): string {
  if (!pos) return "기타";
  // 정확 매칭
  if (wageRateKeys.includes(pos)) return pos;
  // 부분 매칭 (물류 계열 · 기존 규칙 유지)
  if (pos.includes("물류")) {
    const logisticsKey = wageRateKeys.find(k => k.includes("물류") || k === "창고");
    if (logisticsKey) return logisticsKey;
  }
  return "기타";
}
