import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
function loadEnv() {
  const raw = readFileSync(".env", "utf8"); const env = {};
  for (const l of raw.split(/\r?\n/)) { const m = /^([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(l); if (m) env[m[1]] = m[2]; }
  return env;
}
const env = loadEnv();
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

// 정확히 "판매중" · 다른 값 · trailing space · unicode variants 검증
const cases = [
  { label: '=== "판매중" (strict)', filter: (v) => v === "판매중" },
  { label: '.trim() === "판매중"',   filter: (v) => String(v ?? "").trim() === "판매중" },
];
const PAGE = 1000;
let from = 0;
const distinct = new Map();
while (true) {
  const { data, error } = await sb.from("products").select("sale_status").range(from, from + PAGE - 1);
  if (error) { console.error(error.message); process.exit(1); }
  if (!data || data.length === 0) break;
  for (const r of data) {
    const raw = r.sale_status;
    if (raw === null || raw === undefined) continue;
    const bytes = Buffer.from(String(raw), "utf8").toString("hex");
    const key = `${JSON.stringify(String(raw))} (bytes=${bytes})`;
    distinct.set(key, (distinct.get(key) ?? 0) + 1);
  }
  if (data.length < PAGE) break;
  from += PAGE;
}
console.log("─".repeat(60));
console.log("Distinct sale_status values (non-null · non-empty):");
for (const [k, cnt] of [...distinct.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${cnt}  ${k}`);
}
