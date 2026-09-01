// GET /api/stock-manage/purchase-info-batch?codes=CODE1,CODE2,...
// 특정 상품들의 purchase_details 집계값만 반환
// 2026-07-29 · Phase 2 Lazy Loading · 매입주기·최근매입일 컬럼을 첫 로드 후 background 로 채우는 용도
import { Router } from "express";
import { supabase } from "../../../../src/supabase/client";
import { asyncHandler } from "../../../middleware/asyncHandler";
import { HttpError } from "../../../middleware/errorHandler";

const router = Router();

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
          if (error) throw new HttpError(500, error.message, "DB_ERROR");
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
    const items: Record<string, any> = {};
    for (const [code, info] of infoMap) {
      items[code] = {
        last_purchase_date:    info.lastDate,
        first_purchase_date:   info.firstDate,
        purchase_count:        info.dateSet.size,
        purchase_total_qty:    info.totalQty,
        purchase_total_amount: info.totalAmount,
        purchase_last_amount:  info.lastAmount,
      };
    }
    res.json({ items });
  }
}));

export default router;
