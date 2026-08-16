// 2026-08-16 · asyncHandler + HttpError 프레임워크 적용
import { Router } from "express";
import express from "express";
import XLSX from "xlsx";
import { supabase } from "../../../src/supabase/client";
import { resolveSeasonMonths } from "../settings/settings";
import { fetchAllWithRange } from "../../utils/supabaseFetchAll";
import { queryPurchaseDetails } from "../../utils/purchaseDetailsQuery";
import { asyncHandler } from "../../middleware/asyncHandler";
import { HttpError } from "../../middleware/errorHandler";

const router = Router();

/**
 * 스냅샷 날짜(YYYY-MM-DD) 가 season 월 배열에 속하는지 검사
 * · season 이 null/[] 이면 항상 true (필터 미적용)
 */
function inSeasonMonths(snapshotDate: string, months: number[] | null): boolean {
  if (!months || months.length === 0) return true;
  const m = /^\d{4}-(\d{2})/.exec(String(snapshotDate));
  if (!m) return false;
  return months.includes(Number(m[1]));
}

function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

// 2026-07-31 · performance QW1 · suppliers·top-products 캐시 (in-memory TTL 5분)
//   purchase_details 풀스캔 · 응답당 대역폭 큼 · 캐시로 반복 요청 감소
// 2026-08-09 · 소스 · ocr_confirmed_items → purchase_details (사용자 원칙 · 매입이력은 매입이력만)
//   캐시 이름은 하위호환 위해 유지 · 매입확정 후 이 캐시도 무효화 필요
const ocrAggCache = new Map<string, { data: any; expiresAt: number }>();
const OCR_AGG_TTL = 5 * 60 * 1000;
/** 매입 아이템 저장/삭제 후 캐시 무효화 (ocrConfirmed.ts · purchase import 에서 호출) */
export function clearOcrAggCache() { ocrAggCache.clear(); }

// 2026-08-05 · T-PERF-1a · low-stock 캐시 (in-memory TTL 2분)
//   products 전체 + inventory_checks 전체 풀스캔 · 탭 전환마다 반복 → 캐시로 감소
//   inventory-checks POST/PATCH/DELETE 시 무효화 필요 (clearLowStockCache export)
let lowStockCache: { data: any; expiresAt: number } | null = null;
const LOW_STOCK_TTL = 2 * 60 * 1000; // 2분
export function clearLowStockCache() { lowStockCache = null; }

// GET /api/stock-manage/suppliers?days=7|30|90
// 공급사별 매입 총액 · 수량 · 상품수
// 2026-08-09 · 소스 · purchase_details (ERP) · queryPurchaseDetails 헬퍼 사용
//   OCR fallback 없음 · supplier_name NULL 은 vendors/products 로 fallback 해결
router.get("/api/stock-manage/suppliers", asyncHandler(async (req, res) => {
  const days = Math.max(1, Math.min(365, parseInt(String(req.query.days ?? "7"), 10) || 7));
  const sinceYmd = daysAgoISO(days).slice(0, 10);
  const cacheKey = `suppliers::${days}`;
  const cached = ocrAggCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return res.json(cached.data);
  const rows = await queryPurchaseDetails({ sinceYmd });
  const map = new Map<string, { supplier: string; purchaseAmount: number; purchaseQty: number; items: Set<string> }>();
  for (const r of rows) {
    const cur = map.get(r.supplier) ?? { supplier: r.supplier, purchaseAmount: 0, purchaseQty: 0, items: new Set<string>() };
    cur.purchaseAmount += r.amount;
    cur.purchaseQty   += r.quantity;
    if (r.product_name) cur.items.add(r.product_name);
    map.set(r.supplier, cur);
  }
  const result = [...map.values()]
    .map(x => ({ supplier: x.supplier, purchaseAmount: x.purchaseAmount, purchaseQty: x.purchaseQty, itemCount: x.items.size }))
    .sort((a, b) => b.purchaseAmount - a.purchaseAmount);
  ocrAggCache.set(cacheKey, { data: result, expiresAt: Date.now() + OCR_AGG_TTL });
  res.json(result);
}));

// GET /api/stock-manage/top-products?days=7|30|90&limit=100
// 매입 금액 상위 상품
// 2026-08-09 · 소스 · purchase_details (ERP) · queryPurchaseDetails 헬퍼 사용
router.get("/api/stock-manage/top-products", asyncHandler(async (req, res) => {
  const days = Math.max(1, Math.min(365, parseInt(String(req.query.days ?? "7"), 10) || 7));
  const limit = Math.max(1, Math.min(500, parseInt(String(req.query.limit ?? "100"), 10) || 100));
  const sinceYmd = daysAgoISO(days).slice(0, 10);
  const cacheKey = `top-products::${days}::${limit}`;
  const cached = ocrAggCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return res.json(cached.data);
  const rows = await queryPurchaseDetails({ sinceYmd });
  const map = new Map<string, { product_name: string; product_code: string | null; supplier: string | null; totalAmount: number; totalQty: number }>();
  for (const r of rows) {
    const key = r.product_code || r.product_name;
    if (!key) continue;
    const cur = map.get(key) ?? {
      product_name: r.product_name || key,
      product_code: r.product_code || null,
      supplier: r.supplier || null,
      totalAmount: 0, totalQty: 0,
    };
    cur.totalAmount += r.amount;
    cur.totalQty   += r.quantity;
    map.set(key, cur);
  }
  const result = [...map.values()].sort((a, b) => b.totalAmount - a.totalAmount).slice(0, limit);
  ocrAggCache.set(cacheKey, { data: result, expiresAt: Date.now() + OCR_AGG_TTL });
  res.json(result);
}));

// GET /api/stock-manage/supplier-purchases?snapshot_date=YYYY-MM-DD&months=N&limit=20
// stock_history 기반 공급사별 매입/판매/재고 집계 (금액·수량 · 상품수)
// 2026-07-16: months 파라미터 추가 · 기간 범위 (오늘-months 개월 ~ 오늘) 집계
router.get("/api/stock-manage/supplier-purchases", asyncHandler(async (req, res) => {
  const limit = Math.max(1, Math.min(50000, parseInt(String(req.query.limit ?? "20"), 10) || 20));
  const dateParam = String(req.query.snapshot_date ?? "").trim();
  const monthsParam = Math.max(0, Math.min(24, parseInt(String(req.query.months ?? "0"), 10) || 0));
  // 계절 필터 · 지정 시 년도 무관 · months/snapshot_date 무시
  const seasonParam = String(req.query.season ?? "").trim().toLowerCase();
  const seasonMonths = await resolveSeasonMonths(seasonParam);
  {
    // months > 0: 기간 범위 · 없으면 단일 스냅샷
    let targetDate = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : "";
    let fromDateStr: string | null = null;
    if (seasonMonths) {
      // 전체 stock_history 스캔 → 계절 월 필터 · targetDate 는 latest 로 표기
      const { data: latest } = await supabase
        .from("stock_history")
        .select("snapshot_date")
        .order("snapshot_date", { ascending: false })
        .limit(1);
      targetDate = latest?.[0]?.snapshot_date ?? new Date().toISOString().slice(0, 10);
    } else if (monthsParam > 0) {
      const today = new Date();
      const from = new Date(today.getFullYear(), today.getMonth() - monthsParam, today.getDate());
      fromDateStr = from.toISOString().slice(0, 10);
      targetDate = today.toISOString().slice(0, 10);
    } else if (!targetDate) {
      const { data: latest } = await supabase
        .from("stock_history")
        .select("snapshot_date")
        .order("snapshot_date", { ascending: false })
        .limit(1);
      targetDate = latest?.[0]?.snapshot_date ?? "";
    }
    if (!targetDate) return res.json({ snapshot_date: null, top: null, rows: [] });

    // 전체 조회 (페이지네이션) — 공급사코드로 그룹핑 (코드 없으면 이름으로 폴백)
    // 2026-07-28: itemCount 를 stock_history row 수가 아닌 distinct product 수로 계산
    //   (기간 조회 시 상품마다 여러 스냅샷 row 존재 · itemCount 폭발 이슈 fix)
    const map = new Map<string, {
      supplier: string;
      supplier_code: string | null;
      names: Set<string>;          // 같은 코드에 여러 이름이 붙는 경우 감지
      products: Set<string>;       // distinct product code · itemCount 계산용
      purchaseQty: number;
      purchaseAmount: number;
      saleQty: number;
      saleAmount: number;          // 판매액 (proxy: supply_amount × 판매/(매입+판매) 비율 합)
      totalStockAmount: number;
    }>();
    const PAGE = 1000;
    let from = 0;
    while (true) {
      let query = supabase
        .from("stock_history")
        .select("product_code, supplier_code, supplier_name, purchase_qty, sale_qty, supply_amount, total_amount, snapshot_date");
      if (seasonMonths) {
        // 전 데이터 스캔 · 후 필터 (Supabase 는 EXTRACT 미지원)
        // 필요 시 상위 range 로 페이징 · 계절 월 이외는 스킵
      } else if (fromDateStr) {
        query = query.gte("snapshot_date", fromDateStr).lte("snapshot_date", targetDate);
      } else {
        query = query.eq("snapshot_date", targetDate);
      }
      const { data, error } = await query.range(from, from + PAGE - 1);
      if (error) {
        if (/relation|does not exist/i.test(error.message)) break;
        throw new Error(error.message);
      }
      if (!data || data.length === 0) break;
      for (const r of data) {
        if (seasonMonths && !inSeasonMonths(String(r.snapshot_date ?? ""), seasonMonths)) continue;
        const supName = String(r.supplier_name ?? "").trim();
        const supCode = String(r.supplier_code ?? "").trim();
        if (!supName && !supCode) continue;
        // 그룹 키: 공급사코드 우선, 없으면 이름 (앞에 `n:` prefix로 충돌 방지)
        const key = supCode ? `c:${supCode}` : `n:${supName}`;
        const cur = map.get(key) ?? {
          supplier: supName || supCode,
          supplier_code: supCode || null,
          names: new Set<string>(),
          products: new Set<string>(),
          purchaseQty: 0, purchaseAmount: 0, saleQty: 0, saleAmount: 0, totalStockAmount: 0,
        };
        if (supName) cur.names.add(supName);
        // 2026-07-28: distinct product code 만 카운트 (기간 조회 시 row 중복 제거)
        const productCode = String(r.product_code ?? "").trim();
        if (productCode) cur.products.add(productCode);
        const purchQty = Number(r.purchase_qty ?? 0) || 0;
        const saleQty  = Number(r.sale_qty ?? 0) || 0;
        const supplyAmt = Number(r.supply_amount ?? 0) || 0;
        cur.purchaseQty      += purchQty;
        // 공급가액 = 스냅샷 기간 내 거래 공급가 합계 (매입/판매 모두 포함해 실제 xlsx 값 그대로 노출)
        // 이전 로직은 purchase_qty > 0 인 row 만 누적해 판매만 있는 공급사가 항상 0 이 되던 이슈 해결
        cur.purchaseAmount   += supplyAmt;
        cur.saleQty          += saleQty;
        // 판매액 proxy: supply_amount 를 판매/(매입+판매) 비율로 안분 (2026-07-16)
        const total = purchQty + saleQty;
        if (total > 0) cur.saleAmount += supplyAmt * (saleQty / total);
        cur.totalStockAmount += Number(r.total_amount ?? 0) || 0;
        map.set(key, cur);
      }
      if (data.length < PAGE) break;
      from += PAGE;
    }

    // 이름 충돌 감지: 같은 이름 → 여러 코드가 있으면 중복 의심
    const nameToCodes = new Map<string, Set<string>>();
    for (const v of map.values()) {
      for (const n of v.names) {
        const s = nameToCodes.get(n) ?? new Set<string>();
        if (v.supplier_code) s.add(v.supplier_code);
        nameToCodes.set(n, s);
      }
    }

    // 공급사별 합계(=재고금액 합계, xlsx "합계" 컬럼) 내림차순 정렬
    const rows = [...map.values()].map(v => ({
      supplier: v.supplier,
      supplier_code: v.supplier_code,
      names: [...v.names],
      // 같은 이름을 여러 코드가 공유하면 표시 (중복 의심 플래그)
      code_conflict: [...v.names].some(n => (nameToCodes.get(n)?.size ?? 0) > 1),
      purchaseQty: v.purchaseQty,
      purchaseAmount: v.purchaseAmount,
      saleQty: v.saleQty,
      saleAmount: Math.round(v.saleAmount), // 판매액 proxy (2026-07-16)
      itemCount: v.products.size,           // 2026-07-28 · distinct product code 수
      totalStockAmount: v.totalStockAmount,
    })).sort((a, b) => b.totalStockAmount - a.totalStockAmount);
    const top = rows.length > 0 ? rows[0] : null;
    res.json({ snapshot_date: targetDate, season: seasonParam || undefined, season_months: seasonMonths ?? undefined, top, rows: rows.slice(0, limit) });
  }
}));

// GET /api/stock-manage/snapshot-summary?snapshot_date=YYYY-MM-DD
// 스냅샷 전체 통계 (Top N 제한 없이 전 상품 합계) — 대시보드 상단 메트릭용
router.get("/api/stock-manage/snapshot-summary", asyncHandler(async (req, res) => {
  const dateParam = String(req.query.snapshot_date ?? "").trim();
  {
    let targetDate = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : "";
    if (!targetDate) {
      const { data: latest } = await supabase
        .from("stock_history")
        .select("snapshot_date")
        .order("snapshot_date", { ascending: false })
        .limit(1);
      targetDate = latest?.[0]?.snapshot_date ?? "";
    }
    if (!targetDate) return res.json({ snapshot_date: null, totals: null });

    // 페이지네이션으로 전체 조회
    const totals = {
      itemCount: 0,
      totalSale: 0,
      totalPurchase: 0,
      totalDisposal: 0,
      totalAmount: 0,
      negativeStockCount: 0,
      positiveStockCount: 0,
      zeroStockCount: 0,
    };
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("stock_history")
        .select("sale_qty, purchase_qty, disposal_qty, closing_stock, total_amount")
        .eq("snapshot_date", targetDate)
        .range(from, from + PAGE - 1);
      if (error) {
        if (/relation|does not exist/i.test(error.message)) break;
        throw new Error(error.message);
      }
      if (!data || data.length === 0) break;
      for (const r of data) {
        totals.itemCount++;
        totals.totalSale     += Number(r.sale_qty ?? 0) || 0;
        totals.totalPurchase += Number(r.purchase_qty ?? 0) || 0;
        totals.totalDisposal += Number(r.disposal_qty ?? 0) || 0;
        totals.totalAmount   += Number(r.total_amount ?? 0) || 0;
        const closing = Number(r.closing_stock ?? 0);
        if (closing < 0) totals.negativeStockCount++;
        else if (closing > 0) totals.positiveStockCount++;
        else totals.zeroStockCount++;
      }
      if (data.length < PAGE) break;
      from += PAGE;
    }
    res.json({ snapshot_date: targetDate, totals });
  }
}));

// ═══════════════════════════════════════════════════════════════════════════════
// 판매추이 (Sales Trend) - stock_history 기간별 시계열
// ═══════════════════════════════════════════════════════════════════════════════

