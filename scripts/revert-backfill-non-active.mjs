// 2026-09-08 · 백필 원복 · 판매중이 아닌 상품의 system:backfill row 삭제
//   · 판매중지/숨김 상품 · 실재고 없어야 정상
//   · 판매중 상품의 backfill row · 유지 (사용자 요구 · 판매중은 구역·상세구역 모두 필요)
//   · 실행 · node scripts/revert-backfill-non-active.mjs [--execute]

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

function loadEnv() {
  const raw = readFileSync(".env", "utf8"); const env = {};
  for (const l of raw.split(/\r?\n/)) { const m = /^([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(l); if (m) env[m[1]] = m[2]; }
  return env;
}
const env = loadEnv();
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
const execute = process.argv.includes("--execute");

const PAGE = 1000;

// 1) 전체 상품 · sale_status 조회
const products = [];
let offset = 0;
while (true) {
  const { data, error } = await sb
    .from("products")
    .select("product_code, sale_status")
    .range(offset, offset + PAGE - 1);
  if (error) { console.error("products 조회 실패:", error.message); process.exit(1); }
  if (!data || data.length === 0) break;
  products.push(...data);
  if (data.length < PAGE) break;
  offset += PAGE;
}
console.log(`[revert] 전체 상품 · ${products.length}건`);

// 2) 판매중이 아닌 상품 코드 목록
const nonActiveCodes = new Set(
  products
    .filter(p => String(p.sale_status ?? "").trim() !== "판매중")
    .map(p => String(p.product_code ?? "").trim())
    .filter(Boolean)
);
console.log(`[revert] 판매중 아닌 상품 · ${nonActiveCodes.size}건 (판매중지·숨김·null)`);
console.log(`[revert] 판매중 상품 · ${products.length - nonActiveCodes.size}건`);

// 3) system:backfill row 중 · 판매중 아닌 상품의 것만 조회
const rowsToDelete = [];
offset = 0;
while (true) {
  const { data, error } = await sb
    .from("inventory_checks")
    .select("id, product_code")
    .eq("checked_by", "system:backfill")
    .range(offset, offset + PAGE - 1);
  if (error) { console.error("inventory_checks 조회 실패:", error.message); process.exit(1); }
  if (!data || data.length === 0) break;
  for (const r of data) {
    const code = String(r.product_code ?? "").trim();
    if (nonActiveCodes.has(code)) rowsToDelete.push(r.id);
  }
  if (data.length < PAGE) break;
  offset += PAGE;
}
console.log(`[revert] 삭제 대상 · ${rowsToDelete.length}건 (판매중 아닌 상품의 system:backfill row)`);

if (!execute) {
  console.log(`\n※ dry-run · 실제 삭제 안 됨 · --execute 붙여서 재실행`);
  process.exit(0);
}

// 4) 실제 삭제 · 500개씩 청크
let deleted = 0, failed = 0;
const CHUNK = 500;
for (let i = 0; i < rowsToDelete.length; i += CHUNK) {
  const ids = rowsToDelete.slice(i, i + CHUNK);
  const { error } = await sb.from("inventory_checks").delete().in("id", ids);
  if (error) { failed += ids.length; console.warn(`  ! chunk ${i}~${i+ids.length} 실패:`, error.message); }
  else deleted += ids.length;
  if ((i + CHUNK) % 2000 === 0) console.log(`  · 진행 ${Math.min(i+CHUNK, rowsToDelete.length)} / ${rowsToDelete.length}`);
}
console.log(`\n[revert] 완료 · 삭제 ${deleted}건 · 실패 ${failed}건`);
