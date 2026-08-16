// 2026-08-16 · 서버·클라 공유 · 상품 응답 DTO
export interface Product {
  product_code: string;
  product_name: string;
  spec: string | null;
  supplier: string | null;
  current_stock: number | null;
  optimal_stock: number | null;
  min_stock: number | null;
  sale_price: number | null;
  purchase_price: number | null;
  real_map: string | null;          // 실제배정구역 (DB=real_map, JS=realMap)
  hidden: boolean;
  category?: string | null;
  memo?: string | null;
}

/** GET /api/products · 리스트 (배열 직접 반환) */
export type ProductsListResponse = Product[];

/** GET /api/products-search · 검색 결과 */
export interface ProductSearchResult {
  code: string;
  name: string;
  spec: string | null;
  current_stock: number | null;
  optimal_stock: number | null;
  min_stock: number | null;
}
export interface ProductsSearchResponse {
  items: ProductSearchResult[];
  total?: number;
}

/** GET /api/products/hidden · 숨김 상품 리스트 */
export type HiddenProductsResponse = Product[];
