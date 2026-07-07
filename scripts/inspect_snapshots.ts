import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const s = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);

(async () => {
  // 1. snapshot 별 상품수 · period_type
  const PAGE = 1000;
  let from = 0;
  const bySnap = new Map<string, { period: string | null; count: number }>();
  let total = 0;
  while (true) {
    const { data, error } = await s
      .from("stock_history")
      .select("snapshot_date, period_type")
      .order("snapshot_date", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) { console.error(error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    for (const r of data) {
      const k = String((r as any).snapshot_date);
      if (!bySnap.has(k)) bySnap.set(k, { period: (r as any).period_type, count: 0 });
      bySnap.get(k)!.count++;
      total++;
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  console.log(`전체 stock_history 행: ${total}`);
  const sorted = Array.from(bySnap.entries()).sort(([a], [b]) => b.localeCompare(a));
  console.log("\n─ 보유 스냅샷 목록 (최신순) ─");
  for (const [d, v] of sorted) {
    console.log(`  ${d}  · period=${v.period ?? "(null)"}  · 상품 ${v.count}행`);
  }

  // 2. 한 상품의 최신 스냅샷 raw 컬럼 값 확인
  const { data: sampleRow } = await s
    .from("stock_history")
    .select("*")
    .order("snapshot_date", { ascending: false })
    .limit(1);
  if (sampleRow?.[0]) {
    console.log("\n─ 샘플 행 (최신 스냅샷 첫 행) ─");
    console.log(JSON.stringify(sampleRow[0], null, 2));
  }
})();
