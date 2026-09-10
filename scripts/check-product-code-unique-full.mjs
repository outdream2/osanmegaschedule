// scripts/check-product-code-unique-full.mjs
// 2026-09-10 · products.product_code · 전체 상품 · UNIQUE 검증 (chunk fetch)
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const all = [];
const PAGE = 1000;
let from = 0;
while (true) {
  const { data, error } = await supabase.from("products").select("product_code").range(from, from + PAGE - 1);
  if (error) { console.error(error.message); break; }
  if (!data || data.length === 0) break;
  all.push(...data);
  if (data.length < PAGE) break;
  from += PAGE;
}
const codes = all.map(r => r.product_code);
const uniq = new Set(codes);
console.log(`products · total ${codes.length} · unique ${uniq.size}`);
if (codes.length !== uniq.size) {
  const cnt = new Map();
  for (const c of codes) cnt.set(c, (cnt.get(c) ?? 0) + 1);
  const dupes = Array.from(cnt.entries()).filter(([, n]) => n > 1);
  console.log(`중복 · ${dupes.length} 종류`);
  console.log(`sample:`, dupes.slice(0, 10));
} else {
  console.log("✔ product_code · 전체 UNIQUE (FK 참조 가능)");
}
