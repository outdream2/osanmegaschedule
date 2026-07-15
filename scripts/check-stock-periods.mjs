import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing");
  process.exit(1);
}
const sb = createClient(url, key);

// 1) 기간 목록
console.log("=== stock_history 기간 목록 ===");
const { data: periods, error: pErr } = await sb
  .from("stock_history")
  .select("period_start_date, snapshot_date, period_type")
  .order("snapshot_date", { ascending: false })
  .limit(5000);
if (pErr) { console.error(pErr); process.exit(1); }

const grouped = {};
for (const r of periods ?? []) {
  const k = `${r.period_start_date} → ${r.snapshot_date} (${r.period_type ?? "-"})`;
  grouped[k] = (grouped[k] ?? 0) + 1;
}
console.log("기간별 행 수:");
for (const [k, n] of Object.entries(grouped).sort()) {
  console.log(`  ${k} : ${n}행`);
}

// 2) 각 기간별로 opening=closing 이고 sale_qty=0 인 행 수 · 판매>0인데 opening=closing 인 행 수
console.log("\n=== 기간별 진단 (opening==closing 비율 · 판매가 있는데도 같은 경우) ===");
for (const k of Object.keys(grouped).sort()) {
  const [startSnap] = k.split(" → ");
  const period_start_date = startSnap.trim();
  const { data: rows, error } = await sb
    .from("stock_history")
    .select("opening_stock, closing_stock, sale_qty, purchase_qty")
    .eq("period_start_date", period_start_date);
  if (error) { console.error(error); continue; }
  const total = rows.length;
  const same = rows.filter(r => Number(r.opening_stock) === Number(r.closing_stock)).length;
  const saleWithSame = rows.filter(r => Number(r.sale_qty) > 0 && Number(r.opening_stock) === Number(r.closing_stock)).length;
  const openZero = rows.filter(r => Number(r.opening_stock) === 0).length;
  const openZeroCloseNonZero = rows.filter(r => Number(r.opening_stock) === 0 && Number(r.closing_stock) !== 0).length;
  const saleTotal = rows.reduce((s, r) => s + (Number(r.sale_qty) || 0), 0);
  const purchTotal = rows.reduce((s, r) => s + (Number(r.purchase_qty) || 0), 0);
  console.log(`\n[${k}]`);
  console.log(`  총 ${total}행 · 판매합계=${saleTotal.toLocaleString()} · 매입합계=${purchTotal.toLocaleString()}`);
  console.log(`  opening==closing : ${same}행 (${(same/total*100).toFixed(1)}%)`);
  console.log(`  ⚠ 판매>0 인데 opening==closing : ${saleWithSame}행`);
  console.log(`  opening==0 : ${openZero}행 (${(openZero/total*100).toFixed(1)}%)`);
  console.log(`  ⚠ opening==0 이면서 closing!=0 : ${openZeroCloseNonZero}행 (임포트 매핑 실패 의심)`);
}
