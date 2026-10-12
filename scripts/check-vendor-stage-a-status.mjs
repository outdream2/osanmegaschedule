// scripts/check-vendor-stage-a-status.mjs
// READ-ONLY · Stage A migration 적용 여부 확인

import { readFileSync, existsSync } from "fs";
import { createClient } from "@supabase/supabase-js";

if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = class { constructor() { throw new Error("REST only"); } };
}

function parseEnv(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[t.slice(0, eq).trim()] = v;
  }
  return out;
}

const env = parseEnv(new URL("../.env", import.meta.url).pathname.replace(/^\//, ""));
const SUPABASE_URL = process.env.SUPABASE_URL || env.SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_KEY ||
  env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("SUPABASE_URL / SUPABASE_KEY 없음");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  db: { schema: "public" },
});

const TARGET_COLUMNS = [
  "ct_code",
  "corp_name_view",
  "corp_biz_no",
  "scate_name",
  "remark",
  "president",
  "join_date",
  "buyer_type_name",
  "buyer_status_name",
  "payment_type_name",
  "payment_gubun_name",
  "payment_date",
];

// Try selecting one vendor row with target columns to detect presence
// (information_schema not exposed via PostgREST by default)
const presence = {};
for (const col of TARGET_COLUMNS) {
  const { error } = await sb.from("vendors").select(col).limit(1);
  presence[col] = error ? false : true;
  if (error && !/column .* does not exist/i.test(error.message || "")) {
    console.error(`[probe ${col}] unexpected error: ${error.message}`);
  }
}

const allPresent = TARGET_COLUMNS.every((c) => presence[c]);
const nonePresent = TARGET_COLUMNS.every((c) => !presence[c]);

console.log("\n=== Stage A column presence probe ===");
for (const c of TARGET_COLUMNS) console.log(`  ${c.padEnd(22)} ${presence[c] ? "YES" : "NO"}`);
console.log("");
console.log(`  all present = ${allPresent}`);
console.log(`  none present = ${nonePresent}`);
console.log(`  Stage A applied = ${allPresent ? "YES" : nonePresent ? "NO" : "PARTIAL"}`);
