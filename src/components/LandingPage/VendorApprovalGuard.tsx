// src/components/LandingPage/VendorApprovalGuard.tsx
// 2026-10-06 · 공급사 승인 접근 fix · URL 직접 접근 차단 공통 guard
//   · 재고확인·발주이력 공통 사용 (사용자 지시 규칙 [5])
//   · vendor session + approval_status === "approved" 만 통과
//   · 미승인 → 메시지 + "공급사 정보로 이동" 액션
//   · loading 중 → spinner (사용자 지시 규칙 [10])
//   · admin/staff/manager 는 통과 (role gate · SSOT · vendorSelf.approval_status)
// 2026-09-14 재강조 · 안정성·효율·프레임워크화

import React, { useMemo } from "react";
import { useVendors } from "../../hooks/useVendors";
import type { AuthSession } from "../../types";
import { Spinner } from "../common/Spinner";
import { Button } from "../common/Button";
import { AppNavHeader, type AppNavPage } from "../layout/AppNavHeader";
import { PAGE_CONTAINER_CLS } from "../../styles/tokens";

interface Props {
  authSession: AuthSession | null;
  activePage: AppNavPage;
  onBack: () => void;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
  // 사이드바 공급사 정보 모달 신호 (open-vendor-self) · 랜딩 복귀 후 자동 모달 오픈
  children: React.ReactNode;
}

type VendorApprovalState = "loading" | "approved" | "requested" | "rejected" | "needs-info";

export const VendorApprovalGuard: React.FC<Props> = ({
  authSession,
  activePage,
  onBack,
  onNavigate,
  onLogout,
  children,
}) => {
  const isVendor = authSession?.role === "vendor";
  const { vendors, loading } = useVendors();

  const vendorSelf = useMemo(() => {
    if (!isVendor || !authSession) return null;
    return vendors.find((v: any) => v.id === authSession.employeeId) ?? null;
  }, [isVendor, authSession, vendors]);

  const state: VendorApprovalState = useMemo(() => {
    if (!isVendor) return "approved"; // admin/staff · gate 없음
    if (loading && !vendorSelf) return "loading";
    const status = String((vendorSelf as any)?.approval_status ?? "").toLowerCase();
    if (status === "approved") return "approved";
    if (status === "requested" || status === "pending") return "requested";
    if (status === "rejected") return "rejected";
    return "needs-info";
  }, [isVendor, loading, vendorSelf]);

  if (state === "approved") return <>{children}</>;

  // ─── 미승인 안내 화면 ─────────────────────────────────────────────────
  const message =
    state === "loading"    ? ""
    : state === "requested"  ? "공급사 승인 요청이 처리 중입니다."
    : state === "rejected"   ? "공급사 승인이 완료되지 않았습니다. 공급사 정보를 확인한 후 다시 승인 요청해주세요."
    :                          "공급사 정보를 입력하고 승인을 요청해주세요.";

  const goToVendorInfo = () => {
    // 랜딩으로 돌아가서 공급사 정보 모달 오픈 신호 송신 (LandingPage 가 소비)
    try {
      localStorage.setItem("landing.action", "open-vendor-self");
      window.dispatchEvent(new CustomEvent("landing:action", { detail: "open-vendor-self" }));
    } catch { /* silent */ }
    onBack();
  };

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50">
      <AppNavHeader
        activePage={activePage}
        authSession={authSession}
        onBack={onBack}
        onNavigate={onNavigate}
        onLogout={onLogout}
      />
      <div className={`${PAGE_CONTAINER_CLS} max-w-3xl flex-1 flex items-center justify-center px-4 sm:px-6 py-10`}>
        {state === "loading" ? (
          <div className="flex flex-col items-center gap-4">
            <Spinner size={18} tone="brand" />
            <div className="text-[16px] text-zinc-600 font-semibold">공급사 정보 확인 중...</div>
          </div>
        ) : (
          <div className="w-full max-w-xl bg-white border-2 border-amber-200 rounded-2xl shadow-sm p-6 sm:p-8 flex flex-col gap-5">
            <div className="flex items-start gap-3">
              <span className="w-10 h-10 shrink-0 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-[20px]">
                {state === "rejected" ? "✗" : state === "requested" ? "⏳" : "!"}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[18px] font-extrabold text-zinc-900 leading-tight">
                  접근 권한이 없습니다
                </div>
                <div className="text-[15px] text-zinc-700 mt-1.5 leading-relaxed">{message}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 justify-end flex-wrap">
              <Button variant="ghost" onClick={onBack}>돌아가기</Button>
              <Button variant="primary" onClick={goToVendorInfo}>공급사 정보로 이동</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
