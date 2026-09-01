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
  {
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
      if (error) throw new HttpError(500, error.message, "DB_ERROR");
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
      agg.purchase_qty  += Number(r.purchase_qty ?? 0) || 0;
      agg.sale_qty      += Number(r.sale_qty ?? 0) || 0;
      agg.closing_stock += Number(r.closing_stock ?? 0) || 0;
      agg.supply_amount += Number(r.supply_amount ?? 0) || 0;
      agg.total_amount  += Number(r.total_amount ?? 0) || 0;
      if (r.snapshot_date > agg.snapshot_date) agg.snapshot_date = r.snapshot_date;
    }
    const rows = Array.from(byPeriod.values()).sort((a, b) => a.period_start_date.localeCompare(b.period_start_date));
    res.setHeader("Cache-Control", "no-store");
    res.json({ supplier: name, season: seasonParam || undefined, season_months: seasonMonths ?? undefined, rows });
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
