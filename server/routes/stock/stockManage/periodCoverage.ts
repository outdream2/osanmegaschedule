// GET /api/stock-manage/period-coverage
// 재고 스냅샷 커버리지 (월 × 초/중/하순) · 어느 기간 데이터가 있는지 한 눈에
// 응답: { periods: [{ ym, early, mid, late, total }], missing: [{ ym, period_type }] }
import { Router } from "express";
import { supabase } from "../../../../src/supabase/client";
import { asyncHandler } from "../../../middleware/asyncHandler";

const router = Router();

router.get("/api/stock-manage/period-coverage", asyncHandler(async (_req, res) => {
  {
    const { data: logData } = await supabase.from("app_settings").select("value").eq("key", "stock_import_log").maybeSingle();
    const logs: any[] = Array.isArray(logData?.value) ? logData.value : [];
    const bucket = new Map<string, { early: Set<string>; mid: Set<string>; late: Set<string> }>();
    for (const l of logs) {
      const d = String(l.snapshot_date ?? "");
      if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
      const ym = d.slice(0, 7);
      let pt = String(l.period_type ?? "");
      if (!pt) {
        const dd = Number(d.slice(8, 10));
        pt = dd <= 10 ? "early" : dd <= 20 ? "mid" : "late";
      }
      const cur = bucket.get(ym) ?? { early: new Set(), mid: new Set(), late: new Set() };
      if (pt === "early" || pt === "mid" || pt === "late") cur[pt].add(d);
      bucket.set(ym, cur);
    }
    const yms = Array.from(bucket.keys()).sort();
    if (yms.length > 0) {
      const [y0, m0] = yms[0].split("-").map(Number);
      const [y1, m1] = yms[yms.length - 1].split("-").map(Number);
      for (let y = y0, m = m0; y < y1 || (y === y1 && m <= m1); ) {
        const ym = `${y}-${String(m).padStart(2, "0")}`;
        if (!bucket.has(ym)) bucket.set(ym, { early: new Set(), mid: new Set(), late: new Set() });
        m++; if (m > 12) { m = 1; y++; }
      }
    }
    const periods = Array.from(bucket.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ym, v]) => ({ ym, early: v.early.size, mid: v.mid.size, late: v.late.size, total: v.early.size + v.mid.size + v.late.size }));
    const missing: Array<{ ym: string; period_type: string }> = [];
    for (const p of periods) {
      if (p.early === 0) missing.push({ ym: p.ym, period_type: "early" });
      if (p.mid   === 0) missing.push({ ym: p.ym, period_type: "mid" });
      if (p.late  === 0) missing.push({ ym: p.ym, period_type: "late" });
    }
    res.json({ periods, missing });
  }
}));

export default router;
