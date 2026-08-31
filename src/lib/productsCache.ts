// 2026-08-27 · 사용자 지시 · spec + display_location → location 컬럼 통합
//   · location = 진열위치 · spec은 하위호환 (원본 규격 · 사용 안 함)
export interface ProductInfo { code: string; name: string; spec: string; location?: string | null; [key: string]: any; }

const TTL_MS = 60_000; // 60초 TTL · 2026-08-31

let _map: Record<string, ProductInfo> | null = null;
let _promise: Promise<Record<string, ProductInfo>> | null = null;
let _fetchedAt: number | null = null;

function _isStale(): boolean {
  return _fetchedAt == null || Date.now() - _fetchedAt > TTL_MS;
}

function _doFetch(): void {
  _promise = fetch("/products.json")
    .then(r => r.json())
    .then((m: Record<string, ProductInfo>) => { _map = m; _fetchedAt = Date.now(); return m; })
    .catch(() => { _promise = null; return {}; });
}

// 2026-08-31 · product-mutated 이벤트 → 즉시 캐시 무효화
if (typeof window !== "undefined") {
  window.addEventListener("product-mutated", () => { _map = null; _promise = null; _fetchedAt = null; });
}

export function prefetchProducts(): void {
  if ((_map || _promise) && !_isStale()) return;
  _doFetch();
}

export function getProductsMap(): Promise<Record<string, ProductInfo>> {
  if (_map && !_isStale()) return Promise.resolve(_map);
  if (_promise && !_isStale()) return _promise;
  prefetchProducts();
  return _promise!;
}

export function lookupProduct(code: string): ProductInfo | null {
  if (!_map) return null;
  const q = code.trim();
  return _map[q] ?? _map[q.replace(/^0+/, "")] ?? null;
}

export function isProductsLoaded(): boolean {
  return _map !== null;
}

export function updateCachedProduct(code: string, updates: Record<string, any>): void {
  if (!_map) return;
  const q = code.trim();
  if (_map[q]) _map[q] = { ..._map[q], ...updates };
  const stripped = q.replace(/^0+/, "");
  if (stripped && stripped !== q && _map[stripped]) _map[stripped] = { ..._map[stripped], ...updates };
}

// 2026-08-27 · 사용자 지시 · 상품 임포트 후 상품명 등 · 즉시 갱신 · 캐시 무효화 + prefetch
//   · 임포트 성공 시 · 이 함수 호출 · products.json 새 fetch · UI 자동 반영
export function resetProductsCache(): void {
  _map = null;
  _promise = null;
  _fetchedAt = null;
}
export async function reloadProductsCache(): Promise<Record<string, ProductInfo>> {
  resetProductsCache();
  prefetchProducts();
  return _promise ?? Promise.resolve({});
}

// 2026-08-23 · #179 · 미등록 상품 등록 후 · 로컬 캐시 즉시 삽입 · 재스캔 즉시 lookupProduct hit
export function addCachedProduct(code: string, info: Partial<ProductInfo>): void {
  if (!_map) _map = {};
  const q = code.trim();
  if (!q) return;
  const merged: ProductInfo = {
    code: q,
    name: info.name ?? "",
    spec: info.spec ?? "",
    ...info,
  };
  _map[q] = merged;
  const stripped = q.replace(/^0+/, "");
  if (stripped && stripped !== q) _map[stripped] = merged;
}
