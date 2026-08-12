// src/components/SeasonSettingsPage/SeasonSettingsPage.tsx
// 2026-08-12 · 계절 정의 설정 페이지 (관리자 lv≥9 전용)
//   · MyPage 하단에 있던 SeasonRangesEditor 를 [설정] 그룹으로 이동
//   · 봄/여름/가을/겨울 · 각 계절 월 정의 편집
import React, { useCallback } from "react";
import { AppNavHeader, type AppNavPage } from "../layout/AppNavHeader";
import type { AuthSession } from "../../types";
import { SeasonRangesEditor } from "../MyPage/SeasonRangesEditor";
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

  if (level < 9 || !employeeId) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <AppNavHeader activePage={"branding" as AppNavPage} authSession={authSession} onBack={onBack} onNavigate={onNavigate} onLogout={onLogout} />
        <main className="flex-1 flex items-center justify-center text-sm text-slate-500">
          관리자(lv 9) 전용 페이지입니다.
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <AppNavHeader activePage={"branding" as AppNavPage} authSession={authSession} onBack={onBack} onNavigate={onNavigate} onLogout={onLogout} />
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-5">
        <div className={`${CARD_BASE} p-5 flex flex-col gap-4`}>
          <div>
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Sun size={18} className="text-amber-500" />
              계절 정의
            </h2>
            <p className="text-[11px] text-slate-500 mt-1">
              봄·여름·가을·겨울 · 각 계절에 해당하는 월(들)을 선택합니다. 재고·판매 조회 시 season 필터에 사용됩니다.
            </p>
          </div>
          <SeasonRangesEditor employeeId={employeeId} onToast={noop} />
        </div>
      </main>
    </div>
  );
};

export default SeasonSettingsPage;
