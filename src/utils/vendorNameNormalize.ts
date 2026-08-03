// src/utils/vendorNameNormalize.ts
// 2026-08-03 · 공급사명 정제 유틸
//  · 원본 supplier 문자열에 vat 관련 부가정보가 붙는 경우 · 표시/조회에서 제거
//  · 예: "(주)대웅제약 (vat포함)" → "(주)대웅제약"
//  · vendorCategoryMap 조회·리스트 표시·이름 매칭 등에서 공용 사용
// 주의 · 회사명 자체 앞부분의 "(주)" 등은 유지 (뒤쪽 부가정보만 제거)

const VAT_ANNOTATION_RE = /\s*\(\s*vat\s*(포함|미포함|별도|없음)?\s*\)\s*$/i;

/**
 * supplier 이름에서 뒤쪽 vat 관련 괄호 부가정보만 제거
 *  · "(주)대웅제약 (vat포함)"    → "(주)대웅제약"
 *  · "(주)대웅제약 (vat미포함)"  → "(주)대웅제약"
 *  · "(주)대웅제약 (VAT 별도)"   → "(주)대웅제약"
 *  · "(주)대웅제약"              → "(주)대웅제약" (변경 없음)
 * 앞·중간 괄호("(주)" 등)는 유지 · 문자열 끝의 vat 괄호 1개만 제거
 */
export function stripVendorAnnotation(name: string | null | undefined): string {
  if (!name) return "";
  return String(name).replace(VAT_ANNOTATION_RE, "").trim();
}

/** vat 부가정보인지 판별 · 발주 리스트 secondLine 노출 여부 결정 */
export function isVatAnnotation(text: string | null | undefined): boolean {
  if (!text) return false;
  return /vat/i.test(String(text));
}
