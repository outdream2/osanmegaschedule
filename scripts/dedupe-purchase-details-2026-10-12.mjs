// scripts/dedupe-purchase-details-2026-10-12.mjs
// 2026-10-12 · 사용자 지시 "같은 데이터는 덮어써야지" · ERP 자동 sync 중복 INSERT 로 쌓인 duplicate row 정리
//
// 중복 key = (purchase_date, product_code, quantity, unit_price, amount)
//   · 같은 key 로 여러 row 가 있으면 · min(id) 1개만 남기고 나머지 DELETE
//
// 실행:
//   DRY-RUN (삭제 없음 · 미리보기):
//     node scripts/dedupe-purchase-details-2026-10-12.mjs
//
//   실제 삭제:
//     node scripts/dedupe-purchase-details-2026-10-12.mjs --write
//
// 되돌리기:
//   없음 (DELETE 영구) · 반드시 DRY-RUN 결과 확인 후 --write 실행

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();

const WRITE = process.argv.includes("--write");
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

console.log("━".repeat(70));
console.log(`  purchase_details 중복 정리 · 2026-10-12`);
console.log(`  모드: ${WRITE ? "🚨 WRITE (DELETE 실행)" : "🔍 DRY-RUN"}`);
console.log("━".repeat(70));
console.log();

// 1) 전체 row 조회 (chunked)
console.log("[1/3] purchase_details 전체 조회 (chunked)...");
const PAGE = 1000;
let offset = 0;
const all = [];
while (true) {
  const { data, error } = await supabase
    .from("purchase_details")
    .select("id, purchase_date, product_code, quantity, unit_price, amount")
    .order("id", { ascending: true })
    .range(offset, offset + PAGE - 1);
  if (error) { console.error("❌ 조회 실패:", error.message); process.exit(1); }
  if (!data || data.length === 0) break;
  all.push(...data);
  if (data.length < PAGE) break;
  offset += PAGE;
}
console.log(`   ✓ 전체 ${all.length.toLocaleString()}건 조회\n`);

// 2) 중복 그룹핑 (business key)
console.log("[2/3] 중복 그룹핑...");
const groups = new Map();
for (const r of all) {
  const key = `${r.purchase_date}|${r.product_code}|${r.quantity}|${r.unit_price}|${r.amount}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(r.id);
}

let dupGroupCount = 0;
const idsToDelete = [];
for (const [key, ids] of groups) {
  if (ids.length <= 1) continue;
  dupGroupCount += 1;
  ids.sort((a, b) => a - b);
  const keep = ids[0];
  const del = ids.slice(1);
  idsToDelete.push(...del);
}
console.log(`   ✓ 중복 그룹: ${dupGroupCount.toLocaleString()}개`);
console.log(`   ✓ 삭제 대상 row: ${idsToDelete.length.toLocaleString()}건 (각 그룹 min(id) 유지)`);
console.log(`   ✓ 삭제 후 예상 row: ${(all.length - idsToDelete.length).toLocaleString()}건\n`);

if (idsToDelete.length === 0) {
  console.log("✅ 중복 없음 · 정리 불필요");
  process.exit(0);
}

if (!WRITE) {
  console.log("🔍 DRY-RUN 완료 · 실제 삭제 없음");
  console.log();
  console.log("샘플 중복 그룹 (최대 5):");
  let shown = 0;
  for (const [key, ids] of groups) {
    if (ids.length <= 1) continue;
    const [pd, pc, qty, up, amt] = key.split("|");
    console.log(`  · ${pd} · code=${pc} · qty=${qty} · unit=${up} · amt=${amt} → ${ids.length}건 (keep: ${Math.min(...ids)} · del: ${ids.length - 1}건)`);
    shown += 1;
    if (shown >= 5) break;
  }
  console.log();
  console.log("실제 삭제: node scripts/dedupe-purchase-details-2026-10-12.mjs --write");
  process.exit(0);
}

// 3) DELETE chunked
console.log("[3/3] DELETE 실행 (chunk=500)...");
const CHUNK = 500;
let deleted = 0;
let failed = 0;
for (let i = 0; i < idsToDelete.length; i += CHUNK) {
  const batch = idsToDelete.slice(i, i + CHUNK);
  const { error } = await supabase.from("purchase_details").delete().in("id", batch);
  if (error) {
    console.error(`   ❌ chunk ${i / CHUNK + 1} 실패:`, error.message);
    failed += batch.length;
  } else {
    deleted += batch.length;
    process.stdout.write(`\r   진행: ${deleted}/${idsToDelete.length}`);
  }
}
console.log();
console.log();
console.log(`✓ DELETE 성공: ${deleted.toLocaleString()}건`);
if (failed > 0) console.log(`❌ DELETE 실패: ${failed.toLocaleString()}건`);