// ── 판매추이 in-memory 캐시 (반복 조회 즉시 응답) ─────────────────────────
// key: `${code}::${months}` · TTL 5분 · 상품/공급사 변경 시 stock_history POST 에서 clear
const salesTrendCache = new Map<string, { data: any; expiresAt: number }>();
const SALES_TREND_TTL = 5 * 60 * 1000; // 5분
function clearSalesTrendCache() { salesTrendCache.clear(); }
// stock_history 업로드/변경 시 캐시 초기화 (export 하여 다른 endpoint 에서 사용)
export { clearSalesTrendCache };

// GET /api/sales-trend/product?code=<상품코드>
// 하나의 상품에 대한 10일 기간별 시계열 (period_start_date 오름차순)
router.get("/api/sales-trend/product", asyncHandler(async (req, res) => {
  const code = String(req.query.code ?? "").trim();
  if (!code) return res.status(400).json({ error: "code 필수" });
  // months 지정 시 오늘 기준 최근 N개월 범위로 필터
  const months = Math.max(0, Math.min(24, parseInt(String(req.query.months ?? "0"), 10) || 0));
  // 계절 필터 · 지정 시 년도 무관 · months 무시
  const seasonParam = String(req.query.season ?? "").trim().toLowerCase();
  const seasonMonths = await resolveSeasonMonths(seasonParam);
  // 캐시 조회 (반복 클릭·기간 변경 즉시 응답)
  const cacheKey = `${code}::${months}::s=${seasonParam}`;
  const cached = salesTrendCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Cache", "HIT");
    return res.json(cached.data);
  }
  let q = supabase
    .from("stock_history")
    .select("period_start_date, snapshot_date, period_type, supplier_name, product_name, spec, opening_stock, purchase_qty, sale_qty, disposal_qty, closing_stock, supply_amount, total_amount")
    .eq("product_code", code);
  if (!seasonMonths && months > 0) {
    // 2026-07-16 fix: 정확히 N개월 back (오늘 day 유지 · 이전엔 1일로 고정돼서 실제로는 최대 45일 반환)
    const today = new Date();
    const cutoff = new Date(today.getFullYear(), today.getMonth() - months, today.getDate());
    const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;
    q = q.gte("snapshot_date", cutoffStr);
  }
  const { data, error } = await q
    .order("period_start_date", { ascending: true, nullsFirst: false })
    .order("snapshot_date", { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  // 계절 월 필터 (년도 무관)
  const rows = seasonMonths
    ? (data ?? []).filter(r => inSeasonMonths(String(r.snapshot_date ?? ""), seasonMonths))
    : (data ?? []);
  const payload = { code, months, season: seasonParam || undefined, season_months: seasonMonths ?? undefined, rows };
  salesTrendCache.set(cacheKey, { data: payload, expiresAt: Date.now() + SALES_TREND_TTL });
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Cache", "MISS");
  res.json(payload);
}));

// GET /api/sales-trend/supplier?name=<공급사명>
// 공급사별 기간 aggregation (모든 상품 합계)
router.get("/api/sales-trend/supplier", asyncHandler(async (req, res) => {
  const name = String(req.query.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "name 필수" });
  const months = Math.max(0, Math.min(24, parseInt(String(req.query.months ?? "0"), 10) || 0));
  // 계절 필터 · 지정 시 년도 무관 · months 무시
  const seasonParam = String(req.query.season ?? "").trim().toLowerCase();
  const seasonMonths = await resolveSeasonMonths(seasonParam);
  // 2026-07-16 fix: 정확히 N개월 back (day 는 오늘 유지 · 이전엔 1일로 고정)
  const cutoffStr = (!seasonMonths && months > 0)
    ? (() => { const t = new Date(); const c = new Date(t.getFullYear(), t.getMonth() - months, t.getDate()); return `${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, "0")}-${String(c.getDate()).padStart(2, "0")}`; })()
    : null;
  {
    // 페이지네이션으로 전체 fetch (수천 상품 × 스냅샷 여러 개)
    const all: any[] = [];
    const PAGE = 1000;
    let from = 0;
    while (true) {
      let q = supabase
        .from("stock_history")
        .select("period_start_date, snapshot_date, period_type, product_code, purchase_qty, sale_qty, closing_stock, supply_amount, total_amount")
        .eq("supplier_name", name);
      if (cutoffStr) q = q.gte("snapshot_date", cutoffStr);
      const { data, error } = await q
        .order("period_start_date", { ascending: true, nullsFirst: false })
        .range(from, from + PAGE - 1);
      if (error) return res.status(500).json({ error: error.message });
      if (!data || data.length === 0) break;
      if (seasonMonths) {
        for (const r of data) if (inSeasonMonths(String(r.snapshot_date ?? ""), seasonMonths)) all.push(r);
      } else {
        all.push(...data);
      }
      if (data.length < PAGE) break;
      from += PAGE;
    }
    // 기간별 집계
    const byPeriod = new Map<string, {
      period_start_date: string;
      snapshot_date: string;
      period_type: string | null;
      product_count: number;
      purchase_qty: number;
      sale_qty: number;
      closing_stock: number;
      supply_amount: number;
      total_amount: number;
    }>();
    for (const r of all) {
      const key = String(r.period_start_date ?? r.snapshot_date);
      if (!byPeriod.has(key)) {
        byPeriod.set(key, {
          period_start_date: r.period_start_date ?? r.snapshot_date,
          snapshot_date: r.snapshot_date,
          period_type: r.period_type,
          product_count: 0,
          purchase_qty: 0,
          sale_qty: 0,
          closing_stock: 0,
          supply_amount: 0,
          total_amount: 0,
        });
      }
      const agg = byPeriod.get(key)!;
      agg.product_count += 1;
      agg.purchase_qty += Number(r.purchase_qty ?? 0) || 0;
      agg.sale_qty     += Number(r.sale_qty ?? 0) || 0;
      agg.closing_stock += Number(r.closing_stock ?? 0) || 0;
      agg.supply_amount += Number(r.supply_amount ?? 0) || 0;
      agg.total_amount  += Number(r.total_amount ?? 0) || 0;
      // snapshot_date 는 최신 것으로 갱신 (같은 period 안에 여러 스냅샷 있을 경우 마지막)
      if (r.snapshot_date > agg.snapshot_date) agg.snapshot_date = r.snapshot_date;
    }
    const rows = Array.from(byPeriod.values()).sort((a, b) => a.period_start_date.localeCompare(b.period_start_date));
    res.setHeader("Cache-Control", "no-store");
    res.json({ supplier: name, season: seasonParam || undefined, season_months: seasonMonths ?? undefined, rows });
  }
}));

// GET /api/sales-trend/overview
// 전체 기간별 총합 (모든 상품 · 모든 공급사)
router.get("/api/sales-trend/overview", asyncHandler(async (_req, res) => {
  {
    const all: any[] = [];
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("stock_history")
        .select("period_start_date, snapshot_date, period_type, purchase_qty, sale_qty, closing_stock, supply_amount, total_amount")
        .order("period_start_date", { ascending: true, nullsFirst: false })
        .range(from, from + PAGE - 1);
      if (error) return res.status(500).json({ error: error.message });
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < PAGE) break;
      from += PAGE;
    }
    const byPeriod = new Map<string, any>();
    for (const r of all) {
      const key = String(r.period_start_date ?? r.snapshot_date);
      if (!byPeriod.has(key)) {
        byPeriod.set(key, {
          period_start_date: r.period_start_date ?? r.snapshot_date,
          snapshot_date: r.snapshot_date,
          period_type: r.period_type,
          product_count: 0,
          purchase_qty: 0,
          sale_qty: 0,
          closing_stock: 0,
          supply_amount: 0,
          total_amount: 0,
        });
      }
      const agg = byPeriod.get(key)!;
      agg.product_count += 1;
      agg.purchase_qty += Number(r.purchase_qty ?? 0) || 0;
      agg.sale_qty     += Number(r.sale_qty ?? 0) || 0;
      agg.closing_stock += Number(r.closing_stock ?? 0) || 0;
      agg.supply_amount += Number(r.supply_amount ?? 0) || 0;
      agg.total_amount  += Number(r.total_amount ?? 0) || 0;
      if (r.snapshot_date > agg.snapshot_date) agg.snapshot_date = r.snapshot_date;
    }
    const rows = Array.from(byPeriod.values()).sort((a, b) => a.period_start_date.localeCompare(b.period_start_date));
    res.setHeader("Cache-Control", "no-store");
    res.json({ rows });
  }
}));

// ── top-sales in-memory 캐시 (heavy aggregation · TTL 3분) ─────────────────
const topSalesCache = new Map<string, { data: any; expiresAt: number }>();
const TOP_SALES_TTL = 10 * 60 * 1000; // 2026-07-29 · 3분 → 10분 (Phase 1 · 로딩 속도 개선)

