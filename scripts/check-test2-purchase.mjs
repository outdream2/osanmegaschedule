// scripts/check-test2-purchase.mjs
// 2026-09-10 · 테스트2 공급사 매입내역 확인
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

console.log("=== vendors 매칭 ===");
const { data: vendors } = await supabase.from("vendors").select("id, company_name").ilike("company_name", "%테스%");
console.log(vendors);

console.log("\n=== products supplier 매칭 ===");
const { data: prods } = await supabase.from("products").select("product_code, product_name, supplier").ilike("supplier", "%테스%");
console.log(prods);

console.log("\n=== purchase_details supplier_name 매칭 ===");
const { data: pd } = await supabase.from("purchase_details").select("id, supplier_name, supplier_code, product_code, product_name, quantity, amount, total, purchase_date").ilike("supplier_name", "%테스%").order("purchase_date", { ascending: false }).limit(20);
console.log(`총 ${pd?.length ?? 0} rows`);
console.table(pd);

console.log("\n=== stock_history supplier_name 매칭 ===");
const { data: sh } = await supabase.from("stock_history").select("snapshot_date, supplier_name, product_code, product_name, sale_qty, purchase_qty, total_amount").ilike("supplier_name", "%테스%").order("snapshot_date", { ascending: false }).limit(20);
console.log(`총 ${sh?.length ?? 0} rows`);
console.table(sh);
