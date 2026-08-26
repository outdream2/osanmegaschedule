// server/lib/optimalStock.ts
// 2026-08-26 · 사용자 지시 · 적정재고 공통 프레임워크
//   · 재계산 로직 · 서버 여러 곳에서 재사용 (refill API · 임포트 후 자동 · CRON 등)
//   · 판매 이력 0 상품 · optimal_stock = 0 명시적 설정 (사용자 지시 · A안)
//   · 시작 날짜 옵션 (fromDate) · 없으면 오늘-N일 (기본)
//   · order_requests 동기화 (스냅샷 컬럼) 포함

import { supabase } from "../../src/supabase/client";

export interface RefillOptions {
  /** 기간 (일) · fromDate 없을 때 기본 · 1~365 */
  days?: number;
  /** 시작 날짜 (YYYY-MM-DD) · 있으면 이 날짜 ~ 오늘 판매량 집계 · 없으면 오늘-days ~ 오늘 */
  fromDate?: string;
  /** 판매 0 상품 · optimal_stock = 0 으로 설정 · 기본 true (사용자 지시 A안) */
  zeroIfNoSales?: boolean;
  /** order_requests 동기화 · 기본 true */
  syncOrderRequests?: boolean;
}

export interface RefillResult {
  ok: boolean;
  since: string;
  totalHistoryRows: number;
  totalProducts: number;
  productsWithSales: number;
  productsZeroed: number;
  productsUpdated: number;
  productsFailed: number;
  orderRequestsUpdated: number;
  elapsedMs: number;
  saleMs: number;
  productMs: number;
  orderMs: number;
}

const isValidDate = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s);

/** 시작 날짜 계산 · fromDate 우선 · 없으면 오늘-days */
export function computeSinceDate(opts: Pick<RefillOptions, "days" | "fromDate">): string {
  if (opts.fromDate && isValidDate(opts.fromDate)) return opts.fromDate;
  const days = Math.max(1, Math.min(365, Number(opts.days ?? 30) || 30));
  const now = new Date();
  const since = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);
  return since.toISOString().slice(0, 10);
}

/** stock_history · sinceStr 이후 · 5-병렬 페이지 조회 · product_code 별 판매량 합산 */
export async function fetchSalesMap(sinceStr: string): Promise<{ map: Map<string, number>; totalRows: number }> {
  const salesMap = new Map<string, number>();
  const PAGE = 1000;
  const first = await supabase
    .from("stock_history")
    .select("product_code, sale_qty", { count: "exact" })
    .gte("snapshot_date", sinceStr)
    .range(0, PAGE - 1);
  if (first.error) {
    if (/relation|does not exist/i.test(first.error.message)) {
      throw new Error("stock_history 테이블 없음");
    }
    throw new Error(first.error.message);
  }
  const totalRows = first.count ?? 0;
  const consume = (rows: any[]) => {
    for (const r of rows) {
      const code = String(r.product_code ?? "").trim();
      if (!code) continue;
      const q = Number(r.sale_qty ?? 0) || 0;
      if (q > 0) salesMap.set(code, (salesMap.get(code) ?? 0) + q);
    }
  };
  consume(first.data ?? []);
  if (totalRows > PAGE) {
    const totalPages = Math.ceil(totalRows / PAGE);
    const PARALLEL = 5;
    for (let p = 1; p < totalPages; p += PARALLEL) {
      const batch = Array.from({ length: Math.min(PARALLEL, totalPages - p) }, (_, i) => p + i);
      const results = await Promise.all(batch.map(pi =>
        supabase.from("stock_history")
          .select("product_code, sale_qty")
          .gte("snapshot_date", sinceStr)
          .range(pi * PAGE, pi * PAGE + PAGE - 1)
      ));
      for (const r of results) {
        if (r.error) throw new Error(r.error.message);
        consume(r.data ?? []);
      }
    }
  }
  return { map: salesMap, totalRows };
}

/** 전체 상품 목록 조회 · 판매 0 상품도 optimal=0 처리 위해 */
export async function fetchAllProductCodes(): Promise<string[]> {
  const codes: string[] = [];
  const PAGE = 1000;
  const first = await supabase
    .from("products")
    .select("product_code", { count: "exact" })
    .eq("hidden", false)
    .range(0, PAGE - 1);
  if (first.error) throw new Error(first.error.message);
  const totalRows = first.count ?? 0;
  for (const r of (first.data ?? [])) {
    const c = String(r.product_code ?? "").trim();
    if (c) codes.push(c);
  }
  if (totalRows > PAGE) {
    const totalPages = Math.ceil(totalRows / PAGE);
    const PARALLEL = 5;
    for (let p = 1; p < totalPages; p += PARALLEL) {
      const batch = Array.from({ length: Math.min(PARALLEL, totalPages - p) }, (_, i) => p + i);
      const results = await Promise.all(batch.map(pi =>
        supabase.from("products")
          .select("product_code")
          .eq("hidden", false)
          .range(pi * PAGE, pi * PAGE + PAGE - 1)
      ));
      for (const r of results) {
        if (r.error) throw new Error(r.error.message);
        for (const row of (r.data ?? [])) {
          const c = String(row.product_code ?? "").trim();
          if (c) codes.push(c);
        }
      }
    }
  }
  return codes;
}

