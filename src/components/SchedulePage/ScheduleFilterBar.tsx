// src/components/ScheduleFilterBar.tsx
import React from "react";
import { useConfirm } from "../../hooks/useConfirm";
// 2026-08-11 · 사용자 요청 · 필터바 아이콘 전면 제거 · lucide import 도 삭제
import { Employee } from "../../types";

export type WorkplaceTab = "전체" | "매장" | "창고";
export type PositionTab = "전체" | "약사" | "창고" | "진열" | "매장";
export type SortBy = "none" | "position" | "name";
export type SortOrder = "asc" | "desc";

interface ScheduleFilterBarProps {
  employees: Employee[];
  workplaceTab: WorkplaceTab;
  setWorkplaceTab: React.Dispatch<React.SetStateAction<WorkplaceTab>>;
  positionTab: PositionTab;
  setPositionTab: React.Dispatch<React.SetStateAction<PositionTab>>;
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  sortBy: SortBy;
  setSortBy: React.Dispatch<React.SetStateAction<SortBy>>;
  sortOrder: SortOrder;
  setSortOrder: React.Dispatch<React.SetStateAction<SortOrder>>;
  todayFirst: boolean;
  setTodayFirst: React.Dispatch<React.SetStateAction<boolean>>;
  onResetCustomOrder: () => void | Promise<void>;
  /** 직원 등록 · 지정 안 하면 노출 안 함 */
  onCreateEmployee?: () => void;
}

