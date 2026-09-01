// GET /api/stock-manage/raw?snapshot_date=YYYY-MM-DD&limit=5000
// 재고현황 xlsx 원본 데이터 (stock_history) 그대로 반환 — 필터 없이 모든 컬럼
import { Router } from "express";
import { supabase } from "../../../../src/supabase/client";
import { fetchAllWithRange } from "../../../utils/supabaseFetchAll";
import { asyncHandler } from "../../../middleware/asyncHandler";

const router = Router();

router.get("/api/stock-manage/raw", asyncHandler(async (req, res) => {
  const dateParam = String(req.query.snapshot_date ?? "").trim();
  const limit = Math.max(1, Math.min(20000, parseInt(String(req.query.limit ?? "5000"), 10) || 5000));
  // 2026-08-06 · Supabase 1000행 cap 우회 · fetchAllWithRange
  let data: any[] = [];
  try {
    data = await fetchAllWithRange<any>(() => {
      let query = supabase
        .from("stock_history")
        .select("*")
        .order("supplier_name", { ascending: true });
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
        query = query.eq("snapshot_date", dateParam);
      }
      return query;
    }, limit);
  } catch (err: any) {
    if (/relation|does not exist/i.test(err?.message ?? "")) return res.json({ dates: [], rows: [] });
    throw err;
  }
  const { data: allDates } = await supabase
    .from("stock_history")
    .select("snapshot_date")
    .order("snapshot_date", { ascending: false })
    .limit(1000);
  const dates = [...new Set((allDates ?? []).map(d => d.snapshot_date))];
  res.json({ dates, rows: data ?? [] });
}));

export default router;
