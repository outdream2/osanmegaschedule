// scripts/check-product-code-unique.mjs
// 2026-09-10 · products.product_code UNIQUE·PRIMARY KEY 확인
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// 중복 검사
const { data: rows } = await supabase.from("products").select("product_code").limit(50000);
const codes = (rows ?? []).map(r => r.product_code);
const uniq = new Set(codes);
console.log(`products · total ${codes.length} · unique ${uniq.size}`);
if (codes.length !== uniq.size) {
  const cnt = new Map();
  for (const c of codes) cnt.set(c, (cnt.get(c) ?? 0) + 1);
  const dupes = Array.from(cnt.entries()).filter(([, n]) => n > 1).slice(0, 20);
  console.log("중복 sample:", dupes);
} else {
  console.log("✔ product_code · 모두 UNIQUE (FK 참조 가능)");
}
