// src/components/schedule-v2/ScheduleV2Page.tsx
// 2026-10-07 · 사용자 지시 · 스케줄 V2 평가용 신규 workspace
//   · 기존 SchedulePage 는 그대로 유지 · 병행 · 사용자가 비교 후 승격 결정
//   · 데이터 소스: canonical employees/schedules/settings · 기존 hook 재사용
//   · UI 쇄신: Line Tabs(월간·주간·일간·직원별) · desktop-first · 모달 깊이 최소화
//   · Phase V2-A: route · menu · header · view tabs · 월간 view (sticky col/date · read-only + edit)
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { CalendarBlank, CalendarCheck, UsersThree, ListBullets } from "@phosphor-icons/react";
import { AppNavHeader, type AppNavPage } from "../layout/AppNavHeader";
import { useActiveNav } from "../../contexts/ActiveNavContext";
import type { AuthSession } from "../../types";
import { PAGE_CONTAINER_CLS } from "../../styles/tokens";
import { MonthScheduleViewV2 } from "./views/MonthScheduleViewV2";

export type ScheduleV2View = "month" | "week" | "day" | "employee";

interface Props {
  authSession: AuthSession | null;
  onBack?: () => void;
  onLogout?: () => void;
  onNavigate?: (page: AppNavPage) => void;
}

const VIEW_TABS: { key: ScheduleV2View; label: string; icon: React.ElementType }[] = [
  { key: "month",    label: "월간",   icon: CalendarBlank },
  { key: "week",     label: "주간",   icon: CalendarCheck },
  { key: "day",      label: "일간",   icon: ListBullets },
  { key: "employee", label: "직원별", icon: UsersThree },
];

export const ScheduleV2Page: React.FC<Props> = ({ authSession, onBack, onLogout, onNavigate }) => {
  // 2026-10-07 · activeNav 등록 · AppNavHeader breadcrumb 정확
  const { setActiveByPage } = useActiveNav();
  useEffect(() => { setActiveByPage("schedule-v2" as AppNavPage); }, [setActiveByPage]);

  // 월간/주간/일간/직원별 전환
  const [view, setView] = useState<ScheduleV2View>("month");

  // 월간/주간이 공유하는 선택월
  const now = useMemo(() => new Date(), []);
  const [year, setYear]   = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1);

  const goMonthDelta = useCallback((delta: number) => {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  }, [year, month]);
  const goToday = useCallback(() => {
    const t = new Date();
    setYear(t.getFullYear());
    setMonth(t.getMonth() + 1);
  }, []);

  return (
    <div className="min-h-screen bg-[#F4F7FA] flex flex-col">
      <AppNavHeader
        activePage={"schedule-v2" as AppNavPage}
        authSession={authSession}
        onBack={onBack}
        onNavigate={onNavigate}
        onLogout={onLogout}
      />

      <main className={`${PAGE_CONTAINER_CLS} flex-1 flex flex-col gap-3 px-4 py-4`}>
        {/* 상단 · 페이지 타이틀 + Line Tabs */}
        <div className="flex flex-col gap-2">
          <h1 className="text-[22px] font-extrabold text-ink leading-tight tracking-tight">스케줄</h1>
          {/* Line Tabs · 공통 UI (현재 공통 TabBar 가 variant line 지원하면 교체 가능) */}
          <nav aria-label="스케줄 뷰" className="flex items-end gap-0 border-b border-line">
            {VIEW_TABS.map(t => {
              const active = view === t.key;
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setView(t.key)}
                  className={`relative inline-flex items-center gap-1.5 px-4 py-2 text-[15px] font-semibold transition cursor-pointer ${
                    active
                      ? "text-brand-deep"
                      : "text-zinc-500 hover:text-ink"
                  }`}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon size={14} weight={active ? "fill" : "regular"} />
                  {t.label}
                  {active && (
                    <span aria-hidden className="absolute inset-x-0 -bottom-px h-[2px] bg-gradient-to-r from-brand-deep via-sky-500 to-brand-deep" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* 뷰 컨텐츠 */}
        <div className="flex-1 min-h-0 flex flex-col">
          {view === "month" && (
            <MonthScheduleViewV2
              year={year}
              month={month}
              onMonthDelta={goMonthDelta}
              onToday={goToday}
              authSession={authSession}
            />
          )}
          {view !== "month" && (
            <PlaceholderView view={view} />
          )}
        </div>
      </main>
    </div>
  );
};

const PlaceholderView: React.FC<{ view: ScheduleV2View }> = ({ view }) => {
  const label = view === "week" ? "주간" : view === "day" ? "일간" : "직원별";
  return (
    <div className="flex-1 flex items-center justify-center py-16">
      <div className="text-center">
        <div className="text-[16px] font-semibold text-ink mb-2">{label} 뷰 준비 중</div>
        <div className="text-[13px] text-ink-soft">
          Phase V2-{view === "week" ? "B" : view === "day" ? "C" : "D"} 에서 구현 예정입니다.
        </div>
      </div>
    </div>
  );
};

export default ScheduleV2Page;
