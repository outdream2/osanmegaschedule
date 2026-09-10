// src/lib/productMatch.ts
// 2026-08-29 · 사용자 지시 · 상품명 검색 · 프로젝트 전체 · 동일 로직 통일
// 2026-09-08 · barcode 필드 제거 · product_code 자체가 바코드값 (13자리 EAN)
//
// 매칭 규칙 (통일):
//   · product_name · 원문 부분일치 + 초성 매칭 (hangulSearch.matchHangul)
//   · product_code · 원문 부분일치 (대소문자 무시) · **바코드값 포함**
//   · supplier    · 원문 부분일치 + 초성 매칭
//   · 하나라도 매칭 시 · true (OR 조건)
//
// 사용:
//   const filtered = products.filter(p => matchesProductQuery(p, query));
//   또는
//   const filtered = filterProducts(products, query);

import { matchHangul } from "./hangulSearch";

/** 상품 매칭 대상 · 최소 필드 (더 있어도 무관) */
export interface ProductMatchable {
  product_name?: string | null;
  product_code?: string | null;
  supplier?: string | null;
}

/**
 * 상품 하나에 대한 검색어 매칭
 *   · query 비어있으면 · true (모두 통과)
 *   · 상품명·공급사 · 원문 + 초성 매칭 (matchHangul)
 *   · product_code · 원문 부분일치만 (바코드값 포함 · 대소문자 무시)
 *   · 2026-09-10 · 사용자 지시 · 공백 정규화 매칭 (양쪽 공백 제거 후 · 검색어와 대상 모두 · 공백 제외 부분일치)
 *     · 예: "테스트 상품등록" 검색 → "테스트상품등록" 상품명 매칭 ✅
 */
export function matchesProductQuery(product: ProductMatchable, query: string): boolean {
  const q = (query ?? "").trim();
  if (!q) return true;
  const qLower = q.toLowerCase();
  const qNoSpace = qLower.replace(/\s+/g, "");

  const name = String(product.product_name ?? "");
  const supplier = String(product.supplier ?? "");
  const code = String(product.product_code ?? "").toLowerCase();

  // 1) 상품명 · 공급사 · matchHangul (원문 부분일치 + 초성)
  if (name && matchHangul(name, q)) return true;
  if (supplier && matchHangul(supplier, q)) return true;

  // 2) product_code · 원문 부분일치 (바코드값 포함)
  if (code && code.includes(qLower)) return true;

  // 3) 2026-09-10 · 공백 정규화 매칭 · 검색어와 대상 모두 공백 제거 후 부분일치
  if (qNoSpace && qNoSpace !== qLower) {
    if (name && name.toLowerCase().replace(/\s+/g, "").includes(qNoSpace)) return true;
    if (supplier && supplier.toLowerCase().replace(/\s+/g, "").includes(qNoSpace)) return true;
    if (code && code.replace(/\s+/g, "").includes(qNoSpace)) return true;
  } else if (qLower) {
    // 검색어에 공백 없어도 · 대상에 공백 있을 수 있음 (예: "테스트 상품")
    const nameNoSp = name.toLowerCase().replace(/\s+/g, "");
    if (nameNoSp && nameNoSp.includes(qLower)) return true;
    const supNoSp = supplier.toLowerCase().replace(/\s+/g, "");
    if (supNoSp && supNoSp.includes(qLower)) return true;
  }

  return false;
}

/** 상품 배열 필터 · 헬퍼 */
export function filterProducts<T extends ProductMatchable>(products: T[], query: string): T[] {
  const q = (query ?? "").trim();
  if (!q) return products;
  return products.filter(p => matchesProductQuery(p, q));
}
