// ══════════════════════════════════════════════════════════════════════
// 판매추이 (Sales Trend) - stock_history 기간별 시계열
// GET /api/sales-trend/product?code=<상품코드>
// GET /api/sales-trend/supplier?name=<공급사명>
// GET /api/sales-trend/overview
// ══════════════════════════════════════════════════════════════════════
import { Router } from "express";
import { supabase } from "../../../../src/supabase/client";
import { resolveSeasonMonths } from "../../settings/settings";
import { asyncHandler } from "../../../middleware/asyncHandler";
import { HttpError, badRequest } from "../../../middleware/errorHandler";
import { inSeasonMonths, salesTrendCache, SALES_TREND_TTL } from "./helpers";

const router = Router();

// GET /api/sales-trend/product
router.get("/api/sales-trend/product", asyncHandler(async (req, res) => {
  const code = String(req.query.code ?? "").trim();
  if (!code) throw badRequest("code 필수");
  const months = Math.max(0, Math.min(24, parseInt(String(req.query.months ?? "0"), 10) || 0));
  const seasonParam = String(req.query.season ?? "").trim().toLowerCase();
  const seasonMonths = await resolveSeasonMonths(seasonParam);
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
    // 2026-07-16 fix: 정확히 N개월 back
    const today = new Date();
    const cutoff = new Date(today.getFullYear(), today.getMonth() - months, today.getDate());
    const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;
    q = q.gte("snapshot_date", cutoffStr);
  }
  const { data, error } = await q
    .order("period_start_date", { ascending: true, nullsFirst: false })
    .order("snapshot_date", { ascending: true });
  if (error) throw new HttpError(500, error.message, "DB_ERROR");
  const rows = seasonMonths
    ? (data ?? []).filter(r => inSeasonMonths(String(r.snapshot_date ?? ""), seasonMonths))
    : (data ?? []);
  const payload = { code, months, season: seasonParam || undefined, season_months: seasonMonths ?? undefined, rows };
  salesTrendCache.set(cacheKey, { data: payload, expiresAt: Date.now() + SALES_TREND_TTL });
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Cache", "MISS");
  res.json(payload);
}));

