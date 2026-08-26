import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
function loadEnv() {
  const raw = readFileSync(".env", "utf8"); const env = {};
  for (const l of raw.split(/\r?\n/)) { const m = /^([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(l); if (m) env[m[1]] = m[2]; }
  return env;
}
const env = loadEnv();
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
const { data, error } = await sb.from("app_settings").select("*").eq("key", "brand_identity").maybeSingle();
if (error) { console.error(error.message); process.exit(1); }
console.log("brand_identity row:", JSON.stringify(data, null, 2));
