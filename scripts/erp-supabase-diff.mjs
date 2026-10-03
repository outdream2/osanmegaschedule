// 2026-10-03 · READ ONLY · ERP Inventory_Status 4,070 ↔ Supabase products 7,078 비교
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import * as dotenv from "dotenv";
dotenv.config();

const inv = JSON.parse(readFileSync("tools/iregen-bridge/output/inventory-full-full.json", "utf8"));
const erpCodes = new Set();
for (const r of inv.tables[0].rows) {
  const code = String(r.PCode ?? "").trim();
  if (code) erpCodes.add(code);
}
console.log("ERP (Inventory_Status PCode):", erpCodes.size);

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const sbCodes = new Set();
let from = 0;
const PAGE = 1000;
while (true) {
  const { data, error } = await supabase.from("products").select("product_code").range(from, from + PAGE - 1);
  if (error) { console.error(error); break; }
  if (!data || data.length === 0) break;
  for (const r of data) if (r.product_code) sbCodes.add(String(r.product_code).trim());
  if (data.length < PAGE) break;
  from += PAGE;
}
console.log("Supabase (products.product_code):", sbCodes.size);

let both = 0, erpOnly = 0, sbOnly = 0;
for (const c of erpCodes) if (sbCodes.has(c)) both++; else erpOnly++;
for (const c of sbCodes) if (!erpCodes.has(c)) sbOnly++;
console.log("\n===== 교집합 분석 =====");
console.log("Both:", both);
console.log("ERP Only (Supabase 에 없음):", erpOnly);
console.log("Supabase Only (ERP 에 없음):", sbOnly);

// 공통 상품 몇 개의 핵심 field 비교 (sample 10)
console.log("\n===== Both 상품 sample 10 · ERP vs Supabase field 비교 =====");
const sampleCodes = [...erpCodes].filter((c) => sbCodes.has(c)).slice(0, 10);
if (sampleCodes.length > 0) {
  const { data: sbSample } = await supabase
    .from("products")
    .select("product_code, product_name, supplier, purchase_price, sale_price, display_location, unit, sale_status, optimal_stock, hidden")
    .in("product_code", sampleCodes);
  const sbByCode = new Map(sbSample?.map((r) => [r.product_code, r]) ?? []);
  const invByCode = new Map();
  for (const r of inv.tables[0].rows) {
    const c = String(r.PCode ?? "").trim();
    if (c && sampleCodes.includes(c)) invByCode.set(c, r);
  }
  for (const c of sampleCodes) {
    const erp = invByCode.get(c);
    const sb = sbByCode.get(c);
    if (!erp || !sb) continue;
    console.log(`\n--- ${c} (${erp.ProductName}) ---`);
    const compare = (label, erpVal, sbVal) => {
      const same = String(erpVal ?? "") === String(sbVal ?? "");
      console.log(`  ${label.padEnd(20)} ERP=${JSON.stringify(erpVal)} · DB=${JSON.stringify(sbVal)} ${same ? "" : " ← DIFF"}`);
    };
    compare("ProductName", erp.ProductName, sb.product_name);
    compare("Supplier", erp.CCorpName, sb.supplier);
    compare("CostPrice", Math.round(Number(erp.CostPrice || 0)), sb.purchase_price);
    compare("Unit", erp.UnitCode, sb.unit);
    compare("Location", erp.LocationName, sb.display_location);
    compare("SaleStatus", erp.IsSaleStatusName, sb.sale_status);
    console.log(`  (PROTECTED) optimal_stock=${sb.optimal_stock}, hidden=${sb.hidden}, sale_price=${sb.sale_price}`);
  }
}

console.log("\n===== 완료 (READ ONLY) =====");