// GET /api/stock-manage/top-sales?snapshot_date=YYYY-MM-DD&sort=sale|purchase|amount|closing&dir=asc|desc&limit=100&supplier=<이름>&supplier_code=<코드>
// 재고 스냅샷의 상품별 흐름 (xlsx 각 행) — 정렬·limit·범위 필터는 클라이언트에서
router.get("/api/stock-manage/top-sales", asyncHandler(async (req, res) => {
  const limit = Math.max(1, Math.min(50000, parseInt(String(req.query.limit ?? "500"), 10) || 500));
  let sort = String(req.query.sort ?? "sale");
  let dir  = String(req.query.dir ?? "desc").toLowerCase() === "asc" ? "asc" : "desc";
  const supplierFilter     = String(req.query.supplier ?? "").trim();
  const supplierCodeFilter = String(req.query.supplier_code ?? "").trim();
  // 하위 호환: closing_desc / closing_asc
  if (sort === "closing_desc") { sort = "closing"; dir = "desc"; }
  else if (sort === "closing_asc") { sort = "closing"; dir = "asc"; }
  const dateParam = String(req.query.snapshot_date ?? "").trim();
  // 기간 범위 (개월). 지정 시 해당 범위의 모든 스냅샷을 상품별로 aggregation
  const monthsParam = Math.max(0, Math.min(24, parseInt(String(req.query.months ?? "0"), 10) || 0));
  // 계절 필터 (spring/summer/autumn/winter) · 지정 시 년도 무관하게 해당 월들의 모든 데이터 aggregation
  //   season 이 우선 · months/snapshot_date 무시 (전 기간 대상)
  const seasonParam = String(req.query.season ?? "").trim().toLowerCase();
  const seasonMonths = await resolveSeasonMonths(seasonParam);
  // 2026-07-29 · Phase 2 · Lazy Loading (사용자 요청 · 조인 안하고 빠르게)
  //   skip_purchase=1 지정 시 · purchase_details 조인 SKIP · 매입주기·최근매입일 등은 null 반환
  //   클라이언트가 이후 별도 API 로 lazy fetch
  const skipPurchase = String(req.query.skip_purchase ?? "").trim() === "1";

  // 캐시 조회 (반복 요청 · 정렬/limit 변경 즉시 응답)
  const cacheKey = `${dateParam}::${monthsParam}::${seasonParam}::${sort}::${dir}::${limit}::${supplierFilter}::${supplierCodeFilter}::${skipPurchase ? "basic" : "full"}`;
  const cached = topSalesCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    res.setHeader("X-Cache", "HIT");
    return res.json(cached.data);
  }

  {
    // ── season 지정 시: 년도 무관 · 해당 월들의 전 데이터 aggregation ──
    //   months/snapshot_date 무시 · stock_history 전체에서 EXTRACT(MONTH) IN (...) 필터
    if (seasonMonths) {
      const rawRows: any[] = [];
      const PAGE = 1000;
      let from = 0;
      while (true) {
        let q = supabase
          .from("stock_history")
          .select("snapshot_date, product_code, product_name, supplier_name, supplier_code, spec, opening_stock, purchase_qty, sale_qty, disposal_qty, closing_stock, total_amount")
          .order("snapshot_date", { ascending: true });
        if (supplierFilter)     q = q.eq("supplier_name", supplierFilter);
        if (supplierCodeFilter) q = q.eq("supplier_code", supplierCodeFilter);
        const { data, error } = await q.range(from, from + PAGE - 1);
        if (error) {
          if (/relation|does not exist/i.test(error.message)) return res.json({ snapshot_date: null, dates: [], rows: [] });
          throw new Error(error.message);
        }
        if (!data || data.length === 0) break;
        // 계절 월 필터
        for (const r of data) if (inSeasonMonths(String(r.snapshot_date ?? ""), seasonMonths)) rawRows.push(r);
        if (data.length < PAGE) break;
        from += PAGE;
      }

      // products 매핑 (숨김 제외) — 결과 code 만 조회
      // 2026-07-29 · 사용자 원칙: 상품 관련만 products 조회 · 매입 관련은 purchase_details
      const codesRaw = Array.from(new Set(rawRows.map(r => String(r.product_code ?? "").trim()).filter(Boolean)));
      const productMap = new Map<string, { optimal_stock: number; sale_price: number; purchase_price: number; current_stock: number; min_order: number }>();
      const hiddenSet = new Set<string>();
      try {
        const CHUNK = 500;
        for (let i = 0; i < codesRaw.length; i += CHUNK) {
          const chunk = codesRaw.slice(i, i + CHUNK);
          const { data: page } = await supabase
            .from("products")
            .select("product_code, optimal_stock, sale_price, purchase_price, current_stock, min_order, hidden")
            .in("product_code", chunk);
          for (const p of page ?? []) {
            const code = String(p.product_code ?? "").trim();
            if (!code) continue;
            if (p.hidden === true) { hiddenSet.add(code); continue; }
            productMap.set(code, {
              optimal_stock: Number(p.optimal_stock ?? 0) || 0,
              sale_price:    Number(p.sale_price    ?? 0) || 0,
              purchase_price:Number(p.purchase_price ?? 0) || 0,
              current_stock: Number(p.current_stock ?? 0) || 0,
              min_order:     Number(p.min_order ?? 0) || 0,
            });
          }
        }
      } catch { /* silent */ }

      const byCode = new Map<string, any>();
      let latestSnapshot = "";
      const snapshotSet = new Set<string>();
      for (const r of rawRows) {
        const code = String(r.product_code ?? "").trim();
        if (!code || hiddenSet.has(code)) continue;
        const snap = String(r.snapshot_date ?? "");
        snapshotSet.add(snap);
        if (snap > latestSnapshot) latestSnapshot = snap;
        if (!byCode.has(code)) {
          const prod = productMap.get(code);
          byCode.set(code, {
            product_code:  code,
            product_name:  String(r.product_name ?? code),
            supplier:      r.supplier_name ?? null,
            spec:          r.spec ?? null,
            opening_stock: Number(r.opening_stock ?? 0) || 0,
            purchase_qty:  0,
            sale_qty:      0,
            disposal_qty:  0,
            closing_stock: Number(r.closing_stock ?? 0) || 0,
            total_amount:  0,
            first_snap:    snap,
            last_snap:     snap,
            optimal_stock: prod?.optimal_stock ?? 0,
            sale_price:    prod?.sale_price ?? 0,
            purchase_price:prod?.purchase_price ?? 0,
            current_stock: prod?.current_stock ?? 0,
            last_purchase_date: null as string | null,   // purchase_details 조인에서 세팅
            first_purchase_date: null as string | null,  // purchase_details 조인에서 세팅
            purchase_count: 0,                            // purchase_details 조인에서 세팅
            min_order:     prod?.min_order ?? 0,
          });
        }
        const agg = byCode.get(code)!;
        agg.purchase_qty += Number(r.purchase_qty ?? 0) || 0;
        agg.sale_qty     += Number(r.sale_qty ?? 0) || 0;
        agg.disposal_qty += Number(r.disposal_qty ?? 0) || 0;
        agg.total_amount += Number(r.total_amount ?? 0) || 0;
        if (snap < agg.first_snap) {
          agg.first_snap = snap;
          agg.opening_stock = Number(r.opening_stock ?? 0) || 0;
        }
        if (snap > agg.last_snap) {
          agg.last_snap = snap;
          agg.closing_stock = Number(r.closing_stock ?? 0) || 0;
        }
        // 2026-07-29 · 매입일 stock_history fallback 완전 제거 · 아래 purchase_details 조인만 신뢰
      }

      // ═══ purchase_details 조인 (season 모드 신규 · 2026-07-29) ═══
      //   2026-07-29 · Phase 2 · Lazy Loading · skip_purchase 시 조인 SKIP (빠른 응답)
      if (!skipPurchase) try {
        const codesInResult = Array.from(byCode.keys());
        const CHUNK = 200;
        const PAGE = 1000;
        const purchaseInfoMap = new Map<string, { lastDate: string | null; firstDate: string | null; totalQty: number; totalAmount: number; lastAmount: number; dateSet: Set<string> }>();
        for (let i = 0; i < codesInResult.length; i += CHUNK) {
          const chunk = codesInResult.slice(i, i + CHUNK);
          let fromRow = 0;
          while (true) {
            const { data: pdRows, error: pdError } = await supabase
              .from("purchase_details")
              .select("product_code, purchase_date, quantity, amount, total")
              .in("product_code", chunk)
              .order("purchase_date", { ascending: false })
              .range(fromRow, fromRow + PAGE - 1);
            if (pdError) throw new Error(pdError.message);
            if (!pdRows || pdRows.length === 0) break;
            for (const r of pdRows) {
              const code = String(r.product_code ?? "").trim();
              if (!code) continue;
              const cur = purchaseInfoMap.get(code) ?? { lastDate: null, firstDate: null, totalQty: 0, totalAmount: 0, lastAmount: 0, dateSet: new Set<string>() };
              const d = String(r.purchase_date ?? "");
              const amt = Number(r.total ?? r.amount ?? 0) || 0;
              const qty = Number(r.quantity ?? 0) || 0;
              if (d && (!cur.lastDate || d > cur.lastDate)) { cur.lastDate = d; cur.lastAmount = amt; }
              if (d && (!cur.firstDate || d < cur.firstDate)) { cur.firstDate = d; }
              cur.totalQty += qty;
              cur.totalAmount += amt;
              if (d) cur.dateSet.add(d);
              purchaseInfoMap.set(code, cur);
            }
            if (pdRows.length < PAGE) break;
            fromRow += PAGE;
          }
        }
        // 각 agg 에 반영 · 무조건 purchase_details 값 사용
        for (const agg of byCode.values()) {
          const info = purchaseInfoMap.get(agg.product_code);
          if (info && info.dateSet.size > 0) {
            agg.last_purchase_date = info.lastDate;
            agg.first_purchase_date = info.firstDate;
            agg.purchase_count = info.dateSet.size;
            agg.purchase_total_qty = info.totalQty;
            agg.purchase_total_amount = info.totalAmount;
            agg.purchase_last_amount = info.lastAmount;
          }
        }
        console.log(`[top-sales/season] purchase_details 조인: ${purchaseInfoMap.size}개 상품 · distinct date 카운트`);
      } catch (e: any) {
        console.warn(`[top-sales/season] purchase_details 조인 실패:`, e?.message);
      }

      const aggRows = Array.from(byCode.values()).map(({ first_snap: _fs, last_snap: _ls, ...rest }) => rest);
      const sign = dir === "asc" ? 1 : -1;
      const sorted = aggRows.sort((a, b) => {
        switch (sort) {
          case "purchase": return sign * (a.purchase_qty  - b.purchase_qty);
          case "amount":   return sign * (a.sale_price    - b.sale_price);
          case "closing":  return sign * (a.closing_stock - b.closing_stock);
          case "sale":
          default:         return sign * (a.sale_qty      - b.sale_qty);
        }
      });
      const datesArr = Array.from(snapshotSet).sort((a, b) => b.localeCompare(a));
      const payload = {
        snapshot_date: latestSnapshot || null,
        period_type: null,
        months: 0,
        season: seasonParam,
        season_months: seasonMonths,
        dates: datesArr,
        dates_with_period: datesArr.map(d => ({ snapshot_date: d, period_type: null })),
        rows: sorted.slice(0, limit),
      };
      topSalesCache.set(cacheKey, { data: payload, expiresAt: Date.now() + TOP_SALES_TTL });
      res.setHeader("X-Cache", "MISS");
      return res.json(payload);
    }
    // ── months 지정 시: 범위 aggregation 모드 ──
    if (monthsParam > 0) {
      // 2026-07-16 fix: 정확히 N개월 back (오늘 day 유지 · 이전엔 1일로 고정돼서 실제로는 최대 45일 반환)
      const today = new Date();
      const cutoff = new Date(today.getFullYear(), today.getMonth() - monthsParam, today.getDate());
      const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

      // 2026-07-29 · Phase 3 (A) · Supabase RPC get_stock_flow 사용 · 단일 SQL 조인 · 훨씬 빠름
      //   supplier 필터 없을 때만 RPC (RPC 함수에 supplier 필터 없어서)
      //   조인·집계·purchase_details 모두 DB에서 한 번에 처리
      if (!supplierFilter && !supplierCodeFilter) {
        try {
          const t0 = Date.now();
          const { data: rpcData, error: rpcError } = await supabase.rpc("get_stock_flow", {
            p_from: cutoffStr,
            p_to: todayStr,
          });
          if (!rpcError && Array.isArray(rpcData)) {
            const rpcMs = Date.now() - t0;
            // hidden 필터는 이미 함수에서 처리됨
            // 2026-07-30 · RPC 함수 확장 · sale_qty_month · sale_amount_month · last_purchase_qty 포함
            //   기존 batch fetch (수십 라운드) 제거 · 단일 쿼리 · 대폭 개선
            const rows = rpcData.map((r: any) => ({
              product_code:  r.product_code,
              product_name:  r.product_name,
              supplier:      r.supplier,
              spec:          r.spec,
              opening_stock: r.opening_stock,
              purchase_qty:  r.purchase_qty,
              sale_qty:      r.sale_qty,
              disposal_qty:  r.disposal_qty,
              closing_stock: r.closing_stock,
              total_amount:  r.total_amount,
              optimal_stock: r.optimal_stock,
              sale_price:    r.sale_price,
              purchase_price:r.purchase_price,
              current_stock: r.current_stock,
              min_order:     r.min_order,
              last_purchase_date:  r.last_purchase_date,
              first_purchase_date: r.first_purchase_date,
              purchase_count:      r.purchase_count ?? 0,
              purchase_total_qty:  r.purchase_total_qty ?? 0,
              purchase_total_amount: r.purchase_total_amount ?? 0,
              sale_qty_month:      r.sale_qty_month ?? 0,
              sale_amount_month:   r.sale_amount_month ?? 0,
              last_purchase_qty:   r.last_purchase_qty ?? null,
            }));
            // 2026-07-30 · 사용자 지적 · 반품필요 리스트 · sale_qty_month · last_purchase_qty 안 나옴
            //   RPC 반환에 이 두 필드 없음 · 서버에서 batch fetch 로 보강
            //   대상 · rows.slice(0, limit) 만 (전체 · 성능 부담)
            //   2026-07-30 · RPC 함수가 이미 sale_qty_month·last_purchase_qty 반환하면 · 부분 skip (성능)
            //   2026-08-03 · sale_qty_60d · sale_qty_90d 추가 · 반품필요 리스트 · 1/2/3달 판매 컬럼
            //     · 60d/90d 는 RPC 에 없으므로 항상 fetch · 30d 는 RPC 재사용 가능
            const needsMonthBoost = rows.length > 0 && rpcData[0].sale_qty_month === undefined;
            const needsExtended = rows.length > 0; // 60d/90d 는 항상 필요
            try {
              const targetCodes = needsExtended ? rows.slice(0, limit).map(r => String(r.product_code ?? "").trim()).filter(Boolean) : [];
              if (targetCodes.length > 0) {
                // ── 1) purchase_details · last_purchase_qty · 각 상품 최근 매입일의 수량 (기존 boost 조건 유지)
                const lastQtyMap = new Map<string, number>();
                const CHUNK = 200; const PAGE = 1000;
                if (needsMonthBoost) {
                  for (let i = 0; i < targetCodes.length; i += CHUNK) {
                    const chunk = targetCodes.slice(i, i + CHUNK);
                    let fromRow = 0;
                    while (true) {
                      const { data: pd } = await supabase
                        .from("purchase_details")
                        .select("product_code, purchase_date, quantity")
                        .in("product_code", chunk)
                        .order("purchase_date", { ascending: false })
                        .range(fromRow, fromRow + PAGE - 1);
                      if (!pd || pd.length === 0) break;
                      for (const r of pd) {
                        const code = String(r.product_code ?? "").trim();
                        if (!code || lastQtyMap.has(code)) continue;
                        lastQtyMap.set(code, Number(r.quantity ?? 0) || 0);
                      }
                      if (pd.length < PAGE) break;
                      fromRow += PAGE;
                    }
                  }
                }
                // ── 2) stock_history · 최근 90일 · sale_qty + total_amount · 30d/60d/90d 윈도우 각각 합산
                //   (2026-08-03 · 60d/90d 확장 · 90일까지 fetch · window sum)
                const _now = Date.now();
                const day30 = new Date(_now - 30 * 86400 * 1000).toISOString().slice(0, 10);
                const day60 = new Date(_now - 60 * 86400 * 1000).toISOString().slice(0, 10);
                const day90 = new Date(_now - 90 * 86400 * 1000).toISOString().slice(0, 10);
                const salesWindowMap = new Map<string, { qty30: number; amt30: number; qty60: number; qty90: number }>();
                for (let i = 0; i < targetCodes.length; i += CHUNK) {
                  const chunk = targetCodes.slice(i, i + CHUNK);
                  let fromRow = 0;
                  while (true) {
                    const { data: sh } = await supabase
                      .from("stock_history")
                      .select("product_code, sale_qty, total_amount, snapshot_date")
                      .in("product_code", chunk)
                      .gte("snapshot_date", day90)
                      .lte("snapshot_date", todayStr)
                      .range(fromRow, fromRow + PAGE - 1);
                    if (!sh || sh.length === 0) break;
                    for (const r of sh) {
                      const code = String(r.product_code ?? "").trim();
                      if (!code) continue;
                      const snap = String(r.snapshot_date ?? "");
                      const q = Number(r.sale_qty ?? 0) || 0;
                      const a = Number(r.total_amount ?? 0) || 0;
                      const cur = salesWindowMap.get(code) ?? { qty30: 0, amt30: 0, qty60: 0, qty90: 0 };
                      // 90d 는 fetch 범위 전체
                      cur.qty90 += q;
                      // 60d · snap >= day60
                      if (snap >= day60) cur.qty60 += q;
                      // 30d · snap >= day30
                      if (snap >= day30) { cur.qty30 += q; cur.amt30 += a; }
                      salesWindowMap.set(code, cur);
                    }
                    if (sh.length < PAGE) break;
                    fromRow += PAGE;
                  }
                }
                // 3) rows 에 필드 주입
                for (const r of rows) {
                  const code = String(r.product_code ?? "").trim();
                  if (needsMonthBoost) {
                    r.last_purchase_qty = lastQtyMap.get(code) ?? null;
                  }
                  const w = salesWindowMap.get(code);
                  if (needsMonthBoost) {
                    r.sale_qty_month    = w?.qty30 ?? 0;
                    r.sale_amount_month = w?.amt30 ?? 0;
                  }
                  // 2026-08-03 · 반품필요 리스트 · 60/90일 판매량 (항상 주입)
                  (r as any).sale_qty_60d = w?.qty60 ?? 0;
                  (r as any).sale_qty_90d = w?.qty90 ?? 0;
                }
              }
            } catch (e: any) {
              console.warn(`[top-sales/rpc] boost fetch 실패:`, e?.message);
            }
            // 클라이언트 정렬
            const sign = dir === "asc" ? 1 : -1;
            const sorted = rows.sort((a: any, b: any) => {
              switch (sort) {
                case "purchase": return sign * (a.purchase_qty  - b.purchase_qty);
                case "amount":   return sign * (a.sale_price    - b.sale_price);
                case "closing":  return sign * (a.closing_stock - b.closing_stock);
                case "sale":
                default:         return sign * (a.sale_qty      - b.sale_qty);
              }
            });
            const payload = {
              snapshot_date: todayStr,
              period_type: null,
              months: monthsParam,
              season: null,
              dates: [],
              dates_with_period: [],
              rows: sorted.slice(0, limit),
              _rpc_ms: rpcMs,
            };
            topSalesCache.set(cacheKey, { data: payload, expiresAt: Date.now() + TOP_SALES_TTL });
            res.setHeader("X-Cache", "MISS");
            res.setHeader("X-Source", "rpc-fast");
            console.log(`[top-sales/rpc] months=${monthsParam} · ${rows.length} rows · ${rpcMs}ms`);
            return res.json(payload);
          } else if (rpcError) {
            console.warn(`[top-sales/rpc] RPC 실패 · fallback:`, rpcError.message);
          }
        } catch (e: any) {
          console.warn(`[top-sales/rpc] 예외 · fallback:`, e?.message);
        }
      }
      // fallback · 기존 로직 (supplier 필터 또는 RPC 실패 시)

      // stock_history 페이지네이션 조회
      const rawRows: any[] = [];
      const PAGE = 1000;
      let from = 0;
      while (true) {
        let q = supabase
          .from("stock_history")
          .select("snapshot_date, product_code, product_name, supplier_name, spec, opening_stock, purchase_qty, sale_qty, disposal_qty, closing_stock, total_amount")
          .gte("snapshot_date", cutoffStr)
          .order("snapshot_date", { ascending: true });
        if (supplierFilter)     q = q.eq("supplier_name", supplierFilter);
        if (supplierCodeFilter) q = q.eq("supplier_code", supplierCodeFilter);
        const { data, error } = await q.range(from, from + PAGE - 1);
        if (error) {
          if (/relation|does not exist/i.test(error.message)) return res.json({ snapshot_date: null, dates: [], rows: [] });
          throw new Error(error.message);
        }
        if (!data || data.length === 0) break;
        rawRows.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
      }

      // products 매핑 (숨김 제외)
      const productMap = new Map<string, { optimal_stock: number; sale_price: number; purchase_price: number; current_stock: number; last_purchase_date: string | null; min_order: number }>();
      const hiddenSet = new Set<string>();
      try {
        const OP_PAGE = 1000;
        let opFrom = 0;
        while (true) {
          const { data: page } = await supabase
            .from("products")
            .select("product_code, optimal_stock, sale_price, purchase_price, current_stock, last_purchase_date, min_order, hidden")
            .range(opFrom, opFrom + OP_PAGE - 1);
          if (!page || page.length === 0) break;
          for (const p of page) {
            const code = String(p.product_code ?? "").trim();
            if (!code) continue;
            if (p.hidden === true) { hiddenSet.add(code); continue; }
            productMap.set(code, {
              optimal_stock: Number(p.optimal_stock ?? 0) || 0,
              sale_price:    Number(p.sale_price    ?? 0) || 0,
              purchase_price:Number(p.purchase_price ?? 0) || 0,
              current_stock: Number(p.current_stock ?? 0) || 0,
              last_purchase_date: p.last_purchase_date ?? null,
              min_order:     Number(p.min_order ?? 0) || 0,
            });
          }
          if (page.length < OP_PAGE) break;
          opFrom += OP_PAGE;
        }
      } catch { /* silent */ }

      // 상품별 aggregation
      // - 유량 (purchase/sale/disposal/total_amount): SUM
      // - opening_stock: 가장 이른 스냅샷 값
      // - closing_stock: 가장 늦은 스냅샷 값
      const byCode = new Map<string, any>();
      let latestSnapshot = "";
      const snapshotSet = new Set<string>();
      for (const r of rawRows) {
        const code = String(r.product_code ?? "").trim();
        if (!code || hiddenSet.has(code)) continue;
        const snap = String(r.snapshot_date ?? "");
        snapshotSet.add(snap);
        if (snap > latestSnapshot) latestSnapshot = snap;
        if (!byCode.has(code)) {
          byCode.set(code, {
            product_code:  code,
            product_name:  String(r.product_name ?? code),
            supplier:      r.supplier_name ?? null,
            spec:          r.spec ?? null,
            opening_stock: Number(r.opening_stock ?? 0) || 0,
            purchase_qty:  0,
            sale_qty:      0,
            disposal_qty:  0,
            closing_stock: Number(r.closing_stock ?? 0) || 0,
            total_amount:  0,
            first_snap:    snap,
            last_snap:     snap,
            optimal_stock: productMap.get(code)?.optimal_stock ?? 0,
            sale_price:    productMap.get(code)?.sale_price ?? 0,
            purchase_price:productMap.get(code)?.purchase_price ?? 0,
            current_stock: productMap.get(code)?.current_stock ?? 0,
            // 2026-07-29 · 사용자 요청 · 매입 관련 필드는 모두 purchase_details 조인에서만 세팅
            //   (products.last_purchase_date 및 stock_history snapshot 기반 fallback 모두 제거)
            last_purchase_date: null as string | null,
            min_order:     productMap.get(code)?.min_order ?? 0,
            purchase_count: 0,
            first_purchase_date: null as string | null,
          });
        }
        const agg = byCode.get(code)!;
        agg.purchase_qty += Number(r.purchase_qty ?? 0) || 0;
        agg.sale_qty     += Number(r.sale_qty ?? 0) || 0;
        agg.disposal_qty += Number(r.disposal_qty ?? 0) || 0;
        agg.total_amount += Number(r.total_amount ?? 0) || 0;
        // opening = 가장 이른 스냅샷의 opening
        if (snap < agg.first_snap) {
          agg.first_snap = snap;
          agg.opening_stock = Number(r.opening_stock ?? 0) || 0;
        }
        // closing = 가장 늦은 스냅샷의 closing
        if (snap > agg.last_snap) {
          agg.last_snap = snap;
          agg.closing_stock = Number(r.closing_stock ?? 0) || 0;
        }
        // 2026-07-29 · 사용자 요청 "매입이력은 모두 매입db 에서 가져오게" · stock_history fallback 제거
        // (매입 관련 필드는 purchase_details 조인에서만 세팅 · 아래 참고)
      }
      // 2026-07-28 · 사용자 요청 "매입주기 이상 · 공급사재고와 동일하게" · purchase_details 조인 (기간 무관 · 상품별 총 이력 기준)
      //   공급사재고 리스트가 사용하는 매입주기 로직 재사용
      //   추가 · dates 배열 저장 (사용자 요청 · 최근·그 전 매입일 사이 판매량 계산용)
      //   2026-07-29 · Phase 2 · Lazy Loading · skip_purchase 시 조인 SKIP
      const codesInResult = Array.from(byCode.keys());
      // 2026-07-30 · 사용자 요청 · lastQty 추가 (최근 매입일의 수량 · 반품필요 리스트 컬럼)
      const purchaseInfoMap = new Map<string, { lastDate: string | null; firstDate: string | null; count: number; totalQty: number; totalAmount: number; lastAmount: number; lastQty: number; dates: string[]; dateSet: Set<string> }>();
      if (!skipPurchase) try {
        const CHUNK = 200;   // codes chunk 축소
        const PAGE = 1000;   // row 페이지네이션
        for (let i = 0; i < codesInResult.length; i += CHUNK) {
          const chunk = codesInResult.slice(i, i + CHUNK);
          // 페이지네이션 · 1000행 초과 시 다음 range 조회
          let fromRow = 0;
          const allPdRows: any[] = [];
          while (true) {
            const { data: pdRows, error: pdError } = await supabase
              .from("purchase_details")
              .select("product_code, purchase_date, quantity, amount, total")
              .in("product_code", chunk)
              .order("purchase_date", { ascending: false })
              .range(fromRow, fromRow + PAGE - 1);
            if (pdError) throw new Error(pdError.message);
            if (!pdRows || pdRows.length === 0) break;
            allPdRows.push(...pdRows);
            if (pdRows.length < PAGE) break;
            fromRow += PAGE;
          }
          const pdRows = allPdRows;
          for (const r of pdRows ?? []) {
            const code = String(r.product_code ?? "").trim();
            if (!code) continue;
            const cur = purchaseInfoMap.get(code) ?? { lastDate: null, firstDate: null, count: 0, totalQty: 0, totalAmount: 0, lastAmount: 0, lastQty: 0, dates: [], dateSet: new Set<string>() };
            const d = String(r.purchase_date ?? "");
            const amt = Number(r.total ?? r.amount ?? 0) || 0;
            const qty = Number(r.quantity ?? 0) || 0;
            if (d && !cur.lastDate) { cur.lastDate = d; cur.lastAmount = amt; cur.lastQty = qty; }
            else if (d && d > (cur.lastDate ?? "")) { cur.lastDate = d; cur.lastAmount = amt; cur.lastQty = qty; }
            if (d && (!cur.firstDate || d < cur.firstDate)) { cur.firstDate = d; }
            cur.totalQty += qty;
            cur.totalAmount += amt;
            if (d) { cur.dates.push(d); cur.dateSet.add(d); }
            purchaseInfoMap.set(code, cur);
          }
        }
        // count = distinct date 수 (매입주기 계산에 사용) · row 수가 아님
        for (const info of purchaseInfoMap.values()) {
          info.count = info.dateSet.size;
        }
        // 2026-07-29 · 매치 누락 디버그 (사용자 지적: 매입이력 있는데 주기 안 나옴)
        const missingCodes = codesInResult.filter(c => !purchaseInfoMap.has(c));
        const singleDate = [...purchaseInfoMap.entries()].filter(([, v]) => v.count === 1);
        console.log(`[top-sales/months] purchase_details 조인: ${purchaseInfoMap.size}/${codesInResult.length}개 매치 · 누락 ${missingCodes.length}개 · 1회만 매입 ${singleDate.length}개`);
        if (missingCodes.length > 0 && missingCodes.length <= 20) {
          console.log(`[top-sales/months] 누락 codes 샘플:`, missingCodes.slice(0, 10));
        }
      } catch (e: any) {
        console.warn(`[top-sales/months] purchase_details 조인 실패:`, e?.message);
      }
      // 2026-07-28 · 사용자 요청 · 회전율 = 최근매입일 ~ 그 전매입일 사이 판매량
      //   각 상품 · 최근 2건 매입일 사이 (배타적) 의 stock_history sale_qty 합산 → sale_qty_cycle
      //   전체 rawRows 를 상품별·날짜별로 그룹 · 두 매입일 사이 판매만 집계
      const salesByCodeByDate = new Map<string, Map<string, { qty: number; amount: number }>>();
      for (const r of rawRows) {
        const code = String(r.product_code ?? "").trim();
        if (!code) continue;
        const snap = String(r.snapshot_date ?? "");
        if (!snap) continue;
        const q = Number(r.sale_qty ?? 0) || 0;
        const a = Number(r.total_amount ?? 0) || 0;
        if (q <= 0 && a <= 0) continue;
        const bySup = salesByCodeByDate.get(code) ?? new Map<string, { qty: number; amount: number }>();
        const prev = bySup.get(snap) ?? { qty: 0, amount: 0 };
        bySup.set(snap, { qty: prev.qty + q, amount: prev.amount + a });
        salesByCodeByDate.set(code, bySup);
      }
      // 2026-07-30 · 사용자 요청 · 반품필요 · 최근 한달 판매량 + 판매액 계산
      //   salesByCodeByDate 재사용 · 오늘 - 30일 이내 snapshot 합산
      // 2026-08-03 · 60일 · 90일 판매량도 추가 (반품필요 · 1/2/3달 판매 컬럼)
      const _todayIso = new Date().toISOString().slice(0, 10);
      const _monthAgo = new Date(Date.now() - 30 * 86400 * 1000).toISOString().slice(0, 10);
      const _day60    = new Date(Date.now() - 60 * 86400 * 1000).toISOString().slice(0, 10);
      const _day90    = new Date(Date.now() - 90 * 86400 * 1000).toISOString().slice(0, 10);
      // 각 상품 · purchase_details 값 반영 + sale_qty_cycle 계산
      // 2026-07-29 · 사용자 요청 · 매입 관련 필드는 무조건 purchase_details 값 사용 (조건부 override X)
      for (const agg of byCode.values()) {
        // 2026-07-30 · sale_qty_month + sale_amount_month · 최근 30일 (독립 계산 · purchase 유무 무관)
        // 2026-08-03 · sale_qty_60d · sale_qty_90d 병렬 계산 (같은 loop)
        {
          const bySup = salesByCodeByDate.get(agg.product_code);
          let salesMonth = 0;
          let amountMonth = 0;
          let sales60 = 0;
          let sales90 = 0;
          if (bySup) {
            for (const [snap, v] of bySup) {
              if (snap > _todayIso) continue;
              if (snap >= _monthAgo) {
                salesMonth += v.qty;
                amountMonth += v.amount;
              }
              if (snap >= _day60) sales60 += v.qty;
              if (snap >= _day90) sales90 += v.qty;
            }
          }
          agg.sale_qty_month = salesMonth;
          agg.sale_amount_month = amountMonth;
          agg.sale_qty_60d = sales60;
          agg.sale_qty_90d = sales90;
        }
        const info = purchaseInfoMap.get(agg.product_code);
        if (info && info.count > 0) {
          agg.purchase_count = info.count;
          agg.first_purchase_date = info.firstDate;
          agg.last_purchase_date = info.lastDate;   // 무조건 purchase_details lastDate 사용
          agg.purchase_total_qty = info.totalQty;
          agg.purchase_total_amount = info.totalAmount;
          agg.purchase_last_amount = info.lastAmount;
          // 2026-07-30 · 사용자 요청 · 반품필요 리스트 컬럼용
          agg.last_purchase_qty = info.lastQty;
          // sale_qty_cycle · 최근2건 매입 사이 판매
          const sortedDates = [...new Set(info.dates)].sort().reverse();
          if (sortedDates.length >= 2) {
            const latest = sortedDates[0];
            const prev = sortedDates[1];
            const bySup = salesByCodeByDate.get(agg.product_code);
            let cycleSales = 0;
            if (bySup) {
              for (const [snap, v] of bySup) {
                if (snap > prev && snap <= latest) cycleSales += v.qty;
              }
            }
            agg.sale_qty_cycle = cycleSales;
            agg.cycle_from = prev;
            agg.cycle_to = latest;
          } else {
            agg.sale_qty_cycle = 0;
            agg.cycle_from = null;
            agg.cycle_to = null;
          }
        } else {
          agg.sale_qty_cycle = 0;
          agg.cycle_from = null;
          agg.cycle_to = null;
        }
      }
      const aggRows = Array.from(byCode.values()).map(({ first_snap, last_snap, ...rest }) => rest);
      const sign = dir === "asc" ? 1 : -1;
      const sorted = aggRows.sort((a, b) => {
        switch (sort) {
          case "purchase": return sign * (a.purchase_qty  - b.purchase_qty);
          case "amount":   return sign * (a.sale_price    - b.sale_price);
          case "closing":  return sign * (a.closing_stock - b.closing_stock);
          case "sale":
          default:         return sign * (a.sale_qty      - b.sale_qty);
        }
      });
      // 2026-07-28 · 사용자 요청 · 3개월 재고회전율 · 항상 별도 3개월 aggregation 계산
      //   monthsParam === 3 이면 기존 값 재사용 · 아니면 별도 3개월 stock_history 조회
      //   sale_qty_3m · avg_stock_3m · turnover_3m 필드 추가
      const compute3mMap = new Map<string, { sale_qty_3m: number; opening_3m: number; closing_3m: number }>();
      if (monthsParam === 3) {
        // 기존 aggregation 결과 재사용
        for (const agg of aggRows) {
          compute3mMap.set(agg.product_code, {
            sale_qty_3m: agg.sale_qty,
            opening_3m: agg.opening_stock,
            closing_3m: agg.closing_stock,
          });
        }
      } else {
        // 별도 3개월 aggregation
        const today3 = new Date();
        const cutoff3 = new Date(today3.getFullYear(), today3.getMonth() - 3, today3.getDate());
        const cutoff3Str = `${cutoff3.getFullYear()}-${String(cutoff3.getMonth() + 1).padStart(2, "0")}-${String(cutoff3.getDate()).padStart(2, "0")}`;
        try {
          const rows3: any[] = [];
          const PAGE3 = 1000;
          let from3 = 0;
          while (true) {
            let q3 = supabase.from("stock_history")
              .select("snapshot_date, product_code, opening_stock, sale_qty, closing_stock")
              .gte("snapshot_date", cutoff3Str)
              .order("snapshot_date", { ascending: true });
            if (supplierFilter)     q3 = q3.eq("supplier_name", supplierFilter);
            if (supplierCodeFilter) q3 = q3.eq("supplier_code", supplierCodeFilter);
            const { data, error } = await q3.range(from3, from3 + PAGE3 - 1);
            if (error || !data || data.length === 0) break;
            rows3.push(...data);
            if (data.length < PAGE3) break;
            from3 += PAGE3;
          }
          const by3 = new Map<string, { first_snap: string; last_snap: string; opening: number; closing: number; sale_qty: number }>();
          for (const r of rows3) {
            const code = String(r.product_code ?? "").trim();
            if (!code) continue;
            const snap = String(r.snapshot_date ?? "");
            if (!by3.has(code)) {
              by3.set(code, {
                first_snap: snap, last_snap: snap,
                opening: Number(r.opening_stock ?? 0) || 0,
                closing: Number(r.closing_stock ?? 0) || 0,
                sale_qty: 0,
              });
            }
            const agg3 = by3.get(code)!;
            agg3.sale_qty += Number(r.sale_qty ?? 0) || 0;
            if (snap < agg3.first_snap) { agg3.first_snap = snap; agg3.opening = Number(r.opening_stock ?? 0) || 0; }
            if (snap > agg3.last_snap)  { agg3.last_snap  = snap; agg3.closing = Number(r.closing_stock ?? 0) || 0; }
          }
          for (const [code, v] of by3) {
            compute3mMap.set(code, { sale_qty_3m: v.sale_qty, opening_3m: v.opening, closing_3m: v.closing });
          }
        } catch { /* silent */ }
      }
      // 각 행에 3개월 필드 추가
      for (const agg of aggRows) {
        const m3 = compute3mMap.get(agg.product_code);
        if (m3) {
          agg.sale_qty_3m = m3.sale_qty_3m;
          agg.avg_stock_3m = (m3.opening_3m + m3.closing_3m) / 2;
          agg.turnover_3m = agg.avg_stock_3m > 0 ? m3.sale_qty_3m / agg.avg_stock_3m : 0;
        } else {
          agg.sale_qty_3m = 0;
          agg.avg_stock_3m = 0;
          agg.turnover_3m = 0;
        }
      }
      const datesArr = Array.from(snapshotSet).sort((a, b) => b.localeCompare(a));
      const payload = {
        snapshot_date: latestSnapshot || null,
        period_type: null,
        months: monthsParam,
        cutoff: cutoffStr,
        dates: datesArr,
        dates_with_period: datesArr.map(d => ({ snapshot_date: d, period_type: null })),
        rows: sorted.slice(0, limit),
      };
      topSalesCache.set(cacheKey, { data: payload, expiresAt: Date.now() + TOP_SALES_TTL });
      res.setHeader("X-Cache", "MISS");
      return res.json(payload);
    }
    // ── 아래부터는 단일 스냅샷 모드 (기존 로직) ──

    // 대상 스냅샷 결정 우선순위:
    //   1. 클라이언트가 명시한 snapshot_date
    //   2. 오늘 dd 기준 현재 기간(초/중/하순) 의 가장 최근 스냅샷
    //   3. fallback: 전체에서 가장 최근 스냅샷
    let targetDate = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : "";
    if (!targetDate) {
      const today = new Date();
      const dd = today.getDate();
      const currentPeriod: "early" | "mid" | "late" =
        dd <= 10 ? "early" : dd <= 20 ? "mid" : "late";
      // 현재 기간 매칭 최신 스냅샷 (period_type 컬럼 조회)
      const { data: matchPeriod } = await supabase
        .from("stock_history")
        .select("snapshot_date")
        .eq("period_type", currentPeriod)
        .order("snapshot_date", { ascending: false })
        .limit(1);
      if (matchPeriod?.[0]?.snapshot_date) {
        targetDate = matchPeriod[0].snapshot_date;
      } else {
        // fallback: 전체 최신
        const { data: latest } = await supabase
          .from("stock_history")
          .select("snapshot_date")
          .order("snapshot_date", { ascending: false })
          .limit(1);
        targetDate = latest?.[0]?.snapshot_date ?? "";
      }
    }
    if (!targetDate) return res.json({ snapshot_date: null, dates: [], rows: [] });

    // 사용 가능한 모든 스냅샷 날짜 (+ period_type 매핑)
    //   기존: stock_history 전체 5000행 스캔 → 무거움 (스냅샷 * 상품수)
    //   개선: distinct snapshot_date 만 뽑음 (Supabase Distinct via select head)
    //   fallback: 실패 시 기존 방식
    let dates: string[] = [];
    let dateToPeriodMap = new Map<string, string>();
    try {
      // Postgres 에서 distinct 를 위한 트릭: 스냅샷 개수는 상대적으로 적음 (~30개/월 x 몇개월)
      // stock_history 에서 distinct(snapshot_date, period_type) 만 필요 → 페이지 크기 넉넉히 · Supabase 는 SELECT DISTINCT 미지원
      // → snapshot_date 별 첫 row 만 필요하므로 order by snapshot_date desc + limit 로 sample 확보
      //    (같은 스냅샷 여러 row 나오는 건 감수 · Set 으로 dedupe)
      const { data: dRows } = await supabase
        .from("stock_history")
        .select("snapshot_date, period_type")
        .order("snapshot_date", { ascending: false })
        .limit(1000);
      const set = new Set<string>();
      for (const d of dRows ?? []) {
        const dt = d.snapshot_date;
        const pt = d.period_type;
        if (!dt) continue;
        if (!set.has(dt)) { set.add(dt); if (pt) dateToPeriodMap.set(dt, pt); }
      }
      dates = Array.from(set).sort((a, b) => b.localeCompare(a));
    } catch (e: any) {
      console.warn("[top-sales] dates 조회 실패, 계속:", e?.message);
    }
    const dates_with_period = dates.map(dt => ({ snapshot_date: dt, period_type: dateToPeriodMap.get(dt) ?? null }));
    const targetPeriodType = dateToPeriodMap.get(targetDate) ?? null;

    // 해당 스냅샷 데이터 조회
    //   기존: 스냅샷 전체 3000+ 행 페이지네이션 로드 → 클라 sort → slice(limit)
    //   개선: 서버 정렬 지원 컬럼(sale/purchase/closing)이면 DB order+limit 로 최소 로드
    //         hidden 필터 여유분: limit * 3 로 넉넉히
    const data: any[] = [];
    const dbSortColumn: Record<string, string> = {
      sale: "sale_qty",
      purchase: "purchase_qty",
      closing: "closing_stock",
    };
    const dbCol = dbSortColumn[sort];
    if (dbCol && !supplierFilter && !supplierCodeFilter) {
      // 서버 정렬 지원 · limit 확장 (hidden 제거 후에도 채우기 위해)
      const fetchLimit = Math.max(limit * 3, 300);
      // 2026-08-06 · Supabase 1000행 cap 우회 · fetchAllWithRange
      try {
        const page = await fetchAllWithRange<any>(() => supabase
          .from("stock_history")
          .select("product_code, product_name, supplier_code, supplier_name, spec, opening_stock, purchase_qty, sale_qty, disposal_qty, internal_qty, adjustment_qty, closing_stock, total_amount")
          .eq("snapshot_date", targetDate)
          .order(dbCol, { ascending: dir === "asc" }), fetchLimit);
        data.push(...page);
      } catch (err: any) {
        if (/relation|does not exist/i.test(err?.message ?? "")) return res.json({ snapshot_date: null, dates: [], rows: [] });
        throw err;
      }
    } else {
      // fallback: 공급사 필터 있거나 정렬 컬럼 미지원 → 기존 전체 페이지네이션
      const PAGE = 1000;
      let from = 0;
      while (true) {
        let q = supabase
          .from("stock_history")
          .select("product_code, product_name, supplier_code, supplier_name, spec, opening_stock, purchase_qty, sale_qty, disposal_qty, internal_qty, adjustment_qty, closing_stock, total_amount")
          .eq("snapshot_date", targetDate);
        if (supplierCodeFilter) q = q.eq("supplier_code", supplierCodeFilter);
        else if (supplierFilter) q = q.eq("supplier_name", supplierFilter);
        const { data: page, error } = await q.range(from, from + PAGE - 1);
        if (error) {
          if (/relation|does not exist/i.test(error.message)) return res.json({ snapshot_date: null, dates: [], rows: [] });
          throw new Error(error.message);
        }
        if (!page || page.length === 0) break;
        data.push(...page);
        if (page.length < PAGE) break;
        from += PAGE;
      }
    }

    // products 조회: 결과 rows 의 product_code 만 in() 으로 최소 fetch (5000 → ~100)
    //   기존: 전체 products 페이지네이션 로드 (5000+행)
    //   개선: 이번 응답에 필요한 코드만
    const productMap = new Map<string, { optimal_stock: number; sale_price: number; purchase_price: number; current_stock: number; last_purchase_date: string | null; min_order: number }>();
    const hiddenSet = new Set<string>();
    const codesInResult = Array.from(new Set(data.map(r => String(r.product_code ?? "").trim()).filter(Boolean)));
    try {
      // Supabase in() 은 URL 길이 제한 있어서 청크로 분할
      const CHUNK = 500;
      for (let i = 0; i < codesInResult.length; i += CHUNK) {
        const chunk = codesInResult.slice(i, i + CHUNK);
        const { data: page } = await supabase
          .from("products")
          .select("product_code, optimal_stock, sale_price, purchase_price, current_stock, last_purchase_date, min_order, hidden")
          .in("product_code", chunk);
        for (const p of page ?? []) {
          const code = String(p.product_code ?? "").trim();
          if (!code) continue;
          if (p.hidden === true) { hiddenSet.add(code); continue; }
          productMap.set(code, {
            optimal_stock: Number(p.optimal_stock ?? 0) || 0,
            sale_price:    Number(p.sale_price    ?? 0) || 0,
            purchase_price:Number(p.purchase_price ?? 0) || 0,
            current_stock: Number(p.current_stock ?? 0) || 0,
            last_purchase_date: p.last_purchase_date ?? null,
            min_order:     Number(p.min_order ?? 0) || 0,
          });
        }
      }
    } catch (e: any) {
      console.warn("[top-sales] products fetch 실패:", e?.message);
    }

    // ═══ purchase_details 조인 · 최근/최초 매입일 + 매입 금액 + 횟수 병합 (2026-07-15) ═══
    //   2026-07-29 · 페이지네이션 + distinct dates 카운트 (months 모드와 동일 fix)
    //   2026-07-29 · Phase 2 · Lazy Loading · skip_purchase 시 조인 SKIP
    const purchaseInfoMap = new Map<string, { lastDate: string | null; firstDate: string | null; lastAmount: number; totalQty: number; totalAmount: number; count: number; dateSet: Set<string> }>();
    if (!skipPurchase) try {
      const CHUNK = 200;
      const PAGE = 1000;
      for (let i = 0; i < codesInResult.length; i += CHUNK) {
        const chunk = codesInResult.slice(i, i + CHUNK);
        let fromRow = 0;
        const allPdRows: any[] = [];
        while (true) {
          const { data: pdRows, error: pdError } = await supabase
            .from("purchase_details")
            .select("product_code, purchase_date, quantity, amount, total")
            .in("product_code", chunk)
            .order("purchase_date", { ascending: false })
            .range(fromRow, fromRow + PAGE - 1);
          if (pdError) throw new Error(pdError.message);
          if (!pdRows || pdRows.length === 0) break;
          allPdRows.push(...pdRows);
          if (pdRows.length < PAGE) break;
          fromRow += PAGE;
        }
        for (const r of allPdRows) {
          const code = String(r.product_code ?? "").trim();
          if (!code) continue;
          const cur = purchaseInfoMap.get(code) ?? { lastDate: null, firstDate: null, lastAmount: 0, totalQty: 0, totalAmount: 0, count: 0, dateSet: new Set<string>() };
          const d = String(r.purchase_date ?? "");
          const amt = Number(r.total ?? r.amount ?? 0) || 0;
          const qty = Number(r.quantity ?? 0) || 0;
          if (d && (!cur.lastDate || d > cur.lastDate)) { cur.lastDate = d; cur.lastAmount = amt; }
          if (d && (!cur.firstDate || d < cur.firstDate)) { cur.firstDate = d; }
          cur.totalQty += qty;
          cur.totalAmount += amt;
          if (d) cur.dateSet.add(d);
          purchaseInfoMap.set(code, cur);
        }
      }
      // count = distinct dates (row 수 X)
      for (const info of purchaseInfoMap.values()) info.count = info.dateSet.size;
      console.log(`[top-sales] purchase_details 조인: ${purchaseInfoMap.size}개 상품 · distinct date 카운트`);
    } catch (e: any) {
      console.warn("[top-sales] purchase_details 조인 실패 (계속 진행):", e?.message);
    }

    // 2026-07-29 · 매입이력 필드는 무조건 purchase_details 만 사용
    //   이전 · products.last_purchase_date + stock_history snapshot fallback 로 오염
    //   현재 · purchase_details 만 사용 · 없으면 null
    const rows = (data ?? []).filter(r => !hiddenSet.has(String(r.product_code ?? ""))).map(r => {
      const prod = productMap.get(String(r.product_code ?? ""));
      const purchaseQty = Number(r.purchase_qty ?? 0) || 0;
      const purchaseInfo = purchaseInfoMap.get(String(r.product_code ?? ""));
      const lastPurchase = purchaseInfo?.lastDate ?? null;
      return {
        product_code:  String(r.product_code ?? ""),
        product_name:  String(r.product_name ?? r.product_code ?? ""),
        supplier:      r.supplier_name ?? null,
        spec:          r.spec ?? null,
        opening_stock:  Number(r.opening_stock ?? 0) || 0,
        purchase_qty:   purchaseQty,
        sale_qty:       Number(r.sale_qty       ?? 0) || 0,
        disposal_qty:   Number(r.disposal_qty   ?? 0) || 0,
        internal_qty:   Number(r.internal_qty   ?? 0) || 0,
        adjustment_qty: Number(r.adjustment_qty ?? 0) || 0,
        closing_stock:  Number(r.closing_stock  ?? 0) || 0,
        total_amount:   Number(r.total_amount   ?? 0) || 0,
        optimal_stock: prod?.optimal_stock ?? 0,
        sale_price:    prod?.sale_price    ?? 0,
        purchase_price: prod?.purchase_price ?? 0,
        current_stock: prod?.current_stock ?? 0,
        last_purchase_date: lastPurchase,
        // purchase_details 매입 이력 요약 (재고리스트 · 공급사재고 확장 리스트에서 표시)
        purchase_last_amount:  purchaseInfo?.lastAmount ?? 0,
        purchase_total_qty:    purchaseInfo?.totalQty   ?? 0,
        purchase_total_amount: purchaseInfo?.totalAmount?? 0,
        purchase_count:        purchaseInfo?.count      ?? 0,
        first_purchase_date:   purchaseInfo?.firstDate  ?? null,
        // 최소주문량 (products.min_order) — 공급사재고 확장 리스트에 표시
        min_order: Number(prod?.min_order ?? 0) || 0,
      };
    });
    const sign = dir === "asc" ? 1 : -1;
    const sorted = rows.sort((a, b) => {
      switch (sort) {
        case "purchase": return sign * (a.purchase_qty  - b.purchase_qty);
        case "amount":   return sign * (a.sale_price    - b.sale_price);
        case "closing":  return sign * (a.closing_stock - b.closing_stock);
        case "sale":
        default:         return sign * (a.sale_qty      - b.sale_qty);
      }
    });
    const payload = { snapshot_date: targetDate, period_type: targetPeriodType, dates, dates_with_period, rows: sorted.slice(0, limit) };
    topSalesCache.set(cacheKey, { data: payload, expiresAt: Date.now() + TOP_SALES_TTL });
    res.setHeader("X-Cache", "MISS");
    res.json(payload);
  }
}));

