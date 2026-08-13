// src/components/common/FilterBar.tsx
// 2026-08-03 (#183) · 공통 필터바 컨테이너
//   - 상단 검색/필터 바 · flex-wrap · gap 통일
//   - card-panel 스타일 + padding + gap
//
// 사용 예:
//   <FilterBar>
//     <input ... />
//     <select ... />
//     <button ... className="ml-auto">전체선택</button>
//   </FilterBar>

import React from "react";

export interface FilterBarProps {
  children: React.ReactNode;
  className?: string;
  /** 간격 프리셋 (기본 medium) */
  gap?: "tight" | "medium" | "loose";
}

const GAP_MAP = {
  tight:  "gap-x-2 gap-y-2",
  medium: "gap-x-4 gap-y-2",
  loose:  "gap-x-6 gap-y-3",
};

export const FilterBar: React.FC<FilterBarProps> = ({
  children,
  className = "",
  gap = "medium",
}) => {
  return (
    <div className={`bg-white rounded-xl border border-zinc-200 shadow-sm px-4 py-3 flex flex-wrap items-center ${GAP_MAP[gap]} ${className}`}>
      {children}
    </div>
  );
};

export default FilterBar;
