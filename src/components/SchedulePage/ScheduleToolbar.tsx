// src/components/SchedulePage/ScheduleToolbar.tsx
// 2026-08-22 · #framework-4 · SchedulePage 분리 · 월 네비게이션 + 관리자 액션 툴바
import React from "react";
import { ChevronLeft, ChevronRight, Edit, Lock, Layers } from "lucide-react";
import { MonthlySummary } from "../../types";

interface ScheduleToolbarProps {
  currentYear: number;
  currentMonth: number;
  isAdmin: boolean;
  editMode: boolean;
  isMonthLocked: boolean;
  isLockLoading: boolean;
  isCopying: boolean;
  showSummary: "hidden" | "summary" | "labor";
  currentSummaryList: MonthlySummary[];
  typeHoursMap: Record<string, string>;
  pendingScrollDateRef: React.MutableRefObject<string | null>;
  scrollTableRef: React.RefObject<HTMLDivElement | null>;
  nameThRef: React.RefObject<HTMLTableCellElement | null>;
  suppressScrollRef: React.MutableRefObject<boolean>;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onToggleEditMode: () => void;
  onToggleMonthLock: () => void;
  onCopyFromPreviousMonth: () => void;
  onSetShowSummary: (v: "hidden" | "summary" | "labor") => void;
  onCreateEmployee: () => void;
  onScrollToToday: () => void;
}

