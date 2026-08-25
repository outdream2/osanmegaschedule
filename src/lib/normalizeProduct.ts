// src/lib/normalizeProduct.ts
// 2026-08-25 · 프레임워크 · raw DB row → ProductInfo 정규화 + API fallback
//   사용처
//     · ScanPage · ProductArrivalPage · 기타 상품 검색·스캔 flow
//   원인 · ProductSearchInput 은 /api/products-search 결과 (raw · product_name/product_code) 반환
//         · ProductInfo (name/code) 로 정규화 안 하면 · '상품명 자리에 코드' 등 표시 버그
//   fallback · lookupProduct 미스 + preload 없음 시 · GET /api/products/:code 실시간 조회
//
// API
//   normalizeProductRow(raw, fallbackCode)   → ProductInfo
//   resolveProduct(code, preload?)           → Promise<ProductInfo | null>
//     · preload → normalize (제공된 raw row 우선)
//     · lookupProduct(code) → cache hit
//     · GET /api/products/:code → API fallback
//     · null → 미등록

import { api } from "./apiClient";
import { addCachedProduct, lookupProduct, type ProductInfo } from "./productsCache";

/**
 * raw DB 상품 row 를 ProductInfo shape 로 정규화.
 * · code 우선순위 · p.code → p.product_code → fallbackCode
 * · name 우선순위 · p.name → p.product_name → ""
 * · 나머지 필드는 spread 로 유지 (spec/supplier/realMap 등 · 이미 정규화된 필드는 덮어씀)
 */
export function normalizeProductRow(raw: any, fallbackCode: string): ProductInfo {
  return {
    code: String(raw?.code ?? raw?.product_code ?? fallbackCode ?? ""),
    name: String(raw?.name ?? raw?.product_name ?? ""),
    spec: String(raw?.spec ?? ""),
    supplier: raw?.supplier ?? null,
    realMap: raw?.realMap ?? raw?.real_map ?? null,
    real_map: raw?.real_map ?? raw?.realMap ?? null,
    ...(raw ?? {}),
  } as ProductInfo;
}

/**
 * 상품 코드로 · preload → cache → API fallback 순서로 조회.
 * · 성공 시 · cache 에 hydrate (다음 lookup 즉시 hit)
 * · 미등록 시 · null 반환 (호출측이 "등록되지 않은 상품" 처리)
 */
export async function resolveProduct(
  code: string,
  preload?: any | null,
): Promise<ProductInfo | null> {
  if (preload) {
    const normalized = normalizeProductRow(preload, code);
    if (!lookupProduct(code)) addCachedProduct(code, normalized);
    return normalized;
  }
  const cached = lookupProduct(code);
  if (cached) return cached;
  try {
    const { data } = await api.get<any>(`/api/products/${encodeURIComponent(code)}`);
    if (data && (data.product_code || data.code)) {
      const normalized = normalizeProductRow(data, code);
      addCachedProduct(code, normalized);
      return normalized;
    }
  } catch { /* 404 → 미등록 */ }
  return null;
}