// GET /api/stock-manage/low-stock
// 적정재고보다 현재고가 작은 상품 (current_stock < optimal_stock, 둘 다 값 있음)
// 페이지네이션으로 전체 조회 (Supabase 기본 limit 1000 우회)
// inventory_checks 최근값(제품별)에서 warehouse_stock / store_stock 실재고 병합
// 2026-08-05 · T-PERF-1a · 2분 in-memory 캐시 적용 (products + inventory_checks 풀스캔 반복 방지)
router.get("/api/stock-manage/low-stock", asyncHandler(async (_req, res) => {
  if (lowStockCache && lowStockCache.expiresAt > Date.now()) {
    res.setHeader("X-Cache", "HIT");
    return res.json(lowStockCache.data);
  }
  {
    const all: any[] = [];
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("products")
        // 2026-08-06 · 손실추적 확장 · purchase_price·sale_price 추가 (DiffTab 컬럼)
        .select("product_name, product_code, spec, current_stock, optimal_stock, supplier, real_map, purchase_price, sale_price")
        .eq("hidden", false)
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < PAGE) break;
      from += PAGE;
    }

    // inventory_checks 최근값 병합 (product_code별 최신 warehouse_stock, store_stock)
    const invMap = new Map<string, { warehouse_stock: number | null; store_stock: number | null; checked_at: string | null }>();
    try {
      let ivFrom = 0;
      while (true) {
        const { data: ivPage, error: ivErr } = await supabase
          .from("inventory_checks")
          .select("product_code, warehouse_stock, store_stock, checked_at")
          .order("checked_at", { ascending: false })
          .range(ivFrom, ivFrom + PAGE - 1);
        if (ivErr) {
          if (/relation|does not exist/i.test(ivErr.message)) break;
          throw new Error(ivErr.message);
        }
        if (!ivPage || ivPage.length === 0) break;
        for (const r of ivPage) {
          const code = String(r.product_code ?? "").trim();
          if (!code || invMap.has(code)) continue; // 최근값(정렬 첫)만 유지
          invMap.set(code, {
            warehouse_stock: r.warehouse_stock != null ? Number(r.warehouse_stock) : null,
            store_stock:     r.store_stock     != null ? Number(r.store_stock)     : null,
            checked_at:      r.checked_at ?? null,
          });
        }
        if (ivPage.length < PAGE) break;
        ivFrom += PAGE;
      }
    } catch (e: any) {
      console.warn("[low-stock] inventory_checks fetch 실패:", e?.message);
    }

    const filtered = all
      .map(p => ({
        ...p,
        _cur: Number(p.current_stock ?? 0) || 0,
        _opt: Number(p.optimal_stock ?? 0) || 0,
      }))
      .filter(p => {
        if (p.current_stock == null || p.current_stock === "") return false;
        return p._opt > 0 && p._cur < p._opt;
      })
      .sort((a, b) => (b._opt - b._cur) - (a._opt - a._cur))
      .map(({ _cur: _c, _opt: _o, ...rest }: any) => {
        const inv = invMap.get(String(rest.product_code ?? ""));
        // 타입 정규화 (2026-07-15): 숫자 필드 Number 화 · UI parseNumber 부담 감소
        //   products 테이블의 xlsx import 특성상 string 으로 저장된 경우 대응
        return {
          ...rest,
          current_stock:   rest.current_stock   != null && rest.current_stock   !== "" ? Number(rest.current_stock)   : null,
          optimal_stock:   rest.optimal_stock   != null && rest.optimal_stock   !== "" ? Number(rest.optimal_stock)   : null,
          purchase_price:  rest.purchase_price  != null && rest.purchase_price  !== "" ? Number(rest.purchase_price)  : null,
          sale_price:      rest.sale_price      != null && rest.sale_price      !== "" ? Number(rest.sale_price)      : null,
          warehouse_stock: inv?.warehouse_stock ?? null,
          store_stock:     inv?.store_stock     ?? null,
          inv_checked_at:  inv?.checked_at ?? null,
        };
      });
    // 2026-08-05 · T-PERF-1a · 캐시 저장 후 응답
    lowStockCache = { data: filtered, expiresAt: Date.now() + LOW_STOCK_TTL };
    res.setHeader("X-Cache", "MISS");
    res.json(filtered);
  }
}));

