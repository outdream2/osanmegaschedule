// src/components/SeasonSettingsPage/SeasonSettingsPage.tsx
// 2026-08-12 · 계절 정의 설정 페이지 (관리자 lv≥9 전용)
//   · MyPage 하단에 있던 SeasonRangesEditor 를 [설정] 그룹으로 이동
//   · 공통 SettingsPageShell 사용 · UI 통일
// 2026-08-23 · #193 · 통계 설정 통합 · 계절 정의 + 적정재고 설정 2섹션
//   · 이름 · "계절 정의" → "통계 설정" (route/key 는 season-settings 유지 · BC)
import React, { useCallback, useState } from "react";
import type { AppNavPage } from "../layout/AppNavHeader";
import type { AuthSession } from "../../types";
import { SeasonRangesEditor } from "../MyPage/SeasonRangesEditor";
import { SettingsPageShell } from "../common/SettingsPageShell";
import { CARD_BASE } from "../../styles/tokens";
// 2026-08-29 · #122 P2 · SectionCard 프리미티브 (관리자 아닌 경우 · 안내만)
import { SectionCard } from "../common/SectionCard";
import { ChartBar, Lock, Snowflake, Package, Sparkle } from "@phosphor-icons/react";
import { OptimalStockPeriodSection } from "./OptimalStockPeriodSection";
// 2026-08-26 · #118 · 판매중 상품만 필터 전역 설정 (신규 섹션)
import { SaleActiveOnlySection } from "./SaleActiveOnlySection";
// 2026-09-13 · #88 · 통계설정 · 탭메뉴로 변경 · TabBar 프리미티브
import { TabBar, type TabDef } from "../common/TabBar";
// 2026-09-13 · #52·#54 · 이벤트 관리 UI 신규
import { EventsSection } from "./EventsSection";

interface Props {
  onBack: () => void;
  authSession: AuthSession | null;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
}

// 2026-09-13 · #88 · 탭 정의 · #52·#54 · 이벤트 관리 탭 추가
type StatsTab = "season" | "filters" | "events";
const STATS_TABS: TabDef<StatsTab>[] = [
  { key: "season",  label: "계절 정의",       icon: Snowflake, color: "sky" },
  { key: "filters", label: "재고·판매 필터",  icon: Package,   color: "emerald" },
  { key: "events",  label: "이벤트 관리",     icon: Sparkle,   color: "violet" },
];

const SeasonSettingsPage: React.FC<Props> = ({ onBack, authSession, onNavigate, onLogout }) => {
  const level = authSession?.level ?? 0;
  const employeeId = authSession?.employeeId;
  // 2026-09-13 · #88 · 활성 탭 · localStorage 유지
  const [statsTab, setStatsTab] = useState<StatsTab>(() => {
    try {
      const raw = localStorage.getItem("statsSettings.tab");
      if (raw === "filters" || raw === "events") return raw as StatsTab;
      return "season";
    } catch { return "season"; }
  });
  const handleTabChange = useCallback((k: StatsTab) => {
    setStatsTab(k);
    try { localStorage.setItem("statsSettings.tab", k); } catch { /* silent */ }
  }, []);

  const noop = useCallback(() => { /* toast 자리 · 필요 시 추후 */ }, []);

  const commonShellProps = {
    activePage: "season-settings" as AppNavPage,
    authSession, onBack, onNavigate, onLogout,
    icon: ChartBar,
    iconColor: "text-brand-deep",
    title: "통계 설정",
    description: "통계·재고 관련 설정 · 계절 정의 (봄·여름·가을·겨울) + 적정재고 계산 기준. 관리자(lv 9) 전용.",
  };

  if (level < 9 || !employeeId) {
    return (
      // 2026-08-26 · data-scope 로 페이지 전체 감싸기 (헤더+콘텐츠 모두 +3)
      <div data-scope="stats-settings">
        <SettingsPageShell {...commonShellProps}>
          {/* 2026-08-29 · #122 P2 · 접근 제한 안내 · SectionCard (danger tone) */}
          <SectionCard
            title="접근 권한 필요"
            icon={<Lock size={18} />}
            tone="danger"
            description="이 페이지는 관리자(lv 9) 전용입니다."
          >
            <div className="text-[16px] text-zinc-500 text-center py-4">
              관리자 계정으로 로그인 후 · 다시 시도해주세요.
            </div>
          </SectionCard>
        </SettingsPageShell>
      </div>
    );
  }

  return (
    // 2026-08-26 · 사용자 지시 · 통계설정 · 폰트 +3 · Shell 전체 감쌈 (헤더 포함)
    <div data-scope="stats-settings">
      <SettingsPageShell {...commonShellProps}>
        {/* 2026-09-13 · #88 · 통계설정 · 탭메뉴로 변경 · TabBar level=2 · 계절 정의 · 재고·판매 필터 */}
        <TabBar
          level={2}
          activeKey={statsTab}
          onSelect={handleTabChange}
          tabs={STATS_TABS}
        />
        <div className="flex flex-col gap-4 mt-4">
          {statsTab === "season" && (
            <div className={`${CARD_BASE} p-5`}>
              <SeasonRangesEditor employeeId={employeeId} onToast={noop} />
            </div>
          )}
          {statsTab === "filters" && (
            <section
              className="bg-white rounded-2xl border border-line overflow-hidden"
              style={{ boxShadow: "0 1px 2px rgba(10,46,74,0.04), 0 4px 12px -4px rgba(10,46,74,0.06)" }}
            >
              <div className="h-1 bg-gradient-to-r from-brand-deep via-emerald-500 to-teal-500" />
              <div className="p-5">
                <h3 className="text-[21px] font-extrabold text-ink tracking-tight leading-tight mb-1">재고·판매 필터</h3>
                <p className="text-[16px] text-ink-soft leading-relaxed mb-4">
                  적정재고 산정 기간 · 판매중 상품 필터 · 통합 관리
                </p>
                <div className="flex flex-col gap-4">
                  <div className="rounded-xl border border-line overflow-hidden">
                    <OptimalStockPeriodSection />
                  </div>
                  <div className="rounded-xl border border-line overflow-hidden">
                    <SaleActiveOnlySection />
                  </div>
                </div>
              </div>
            </section>
          )}
          {/* 2026-09-13 · #52·#54 · 이벤트 관리 탭 */}
          {statsTab === "events" && (
            <section
              className="bg-white rounded-2xl border border-line overflow-hidden"
              style={{ boxShadow: "0 1px 2px rgba(10,46,74,0.04), 0 4px 12px -4px rgba(10,46,74,0.06)" }}
            >
              <div className="h-1 bg-gradient-to-r from-violet-500 via-pink-500 to-rose-500" />
              <div className="p-5">
                <h3 className="text-[21px] font-extrabold text-ink tracking-tight leading-tight mb-1">이벤트 관리</h3>
                <p className="text-[16px] text-ink-soft leading-relaxed mb-4">
                  계절·명절·수험생·커스텀 이벤트 · 발주필요 판매추천에 자동 반영
                </p>
                <EventsSection />
              </div>
            </section>
          )}
        </div>
      </SettingsPageShell>
    </div>
  );
};

export default SeasonSettingsPage;
