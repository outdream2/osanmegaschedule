// GET /api/stock-manage/supplier-purchases?snapshot_date=YYYY-MM-DD&months=N&limit=20
// stock_history 기반 공급사별 매입/판매/재고 집계 (금액·수량·상품수)
// 2026-07-16: months 파라미터 추가 · 기간 범위 (오늘-months 개월 ~ 오늘) 집계
import { Router } from "express";
import { supabase } from "../../../../src/supabase/client";
import { resolveSeasonMonths } from "../../settings/settings";
import { asyncHandler } from "../../../middleware/asyncHandler";
import { HttpError } from "../../../middleware/errorHandler";
import { inSeasonMonths } from "./helpers";

const router = Router();

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
    const map = new Map<string, {
      supplier: string;
      supplier_code: string | null;
      names: Set<string>;
      products: Set<string>;
      purchaseQty: number;
      purchaseAmount: number;
      saleQty: number;
      saleAmount: number;
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
      } else if (fromDateStr) {
        query = query.gte("snapshot_date", fromDateStr).lte("snapshot_date", targetDate);
      } else {
        query = query.eq("snapshot_date", targetDate);
      }
      const { data, error } = await query.range(from, from + PAGE - 1);
      if (error) {
        if (/relation|does not exist/i.test(error.message)) break;
        throw new HttpError(500, error.message, "DB_ERROR");
      }
      if (!data || data.length === 0) break;
      for (const r of data) {
        if (seasonMonths && !inSeasonMonths(String(r.snapshot_date ?? ""), seasonMonths)) continue;
        const supName = String(r.supplier_name ?? "").trim();
        const supCode = String(r.supplier_code ?? "").trim();
        if (!supName && !supCode) continue;
        const key = supCode ? `c:${supCode}` : `n:${supName}`;
        const cur = map.get(key) ?? {
          supplier: supName || supCode,
          supplier_code: supCode || null,
          names: new Set<string>(),
          products: new Set<string>(),
          purchaseQty: 0, purchaseAmount: 0, saleQty: 0, saleAmount: 0, totalStockAmount: 0,
        };
        if (supName) cur.names.add(supName);
        // 2026-07-28: distinct product code 만 카운트
        const productCode = String(r.product_code ?? "").trim();
        if (productCode) cur.products.add(productCode);
        const purchQty  = Number(r.purchase_qty ?? 0) || 0;
        const saleQty   = Number(r.sale_qty ?? 0) || 0;
        const supplyAmt = Number(r.supply_amount ?? 0) || 0;
        cur.purchaseQty    += purchQty;
        cur.purchaseAmount += supplyAmt;
        cur.saleQty        += saleQty;
        const total = purchQty + saleQty;
        if (total > 0) cur.saleAmount += supplyAmt * (saleQty / total);
        cur.totalStockAmount += Number(r.total_amount ?? 0) || 0;
        map.set(key, cur);
      }
      if (data.length < PAGE) break;
      from += PAGE;
    }

    // 이름 충돌 감지
    const nameToCodes = new Map<string, Set<string>>();
    for (const v of map.values()) {
      for (const n of v.names) {
        const s = nameToCodes.get(n) ?? new Set<string>();
        if (v.supplier_code) s.add(v.supplier_code);
        nameToCodes.set(n, s);
      }
    }

    const rows = [...map.values()].map(v => ({
      supplier: v.supplier,
      supplier_code: v.supplier_code,
      names: [...v.names],
      code_conflict: [...v.names].some(n => (nameToCodes.get(n)?.size ?? 0) > 1),
      purchaseQty: v.purchaseQty,
      purchaseAmount: v.purchaseAmount,
      saleQty: v.saleQty,
      saleAmount: Math.round(v.saleAmount),
      itemCount: v.products.size,
      totalStockAmount: v.totalStockAmount,
    })).sort((a, b) => b.totalStockAmount - a.totalStockAmount);
    const top = rows.length > 0 ? rows[0] : null;
    res.json({ snapshot_date: targetDate, season: seasonParam || undefined, season_months: seasonMonths ?? undefined, top, rows: rows.slice(0, limit) });
  }
}));

export default router;
