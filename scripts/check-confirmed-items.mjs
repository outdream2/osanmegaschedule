// 거래확정표(ocr_confirmed_items) DB 저장 상태 진단
// 사용: node scripts/check-confirmed-items.mjs
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
if (!url || !key) { console.error("SUPABASE_URL / KEY 없음"); process.exit(1); }
const sb = createClient(url, key);

const TABLE = "ocr_confirmed_items";

console.log(`\n=== ${TABLE} 진단 ===\n`);

// 1) 테이블 존재 여부
const { error: existErr } = await sb.from(TABLE).select("id").limit(1);
if (existErr) {
  console.error(`[X] 테이블 조회 실패: ${existErr.message}`);
  if (/relation|does not exist/i.test(existErr.message)) {
    console.error(`\n>>> ${TABLE} 테이블 자체가 존재하지 않습니다 (마이그레이션 필요).`);
  }
  process.exit(1);
}
console.log(`[O] 테이블 존재`);

// 2) 총 건수
const { count } = await sb.from(TABLE).select("id", { count: "exact", head: true });
console.log(`[O] 총 ${count ?? 0}건 저장됨`);

// 3) 최근 7일 저장 통계
const now = new Date();
const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
const fromStr = from.toISOString().slice(0, 10);
const { data: recent } = await sb.from(TABLE)
  .select("saved_at, supplier, product_name, quantity, amount, created_at")
  .gte("saved_at", fromStr)
  .order("created_at", { ascending: false })
  .limit(50);

if (!recent || recent.length === 0) {
  console.log(`[!] 최근 7일(${fromStr}~) 저장 이력 없음`);
} else {
  console.log(`\n=== 최근 7일 저장 이력 (상위 ${recent.length}건) ===`);
  // saved_at 별 집계
  const byDate = new Map();
  for (const r of recent) {
    const d = r.saved_at;
    byDate.set(d, (byDate.get(d) ?? 0) + 1);
  }
  console.log("\n일자별 건수:");
  for (const [d, c] of [...byDate.entries()].sort()) {
    console.log(`  ${d}: ${c}건`);
  }
  console.log("\n최근 10건 미리보기:");
  recent.slice(0, 10).forEach((r, i) => {
    console.log(`  ${i + 1}. [${r.saved_at}] ${r.supplier} · ${r.product_name} · 수량 ${r.quantity ?? "-"} · 금액 ${r.amount ?? "-"}`);
  });
}

// 4) 오늘 저장 여부
const todayStr = now.toISOString().slice(0, 10);
const { count: todayCount } = await sb.from(TABLE)
  .select("id", { count: "exact", head: true })
  .eq("saved_at", todayStr);
console.log(`\n오늘(${todayStr}) 저장: ${todayCount ?? 0}건`);

// 5) 최근 60분 이내 insert (실시간 확인용)
const { data: last60 } = await sb.from(TABLE)
  .select("id, saved_at, supplier, product_name, created_at")
  .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
  .order("created_at", { ascending: false });
console.log(`최근 60분 이내 insert: ${last60?.length ?? 0}건`);
if (last60 && last60.length > 0) {
  last60.slice(0, 5).forEach(r => console.log(`  · ${r.created_at} [${r.saved_at}] ${r.supplier} / ${r.product_name}`));
}