// GET /api/stock-manage/raw?snapshot_date=YYYY-MM-DD&limit=5000
// 재고현황 xlsx 원본 데이터 (stock_history) 그대로 반환 — 필터 없이 모든 컬럼
router.get("/api/stock-manage/raw", asyncHandler(async (req, res) => {
  const dateParam = String(req.query.snapshot_date ?? "").trim();
  const limit = Math.max(1, Math.min(20000, parseInt(String(req.query.limit ?? "5000"), 10) || 5000));
  // 2026-08-06 · Supabase 1000행 cap 우회 · fetchAllWithRange (limit 최대 20000 케이스)
  let data: any[] = [];
  try {
    data = await fetchAllWithRange<any>(() => {
      let query = supabase
        .from("stock_history")
        .select("*")
        .order("supplier_name", { ascending: true });
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
        query = query.eq("snapshot_date", dateParam);
      }
      return query;
    }, limit);
  } catch (err: any) {
    if (/relation|does not exist/i.test(err?.message ?? "")) return res.json({ dates: [], rows: [] });
    throw err;
  }
  // 사용가능한 스냅샷 날짜 목록도 함께 반환
  const { data: allDates } = await supabase
    .from("stock_history")
    .select("snapshot_date")
    .order("snapshot_date", { ascending: false })
    .limit(1000);
  const dates = [...new Set((allDates ?? []).map(d => d.snapshot_date))];
  res.json({ dates, rows: data ?? [] });
}));

