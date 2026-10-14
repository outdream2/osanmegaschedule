// src/components/SettingsHubPage/SettingsHubPage.tsx
// 2026-09-07 · 설정 허브 페이지 · 모든 설정 통합 진입점
// 2026-10-11 · 매장 overview 패턴 복제 · 홈 랜딩 톤 · 7 card grid
// 2026-10-13 · #18 Phase 1 · vendor-overview 패턴 복제 · 7 cards → 8 inner tabs (현황+7)
//   · 현황 탭 · 기존 7 cards grid (summary dashboard · 각 카드 클릭 → 해당 inner tab 이동)
//   · 각 설정 탭 · 기존 페이지 lazy embed (BusinessManagePage > PermissionsPage 패턴)
//   · Phase 1 범위 · permissions 1개만 실제 embed · 나머지 6개는 "준비 중" placeholder + 원 페이지로 이동 버튼
//   · Phase 2 에서 나머지 6 페이지 embedded prop 지원 + lazy embed 완성 예정

import React, { useEffect, useState, Suspense } from "react";
import {
  Lock, CalendarBlank, Buildings, Calendar, Gear, Truck, Database, CaretRight,
} from "@phosphor-icons/react";
import { AppNavHeader, type AppNavPage } from "../layout/AppNavHeader";
import type { AuthSession } from "../../types";
import { useActiveNav } from "../../contexts/ActiveNavContext";
import { OverviewHero, OverviewInnerTabs, type OverviewInnerTab } from "../DisplayPage/overviews/OverviewHeader";
import { Spinner } from "../common/Spinner";

// 2026-10-13 · #18 Phase 2 · 7개 설정 페이지 전부 embedded lazy embed
const PermissionsPageLazy = React.lazy(() =>
  import("../PermissionsPage/PermissionsPage").then(m => ({ default: m.PermissionsPage }))
);
const ScheduleSettingsPageLazy = React.lazy(() =>
  import("../ScheduleSettingsPage/ScheduleSettingsPage")
);
const CompanyInfoSettingsPageLazy = React.lazy(() =>
  import("../CompanyInfoSettingsPage/CompanyInfoSettingsPage")
);
const SeasonSettingsPageLazy = React.lazy(() =>
  import("../SeasonSettingsPage/SeasonSettingsPage")
);
const SystemSettingsPageLazy = React.lazy(() =>
  import("../SystemSettingsPage/SystemSettingsPage")
);
const OrderSettingsPageLazy = React.lazy(() =>
  import("../OrderSettingsPage/OrderSettingsPage").then(m => ({ default: m.OrderSettingsPage }))
);
const AdminInitialBuildPageLazy = React.lazy(() =>
  import("../AdminInitialBuildPage/AdminInitialBuildPage")
);

interface Props {
  authSession: AuthSession | null;
  onBack: () => void;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
}

interface SettingsCard {
  key: InnerTabKey;
  // 원 페이지 라우트 (Phase 1 placeholder "원 페이지로 이동" 버튼 target)
  pageRoute: AppNavPage;
  title: string;
  description: string;
  icon: React.ElementType;
  stripTone: string;
  iconColor: string;
  tone: "slate" | "amber" | "sky" | "emerald" | "indigo" | "violet";
}

type InnerTabKey =
  | "overview"
  | "permissions"
  | "schedule-settings"
  | "company-info"
  | "season-settings"
  | "system-settings"
  | "order-settings"
  | "admin-initial-build";

const CARDS: SettingsCard[] = [
  {
    key: "permissions",
    pageRoute: "permissions",
    title: "메뉴 설정",
    description: "페이지별 권한 · 직원 레벨 · 직군 관리 · 모바일 가시성",
    icon: Lock,
    stripTone: "bg-rose-500",
    iconColor: "text-rose-600",
    tone: "slate",
  },
  {
    key: "schedule-settings",
    pageRoute: "schedule-settings",
    title: "스케줄 설정",
    description: "직군별 기본 휴가일수 · 근무 규칙",
    icon: CalendarBlank,
    stripTone: "bg-amber-500",
    iconColor: "text-amber-600",
    tone: "amber",
  },
  {
    key: "company-info",
    pageRoute: "company-info",
    title: "회사·브랜드",
    description: "사업자 정보 · 로고·색상 · 대표 연락처 · 도장 매핑",
    icon: Buildings,
    stripTone: "bg-sky-500",
    iconColor: "text-sky-600",
    tone: "sky",
  },
  {
    key: "season-settings",
    pageRoute: "season-settings",
    title: "통계 설정",
    description: "계절 정의 · 적정재고 산정 기간 · 판매중 필터",
    icon: Calendar,
    stripTone: "bg-emerald-500",
    iconColor: "text-emerald-600",
    tone: "emerald",
  },
  {
    key: "system-settings",
    pageRoute: "system-settings",
    title: "시스템 설정",
    description: "DB·인증 · AI/OCR · 알림톡 · 이미지 CDN · Web Push",
    icon: Gear,
    stripTone: "bg-slate-500",
    iconColor: "text-slate-600",
    tone: "slate",
  },
  {
    key: "order-settings",
    pageRoute: "order-settings",
    title: "발주 설정",
    description: "SMTP 이메일 · 테스트 발송 · 발주 규칙·템플릿",
    icon: Truck,
    stripTone: "bg-indigo-500",
    iconColor: "text-indigo-600",
    tone: "indigo",
  },
  {
    key: "admin-initial-build",
    pageRoute: "admin-initial-build",
    title: "ERP 초기 구축",
    description: "ERP 데이터 DRY-RUN Preview · 관리자 전용",
    icon: Database,
    stripTone: "bg-violet-500",
    iconColor: "text-violet-600",
    tone: "violet",
  },
];

