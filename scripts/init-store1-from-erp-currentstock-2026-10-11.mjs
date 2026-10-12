// scripts/init-store1-from-erp-currentstock-2026-10-11.mjs
// 2026-10-11 · 사용자 지시 (테스트) · 실재고 데이터 비어있어 ERP current_stock → inventory_checks.store1_stock 복사
//
// 범위:
//   · products 전체 상품 (current_stock > 0) · 매장1 slot 에 ERP 값 복사
//   · 다른 slot (store2/store3/warehouse1/warehouse2) 는 NULL · 손대지 않음
//   · 신규 row INSERT · 기존 inventory_checks 과거 기록 보존 (M1 안전)
//
// 사용법:
//   Dry-run (쓰기 없음 · 미리보기):
//     node scripts/init-store1-from-erp-currentstock-2026-10-11.mjs
//
//   실제 쓰기:
//     node scripts/init-store1-from-erp-currentstock-2026-10-11.mjs --write
//
// 되돌리기 (DELETE):
//   `checked_by = 'ERP initial sync 2026-10-11'` 조건으로 이번에 insert 된 row 전부 삭제 가능
//
// 원칙:
//   · 사용자 명시 승인 (A1 매장1 only · F1 전체 · M1 INSERT)
//   · 테스트 목적 · 실재고 데이터가 비어있음 (손실 데이터 없음)
//   · feedback_stock_data_definition_2026-10-05 대원칙 (실재고/현재고 분리) 은 테스트 범위 1회 예외

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();

const WRITE = process.argv.includes("--write");
const CHECKED_BY = "ERP initial sync 2026-10-11";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

console.log("━".repeat(60));
console.log(`  init-store1-from-erp-currentstock-2026-10-11.mjs`);
console.log(`  모드: ${WRITE ? "🚨 WRITE (DB 변경 실행)" : "🔍 DRY-RUN (미리보기)"}`);
console.log("━".repeat(60));
console.log();

// 1) products 전체 (current_stock > 0 · product_code 존재)
console.log("[1/4] products 전체 조회...");
let products = [];
let page = 0;
const PAGE_SIZE = 1000;
while (true) {
  const { data, error } = await supabase
    .from("products")
    .select("product_code, product_name, current_stock")
    .not("current_stock", "is", null)
    .gt("current_stock", 0)
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
  if (error) { console.error("❌ products 조회 실패:", error.message); process.exit(1); }
  if (!data || data.length === 0) break;
  products.push(...data);
  if (data.length < PAGE_SIZE) break;
  page += 1;
}
console.log(`   ✓ 대상 상품: ${products.length.toLocaleString()}건 (current_stock > 0)\n`);

// 샘플 5건 미리보기
console.log("샘플 5건:");
for (const p of products.slice(0, 5)) {
  console.log(`   · ${p.product_code} ${p.product_name} · current_stock=${p.current_stock}`);
}
console.log();

if (!WRITE) {
  console.log("🔍 DRY-RUN 완료 · 실제 쓰기 없음");
  console.log(`   예상: ${products.length.toLocaleString()}건 INSERT → inventory_checks (매장1 slot)`);
  console.log();
  console.log("실제 실행: node scripts/init-store1-from-erp-currentstock-2026-10-11.mjs --write");
  process.exit(0);
}

// 2) 중복 방지 체크 · 이미 CHECKED_BY 로 insert 한 row 있으면 skip
console.log("[2/4] 중복 방지 체크...");
const { data: existing, error: exErr } = await supabase
  .from("inventory_checks")
  .select("product_code", { count: "exact", head: true })
  .eq("checked_by", CHECKED_BY);
if (exErr) { console.error("❌ 중복 체크 실패:", exErr.message); process.exit(1); }
const existingCount = existing?.length ?? 0;
if (existingCount > 0) {
  console.warn(`⚠ 이미 "${CHECKED_BY}" 로 insert 된 row 가 있을 수 있음 · 중복 insert 하지 마세요`);
  console.warn(`   되돌리려면: DELETE FROM inventory_checks WHERE checked_by = '${CHECKED_BY}'`);
  // 그래도 진행 · 사용자가 재실행 지시 가능
}

// 3) chunk UPSERT · onConflict=product_code
//    · product_code unique constraint → UPSERT 로 처리
//    · payload 에 store1_stock + product_name 만 포함 · 다른 slot (store2/3·warehouse1/2) 는 payload 미포함 → 기존 값 그대로 보존
console.log(`[3/4] UPSERT 실행 (chunk=200)...`);
const CHUNK = 200;
const now = new Date().toISOString();
let inserted = 0;
let failed = 0;
for (let i = 0; i < products.length; i += CHUNK) {
  const batch = products.slice(i, i + CHUNK);
  const rows = batch.map((p) => ({
    product_code: p.product_code,
    product_name: p.product_name,
    checked_by: CHECKED_BY,
    checked_at: now,
    store1_stock: Number(p.current_stock),
  }));
  const { error } = await supabase.from("inventory_checks").upsert(rows, { onConflict: "product_code" });
  if (error) {
    console.error(`   ❌ chunk ${i / CHUNK + 1} 실패:`, error.message);
    failed += batch.length;
  } else {
    inserted += batch.length;
    process.stdout.write(`\r   진행: ${inserted}/${products.length}`);
  }
}
console.log();
console.log();

// 4) 결과
console.log("[4/4] 완료");
console.log(`   ✓ INSERT 성공: ${inserted.toLocaleString()}건`);
if (failed > 0) console.log(`   ❌ INSERT 실패: ${failed.toLocaleString()}건`);
console.log();
console.log(`되돌리기: DELETE FROM inventory_checks WHERE checked_by = '${CHECKED_BY}'`);
