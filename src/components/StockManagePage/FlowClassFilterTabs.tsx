// FlowClassFilterTabs · 상비약/일반약/화장품/미분류/전체 최대 5-way 탭 · 순수 렌더 컴포넌트
// 2026-08-31 · large-file 분리 · FlowTab.tsx audit 위반 해소
// 2026-10-07 · 사용자 지시 · 화장품 (뷰티 포함) 탭 추가 · 3-way → 4-way
// 2026-10-07 v2 · 사용자 지시 · 미분류 (unknown) optional 탭 추가 · 최대 5-way
//
// Props:
//   · essential/general/all · 필수 · 기존 호환
//   · cosmetics/unknown · optional · 호출처가 넘기면 해당 탭 활성 (분류 신규 전면 재정의 2026-10-07)

import React from "react";
import type { ClassFilter } from "../../utils/productClassify";

interface FlowClassFilterTabsProps {
  classFilter: ClassFilter;
  filteredCount: number;
  essentialCount: number;
  generalCount: number;
  /** 2026-10-07 · 화장품 (뷰티 포함) count · optional (하위 호환 · 없으면 탭 미표시) */
  cosmeticsCount?: number;
  /** 2026-10-07 v2 · 미분류 count · optional (하위 호환 · 없으면 탭 미표시) */
  unknownCount?: number;
  allCount: number;
  selectedCount: number;
  onSetFilter: (f: ClassFilter) => void;
}

export const FlowClassFilterTabs: React.FC<FlowClassFilterTabsProps> = ({
  classFilter, filteredCount, essentialCount, generalCount, cosmeticsCount, unknownCount, allCount, selectedCount, onSetFilter,
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

    {/* 상비약/일반약/화장품/미분류/전체 필터 탭 (화장품·미분류는 optional) */}
    <div className="flex items-center gap-1 border-b-2 border-line bg-white px-1 pt-1 shrink-0 flex-wrap">
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
      {cosmeticsCount !== undefined && (
        <button type="button" onClick={() => onSetFilter("cosmetics")}
          className={`relative px-4 py-2 text-[15px] font-bold leading-tight transition-colors duration-150 cursor-pointer ${classFilter === "cosmetics" ? "text-pink-700" : "text-zinc-400 hover:text-zinc-600"}`}>
          뷰티 <span className="text-[15px] font-semibold text-zinc-400 ml-1 tabular-nums">({cosmeticsCount})</span>
          {classFilter === "cosmetics" && <span className="absolute left-2 right-2 -bottom-[2px] h-[3px] rounded-t-full bg-pink-500" />}
        </button>
      )}
      {unknownCount !== undefined && (
        <button type="button" onClick={() => onSetFilter("unknown")}
          className={`relative px-4 py-2 text-[15px] font-bold leading-tight transition-colors duration-150 cursor-pointer ${classFilter === "unknown" ? "text-amber-700" : "text-zinc-400 hover:text-zinc-600"}`}>
          미분류 <span className="text-[15px] font-semibold text-zinc-400 ml-1 tabular-nums">({unknownCount})</span>
          {classFilter === "unknown" && <span className="absolute left-2 right-2 -bottom-[2px] h-[3px] rounded-t-full bg-amber-500" />}
        </button>
      )}
      <button type="button" onClick={() => onSetFilter("all")}
        className={`relative px-4 py-2 text-[15px] font-bold leading-tight transition-colors duration-150 cursor-pointer ${classFilter === "all" ? "text-zinc-800" : "text-zinc-400 hover:text-zinc-600"}`}>
        전체 <span className="text-[15px] font-semibold text-zinc-400 ml-1 tabular-nums">({allCount})</span>
        {classFilter === "all" && <span className="absolute left-2 right-2 -bottom-[2px] h-[3px] rounded-t-full bg-zinc-500" />}
      </button>
    </div>
  </>
);
