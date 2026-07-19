// scripts/check-purchase-details.mjs
// purchase_details 테이블 존재 및 데이터 확인
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;
if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_KEY 없음");
const sb = createClient(url, key);

// 테이블 존재 · 총 행수 확인
const { data, error, count } = await sb.from("purchase_details").select("*", { count: "exact", head: true });
if (error) {
  console.error("❌ purchase_details 테이블 문제:", error.message);
  process.exit(1);
}
console.log(`✅ purchase_details 총 행수: ${count}`);

// product_code 별 매입 횟수 상위 20
const { data: rows } = await sb.from("purchase_details").select("product_code, purchase_date").limit(5000);
const countMap = new Map();
for (const r of rows ?? []) {
  const c = String(r.product_code ?? "");
  countMap.set(c, (countMap.get(c) ?? 0) + 1);
}
console.log(`\n── 상품별 매입 횟수 (상위 10 · 매입주기 계산 가능 = 2회 이상) ──`);
const sorted = [...countMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
for (const [c, n] of sorted) console.log(`  ${c.padEnd(20)} : ${n}회`);
const gte2 = [...countMap.values()].filter(n => n >= 2).length;
const gte1 = countMap.size;
console.log(`\n총 상품 종류: ${gte1}개 · 2회 이상 매입 (매입주기 계산 가능): ${gte2}개`);

// min_order != 0 인 상품 개수
const { data: prods, count: totalProds } = await sb.from("products").select("product_code, min_order", { count: "exact" }).not("min_order", "is", null).neq("min_order", 0).limit(20);
console.log(`\n── products.min_order > 0 인 상품 개수 확인 ──`);
console.log(`  전체 products: ${totalProds}행 (첫 조회)`);
console.log(`  min_order > 0: ${prods?.length ?? 0}건 (상위 20 샘플)`);
if (prods && prods.length > 0) {
  console.log(`  샘플:`);
  for (const p of prods.slice(0, 10)) console.log(`    ${p.product_code} : min_order=${p.min_order}`);
}
