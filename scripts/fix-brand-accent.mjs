import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
function loadEnv() {
  const raw = readFileSync(".env", "utf8"); const env = {};
  for (const l of raw.split(/\r?\n/)) { const m = /^([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(l); if (m) env[m[1]] = m[2]; }
  return env;
}
const env = loadEnv();
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
const { data: cur } = await sb.from("app_settings").select("value").eq("key", "brand_identity").maybeSingle();
if (!cur) { console.error("brand_identity row not found"); process.exit(1); }
const nextValue = { ...cur.value, brandAccentWord: "MEGATOWN" };
console.log("Before:", cur.value);
console.log("After: ", nextValue);
const { error } = await sb.from("app_settings").update({ value: nextValue }).eq("key", "brand_identity");
if (error) { console.error(error.message); process.exit(1); }
console.log("✓ brandAccentWord updated to MEGATOWN");
