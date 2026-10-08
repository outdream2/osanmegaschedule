// src/components/schedule-v2/components/ScheduleV2FilterBar.tsx
// 2026-10-08 · 스케줄 V2 · 자체 UI · 기능 코드는 V1 재사용 (logic reuse · UI 신규)
//   · logic: usePositionCategories + positionToCategoryDynamic + isPharmPosition (V1)
//   · UI: compact horizontal · search 입력 (좌) + position chip row (우) · thin border · low shadow
//   · 트렌드: Linear/Vercel/Notion 2026 톤 · 파스텔/이모지/배지 금지 · neutral surface
//   · P1 scope · sort/order/todayFirst/drag reorder/reset 는 P2 backlog
import React, { useMemo } from "react";
import { MagnifyingGlass, X } from "@phosphor-icons/react";
import type { Employee } from "../../../types";
import type { WageRate } from "../../../hooks/useSettings";
import { usePositionCategories, positionToCategoryDynamic } from "../../SchedulePage/usePositionCategories";
import { isPharmPosition } from "../../../lib/employeeCategory";
import { KO_INPUT_PROPS } from "../../../lib/koreanInput";

interface Props {
  employees: Employee[];
  positionTab: string;
  setPositionTab: (tab: string) => void;
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  wageRates?: Record<string, WageRate>;
}

export const ScheduleV2FilterBar: React.FC<Props> = ({
  employees,
  positionTab, setPositionTab,
  searchQuery, setSearchQuery,
  wageRates = {},
}) => {
  const categories = usePositionCategories(wageRates);
  const wageRateKeys = useMemo(() => Object.keys(wageRates), [wageRates]);

  // category 별 count · V1 ScheduleFilterBar:60-82 pattern
  //   · "전체" = 전체 · "약사" = isPharmPosition · "기타" = 매칭 안 된 직군
  //   · 나머지 wageRates key = positionToCategoryDynamic 매칭 (약사 제외)
  const countMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const cat of categories) {
      if (cat === "전체") { m[cat] = employees.length; continue; }
      if (cat === "약사")  { m[cat] = employees.filter(e => isPharmPosition(e.position ?? "")).length; continue; }
      if (cat === "기타")  {
        m[cat] = employees.filter(e => positionToCategoryDynamic(e.position ?? "", wageRateKeys) === "기타").length;
        continue;
      }
      m[cat] = employees.filter(e => !isPharmPosition(e.position ?? "") && positionToCategoryDynamic(e.position ?? "", wageRateKeys) === cat).length;
    }
    return m;
  }, [employees, categories, wageRateKeys]);

  // "기타" 는 count>0 때만 노출 (V1 pattern)
  const visibleCategories = useMemo(
    () => categories.filter(c => c !== "기타" || (countMap[c] ?? 0) > 0),
    [categories, countMap],
  );

  return (
    <div className="shrink-0 flex items-center gap-2 py-2 flex-wrap">
      {/* 직원 검색 */}
      <div className="relative w-full sm:w-[260px]">
        <MagnifyingGlass size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-soft pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="직원 검색"
          className="w-full h-8 pl-7 pr-7 text-[13px] rounded-md border border-line bg-white placeholder:text-zinc-400 focus:outline-none focus:border-brand-deep focus:ring-1 focus:ring-brand-deep/20"
          {...KO_INPUT_PROPS}
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 inline-flex items-center justify-center rounded-full hover:bg-zinc-100 text-ink-soft cursor-pointer"
            aria-label="검색어 지우기"
            title="지우기"
          >
            <X size={10} weight="bold" />
          </button>
        )}
      </div>

      {/* 직군 chip row */}
      <div className="flex items-center gap-1 flex-wrap">
        {visibleCategories.map(cat => {
          const active = cat === positionTab;
          const count = countMap[cat] ?? 0;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setPositionTab(cat)}
              className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[13px] font-semibold transition cursor-pointer border ${
                active
                  ? "bg-brand-deep text-white border-brand-deep"
                  : "bg-white text-ink-soft border-line hover:text-ink hover:bg-zinc-50"
              }`}
              aria-pressed={active}
            >
              <span>{cat}</span>
              <span className={`text-[11px] tabular-nums ${active ? "text-white/85" : "text-zinc-400"}`}>{count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ScheduleV2FilterBar;
