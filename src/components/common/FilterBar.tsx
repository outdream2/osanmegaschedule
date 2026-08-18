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
    // 2026-08-17 v2 · Attio 세련 · inset light + 2-layer shadow · 딥네이비 tint
    <div
      className={`bg-white rounded-xl border border-line px-4 py-3 flex flex-wrap items-center ${GAP_MAP[gap]} ${className}`}
      style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.60), 0 1px 2px rgba(10,46,74,0.05), 0 2px 8px -2px rgba(10,46,74,0.06)" }}
    >
      {children}
    </div>
  );
};

export default FilterBar;
