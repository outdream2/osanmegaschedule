// GET /api/stock-manage/trending?window=30&limit=100
// GET /api/stock-manage/trending-period?from=YYYY-MM-DD&to=YYYY-MM-DD&prior_from=...&prior_to=...&limit=20
// 최근 판매 급상승 상품
import { Router } from "express";
import { supabase } from "../../../../src/supabase/client";
import { asyncHandler } from "../../../middleware/asyncHandler";
import { HttpError, badRequest } from "../../../middleware/errorHandler";

const router = Router();

// GET /api/stock-manage/trending
router.get("/api/stock-manage/trending", asyncHandler(async (req, res) => {
  const windowDays = Math.max(1, Math.min(180, parseInt(String(req.query.window ?? "30"), 10) || 30));
  // 2026-07-31 · 기준(=prior) window 를 별도 지정 가능
  const priorDaysRaw = req.query.prior_days ?? req.query.prior_window ?? "";
  const hasPriorDays = String(priorDaysRaw).trim() !== "";
  const priorDays = hasPriorDays
    ? Math.max(1, Math.min(365, parseInt(String(priorDaysRaw), 10) || windowDays))
    : windowDays;
  const limit = Math.max(1, Math.min(50000, parseInt(String(req.query.limit ?? "500"), 10) || 500));
  const minRecentQty = Math.max(0, parseInt(String(req.query.min_recent_qty ?? "0"), 10) || 0);
  const minGrowthPctRaw = String(req.query.min_growth_pct ?? "").trim();
  const hasMinGrowthPct = minGrowthPctRaw !== "" && !Number.isNaN(Number(minGrowthPctRaw));
  const minGrowthPct = hasMinGrowthPct ? Number(minGrowthPctRaw) : null;
  const supplierFilter = String(req.query.supplier ?? "").trim().toLowerCase();
  {
    const now = new Date();
    const recentFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate() - windowDays);
    const priorFrom = hasPriorDays
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - priorDays)
      : new Date(now.getFullYear(), now.getMonth(), now.getDate() - windowDays * 2);
    const recentFromStr = recentFrom.toISOString().slice(0, 10);
    const priorFromStr  = priorFrom.toISOString().slice(0, 10);
    const todayStr = now.toISOString().slice(0, 10);
    const scanFromStr = priorFromStr < recentFromStr ? priorFromStr : recentFromStr;

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
        throw new HttpError(500, error.message, "DB_ERROR");
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
        if (hasPriorDays) {
          if (snap >= recentFromStr) cur.recent += q;
          if (snap >= priorFromStr)  cur.prior  += q;
        } else {
          if (snap >= recentFromStr) cur.recent += q;
          else cur.prior += q;
        }
        salesMap.set(code, cur);
      }
      if (data.length < PAGE) break;
      from += PAGE;
    }

    // products 조인
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
          sale_price:    Number(p.sale_price    ?? 0) || 0,
          hidden: p.hidden === true,
        });
      }
    }

    const rows = [];
    for (const [code, s] of salesMap) {
      const prod = productMap.get(code);
      if (prod?.hidden) continue;
      const recent = s.recent;
      const prior  = s.prior;
      const delta  = recent - prior;
      const growthRate = prior > 0 ? Math.round(((recent - prior) / prior) * 100) : null;
      const newlyTrending = prior === 0 && recent > 0;
      if (minRecentQty > 0 && recent < minRecentQty) continue;
      if (minGrowthPct != null) {
        if (!newlyTrending && (growthRate ?? -999999) < minGrowthPct) continue;
      }
      if (supplierFilter) {
        const sup = (s.supplier ?? "").toLowerCase();
        if (!sup.includes(supplierFilter)) continue;
      }
      rows.push({
        product_code:  code,
        product_name:  s.name,
        supplier:      s.supplier,
        recent_sale:   recent,
        prior_sale:    prior,
        growth_rate:   growthRate,
        absolute_delta: delta,
        newly_trending: newlyTrending,
        current_stock: prod?.current_stock ?? 0,
        optimal_stock: prod?.optimal_stock ?? 0,
        sale_price:    prod?.sale_price    ?? 0,
        below_optimal: (prod?.optimal_stock ?? 0) > 0 && (prod?.current_stock ?? 0) < (prod?.optimal_stock ?? 0),
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
      window_days: windowDays,
      prior_days:  priorDays,
      prior_mode:  hasPriorDays ? "overlap" : "adjacent",
      recent_from: recentFromStr,
      prior_from:  priorFromStr,
      today:       todayStr,
      filters: {
        min_recent_qty: minRecentQty || null,
        min_growth_pct: minGrowthPct,
        supplier: supplierFilter || null,
      },
      total: rows.length,
      rows:  rows.slice(0, limit),
    });
  }
}));

// GET /api/stock-manage/trending-period
// 2026-07-30 · 명시적 기간 · 급상승 상품
router.get("/api/stock-manage/trending-period", asyncHandler(async (req, res) => {
  const from      = String(req.query.from       ?? "").trim();
  const to        = String(req.query.to         ?? "").trim();
  const priorFrom = String(req.query.prior_from ?? "").trim();
  const priorTo   = String(req.query.prior_to   ?? "").trim();
  const limit = Math.max(1, Math.min(1000, parseInt(String(req.query.limit ?? "20"), 10) || 20));
  if (!from || !to || !priorFrom || !priorTo) {
    throw badRequest("from · to · prior_from · prior_to 필수 (YYYY-MM-DD)");
  }
  {
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
        throw new HttpError(500, error.message, "DB_ERROR");
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
        if (snap >= from && snap <= to)           cur.recent += q;
        else if (snap >= priorFrom && snap <= priorTo) cur.prior  += q;
        salesMap.set(code, cur);
      }
      if (data.length < PAGE) break;
      fromRow += PAGE;
    }

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
      if (s.recent === 0) continue;
      const delta      = s.recent - s.prior;
      const growthRate = s.prior > 0 ? Math.round(((s.recent - s.prior) / s.prior) * 100) : null;
      rows.push({
        product_code:   code,
        product_name:   s.name,
        supplier:       s.supplier,
        recent_sale:    s.recent,
        prior_sale:     s.prior,
        growth_rate:    growthRate,
        absolute_delta: delta,
        newly_trending: s.prior === 0,
        current_stock:  prod?.current_stock ?? 0,
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
      rows:  rows.slice(0, limit),
    });
  }
}));

export default router;
