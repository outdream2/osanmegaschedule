// scripts/try-pg-meta-exec.mjs
// Test if Supabase pg-meta /pg/query endpoint accepts service_role key for DDL.
// Pg-meta is used by Supabase Dashboard SQL Editor. May not be exposed on project domain.

import { readFileSync, existsSync } from "fs";

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
const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_KEY;

// Try several possible admin endpoints
const endpoints = [
  `${SUPABASE_URL}/pg/query`,
  `${SUPABASE_URL}/pg-meta/default/query`,
  `${SUPABASE_URL}/platform/pg-meta/default/query`,
];

for (const url of endpoints) {
  console.log("Trying:", url);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify({ query: "SELECT 1 AS x" }),
    });
    const text = await r.text();
    console.log(`  status=${r.status} body=${text.slice(0, 200)}`);
  } catch (e) {
    console.log(`  ERROR ${e.message}`);
  }
}
