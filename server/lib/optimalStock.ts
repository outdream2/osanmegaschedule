// server/lib/optimalStock.ts
// 2026-08-26 · 사용자 지시 · 적정재고 공통 프레임워크
//   · 재계산 로직 · 서버 여러 곳에서 재사용 (refill API · 임포트 후 자동 · CRON 등)
//   · 판매 이력 0 상품 · optimal_stock = 0 명시적 설정 (사용자 지시 · A안)
//   · 시작 날짜 옵션 (fromDate) · 없으면 오늘-N일 (기본)
//   · order_requests 동기화 (스냅샷 컬럼) 포함

import { supabase } from "../../src/supabase/client";
import logger from "./logger";

export interface RefillOptions {
  /** 기간 (일) · fromDate 없을 때 기본 · 1~365 */
  days?: number;
  /** 시작 날짜 (YYYY-MM-DD) · 있으면 이 날짜 ~ toDate (or 오늘) 판매량 집계 */
  fromDate?: string;
  /** 끝 날짜 (YYYY-MM-DD) · 없으면 오늘 · 사용자 지시 · 특정 날짜부터 특정 날짜까지 지원 */
  toDate?: string;
  /** 판매 0 상품 · optimal_stock = 0 으로 설정 · 기본 true (사용자 지시 A안) */
  zeroIfNoSales?: boolean;
  /** order_requests 동기화 · 기본 true */
  syncOrderRequests?: boolean;
}

export interface RefillResult {
  ok: boolean;
  since: string;
  until: string;
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
const todayStr = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

/** 시작 · 끝 날짜 계산 · fromDate 우선 · toDate 없으면 오늘
 *  2026-10-05 · off-by-one 수정 · 오늘 포함 정확히 N일 · since = today - (N - 1)
 */
export function computeDateRange(opts: Pick<RefillOptions, "days" | "fromDate" | "toDate">): { since: string; until: string } {
  const until = opts.toDate && isValidDate(opts.toDate) ? opts.toDate : todayStr();
  if (opts.fromDate && isValidDate(opts.fromDate)) return { since: opts.fromDate, until };
  const days = Math.max(1, Math.min(365, Number(opts.days ?? 30) || 30));
  const untilD = new Date(until + "T00:00:00");
  const since = new Date(untilD.getFullYear(), untilD.getMonth(), untilD.getDate() - (days - 1));
  const y = since.getFullYear();
  const m = String(since.getMonth() + 1).padStart(2, "0");
  const d = String(since.getDate()).padStart(2, "0");
  return { since: `${y}-${m}-${d}`, until };
}

/** sales · [since, until] 범위 · product_name 집계 → products.product_name 완전일치로 product_code 매핑
 *  2026-10-05 · 사용자 지시 · stock_history → sales 전환
 *    · 판매량 SSOT = sales.total_stock (ERP Sale_Status 동기화 결과)
 *    · 상품 relation = product_name 완전일치 (fuzzy 금지)
 *    · unmatched 상품명은 로그 (검증용)
 */
export async function fetchSalesMap(sinceStr: string, untilStr?: string): Promise<{ map: Map<string, number>; totalRows: number }> {
  const PAGE = 1000;

  // 1) sales · product_name 별 total_stock 합산
  const salesByName = new Map<string, number>();
  const buildSalesQuery = (offset: number) => {
    let q = supabase
      .from("sales")
      .select("product_name, total_stock", offset === 0 ? { count: "exact" } : undefined)
      .gte("sale_date", sinceStr);
    if (untilStr) q = q.lte("sale_date", untilStr);
    return q.range(offset, offset + PAGE - 1);
  };
  const salesFirst = await buildSalesQuery(0);
  if (salesFirst.error) {
    if (/relation|does not exist/i.test(salesFirst.error.message)) {
      throw new Error("sales 테이블 없음");
    }
    throw new Error(salesFirst.error.message);
  }
  const totalRows = salesFirst.count ?? 0;
  const consumeSales = (rows: any[]) => {
    for (const r of rows) {
      const name = String(r.product_name ?? "").trim();
      if (!name) continue;
      const q = Number(r.total_stock ?? 0) || 0;
      if (q > 0) salesByName.set(name, (salesByName.get(name) ?? 0) + q);
    }
  };
  consumeSales(salesFirst.data ?? []);
  if (totalRows > PAGE) {
    const totalPages = Math.ceil(totalRows / PAGE);
    const PARALLEL = 5;
    for (let p = 1; p < totalPages; p += PARALLEL) {
      const batch = Array.from({ length: Math.min(PARALLEL, totalPages - p) }, (_, i) => p + i);
      const results = await Promise.all(batch.map(pi => buildSalesQuery(pi * PAGE)));
      for (const r of results) {
        if (r.error) throw new Error(r.error.message);
        consumeSales(r.data ?? []);
      }
    }
  }

  // 2) products · product_name → product_code 매핑 테이블 구성
  const nameToCode = new Map<string, string>();
  const buildProductQuery = (offset: number) =>
    supabase
      .from("products")
      .select("product_code, product_name", offset === 0 ? { count: "exact" } : undefined)
      .range(offset, offset + PAGE - 1);
  const prodFirst = await buildProductQuery(0);
  if (prodFirst.error) throw new Error(prodFirst.error.message);
  const prodTotal = prodFirst.count ?? 0;
  const consumeProducts = (rows: any[]) => {
    for (const r of rows) {
      const name = String(r.product_name ?? "").trim();
      const code = String(r.product_code ?? "").trim();
      if (name && code && !nameToCode.has(name)) nameToCode.set(name, code);
    }
  };
  consumeProducts(prodFirst.data ?? []);
  if (prodTotal > PAGE) {
    const totalPages = Math.ceil(prodTotal / PAGE);
    const PARALLEL = 5;
    for (let p = 1; p < totalPages; p += PARALLEL) {
      const batch = Array.from({ length: Math.min(PARALLEL, totalPages - p) }, (_, i) => p + i);
      const results = await Promise.all(batch.map(pi => buildProductQuery(pi * PAGE)));
      for (const r of results) {
        if (r.error) throw new Error(r.error.message);
        consumeProducts(r.data ?? []);
      }
    }
  }

  // 3) salesByName → salesMap(product_code) 변환 · 완전일치만 반영
  const salesMap = new Map<string, number>();
  let unmatchedCount = 0;
  const unmatchedSample: string[] = [];
  for (const [name, qty] of salesByName) {
    const code = nameToCode.get(name);
    if (code) {
      salesMap.set(code, (salesMap.get(code) ?? 0) + qty);
    } else {
      unmatchedCount++;
      if (unmatchedSample.length < 10) unmatchedSample.push(name);
    }
  }
  if (unmatchedCount > 0) {
    logger.warn(
      `[optimalStock] sales 상품명 unmatched · ${unmatchedCount} 건 · sample: ${unmatchedSample.join(" / ")}`,
    );
  }
  logger.info(
    `[optimalStock] sales 집계 · 기간=${sinceStr}~${untilStr ?? "오늘"} · sales rows=${totalRows} · matched products=${salesMap.size} · unmatched names=${unmatchedCount}`,
  );

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
      logger.error(`[optimalStock] upsert error: ${error.message}`);
      failed += chunk.length;
    } else {
      updated += chunk.length;
    }
  }
  return { updated, failed };
}

