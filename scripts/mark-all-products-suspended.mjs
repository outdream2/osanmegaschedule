// 2026-08-29 · 사용자 지시 · A안 · 신규 임포트 전 · 기존 상품 전체 · sale_status="판매중지" 마킹
//   · 이후 · 새 엑셀 임포트 (기존 UI 사용) · upsert · 엑셀에 있는 code 만 · sale_status="판매중" 로 갱신
//   · 엑셀에 없는 code · 판매중지 유지 → 랜딩 재고확인 · 미노출
//
// 안전성:
//   · sale_status 만 변경 · 다른 컬럼·참조 데이터 (매입·재고·발주 등) · 절대 유지
//   · 실행 전 · products 백업 권장 (Supabase 대시보드 · Export · 하지만 · 롤백 · updated_at 조회 가능)
//   · TRUNCATE X · CASCADE X · 데이터 손실 없음
//
// 실행: node scripts/mark-all-products-suspended.mjs

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

function loadEnv() {
  const raw = readFileSync(".env", "utf8");
  const env = {};
  for (const l of raw.split(/\r?\n/)) {
    const m = /^([A-Z_]+)\s*=\s*"?([^"\r]*)"?\s*$/.exec(l);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

const env = loadEnv();
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

console.log("═".repeat(70));
console.log("전체 상품 · sale_status='판매중지' 마킹 · 2026-08-29");
console.log("═".repeat(70));

// 1. 사전 카운트
const { count: totalBefore } = await sb.from("products").select("*", { count: "exact", head: true });
const { count: activeBefore } = await sb.from("products")
  .select("*", { count: "exact", head: true })
  .eq("sale_status", "판매중");
const { count: suspendedBefore } = await sb.from("products")
  .select("*", { count: "exact", head: true })
  .eq("sale_status", "판매중지");
console.log(`\n[BEFORE]`);
console.log(`  전체 상품: ${totalBefore}건`);
console.log(`  판매중: ${activeBefore}건`);
console.log(`  판매중지: ${suspendedBefore}건`);
console.log(`  기타: ${(totalBefore ?? 0) - (activeBefore ?? 0) - (suspendedBefore ?? 0)}건`);

// 2. 이미 판매중지 아닌 것 · 판매중지로 UPDATE (chunk 방식 · 3000건씩)
console.log(`\n[UPDATE] 판매중 + 기타 → 판매중지 (chunk 3000건씩)`);

let totalUpdated = 0;
let round = 0;
const now = new Date().toISOString();
while (true) {
  round++;
  // Supabase · 한 번에 최대 몇천 건 · 순차 진행
  const { data: batch } = await sb.from("products")
    .select("product_code")
    .neq("sale_status", "판매중지")
    .limit(3000);
  if (!batch || batch.length === 0) break;
  const codes = batch.map(p => p.product_code);
  const { error, count } = await sb.from("products")
    .update({ sale_status: "판매중지", updated_at: now }, { count: "exact" })
    .in("product_code", codes);
  if (error) {
    console.error(`  [chunk ${round}] 에러:`, error.message);
    break;
  }
  totalUpdated += (count ?? 0);
  console.log(`  [chunk ${round}] ${count}건 처리 · 누적 ${totalUpdated}건`);
  if (batch.length < 3000) break;
}

// 3. 사후 카운트
const { count: activeAfter } = await sb.from("products")
  .select("*", { count: "exact", head: true })
  .eq("sale_status", "판매중");
const { count: suspendedAfter } = await sb.from("products")
  .select("*", { count: "exact", head: true })
  .eq("sale_status", "판매중지");
console.log(`\n[AFTER]`);
console.log(`  판매중: ${activeAfter}건`);
console.log(`  판매중지: ${suspendedAfter}건`);
console.log(`\n${"═".repeat(70)}`);
console.log(`총 ${totalUpdated}건 · 판매중지 마킹 완료`);
console.log(`${"═".repeat(70)}`);
console.log(`\n다음 단계:`);
console.log(`  1. 관리자 로그인 후 · 데이터 업로드 페이지 · 새 상품 xlsx 업로드`);
console.log(`  2. 서버 · upsert (onConflict=product_code) · 엑셀에 있는 code 만 · sale_status 등 · 엑셀 값으로 갱신`);
console.log(`  3. 이번 엑셀에 없는 code (중복 페리비타 등) · 판매중지 유지 → 랜딩 재고확인 · 미노출`);
console.log(`  4. 확인 · node scripts/investigate-perivita.mjs · 페리비타 · 판매중=1건 예상`);
