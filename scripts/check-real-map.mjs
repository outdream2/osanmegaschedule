import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
function loadEnv() {
  const raw = readFileSync(".env", "utf8"); const env = {};
  for (const l of raw.split(/\r?\n/)) { const m = /^([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(l); if (m) env[m[1]] = m[2]; }
  return env;
}
const env = loadEnv();
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
const { data, error } = await sb.from("products").select("real_map").not("real_map", "is", null).limit(1);
if (error) {
  console.log(`[check] error: ${error.message}`);
  if (/column .* does not exist/i.test(error.message)) console.log("→ 컬럼 자체 없음 (이미 DROP됨)");
} else {
  const { count } = await sb.from("products").select("*", { count: "exact", head: true }).not("real_map", "is", null);
  console.log(`[check] real_map 컬럼 · 값 있는 row · ${count}건`);
  console.log(`[check] 샘플:`, data);
}
