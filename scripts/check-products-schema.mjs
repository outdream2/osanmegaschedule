// scripts/check-products-schema.mjs
// products 전체 컬럼 · 헤더 문자열이 데이터로 저장된 정도 확인
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;
if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_KEY 없음");
const sb = createClient(url, key);

// 모든 컬럼 select · 첫 3 rows
const { data, error } = await sb.from("products").select("*").limit(3);
if (error) { console.error(error); process.exit(1); }
console.log(`전체 컬럼 개수: ${Object.keys(data[0] ?? {}).length}`);
console.log("\n── 각 행의 전체 컬럼 (헤더 텍스트로 보이는 값 표시) ──\n");
for (const row of data) {
  console.log(`[${row.product_code}] ${row.product_name}`);
  for (const [k, v] of Object.entries(row)) {
    const vStr = JSON.stringify(v);
    const hint = (typeof v === "string" && /^[가-힣]+$/.test(v)) ? " ⚠️ 헤더 텍스트로 의심" : "";
    console.log(`  ${k.padEnd(28)} = ${vStr}${hint}`);
  }
  console.log();
}

// 컬럼별로 distinct 값 개수 확인 — 값이 하나뿐이면 헤더가 반복 저장된 것
const { data: all, error: aErr } = await sb.from("products").select("*").limit(500);
if (aErr) { console.error(aErr); process.exit(1); }
console.log(`\n── 컬럼별 distinct 값 개수 (500건 샘플 · 값이 1-3 개면 헤더 저장 의심) ──\n`);
const cols = Object.keys(all[0] ?? {});
for (const c of cols) {
  const values = new Set();
  for (const r of all) values.add(JSON.stringify(r[c]));
  const distinct = values.size;
  const sample = [...values].slice(0, 5).join(", ");
  const flag = distinct <= 3 ? " ⚠️" : "";
  console.log(`  ${c.padEnd(28)} distinct=${String(distinct).padStart(3)} sample=[${sample}]${flag}`);
}
