// 2026-09-08 · products 테이블 컬럼 · 사용 여부 감사
//   · Supabase products 실제 컬럼 목록 조회
//   · xlsx.ts HEADER_MATCHERS 매핑과 비교
//   · 매핑 없음 = 임포트 안 됨 · 다른 곳에서만 씀 (or dead)
//   · 각 컬럼 · null 비율 표시

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

function loadEnv() {
  const raw = readFileSync(".env", "utf8"); const env = {};
  for (const l of raw.split(/\r?\n/)) { const m = /^([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(l); if (m) env[m[1]] = m[2]; }
  return env;
}
const env = loadEnv();
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

// xlsx.ts 매핑 필드 (HEADER_MATCHERS 에서 key 만 · 매뉴얼 sync)
const XLSX_MAPPED = new Set([
  "product_code","product_name","col_i","product_type","origin","spec",
  "purchase_price","sale_price","profit_rate","delivery_price","delivery_profit_rate",
  "sale_status","app_registered","image_registered","preset_registered","preset_group",
  "promotion_name","promotion_priority","promotion_purchase_price","promotion_sale_price",
  "promotion_profit_rate","promotion_discount_rate","wholesale_price1","supplier_code",
  "supplier","supplier_type","expiry_date","display_location","management_group","unit_type",
  "current_stock","stock_amount","optimal_stock","last_purchase_date","last_sale_date",
  "category_code","category","operator","last_modified_at","registered_at",
  "min_order","point_rate","sales_commission","delivery_margin_rate","search_keywords",
  "unit","total_volume","unit_volume","unit_price","connection_type","individual_code","individual_quantity",
]);

// 1) products 컬럼 목록 · sample 1건 SELECT * → keys
const { data: sample, error: e1 } = await sb.from("products").select("*").limit(1);
if (e1) { console.error(e1); process.exit(1); }
if (!sample?.[0]) { console.error("products 비어있음"); process.exit(1); }
const columns = Object.keys(sample[0]).sort();
console.log(`\n[audit] products 컬럼 총 ${columns.length}개\n`);

// 2) xlsx 매핑 여부 + null 비율 조사
const results = [];
const { count: total } = await sb.from("products").select("*", { count: "exact", head: true });
for (const col of columns) {
  const { count: filled } = await sb.from("products").select("*", { count: "exact", head: true }).not(col, "is", null);
  const pct = (filled / total * 100).toFixed(1);
  results.push({
    col,
    filled,
    pct,
    xlsx: XLSX_MAPPED.has(col) ? "✓" : "✗",
  });
}

// 3) 출력 · 매핑 없음 우선 · 채움 비율 낮은 순
console.log("컬럼명".padEnd(35), "| xlsx | 채움 | 비율");
console.log("-".repeat(70));
const unmapped = results.filter(r => r.xlsx === "✗").sort((a,b) => Number(a.filled) - Number(b.filled));
const mapped   = results.filter(r => r.xlsx === "✓").sort((a,b) => Number(a.filled) - Number(b.filled));

console.log("\n▶ xlsx 매핑 없음 (impor 로 값 안 채워짐)");
for (const r of unmapped) {
  console.log(`  ${r.col.padEnd(35)} | ${r.xlsx.padEnd(4)} | ${String(r.filled).padStart(5)} | ${r.pct}%`);
}
console.log("\n▶ xlsx 매핑 있음 (import 로 값 채워짐 · 채움 비율 낮은 순)");
for (const r of mapped) {
  console.log(`  ${r.col.padEnd(35)} | ${r.xlsx.padEnd(4)} | ${String(r.filled).padStart(5)} | ${r.pct}%`);
}
console.log(`\n[audit] 총 ${columns.length}개 컬럼 · unmapped=${unmapped.length} · mapped=${mapped.length}`);
