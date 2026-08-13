// src/components/common/MobileOnlyGate.tsx
// 2026-08-12 · Phase 6 · 페이지별 모바일 최소 레벨 게이트
//   · 모바일 (isMobile=true) · userLevel < minLevel 인 사용자에게 · "PC 전용 화면입니다" 안내
//   · PC (isMobile=false) · 무조건 pass
//   · pageKey="landing" 또는 minLevel=0 · 무조건 pass (모두 허용)
//   · 사용법: <MobileOnlyGate pageKey="display" authSession={authSession}> ... </MobileOnlyGate>
import React from "react";
import { Monitor } from "lucide-react";
import type { AuthSession } from "../../types";
import { useIsMobile } from "../../hooks/use-mobile";
import { useMobilePageLevel } from "../../hooks/useMobilePageLevel";
import { deriveUserLevel } from "../layout/sideNavGroups";

interface MobileOnlyGateProps {
  pageKey: string;
  authSession: AuthSession | null;
  children: React.ReactNode;
}

export const MobileOnlyGate: React.FC<MobileOnlyGateProps> = ({
  pageKey,
  authSession,
  children,
}) => {
  const isMobile = useIsMobile();
  const { getMinLevel } = useMobilePageLevel();

  // PC · 무조건 통과
  if (!isMobile) return <>{children}</>;

  // landing 은 · 누구나 · 예외 없이 통과 (로그인 화면 · 접근 차단 금지)
  if (pageKey === "landing") return <>{children}</>;

  const minLevel = getMinLevel(pageKey);
  if (minLevel <= 0) return <>{children}</>;

  const userLevel = deriveUserLevel(authSession);
  if (userLevel >= minLevel) return <>{children}</>;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 p-8">
      <div className="max-w-sm text-center space-y-3">
        <div className="w-16 h-16 mx-auto rounded-full bg-zinc-100 flex items-center justify-center">
          <Monitor size={32} className="text-zinc-400" />
        </div>
        <h1 className="text-lg font-bold text-zinc-800">PC 전용 화면입니다</h1>
        <p className="text-sm text-zinc-500">
          이 페이지는 데스크탑 브라우저에서 접근해주세요.
        </p>
      </div>
    </div>
  );
};

export default MobileOnlyGate;
