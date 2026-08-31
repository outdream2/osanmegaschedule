// src/lib/productLocation.ts
// 2026-08-31 · #13 · real_map → location 통합 · 공통 헬퍼
//   · 원칙 · display·조회 코드는 location 우선 · real_map 은 fallback (하위호환)
//   · real_map 스코프 제한 대상 · 실재고 스캔 (ScanPage) + 배치구역 불일치 (ZoneMismatchTab) 만
//   · 그 외 모든 파일 · 이 헬퍼 사용해서 통일
//
// 사용:
//   import { resolveProductLocation } from "../../lib/productLocation";
//   const loc = resolveProductLocation(product);  // "1A" | "22" | null

/** 상품에서 진열위치 문자열 추출 · location 우선 · 그 외 fallback */
export function resolveProductLocation(product: any): string | null {
  if (!product) return null;
  const primary = product.location;
  if (primary && String(primary).trim()) return String(primary).trim();
  const display = product.display_location;
  if (display && String(display).trim()) return String(display).trim();
  const rm = product.real_map;
  if (rm && String(rm).trim()) return String(rm).trim();
  const rmCamel = product.realMap;
  if (rmCamel && String(rmCamel).trim()) return String(rmCamel).trim();
  return null;
}

/** 진열위치 없음 → "-" 대체 표시 · UI 헬퍼 */
export function displayProductLocation(product: any, fallback = "-"): string {
  return resolveProductLocation(product) ?? fallback;
}

/** 두 상품이 같은 진열위치인지 · UnassignedProductsTab 등 · location 비교 */
export function sameProductLocation(a: any, b: any): boolean {
  const la = resolveProductLocation(a);
  const lb = resolveProductLocation(b);
  if (la == null && lb == null) return true;
  return la === lb;
}
