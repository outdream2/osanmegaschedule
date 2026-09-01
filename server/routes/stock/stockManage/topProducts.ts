// GET /api/stock-manage/top-products?days=7|30|90&limit=100
// 매입 금액 상위 상품
// 2026-08-09 · 소스: purchase_details (ERP) · queryPurchaseDetails 헬퍼 사용
import { Router } from "express";
import { queryPurchaseDetails } from "../../../utils/purchaseDetailsQuery";
import { asyncHandler } from "../../../middleware/asyncHandler";
import { daysAgoISO, ocrAggCache, OCR_AGG_TTL } from "./helpers";

const router = Router();

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

export default router;