/** products.optimal_stock 일괄 upsert · 청크 500 */
export async function applyOptimalStock(payload: Array<{ product_code: string; optimal_stock: number; optimal_stock_backup: number }>): Promise<{ updated: number; failed: number }> {
  let updated = 0, failed = 0;
  const CHUNK = 500;
  for (let i = 0; i < payload.length; i += CHUNK) {
    const chunk = payload.slice(i, i + CHUNK);
    const { error } = await supabase.from("products").upsert(chunk, { onConflict: "product_code" });
    if (error) {
      console.error("[optimalStock] upsert error:", error.message);
      failed += chunk.length;
    } else {
      updated += chunk.length;
    }
  }
  return { updated, failed };
}

/** order_requests 동기화 · products.optimal_stock 값을 스냅샷 컬럼에 반영 */
export async function syncOrderRequestsOptimalStock(codeToOptimal: Map<string, number>): Promise<number> {
  const { data: orderRows, error } = await supabase
    .from("order_requests")
    .select("id, product_code");
  if (error) { console.warn("[optimalStock] order_requests 조회 실패:", error.message); return 0; }
  const payload = (orderRows ?? [])
    .map(r => {
      const opt = codeToOptimal.get(String(r.product_code ?? "").trim());
      if (opt == null) return null;
      return { id: r.id, optimal_stock: opt };
    })
    .filter((x): x is { id: number; optimal_stock: number } => x !== null);
  let updated = 0;
  const CHUNK = 500;
  for (let i = 0; i < payload.length; i += CHUNK) {
    const chunk = payload.slice(i, i + CHUNK);
    const { error: uErr } = await supabase.from("order_requests").upsert(chunk, { onConflict: "id" });
    if (!uErr) updated += chunk.length;
    else console.error("[optimalStock] order_requests upsert error:", uErr.message);
  }
  return updated;
}

/** 재계산 통합 실행 (옵션 기반) */
export async function refillOptimalStock(opts: RefillOptions = {}): Promise<RefillResult> {
  const t0 = Date.now();
  const sinceStr = computeSinceDate(opts);
  const zeroIfNoSales = opts.zeroIfNoSales !== false;
  const syncOrders = opts.syncOrderRequests !== false;

  const tSales = Date.now();
  const { map: salesMap, totalRows: totalHistoryRows } = await fetchSalesMap(sinceStr);
  const saleMs = Date.now() - tSales;

  // 판매0 → 0 처리: 전체 상품 코드 조회 · 없는 코드는 0
  const tProduct = Date.now();
  let payload: Array<{ product_code: string; optimal_stock: number; optimal_stock_backup: number }>;
  let productsZeroed = 0;
  let totalProducts = 0;
  const codeToOptimal = new Map<string, number>();
  if (zeroIfNoSales) {
    const allCodes = await fetchAllProductCodes();
    totalProducts = allCodes.length;
    payload = allCodes.map(code => {
      const q = salesMap.get(code) ?? 0;
      if (q === 0) productsZeroed++;
      const val = Math.round(q);
      codeToOptimal.set(code, val);
      return { product_code: code, optimal_stock: val, optimal_stock_backup: val };
    });
  } else {
    // 기존 · 판매>0 만 업데이트 (판매 0 상품 · 기존 값 유지)
    totalProducts = salesMap.size;
    payload = [...salesMap.entries()].map(([code, qty]) => {
      const val = Math.round(qty);
      codeToOptimal.set(code, val);
      return { product_code: code, optimal_stock: val, optimal_stock_backup: val };
    });
  }
  const { updated, failed } = await applyOptimalStock(payload);
  const productMs = Date.now() - tProduct;

  // order_requests 동기화
  const tOrder = Date.now();
  const orderRequestsUpdated = syncOrders ? await syncOrderRequestsOptimalStock(codeToOptimal) : 0;
  const orderMs = Date.now() - tOrder;

  return {
    ok: true,
    since: sinceStr,
    totalHistoryRows,
    totalProducts,
    productsWithSales: salesMap.size,
    productsZeroed,
    productsUpdated: updated,
    productsFailed: failed,
    orderRequestsUpdated,
    elapsedMs: Date.now() - t0,
    saleMs,
    productMs,
    orderMs,
  };
}
