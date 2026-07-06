// src/components/ScheduleFilterBar.tsx
import React from "react";
import { X, Search, Building2, Warehouse, Layers } from "lucide-react";
import { Employee } from "../types";

export type WorkplaceTab = "전체" | "매장" | "창고";
export type PositionTab = "전체" | "약사" | "물류" | "캐셔" | "진열" | "알바" | "기타";
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
}) => {
  return (
    <div className="bg-white border-b border-slate-200 px-3 sm:px-6 py-2 sm:py-2.5 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-2 sm:gap-3 shrink-0 shadow-sm">
        {/* Filter Tabs: two independent groups */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest shrink-0">필터</span>
          {/* Group 1: Workplace */}
          <div className="inline-flex p-0.5 bg-slate-100 border border-slate-200 rounded-lg gap-0.5">
            {([
              { key: "전체", label: "전체", icon: <Layers size={12} />, color: "text-indigo-600", count: employees.length },
              { key: "매장", label: "매장", icon: <Building2 size={12} />, color: "text-emerald-600", count: employees.filter(e => (e.workplace || "매장") === "매장").length },
              { key: "창고", label: "창고", icon: <Warehouse size={12} />, color: "text-indigo-600", count: employees.filter(e => e.workplace === "창고").length },
            ] as const).map(({ key, label, icon, color, count }) => (
              <button
                key={key}
                onClick={() => setWorkplaceTab(key)}
                className={`px-2 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs font-semibold rounded-md cursor-pointer transition-all flex items-center gap-1 min-h-[28px] sm:min-h-[32px] ${workplaceTab === key
                  ? `bg-white ${color} shadow-sm font-bold`
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                  }`}
              >
                {icon}
                <span>{label} <span className="text-slate-400 font-normal hidden sm:inline">({count})</span><span className="text-slate-400 font-normal sm:hidden"> {count}</span></span>
              </button>
            ))}
          </div>
          <span className="text-gray-300 text-sm shrink-0">─</span>
          {/* Group 2: Position */}
          <div className="inline-flex p-0.5 bg-slate-100 border border-slate-200 rounded-lg gap-0.5">
            {([
              // 우선순위 partition: 전체 = 약사 + 알바 + 물류 + 기타 (상호 배타)
              // 물류는 캐셔·진열·물류/캐셔 겸직 포함 (캐셔는 물류의 소분류)
              { key: "전체", label: "전체", icon: <Layers size={12} />, color: "text-indigo-600", count: employees.length, sub: false },
              { key: "약사", label: "약사", icon: null, color: "text-violet-600", count: employees.filter(e => e.position === "약사").length, sub: false },
              { key: "물류", label: "물류", icon: null, color: "text-sky-600", count: employees.filter(e => e.position !== "약사" && e.rank !== "알바" && e.position !== "알바" && (e.position.includes("물류") || e.position === "캐셔" || e.position === "진열")).length, sub: false },
              // sub 카운트: 물류 count 안의 세부 (물류·물류/캐셔 겸직) — 캐셔는 물류의 하위 분류
              { key: "캐셔", label: "└ 캐셔", icon: null, color: "text-amber-600", count: employees.filter(e => e.position !== "약사" && e.rank !== "알바" && e.position !== "알바" && e.position.includes("캐셔")).length, sub: true },
              { key: "진열", label: "└ 진열", icon: null, color: "text-teal-600", count: employees.filter(e => e.position !== "약사" && e.rank !== "알바" && e.position !== "알바" && e.position === "진열").length, sub: true },
              { key: "알바", label: "알바", icon: null, color: "text-rose-600", count: employees.filter(e => e.position !== "약사" && (e.rank === "알바" || e.position === "알바")).length, sub: false },
              { key: "기타", label: "기타", icon: null, color: "text-slate-600", count: employees.filter(e => e.position !== "약사" && e.rank !== "알바" && e.position !== "알바" && !e.position.includes("물류") && !["캐셔","진열"].includes(e.position)).length, sub: false },
            ] as const).map(({ key, label, icon, color, count, sub }) => (
              <button
                key={key}
                onClick={() => setPositionTab(key)}
                className={`px-2 sm:px-3 py-1 sm:py-1.5 ${sub ? "text-[10px] sm:text-[11px]" : "text-[11px] sm:text-xs"} font-semibold rounded-md cursor-pointer transition-all flex items-center gap-1 min-h-[28px] sm:min-h-[32px] ${positionTab === key
                  ? `bg-white ${color} shadow-sm font-bold`
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                  }`}
              >
                {icon}
                <span>{label} <span className="text-slate-400 font-normal hidden sm:inline">({count})</span><span className="text-slate-400 font-normal sm:hidden"> {count}</span></span>
              </button>
            ))}
          </div>
        </div>

        {/* Employee Sorting Section */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap text-xs">
          {/* 오늘 출근 우선 토글 */}
          <button
            type="button"
            onClick={() => setTodayFirst(v => !v)}
            className={`inline-flex items-center gap-1 px-2.5 py-1 sm:py-1.5 text-[11px] sm:text-xs font-bold rounded-lg border transition-all cursor-pointer ${
              todayFirst
                ? "bg-rose-500 text-white border-rose-500 shadow-sm"
                : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
            }`}
            title="오늘 출근 직원을 목록 상단에 표시"
          >
            <span>🟢</span>
            <span className="hidden sm:inline">오늘 출근 우선</span>
            <span className="sm:hidden">오늘순</span>
          </button>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest shrink-0">정렬</span>
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
                  className={`px-2 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs font-semibold rounded-md cursor-pointer transition-all flex items-center gap-1 min-h-[28px] sm:min-h-[32px] ${
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
                className="px-2 py-1 sm:py-1.5 text-[11px] font-medium text-slate-400 hover:text-rose-500 rounded-md transition cursor-pointer min-h-[28px] sm:min-h-[32px]"
                title="기본 순서 정렬 상태로 복원"
              >
                초기화
              </button>
            )}

            {sortBy === "none" && typeof window !== "undefined" && localStorage.getItem("megatown_employee_order") && (
              <button
                type="button"
                onClick={async () => {
                  if (window.confirm("드래그 앤 드롭으로 재배치한 순서를 지우고, 원래 기본 순서로 복구하시겠습니까?")) {
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
        </div>

        {/* Employee Search Group with integrated help feedback */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:max-w-xs w-full">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-400">
              <Search size={13} />
            </div>
            <input
              type="text"
              placeholder="성명으로 조회 (예: 정윤수)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs font-medium pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 focus:border-indigo-400 focus:bg-white rounded-lg focus:outline-none placeholder-slate-400 text-slate-800 transition-all min-h-[32px]"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute inset-y-0 right-2.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>
      </div>
  );
};
