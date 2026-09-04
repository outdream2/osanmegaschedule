// src/lib/productLocation.ts
// 2026-08-31 · #13 · location 통합 공통 헬퍼

/** 상품에서 진열위치 문자열 추출 · location 우선 · display_location fallback */
export function resolveProductLocation(product: any): string | null {
  if (!product) return null;
  const primary = product.location;
  if (primary && String(primary).trim()) return String(primary).trim();
  const display = product.display_location;
  if (display && String(display).trim()) return String(display).trim();
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
