// src/lib/productMatch.ts
// 2026-08-29 · 사용자 지시 · 상품명 검색 · 프로젝트 전체 · 동일 로직 통일
//
// 매칭 규칙 (통일):
//   · product_name · 원문 부분일치 + 초성 매칭 (hangulSearch.matchHangul)
//   · product_code · 원문 부분일치 (대소문자 무시)
//   · supplier    · 원문 부분일치 + 초성 매칭
//   · barcode     · 원문 부분일치 (있으면)
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
  barcode?: string | null;
}

/**
 * 상품 하나에 대한 검색어 매칭
 *   · query 비어있으면 · true (모두 통과)
 *   · 상품명·공급사 · 원문 + 초성 매칭 (matchHangul)
 *   · 코드·바코드 · 원문 부분일치만 (대소문자 무시)
 */
export function matchesProductQuery(product: ProductMatchable, query: string): boolean {
  const q = (query ?? "").trim();
  if (!q) return true;
  const qLower = q.toLowerCase();

  // 상품명 · 공급사 · 초성 매칭 (한글 부분일치 + 자음 초성)
  const name = String(product.product_name ?? "");
  if (name && matchHangul(name, q)) return true;

  const supplier = String(product.supplier ?? "");
  if (supplier && matchHangul(supplier, q)) return true;

  // 코드 · 바코드 · 원문 부분일치 (숫자·영문 · 초성 매칭 불필요)
  const code = String(product.product_code ?? "").toLowerCase();
  if (code && code.includes(qLower)) return true;

  const barcode = String(product.barcode ?? "").toLowerCase();
  if (barcode && barcode.includes(qLower)) return true;

  return false;
}

/** 상품 배열 필터 · 헬퍼 */
export function filterProducts<T extends ProductMatchable>(products: T[], query: string): T[] {
  const q = (query ?? "").trim();
  if (!q) return products;
  return products.filter(p => matchesProductQuery(p, q));
}
