// 2026-09-08 · stock_history 직접 조회 · 기간별 판매발생 상품수 확인
//   · RPC 우회 · 실제 raw 데이터 확인
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
function loadEnv() {
  const raw = readFileSync(".env", "utf8"); const env = {};
  for (const l of raw.split(/\r?\n/)) { const m = /^([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(l); if (m) env[m[1]] = m[2]; }
  return env;
}
const env = loadEnv();
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

// 최근 stock_history 상태
const { data: latest } = await sb.from("stock_history").select("snapshot_date").order("snapshot_date", { ascending: false }).limit(1);
console.log(`[stock_history] 최신 snapshot_date · ${latest?.[0]?.snapshot_date ?? "(없음)"}`);
const { data: earliest } = await sb.from("stock_history").select("snapshot_date").order("snapshot_date", { ascending: true }).limit(1);
console.log(`[stock_history] 최초 snapshot_date · ${earliest?.[0]?.snapshot_date ?? "(없음)"}`);

const { count: totalRows } = await sb.from("stock_history").select("*", { count: "exact", head: true });
console.log(`[stock_history] 전체 row · ${totalRows}건`);

for (const months of [1, 3, 6, 12]) {
  const today = new Date();
  const cutoff = new Date(today.getFullYear(), today.getMonth() - months, today.getDate());
  const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  // stock_history · 기간 안 · sale_qty > 0 rows · product_code distinct
  const codes = new Set();
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data } = await sb.from("stock_history")
      .select("product_code, sale_qty")
      .gte("snapshot_date", cutoffStr).lte("snapshot_date", todayStr)
      .gt("sale_qty", 0)
      .range(from, from + PAGE - 1);
    if (!data || data.length === 0) break;
    for (const r of data) codes.add(String(r.product_code ?? "").trim());
    if (data.length < PAGE) break;
    from += PAGE;
  }
  console.log(`[${months}개월 · ${cutoffStr}~${todayStr}] 판매발생 상품수 (raw stock_history) · ${codes.size}건`);
}