// GET /api/stock-manage/product-info?code=<product_code>
// 지정 상품의 products 정보 + 스냅샷별 stock_history + 최근 inventory_check 실재고 병합
router.get("/api/stock-manage/product-info", asyncHandler(async (req, res) => {
  const code = String(req.query.code ?? "").trim();
  if (!code) return res.status(400).json({ error: "code 필요" });
  const [prodRes, histRes, invRes] = await Promise.all([
    supabase.from("products").select("*").eq("product_code", code).maybeSingle(),
    supabase.from("stock_history").select("*").eq("product_code", code).order("snapshot_date", { ascending: false }).limit(200),
    supabase.from("inventory_checks").select("*").eq("product_code", code).order("checked_at", { ascending: false }).limit(50),
  ]);
  if (prodRes.error && !/does not exist/i.test(prodRes.error.message)) throw new HttpError(500, prodRes.error.message);
  res.json({
    product: prodRes.data ?? null,
    stock_history: histRes.error ? [] : (histRes.data ?? []),
    inventory_checks: invRes.error ? [] : (invRes.data ?? []),
  });
}));

// GET /api/stock-manage/product-history?product_name=X&days=7
// 상품별 매입 이력 (차트 데이터)
// 2026-08-09 · 소스 · ocr_confirmed_items → purchase_details (사용자 원칙 · 매입이력만)
router.get("/api/stock-manage/product-history", asyncHandler(async (req, res) => {
  const name = String(req.query.product_name ?? "").trim();
  const code = String(req.query.product_code ?? "").trim();
  const days = Math.max(1, Math.min(365, parseInt(String(req.query.days ?? "7"), 10) || 7));
  if (!name && !code) return res.status(400).json({ error: "product_name 또는 product_code 필요" });
  const sinceYmd = daysAgoISO(days).slice(0, 10);
  // 2026-08-06 · Supabase 1000행 cap 우회 · fetchAllWithRange
  const rawData = await fetchAllWithRange<any>(() => {
    let query = supabase
      .from("purchase_details")
      .select("supplier_name, product_name, product_code, quantity, amount, total, purchase_date")
      .gte("purchase_date", sinceYmd)
      .order("purchase_date", { ascending: true });
    if (code) query = query.eq("product_code", code);
    else      query = query.eq("product_name", name);
    return query;
  }, 5000);
  // 응답 shape 유지 · supplier/saved_at 필드로 alias
  const data = (rawData ?? []).map((r: any) => ({
    supplier: r.supplier_name ?? null,
    product_name: r.product_name,
    product_code: r.product_code,
    quantity: r.quantity,
    amount: r.amount ?? r.total ?? 0,
    saved_at: r.purchase_date,
  }));
  res.json(data);
}));

