import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
const s = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);
(async () => {
  const { data, error } = await s.from("stock_history").select("period_start_date").limit(1);
  if (error) {
    console.log("❌ period_start_date 컬럼 존재하지 않음 — 마이그레이션 실행 필요");
    console.log("   에러:", error.message);
  } else {
    console.log("✅ period_start_date 컬럼 존재. 샘플:", data);
  }

  // 전체 개수 확인
  const { count } = await s.from("stock_history").select("*", { count: "exact", head: true });
  console.log(`\nstock_history 총 행 수: ${count}`);

  // 각 스냅샷별 카운트
  const bySnap = new Map<string, number>();
  const PAGE = 1000; let from = 0;
  while (true) {
    const { data } = await s.from("stock_history").select("snapshot_date").range(from, from + PAGE - 1);
    if (!data || data.length === 0) break;
    for (const r of data) {
      const k = String((r as any).snapshot_date);
      bySnap.set(k, (bySnap.get(k) ?? 0) + 1);
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  console.log("\n스냅샷별 행 수 (최신순):");
  for (const [d, n] of Array.from(bySnap.entries()).sort(([a],[b]) => b.localeCompare(a))) {
    console.log(`  ${d}  · ${n}행`);
  }
})();
