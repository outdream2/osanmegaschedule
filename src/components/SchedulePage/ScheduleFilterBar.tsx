// src/components/ScheduleFilterBar.tsx
import React from "react";
import { useConfirm } from "../../hooks/useConfirm";
// 2026-08-11 · 사용자 요청 · 필터바 아이콘 전면 제거 · lucide import 도 삭제
import { Employee } from "../../types";

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

  return (
    // 2026-08-17 · 최신 트렌드 · 파스텔 지양 · 딥네이비 accent · flat · 폰트 통일
    <div className="bg-white border-b border-line px-3 sm:px-6 py-2.5 sm:py-3 flex flex-col gap-2.5 sm:gap-3 shrink-0">
        {/* Filter · 좌측 accent + segmented pill (mono neutral · active bg-white shadow) */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="flex items-center gap-2 shrink-0">
            <span className="w-[3px] h-[14px] rounded-full bg-brand-deep" />
            <span className="text-[14px] font-bold text-ink tracking-tight">필터</span>
          </span>
          <div className="inline-flex p-1 bg-zinc-100 border border-line rounded-lg gap-0.5">
            {([
              { key: "전체", label: "전체", count: employees.length },
              { key: "약사", label: "약사", count: employees.filter(e => e.position === "약사").length },
              { key: "사원", label: "사원", count: employees.filter(e => e.position === "캐셔" || e.position === "사원").length },
              { key: "창고", label: "창고", count: employees.filter(e => e.position !== "약사" && (e.position.includes("물류") || e.position === "창고")).length },
              { key: "매장", label: "매장", count: employees.filter(e => e.position !== "약사" && e.workplace === "매장").length },
            ] as const).map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => setPositionTab(key)}
                className={`px-2.5 sm:px-3 py-1 text-[13px] sm:text-[14px] font-semibold rounded-md cursor-pointer transition-colors flex items-center gap-1.5 min-h-[28px] sm:min-h-[30px] ${positionTab === key
                  ? "bg-brand-deep text-white shadow-sm"
                  : "text-ink hover:text-brand-deep hover:bg-white"
                  }`}
              >
                <span>{label}</span>
                <span className={`text-[12px] font-normal tabular-nums ${positionTab === key ? "text-white/80" : "text-ink-soft"}`}>({count})</span>
              </button>
            ))}
          </div>
        </div>

        {/* 정렬 + 검색 + 등록 · PC 한줄 · 반응형 2줄 */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <span className="flex items-center gap-2 shrink-0">
            <span className="w-[3px] h-[14px] rounded-full bg-brand-deep" />
            <span className="text-[14px] font-bold text-ink tracking-tight">정렬</span>
          </span>
          <div className="inline-flex p-1 bg-zinc-100 border border-line rounded-lg gap-0.5">
            {(["today", "position", "name"] as const).map((key) => {
              const labels: Record<string, string> = { today: "출근", position: "직군", name: "이름" };
              const isActive = sortBy === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    if (isActive && key !== "today") setSortOrder(prev => prev === "asc" ? "desc" : "asc");
                    else { setSortBy(key); setSortOrder("asc"); }
                  }}
                  className={`px-2.5 sm:px-3 py-1 text-[13px] sm:text-[14px] font-semibold rounded-md cursor-pointer transition-colors flex items-center gap-1 min-h-[28px] sm:min-h-[30px] ${
                    isActive
                      ? "bg-brand-deep text-white shadow-sm"
                      : "text-ink hover:text-brand-deep hover:bg-white"
                  }`}
                >
                  <span>{labels[key]}</span>
                  {isActive && key !== "today" && <span className="text-[11px] font-semibold">{sortOrder === "asc" ? "↑" : "↓"}</span>}
                </button>
              );
            })}
            {sortBy === "none" && typeof window !== "undefined" && localStorage.getItem("megatown_employee_order") && (
              <button
                type="button"
                onClick={async () => {
                  if (await confirm({ message: "드래그 앤 드롭으로 재배치한 순서를 지우고, 원래 기본 순서로 복구하시겠습니까?", danger: true })) {
                    await onResetCustomOrder();
                  }
                }}
                className="px-2.5 py-1 text-[12px] font-semibold text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-md transition-colors cursor-pointer shrink-0 min-h-[28px]"
                title="드래그앤드롭 사용자 지정 순서 초기화"
              >
                순서초기화
              </button>
            )}
          </div>

          {/* 검색 · 직원등록 */}
          <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap justify-end">
            <div className="relative flex-1 min-w-[140px] max-w-[220px]">
              <input
                type="text"
                placeholder="성명으로 조회"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-[14px] font-medium px-3 py-1.5 bg-white border border-line focus:border-brand-deep focus:ring-2 focus:ring-brand-tint rounded-lg focus:outline-none placeholder-ink-soft text-ink transition-colors h-[34px]"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute inset-y-0 right-2 flex items-center text-ink-soft hover:text-ink transition-colors text-[15px]"
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
                className="shrink-0 inline-flex items-center justify-center px-3.5 py-1.5 text-[14px] font-semibold text-white bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] rounded-lg shadow-sm transition-colors cursor-pointer"
              >
                직원 등록
              </button>
            )}
          </div>
        </div>
      </div>
  );
};
