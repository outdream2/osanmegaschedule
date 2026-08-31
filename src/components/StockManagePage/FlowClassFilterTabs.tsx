// FlowClassFilterTabs · 상비약/일반약/전체 3-way 탭 · 순수 렌더 컴포넌트
// 2026-08-31 · large-file 분리 · FlowTab.tsx audit 위반 해소

import React from "react";
import type { ClassFilter } from "../../utils/productClassify";

interface FlowClassFilterTabsProps {
  classFilter: ClassFilter;
  filteredCount: number;
  essentialCount: number;
  generalCount: number;
  allCount: number;
  selectedCount: number;
  onSetFilter: (f: ClassFilter) => void;
}

export const FlowClassFilterTabs: React.FC<FlowClassFilterTabsProps> = ({
  classFilter, filteredCount, essentialCount, generalCount, allCount, selectedCount, onSetFilter,
}) => (
  <>
    {/* 소제목 */}
    <div className="flex items-center gap-2 mb-2 shrink-0">
      <span className="inline-block w-1 h-3.5 rounded-full bg-sky-400 shrink-0" />
      <span className="text-[15px] font-semibold text-zinc-500">재고 · 매입 · 판매 현황</span>
      <span className="text-[15px] text-zinc-400 font-normal tabular-nums">{filteredCount}건</span>
      {selectedCount > 0 && (
        <span className="text-[15px] text-rose-600 font-semibold tabular-nums ml-1">· {selectedCount}개 선택됨</span>
      )}
    </div>

    {/* 상비약/일반약/전체 3-way 필터 탭 */}
    <div className="flex items-center gap-1 border-b-2 border-line bg-white px-1 pt-1 shrink-0">
      <button type="button" onClick={() => onSetFilter("stationery")}
        className={`relative px-4 py-2 text-[15px] font-bold leading-tight transition-colors duration-150 cursor-pointer ${classFilter === "stationery" ? "text-violet-700" : "text-zinc-400 hover:text-zinc-600"}`}>
        상비약 <span className="text-[15px] font-semibold text-zinc-400 ml-1 tabular-nums">({essentialCount})</span>
        {classFilter === "stationery" && <span className="absolute left-2 right-2 -bottom-[2px] h-[3px] rounded-t-full bg-violet-500" />}
      </button>
      <button type="button" onClick={() => onSetFilter("general")}
        className={`relative px-4 py-2 text-[15px] font-bold leading-tight transition-colors duration-150 cursor-pointer ${classFilter === "general" ? "text-sky-700" : "text-zinc-400 hover:text-zinc-600"}`}>
        일반약 <span className="text-[15px] font-semibold text-zinc-400 ml-1 tabular-nums">({generalCount})</span>
        {classFilter === "general" && <span className="absolute left-2 right-2 -bottom-[2px] h-[3px] rounded-t-full bg-sky-500" />}
      </button>
      <button type="button" onClick={() => onSetFilter("all")}
        className={`relative px-4 py-2 text-[15px] font-bold leading-tight transition-colors duration-150 cursor-pointer ${classFilter === "all" ? "text-zinc-800" : "text-zinc-400 hover:text-zinc-600"}`}>
        전체 <span className="text-[15px] font-semibold text-zinc-400 ml-1 tabular-nums">({allCount})</span>
        {classFilter === "all" && <span className="absolute left-2 right-2 -bottom-[2px] h-[3px] rounded-t-full bg-zinc-500" />}
      </button>
    </div>
  </>
);
