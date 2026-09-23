// src/components/ScheduleFilterBar.tsx
// 2026-08-17 · 공통 FilterSortLabel/Group/Row · 재사용 프레임워크 · 최신 트렌드 통일
// #342 · 2026-09-23 · 필터 탭 직군 · settings.wageRates SSOT 파생 · 하드코딩 제거
import React from "react";
import { SK_EMPLOYEE_ORDER } from "../../lib/storageKeys";
import { useConfirm } from "../../hooks/useConfirm";
import { Employee } from "../../types";
import { FilterSortLabel, FilterSortGroup, FilterSortRow } from "../common/FilterSortBar";
// #342 · settings.wageRates 기반 동적 카테고리
import { usePositionCategories, positionToCategoryDynamic } from "./usePositionCategories";
// 2026-09-21 · #329 · 한글 IME 우선
import { KO_INPUT_PROPS } from "../../lib/koreanInput";
import type { WageRate } from "../../hooks/useSettings";

export type WorkplaceTab = "전체" | "매장" | "창고";
// #342 · string 으로 완화 · settings.wageRates keys 기반 동적 직군 지원
export type PositionTab = string;
export type SortBy = "none" | "today" | "workplace" | "name" | "position";
export type SortOrder = "asc" | "desc";

interface ScheduleFilterBarProps {
  employees: Employee[];
  positionTab: PositionTab;
  setPositionTab: (tab: string) => void;
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  sortBy: SortBy;
  setSortBy: React.Dispatch<React.SetStateAction<SortBy>>;
  sortOrder: SortOrder;
  setSortOrder: React.Dispatch<React.SetStateAction<SortOrder>>;
  onResetCustomOrder: () => void | Promise<void>;
  /** 직원 등록 · 지정 안 하면 노출 안 함 */
  onCreateEmployee?: () => void;
  /** #342 · settings.wageRates · 필터 탭 직군 동적 파생 */
  wageRates?: Record<string, WageRate>;
}

export const ScheduleFilterBar: React.FC<ScheduleFilterBarProps> = ({
  employees,
  positionTab,
  setPositionTab,
  searchQuery,
  setSearchQuery,
  sortBy,
  setSortBy,
  sortOrder,
  setSortOrder,
  onResetCustomOrder,
  onCreateEmployee,
  wageRates = {},
}) => {
  const confirm = useConfirm();

  // #342 · settings.wageRates keys 기반 동적 카테고리 목록
  // wageRates 가 비어있으면 레거시 폴백 순서 사용 (usePositionCategories 내부 처리)
  const categoryOrder = usePositionCategories(wageRates);
  const wageRateKeys = Object.keys(wageRates);

  // 카테고리별 직원 수 계산 · positionToCategoryDynamic 사용
  // "전체" / "기타" 는 별도 처리
  const etcCount = employees.filter(e => positionToCategoryDynamic(e.position, wageRateKeys) === "기타").length;

  const filterOptions = categoryOrder.flatMap((cat): { key: string; label: string; count: number }[] => {
    if (cat === "전체") return [{ key: "전체", label: "전체", count: employees.length }];
    if (cat === "기타") {
      // "기타" 탭 · count > 0 일 때만 노출 (기존 규칙 유지)
      return etcCount > 0 ? [{ key: "기타", label: "기타", count: etcCount }] : [];
    }
    const count = employees.filter(e => positionToCategoryDynamic(e.position, wageRateKeys) === cat).length;
    return [{ key: cat, label: cat, count }];
  });
  const sortOptions = [
    { key: "today", label: "출근" },
    { key: "position", label: "직군", sortDir: sortBy === "position" ? sortOrder : undefined },
    { key: "name", label: "이름", sortDir: sortBy === "name" ? sortOrder : undefined },
  ] as const;
  const handleSortSelect = (key: "today" | "position" | "name") => {
    if (sortBy === key && key !== "today") setSortOrder(prev => prev === "asc" ? "desc" : "asc");
    else { setSortBy(key); setSortOrder("asc"); }
  };

  return (
    <div className="bg-white border-b border-line px-3 sm:px-6 py-2.5 sm:py-3 flex flex-col gap-2.5 sm:gap-3 shrink-0">
        <FilterSortRow>
          <FilterSortLabel>필터</FilterSortLabel>
          <FilterSortGroup
            options={filterOptions}
            active={positionTab}
            onSelect={setPositionTab}
          />
        </FilterSortRow>

        <FilterSortRow>
          <FilterSortLabel>정렬</FilterSortLabel>
          <FilterSortGroup
            options={sortOptions}
            active={sortBy === "none" ? "today" : sortBy}
            onSelect={handleSortSelect as any}
            right={sortBy === "none" && typeof window !== "undefined" && localStorage.getItem(SK_EMPLOYEE_ORDER) && (
              <button
                type="button"
                onClick={async () => {
                  if (await confirm({ message: "드래그 앤 드롭으로 재배치한 순서를 지우고, 원래 기본 순서로 복구하시겠습니까?", danger: true })) {
                    await onResetCustomOrder();
                  }
                }}
                className="px-2.5 py-1 text-[15px] font-semibold text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-md transition-colors cursor-pointer shrink-0 min-h-[30px] ml-1"
                title="드래그앤드롭 사용자 지정 순서 초기화"
              >
                순서초기화
              </button>
            )}
          />

          {/* 검색 · 직원등록 · 폰트 +2 */}
          <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap justify-end">
            <div className="relative flex-1 min-w-[140px] max-w-[240px]">
              <input
                type="text" {...KO_INPUT_PROPS}
                placeholder="성명으로 조회"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-[15px] font-medium px-3 py-1.5 bg-white border border-line focus:border-brand-deep focus:ring-2 focus:ring-brand-tint rounded-lg focus:outline-none placeholder-ink-soft text-ink transition-colors h-[36px]"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute inset-y-0 right-2.5 flex items-center text-ink-soft hover:text-ink transition-colors text-[16px]"
                  aria-label="검색어 지우기"
                >
                  ×
                </button>
              )}
            </div>
            {onCreateEmployee && (
              <button
                type="button"
                onClick={onCreateEmployee}
                title="새 직원 등록"
                className="shrink-0 inline-flex items-center justify-center px-3.5 py-1.5 text-[15px] font-semibold text-white bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] rounded-lg shadow-sm transition-colors cursor-pointer h-[36px]"
              >
                직원 등록
              </button>
            )}
          </div>
        </FilterSortRow>
      </div>
  );
};