export const ScheduleToolbar: React.FC<ScheduleToolbarProps> = ({
  currentYear, currentMonth,
  isAdmin, editMode, isMonthLocked, isLockLoading, isCopying,
  showSummary, currentSummaryList, typeHoursMap,
  pendingScrollDateRef, scrollTableRef, nameThRef, suppressScrollRef,
  onPrevMonth, onNextMonth, onToggleEditMode, onToggleMonthLock,
  onCopyFromPreviousMonth, onSetShowSummary, onCreateEmployee, onScrollToToday,
}) => {
  const today = new Date();
  const isThisMonth = today.getFullYear() === currentYear && today.getMonth() + 1 === currentMonth;
  const todaySummary = isThisMonth ? currentSummaryList.find(s => s.day === today.getDate()) : null;
  const firstOfMonth = `${currentYear}-${String(currentMonth).padStart(2, "0")}-01`;

  const handleMonthLabelClick = () => {
    pendingScrollDateRef.current = firstOfMonth;
    requestAnimationFrame(() => {
      const el = scrollTableRef.current;
      if (!el) return;
      const targetEl = el.querySelector<HTMLElement>(`[title="${firstOfMonth} 타임라인 보기"]`);
      if (!targetEl) return;
      const elRect = el.getBoundingClientRect();
      const targetRect = targetEl.getBoundingClientRect();
      const nameWidth = nameThRef.current?.getBoundingClientRect().width ?? 96;
      suppressScrollRef.current = true;
      el.scrollLeft = Math.max(0, el.scrollLeft + (targetRect.left - elRect.left) - nameWidth);
      setTimeout(() => { suppressScrollRef.current = false; }, 300);
    });
  };

  return (
    <div className="bg-white border border-line border-b-0 rounded-t-xl py-1.5 sm:py-2 flex flex-col gap-1.5 px-2.5 sm:px-5 shrink-0 shadow-sm">
      {/* 1행: 월 네비게이션 + 오늘 요약 + 범례 */}
      <div className="flex items-center gap-x-3 gap-y-1.5 flex-wrap min-w-0">
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onPrevMonth} className="w-9 h-9 flex items-center justify-center hover:bg-brand-tint text-ink-soft hover:text-brand-deep rounded-lg transition-colors cursor-pointer" title="이전 달">
            <ChevronLeft size={18} />
          </button>
          <button
            key={`${currentYear}-${currentMonth}`}
            title="1일로 이동"
            onClick={handleMonthLabelClick}
            className="font-extrabold tracking-tight text-ink text-[17px] sm:text-[16px] px-2 min-w-[100px] sm:min-w-[90px] text-center animate-in fade-in zoom-in-95 duration-200 hover:text-brand-deep cursor-pointer rounded-lg hover:bg-brand-tint transition-colors tabular-nums"
          >
            {currentYear}년 {String(currentMonth).padStart(2, "0")}월
          </button>
          <button onClick={onNextMonth} className="w-9 h-9 flex items-center justify-center hover:bg-brand-tint text-ink-soft hover:text-brand-deep rounded-lg transition-colors cursor-pointer" title="다음 달">
            <ChevronRight size={18} />
          </button>
          {todaySummary && (
            <span className="ml-2 flex items-baseline gap-2.5 pl-3 border-l border-line text-[15px] font-semibold tabular-nums">
              <span className="text-ink-soft">약사 <b className="text-ink font-bold">{todaySummary.pharmacistCount}</b></span>
              <span className="text-ink-soft">사원 <b className="text-ink font-bold">{todaySummary.staffCount}</b></span>
              <span className="text-ink-soft">기타 <b className="text-ink font-bold">{todaySummary.otherCount}</b></span>
              <span className="text-brand-deep font-bold">총 {todaySummary.totalCount}명</span>
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-3 text-[15px] font-semibold flex-wrap min-w-0">
          <span className="text-yellow-600">오픈 <span className="text-yellow-700/70 tabular-nums font-normal">{typeHoursMap["오픈"] || ""}</span></span>
          <span className="text-emerald-600">마감 <span className="text-emerald-700/70 tabular-nums font-normal">{typeHoursMap["마감"] || ""}</span></span>
          {typeHoursMap["오픈마감"] && <span className="text-sky-600">오픈마감 <span className="text-sky-700/70 tabular-nums font-normal">{typeHoursMap["오픈마감"]}</span></span>}
          <span className="text-rose-600">휴무</span>
          <span className="text-amber-600">월차</span>
        </div>
      </div>

      {/* 2행: 직원등록·오늘·편집·확정·전월복사·인건비 */}
      <div className="flex items-center gap-x-2 flex-nowrap justify-start min-w-0">
        {isAdmin && (
          <button type="button" onClick={onCreateEmployee} title="새 직원 등록"
            className="shrink-0 inline-flex items-center justify-center px-3.5 py-1.5 text-[14px] sm:text-[15px] font-semibold text-white bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] rounded-lg shadow-sm transition-colors cursor-pointer">
            직원 등록
          </button>
        )}
        {isAdmin && (
          <button type="button" onClick={onScrollToToday} title="오늘 날짜로 이동"
            className="flex items-center px-3 py-1.5 text-[14px] sm:text-[15px] font-semibold rounded-lg border border-line bg-white hover:border-brand-deep hover:text-brand-deep text-ink transition-colors cursor-pointer shrink-0">
            오늘
          </button>
        )}
        {isAdmin && (
          <div className="flex items-center gap-1.5 shrink-0">
            {!isMonthLocked && (
              <button onClick={onToggleEditMode}
                title={editMode ? "편집 모드 종료" : "편집 모드 활성화 — 셀 클릭으로 스케줄 변경 가능"}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-[14px] sm:text-[15px] font-semibold rounded-lg border transition-colors cursor-pointer ${editMode ? "border-brand-deep bg-brand-deep text-white shadow-sm" : "border-line bg-white text-ink hover:border-brand-deep hover:text-brand-deep"}`}>
                {editMode
                  ? <><span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /><span>편집중</span></>
                  : <><Edit size={13} strokeWidth={2.2} /><span>편집</span></>
                }
              </button>
            )}
            <button onClick={onToggleMonthLock} disabled={isLockLoading}
              title={isMonthLocked ? `${currentMonth}월 확정 해제` : `${currentMonth}월 스케줄 확정 (이후 수정 불가)`}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[14px] sm:text-[15px] font-semibold rounded-lg border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${isMonthLocked ? "border-amber-500 bg-amber-500 text-white shadow-sm" : "border-line bg-white text-ink hover:border-brand-deep hover:text-brand-deep"}`}>
              {isLockLoading
                ? <div className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                : <Lock size={13} strokeWidth={2.2} />
              }
              <span>{isMonthLocked ? "확정해제" : "확정"}</span>
            </button>
            {!isMonthLocked && (
              <button onClick={onCopyFromPreviousMonth} disabled={isCopying}
                title={`${currentMonth === 1 ? 12 : currentMonth - 1}월 스케줄을 ${currentMonth}월로 복사`}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[14px] sm:text-[15px] font-semibold rounded-lg border border-line bg-white text-ink hover:border-brand-deep hover:text-brand-deep transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
                {isCopying
                  ? <><div className="w-3.5 h-3.5 rounded-full border-2 border-brand-deep border-t-transparent animate-spin" /><span>복사 중</span></>
                  : <><Layers size={13} strokeWidth={2.2} /><span>전월복사</span></>
                }
              </button>
            )}
          </div>
        )}
        {isAdmin && (
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => onSetShowSummary(showSummary === "labor" ? "hidden" : "labor")}
              title="월별 합계(근무일수/시간) + 인건비 표시 토글"
              className={`px-3 py-1.5 text-[14px] sm:text-[15px] rounded-lg font-semibold border transition-colors cursor-pointer ${showSummary === "labor" ? "bg-brand-deep text-white border-brand-deep shadow-sm" : "bg-white text-ink border-line hover:border-brand-deep hover:text-brand-deep"}`}>
              인건비(hr)
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
