// GET /api/stock-manage/snapshot-summary?snapshot_date=YYYY-MM-DD
// 스냅샷 전체 통계 (Top N 제한 없이 전 상품 합계) — 대시보드 상단 메트릭용
import { Router } from "express";
import { supabase } from "../../../../src/supabase/client";
import { asyncHandler } from "../../../middleware/asyncHandler";
import { HttpError } from "../../../middleware/errorHandler";

const router = Router();

router.get("/api/stock-manage/snapshot-summary", asyncHandler(async (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  // 2026-10-04 · schema rename · snapshot_date → period_end · 프론트 호환 쿼리 유지
  const dateParam = String(req.query.period_end ?? req.query.snapshot_date ?? "").trim();
  {
    let targetDate = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : "";
    if (!targetDate) {
      const { data: latest } = await supabase
        .from("stock_history")
        .select("period_end")
        .order("period_end", { ascending: false })
        .limit(1);
      targetDate = (latest?.[0] as any)?.period_end ?? "";
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
    // 2026-10-05 · SSOT 전환 (사용자 지시):
    //   · 매출금액 (totalAmount) = sales.sale_total SUM (ERP 원본값 우선 · 재계산 금지)
    //   · 기존: stock_history.sale_stock × products.sale_price (파생 · 2026-09-10 정의)
    //   · sales 데이터 범위 외 period 는 totalAmount=0 (ERP Sale_Status 저장 범위 밖)
    //   · 수량 집계 (totalSale/Purchase/Disposal) 는 stock_history 유지 (상품별 수량 흐름 SSOT)
    const PAGE = 1000;
    let from = 0;
    let periodStart: string | null = null;
    while (true) {
      // 2026-10-04 · schema rename · sale_qty→sale_stock · purchase_qty→buy_stock · disposal_qty→product_bad_stock · snapshot_date→period_end
      const { data, error } = await supabase
        .from("stock_history")
        .select("period_start, product_code, sale_stock, buy_stock, product_bad_stock, closing_stock")
        .eq("period_end", targetDate)
        .range(from, from + PAGE - 1);
      if (error) {
        if (/relation|does not exist/i.test(error.message)) break;
        throw new HttpError(500, error.message, "DB_ERROR");
      }
      if (!data || data.length === 0) break;
      for (const r of data) {
        totals.itemCount++;
        if (!periodStart && (r as any).period_start) periodStart = String((r as any).period_start);
        totals.totalSale     += Number((r as any).sale_stock ?? 0) || 0;
        totals.totalPurchase += Number((r as any).buy_stock ?? 0) || 0;
        totals.totalDisposal += Number((r as any).product_bad_stock ?? 0) || 0;
        const closing = Number(r.closing_stock ?? 0);
        if (closing < 0) totals.negativeStockCount++;
        else if (closing > 0) totals.positiveStockCount++;
        else totals.zeroStockCount++;
      }
      if (data.length < PAGE) break;
      from += PAGE;
    }
    // 매출금액 · sales.sale_total SUM (period 기간)
    if (periodStart) {
      let sFrom = 0;
      while (true) {
        const { data } = await supabase
          .from("sales")
          .select("sale_total")
          .gte("sale_date", periodStart)
          .lte("sale_date", targetDate)
          .range(sFrom, sFrom + PAGE - 1);
        if (!data || data.length === 0) break;
        for (const s of data) totals.totalAmount += Number((s as { sale_total?: unknown }).sale_total ?? 0) || 0;
        if (data.length < PAGE) break;
        sFrom += PAGE;
      }
    }
    res.json({ snapshot_date: targetDate, totals });
  }
}));

export default router;
