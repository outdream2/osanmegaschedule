// GET /api/stock-manage/snapshot-summary?snapshot_date=YYYY-MM-DD
// 스냅샷 전체 통계 (Top N 제한 없이 전 상품 합계) — 대시보드 상단 메트릭용
import { Router } from "express";
import { supabase } from "../../../../src/supabase/client";
import { asyncHandler } from "../../../middleware/asyncHandler";
import { HttpError } from "../../../middleware/errorHandler";

const router = Router();

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
    // 2026-09-10 · #73 · 사용자 지시 · 판매액 = sale_qty × sale_price (xlsx total_amount 사용 금지)
    // products.sale_price map 사전 fetch · in memory
    const salePriceMap = new Map<string, number>();
    {
      const PP = 1000;
      let pFrom = 0;
      while (true) {
        const { data } = await supabase
          .from("products")
          .select("product_code, sale_price")
          .range(pFrom, pFrom + PP - 1);
        if (!data || data.length === 0) break;
        for (const p of data) {
          const c = String((p as any).product_code ?? "").trim();
          if (c) salePriceMap.set(c, Number((p as any).sale_price ?? 0) || 0);
        }
        if (data.length < PP) break;
        pFrom += PP;
      }
    }

    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("stock_history")
        .select("product_code, sale_qty, purchase_qty, disposal_qty, closing_stock, total_amount")
        .eq("snapshot_date", targetDate)
        .range(from, from + PAGE - 1);
      if (error) {
        if (/relation|does not exist/i.test(error.message)) break;
        throw new HttpError(500, error.message, "DB_ERROR");
      }
      if (!data || data.length === 0) break;
      for (const r of data) {
        totals.itemCount++;
        const sqty = Number(r.sale_qty ?? 0) || 0;
        const code = String((r as any).product_code ?? "").trim();
        const sp = salePriceMap.get(code) ?? 0;
        totals.totalSale     += sqty;
        totals.totalPurchase += Number(r.purchase_qty ?? 0) || 0;
        totals.totalDisposal += Number(r.disposal_qty ?? 0) || 0;
        // 판매액 · sale_qty × sale_price
        totals.totalAmount   += sqty * sp;
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

export default router;
