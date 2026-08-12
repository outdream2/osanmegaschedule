// src/components/SeasonSettingsPage/SeasonSettingsPage.tsx
// 2026-08-12 · 계절 정의 설정 페이지 (관리자 lv≥9 전용)
//   · MyPage 하단에 있던 SeasonRangesEditor 를 [설정] 그룹으로 이동
//   · 공통 SettingsPageShell 사용 · UI 통일
import React, { useCallback } from "react";
import type { AppNavPage } from "../layout/AppNavHeader";
import type { AuthSession } from "../../types";
import { SeasonRangesEditor } from "../MyPage/SeasonRangesEditor";
import { SettingsPageShell } from "../common/SettingsPageShell";
import { CARD_BASE } from "../../styles/tokens";
import { Sun } from "@phosphor-icons/react";

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
    icon: Sun,
    iconColor: "text-amber-500",
    title: "계절 정의",
    description: "봄·여름·가을·겨울 · 각 계절에 해당하는 월(들)을 선택합니다. 재고·판매 조회 시 season 필터에 사용됩니다. 관리자(lv 9) 전용.",
  };

  if (level < 9 || !employeeId) {
    return (
      <SettingsPageShell {...commonShellProps}>
        <div className={`${CARD_BASE} p-5 text-center text-sm text-slate-500`}>
          관리자(lv 9) 전용 페이지입니다.
        </div>
      </SettingsPageShell>
    );
  }

  return (
    <SettingsPageShell {...commonShellProps}>
      <div className={`${CARD_BASE} p-5`}>
        <SeasonRangesEditor employeeId={employeeId} onToast={noop} />
      </div>
    </SettingsPageShell>
  );
};

export default SeasonSettingsPage;
