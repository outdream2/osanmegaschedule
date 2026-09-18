// src/components/DisplayPage/RealStockTablePage.types.ts
// 2026-09-18 · #149 R-1 · types 사이드카 분리 (사용자 지시)

export interface Product {
  product_code: string;
  product_name: string;
  supplier: string | null;
  location: string | null;      // 진열위치 (매장/창고 zone code 문자열 · "/" 구분)
  category_code: string | null;
  current_stock: number | null; // 2026-08-26 · ERP 재고 (products.current_stock)
  sale_status: string | null;   // 2026-08-26 · 판매중 필터용
}

export interface InvRow {
  warehouse1_stock: number | null;
  warehouse2_stock: number | null;
  store1_stock: number | null;        // 매장1 (2026-09-14 rename)
  store2_stock: number | null;        // 매장2 (2026-09-14 rename)
  store3_stock: number | null;        // 매장3
  // 2026-09-14 · 하위호환 alias (서버가 아직 함께 반환)
  store_stock?: number | null;
  store_stock_2?: number | null;
  store1_zone: string | null;
  store2_zone: string | null;
  store3_zone: string | null;
}

export interface Row {
  product_code: string;
  product_name: string;
  supplier: string | null;
  category_code: string | null;        // 2026-08-26 · 분류코드
  location: string | null;             // 진열위치 (매장/창고 zone code 문자열)
  erp: number | null;                  // 2026-08-26 · ERP 재고 (products.current_stock)
  w1: number | null;
  w2: number | null;
  s1: number | null;
  s2: number | null;
  s3: number | null;
  // 2026-08-26 · 사용자 지시 · real_map "/" 분리 · 매장1/2/3 zone 라벨 · 창고1/2 zone 도
  s1zone: string | null;
  s2zone: string | null;
  s3zone: string | null;
  w1zone: string | null;
  w2zone: string | null;
  sale_status: string | null;
  total: number;
  diff: number;                        // 2026-08-26 · ERP - 실재고합계 (음수면 실재고 많음)
}

// 2026-08-27 · 사용자 지시 · Attio 2026 톤 · dual-chip 정렬 (수량 · 구역) · 위치별 zone 정렬 추가
export type SortKey = "product_name" | "supplier" | "category_code" | "location" | "erp" | "w1" | "w2" | "s1" | "s2" | "s3" | "total" | "diff"
             | "s1zone" | "s2zone" | "s3zone" | "w1zone" | "w2zone";
