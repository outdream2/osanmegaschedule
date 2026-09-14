// server/lib/vendorValidation.ts
// 2026-09-11 · #63 · 사용자 대원칙 · 공급사 이름 · 마스터 무결성
//   · 모든 저장 경로 · vendors 유효성 검증 필수 · 자유 입력 금지
//
// 사용:
//   const result = await validateSupplier(supplierName);
//   if (!result.valid) throw badRequest(result.error);
//
// 정규화 · trim · 공백 정리 (한글 특수문자 처리)
// 검증 · vendors.company_name · ilike (case-insensitive) · trim 일치
// 반환 · { valid, vendorId, canonicalName, error }

import { supabase } from "../../src/supabase/client";

export interface VendorValidationResult {
  valid: boolean;
  vendorId?: number;
  canonicalName?: string;
  error?: string;
}

function normalizeName(name: string): string {
  return String(name ?? "").trim().replace(/\s+/g, " ");
}

// 2026-09-14 · 사용자 대원칙 · 실시간 정확성 · 캐시 제거
//   · 이전 · 60sec TTL · vendor 등록 후 최대 60sec stale (등록 즉시 발주·매입 저장 실패 위험)
//   · 신규 · 매 요청 · DB 실시간 조회 (~5-20ms · 부담 무의미)
async function loadVendorMap(): Promise<Map<string, { id: number; canonical: string }>> {
  const m = new Map<string, { id: number; canonical: string }>();
  try {
    const { data } = await supabase
      .from("vendors")
      .select("id, company_name")
      .eq("is_deleted", false);
    for (const v of data ?? []) {
      const canonical = String((v as any).company_name ?? "").trim();
      if (!canonical) continue;
      const key = normalizeName(canonical).toLowerCase();
      m.set(key, { id: (v as any).id, canonical });
    }
  } catch (e: any) {
    console.error("[vendorValidation] vendors 조회 실패:", e?.message);
  }
  return m;
}

/**
 * 공급사 이름 유효성 검증
 * · null·empty · valid=true (선택적 필드 · 값 없음 허용)
 * · 값 있으면 · vendors 매칭 필수
 */
export async function validateSupplier(supplierName: string | null | undefined): Promise<VendorValidationResult> {
  if (supplierName == null || String(supplierName).trim() === "") {
    return { valid: true };
  }
  const normalized = normalizeName(supplierName);
  if (!normalized) return { valid: true };
  const key = normalized.toLowerCase();
  const map = await loadVendorMap();
  const hit = map.get(key);
  if (hit) return { valid: true, vendorId: hit.id, canonicalName: hit.canonical };
  return {
    valid: false,
    error: `등록되지 않은 공급사입니다: "${normalized}" · 공급사를 먼저 등록해주세요.`,
  };
}

/** 2026-09-14 · 캐시 제거 · no-op stub (호출 사이트 호환) */
export function invalidateVendorCache(): void { /* cache removed · 실시간 조회로 전환 */ }
