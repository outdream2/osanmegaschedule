// scripts/check-donga-data.mjs
// 2026-09-10 · 동아제약(주) · 판매액 원가 매입액 검증
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// vendors 매칭
const { data: vendors } = await supabase.from("vendors").select("company_name").ilike("company_name", "%동아제약%");
console.log("=== vendors 매칭 ===");
console.log(vendors);

// products supplier
const { data: prods } = await supabase.from("products").select("product_code, product_name, supplier, purchase_price, sale_price, current_stock").ilike("supplier", "%동아%").limit(10);
console.log("\n=== products (동아% supplier · 상위 10) ===");
console.table(prods?.map(p => ({
  code: p.product_code,
  name: p.product_name?.slice(0, 20),
  supplier: p.supplier,
  purchase_price: p.purchase_price,
  sale_price: p.sale_price,
  current_stock: p.current_stock,
})));

// stock_history · 최근 3개월 · 동아% supplier
const cutoff = new Date();
cutoff.setMonth(cutoff.getMonth() - 3);
const cutoffStr = cutoff.toISOString().slice(0, 10);

const { data: sh } = await supabase
  .from("stock_history")
  .select("snapshot_date, product_code, product_name, sale_qty, purchase_qty, total_amount, supply_amount, taxable_amount, closing_stock, supplier_name")
  .ilike("supplier_name", "%동아%")
  .gte("snapshot_date", cutoffStr)
  .order("snapshot_date", { ascending: false })
  .limit(15);
console.log("\n=== stock_history (동아% · 최근 3개월 · 상위 15) ===");
console.table(sh?.map(r => ({
  date: r.snapshot_date,
  code: r.product_code,
  name: (r.product_name ?? "").slice(0, 20),
  sale_qty: r.sale_qty,
  purchase_qty: r.purchase_qty,
  total_amount: (Number(r.total_amount) || 0).toLocaleString(),
  supply_amount: (Number(r.supply_amount) || 0).toLocaleString(),
  taxable_amount: (Number(r.taxable_amount) || 0).toLocaleString(),
  closing_stock: r.closing_stock,
})));

// 3개월 합계
const { data: shAll } = await supabase
  .from("stock_history")
  .select("total_amount, supply_amount, taxable_amount, sale_qty, purchase_qty, product_code")
  .ilike("supplier_name", "%동아%")
  .gte("snapshot_date", cutoffStr);
let totalA = 0, supplyA = 0, taxableA = 0, saleQ = 0, purchaseQ = 0;
for (const r of shAll ?? []) {
  totalA += Number(r.total_amount) || 0;
  supplyA += Number(r.supply_amount) || 0;
  taxableA += Number(r.taxable_amount) || 0;
  saleQ += Number(r.sale_qty) || 0;
  purchaseQ += Number(r.purchase_qty) || 0;
}
console.log("\n=== 동아% · 최근 3개월 합계 ===");
console.log(`stock_history rows: ${shAll?.length ?? 0}`);
console.log(`total_amount 합 (판매액이라 표시): ${totalA.toLocaleString()}원`);
console.log(`supply_amount 합 (공급가액): ${supplyA.toLocaleString()}원`);
console.log(`taxable_amount 합 (과세): ${taxableA.toLocaleString()}원`);
console.log(`sale_qty 합 (판매수량): ${saleQ.toLocaleString()}개`);
console.log(`purchase_qty 합 (매입수량): ${purchaseQ.toLocaleString()}개`);

// purchase_details 매입액 합
const { data: pd } = await supabase
  .from("purchase_details")
  .select("amount, supplier_name")
  .ilike("supplier_name", "%동아%")
  .gte("purchase_date", cutoffStr);
let pdSum = 0;
for (const r of pd ?? []) pdSum += Number(r.amount) || 0;
console.log(`\n=== 동아% · purchase_details 최근 3개월 매입액 ===`);
console.log(`rows: ${pd?.length ?? 0} · 합: ${pdSum.toLocaleString()}원`);
