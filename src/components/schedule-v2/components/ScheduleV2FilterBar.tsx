// src/components/schedule-v2/components/ScheduleV2FilterBar.tsx
// 2026-10-08 · 스케줄 V2 · compact single-row filter toolbar
//   · 사용자 지시 · duplicate filter UI 제거 (summary pills 는 상단 month row 로 이동)
//   · 구성: [검색] [직군 ▾] [정렬 ▾] [오늘우선 ☐] [초기화]
//   · logic: V1 재사용 가능한 helper 는 전부 import (usePositionCategories · positionToCategoryDynamic)
//   · 트렌드: Linear/Vercel/Notion 2026 · thin border · neutral · compact (h-8)
import React, { useMemo } from "react";
import { MagnifyingGlass, X, ArrowCounterClockwise } from "@phosphor-icons/react";
import type { Employee } from "../../../types";
import { KO_INPUT_PROPS } from "../../../lib/koreanInput";

export type SortBy = "none" | "today" | "name" | "position" | "workplace";
export type SortOrder = "asc" | "desc";

interface Props {
  employees: Employee[];
  positionTab: string;
  setPositionTab: (tab: string) => void;
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  sortBy: SortBy;
  setSortBy: (s: SortBy) => void;
  sortOrder: SortOrder;
  setSortOrder: (o: SortOrder) => void;
  todayFirst: boolean;
  setTodayFirst: (v: boolean) => void;
  onReset: () => void;
  /** settings.positions SSOT · chip/dropdown 카테고리 */
  settingsPositions: string[];
  /** 2026-10-08 · 사용자 지시 §21 · 필터 toolbar 오른쪽에 action 버튼 배치 (전월복사 · 일괄등록 등) */
  rightActions?: React.ReactNode;
}

const SORT_LABELS: Record<SortBy, string> = {
  none: "기본",
  today: "오늘 근무",
  name: "이름",
  position: "직군",
  workplace: "근무지",
};

export const ScheduleV2FilterBar: React.FC<Props> = ({
  employees,
  positionTab, setPositionTab,
  searchQuery, setSearchQuery,
  sortBy, setSortBy,
  sortOrder, setSortOrder,
  todayFirst, setTodayFirst,
  onReset,
  settingsPositions,
  rightActions,
}) => {
  // 직군 options · "전체" + settings.positions + "기타"(count>0 일 때만)
  const positionSet = useMemo(
    () => new Set((settingsPositions ?? []).map(p => (p ?? "").trim()).filter(Boolean)),
    [settingsPositions],
  );
  const etcCount = useMemo(() => employees.filter(e => {
    const pos = (e.position ?? "").trim();
    if (!pos) return true;
    return !positionSet.has(pos);
  }).length, [employees, positionSet]);

  const positionOptions = useMemo(() => {
    const list: string[] = ["전체"];
    for (const p of settingsPositions ?? []) {
      const label = (p ?? "").trim();
      if (!label) continue;
      if (!list.includes(label)) list.push(label);
    }
    if (etcCount > 0) list.push("기타");
    return list;
  }, [settingsPositions, etcCount]);

  // reset 활성 조건 · 기본값과 다른 상태 하나라도 있으면 노출
  const isDirty =
    positionTab !== "전체" ||
    searchQuery.trim() !== "" ||
    sortBy !== "none" ||
    sortOrder !== "asc" ||
    todayFirst !== false;

  // sort 방향 toggle · sortBy === "none" 이면 비활성
  const canToggleOrder = sortBy !== "none";

  return (
    <div className="shrink-0 flex items-center gap-2 py-2 flex-wrap">
      {/* 직원 검색 */}
      <div className="relative w-full sm:w-[220px]">
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

      {/* 직군 dropdown */}
      <label className="inline-flex items-center gap-1.5">
        <span className="text-[12px] text-ink-soft">직군</span>
        <select
          value={positionTab}
          onChange={e => setPositionTab(e.target.value)}
          className="h-8 pl-2 pr-6 text-[13px] rounded-md border border-line bg-white text-ink font-semibold focus:outline-none focus:border-brand-deep focus:ring-1 focus:ring-brand-deep/20 cursor-pointer"
        >
          {positionOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      </label>

      {/* 정렬 dropdown */}
      <label className="inline-flex items-center gap-1.5">
        <span className="text-[12px] text-ink-soft">정렬</span>
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as SortBy)}
          className="h-8 pl-2 pr-6 text-[13px] rounded-md border border-line bg-white text-ink font-semibold focus:outline-none focus:border-brand-deep focus:ring-1 focus:ring-brand-deep/20 cursor-pointer"
        >
          {(Object.keys(SORT_LABELS) as SortBy[]).map(k => (
            <option key={k} value={k}>{SORT_LABELS[k]}</option>
          ))}
        </select>
        {/* 오름/내림 토글 (sort 적용 시만 활성) */}
        <button
          type="button"
          disabled={!canToggleOrder}
          onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
          className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-line bg-white text-ink-soft hover:bg-zinc-50 text-[12px] font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          title={canToggleOrder ? (sortOrder === "asc" ? "오름차순 → 내림차순" : "내림차순 → 오름차순") : "정렬 선택 시 활성"}
          aria-label="정렬 방향"
        >
          {sortOrder === "asc" ? "↑" : "↓"}
        </button>
      </label>

      {/* 오늘우선 toggle */}
      <label className="inline-flex items-center gap-1.5 h-8 px-2 rounded-md border border-line bg-white cursor-pointer hover:bg-zinc-50">
        <input
          type="checkbox"
          checked={todayFirst}
          onChange={e => setTodayFirst(e.target.checked)}
          className="w-3.5 h-3.5 accent-brand-deep cursor-pointer"
        />
        <span className="text-[13px] text-ink font-semibold select-none">오늘우선</span>
      </label>

      {/* 초기화 */}
      {isDirty && (
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-line bg-white text-ink-soft hover:text-ink hover:bg-zinc-50 text-[12px] font-semibold cursor-pointer"
          title="필터·정렬·순서 전부 초기화"
        >
          <ArrowCounterClockwise size={12} weight="bold" />
          초기화
        </button>
      )}

      {/* 2026-10-08 · 사용자 지시 §21 · 오른쪽 action 버튼 slot (전월복사 · 일괄등록) */}
      {rightActions && (
        <div className="ml-auto flex items-center gap-1.5">
          {rightActions}
        </div>
      )}
    </div>
  );
};

export default ScheduleV2FilterBar;
