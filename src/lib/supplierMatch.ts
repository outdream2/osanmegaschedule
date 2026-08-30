// src/lib/supplierMatch.ts
// 2026-08-30 · 사용자 지시 · 공급사 검색 · 프로젝트 전체 · 동일 로직 통일
//
// 매칭 규칙:
//   · 원문 · 정제명 (displayVendorName · vat·법인 접두어 제거) 양쪽 대응
//   · 부분일치 + 초성 매칭 (matchHangul)
//   · vendor.company_name · supplier_name · vendor.contact_name 등 다중 필드
//
// 사용 예:
//   const filtered = vendors.filter(v => matchesSupplierQuery(v, query));
//
// 정확 매칭 (매입이력 서버·클라 필터 등):
//   matchesSupplierExact("(주)녹십자", "녹십자") → true  (displayVendorName 로 정제 후 ===)

import { matchHangul } from "./hangulSearch";
import { displayVendorName, stripVendorAnnotation } from "../utils/vendorNameNormalize";

export interface SupplierMatchable {
  /** 공급사 마스터 이름 (예: vendor.company_name) */
  company_name?: string | null;
  /** 이력·매입에서의 원본 이름 (예: purchase_details.supplier_name) */
  supplier_name?: string | null;
  /** 또 다른 별칭 (예: supplier) */
  supplier?: string | null;
  /** 담당자 이름 (선택) */
  contact_name?: string | null;
  /** 담당자 핸드폰 (선택) */
  phone?: string | null;
  /** 담당자 매니저 핸드폰 (선택) */
  manager_phone?: string | null;
}

/**
 * 공급사 하나 대상 · 검색어 매칭
 *  · query 비어있으면 · true
 *  · 이름 · 원문 · 정제명 · 초성 매칭
 *  · 담당자·연락처 · 원문 부분일치
 */
export function matchesSupplierQuery(supplier: SupplierMatchable, query: string): boolean {
  const q = (query ?? "").trim();
  if (!q) return true;
  const qLower = q.toLowerCase();

  const candidates: string[] = [];
  const names: (string | null | undefined)[] = [supplier.company_name, supplier.supplier_name, supplier.supplier];
  for (const n of names) {
    if (!n) continue;
    const raw = String(n);
    candidates.push(raw);
    const stripped = stripVendorAnnotation(raw);
    if (stripped && stripped !== raw) candidates.push(stripped);
    const display = displayVendorName(raw);
    if (display && display !== raw && display !== stripped) candidates.push(display);
  }
  // 이름 · 초성·부분일치
  for (const c of candidates) {
    if (matchHangul(c, q)) return true;
  }
  // 담당자·연락처 · 원문 부분일치
  const contact = String(supplier.contact_name ?? "").toLowerCase();
  if (contact && contact.includes(qLower)) return true;
  const phone = String(supplier.phone ?? "").replace(/[^0-9]/g, "");
  const mphone = String(supplier.manager_phone ?? "").replace(/[^0-9]/g, "");
  const qDigits = q.replace(/[^0-9]/g, "");
  if (qDigits && qDigits.length >= 3) {
    if (phone.includes(qDigits) || mphone.includes(qDigits)) return true;
  }
  return false;
}

/**
 * 두 공급사 이름이 · 정제 후 동일한지 (정확 매칭)
 *  · 서버·클라이언트 필터에서 · "(주)녹십자" vs "녹십자" 매칭 통일
 *  · displayVendorName 으로 양쪽 정제 후 === 비교
 */
export function matchesSupplierExact(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = displayVendorName(a ?? "");
  const nb = displayVendorName(b ?? "");
  if (!na || !nb) return false;
  return na === nb;
}
