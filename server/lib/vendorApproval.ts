// server/lib/vendorApproval.ts
// 2026-10-06 · 공급사 승인 접근 fix · 서버측 공통 approval guard
//   · vendor 세션 (role=vendor) · approval_status === "approved" 만 통과
//   · admin/manager/employee 세션 · 영향 없음 (role 분기 명시)
//   · 사용처 · /api/vendor/order-history · /api/products-search?supplier= (vendor 역할)
//
// 사용 예:
//   const session = getSession(req);
//   await requireVendorApproved(session); // 미승인 → HttpError 403
//
// 설계 원칙 (사용자 지시):
//   · 중복 if 금지 · 공통 함수
//   · 새 framework 금지 · 기존 supabase + HttpError 재사용
//   · 안정성·효율·프레임워크화 (2026-09-14 재강조)

import { supabase } from "../../src/supabase/client";
import { HttpError, forbidden } from "../middleware/errorHandler";
import type { JwtPayload } from "../middleware/requireAuth";
import logger from "./logger";

export interface VendorApprovalInfo {
  id: number;
  company_name: string;
  approval_status: string;
}

/**
 * vendor 세션의 승인 상태 조회
 * · session.sub (vendor id) 로 조회
 * · null 반환 시 vendor 미발견 (DB 데이터 이상)
 */
export async function fetchVendorApproval(session: JwtPayload | null): Promise<VendorApprovalInfo | null> {
  if (!session || session.role !== "vendor") return null;
  const vendorId = Number(session.sub);
  if (!vendorId || isNaN(vendorId)) return null;
  const { data, error } = await supabase
    .from("vendors")
    .select("id, company_name, approval_status")
    .eq("id", vendorId)
    .maybeSingle();
  if (error) {
    logger.warn(`[vendorApproval] 조회 실패 · vendorId=${vendorId} · ${error.message}`);
    return null;
  }
  if (!data) return null;
  return {
    id: (data as any).id,
    company_name: String((data as any).company_name ?? ""),
    approval_status: String((data as any).approval_status ?? ""),
  };
}

/**
 * vendor 세션 승인 필수 guard
 * · vendor 가 아닌 세션 (admin/manager/employee) · 통과 (영향 없음)
 * · vendor 세션 · approval_status === "approved" 만 통과
 * · 그 외 · HttpError 403 · 상태별 메시지
 */
export async function requireVendorApproved(session: JwtPayload | null): Promise<void> {
  if (!session || session.role !== "vendor") return;
  const info = await fetchVendorApproval(session);
  const status = String(info?.approval_status ?? "").toLowerCase();
  if (status === "approved") return;
  // 사용자 지시 규칙 [8] · 상태별 메시지
  const msg =
    status === "requested" || status === "pending"
      ? "공급사 승인 요청이 처리 중입니다."
      : status === "rejected"
      ? "공급사 승인이 완료되지 않았습니다. 공급사 정보를 확인한 후 다시 승인 요청해주세요."
      : "공급사 정보를 입력하고 승인을 요청해주세요.";
  throw new HttpError(403, msg, "VENDOR_NOT_APPROVED");
  // forbidden() 대신 HttpError 로 code 명시 · 프런트가 code 로 분기 가능
  void forbidden;
}
