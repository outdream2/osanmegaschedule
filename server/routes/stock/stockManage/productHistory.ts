// GET /api/stock-manage/product-history?product_name=X&days=7
// 상품별 매입 이력 (차트 데이터)
// 2026-08-09 · 소스: purchase_details (사용자 원칙 · 매입이력만)
import { Router } from "express";
import { supabase } from "../../../../src/supabase/client";
import { fetchAllWithRange } from "../../../utils/supabaseFetchAll";
import { asyncHandler } from "../../../middleware/asyncHandler";
import { badRequest } from "../../../middleware/errorHandler";
import { daysAgoISO } from "./helpers";

const router = Router();

router.get("/api/stock-manage/product-history", asyncHandler(async (req, res) => {
  const name = String(req.query.product_name ?? "").trim();
  const code = String(req.query.product_code ?? "").trim();
  const days = Math.max(1, Math.min(365, parseInt(String(req.query.days ?? "7"), 10) || 7));
  if (!name && !code) throw badRequest("product_name 또는 product_code 필요");
  const sinceYmd = daysAgoISO(days).slice(0, 10);
  // 2026-08-06 · Supabase 1000행 cap 우회 · fetchAllWithRange
  const rawData = await fetchAllWithRange<any>(() => {
    let query = supabase
      .from("purchase_details")
      .select("supplier_name, product_name, product_code, quantity, amount, total, purchase_date")
      .gte("purchase_date", sinceYmd)
      .order("purchase_date", { ascending: true });
    if (code) query = query.eq("product_code", code);
    else      query = query.eq("product_name", name);
    return query;
  }, 5000);
  // 응답 shape 유지 · supplier/saved_at 필드로 alias
  const data = (rawData ?? []).map((r: any) => ({
    supplier:     r.supplier_name ?? null,
    product_name: r.product_name,
    product_code: r.product_code,
    quantity:     r.quantity,
    amount:       r.amount ?? r.total ?? 0,
    saved_at:     r.purchase_date,
  }));
  res.json(data);
}));

export default router;