// POST /api/upload-stock
// 재고 리스트 xlsx 업로드 (product_code + current_stock 만 upsert)
// 매칭 안 되는 product_code는 건드리지 않음 (안전 병합)
router.post("/api/upload-stock", express.raw({ type: "application/octet-stream", limit: "50mb" }), asyncHandler(async (req, res) => {
  const { managerId } = req.query as Record<string, string>;
  if (!req.body || !Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ error: "파일이 없습니다" });
  }
  {
    // 권한: level >= 9
    if (managerId) {
      const { data: emp } = await supabase.from("employees").select("level").eq("id", Number(managerId)).maybeSingle();
      if ((emp?.level ?? 0) < 9) return res.status(403).json({ error: "level 9 이상 관리자만 가능합니다" });
    } else {
      return res.status(403).json({ error: "managerId 필요" });
    }
    const buf = req.body as Buffer;
    const isXlsx = buf[0] === 0x50 && buf[1] === 0x4B && buf[2] === 0x03 && buf[3] === 0x04;
    const isXls  = buf[0] === 0xD0 && buf[1] === 0xCF && buf[2] === 0x11 && buf[3] === 0xE0;
    if (!isXlsx && !isXls) return res.status(400).json({ error: "xlsx/xls 파일만 가능합니다" });

    const wb = XLSX.read(buf, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];

    // 재고현황 xlsx는 병합된 카테고리 헤더(Row 0)와 실제 컬럼명(Row 1)로 구성됨
    // Row 0: ["세부구분", "세부구분", ..., "재고금액", "재고금액"]  ← 병합 헤더
    // Row 1: ["공급사코드", "공급사명", "코드", "명", "규격", "i", "상품유형", "시작일 재고", "입고계", "판매출고계", "폐기", "사내소비", "재고조정 반영수량", "종료일 재고", "과세", "공급가액", "부가세", "면세", "합계"]
    // Row 2+: 실제 데이터
    // → header:1로 배열형태 읽기 후 Row 1을 헤더로 사용, Row 2부터 데이터
    const arrRows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "" });
    if (arrRows.length < 3) return res.status(400).json({ error: "데이터가 부족합니다" });

    // 두 후보 헤더 (Row 0 vs Row 1) 중 실제 컬럼명이 있는 쪽을 선택
    // 병합 헤더(Row 0)는 같은 카테고리명이 반복되고 (예: "세부구분" x4, "재고금액" x5)
    // 실제 컬럼명 헤더(Row 1)는 distinct value가 많음 → 고유 값 개수로 스코어
    const scoreHeaderRow = (row: any[]): number => {
      const nonEmpty = row.map(v => String(v ?? "").trim()).filter(Boolean);
      return new Set(nonEmpty).size;
    };
    const row0Score = scoreHeaderRow(arrRows[0]);
    const row1Score = scoreHeaderRow(arrRows[1]);
    // Row 1이 명확히 더 다양하면 Row 1 사용, 아니면 Row 0 사용
    const headerRowIdx = row1Score > row0Score + 2 ? 1 : 0;
    const headers: string[] = arrRows[headerRowIdx].map(h => String(h ?? "").trim());
    const dataRows = arrRows.slice(headerRowIdx + 1);

    // 컬럼 인덱스 찾기 (재고현황 스키마 + 기존 단순 스키마 둘 다 지원)
    const findCol = (patterns: RegExp[]): number => {
      for (const pat of patterns) {
        const idx = headers.findIndex(h => pat.test(h));
        if (idx >= 0) return idx;
      }
      return -1;
    };
    const codeI    = findCol([/^코드$/i, /상품\s*코드/i, /품목\s*번호/i, /product[_ ]?code/i, /^code$/i]);
    // "종료일 재고" 가 실제 현재고. 없으면 "현재고" / "재고" 로 fallback (하지만 "재고금액" 은 아님)
    const stockI   = findCol([/종료일\s*재고/i, /기말\s*재고/i, /^현재고$/i, /^재고$/i, /current[_ ]?stock/i, /closing[_ ]?stock/i]);
    const nameI    = findCol([/^명$/i, /상품\s*명/i, /제품\s*명/i, /product[_ ]?name/i]);
    const supNameI = findCol([/공급사\s*명/i, /supplier[_ ]?name/i, /^공급사$/i]);
    const supCodeI = findCol([/공급사\s*코드/i, /supplier[_ ]?code/i]);
    const specI    = findCol([/^규격$/i, /^spec$/i]);
    const taxTypeI = findCol([/^i$/i, /과세\s*구분/i, /세금\s*구분/i]);
    const prodTypeI= findCol([/^상품\s*유형$/i, /product[_ ]?type/i]);
    // 시작재고 헤더 변형 광범위 대응 (미매칭 시 opening_stock=0 저장돼서 재고흐름 계산 망가짐)
    const openI    = findCol([/시작일\s*재고/i, /기초\s*재고/i, /시작\s*재고/i, /전월\s*이월/i, /전기\s*이월/i, /opening[_ ]?stock/i]);
    const purchI   = findCol([/입고\s*계/i, /^입고$/i, /purchase/i]);
    const saleI    = findCol([/판매\s*출고\s*계/i, /^판매$/i, /sale/i]);
    const disposeI = findCol([/^폐기$/i, /disposal/i]);
    const internI  = findCol([/사내\s*소비/i, /internal/i]);
    const adjI     = findCol([/재고\s*조정/i, /adjust/i]);
    const taxableI = findCol([/^과세$/i, /taxable/i]);
    const supplyI  = findCol([/공급\s*가액/i]);
    const vatI     = findCol([/^부가세$/i, /vat/i]);
    const dutyFreeI= findCol([/^면세$/i, /duty[_ ]?free/i]);
    const totalI   = findCol([/^합계$/i, /total/i]);

    if (codeI < 0 || stockI < 0) {
      return res.status(400).json({
        error: `상품코드/재고 컬럼을 찾을 수 없습니다. 감지된 헤더: ${headers.join(", ")}`,
      });
    }

    const parseNum = (v: unknown): number => {
      if (typeof v === "number") return Number.isFinite(v) ? v : 0;
      if (v == null || v === "") return 0;
      const n = parseFloat(String(v).replace(/,/g, ""));
      return Number.isFinite(n) ? n : 0;
    };

    // 스냅샷 기준일 = 종료재고일 (사용자 명시 필수)
    const snapshotHint = String(req.query.snapshot_date ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshotHint)) {
      return res.status(400).json({ error: "snapshot_date(종료재고일) 형식 오류 · YYYY-MM-DD 필요" });
    }
    const snapshotDate = snapshotHint;
    // 시작재고일 (사용자 명시 · 필수) — 기간 식별자로 사용됨
    // 같은 시작재고일로 재임포트 시 기존 rows 자동 대체 (DELETE-then-INSERT)
    const startHint = String(req.query.start_date ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startHint)) {
      return res.status(400).json({ error: "start_date(시작재고일) 형식 오류 · YYYY-MM-DD 필요" });
    }
    const periodStartDate: string = startHint;
    if (periodStartDate > snapshotDate) {
      return res.status(400).json({ error: "start_date(시작재고일)가 종료재고일보다 뒤에 있습니다" });
    }
    // 기간 구분: early(1-10일) / mid(11-20일) / late(21-말일) — 종료일 dd 로 자동 판정 (전달값도 허용)
    const periodTypeRaw = String(req.query.period_type ?? "").trim().toLowerCase();
    let periodType: "early" | "mid" | "late" | null =
      periodTypeRaw === "early" || periodTypeRaw === "mid" || periodTypeRaw === "late"
        ? periodTypeRaw
        : null;
    if (!periodType) {
      const dd = Number(snapshotDate.slice(8, 10));
      periodType = dd >= 1 && dd <= 10 ? "early" : dd >= 11 && dd <= 20 ? "mid" : "late";
    }

    // 데이터 파싱 — 요약행(공급사명 비어있는 행) skip
    type XlsxRow = {
      product_code: string;
      current_stock: number;
      product_name: string | null;
      supplier: string | null;
      spec: string | null;
    };
    const xlsxRows: XlsxRow[] = [];
    const history: Record<string, any>[] = [];
    for (const r of dataRows) {
      if (!Array.isArray(r)) continue;
      const code = String(r[codeI] ?? "").trim();
      if (!code) continue; // 요약행 등 코드 없는 행 skip
      // 공급사명 비어있고 여러 컬럼 비어있으면 합계행 → skip
      const supName = supNameI >= 0 ? String(r[supNameI] ?? "").trim() : "";
      if (!supName && nameI >= 0 && !String(r[nameI] ?? "").trim()) continue;

      const closing = parseNum(r[stockI]);
      xlsxRows.push({
        product_code:  code,
        current_stock: closing,
        product_name:  nameI >= 0 ? String(r[nameI] ?? "").trim() || null : null,
        supplier:      supName || null,
        spec:          specI >= 0 ? String(r[specI] ?? "").trim() || null : null,
      });

      history.push({
        snapshot_date:      snapshotDate,
        period_start_date:  periodStartDate,
        period_type:        periodType,
        product_code:       code,
        supplier_code:    supCodeI >= 0 ? String(r[supCodeI] ?? "").trim() || null : null,
        supplier_name:    supName || null,
        product_name:     nameI >= 0 ? String(r[nameI] ?? "").trim() || null : null,
        spec:             specI >= 0 ? String(r[specI] ?? "").trim() || null : null,
        tax_type:         taxTypeI >= 0 ? String(r[taxTypeI] ?? "").trim() || null : null,
        product_type:     prodTypeI>= 0 ? String(r[prodTypeI]?? "").trim() || null : null,
        opening_stock:    openI    >= 0 ? parseNum(r[openI])    : 0,
        purchase_qty:     purchI   >= 0 ? parseNum(r[purchI])   : 0,
        sale_qty:         saleI    >= 0 ? parseNum(r[saleI])    : 0,
        disposal_qty:    disposeI >= 0 ? parseNum(r[disposeI]) : 0,
        internal_qty:     internI  >= 0 ? parseNum(r[internI])  : 0,
        adjustment_qty:   adjI     >= 0 ? parseNum(r[adjI])     : 0,
        closing_stock:    closing,
        taxable_amount:   taxableI >= 0 ? parseNum(r[taxableI]) : 0,
        supply_amount:    supplyI  >= 0 ? parseNum(r[supplyI])  : 0,
        vat:              vatI     >= 0 ? parseNum(r[vatI])     : 0,
        duty_free_amount: dutyFreeI>= 0 ? parseNum(r[dutyFreeI]): 0,
        total_amount:     totalI   >= 0 ? parseNum(r[totalI])   : 0,
      });
    }
    if (xlsxRows.length === 0) return res.status(400).json({ error: "유효한 데이터가 없습니다" });

    // 진단 로그: 파일 파싱 결과 요약
    console.log(`[upload-stock] snapshot=${snapshotDate} · start=${periodStartDate ?? "(none)"} · period=${periodType} · 파싱=${history.length}행 · rawDataRows=${dataRows.length}행 · headerRowIdx=${headerRowIdx}`);
    console.log(`[upload-stock] col idx: code=${codeI} name=${nameI} sup=${supNameI} spec=${specI} closing=${stockI} opening=${openI} purchase=${purchI} sale=${saleI}`);

    // products 테이블은 건드리지 않음 — 재고 이력은 stock_history에만 저장
    // (products.current_stock 은 다른 경로로 관리되며 xlsx 종료재고와 별개)
    const updated = 0;
    const inserted = 0;

    // ① 같은 기간(period_start_date) 기존 rows 감지
    //    force=true 없으면 409 로 응답 · 클라이언트에서 confirm 후 재요청 (2026-07-15)
    const forceOverwrite = String(req.query.force ?? "").trim() === "true";
    let deletedCount = 0;
    try {
      const { count: pre } = await supabase
        .from("stock_history")
        .select("*", { count: "exact", head: true })
        .eq("period_start_date", periodStartDate);
      const existingCount = pre ?? 0;
      if (existingCount > 0 && !forceOverwrite) {
        // 확인 필요
        return res.status(409).json({
          needsConfirm: true,
          existingCount,
          period: { from: periodStartDate, to: snapshotDate, type: periodType },
          message: `기간 ${periodStartDate} ~ ${snapshotDate} 에 이미 ${existingCount}행 재고 스냅샷이 존재합니다. 덮어쓰시겠습니까?`,
        });
      }
      if (existingCount > 0) {
        const { error: delErr } = await supabase
          .from("stock_history")
          .delete()
          .eq("period_start_date", periodStartDate);
        if (delErr) {
          console.warn(`[upload-stock] 기존 rows DELETE 실패 (${periodStartDate}):`, delErr.message);
          deletedCount = 0;
        } else {
          deletedCount = existingCount;
          console.log(`[upload-stock] 기간 ${periodStartDate} 기존 ${deletedCount}행 삭제 (덮어쓰기 확인됨)`);
        }
      }
    } catch (e: any) {
      // period_start_date 컬럼이 없는 구 DB 는 삭제 skip (INSERT 는 fallback 처리)
      console.warn("[upload-stock] period_start_date 감지/DELETE skip:", e?.message);
    }

    // ② stock_history 에 새 스냅샷 upsert (같은 snapshot_date+코드 있으면 덮어쓰기)
    // period_start_date 컬럼이 없는 구 DB 지원: 첫 시도 실패 시 해당 필드 제거하고 재시도
    let historyInserted = 0;
    let historyError: string | null = null;
    let periodStartUnsupported = false;
    try {
      const HCHUNK = 500;
      const totalChunks = Math.ceil(history.length / HCHUNK);
      let chunkNo = 0;
      for (let i = 0; i < history.length; i += HCHUNK) {
        chunkNo++;
        const chunkOrig = history.slice(i, i + HCHUNK);
        const chunk = periodStartUnsupported
          ? chunkOrig.map(({ period_start_date, ...rest }) => rest)
          : chunkOrig;
        const { error: hErr } = await supabase
          .from("stock_history")
          .upsert(chunk, { onConflict: "snapshot_date,product_code" });
        if (!hErr) {
          historyInserted += chunk.length;
          console.log(`[upload-stock] chunk ${chunkNo}/${totalChunks} · ${chunk.length}행 저장 성공 (누계 ${historyInserted})`);
          continue;
        }
        // period_start_date 컬럼이 없다면 그 필드만 제거하고 재시도
        if (!periodStartUnsupported && /period_start_date/i.test(hErr.message)) {
          periodStartUnsupported = true;
          console.warn(`[upload-stock] period_start_date 컬럼 없음 → fallback 재시도`);
          const chunkFallback = chunkOrig.map(({ period_start_date, ...rest }) => rest);
          const { error: hErr2 } = await supabase
            .from("stock_history")
            .upsert(chunkFallback, { onConflict: "snapshot_date,product_code" });
          if (!hErr2) {
            historyInserted += chunkFallback.length;
            console.log(`[upload-stock] chunk ${chunkNo}/${totalChunks} · fallback 성공 ${chunkFallback.length}행`);
            continue;
          }
          console.error(`[upload-stock] chunk ${chunkNo}/${totalChunks} · fallback 실패: ${hErr2.message}`);
          if (!historyError) historyError = hErr2.message;
          continue;
        }
        console.error(`[upload-stock] chunk ${chunkNo}/${totalChunks} · 실패 (${chunk.length}행 손실): ${hErr.message}`);
        // 상세 컬럼별 값 샘플 (문제 파악용)
        if (chunk[0]) {
          console.error(`  샘플 첫 행 code=${chunk[0].product_code} name=${chunk[0].product_name} sup=${chunk[0].supplier_name} snap=${chunk[0].snapshot_date}`);
        }
        if (!historyError) historyError = hErr.message;
      }
      console.log(`[upload-stock] 완료: 저장 ${historyInserted}/${history.length}행 (${totalChunks}청크 중 성공)`);
    } catch (e: any) {
      console.error("[upload-stock] stock_history 저장 예외:", e?.message, e?.stack);
      historyError = e?.message ?? "저장 예외";
    }

    // 파일은 파싱됐는데 stock_history에 아무것도 저장 못했으면 400 응답 (사용자에게 원인 알림)
    if (historyInserted === 0 && historyError) {
      return res.status(500).json({
        error: `stock_history 저장 실패: ${historyError}. Supabase에 stock_history 테이블이 없거나 unique 제약(snapshot_date, product_code)이 없을 수 있습니다. supabase/migrations/20260707_stock_history.sql 적용 필요.`,
        total: xlsxRows.length,
        history: 0,
      });
    }

    // 임포트 로그 저장
    const { data: logData } = await supabase.from("app_settings").select("value").eq("key", "stock_import_log").maybeSingle();
    const prevLogs: unknown[] = Array.isArray(logData?.value) ? logData.value : [];
    const newEntry = {
      timestamp: new Date().toISOString(),
      count: updated,
      inserted,
      total: xlsxRows.length,
      history: historyInserted,
      deleted: deletedCount,
      snapshot_date: snapshotDate,
      start_date: periodStartDate,
      period_type: periodType,
    };
    const logs = [newEntry, ...prevLogs].slice(0, 20);
    await supabase.from("app_settings").upsert({ key: "stock_import_log", value: logs, updated_at: new Date().toISOString() }, { onConflict: "key" });

    res.json({
      ok: true,
      updated,
      inserted,
      total: xlsxRows.length,
      history: historyInserted,
      deleted: deletedCount,
      start_date: periodStartDate,
      period_type: periodType,
      snapshot_date: snapshotDate,
      timestamp: newEntry.timestamp,
    });
  }
}));

// GET /api/stock-import-log
router.get("/api/stock-import-log", asyncHandler(async (_req, res) => {
  const { data } = await supabase.from("app_settings").select("value").eq("key", "stock_import_log").maybeSingle();
  res.json(Array.isArray(data?.value) ? data.value : []);
}));

// DELETE /api/stock-import-log
router.delete("/api/stock-import-log", asyncHandler(async (_req, res) => {
  await supabase.from("app_settings").upsert({ key: "stock_import_log", value: [], updated_at: new Date().toISOString() }, { onConflict: "key" });
  res.json({ ok: true });
}));

// ═════════════════════════════════════════════════════════════════
// GET /api/stock-manage/period-coverage
//   재고 스냅샷 커버리지 (월 × 초/중/하순) · 어느 기간 데이터가 있는지 한 눈에
//   응답: { periods: [{ ym, early, mid, late, total }], missing: [{ ym, period_type }] }
// ═════════════════════════════════════════════════════════════════
router.get("/api/stock-manage/period-coverage", asyncHandler(async (_req, res) => {
  {
    // stock_import_log(app_settings) 에서 임포트 이력 조회 · Supabase 1000행 제한 회피
    //   각 배치의 snapshot_date + period_type 로 커버리지 집계 · 스냅샷당 상품 rows 는 조회 불필요
    const { data: logData } = await supabase.from("app_settings").select("value").eq("key", "stock_import_log").maybeSingle();
    const logs: any[] = Array.isArray(logData?.value) ? logData.value : [];
    // ym → { early/mid/late : Set<snapshot_date> } (dedupe · 같은 스냅샷 여러 번 임포트해도 1개로 셈)
    const bucket = new Map<string, { early: Set<string>; mid: Set<string>; late: Set<string> }>();
    for (const l of logs) {
      const d = String(l.snapshot_date ?? "");
      if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
      const ym = d.slice(0, 7);
      let pt = String(l.period_type ?? "");
      if (!pt) {
        const dd = Number(d.slice(8, 10));
        pt = dd <= 10 ? "early" : dd <= 20 ? "mid" : "late";
      }
      const cur = bucket.get(ym) ?? { early: new Set(), mid: new Set(), late: new Set() };
      if (pt === "early" || pt === "mid" || pt === "late") cur[pt].add(d);
      bucket.set(ym, cur);
    }
    const yms = Array.from(bucket.keys()).sort();
    if (yms.length > 0) {
      const [y0, m0] = yms[0].split("-").map(Number);
      const [y1, m1] = yms[yms.length - 1].split("-").map(Number);
      for (let y = y0, m = m0; y < y1 || (y === y1 && m <= m1); ) {
        const ym = `${y}-${String(m).padStart(2, "0")}`;
        if (!bucket.has(ym)) bucket.set(ym, { early: new Set(), mid: new Set(), late: new Set() });
        m++; if (m > 12) { m = 1; y++; }
      }
    }
    const periods = Array.from(bucket.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ym, v]) => ({ ym, early: v.early.size, mid: v.mid.size, late: v.late.size, total: v.early.size + v.mid.size + v.late.size }));
    const missing: Array<{ ym: string; period_type: string }> = [];
    for (const p of periods) {
      if (p.early === 0) missing.push({ ym: p.ym, period_type: "early" });
      if (p.mid === 0)   missing.push({ ym: p.ym, period_type: "mid" });
      if (p.late === 0)  missing.push({ ym: p.ym, period_type: "late" });
    }
    res.json({ periods, missing });
  }
}));

