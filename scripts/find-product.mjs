import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
function loadEnv() {
  const raw = readFileSync(".env", "utf8"); const env = {};
  for (const l of raw.split(/\r?\n/)) { const m = /^([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(l); if (m) env[m[1]] = m[2]; }
  return env;
}
const env = loadEnv();
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
const { data } = await sb.from("products")
  .select("product_code, product_name, sale_status, supplier, spec, hidden")
  .ilike("product_name", "%츄어블%");
console.log("츄어블 관련 상품 (전체):");
for (const p of data ?? []) {
  console.log(`  code=${p.product_code} sale_status=${JSON.stringify(p.sale_status)} hidden=${p.hidden} name="${p.product_name}"`);
}
