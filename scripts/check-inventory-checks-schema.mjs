// scripts/check-inventory-checks-schema.mjs
// 2026-09-14 · #139 · inventory_checks 테이블 · store1_zone·store2_zone·store3_zone 컬럼 존재 확인
//   · Agent 리포트 · 클라·서버 코드 정상 · DB 스키마 미확인 · 컬럼 있는지 확인 필요
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

console.log("━━━ inventory_checks 테이블 · zone·shelf_positions 컬럼 확인 ━━━\n");

// 최근 5건 SELECT · 모든 zone·shelf 필드 확인
const { data, error } = await supabase
  .from("inventory_checks")
  .select("*")
  .order("checked_at", { ascending: false })
  .limit(3);

if (error) {
  console.error("❌ 쿼리 실패:", error.message);
  console.error("   · 오류 메시지에 'column ... does not exist' 있으면 · 컬럼 없음");
  process.exit(1);
}

console.log(`✅ 쿼리 성공 · ${data?.length ?? 0}건\n`);
if (!data || data.length === 0) {
  console.log("⚠️ inventory_checks 테이블에 데이터 없음");
  process.exit(0);
}

// 첫 row · 모든 컬럼 리스트
const first = data[0];
console.log("━━━ inventory_checks 실제 컬럼 목록");
const allCols = Object.keys(first).sort();
for (const c of allCols) {
  const v = first[c];
  const disp = v === null ? "null" : typeof v === "object" ? JSON.stringify(v) : String(v).slice(0, 50);
  console.log(`  ${c}: ${disp}`);
}

console.log("\n━━━ 매장 zone·상세구역 컬럼 존재 여부");
const critical = ["store1_zone", "store2_zone", "store3_zone", "shelf_positions", "store1_stock", "store2_stock", "store3_stock", "warehouse1_stock", "warehouse2_stock"];
for (const col of critical) {
  const exists = col in first;
  console.log(`  ${col}: ${exists ? "✅ 존재" : "❌ 없음"}${exists ? ` (값: ${first[col] === null ? "null" : typeof first[col] === "object" ? JSON.stringify(first[col]) : first[col]})` : ""}`);
}
