// src/components/SeasonSettingsPage/SeasonSettingsPage.tsx
// 2026-08-12 · 계절 정의 설정 페이지 (관리자 lv≥9 전용)
//   · MyPage 하단에 있던 SeasonRangesEditor 를 [설정] 그룹으로 이동
//   · 공통 SettingsPageShell 사용 · UI 통일
// 2026-08-23 · #193 · 통계 설정 통합 · 계절 정의 + 적정재고 설정 2섹션
//   · 이름 · "계절 정의" → "통계 설정" (route/key 는 season-settings 유지 · BC)
import React, { useCallback } from "react";
import type { AppNavPage } from "../layout/AppNavHeader";
import type { AuthSession } from "../../types";
import { SeasonRangesEditor } from "../MyPage/SeasonRangesEditor";
import { SettingsPageShell } from "../common/SettingsPageShell";
import { CARD_BASE } from "../../styles/tokens";
import { ChartBar } from "@phosphor-icons/react";
import { OptimalStockPeriodSection } from "./OptimalStockPeriodSection";
// 2026-08-26 · #118 · 판매중 상품만 필터 전역 설정 (신규 섹션)
import { SaleActiveOnlySection } from "./SaleActiveOnlySection";

interface Props {
  onBack: () => void;
  authSession: AuthSession | null;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
}

const SeasonSettingsPage: React.FC<Props> = ({ onBack, authSession, onNavigate, onLogout }) => {
  const level = authSession?.level ?? 0;
  const employeeId = authSession?.employeeId;

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
      <SettingsPageShell {...commonShellProps}>
        <div className={`${CARD_BASE} p-5 text-center text-sm text-zinc-500`}>
          관리자(lv 9) 전용 페이지입니다.
        </div>
      </SettingsPageShell>
    );
  }

  return (
    <SettingsPageShell {...commonShellProps}>
      <div className="flex flex-col gap-4">
        {/* 섹션 1 · 계절 정의 */}
        <div className={`${CARD_BASE} p-5`}>
          <SeasonRangesEditor employeeId={employeeId} onToast={noop} />
        </div>
        {/* 섹션 2 · 적정재고 설정 (2026-08-23 · #193 신규) */}
        <OptimalStockPeriodSection />
        {/* 섹션 3 · 판매중 상품만 표시 (2026-08-26 · #118 신규) */}
        <SaleActiveOnlySection />
      </div>
    </SettingsPageShell>
  );
};

export default SeasonSettingsPage;
