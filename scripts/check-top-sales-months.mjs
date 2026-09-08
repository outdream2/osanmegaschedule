// 2026-09-08 · 판매대시보드 · 기간별 rows 카운트/판매상품수 비교
//   · 1·3·6개월 각각 top-sales 조회 · rows 수·sale_qty>0 상품수 리포트
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
function loadEnv() {
  const raw = readFileSync(".env", "utf8"); const env = {};
  for (const l of raw.split(/\r?\n/)) { const m = /^([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(l); if (m) env[m[1]] = m[2]; }
  return env;
}
const env = loadEnv();
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

for (const months of [1, 3, 6]) {
  const today = new Date();
  const cutoff = new Date(today.getFullYear(), today.getMonth() - months, today.getDate());
  const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const t0 = Date.now();
  const { data, error } = await sb.rpc("get_stock_flow", { p_from: cutoffStr, p_to: todayStr });
  if (error) { console.log(`[${months}m] RPC 에러:`, error.message); continue; }
  const rows = Array.isArray(data) ? data : [];
  const withSales = rows.filter(r => Number(r.sale_qty ?? 0) > 0);
  const totalSaleQty = rows.reduce((s, r) => s + (Number(r.sale_qty ?? 0) || 0), 0);
  console.log(`[${months}개월 · ${cutoffStr} ~ ${todayStr}] rows=${rows.length} · 판매발생상품(sale_qty>0)=${withSales.length} · 총판매수량=${totalSaleQty} · ${Date.now() - t0}ms`);
}
