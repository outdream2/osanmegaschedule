// src/components/SettingsHubPage/SettingsHubPage.tsx
// 2026-09-07 · 사용자 지시 · 설정 허브 페이지 · 모든 설정 통합 진입점
// 2026-10-11 · 사용자 지시 · 매장 overview 패턴 복제 · 홈 랜딩 톤 전면 재작성
//   · OverviewHero + OverviewInnerTabs · 현황 탭 default + 요약 카드 7개
//   · CARD rounded-[12px] + border-slate-200 + subtle shadow · 좌측 strip accent + 작은 아이콘
//   · 각 카드 클릭 → onNavigate(key) · 매장 메뉴 overview 와 동일 UX

import React, { useEffect, useState } from "react";
import {
  Lock, CalendarBlank, Buildings, Calendar, Gear, Truck, Database, CaretRight,
} from "@phosphor-icons/react";
import { AppNavHeader, type AppNavPage } from "../layout/AppNavHeader";
import type { AuthSession } from "../../types";
import { useActiveNav } from "../../contexts/ActiveNavContext";
import { OverviewHero, OverviewInnerTabs, type OverviewInnerTab } from "../DisplayPage/overviews/OverviewHeader";

interface Props {
  authSession: AuthSession | null;
  onBack: () => void;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
}

interface SettingsCard {
  key: AppNavPage;
  title: string;
  description: string;
  icon: React.ElementType;
  stripTone: string;
  iconColor: string;
}

const CARDS: SettingsCard[] = [
  {
    key: "permissions",
    title: "메뉴 설정",
    description: "페이지별 권한 · 직원 레벨 · 직군 관리 · 사이드바 표시",
    icon: Lock,
    stripTone: "bg-rose-500",
    iconColor: "text-rose-600",
  },
  {
    key: "schedule-settings",
    title: "스케줄 설정",
    description: "직군별 기본 연차일수 · 근무 규칙",
    icon: CalendarBlank,
    stripTone: "bg-amber-500",
    iconColor: "text-amber-600",
  },
  {
    key: "company-info",
    title: "회사·브랜드",
    description: "사업자 정보 · 로고·색상 · 대표 연락처 · 도장 매핑",
    icon: Buildings,
    stripTone: "bg-sky-500",
    iconColor: "text-sky-600",
  },
  {
    key: "season-settings",
    title: "통계 설정",
    description: "계절 정의 · 적정재고 산정 기간 · 판매중 필터",
    icon: Calendar,
    stripTone: "bg-emerald-500",
    iconColor: "text-emerald-600",
  },
  {
    key: "system-settings",
    title: "시스템 설정",
    description: "DB·인증 · AI/OCR · 알림톡 · 이미지 CDN · Web Push",
    icon: Gear,
    stripTone: "bg-slate-500",
    iconColor: "text-slate-600",
  },
  {
    key: "order-settings",
    title: "발주 설정",
    description: "SMTP 이메일 · 테스트 발송 · 발주 규칙·템플릿",
    icon: Truck,
    stripTone: "bg-indigo-500",
    iconColor: "text-indigo-600",
  },
  {
    key: "admin-initial-build",
    title: "ERP 초기 구축",
    description: "ERP 데이터 DRY-RUN Preview · 관리자 전용",
    icon: Database,
    stripTone: "bg-violet-500",
    iconColor: "text-violet-600",
  },
];

type InnerTabKey = "overview";

export const SettingsHubPage: React.FC<Props> = ({ authSession, onBack, onNavigate, onLogout }) => {
  // 2026-10-06 · BREADCRUMB SSOT CLEANUP · activeNav 세팅
  const { setActiveNav } = useActiveNav();
  useEffect(() => {
    setActiveNav({ groupId: "settings", itemKey: "settings-hub" as AppNavPage, subTab: null, nested: null });
  }, [setActiveNav]);

  // 2026-10-11 · 사용자 지시 · 매장 overview 패턴 · 현황 탭 default · 추후 확장 slot
  const [innerTab, setInnerTab] = useState<InnerTabKey>("overview");

  const tabs: ReadonlyArray<OverviewInnerTab<InnerTabKey>> = [
    { k: "overview", label: "현황", tone: "slate", count: CARDS.length },
  ];

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
        {/* OverviewHero · 매장 overview 공식 복제 */}
        <OverviewHero
          tone="slate"
          title="설정 통합 대시보드"
          description="권한·조직·운영·시스템 · 7개 설정 한눈에"
        />

        {/* OverviewInnerTabs · 현황 default · 추후 확장 (예: 로그·변경이력) */}
        <OverviewInnerTabs<InnerTabKey>
          ariaLabel="설정 inner tabs"
          active={innerTab}
          onChange={setInnerTab}
          tabs={tabs}
        />

        {/* 현황 탭 content · 7개 설정 요약 카드 grid */}
        {innerTab === "overview" && (
          <div className="min-w-0 px-4 sm:px-6 pt-1 flex flex-col gap-4">
            {/* 요약 카드 grid · 홈 랜딩 톤 (매장 overview 와 동일) */}
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
              {CARDS.map((c) => {
                const Icon = c.icon;
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => onNavigate?.(c.key)}
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
                      설정 열기
                      <CaretRight size={11} weight="bold" />
                    </div>
                  </button>
                );
              })}
            </section>
          </div>
        )}
      </main>
    </div>
  );
};

export default SettingsHubPage;