// ═══════════════════════════════════════════════════════════════════════
// GET /api/stock-manage/purchase-info-batch?codes=CODE1,CODE2,...  (2026-07-29 · Phase 2 Lazy Loading)
//   특정 상품들의 purchase_details 집계값만 반환 (last_purchase_date · first_purchase_date · purchase_count · totalQty · totalAmount · lastAmount)
//   상품현황리스트 · 공급사탭 등의 매입주기·최근매입일 컬럼을 첫 로드 후 background 로 채우는 용도
// ═══════════════════════════════════════════════════════════════════════
router.get("/api/stock-manage/purchase-info-batch", asyncHandler(async (req, res) => {
  const codesParam = String(req.query.codes ?? "").trim();
  if (!codesParam) return res.json({ items: {} });
  const codes = codesParam.split(",").map(c => c.trim()).filter(Boolean).slice(0, 5000);
  if (codes.length === 0) return res.json({ items: {} });
  {
    const CHUNK = 200;
    const PAGE = 1000;
    const infoMap = new Map<string, { lastDate: string | null; firstDate: string | null; count: number; totalQty: number; totalAmount: number; lastAmount: number; dateSet: Set<string> }>();
    // 병렬 chunk 처리 · Phase 2 성능 개선
    const chunkPromises: Promise<void>[] = [];
    for (let i = 0; i < codes.length; i += CHUNK) {
      const chunk = codes.slice(i, i + CHUNK);
      chunkPromises.push((async () => {
        let fromRow = 0;
        while (true) {
          const { data: pdRows, error } = await supabase
            .from("purchase_details")
            .select("product_code, purchase_date, quantity, amount, total")
            .in("product_code", chunk)
            .order("purchase_date", { ascending: false })
            .range(fromRow, fromRow + PAGE - 1);
          if (error) throw new Error(error.message);
          if (!pdRows || pdRows.length === 0) break;
          for (const r of pdRows) {
            const code = String(r.product_code ?? "").trim();
            if (!code) continue;
            const cur = infoMap.get(code) ?? { lastDate: null, firstDate: null, count: 0, totalQty: 0, totalAmount: 0, lastAmount: 0, dateSet: new Set<string>() };
            const d = String(r.purchase_date ?? "");
            const amt = Number(r.total ?? r.amount ?? 0) || 0;
            const qty = Number(r.quantity ?? 0) || 0;
            if (d && (!cur.lastDate || d > cur.lastDate)) { cur.lastDate = d; cur.lastAmount = amt; }
            if (d && (!cur.firstDate || d < cur.firstDate)) { cur.firstDate = d; }
            cur.totalQty += qty;
            cur.totalAmount += amt;
            if (d) cur.dateSet.add(d);
            infoMap.set(code, cur);
          }
          if (pdRows.length < PAGE) break;
          fromRow += PAGE;
        }
      })());
    }
    await Promise.all(chunkPromises);
    // items: { code: { last_purchase_date, first_purchase_date, purchase_count, purchase_total_qty, purchase_total_amount, purchase_last_amount } }
    const items: Record<string, any> = {};
    for (const [code, info] of infoMap) {
      items[code] = {
        last_purchase_date: info.lastDate,
        first_purchase_date: info.firstDate,
        purchase_count: info.dateSet.size,
        purchase_total_qty: info.totalQty,
        purchase_total_amount: info.totalAmount,
        purchase_last_amount: info.lastAmount,
      };
    }
    res.json({ items });
  }
}));

// ═══════════════════════════════════════════════════════════════════════
// GET /api/stock-manage/trending?window=30&limit=100
// 최근 판매 급상승 상품 (2026-07-29)
//   stock_history · 최근 window일 판매 vs 이전 window일 판매 비교
//   응답 · recent_sale, prior_sale, growth_rate, absolute_delta, current_stock, optimal_stock
//   원칙 · 재고 = stock_history / 상품 = products
// ═══════════════════════════════════════════════════════════════════════
router.get("/api/stock-manage/trending", asyncHandler(async (req, res) => {
  const windowDays = Math.max(1, Math.min(180, parseInt(String(req.query.window ?? "30"), 10) || 30));
  // 2026-07-31 · 사용자 요청 · 기준(=prior) window 를 별도 지정 가능
  //   미지정 시 기존 동작 유지 (prior = window 와 동일 길이 · 그 이전 구간)
  //   지정 시 recent 는 최근 windowDays 일 · prior 는 최근 priorDays 일 (recent 포함 전체)
  //   급상승 탭 요구사항: recent 는 사용자 선택 (7/10/15/30/60) · prior 는 항상 30일 (=최근 30일 기준)
  const priorDaysRaw = req.query.prior_days ?? req.query.prior_window ?? "";
  const hasPriorDays = String(priorDaysRaw).trim() !== "";
  const priorDays = hasPriorDays
    ? Math.max(1, Math.min(365, parseInt(String(priorDaysRaw), 10) || windowDays))
    : windowDays;
  const limit = Math.max(1, Math.min(50000, parseInt(String(req.query.limit ?? "500"), 10) || 500));
  // 필터 파라미터 (선택적)
  const minRecentQty = Math.max(0, parseInt(String(req.query.min_recent_qty ?? "0"), 10) || 0);
  const minGrowthPctRaw = String(req.query.min_growth_pct ?? "").trim();
  const hasMinGrowthPct = minGrowthPctRaw !== "" && !Number.isNaN(Number(minGrowthPctRaw));
  const minGrowthPct = hasMinGrowthPct ? Number(minGrowthPctRaw) : null;
  const supplierFilter = String(req.query.supplier ?? "").trim().toLowerCase();
  {
    const now = new Date();
    const recentFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate() - windowDays);
    // prior 시작일 · hasPriorDays 이면 recent 범위와 겹치는 최근 priorDays 구간 · 아니면 recent 이전 구간
    const priorFrom = hasPriorDays
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - priorDays)
      : new Date(now.getFullYear(), now.getMonth(), now.getDate() - windowDays * 2);
    const recentFromStr = recentFrom.toISOString().slice(0, 10);
    const priorFromStr = priorFrom.toISOString().slice(0, 10);
    const todayStr = now.toISOString().slice(0, 10);
    // 조회 시작일 · 두 구간 중 이른 날짜
    const scanFromStr = priorFromStr < recentFromStr ? priorFromStr : recentFromStr;

    // stock_history 페이지네이션 · 두 구간 커버
    const salesMap = new Map<string, { recent: number; prior: number; name: string; supplier: string | null }>();
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("stock_history")
        .select("product_code, product_name, supplier_name, snapshot_date, sale_qty")
        .gte("snapshot_date", scanFromStr)
        .lte("snapshot_date", todayStr)
        .range(from, from + PAGE - 1);
      if (error) {
        if (/relation|does not exist/i.test(error.message)) return res.json({ rows: [] });
        throw new Error(error.message);
      }
      if (!data || data.length === 0) break;
      for (const r of data) {
        const code = String(r.product_code ?? "").trim();
        if (!code) continue;
        const q = Number(r.sale_qty ?? 0) || 0;
        if (q === 0) continue;
        const snap = String(r.snapshot_date ?? "");
        const cur = salesMap.get(code) ?? {
          recent: 0, prior: 0,
          name: String(r.product_name ?? code),
          supplier: r.supplier_name ?? null,
        };
        // hasPriorDays · 최근 windowDays 는 recent · 최근 priorDays 전체는 prior (기준 · recent 포함)
        // !hasPriorDays · 기존 로직 유지 · recent 이전은 prior
        if (hasPriorDays) {
          if (snap >= recentFromStr) cur.recent += q;
          if (snap >= priorFromStr) cur.prior += q;
        } else {
          if (snap >= recentFromStr) cur.recent += q;
          else cur.prior += q;
        }
        salesMap.set(code, cur);
      }
      if (data.length < PAGE) break;
      from += PAGE;
    }

    // products 조인 · 현재고 · 적정재고 · 숨김 필터
    const codes = Array.from(salesMap.keys());
    const productMap = new Map<string, { current_stock: number; optimal_stock: number; hidden: boolean; sale_price: number }>();
    const CHUNK = 500;
    for (let i = 0; i < codes.length; i += CHUNK) {
      const chunk = codes.slice(i, i + CHUNK);
      const { data } = await supabase
        .from("products")
        .select("product_code, current_stock, optimal_stock, sale_price, hidden")
        .in("product_code", chunk);
      for (const p of data ?? []) {
        productMap.set(String(p.product_code ?? "").trim(), {
          current_stock: Number(p.current_stock ?? 0) || 0,
          optimal_stock: Number(p.optimal_stock ?? 0) || 0,
          sale_price: Number(p.sale_price ?? 0) || 0,
          hidden: p.hidden === true,
        });
      }
    }

    // 결과 조립 · 성장률 계산
    const rows = [];
    for (const [code, s] of salesMap) {
      const prod = productMap.get(code);
      if (prod?.hidden) continue;
      const recent = s.recent;
      const prior = s.prior;
      const delta = recent - prior;
      // 성장률 · prior=0 이고 recent>0 이면 "신규 진입" flag (growth_rate=null)
      const growthRate = prior > 0 ? Math.round(((recent - prior) / prior) * 100) : null;
      const newlyTrending = prior === 0 && recent > 0;
      // ── 필터 적용 ──
      if (minRecentQty > 0 && recent < minRecentQty) continue;
      if (minGrowthPct != null) {
        // 신규 진입 (prior=0) 은 항상 통과 · 그 외는 성장률 >= 최소
        if (!newlyTrending && (growthRate ?? -999999) < minGrowthPct) continue;
      }
      if (supplierFilter) {
        const sup = (s.supplier ?? "").toLowerCase();
        if (!sup.includes(supplierFilter)) continue;
      }
      rows.push({
        product_code: code,
        product_name: s.name,
        supplier: s.supplier,
        recent_sale: recent,
        prior_sale: prior,
        growth_rate: growthRate,          // % · null 이면 신규 진입
        absolute_delta: delta,
        newly_trending: newlyTrending,
        current_stock: prod?.current_stock ?? 0,
        optimal_stock: prod?.optimal_stock ?? 0,
        sale_price: prod?.sale_price ?? 0,
        below_optimal: (prod?.optimal_stock ?? 0) > 0 && (prod?.current_stock ?? 0) < (prod?.optimal_stock ?? 0),
      });
    }
    // 정렬 · 신규 진입 상단 · 그 다음 성장률 desc · 그 다음 절대 증가량 desc
    rows.sort((a, b) => {
      if (a.newly_trending !== b.newly_trending) return a.newly_trending ? -1 : 1;
      const ga = a.growth_rate ?? -999999;
      const gb = b.growth_rate ?? -999999;
      if (gb !== ga) return gb - ga;
      return b.absolute_delta - a.absolute_delta;
    });

    res.json({
      window_days: windowDays,
      prior_days: priorDays,
      prior_mode: hasPriorDays ? "overlap" : "adjacent",
      recent_from: recentFromStr,
      prior_from: priorFromStr,
      today: todayStr,
      filters: {
        min_recent_qty: minRecentQty || null,
        min_growth_pct: minGrowthPct,
        supplier: supplierFilter || null,
      },
      total: rows.length,
      rows: rows.slice(0, limit),
    });
  }
}));

// ═══════════════════════════════════════════════════════════════════════
// GET /api/stock-manage/trending-period?from=YYYY-MM-DD&to=YYYY-MM-DD
//                                      &prior_from=YYYY-MM-DD&prior_to=YYYY-MM-DD
//                                      &limit=20
// 2026-07-30 · 사용자 요청 · 명시적 기간 · 급상승 상품
//   응답 · rows [{ code, name, supplier, recent_sale, prior_sale, growth_rate, delta, current_stock, newly_trending }]
// ═══════════════════════════════════════════════════════════════════════
router.get("/api/stock-manage/trending-period", asyncHandler(async (req, res) => {
  const from = String(req.query.from ?? "").trim();
  const to = String(req.query.to ?? "").trim();
  const priorFrom = String(req.query.prior_from ?? "").trim();
  const priorTo = String(req.query.prior_to ?? "").trim();
  const limit = Math.max(1, Math.min(1000, parseInt(String(req.query.limit ?? "20"), 10) || 20));
  if (!from || !to || !priorFrom || !priorTo) {
    return res.status(400).json({ error: "from · to · prior_from · prior_to 필수 (YYYY-MM-DD)" });
  }
  {
    // stock_history · 두 기간 (prior_from ~ to) 통합 조회 (한 번 · 페이지네이션)
    const salesMap = new Map<string, { recent: number; prior: number; name: string; supplier: string | null }>();
    const PAGE = 1000;
    let fromRow = 0;
    while (true) {
      const { data, error } = await supabase
        .from("stock_history")
        .select("product_code, product_name, supplier_name, snapshot_date, sale_qty")
        .gte("snapshot_date", priorFrom)
        .lte("snapshot_date", to)
        .range(fromRow, fromRow + PAGE - 1);
      if (error) {
        if (/relation|does not exist/i.test(error.message)) return res.json({ rows: [] });
        throw new Error(error.message);
      }
      if (!data || data.length === 0) break;
      for (const r of data) {
        const code = String(r.product_code ?? "").trim();
        if (!code) continue;
        const q = Number(r.sale_qty ?? 0) || 0;
        if (q === 0) continue;
        const snap = String(r.snapshot_date ?? "");
        const cur = salesMap.get(code) ?? {
          recent: 0, prior: 0,
          name: String(r.product_name ?? code),
          supplier: r.supplier_name ?? null,
        };
        if (snap >= from && snap <= to) cur.recent += q;
        else if (snap >= priorFrom && snap <= priorTo) cur.prior += q;
        salesMap.set(code, cur);
      }
      if (data.length < PAGE) break;
      fromRow += PAGE;
    }

    // products · 현재고 · hidden
    const codes = Array.from(salesMap.keys());
    const productMap = new Map<string, { current_stock: number; hidden: boolean }>();
    const CHUNK = 500;
    for (let i = 0; i < codes.length; i += CHUNK) {
      const chunk = codes.slice(i, i + CHUNK);
      const { data } = await supabase
        .from("products")
        .select("product_code, current_stock, hidden")
        .in("product_code", chunk);
      for (const p of data ?? []) {
        productMap.set(String(p.product_code ?? "").trim(), {
          current_stock: Number(p.current_stock ?? 0) || 0,
          hidden: p.hidden === true,
        });
      }
    }

    const rows: any[] = [];
    for (const [code, s] of salesMap) {
      const prod = productMap.get(code);
      if (prod?.hidden) continue;
      if (s.recent === 0) continue; // 최근 기간 판매 없으면 급상승 대상 아님
      const delta = s.recent - s.prior;
      const growthRate = s.prior > 0 ? Math.round(((s.recent - s.prior) / s.prior) * 100) : null;
      rows.push({
        product_code: code,
        product_name: s.name,
        supplier: s.supplier,
        recent_sale: s.recent,
        prior_sale: s.prior,
        growth_rate: growthRate,
        absolute_delta: delta,
        newly_trending: s.prior === 0,
        current_stock: prod?.current_stock ?? 0,
      });
    }
    rows.sort((a, b) => {
      if (a.newly_trending !== b.newly_trending) return a.newly_trending ? -1 : 1;
      const ga = a.growth_rate ?? -999999;
      const gb = b.growth_rate ?? -999999;
      if (gb !== ga) return gb - ga;
      return b.absolute_delta - a.absolute_delta;
    });

    res.json({
      from, to, prior_from: priorFrom, prior_to: priorTo,
      total: rows.length,
      rows: rows.slice(0, limit),
    });
  }
}));

export default router;
