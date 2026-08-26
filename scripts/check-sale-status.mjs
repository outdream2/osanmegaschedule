// 2026-08-26 · 일회성 확인 스크립트 · products.sale_status 실제 값 분포 조회
//   실행 · node scripts/check-sale-status.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

function loadEnv() {
  const raw = readFileSync(".env", "utf8");
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = /^([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const env = loadEnv();
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

console.log("products.sale_status 분포 조회 중...");
const PAGE = 1000;
const counts = new Map();
let total = 0;
let from = 0;

while (true) {
  const { data, error } = await supabase
    .from("products")
    .select("sale_status")
    .range(from, from + PAGE - 1);
  if (error) { console.error("ERROR:", error.message); process.exit(1); }
  if (!data || data.length === 0) break;
  for (const r of data) {
    const v = r.sale_status;
    const key = v === null ? "<null>" : v === "" ? "<empty>" : String(v);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    total++;
  }
  if (data.length < PAGE) break;
  from += PAGE;
}

console.log(`\n총 ${total}건`);
console.log("─".repeat(50));
const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
for (const [key, cnt] of sorted) {
  const pct = ((cnt / total) * 100).toFixed(1);
  console.log(`${key.padEnd(20)} ${String(cnt).padStart(6)} (${pct}%)`);
}
