// 2026-09-08 · 백필 실행 여부 확인
//   · inventory_checks 에서 checked_by='system:backfill' 카운트
//   · 판매중지/숨김 상품에 잘못 생성된 row 카운트

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

function loadEnv() {
  const raw = readFileSync(".env", "utf8"); const env = {};
  for (const l of raw.split(/\r?\n/)) { const m = /^([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(l); if (m) env[m[1]] = m[2]; }
  return env;
}
const env = loadEnv();
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

const { count: totalBackfill, error: e1 } = await sb
  .from("inventory_checks")
  .select("*", { count: "exact", head: true })
  .eq("checked_by", "system:backfill");
if (e1) { console.error(e1); process.exit(1); }
console.log(`[check] checked_by='system:backfill' 총 ${totalBackfill}개 row`);

// system:auto-assign (신규 상품 등록 시 생성) 도 확인
const { count: autoAssign } = await sb
  .from("inventory_checks")
  .select("*", { count: "exact", head: true })
  .eq("checked_by", "system:auto-assign");
console.log(`[check] checked_by='system:auto-assign' 총 ${autoAssign ?? 0}개 row`);
