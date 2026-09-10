// scripts/audit-supplier-integrity.mjs
// 2026-09-10 · #63 · 공급사 이름 무결성 조사
//   · products.supplier · purchase_details.supplier_name · stock_history.supplier_name · order_requests.supplier
//   · vendors.company_name 과 매칭 안 되는 값 · 리스트업
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const { data: vendors } = await supabase.from("vendors").select("company_name");
const vendorSet = new Set((vendors ?? []).map(v => String(v.company_name).trim()).filter(Boolean));
console.log(`vendors · ${vendorSet.size} 개`);

async function auditTable(table, col, extraSelect = "") {
  const seen = new Map(); // supplier_val → count
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from(table).select(`${col}${extraSelect ? ", " + extraSelect : ""}`).range(from, from + PAGE - 1);
    if (error) { console.error(`${table} 오류:`, error.message); break; }
    if (!data || data.length === 0) break;
    for (const r of data) {
      const v = String(r[col] ?? "").trim();
      if (!v) continue;
      seen.set(v, (seen.get(v) ?? 0) + 1);
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  const orphans = Array.from(seen.entries()).filter(([v]) => !vendorSet.has(v)).sort((a, b) => b[1] - a[1]);
  console.log(`\n=== ${table}.${col} · vendors 매칭 안 되는 값 ${orphans.length} 종류 ===`);
  console.table(orphans.slice(0, 30).map(([v, c]) => ({ value: v, rows: c })));
  return orphans;
}

const A = await auditTable("products", "supplier");
const B = await auditTable("purchase_details", "supplier_name");
const C = await auditTable("stock_history", "supplier_name");
const D = await auditTable("order_requests", "supplier");

console.log("\n=== 요약 ===");
console.log(`products.supplier    · orphan ${A.length} · total ${A.reduce((s, [, c]) => s + c, 0)} rows`);
console.log(`purchase_details.supplier_name · orphan ${B.length} · total ${B.reduce((s, [, c]) => s + c, 0)} rows`);
console.log(`stock_history.supplier_name    · orphan ${C.length} · total ${C.reduce((s, [, c]) => s + c, 0)} rows`);
console.log(`order_requests.supplier        · orphan ${D.length} · total ${D.reduce((s, [, c]) => s + c, 0)} rows`);