export const ScheduleFilterBar: React.FC<ScheduleFilterBarProps> = ({
  employees,
  workplaceTab,
  setWorkplaceTab,
  positionTab,
  setPositionTab,
  searchQuery,
  setSearchQuery,
  sortBy,
  setSortBy,
  sortOrder,
  setSortOrder,
  todayFirst,
  setTodayFirst,
  onResetCustomOrder,
  onCreateEmployee,
}) => {
  const confirm = useConfirm();

  return (
    <div className="bg-white border-b border-slate-200 px-3 sm:px-6 py-2 sm:py-2.5 flex flex-col gap-2 sm:gap-3 shrink-0 shadow-sm">
        {/* Filter Tabs: two independent groups */}
        <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
          <span className="text-[17px] font-bold text-slate-400 uppercase tracking-widest shrink-0 pr-0.5">필터</span>
          {/* Group 1: Workplace */}
          <div className="inline-flex p-0.5 bg-slate-100 border border-slate-200 rounded-lg gap-0.5">
            {([
              { key: "전체", label: "전체", color: "text-indigo-600", count: employees.length },
              { key: "매장", label: "매장", color: "text-emerald-600", count: employees.filter(e => (e.workplace || "매장") === "매장").length },
              { key: "창고", label: "창고", color: "text-indigo-600", count: employees.filter(e => e.workplace === "창고").length },
            ] as const).map(({ key, label, color, count }) => (
              <button
                key={key}
                onClick={() => setWorkplaceTab(key)}
                className={`px-1.5 sm:px-2 py-0.5 sm:py-0.5 text-[12px] sm:text-[13px] font-semibold rounded-md cursor-pointer transition-all flex items-center gap-1 min-h-[24px] sm:min-h-[26px] ${workplaceTab === key
                  ? `bg-white ${color} shadow-sm font-bold`
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                  }`}
              >
                <span>{label} <span className="text-slate-400 font-normal">({count})</span></span>
              </button>
            ))}
          </div>
          <span className="text-gray-300 text-sm shrink-0">─</span>
          {/* Group 2: Position */}
          <div className="inline-flex p-0.5 bg-slate-100 border border-slate-200 rounded-lg gap-0.5">
            {([
              // 2026-08-04 · 사용자 요청 · 필터 통합: 전체 · 약사 · 창고 · 진열 · 매장(창고+진열)
              // · 창고 = position 물류(창고 포함)
              // · 진열 = position 진열
              // · 매장 = 창고 + 진열 통합 (약사 외 매장 근무자 · 캐셔 포함)
              { key: "전체", label: "전체", color: "text-indigo-600", count: employees.length },
              { key: "약사", label: "약사", color: "text-violet-600", count: employees.filter(e => e.position === "약사").length },
              { key: "창고", label: "창고", color: "text-sky-600", count: employees.filter(e => e.position !== "약사" && (e.position.includes("물류") || e.position === "창고")).length },
              { key: "진열", label: "진열", color: "text-teal-600", count: employees.filter(e => e.position !== "약사" && e.position === "진열").length },
              { key: "매장", label: "매장", color: "text-emerald-600", count: employees.filter(e => e.position !== "약사" && (e.position.includes("물류") || e.position === "창고" || e.position === "진열" || e.position === "캐셔")).length },
            ] as const).map(({ key, label, color, count }) => (
              <button
                key={key}
                onClick={() => setPositionTab(key)}
                className={`px-1.5 sm:px-2 py-0.5 sm:py-0.5 text-[12px] sm:text-[13px] font-semibold rounded-md cursor-pointer transition-all flex items-center gap-1 min-h-[24px] sm:min-h-[26px] ${positionTab === key
                  ? `bg-white ${color} shadow-sm font-bold`
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                  }`}
              >
                <span>{label} <span className="text-slate-400 font-normal">({count})</span></span>
              </button>
            ))}
          </div>
        </div>

        {/* 2026-08-11 · 정렬 + 검색 + 직원등록 · PC 한줄 · 반응형 2줄 (flex-wrap) */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap text-xs">
          <span className="text-[17px] font-bold text-slate-400 uppercase tracking-widest shrink-0 pr-0.5">정렬</span>
          {/* 오늘 출근 우선 토글 */}
          <button
            type="button"
            onClick={() => setTodayFirst(v => !v)}
            className={`inline-flex items-center gap-1 px-2 py-0.5 sm:py-1 text-[12px] sm:text-[13px] font-bold rounded-lg border transition-all cursor-pointer ${
              todayFirst
                ? "bg-rose-500 text-white border-rose-500 shadow-sm"
                : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
            }`}
            title="오늘 출근 직원을 목록 상단에 표시"
          >
            <span className="hidden sm:inline">오늘 출근 우선</span>
            <span className="sm:hidden">오늘순</span>
          </button>
          <div className="inline-flex p-0.5 bg-slate-100 border border-slate-200 rounded-lg gap-0.5">
            {(["position", "name"] as const).map((key) => {
              const labels: Record<string, string> = { position: "구분", name: "이름" };
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    if (sortBy === key) setSortOrder(prev => prev === "asc" ? "desc" : "asc");
                    else { setSortBy(key); setSortOrder("asc"); }
                  }}
                  className={`px-1.5 sm:px-2 py-0.5 sm:py-1 text-[12px] sm:text-[13px] font-semibold rounded-md cursor-pointer transition-all flex items-center gap-1 min-h-[26px] sm:min-h-[30px] ${
                    sortBy === key ? "bg-white text-indigo-600 shadow-sm font-bold" : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <span>{labels[key]}</span>
                  {sortBy === key && <span className="text-[10px] font-mono">{sortOrder === "asc" ? "↑" : "↓"}</span>}
                </button>
              );
            })}
            {sortBy !== "none" && (
              <button
                type="button"
                onClick={() => {
                  setSortBy("none");
                  setSortOrder("asc");
                }}
                className="px-2 py-1 sm:py-1.5 text-[13px] font-medium text-slate-400 hover:text-rose-500 rounded-md transition cursor-pointer min-h-[28px] sm:min-h-[32px]"
                title="기본 순서 정렬 상태로 복원"
              >
                초기화
              </button>
            )}
            {sortBy === "none" && typeof window !== "undefined" && localStorage.getItem("megatown_employee_order") && (
              <button
                type="button"
                onClick={async () => {
                  if (await confirm({ message: "드래그 앤 드롭으로 재배치한 순서를 지우고, 원래 기본 순서로 복구하시겠습니까?", danger: true })) {
                    await onResetCustomOrder();
                  }
                }}
                className="px-2 py-1 sm:py-1.5 text-[10px] font-bold text-rose-500 hover:text-rose-600 hover:bg-rose-50 rounded-md transition cursor-pointer shrink-0 min-h-[28px] sm:min-h-[32px]"
                title="드래그앤드롭 사용자 지정 순서 초기화"
              >
                순서초기화
              </button>
            )}
          </div>

          {/* 검색 · 직원등록 · 같은 줄에 이어붙임 (PC) · 좁으면 wrap (반응형 2줄) */}
          <div className="relative flex-1 min-w-[180px] sm:max-w-xs">
            <input
              type="text"
              placeholder="성명으로 조회 (예: 정윤수)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-[13px] font-medium px-2.5 py-1 bg-slate-50 border border-slate-200 focus:border-indigo-400 focus:bg-white rounded-lg focus:outline-none placeholder-slate-400 text-slate-800 transition-all min-h-[30px]"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute inset-y-0 right-2 flex items-center text-slate-400 hover:text-slate-600 transition-colors text-xs"
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
              className="shrink-0 inline-flex items-center justify-center px-3 py-1.5 text-[12px] font-black text-white bg-indigo-600 hover:bg-indigo-700 border border-indigo-600 rounded-lg shadow-sm transition cursor-pointer active:scale-95"
            >
              직원 등록
            </button>
          )}
        </div>
      </div>
  );
};
