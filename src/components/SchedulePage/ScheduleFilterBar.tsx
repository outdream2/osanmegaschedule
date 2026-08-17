// src/components/ScheduleFilterBar.tsx
// 2026-08-17 · 공통 FilterSortLabel/Group/Row · 재사용 프레임워크 · 최신 트렌드 통일
import React from "react";
import { useConfirm } from "../../hooks/useConfirm";
import { Employee } from "../../types";
import { FilterSortLabel, FilterSortGroup, FilterSortRow } from "../common/FilterSortBar";

export type WorkplaceTab = "전체" | "매장" | "창고";
export type PositionTab = "전체" | "약사" | "사원" | "창고" | "매장";
export type SortBy = "none" | "today" | "workplace" | "name" | "position";
export type SortOrder = "asc" | "desc";

interface ScheduleFilterBarProps {
  employees: Employee[];
  positionTab: PositionTab;
  setPositionTab: React.Dispatch<React.SetStateAction<PositionTab>>;
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  sortBy: SortBy;
  setSortBy: React.Dispatch<React.SetStateAction<SortBy>>;
  sortOrder: SortOrder;
  setSortOrder: React.Dispatch<React.SetStateAction<SortOrder>>;
  onResetCustomOrder: () => void | Promise<void>;
  /** 직원 등록 · 지정 안 하면 노출 안 함 */
  onCreateEmployee?: () => void;
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
}) => {
  const confirm = useConfirm();

  // 2026-08-17 · 공용 FilterSortBar 프레임워크 · 옵션 데이터화
  const filterOptions = [
    { key: "전체", label: "전체", count: employees.length },
    { key: "약사", label: "약사", count: employees.filter(e => e.position === "약사").length },
    { key: "사원", label: "사원", count: employees.filter(e => e.position === "캐셔" || e.position === "사원").length },
    { key: "창고", label: "창고", count: employees.filter(e => e.position !== "약사" && (e.position.includes("물류") || e.position === "창고")).length },
    { key: "매장", label: "매장", count: employees.filter(e => e.position !== "약사" && e.workplace === "매장").length },
  ] as const;
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
            onSelect={setPositionTab as (k: string) => void as any}
          />
        </FilterSortRow>

        <FilterSortRow>
          <FilterSortLabel>정렬</FilterSortLabel>
          <FilterSortGroup
            options={sortOptions}
            active={sortBy === "none" ? "today" : sortBy}
            onSelect={handleSortSelect as any}
            right={sortBy === "none" && typeof window !== "undefined" && localStorage.getItem("megatown_employee_order") && (
              <button
                type="button"
                onClick={async () => {
                  if (await confirm({ message: "드래그 앤 드롭으로 재배치한 순서를 지우고, 원래 기본 순서로 복구하시겠습니까?", danger: true })) {
                    await onResetCustomOrder();
                  }
                }}
                className="px-2.5 py-1 text-[13px] font-semibold text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-md transition-colors cursor-pointer shrink-0 min-h-[30px] ml-1"
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
                type="text"
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
