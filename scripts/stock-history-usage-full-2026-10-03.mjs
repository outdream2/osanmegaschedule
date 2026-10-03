// READ ONLY · stock_history 전수 분석 (paginated)
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const PAGE = 1000;

const monthHist = new Map();
const periodTypeHist = new Map();
let total = 0, hasClosing = 0, hasSale = 0, hasPurchase = 0;
let from = 0;
while (true) {
  const { data, error } = await supabase.from("stock_history")
    .select("snapshot_date, period_type, closing_stock, sale_qty, purchase_qty")
    .range(from, from + PAGE - 1);
  if (error) { console.error(error); break; }
  if (!data || !data.length) break;
  for (const r of data) {
    total++;
    const m = (r.snapshot_date || "").slice(0, 7);
    monthHist.set(m, (monthHist.get(m) || 0) + 1);
    periodTypeHist.set(r.period_type || "(null)", (periodTypeHist.get(r.period_type || "(null)") || 0) + 1);
    if (r.closing_stock != null && r.closing_stock !== 0) hasClosing++;
    if (r.sale_qty != null && Number(r.sale_qty) > 0) hasSale++;
    if (r.purchase_qty != null && Number(r.purchase_qty) > 0) hasPurchase++;
  }
  if (data.length < PAGE) break;
  from += PAGE;
}
console.log(`stock_history total scanned: ${total}`);
console.log(`\n월별 row count:`);
[...monthHist.entries()].sort().forEach(([k, v]) => console.log(`  ${k} : ${v}`));
console.log(`\nperiod_type 분포:`);
[...periodTypeHist.entries()].forEach(([k, v]) => console.log(`  ${k} : ${v}`));
console.log(`\nhas closing_stock≠0: ${hasClosing} (${((hasClosing/total)*100).toFixed(1)}%)`);
console.log(`has sale_qty>0: ${hasSale} (${((hasSale/total)*100).toFixed(1)}%)`);
console.log(`has purchase_qty>0: ${hasPurchase} (${((hasPurchase/total)*100).toFixed(1)}%)`);