/** 2026-09-14 · 대원칙 · products.optimal_stock 단일 소스 (2026-09-09 확정 · 사용자 지시)
 *   · 이전 · order_requests.optimal_stock 스냅샷 컬럼 UPSERT (DROP 됨 · 컬럼 미존재)
 *   · 신규 · no-op · GET 시 · products JOIN 으로 최신값 표시 (display/requests.ts 이미 처리)
 *   · 함수 시그니처 유지 · 호출 사이트 호환 (schedule refill)
 * @deprecated 2026-09-14 · 호출 자체 제거 예정
 */
export async function syncOrderRequestsOptimalStock(_codeToOptimal: Map<string, number>): Promise<number> {
  void _codeToOptimal;
  return 0;
}

/**
 * 2026-09-08 · 사용자 지시 · KV settings 에서 days 읽어서 refill
 *   · app_settings.optimal_stock_days · 정수 (기본 30)
 *   · 매일 자정 CRON 에서 이 함수 호출
 *   · zeroIfNoSales=true · 판매 이력 없는 상품도 optimal_stock=0 명시적 세팅
 */
export async function refillOptimalStockFromSettings(): Promise<RefillResult> {
  let days = 30;
  try {
    // 2026-09-09 · KV 키 통일 fix · UI 저장 키(optimal_stock_period_days) 참조
    //   · 이전 · "optimal_stock_days" 조회 · UI 저장 키와 불일치 → CRON 항상 기본값 30일 사용
    //   · 설정 UI (OptimalStockPeriodSection.tsx) 는 "optimal_stock_period_days" 에 저장
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "optimal_stock_period_days")
      .maybeSingle();
    const v = Number(data?.value ?? 30);
    if (Number.isFinite(v) && v >= 1 && v <= 365) days = Math.floor(v);
  } catch { /* silent · 기본 30일 */ }
  // 2026-09-09 · 사용자 지시 · 판매 이력 없는 상품 · optimal_stock 기존 값 유지 (0 강제 X)
  //   · 이전 · zeroIfNoSales=true · 판매 없는 상품 전부 0 · 발주필요 리스트 안 뜸
  //   · 이후 · false · 관리자가 수동 입력한 optimal_stock 보존
  return refillOptimalStock({ days, zeroIfNoSales: false, syncOrderRequests: true });
}

/** 재계산 통합 실행 (옵션 기반) */
export async function refillOptimalStock(opts: RefillOptions = {}): Promise<RefillResult> {
  const t0 = Date.now();
  const { since: sinceStr, until: untilStr } = computeDateRange(opts);
  // 2026-09-09 · 사용자 지시 · 기본값 false 로 변경 · 명시적 true 요청 시만 0 처리
  const zeroIfNoSales = opts.zeroIfNoSales === true;
  const syncOrders = opts.syncOrderRequests !== false;

  const tSales = Date.now();
  const { map: salesMap, totalRows: totalHistoryRows } = await fetchSalesMap(sinceStr, untilStr);
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

  // 2026-09-14 · order_requests 동기화 · no-op (products.optimal_stock 단일 소스 · JOIN 으로 최신값 조회)
  const tOrder = Date.now();
  const orderRequestsUpdated = syncOrders ? await syncOrderRequestsOptimalStock(codeToOptimal) : 0;
  const orderMs = Date.now() - tOrder;

  return {
    ok: true,
    since: sinceStr,
    until: untilStr,
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
