// scripts/reset-purchase-since-2026-09_dryrun.mjs
// 2026-10-12 · 사용자 지시 "9월이후 데이터들 다 초기화하고 다시 sync해"
//   · purchase_details · purchase_date >= 2026-09-01 전체 DELETE 전 사전 영향 조사
//   · sync-agent 재sync 로 ERP 에서 fresh 하게 다시 가져올 예정
//
// 영향 조사 범위:
//   1) 전체 row 수
//   2) 사용자 검수 필드 (verified_*, expiry_date) 설정된 row 수 · 복구 불가 손실
//   3) 날짜별 분포
//   4) 공급사별 분포 (top 10)
//
// 실행: node scripts/reset-purchase-since-2026-09_dryrun.mjs

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const CUTOFF = "2026-09-01";

console.log("━".repeat(80));
console.log(`  DRY-RUN · purchase_details DELETE WHERE purchase_date >= '${CUTOFF}'`);
console.log("━".repeat(80));
console.log();

// 전체 pagination
console.log(`[1/4] 전체 조회 ...`);
const PAGE = 1000;
let offset = 0;
const rows = [];
while (true) {
  const { data, error } = await supabase
    .from("purchase_details")
    .select("id, purchase_date, supplier_name, quantity, amount, verified_by, verify_status, verify_note, verified_at, expiry_date, imported_at, period_start_date, period_type")
    .gte("purchase_date", CUTOFF)
    .order("id", { ascending: true })
    .range(offset, offset + PAGE - 1);
  if (error) { console.error("❌ 조회 실패:", error.message); process.exit(1); }
  if (!data || data.length === 0) break;
  rows.push(...data);
  if (data.length < PAGE) break;
  offset += PAGE;
}
console.log(`   ✓ 전체 ${rows.length.toLocaleString()}건\n`);

// 사용자 검수 필드 체크
console.log(`[2/4] 사용자 검수 필드 분석 (삭제 시 복구 불가 손실)`);
const WEB_FIELDS = ["verified_by", "verify_status", "verify_note", "verified_at", "expiry_date", "imported_at", "period_start_date", "period_type"];
const fieldCounts = Object.fromEntries(WEB_FIELDS.map(f => [f, 0]));
const rowsWithAnyWebField = [];
for (const r of rows) {
  let hasAny = false;
  for (const f of WEB_FIELDS) {
    const v = r[f];
    if (v != null && v !== "" && v !== false) {
      fieldCounts[f] += 1;
      hasAny = true;
    }
  }
  if (hasAny) rowsWithAnyWebField.push(r);
}
console.log(`   필드별 설정 건수:`);
for (const [f, c] of Object.entries(fieldCounts)) {
  const mark = c > 0 ? "⚠" : "·";
  console.log(`     ${mark} ${f.padEnd(20)} ${c.toLocaleString()}건`);
}
console.log(`   총 사용자 검수 입력된 row (any field): ${rowsWithAnyWebField.length.toLocaleString()}건\n`);

// 날짜별 분포
console.log(`[3/4] 날짜별 분포`);
const byDate = new Map();
for (const r of rows) {
  byDate.set(r.purchase_date, (byDate.get(r.purchase_date) ?? 0) + 1);
}
const dates = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]));
console.log(`   날짜 수: ${dates.length}개`);
console.log(`   최초: ${dates[0]?.[0]} · ${dates[0]?.[1]}건`);
console.log(`   최근: ${dates[dates.length - 1]?.[0]} · ${dates[dates.length - 1]?.[1]}건`);
console.log(`   날짜당 평균 건수: ${(rows.length / dates.length).toFixed(1)}건\n`);

// 공급사별 분포 top 10
console.log(`[4/4] 공급사별 분포 (top 10)`);
const bySupp = new Map();
for (const r of rows) {
  const k = r.supplier_name ?? "(없음)";
  bySupp.set(k, (bySupp.get(k) ?? 0) + 1);
}
const supps = [...bySupp.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
for (const [s, c] of supps) {
  console.log(`     · ${String(s).padEnd(30)} ${c.toLocaleString()}건`);
}
console.log();

// 샘플 사용자 검수 row (최대 5)
if (rowsWithAnyWebField.length > 0) {
  console.log(`⚠ 사용자 검수 데이터 샘플 (max 5):`);
  for (const r of rowsWithAnyWebField.slice(0, 5)) {
    const fields = WEB_FIELDS.filter(f => r[f] != null && r[f] !== "" && r[f] !== false).map(f => `${f}=${JSON.stringify(r[f])}`).join(" · ");
    console.log(`     id=${r.id} · ${r.purchase_date} · ${fields}`);
  }
  console.log();
}

console.log("━".repeat(80));
console.log("요약:");
console.log(`  · 삭제 대상 row: ${rows.length.toLocaleString()}건`);
console.log(`  · 날짜 범위: ${dates[0]?.[0]} ~ ${dates[dates.length - 1]?.[0]}`);
console.log(`  · 사용자 검수 데이터 손실: ${rowsWithAnyWebField.length.toLocaleString()}건 (verified/expiry/period 설정됨)`);
console.log();
console.log("권장 절차:");
console.log("  1. ⚠ sync-agent 재빌드 필수 (business_key diff 반영) · 미반영 시 과거 로직으로 돌아감");
console.log("  2. DELETE 실행 (별도 --write 스크립트)");
console.log("  3. sync-agent 재sync (사용자 PC)");
console.log("  4. 재sync 결과 로그 확인 (new=수천 · same=0 · ERP 가 보낸 그대로)");
console.log("━".repeat(80));
