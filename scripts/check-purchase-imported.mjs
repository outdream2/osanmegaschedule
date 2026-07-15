import { createClient } from "@supabase/supabase-js";
import "dotenv/config";
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

console.log("═══════════════════════════════════════════════════════════");
console.log("purchase_details 임포트 결과 확인");
console.log("═══════════════════════════════════════════════════════════\n");

// 1) 전체 카운트
const { count, error: cErr } = await sb.from("purchase_details").select("*", { count: "exact", head: true });
if (cErr) {
  console.error("❌ 조회 실패:", cErr.message);
  if (cErr.message.includes("does not exist")) {
    console.log("\n※ purchase_details 테이블이 없어요. server/routes/purchase.ts 상단 주석의 SQL 을 Supabase 에서 실행하세요.");
  }
  process.exit(1);
}
console.log(`총 행 수: ${count}\n`);

// 2) 기간별 집계
const { data: periods } = await sb
  .from("purchase_details")
  .select("purchase_date, period_type, period_start_date")
  .order("purchase_date", { ascending: false })
  .limit(5000);

const bucket = new Map();
for (const r of periods ?? []) {
  const ym = String(r.purchase_date).slice(0, 7);
  const pt = r.period_type ?? "?";
  const key = `${ym}::${pt}`;
  bucket.set(key, (bucket.get(key) ?? 0) + 1);
}
console.log(`기간별 분포 (${bucket.size}개 기간):`);
[...bucket.entries()].sort().forEach(([k, n]) => console.log(`  ${k}: ${n}행`));

// 3) 샘플 5행
console.log("\n샘플 5행:");
const { data: sample } = await sb
  .from("purchase_details")
  .select("purchase_date, period_type, supplier_name, product_code, product_name, quantity, amount")
  .order("purchase_date", { ascending: false })
  .limit(5);
sample?.forEach(r => console.log(`  ${r.purchase_date} · ${r.period_type ?? "-"} · ${r.supplier_name ?? "(공급사없음)"} · ${r.product_code} · ${r.product_name} · qty=${r.quantity} · ${r.amount?.toLocaleString?.() ?? r.amount}원`));

// 4) 공급사 매핑 상태
const { data: allRows } = await sb.from("purchase_details").select("supplier_name").limit(10000);
const withSup = (allRows ?? []).filter(r => r.supplier_name).length;
const withoutSup = (allRows ?? []).filter(r => !r.supplier_name).length;
console.log(`\n공급사 매핑: ${withSup}행 · 미매핑: ${withoutSup}행 (products DB 조인 실패)`);

// 5) 가장 많이 매입된 공급사 top 5
const supMap = new Map();
for (const r of allRows ?? []) {
  if (!r.supplier_name) continue;
  supMap.set(r.supplier_name, (supMap.get(r.supplier_name) ?? 0) + 1);
}
console.log(`\n매입 상위 공급사 top 5:`);
[...supMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).forEach(([n, c]) => console.log(`  ${n}: ${c}행`));

// 6) 커버리지 endpoint 결과 확인
console.log("\n─── 커버리지 상태 ───");
const missCount = periods?.filter(r => !r.period_type).length ?? 0;
if (missCount > 0) console.log(`  ⚠ period_type NULL 인 행: ${missCount}개 (DB 컬럼 추가 필요할 수 있음)`);
