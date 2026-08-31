// 2026-08-29 · #168 · 매입·재고 조회 JOIN 통합 · 공용 유틸 신설
//   · docs/PRODUCT_QUERY_STANDARD.md (#170) 표준 근거 · 원본 테이블 우선
//   · products + inventory_checks (최신) · 서버 JOIN · 클라 lookup X
//   · 향후 · 각 endpoint · 이 유틸 · 소비 · 통일
//
// 함수:
//   - queryProductsWithInventory(codes?, opts?) · 상품 + 재고 최신 · JOIN
//
// 특징:
//   - hidden=false + sale_active_only 필터 자동 (설정 반영)
//   - inventory_checks · get_inventory_latest RPC 우선 · fallback 페이지루프

import { supabase } from "../../src/supabase/client";

export interface ProductWithInventory {
  product_code: string;
  product_name: string | null;
  supplier: string | null;
  category: string | null;
  category_code: string | null;
  spec: string | null;
  location: string | null;
  display_location: string | null;
  real_map: string | null;
  current_stock: number | null;
  optimal_stock: number | null;
  purchase_price: number | null;      // 2026-08-29 · #168 Phase 2 확장
  sale_price: number | null;
  profit_rate: number | null;
  expiry_date: string | null;
  brand: string | null;
  manufacturer: string | null;
  unit: string | null;
  search_keywords: string | null;
  sale_status: string | null;
  hidden: boolean;

  // 재고 (inventory_checks 최신)
  inv_warehouse1_stock: number | null;
  inv_warehouse2_stock: number | null;
  inv_store_stock: number | null;
  inv_store_stock_2: number | null;
  inv_store3_stock: number | null;
  inv_store1_zone: string | null;
  inv_store2_zone: string | null;
  inv_store3_zone: string | null;
  inv_checked_at: string | null;
  inv_total: number | null;

  // 2026-08-29 · #168 Phase 2 · 매입 이력 (purchase_details 최근)
  last_purchase_date: string | null;
  last_snapshot_qty: number | null;
}

export interface QueryOptions {
  saleActiveOnly?: boolean;
  includeHidden?: boolean;
  limit?: number;
  /** 2026-08-29 · #168 Phase 2 · 부족재고 필터 (current_stock < optimal_stock) */
  filterLowStockOnly?: boolean;
  /** 2026-08-29 · #168 Phase 2 · purchase_details 최근 매입 병합 */
  includePurchaseHistory?: boolean;
  /** 2026-08-29 · #168 Phase 2 Step 1 · inventory_checks 존재 · products 없는 code 도 반환 (임시 실재고 방어)
   *   · products JOIN 없이 · inventory 만으로 · 반환 (product 필드 · null · inv_ 필드 · 채움)
   *   · inventory-latest endpoint · 기존 동작 유지 (products 마스터 없이 · 재고 조사 임시 저장 상품 표시) */
  includeInventoryOnlyRows?: boolean;
}

async function readSaleActiveOnly(): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "stats.sale_active_only")
      .maybeSingle();
    return data?.value !== false;
  } catch {
    return true;
  }
}

