// scripts/check-supplier-stock-map.mjs
// 2026-09-10 · /api/supplier-stock-values-map · 직접 계산 확인
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const map = {};
const countMap = {};
const PAGE = 1000;
let from = 0;
while (true) {
  const { data, error } = await supabase
    .from("products")
    .select("supplier, current_stock, purchase_price, hidden")
    .range(from, from + PAGE - 1);
  if (error) { console.error(error.message); break; }
  if (!data || data.length === 0) break;
  for (const p of data) {
    if (p.hidden === true) continue;
    const supplier = String(p.supplier ?? "").trim();
    if (!supplier) continue;
    const qty = Number(p.current_stock ?? 0) || 0;
    const price = Number(p.purchase_price ?? 0) || 0;
    map[supplier] = (map[supplier] ?? 0) + qty * price;
    countMap[supplier] = (countMap[supplier] ?? 0) + 1;
  }
  if (data.length < PAGE) break;
  from += PAGE;
}

console.log(`\n=== supplier 별 재고자산 (상위 15) ===`);
const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
console.table(sorted.slice(0, 15).map(([k, v]) => ({ supplier: k, stock_value: v.toLocaleString(), product_count: countMap[k] })));

console.log(`\n총 공급사 수 · ${sorted.length}`);
console.log(`재고자산 0 · ${sorted.filter(([, v]) => v === 0).length}개`);
console.log(`재고자산 > 0 · ${sorted.filter(([, v]) => v > 0).length}개`);

// vendors 매칭 확인
const { data: vendors } = await supabase.from("vendors").select("company_name");
const vendorNames = new Set((vendors ?? []).map(v => String(v.company_name).trim()));
const matched = sorted.filter(([k]) => vendorNames.has(k));
const unmatched = sorted.filter(([k]) => !vendorNames.has(k));
console.log(`\nvendors 매칭 · ${matched.length}개 / 총 ${sorted.length}`);
console.log(`매칭 실패 (상위 10):`);
console.table(unmatched.slice(0, 10).map(([k, v]) => ({ supplier: k, stock_value: v.toLocaleString() })));
