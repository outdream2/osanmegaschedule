// 2026-09-08 · 발주필요 검색 안 됨 · 테스트상품등록 상태 확인
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
function loadEnv() {
  const raw = readFileSync(".env", "utf8"); const env = {};
  for (const l of raw.split(/\r?\n/)) { const m = /^([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(l); if (m) env[m[1]] = m[2]; }
  return env;
}
const env = loadEnv();
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
const { data, error } = await sb.from("products")
  .select("product_code, product_name, sale_status, hidden, current_stock, optimal_stock, supplier, category, location, display_location")
  .ilike("product_name", "%테스트상품등록%");
if (error) { console.error(error); process.exit(1); }
console.log(`[check] 테스트상품등록 · ${data.length}건`);
for (const p of data) console.log(p);