async function fetchLatestInventory(codes?: string[]): Promise<Map<string, {
  inv_warehouse1_stock: number | null;
  inv_warehouse2_stock: number | null;
  inv_store_stock: number | null;
  inv_store_stock_2: number | null;
  inv_store3_stock: number | null;
  inv_store1_zone: string | null;
  inv_store2_zone: string | null;
  inv_store3_zone: string | null;
  inv_checked_at: string | null;
  inv_total: number | null;
}>> {
  const map = new Map<string, any>();
  const { data: rpcData, error: rpcErr } = await supabase.rpc("get_inventory_latest");
  const source = rpcErr ? [] : (rpcData ?? []);

  for (const r of source) {
    const code = String(r.product_code ?? "").trim();
    if (!code) continue;
    if (codes && !codes.includes(code)) continue;
    if (map.has(code)) continue;

    // 2026-08-31 · warehouse_stock DROP · warehouse1_stock 단일 사용
    const w1 = r.warehouse1_stock != null ? Number(r.warehouse1_stock) : null;
    const w2 = r.warehouse2_stock != null ? Number(r.warehouse2_stock) : null;
    const s1 = r.store_stock      != null ? Number(r.store_stock)      : null;
    const s2 = r.store_stock_2    != null ? Number(r.store_stock_2)    : null;
    const s3 = r.store3_stock     != null ? Number(r.store3_stock)     : null;
    const total = [w1, w2, s1, s2, s3].reduce((sum: number, v) => sum + (v ?? 0), 0);

    map.set(code, {
      inv_warehouse1_stock: w1,
      inv_warehouse2_stock: w2,
      inv_store_stock: s1,
      inv_store_stock_2: s2,
      inv_store3_stock: s3,
      inv_store1_zone: r.store1_zone ?? null,
      inv_store2_zone: r.store2_zone ?? null,
      inv_store3_zone: r.store3_zone ?? null,
      inv_checked_at: r.checked_at ?? null,
      inv_total: total,
    });
  }
  return map;
}

/**
 * 상품 + 재고 (최신) JOIN 조회
 *   · codes 지정 시 · 해당 code 만 · 없으면 · 전체
 *   · sale_active_only + hidden 필터 자동 반영
 *   · #170 표준 준수 · 원본 테이블 우선 · JOIN 서버측
 */
// 2026-08-29 · #168 Phase 2 · purchase_details 최근 매입 병합 (옵션)
//   · 각 product_code 별 · 최신 purchase_date 1건 (last_purchase_date · last_snapshot_qty)
async function fetchLatestPurchase(codes: string[]): Promise<Map<string, { last_purchase_date: string | null; last_snapshot_qty: number | null }>> {
  const map = new Map<string, { last_purchase_date: string | null; last_snapshot_qty: number | null }>();
  if (codes.length === 0) return map;
  const CHUNK = 200;
  for (let i = 0; i < codes.length; i += CHUNK) {
    const slice = codes.slice(i, i + CHUNK);
    const { data } = await supabase
      .from("purchase_details")
      .select("product_code, purchase_date, quantity")
      .in("product_code", slice)
      .order("purchase_date", { ascending: false });
    for (const r of data ?? []) {
      const code = String(r.product_code ?? "").trim();
      if (!code || map.has(code)) continue;
      map.set(code, {
        last_purchase_date: r.purchase_date ?? null,
        last_snapshot_qty: r.quantity != null ? Number(r.quantity) : null,
      });
    }
  }
  return map;
}

