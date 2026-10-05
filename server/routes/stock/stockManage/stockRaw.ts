// GET /api/stock-manage/raw?snapshot_date=YYYY-MM-DD&limit=5000
// 재고현황 원본 데이터 (stock_history) 그대로 반환 — 필터 없이 모든 컬럼
// 2026-10-04 · stock_history RENAME · snapshot_date → period_end
//   · 쿼리 파라미터 (snapshot_date) 는 프론트 호환 유지 · 내부 DB 컬럼은 period_end 사용
//   · 응답 필드명도 period_end 로 노출 (dates 배열 포함)
import { Router } from "express";
import { supabase } from "../../../../src/supabase/client";
import { fetchAllWithRange } from "../../../utils/supabaseFetchAll";
import { asyncHandler } from "../../../middleware/asyncHandler";

const router = Router();

router.get("/api/stock-manage/raw", asyncHandler(async (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  // 2026-10-04 · 프론트 호환 · snapshot_date / period_end 양쪽 지원
  const dateParam = String(req.query.period_end ?? req.query.snapshot_date ?? "").trim();
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
        // 2026-10-04 · schema rename · snapshot_date → period_end
        query = query.eq("period_end", dateParam);
      }
      return query;
    }, limit);
  } catch (err: any) {
    if (/relation|does not exist/i.test(err?.message ?? "")) return res.json({ dates: [], rows: [] });
    throw err;
  }
  const { data: allDates } = await supabase
    .from("stock_history")
    .select("period_end")
    .order("period_end", { ascending: false })
    .limit(1000);
  const dates = [...new Set((allDates ?? []).map((d: any) => d.period_end))];
  res.json({ dates, rows: data ?? [] });
}));

export default router;
