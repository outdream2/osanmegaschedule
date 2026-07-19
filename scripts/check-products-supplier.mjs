import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

console.log("\n=== products 테이블 · 경방 관련 조회 ===\n");

// 1) supplier ilike
const { data: bySup, error: err1 } = await sb
  .from("products")
  .select("product_code, product_name, supplier, supplier_code")
  .ilike("supplier", "%경방%")
  .limit(20);
console.log(`[1] products.supplier ilike '%경방%': ${bySup?.length ?? 0}건`);
if (err1) console.error("[X]", err1.message);
(bySup ?? []).slice(0, 10).forEach((r, i) => console.log(`  ${i + 1}. code=${r.product_code} name=${r.product_name} supplier="${r.supplier}"`));

// 2) supplier_name ilike (혹시)
const { data: bySN } = await sb
  .from("products")
  .select("product_code, product_name, supplier_name")
  .ilike("supplier_name", "%경방%")
  .limit(20);
console.log(`\n[2] products.supplier_name ilike '%경방%': ${bySN?.length ?? 0}건`);

// 3) products 컬럼명 확인
const { data: colCheck } = await sb.from("products").select("*").limit(1);
if (colCheck && colCheck[0]) {
  console.log(`\n[3] products 컬럼 목록:`);
  Object.keys(colCheck[0]).forEach(c => console.log(`  · ${c}`));
}

// 4) purchase_details 에 진경안신엑스과립 90포 있나 확인 (품명 기반)
console.log("\n=== purchase_details · 진경안 관련 ===");
const { data: byProduct } = await sb
  .from("purchase_details")
  .select("id, purchase_date, supplier_name, product_name, quantity, amount")
  .ilike("product_name", "%진경안%")
  .order("purchase_date", { ascending: false })
  .limit(10);
console.log(`[4] purchase_details 진경안: ${byProduct?.length ?? 0}건`);
(byProduct ?? []).forEach((r, i) => console.log(`  ${i + 1}. [${r.purchase_date}] "${r.supplier_name}" · ${r.product_name}`));

// 5) purchase_details 에 존재하는 supplier_name 종류 (top 20)
console.log("\n=== purchase_details · supplier_name 종류 (non-null) top 20 ===");
const { data: allNonNull } = await sb
  .from("purchase_details")
  .select("supplier_name")
  .not("supplier_name", "is", null)
  .limit(10000);
console.log(`  non-null supplier_name 총 ${allNonNull?.length ?? 0}건`);
const cnt = new Map();
for (const r of allNonNull ?? []) {
  const s = String(r.supplier_name ?? "").trim();
  if (!s) continue;
  cnt.set(s, (cnt.get(s) ?? 0) + 1);
}
[...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).forEach(([s, c], i) => {
  console.log(`  ${i + 1}. ${c}건 · "${s}"`);
});
