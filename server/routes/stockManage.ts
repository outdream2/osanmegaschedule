// server/routes/stockManage.ts
// 재고관리 페이지 백엔드 API
// - 공급사별 매입 집계 (기간별)
// - Top 100 (금액 기준)
// - 적정재고 이하 리스트 (products.optimal_stock 기준)
// - 상품별 매입 이력 (차트용)
// - 재고 리스트 xlsx 업로드 (product_code + current_stock 업데이트)
//
// 매출은 별도 데이터 소스 없음 — 매입만 처리

import { Router } from "express";
import express from "express";
import XLSX from "xlsx";
import { supabase } from "../../src/supabase/client";

const router = Router();

function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

// GET /api/stock-manage/suppliers?days=7|30|90
// 공급사별 매입 총액 · 수량 · 상품수
router.get("/api/stock-manage/suppliers", async (req, res) => {
  const days = Math.max(1, Math.min(365, parseInt(String(req.query.days ?? "7"), 10) || 7));
  const since = daysAgoISO(days);
  try {
    const { data, error } = await supabase
      .from("ocr_confirmed_items")
      .select("supplier, product_name, quantity, amount")
      .gte("saved_at", since)
      .limit(50000);
    if (error) throw new Error(error.message);
    const map = new Map<string, { supplier: string; purchaseAmount: number; purchaseQty: number; items: Set<string> }>();
    for (const r of data ?? []) {
      const sup = (r.supplier ?? "").trim();
      if (!sup) continue;
      const cur = map.get(sup) ?? { supplier: sup, purchaseAmount: 0, purchaseQty: 0, items: new Set<string>() };
      cur.purchaseAmount += Number(r.amount ?? 0) || 0;
      cur.purchaseQty   += Number(r.quantity ?? 0) || 0;
      if (r.product_name) cur.items.add(String(r.product_name));
      map.set(sup, cur);
    }
    const result = [...map.values()]
      .map(x => ({ supplier: x.supplier, purchaseAmount: x.purchaseAmount, purchaseQty: x.purchaseQty, itemCount: x.items.size }))
      .sort((a, b) => b.purchaseAmount - a.purchaseAmount);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stock-manage/top-products?days=7|30|90&limit=100
// 매입 금액 상위 상품
router.get("/api/stock-manage/top-products", async (req, res) => {
  const days = Math.max(1, Math.min(365, parseInt(String(req.query.days ?? "7"), 10) || 7));
  const limit = Math.max(1, Math.min(500, parseInt(String(req.query.limit ?? "100"), 10) || 100));
  const since = daysAgoISO(days);
  try {
    const { data, error } = await supabase
      .from("ocr_confirmed_items")
      .select("product_name, product_code, supplier, quantity, amount")
      .gte("saved_at", since)
      .limit(50000);
    if (error) throw new Error(error.message);
    const map = new Map<string, { product_name: string; product_code: string | null; supplier: string | null; totalAmount: number; totalQty: number }>();
    for (const r of data ?? []) {
      const key = String(r.product_code ?? r.product_name ?? "").trim();
      if (!key) continue;
      const cur = map.get(key) ?? {
        product_name: String(r.product_name ?? key),
        product_code: r.product_code ?? null,
        supplier: r.supplier ?? null,
        totalAmount: 0, totalQty: 0,
      };
      cur.totalAmount += Number(r.amount ?? 0) || 0;
      cur.totalQty   += Number(r.quantity ?? 0) || 0;
      map.set(key, cur);
    }
    const result = [...map.values()].sort((a, b) => b.totalAmount - a.totalAmount).slice(0, limit);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stock-manage/supplier-purchases?snapshot_date=YYYY-MM-DD&limit=20
// stock_history 기반 공급사별 매입/판매/재고 집계 (금액·수량 · 상품수)
router.get("/api/stock-manage/supplier-purchases", async (req, res) => {
  const limit = Math.max(1, Math.min(50000, parseInt(String(req.query.limit ?? "20"), 10) || 20));
  const dateParam = String(req.query.snapshot_date ?? "").trim();
  try {
    let targetDate = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : "";
    if (!targetDate) {
      const { data: latest } = await supabase
        .from("stock_history")
        .select("snapshot_date")
        .order("snapshot_date", { ascending: false })
        .limit(1);
      targetDate = latest?.[0]?.snapshot_date ?? "";
    }
    if (!targetDate) return res.json({ snapshot_date: null, top: null, rows: [] });

    // 전체 조회 (페이지네이션) — 공급사코드로 그룹핑 (코드 없으면 이름으로 폴백)
    const map = new Map<string, {
      supplier: string;
      supplier_code: string | null;
      names: Set<string>;          // 같은 코드에 여러 이름이 붙는 경우 감지
      purchaseQty: number;
      purchaseAmount: number;
      saleQty: number;
      itemCount: number;
      totalStockAmount: number;
    }>();
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("stock_history")
        .select("supplier_code, supplier_name, purchase_qty, sale_qty, supply_amount, total_amount")
        .eq("snapshot_date", targetDate)
        .range(from, from + PAGE - 1);
      if (error) {
        if (/relation|does not exist/i.test(error.message)) break;
        throw new Error(error.message);
      }
      if (!data || data.length === 0) break;
      for (const r of data) {
        const supName = String(r.supplier_name ?? "").trim();
        const supCode = String(r.supplier_code ?? "").trim();
        if (!supName && !supCode) continue;
        // 그룹 키: 공급사코드 우선, 없으면 이름 (앞에 `n:` prefix로 충돌 방지)
        const key = supCode ? `c:${supCode}` : `n:${supName}`;
        const cur = map.get(key) ?? {
          supplier: supName || supCode,
          supplier_code: supCode || null,
          names: new Set<string>(),
          purchaseQty: 0, purchaseAmount: 0, saleQty: 0, itemCount: 0, totalStockAmount: 0,
        };
        if (supName) cur.names.add(supName);
        const purchQty = Number(r.purchase_qty ?? 0) || 0;
        cur.purchaseQty      += purchQty;
        // 공급가액 = 스냅샷 기간 내 거래 공급가 합계 (매입/판매 모두 포함해 실제 xlsx 값 그대로 노출)
        // 이전 로직은 purchase_qty > 0 인 row 만 누적해 판매만 있는 공급사가 항상 0 이 되던 이슈 해결
        cur.purchaseAmount   += Number(r.supply_amount ?? 0) || 0;
        cur.saleQty          += Number(r.sale_qty ?? 0) || 0;
        cur.totalStockAmount += Number(r.total_amount ?? 0) || 0;
        cur.itemCount++;
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
      itemCount: v.itemCount,
      totalStockAmount: v.totalStockAmount,
    })).sort((a, b) => b.totalStockAmount - a.totalStockAmount);
    const top = rows.length > 0 ? rows[0] : null;
    res.json({ snapshot_date: targetDate, top, rows: rows.slice(0, limit) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stock-manage/snapshot-summary?snapshot_date=YYYY-MM-DD
// 스냅샷 전체 통계 (Top N 제한 없이 전 상품 합계) — 대시보드 상단 메트릭용
router.get("/api/stock-manage/snapshot-summary", async (req, res) => {
  const dateParam = String(req.query.snapshot_date ?? "").trim();
  try {
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
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

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
router.get("/api/sales-trend/product", async (req, res) => {
  const code = String(req.query.code ?? "").trim();
  if (!code) return res.status(400).json({ error: "code 필수" });
  // months 지정 시 오늘 기준 최근 N개월 범위로 필터
  const months = Math.max(0, Math.min(24, parseInt(String(req.query.months ?? "0"), 10) || 0));
  // 캐시 조회 (반복 클릭·기간 변경 즉시 응답)
  const cacheKey = `${code}::${months}`;
  const cached = salesTrendCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Cache", "HIT");
    return res.json(cached.data);
  }
  try {
    let q = supabase
      .from("stock_history")
      .select("period_start_date, snapshot_date, period_type, supplier_name, product_name, spec, opening_stock, purchase_qty, sale_qty, disposal_qty, closing_stock, supply_amount, total_amount")
      .eq("product_code", code);
    if (months > 0) {
      const today = new Date();
      const cutoff = new Date(today.getFullYear(), today.getMonth() - months, 1);
      const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-01`;
      q = q.gte("snapshot_date", cutoffStr);
    }
    const { data, error } = await q
      .order("period_start_date", { ascending: true, nullsFirst: false })
      .order("snapshot_date", { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    const payload = { code, months, rows: data ?? [] };
    salesTrendCache.set(cacheKey, { data: payload, expiresAt: Date.now() + SALES_TREND_TTL });
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Cache", "MISS");
    res.json(payload);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sales-trend/supplier?name=<공급사명>
// 공급사별 기간 aggregation (모든 상품 합계)
router.get("/api/sales-trend/supplier", async (req, res) => {
  const name = String(req.query.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "name 필수" });
  const months = Math.max(0, Math.min(24, parseInt(String(req.query.months ?? "0"), 10) || 0));
  const cutoffStr = months > 0
    ? (() => { const t = new Date(); const c = new Date(t.getFullYear(), t.getMonth() - months, 1); return `${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, "0")}-01`; })()
    : null;
  try {
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
      all.push(...data);
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
      const key = String((r as any).period_start_date ?? (r as any).snapshot_date);
      if (!byPeriod.has(key)) {
        byPeriod.set(key, {
          period_start_date: (r as any).period_start_date ?? (r as any).snapshot_date,
          snapshot_date: (r as any).snapshot_date,
          period_type: (r as any).period_type,
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
      agg.purchase_qty += Number((r as any).purchase_qty ?? 0) || 0;
      agg.sale_qty     += Number((r as any).sale_qty ?? 0) || 0;
      agg.closing_stock += Number((r as any).closing_stock ?? 0) || 0;
      agg.supply_amount += Number((r as any).supply_amount ?? 0) || 0;
      agg.total_amount  += Number((r as any).total_amount ?? 0) || 0;
      // snapshot_date 는 최신 것으로 갱신 (같은 period 안에 여러 스냅샷 있을 경우 마지막)
      if ((r as any).snapshot_date > agg.snapshot_date) agg.snapshot_date = (r as any).snapshot_date;
    }
    const rows = Array.from(byPeriod.values()).sort((a, b) => a.period_start_date.localeCompare(b.period_start_date));
    res.setHeader("Cache-Control", "no-store");
    res.json({ supplier: name, rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sales-trend/overview
// 전체 기간별 총합 (모든 상품 · 모든 공급사)
router.get("/api/sales-trend/overview", async (_req, res) => {
  try {
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
      const key = String((r as any).period_start_date ?? (r as any).snapshot_date);
      if (!byPeriod.has(key)) {
        byPeriod.set(key, {
          period_start_date: (r as any).period_start_date ?? (r as any).snapshot_date,
          snapshot_date: (r as any).snapshot_date,
          period_type: (r as any).period_type,
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
      agg.purchase_qty += Number((r as any).purchase_qty ?? 0) || 0;
      agg.sale_qty     += Number((r as any).sale_qty ?? 0) || 0;
      agg.closing_stock += Number((r as any).closing_stock ?? 0) || 0;
      agg.supply_amount += Number((r as any).supply_amount ?? 0) || 0;
      agg.total_amount  += Number((r as any).total_amount ?? 0) || 0;
      if ((r as any).snapshot_date > agg.snapshot_date) agg.snapshot_date = (r as any).snapshot_date;
    }
    const rows = Array.from(byPeriod.values()).sort((a, b) => a.period_start_date.localeCompare(b.period_start_date));
    res.setHeader("Cache-Control", "no-store");
    res.json({ rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── top-sales in-memory 캐시 (heavy aggregation · TTL 3분) ─────────────────
const topSalesCache = new Map<string, { data: any; expiresAt: number }>();
const TOP_SALES_TTL = 3 * 60 * 1000; // 3분

// GET /api/stock-manage/top-sales?snapshot_date=YYYY-MM-DD&sort=sale|purchase|amount|closing&dir=asc|desc&limit=100&supplier=<이름>&supplier_code=<코드>
// 재고 스냅샷의 상품별 흐름 (xlsx 각 행) — 정렬·limit·범위 필터는 클라이언트에서
router.get("/api/stock-manage/top-sales", async (req, res) => {
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

  // 캐시 조회 (반복 요청 · 정렬/limit 변경 즉시 응답)
  const cacheKey = `${dateParam}::${monthsParam}::${sort}::${dir}::${limit}::${supplierFilter}::${supplierCodeFilter}`;
  const cached = topSalesCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    res.setHeader("X-Cache", "HIT");
    return res.json(cached.data);
  }

  try {
    // ── months 지정 시: 범위 aggregation 모드 ──
    if (monthsParam > 0) {
      const today = new Date();
      const cutoff = new Date(today.getFullYear(), today.getMonth() - monthsParam, 1);
      const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-01`;

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
      const productMap = new Map<string, { optimal_stock: number; sale_price: number; current_stock: number; last_purchase_date: string | null }>();
      const hiddenSet = new Set<string>();
      try {
        const OP_PAGE = 1000;
        let opFrom = 0;
        while (true) {
          const { data: page } = await supabase
            .from("products")
            .select("product_code, optimal_stock, sale_price, current_stock, last_purchase_date, hidden")
            .range(opFrom, opFrom + OP_PAGE - 1);
          if (!page || page.length === 0) break;
          for (const p of page) {
            const code = String((p as any).product_code ?? "").trim();
            if (!code) continue;
            if ((p as any).hidden === true) { hiddenSet.add(code); continue; }
            productMap.set(code, {
              optimal_stock: Number((p as any).optimal_stock ?? 0) || 0,
              sale_price:    Number((p as any).sale_price    ?? 0) || 0,
              current_stock: Number((p as any).current_stock ?? 0) || 0,
              last_purchase_date: (p as any).last_purchase_date ?? null,
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
        const code = String((r as any).product_code ?? "").trim();
        if (!code || hiddenSet.has(code)) continue;
        const snap = String((r as any).snapshot_date ?? "");
        snapshotSet.add(snap);
        if (snap > latestSnapshot) latestSnapshot = snap;
        if (!byCode.has(code)) {
          byCode.set(code, {
            product_code:  code,
            product_name:  String((r as any).product_name ?? code),
            supplier:      (r as any).supplier_name ?? null,
            spec:          (r as any).spec ?? null,
            opening_stock: Number((r as any).opening_stock ?? 0) || 0,
            purchase_qty:  0,
            sale_qty:      0,
            disposal_qty:  0,
            closing_stock: Number((r as any).closing_stock ?? 0) || 0,
            total_amount:  0,
            first_snap:    snap,
            last_snap:     snap,
            optimal_stock: productMap.get(code)?.optimal_stock ?? 0,
            sale_price:    productMap.get(code)?.sale_price ?? 0,
            current_stock: productMap.get(code)?.current_stock ?? 0,
            last_purchase_date: productMap.get(code)?.last_purchase_date ?? null,
          });
        }
        const agg = byCode.get(code)!;
        agg.purchase_qty += Number((r as any).purchase_qty ?? 0) || 0;
        agg.sale_qty     += Number((r as any).sale_qty ?? 0) || 0;
        agg.disposal_qty += Number((r as any).disposal_qty ?? 0) || 0;
        agg.total_amount += Number((r as any).total_amount ?? 0) || 0;
        // opening = 가장 이른 스냅샷의 opening
        if (snap < agg.first_snap) {
          agg.first_snap = snap;
          agg.opening_stock = Number((r as any).opening_stock ?? 0) || 0;
        }
        // closing = 가장 늦은 스냅샷의 closing
        if (snap > agg.last_snap) {
          agg.last_snap = snap;
          agg.closing_stock = Number((r as any).closing_stock ?? 0) || 0;
        }
        // last_purchase_date: purchase_qty > 0 인 스냅샷 날짜 중 최신
        if ((Number((r as any).purchase_qty) || 0) > 0 && snap > (agg.last_purchase_date ?? "")) {
          agg.last_purchase_date = snap;
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
        const dt = (d as any).snapshot_date;
        const pt = (d as any).period_type;
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
      let q = supabase
        .from("stock_history")
        .select("product_code, product_name, supplier_code, supplier_name, spec, opening_stock, purchase_qty, sale_qty, disposal_qty, internal_qty, adjustment_qty, closing_stock, total_amount")
        .eq("snapshot_date", targetDate)
        .order(dbCol, { ascending: dir === "asc" })
        .limit(fetchLimit);
      const { data: page, error } = await q;
      if (error) {
        if (/relation|does not exist/i.test(error.message)) return res.json({ snapshot_date: null, dates: [], rows: [] });
        throw new Error(error.message);
      }
      data.push(...(page ?? []));
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
    const productMap = new Map<string, { optimal_stock: number; sale_price: number; current_stock: number; last_purchase_date: string | null }>();
    const hiddenSet = new Set<string>();
    const codesInResult = Array.from(new Set(data.map(r => String(r.product_code ?? "").trim()).filter(Boolean)));
    try {
      // Supabase in() 은 URL 길이 제한 있어서 청크로 분할
      const CHUNK = 500;
      for (let i = 0; i < codesInResult.length; i += CHUNK) {
        const chunk = codesInResult.slice(i, i + CHUNK);
        const { data: page } = await supabase
          .from("products")
          .select("product_code, optimal_stock, sale_price, current_stock, last_purchase_date, min_order, hidden")
          .in("product_code", chunk);
        for (const p of page ?? []) {
          const code = String((p as any).product_code ?? "").trim();
          if (!code) continue;
          if ((p as any).hidden === true) { hiddenSet.add(code); continue; }
          productMap.set(code, {
            optimal_stock: Number((p as any).optimal_stock ?? 0) || 0,
            sale_price:    Number((p as any).sale_price    ?? 0) || 0,
            current_stock: Number((p as any).current_stock ?? 0) || 0,
            last_purchase_date: (p as any).last_purchase_date ?? null,
            min_order:     Number((p as any).min_order     ?? 0) || 0,
          } as any);
        }
      }
    } catch (e: any) {
      console.warn("[top-sales] products fetch 실패:", e?.message);
    }

    // ═══ purchase_details 조인 · 최근/최초 매입일 + 매입 금액 + 횟수 병합 (2026-07-15) ═══
    //   상품 코드별: 최근 매입일 · 최초 매입일(매입주기 계산용) · 총 매입 금액 · 매입 횟수
    const purchaseInfoMap = new Map<string, { lastDate: string | null; firstDate: string | null; lastAmount: number; totalQty: number; totalAmount: number; count: number }>();
    try {
      const CHUNK = 500;
      for (let i = 0; i < codesInResult.length; i += CHUNK) {
        const chunk = codesInResult.slice(i, i + CHUNK);
        const { data: pdRows } = await supabase
          .from("purchase_details")
          .select("product_code, purchase_date, quantity, amount, total")
          .in("product_code", chunk)
          .order("purchase_date", { ascending: false });
        for (const r of pdRows ?? []) {
          const code = String((r as any).product_code ?? "").trim();
          if (!code) continue;
          const cur = purchaseInfoMap.get(code) ?? { lastDate: null, firstDate: null, lastAmount: 0, totalQty: 0, totalAmount: 0, count: 0 };
          const d = String((r as any).purchase_date ?? "");
          const amt = Number((r as any).total ?? (r as any).amount ?? 0) || 0;
          const qty = Number((r as any).quantity ?? 0) || 0;
          if (!cur.lastDate || d > cur.lastDate) { cur.lastDate = d; cur.lastAmount = amt; }
          if (!cur.firstDate || d < cur.firstDate) { cur.firstDate = d; }
          cur.totalQty += qty;
          cur.totalAmount += amt;
          cur.count++;
          purchaseInfoMap.set(code, cur);
        }
      }
      console.log(`[top-sales] purchase_details 조인: ${purchaseInfoMap.size}개 상품 매입 이력 매칭`);
    } catch (e: any) {
      console.warn("[top-sales] purchase_details 조인 실패 (계속 진행):", e?.message);
    }

    // last_purchase_date 보강: products.last_purchase_date가 null이거나
    // 현재 스냅샷보다 오래된 경우, 이 스냅샷의 purchase_qty > 0이면
    // 현재 스냅샷 날짜를 최근 매입일로 대체 (더 최신 정보 반영)
    const rows = (data ?? []).filter(r => !hiddenSet.has(String(r.product_code ?? ""))).map(r => {
      const prod = productMap.get(String(r.product_code ?? ""));
      const purchaseQty = Number(r.purchase_qty ?? 0) || 0;
      let lastPurchase = prod?.last_purchase_date ?? null;
      // 이 스냅샷에서 실제 매입이 있고, 기존 last_purchase_date가 없거나 이보다 오래되었다면 대체
      if (purchaseQty > 0) {
        if (!lastPurchase || String(lastPurchase) < String(targetDate)) {
          lastPurchase = targetDate;
        }
      }
      // purchase_details 조인 · 최근 매입일이 더 최신이면 그걸로 대체
      const purchaseInfo = purchaseInfoMap.get(String(r.product_code ?? ""));
      if (purchaseInfo?.lastDate) {
        if (!lastPurchase || String(purchaseInfo.lastDate) > String(lastPurchase)) {
          lastPurchase = purchaseInfo.lastDate;
        }
      }
      return {
        product_code:  String(r.product_code ?? ""),
        product_name:  String(r.product_name ?? r.product_code ?? ""),
        supplier:      r.supplier_name ?? null,
        spec:          r.spec ?? null,
        opening_stock:  Number(r.opening_stock ?? 0) || 0,
        purchase_qty:   purchaseQty,
        sale_qty:       Number(r.sale_qty       ?? 0) || 0,
        disposal_qty:   Number(r.disposal_qty   ?? 0) || 0,
        internal_qty:   Number((r as any).internal_qty   ?? 0) || 0,
        adjustment_qty: Number((r as any).adjustment_qty ?? 0) || 0,
        closing_stock:  Number(r.closing_stock  ?? 0) || 0,
        total_amount:   Number(r.total_amount   ?? 0) || 0,
        optimal_stock: prod?.optimal_stock ?? 0,
        sale_price:    prod?.sale_price    ?? 0,
        current_stock: prod?.current_stock ?? 0,
        last_purchase_date: lastPurchase,
        // purchase_details 매입 이력 요약 (재고리스트 · 공급사재고 확장 리스트에서 표시)
        purchase_last_amount:  purchaseInfo?.lastAmount ?? 0,
        purchase_total_qty:    purchaseInfo?.totalQty   ?? 0,
        purchase_total_amount: purchaseInfo?.totalAmount?? 0,
        purchase_count:        purchaseInfo?.count      ?? 0,
        first_purchase_date:   purchaseInfo?.firstDate  ?? null,
        // 최소주문량 (products.min_order) — 공급사재고 확장 리스트에 표시
        min_order: Number((prod as any)?.min_order ?? 0) || 0,
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
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stock-manage/low-stock
// 적정재고보다 현재고가 작은 상품 (current_stock < optimal_stock, 둘 다 값 있음)
// 페이지네이션으로 전체 조회 (Supabase 기본 limit 1000 우회)
// inventory_checks 최근값(제품별)에서 warehouse_stock / store_stock 실재고 병합
router.get("/api/stock-manage/low-stock", async (_req, res) => {
  try {
    const all: any[] = [];
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("products")
        .select("product_name, product_code, spec, current_stock, optimal_stock, supplier, real_map")
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
          const code = String((r as any).product_code ?? "").trim();
          if (!code || invMap.has(code)) continue; // 최근값(정렬 첫)만 유지
          invMap.set(code, {
            warehouse_stock: (r as any).warehouse_stock != null ? Number((r as any).warehouse_stock) : null,
            store_stock:     (r as any).store_stock     != null ? Number((r as any).store_stock)     : null,
            checked_at:      (r as any).checked_at ?? null,
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
          current_stock:  rest.current_stock  != null && rest.current_stock  !== "" ? Number(rest.current_stock)  : null,
          optimal_stock:  rest.optimal_stock  != null && rest.optimal_stock  !== "" ? Number(rest.optimal_stock)  : null,
          warehouse_stock: inv?.warehouse_stock ?? null,
          store_stock:     inv?.store_stock     ?? null,
          inv_checked_at:  inv?.checked_at ?? null,
        };
      });
    res.json(filtered);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stock-manage/raw?snapshot_date=YYYY-MM-DD&limit=5000
// 재고현황 xlsx 원본 데이터 (stock_history) 그대로 반환 — 필터 없이 모든 컬럼
router.get("/api/stock-manage/raw", async (req, res) => {
  const dateParam = String(req.query.snapshot_date ?? "").trim();
  const limit = Math.max(1, Math.min(20000, parseInt(String(req.query.limit ?? "5000"), 10) || 5000));
  try {
    let query = supabase
      .from("stock_history")
      .select("*")
      .order("supplier_name", { ascending: true })
      .limit(limit);
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      query = query.eq("snapshot_date", dateParam);
    }
    const { data, error } = await query;
    if (error) {
      if (/relation|does not exist/i.test(error.message)) return res.json({ dates: [], rows: [] });
      throw new Error(error.message);
    }
    // 사용가능한 스냅샷 날짜 목록도 함께 반환
    const { data: allDates } = await supabase
      .from("stock_history")
      .select("snapshot_date")
      .order("snapshot_date", { ascending: false })
      .limit(1000);
    const dates = [...new Set((allDates ?? []).map(d => (d as any).snapshot_date))];
    res.json({ dates, rows: data ?? [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stock-manage/product-info?code=<product_code>
// 지정 상품의 products 정보 + 스냅샷별 stock_history + 최근 inventory_check 실재고 병합
router.get("/api/stock-manage/product-info", async (req, res) => {
  const code = String(req.query.code ?? "").trim();
  if (!code) return res.status(400).json({ error: "code 필요" });
  try {
    const [prodRes, histRes, invRes] = await Promise.all([
      supabase.from("products").select("*").eq("product_code", code).maybeSingle(),
      supabase.from("stock_history").select("*").eq("product_code", code).order("snapshot_date", { ascending: false }).limit(200),
      supabase.from("inventory_checks").select("*").eq("product_code", code).order("checked_at", { ascending: false }).limit(50),
    ]);
    if (prodRes.error && !/does not exist/i.test(prodRes.error.message)) throw new Error(prodRes.error.message);
    res.json({
      product: prodRes.data ?? null,
      stock_history: histRes.error ? [] : (histRes.data ?? []),
      inventory_checks: invRes.error ? [] : (invRes.data ?? []),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stock-manage/product-history?product_name=X&days=7
// 상품별 매입 이력 (차트 데이터)
router.get("/api/stock-manage/product-history", async (req, res) => {
  const name = String(req.query.product_name ?? "").trim();
  const code = String(req.query.product_code ?? "").trim();
  const days = Math.max(1, Math.min(365, parseInt(String(req.query.days ?? "7"), 10) || 7));
  if (!name && !code) return res.status(400).json({ error: "product_name 또는 product_code 필요" });
  const since = daysAgoISO(days);
  try {
    let query = supabase
      .from("ocr_confirmed_items")
      .select("supplier, product_name, product_code, quantity, amount, saved_at")
      .gte("saved_at", since)
      .order("saved_at", { ascending: true })
      .limit(5000);
    if (code) query = query.eq("product_code", code);
    else      query = query.eq("product_name", name);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    res.json(data ?? []);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/upload-stock
// 재고 리스트 xlsx 업로드 (product_code + current_stock 만 upsert)
// 매칭 안 되는 product_code는 건드리지 않음 (안전 병합)
router.post("/api/upload-stock", express.raw({ type: "application/octet-stream", limit: "50mb" }), async (req, res) => {
  const { managerId } = req.query as Record<string, string>;
  if (!req.body || !Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ error: "파일이 없습니다" });
  }
  try {
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
    const headers: string[] = (arrRows[headerRowIdx] as any[]).map(h => String(h ?? "").trim());
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
          console.error(`  샘플 첫 행 code=${(chunk[0] as any).product_code} name=${(chunk[0] as any).product_name} sup=${(chunk[0] as any).supplier_name} snap=${(chunk[0] as any).snapshot_date}`);
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
    const prevLogs = Array.isArray(logData?.value) ? (logData.value as any[]) : [];
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
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stock-import-log
router.get("/api/stock-import-log", async (_req, res) => {
  const { data } = await supabase.from("app_settings").select("value").eq("key", "stock_import_log").maybeSingle();
  res.json(Array.isArray(data?.value) ? data.value : []);
});

// DELETE /api/stock-import-log
router.delete("/api/stock-import-log", async (_req, res) => {
  await supabase.from("app_settings").upsert({ key: "stock_import_log", value: [], updated_at: new Date().toISOString() }, { onConflict: "key" });
  res.json({ ok: true });
});

// ═════════════════════════════════════════════════════════════════
// GET /api/stock-manage/period-coverage
//   재고 스냅샷 커버리지 (월 × 초/중/하순) · 어느 기간 데이터가 있는지 한 눈에
//   응답: { periods: [{ ym, early, mid, late, total }], missing: [{ ym, period_type }] }
// ═════════════════════════════════════════════════════════════════
router.get("/api/stock-manage/period-coverage", async (_req, res) => {
  try {
    // stock_import_log(app_settings) 에서 임포트 이력 조회 · Supabase 1000행 제한 회피
    //   각 배치의 snapshot_date + period_type 로 커버리지 집계 · 스냅샷당 상품 rows 는 조회 불필요
    const { data: logData } = await supabase.from("app_settings").select("value").eq("key", "stock_import_log").maybeSingle();
    const logs = Array.isArray(logData?.value) ? (logData.value as any[]) : [];
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
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "커버리지 조회 실패" });
  }
});

export default router;
