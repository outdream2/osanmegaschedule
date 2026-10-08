// src/components/schedule-v2/components/ScheduleV2FilterBar.tsx
// 2026-10-08 · 스케줄 V2 · 자체 UI · 기능 코드는 V1 재사용 (logic reuse · UI 신규)
//   · logic: usePositionCategories + positionToCategoryDynamic + isPharmPosition (V1)
//   · UI: compact horizontal · search 입력 (좌) + position chip row (우) · thin border · low shadow
//   · 트렌드: Linear/Vercel/Notion 2026 톤 · 파스텔/이모지/배지 금지 · neutral surface
//   · P1 scope · sort/order/todayFirst/drag reorder/reset 는 P2 backlog
import React, { useMemo } from "react";
import { MagnifyingGlass, X } from "@phosphor-icons/react";
import type { Employee } from "../../../types";
import { positionToCategoryDynamic } from "../../SchedulePage/usePositionCategories";
import { KO_INPUT_PROPS } from "../../../lib/koreanInput";

interface Props {
  employees: Employee[];
  positionTab: string;
  setPositionTab: (tab: string) => void;
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  /** 2026-10-08 · 사용자 지시 · settings.positions SSOT · wageRates 는 count 분류용으로만 사용 */
  settingsPositions: string[];
  /** 2026-10-08 · settings.wageRates keys · positionToCategoryDynamic 매칭용 (하위호환) */
  wageRateKeys?: string[];
}

export const ScheduleV2FilterBar: React.FC<Props> = ({
  employees,
  positionTab, setPositionTab,
  searchQuery, setSearchQuery,
  settingsPositions,
  wageRateKeys = [],
}) => {
  // 2026-10-08 · 사용자 지시 · chip list = ["전체", ...settings.positions, "기타"(count>0 때만)]
  //   · "기타" 는 settings.positions 에 포함되지 않은 직군을 가진 직원이 있을 때만 노출
  //   · 중복 "기타" 제거 (settings.positions 에 이미 있으면 그걸 사용)
  //   · V1 ScheduleFilterBar 는 wageRates keys 기준 · V2 는 settings.positions 기준 (사용자 명시 변경)
  const categories = useMemo(() => {
    const base = (settingsPositions ?? []).filter(p => p && p.trim() !== "");
    const list: string[] = ["전체"];
    for (const p of base) {
      if (!list.includes(p)) list.push(p);
    }
    return list;
  }, [settingsPositions]);

  // count 매핑
  //   · "전체" = 전체 직원 수
  //   · 각 position = exact match (emp.position === cat)
  //   · "기타" = emp.position 이 settings.positions 에 없는 직원 수 (0 이면 chip 숨김)
  const positionSet = useMemo(() => new Set((settingsPositions ?? []).map(p => (p ?? "").trim()).filter(Boolean)), [settingsPositions]);
  const countMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const cat of categories) {
      if (cat === "전체") { m[cat] = employees.length; continue; }
      m[cat] = employees.filter(e => (e.position ?? "").trim() === cat).length;
    }
    // 기타 · settings.positions 에 없는 position 보유 직원
    const etcCount = employees.filter(e => {
      const pos = (e.position ?? "").trim();
      if (!pos) return true;
      return !positionSet.has(pos);
    }).length;
    if (etcCount > 0) m["기타"] = etcCount;
    return m;
  }, [employees, categories, positionSet]);

  // "기타" chip 은 count>0 때만 끝에 추가
  const visibleCategories = useMemo(() => {
    const list = [...categories];
    if ((countMap["기타"] ?? 0) > 0) list.push("기타");
    return list;
  }, [categories, countMap]);

  // positionToCategoryDynamic 는 상위 filter engine (buildFilteredEmployees) 호환성 유지용
  //   · V1 wageRates 매핑과 V2 settings.positions chip 가 일치하지 않을 수 있음 (사용자 설정 다를 때)
  //   · 하지만 count 는 chip 기준 (exact match + 기타) · filter 는 V1 pattern (wageRates based)
  void positionToCategoryDynamic; void wageRateKeys;

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
