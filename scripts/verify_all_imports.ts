import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const s = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);

(async () => {
  // (1) 로그에 남긴 total vs 실제 DB 저장 카운트 비교
  const { data } = await s.from("app_settings").select("value").eq("key", "stock_import_log").maybeSingle();
  const logs = Array.isArray(data?.value) ? (data.value as any[]) : [];

  // 스냅샷별 로그 최신 항목 (여러 번 임포트 시 마지막 것만)
  const latestBySnapshot = new Map<string, any>();
  for (const e of logs) {
    const key = e.snapshot_date;
    if (!key) continue;
    if (!latestBySnapshot.has(key)) latestBySnapshot.set(key, e);
  }

  console.log(`\n─── 임포트 무결성 검증 (스냅샷 ${latestBySnapshot.size}개) ───\n`);
  console.log("스냅샷일      로그total  실제DB     결과");
  console.log("─".repeat(60));

  const sorted = Array.from(latestBySnapshot.entries()).sort(([a],[b]) => b.localeCompare(a));
  for (const [snap, log] of sorted) {
    const { count } = await s
      .from("stock_history")
      .select("*", { count: "exact", head: true })
      .eq("snapshot_date", snap);
    const total = log.total ?? 0;
    const actual = count ?? 0;
    const status = total === actual && total > 0 ? "✅"
                 : total === 0 ? "⚠️ 파싱 0"
                 : actual < total ? `❌ ${total - actual}건 손실`
                 : actual > total ? `⚠️ +${actual - total}건 초과`
                 : "❓";
    console.log(`${snap}    ${String(total).padStart(6)}    ${String(actual).padStart(6)}     ${status}`);
  }

  // (2) 전체 카운트
  const { count: totalRows } = await s.from("stock_history").select("*", { count: "exact", head: true });
  console.log(`\n총 stock_history 행: ${totalRows}`);
})();
