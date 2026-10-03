// READ ONLY · stock_history 실제 사용처 분석
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Date range + aggregates
const { count: total } = await supabase.from("stock_history").select("*", { count: "exact", head: true });
console.log("stock_history total:", total);

// Min/max snapshot_date
const { data: minD } = await supabase.from("stock_history").select("snapshot_date, period_start_date").order("snapshot_date", { ascending: true }).limit(1);
const { data: maxD } = await supabase.from("stock_history").select("snapshot_date, period_start_date").order("snapshot_date", { ascending: false }).limit(1);
console.log("min snapshot_date:", minD?.[0]);
console.log("max snapshot_date:", maxD?.[0]);

// Distinct snapshot_date count by month
const { data: all } = await supabase.from("stock_history").select("snapshot_date, period_type, closing_stock, sale_qty, purchase_qty");
const monthHist = new Map();
const periodTypeHist = new Map();
let hasClosing = 0, hasSale = 0, hasPurchase = 0;
for (const r of all || []) {
  const m = (r.snapshot_date || "").slice(0, 7);
  monthHist.set(m, (monthHist.get(m) || 0) + 1);
  periodTypeHist.set(r.period_type || "(null)", (periodTypeHist.get(r.period_type || "(null)") || 0) + 1);
  if (r.closing_stock != null && r.closing_stock !== 0) hasClosing++;
  if (r.sale_qty != null && r.sale_qty > 0) hasSale++;
  if (r.purchase_qty != null && r.purchase_qty > 0) hasPurchase++;
}
console.log("\n월별 row count:");
[...monthHist.entries()].sort().forEach(([k, v]) => console.log(`  ${k} : ${v}`));
console.log("\nperiod_type 분포:");
[...periodTypeHist.entries()].forEach(([k, v]) => console.log(`  ${k} : ${v}`));
console.log(`\nhas closing_stock>0: ${hasClosing}`);
console.log(`has sale_qty>0: ${hasSale}`);
console.log(`has purchase_qty>0: ${hasPurchase}`);
