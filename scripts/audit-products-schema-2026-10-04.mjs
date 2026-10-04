// 2026-10-04 · READ-ONLY · products schema 전수 column 확보
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function fetchColumnsFromSample(table) {
  const { data, error } = await supabase.from(table).select("*").limit(1);
  if (error) { console.error(`${table} 조회 실패:`, error.message); return []; }
  if (!data || !data.length) {
    // row 없으면 다른 방법
    return [];
  }
  return Object.keys(data[0]);
}

const tables = ["products", "purchase_details", "stock_history", "inventory_checks", "vendors"];
for (const t of tables) {
  const cols = await fetchColumnsFromSample(t);
  const { count } = await supabase.from(t).select("*", { count: "exact", head: true });
  console.log(`\n===== ${t} · rows=${count ?? "?"} · cols=${cols.length} =====`);
  cols.forEach((c, i) => console.log(`  [${String(i).padStart(2, " ")}] ${c}`));
}
