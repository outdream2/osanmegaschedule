// src/lib/productsApi.ts
// 2026-09-14 · 프레임워크 · 상품 API 클라이언트 래퍼
//   · server/routes/stock/products.ts
//   · 20+ 호출 사이트 통합 · products-map · products/:code · purchase-history · expiry-imminent 등

import { api } from "./apiClient";

/** GET /api/products-map · 전체 상품 map (product_code → Product) */
export async function getProductsMap<T = Record<string, any>>(
  params?: { include_inactive?: boolean; include_hidden?: boolean }
): Promise<T> {
  const qs = new URLSearchParams();
  if (params?.include_inactive) qs.set("include_inactive", "1");
  if (params?.include_hidden) qs.set("include_hidden", "1");
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const { data } = await api.get<T>(`/api/products-map${suffix}`);
  return (data ?? ({} as T));
}

/** GET /api/products/:code · 단건 상세 */
export async function getProductByCode<T = any>(code: string): Promise<T | null> {
  const { data } = await api.get<T>(`/api/products/${encodeURIComponent(code)}`);
  return data ?? null;
}

/** PATCH /api/products/:code · 부분 수정 (인라인 편집 · SUPPLIER_NOT_FOUND validation 포함) */
export async function patchProduct(code: string, patch: Record<string, any>): Promise<void> {
  await api.patch(`/api/products/${encodeURIComponent(code)}`, patch);
}

/** POST /api/products · 신규 등록 (Zod schema validated) */
export async function createProduct<T = { ok: boolean; product_code: string }>(
  input: Record<string, any>
): Promise<T> {
  const { data } = await api.post<T>("/api/products", input);
  return data;
}

/** GET /api/products/purchase-history?codes=A,B,C&limit=1 · 상품 최근 매입 이력 */
export async function getPurchaseHistoryMap<T = Record<string, any>>(
  codes: string[],
  limit = 1
): Promise<T> {
  if (codes.length === 0) return {} as T;
  const qs = new URLSearchParams();
  qs.set("codes", codes.join(","));
  qs.set("limit", String(limit));
  const { data } = await api.get<{ history?: T } | T>(`/api/products/purchase-history?${qs.toString()}`);
  // Response may be { history: {...} } or direct map · normalize
  return (((data as any)?.history ?? data) ?? {}) as T;
}

/** GET /api/products/expiry-imminent · 유통기한 임박 상품 리스트 */
export async function listExpiryImminentProducts<T = any[]>(): Promise<T> {
  const { data } = await api.get<T>("/api/products/expiry-imminent");
  return (Array.isArray(data) ? data : []) as T;
}

/** GET /api/products/hidden · 숨김 상품 리스트 */
export async function listHiddenProducts<T = unknown>(): Promise<T> {
  const { data } = await api.get<T>("/api/products/hidden");
  return data as T;
}

/** GET /api/products/shelf-positions-map · shelf 위치 map */
export async function getShelfPositionsMap<T = Record<string, Record<string, string | null>>>(): Promise<T> {
  const { data } = await api.get<T>("/api/products/shelf-positions-map");
  return (data ?? ({} as T));
}

/** PATCH /api/products/:code/shelf-positions · shelf 위치 병합 저장 */
export async function patchProductShelfPositions(
  code: string,
  shelfPositions: Record<string, string | null>
): Promise<void> {
  await api.patch(`/api/products/${encodeURIComponent(code)}/shelf-positions`, {
    shelf_positions: shelfPositions,
  });
}

/** GET /api/products-search?q=&limit= · 상품 검색 */
export async function searchProducts<T = { items?: any[] } | any[]>(
  q: string,
  limit = 1000
): Promise<T> {
  const qs = new URLSearchParams();
  qs.set("q", q);
  qs.set("limit", String(limit));
  const { data } = await api.get<T>(`/api/products-search?${qs.toString()}`);
  return data;
}