// 2026-09-10 · 사용자 지시 · 공급사명 정규화 매칭 (완전 일치 → 정규화 · 양방향 contains)
//   · Why · products.supplier 와 stock_history.supplier_name 이 서로 짧거나 다르게 저장된 경우
//     (예: vendor "테스트2" · products.supplier "테스" · stock_history.supplier_name "테스")
//   · How · normalize (trim·lower·공백·특수문자 제거) 후 · 서로 포함 관계면 매칭
function normalizeSupplierName(s: string | null | undefined): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[()（）\[\]【】·・∙•,\/\\]/g, "");
}
function supplierMatches(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeSupplierName(a);
  const nb = normalizeSupplierName(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

// GET /api/sales-trend/supplier
router.get("/api/sales-trend/supplier", asyncHandler(async (req, res) => {
  const name = String(req.query.name ?? "").trim();
  if (!name) throw badRequest("name 필수");
  const months = Math.max(0, Math.min(24, parseInt(String(req.query.months ?? "0"), 10) || 0));
  const seasonParam = String(req.query.season ?? "").trim().toLowerCase();
  const seasonMonths = await resolveSeasonMonths(seasonParam);
  // 2026-07-16 fix: 정확히 N개월 back
  const cutoffStr = (!seasonMonths && months > 0)
    ? (() => { const t = new Date(); const c = new Date(t.getFullYear(), t.getMonth() - months, t.getDate()); return `${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, "0")}-${String(c.getDate()).padStart(2, "0")}`; })()
    : null;

  // 2026-09-10 · 사용자 지시 · products.supplier 정규화 매칭 · product_code 수집 (마스터 기반)
  const matchedCodes = new Set<string>();
  {
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("products")
        .select("product_code, supplier")
        .range(from, from + PAGE - 1);
      if (error) break;
      if (!data || data.length === 0) break;
      for (const p of data) {
        if (supplierMatches((p as any).supplier, name)) {
          const code = String((p as any).product_code ?? "").trim();
          if (code) matchedCodes.add(code);
        }
      }
      if (data.length < PAGE) break;
      from += PAGE;
    }
  }
  {
    const all: any[] = [];
    const PAGE = 1000;
    let from = 0;
    while (true) {
      let q = supabase
        .from("stock_history")
        .select("period_start_date, snapshot_date, period_type, product_code, supplier_name, purchase_qty, sale_qty, closing_stock, supply_amount, total_amount");
      if (cutoffStr) q = q.gte("snapshot_date", cutoffStr);
      const { data, error } = await q
        .order("period_start_date", { ascending: true, nullsFirst: false })
        .range(from, from + PAGE - 1);
      if (error) throw new HttpError(500, error.message, "DB_ERROR");
      if (!data || data.length === 0) break;
      for (const r of data) {
        const code = String(r.product_code ?? "").trim();
        // products 매칭 or supplier_name 직접 매칭 (양쪽 다 확인)
        if (!matchedCodes.has(code) && !supplierMatches(r.supplier_name, name)) continue;
        if (seasonMonths && !inSeasonMonths(String(r.snapshot_date ?? ""), seasonMonths)) continue;
        all.push(r);
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
    // 2026-09-10 · #69 · 사용자 지시 · 상품별 집계 (상품명 · 판매수량 · 매입수량 · 매출액)
    const byProduct = new Map<string, {
      product_code: string;
      product_name: string;
      purchase_qty: number;
      sale_qty: number;
      closing_stock: number;
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
      agg.purchase_qty  += Number(r.purchase_qty ?? 0) || 0;
      agg.sale_qty      += Number(r.sale_qty ?? 0) || 0;
      agg.closing_stock += Number(r.closing_stock ?? 0) || 0;
      agg.supply_amount += Number(r.supply_amount ?? 0) || 0;
      agg.total_amount  += Number(r.total_amount ?? 0) || 0;
      if (r.snapshot_date > agg.snapshot_date) agg.snapshot_date = r.snapshot_date;

      // 상품별 aggregate
      const code = String(r.product_code ?? "").trim();
      if (code) {
        const p = byProduct.get(code) ?? { product_code: code, product_name: "", purchase_qty: 0, sale_qty: 0, closing_stock: 0, total_amount: 0 };
        p.purchase_qty  += Number(r.purchase_qty ?? 0) || 0;
        p.sale_qty      += Number(r.sale_qty ?? 0) || 0;
        p.total_amount  += Number(r.total_amount ?? 0) || 0;
        p.closing_stock = Number(r.closing_stock ?? 0) || 0; // 최신 마감 재고 (덮어씀)
        byProduct.set(code, p);
      }
    }

    // 상품명 · products JOIN (stock_history 에는 product_name 없을 수 있음)
    const productCodes = Array.from(byProduct.keys());
    if (productCodes.length > 0) {
      const CHUNK = 500;
      for (let i = 0; i < productCodes.length; i += CHUNK) {
        const chunk = productCodes.slice(i, i + CHUNK);
        const { data } = await supabase.from("products").select("product_code, product_name").in("product_code", chunk);
        for (const p of data ?? []) {
          const code = String(p.product_code ?? "").trim();
          const item = byProduct.get(code);
          if (item && !item.product_name) item.product_name = String(p.product_name ?? "").trim() || code;
        }
      }
      // Fallback · 상품명 없으면 코드
      for (const p of byProduct.values()) if (!p.product_name) p.product_name = p.product_code;
    }

    const rows = Array.from(byPeriod.values()).sort((a, b) => a.period_start_date.localeCompare(b.period_start_date));
    const products = Array.from(byProduct.values()).sort((a, b) => b.sale_qty - a.sale_qty); // 판매수량 desc
    res.setHeader("Cache-Control", "no-store");
    res.json({ supplier: name, season: seasonParam || undefined, season_months: seasonMonths ?? undefined, rows, products });
  }
}));

// GET /api/sales-trend/overview
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
      if (error) throw new HttpError(500, error.message, "DB_ERROR");
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
      agg.purchase_qty  += Number(r.purchase_qty ?? 0) || 0;
      agg.sale_qty      += Number(r.sale_qty ?? 0) || 0;
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

export default router;
