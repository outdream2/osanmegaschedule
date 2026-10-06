// src/hooks/useVendorApproval.ts
// 2026-10-06 · 공급사 승인 접근 fix · 공통 훅 · 승인 상태 derived state + 메시지 + blocked handler
//   · SSOT · vendorSelf.approval_status (useVendors 캐시)
//   · 로그인/approval 경계 · stale 방지 · invalidateVendorsCache (LoginModals 호출)
//   · 사용처 · LandingPage · (필요 시 다른 vendor 전용 페이지에서도 재사용 가능)
//
// 2026-09-14 재강조 · 안정성·효율·프레임워크화

import { useCallback, useMemo } from "react";
import { useVendors } from "./useVendors";
import type { AuthSession } from "../types";
import type { Vendor as VendorFull } from "../components/LandingPage/VendorListEditor";

export type VendorApprovalState =
  | "loading"
  | "approved"
  | "requested"
  | "rejected"
  | "needs-info";

export interface UseVendorApprovalResult {
  vendorSelf: VendorFull | null;
  vendorsLoading: boolean;
  state: VendorApprovalState;
  message: string;
  isApproved: boolean;
  refresh: () => Promise<unknown>;
}

/** 상태별 안내 메시지 (사용자 지시 규칙 [8]) */
function stateMessage(state: VendorApprovalState): string {
  switch (state) {
    case "requested":  return "공급사 승인 요청이 처리 중입니다.";
    case "rejected":   return "공급사 승인이 완료되지 않았습니다. 공급사 정보를 확인한 후 다시 승인 요청해주세요.";
    case "needs-info": return "공급사 정보를 입력하고 승인을 요청해주세요.";
    default:           return "";
  }
}

/**
 * vendor 세션 승인 상태 derived hook
 * · 비-vendor 세션 · state="approved" (gate 없음) · vendorSelf=null
 */
export function useVendorApproval(authSession: AuthSession | null): UseVendorApprovalResult {
  const { vendors, loading, refresh } = useVendors();
  const isVendor = authSession?.role === "vendor";

  const vendorSelf = useMemo<VendorFull | null>(() => {
    if (!isVendor || !authSession) return null;
    const list = vendors as unknown as VendorFull[];
    const byId = list.find(v => v.id === authSession.employeeId);
    if (byId) return byId;
    const nm = String(authSession.employeeName ?? "").trim();
    return nm ? (list.find(v => v.company_name === nm) ?? null) : null;
  }, [isVendor, authSession, vendors]);

  const state = useMemo<VendorApprovalState>(() => {
    if (!isVendor) return "approved";
    if (loading && !vendorSelf) return "loading";
    const status = String((vendorSelf as any)?.approval_status ?? "").toLowerCase();
    if (status === "approved") return "approved";
    if (status === "requested" || status === "pending") return "requested";
    if (status === "rejected") return "rejected";
    return "needs-info";
  }, [isVendor, loading, vendorSelf]);

  const message = useMemo(() => stateMessage(state), [state]);
  const isApproved = state === "approved";
  const refreshStable = useCallback(() => refresh(), [refresh]);

  return { vendorSelf, vendorsLoading: loading, state, message, isApproved, refresh: refreshStable };
}