export const SettingsHubPage: React.FC<Props> = ({ authSession, onBack, onNavigate, onLogout }) => {
  const { setActiveNav } = useActiveNav();
  useEffect(() => {
    setActiveNav({ groupId: "settings", itemKey: "settings-hub" as AppNavPage, subTab: null, nested: null });
  }, [setActiveNav]);

  const [innerTab, setInnerTab] = useState<InnerTabKey>("overview");

  const tabs: ReadonlyArray<OverviewInnerTab<InnerTabKey>> = [
    { k: "overview", label: "현황", tone: "slate", count: CARDS.length },
    { k: "permissions",         label: "메뉴 설정",     tone: "rose",    count: null },
    { k: "schedule-settings",   label: "스케줄 설정",   tone: "amber",   count: null },
    { k: "company-info",        label: "회사·브랜드",   tone: "sky",     count: null },
    { k: "season-settings",     label: "통계 설정",     tone: "emerald", count: null },
    { k: "system-settings",     label: "시스템 설정",   tone: "slate",   count: null },
    { k: "order-settings",      label: "발주 설정",     tone: "indigo",  count: null },
    { k: "admin-initial-build", label: "ERP 초기 구축", tone: "violet",  count: null },
  ];

  // 2026-10-13 · #18 Phase 2 · 7개 설정 전부 embed · placeholder 제거

  return (
    <div className="min-h-screen bg-[#F4F7FA] flex flex-col">
      <AppNavHeader
        activePage={"settings-hub" as AppNavPage}
        authSession={authSession}
        onBack={onBack}
        onNavigate={onNavigate}
        onLogout={onLogout}
      />
      <main className="flex-1 max-w-[1360px] w-[90%] mx-auto flex flex-col gap-3 md:gap-4 pb-6">
        <OverviewHero
          tone="slate"
          title="설정"
          description="현황판 → 각 섹션 상세로 이동"
        />

        <OverviewInnerTabs<InnerTabKey>
          ariaLabel="설정 inner tabs"
          active={innerTab}
          onChange={setInnerTab}
          tabs={tabs}
        />

        {/* 현황 탭 · 7개 설정 요약 카드 grid (각 카드 클릭 → 해당 inner tab 이동) */}
        {innerTab === "overview" && (
          <div className="min-w-0 px-4 sm:px-6 pt-1 flex flex-col gap-4">
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
              {CARDS.map((c) => {
                const Icon = c.icon;
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setInnerTab(c.key)}
                    className="group bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4 text-left hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 transition-all cursor-pointer flex flex-col gap-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-[3px] h-[14px] ${c.stripTone} rounded-full shrink-0`} aria-hidden />
                      <Icon size={14} className={c.iconColor} weight="fill" />
                      <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight flex-1 min-w-0 truncate">
                        {c.title}
                      </h3>
                      <CaretRight size={13} className="text-slate-300 group-hover:text-slate-500 transition-colors shrink-0" />
                    </div>
                    <p className="text-[13px] text-slate-500 leading-relaxed line-clamp-2 pl-[11px]">
                      {c.description}
                    </p>
                    <div className="mt-auto pl-[11px] text-[12px] text-slate-400 font-medium flex items-center gap-1 group-hover:text-slate-600 transition-colors">
                      섹션 열기
                      <CaretRight size={11} weight="bold" />
                    </div>
                  </button>
                );
              })}
            </section>
          </div>
        )}

        {/* 2026-10-13 · #18 Phase 2 · 7개 설정 전부 lazy embed */}
        {innerTab !== "overview" && (
          <div className="min-w-0 px-4 sm:px-6 pt-1">
            <Suspense fallback={<div className="flex items-center justify-center py-16"><Spinner label="로딩 중..." size={16} tone="brand" /></div>}>
              {innerTab === "permissions" && (
                <PermissionsPageLazy
                  authSession={authSession}
                  onBack={onBack}
                  onLogout={onLogout ?? (() => { /* noop */ })}
                  onNavigate={onNavigate}
                  embedded
                />
              )}
              {innerTab === "schedule-settings" && (
                <ScheduleSettingsPageLazy
                  authSession={authSession}
                  onBack={onBack}
                  onLogout={onLogout}
                  onNavigate={onNavigate}
                  embedded
                />
              )}
              {innerTab === "company-info" && (
                <CompanyInfoSettingsPageLazy
                  authSession={authSession}
                  onBack={onBack}
                  onLogout={onLogout}
                  onNavigate={onNavigate}
                  embedded
                />
              )}
              {innerTab === "season-settings" && (
                <SeasonSettingsPageLazy
                  authSession={authSession}
                  onBack={onBack}
                  onLogout={onLogout}
                  onNavigate={onNavigate}
                  embedded
                />
              )}
              {innerTab === "system-settings" && (
                <SystemSettingsPageLazy
                  authSession={authSession}
                  onBack={onBack}
                  onLogout={onLogout}
                  onNavigate={onNavigate}
                  embedded
                />
              )}
              {innerTab === "order-settings" && (
                <OrderSettingsPageLazy
                  authSession={authSession}
                  onBack={onBack}
                  onLogout={onLogout}
                  onNavigate={onNavigate}
                  embedded
                />
              )}
              {innerTab === "admin-initial-build" && (
                <AdminInitialBuildPageLazy
                  authSession={authSession}
                  onBack={onBack}
                  onLogout={onLogout}
                  onNavigate={onNavigate}
                  embedded
                />
              )}
            </Suspense>
          </div>
        )}
      </main>
    </div>
  );
};

export default SettingsHubPage;
