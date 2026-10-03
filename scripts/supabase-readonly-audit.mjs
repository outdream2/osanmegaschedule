// 2026-10-03 · PHASE 1 분석 · Supabase READ ONLY audit (사용자 지시)
//   · 절대 INSERT/UPDATE/DELETE 하지 않음
//   · schema + row count + null 비율 + sample

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL / SUPABASE_KEY 미설정");
  process.exit(1);
}
const supabase = createClient(url, key);

const TABLES = ["products", "vendors", "purchase_details", "stock_history", "inventory_checks"];

async function main() {
  console.log("===== Supabase READ ONLY audit · 2026-10-03 =====\n");
  for (const t of TABLES) {
    const { count, error } = await supabase.from(t).select("*", { count: "exact", head: true });
    if (error) {
      console.log(`❌ ${t} · ${error.message}`);
      continue;
    }
    console.log(`✓ ${t} · total rows: ${count?.toLocaleString() ?? "?"}`);
  }

  console.log("\n===== products · 1 sample row =====");
  const { data: p } = await supabase.from("products").select("*").limit(1);
  if (p && p[0]) {
    for (const [k, v] of Object.entries(p[0])) {
      const show = v === null ? "NULL" : typeof v === "string" ? JSON.stringify(v).slice(0, 60) : v;
      console.log(`  ${k.padEnd(28)} ${show}`);
    }
  }

  console.log("\n===== products · null 비율 핵심 column =====");
  const checkCols = [
    "product_code", "product_name", "spec", "supplier", "supplier_code",
    "sale_price", "purchase_price", "profit_rate", "category", "category_code",
    "unit", "sale_status", "display_location", "location",
    "current_stock", "optimal_stock", "optimal_stock_backup", "min_order",
    "expiry_date", "last_purchase_date", "last_sale_date",
    "origin", "search_keywords", "wholesale_price1",
    "hidden", "memo", "stock_note",
    "registered_at", "last_modified_at", "created_at",
    "brand", "manufacturer",
  ];
  for (const col of checkCols) {
    try {
      const { count: nonNull, error } = await supabase
        .from("products")
        .select("*", { count: "exact", head: true })
        .not(col, "is", null);
      if (error) {
        console.log(`  ${col.padEnd(28)} column 없음 (${error.code})`);
        continue;
      }
      console.log(`  ${col.padEnd(28)} non-null: ${nonNull?.toLocaleString() ?? "?"}`);
    } catch (e) {
      console.log(`  ${col.padEnd(28)} skip (${e.message})`);
    }
  }

  console.log("\n===== vendors · 1 sample =====");
  const { data: v } = await supabase.from("vendors").select("*").limit(1);
  if (v && v[0]) {
    for (const [k, val] of Object.entries(v[0])) {
      const show = val === null ? "NULL" : typeof val === "string" ? JSON.stringify(val).slice(0, 60) : val;
      console.log(`  ${k.padEnd(24)} ${show}`);
    }
  }

  console.log("\n===== purchase_details · 1 sample =====");
  const { data: pd } = await supabase.from("purchase_details").select("*").limit(1);
  if (pd && pd[0]) {
    for (const [k, val] of Object.entries(pd[0])) {
      const show = val === null ? "NULL" : typeof val === "string" ? JSON.stringify(val).slice(0, 60) : val;
      console.log(`  ${k.padEnd(24)} ${show}`);
    }
  }

  console.log("\n===== stock_history · 1 sample =====");
  const { data: sh } = await supabase.from("stock_history").select("*").limit(1);
  if (sh && sh[0]) {
    for (const [k, val] of Object.entries(sh[0])) {
      const show = val === null ? "NULL" : typeof val === "string" ? JSON.stringify(val).slice(0, 60) : val;
      console.log(`  ${k.padEnd(24)} ${show}`);
    }
  }

  console.log("\n===== inventory_checks · 1 sample =====");
  const { data: ic } = await supabase.from("inventory_checks").select("*").limit(1);
  if (ic && ic[0]) {
    for (const [k, val] of Object.entries(ic[0])) {
      const show = val === null ? "NULL" : typeof val === "string" ? JSON.stringify(val).slice(0, 60) : val;
      console.log(`  ${k.padEnd(24)} ${show}`);
    }
  }

  console.log("\n===== 완료 (READ ONLY) =====");
}

main().catch((err) => {
  console.error("[audit] fatal:", err);
  process.exit(2);
});
