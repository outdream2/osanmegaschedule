// GET /api/stock-manage/top-products?days=7|30|90&limit=100
// 매입 금액 상위 상품
// 2026-08-09 · 소스: purchase_details (ERP) · queryPurchaseDetails 헬퍼 사용
import { Router } from "express";
import { supabase } from "../../../../src/supabase/client";
import { queryPurchaseDetails } from "../../../utils/purchaseDetailsQuery";
import { asyncHandler } from "../../../middleware/asyncHandler";
import { daysAgoISO } from "./helpers";
// 2026-09-14 · 사용자 대원칙 · ocrAggCache 제거 · 매 요청 실시간 조회

const router = Router();

router.get("/api/stock-manage/top-products", asyncHandler(async (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  const days = Math.max(1, Math.min(365, parseInt(String(req.query.days ?? "7"), 10) || 7));
  const limit = Math.max(1, Math.min(500, parseInt(String(req.query.limit ?? "100"), 10) || 100));
  const sinceYmd = daysAgoISO(days).slice(0, 10);
  const rows = await queryPurchaseDetails({ sinceYmd });
  const map = new Map<string, { product_name: string | null; product_code: string | null; supplier: string | null; totalAmount: number; totalQty: number }>();
  for (const r of rows) {
    const key = r.product_code || r.product_name;
    if (!key) continue;
    const cur = map.get(key) ?? {
      product_name: null,  // 2026-10-06 · 대원칙 · products.product_name 로 교체 (아래)
      product_code: r.product_code || null,
      supplier: r.supplier || null,
      totalAmount: 0, totalQty: 0,
    };
    cur.totalAmount += r.amount;
    cur.totalQty   += r.quantity;
    map.set(key, cur);
  }
  const result = [...map.values()].sort((a, b) => b.totalAmount - a.totalAmount).slice(0, limit);

  // 2026-10-06 · 대원칙 · DB JOIN · products.product_name SSOT 로 교체 · code fallback 금지
  const codes = result.map(r => r.product_code).filter((c): c is string => !!c);
  if (codes.length > 0) {
    const nameByCode = new Map<string, string | null>();
    const CHUNK = 500;
    for (let i = 0; i < codes.length; i += CHUNK) {
      const chunk = codes.slice(i, i + CHUNK);
      const { data } = await supabase.from("products")
        .select("product_code, product_name").in("product_code", chunk);
      for (const p of data ?? []) {
        nameByCode.set(String(p.product_code).trim(), (String(p.product_name ?? "").trim() || null));
      }
    }
    for (const r of result) {
      if (r.product_code && nameByCode.has(r.product_code)) {
        r.product_name = nameByCode.get(r.product_code) ?? null;
      }
    }
  }

  res.json(result);
}));

export default router;