export async function queryProductsWithInventory(
  codes?: string[],
  opts: QueryOptions = {}
): Promise<ProductWithInventory[]> {
  const includeHidden = opts.includeHidden === true;
  const saleActive = opts.saleActiveOnly ?? await readSaleActiveOnly();
  const limit = Math.min(opts.limit ?? 1000, 10000);
  const filterLowStockOnly = opts.filterLowStockOnly === true;
  const includePurchaseHistory = opts.includePurchaseHistory === true;

  // 2026-08-29 · #168 Phase 2 · 확장 컬럼 · purchase_price · sale_price · profit_rate · expiry_date · brand · manufacturer · unit · search_keywords
  //   · 각 endpoint 소비 필드 · 모두 포함 · 응답 형식 매핑 용이
  let productQuery = supabase
    .from("products")
    .select("product_code, product_name, supplier, category, category_code, spec, location, display_location, real_map, current_stock, optimal_stock, purchase_price, sale_price, profit_rate, expiry_date, brand, manufacturer, unit, search_keywords, sale_status, hidden");
  if (!includeHidden) productQuery = productQuery.eq("hidden", false);
  if (saleActive) productQuery = productQuery.eq("sale_status", "판매중");
  if (codes && codes.length > 0) productQuery = productQuery.in("product_code", codes);
  productQuery = productQuery.limit(limit);

  const { data: products, error: pErr } = await productQuery;
  if (pErr) throw new Error(`products 조회 실패: ${pErr.message}`);

  // 부족재고 필터 (opts.filterLowStockOnly)
  const filtered = filterLowStockOnly
    ? (products ?? []).filter(p => {
        const cur = p.current_stock != null ? Number(p.current_stock) : null;
        const opt = p.optimal_stock != null ? Number(p.optimal_stock) : null;
        return cur != null && opt != null && cur < opt;
      })
    : (products ?? []);

  const productCodes = filtered.map(p => String(p.product_code ?? ""));
  // 2026-08-29 · #168 Phase 2 Step 1 · includeInventoryOnlyRows=true · 전체 inventory · 없어도 반환
  const inventoryMap = opts.includeInventoryOnlyRows
    ? await fetchLatestInventory(undefined) // 전체 inventory (products 없어도 · 반환)
    : await fetchLatestInventory(productCodes);
  const purchaseMap = includePurchaseHistory ? await fetchLatestPurchase(productCodes) : new Map();

  const productMap = new Map(filtered.map(p => [String(p.product_code ?? ""), p]));
  // 2026-08-29 · #168 Phase 2 Step 1 · products 없는 inventory · 임시 실재고 방어
  //   · includeInventoryOnlyRows=true · inventory 전체 순회 · products 없어도 · 결과에 포함
  const codeSet = new Set<string>(filtered.map(p => String(p.product_code ?? "")));
  if (opts.includeInventoryOnlyRows) {
    for (const code of inventoryMap.keys()) {
      codeSet.add(code);
    }
  }

  const buildRow = (code: string): ProductWithInventory => {
    const p: any = productMap.get(code) ?? {};
    const inv = inventoryMap.get(code);
    const pur = purchaseMap.get(code);
    return {
      product_code: code,
      product_name: p.product_name ?? null,
      supplier: p.supplier ?? null,
      category: p.category ?? null,
      category_code: p.category_code ?? null,
      spec: p.spec ?? null,
      location: p.location ?? p.display_location ?? null,
      display_location: p.display_location ?? null,
      real_map: p.real_map ?? null,
      current_stock: p.current_stock != null ? Number(p.current_stock) : null,
      optimal_stock: p.optimal_stock != null ? Number(p.optimal_stock) : null,
      purchase_price: p.purchase_price != null ? Number(p.purchase_price) : null,
      sale_price: p.sale_price != null ? Number(p.sale_price) : null,
      profit_rate: p.profit_rate != null ? Number(p.profit_rate) : null,
      expiry_date: p.expiry_date ?? null,
      brand: p.brand ?? null,
      manufacturer: p.manufacturer ?? null,
      unit: p.unit ?? null,
      search_keywords: p.search_keywords ?? null,
      sale_status: p.sale_status ?? null,
      hidden: p.hidden === true,
      inv_warehouse1_stock: inv?.inv_warehouse1_stock ?? null,
      inv_warehouse2_stock: inv?.inv_warehouse2_stock ?? null,
      inv_store_stock: inv?.inv_store_stock ?? null,
      inv_store_stock_2: inv?.inv_store_stock_2 ?? null,
      inv_store3_stock: inv?.inv_store3_stock ?? null,
      inv_store1_zone: inv?.inv_store1_zone ?? null,
      inv_store2_zone: inv?.inv_store2_zone ?? null,
      inv_store3_zone: inv?.inv_store3_zone ?? null,
      inv_checked_at: inv?.inv_checked_at ?? null,
      inv_total: inv?.inv_total ?? null,
      last_purchase_date: pur?.last_purchase_date ?? null,
      last_snapshot_qty: pur?.last_snapshot_qty ?? null,
    };
  };

  return Array.from(codeSet).map(buildRow);
}
