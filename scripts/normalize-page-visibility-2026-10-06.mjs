// 2026-10-06 · 사용자 지시 · app_settings.page_visibility 정규화
// · "메뉴 visibility 는 화면 종류와 관계없이 하나" 정책
// · 모든 key 에 대해 mobile = pc 로 통일 (canonical = pc)
// · schema change X · UPDATE 1건
//
// 실행: node scripts/normalize-page-visibility-2026-10-06.mjs

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

const { data, error } = await supabase.from("app_settings").select("key, value").eq("key", "page_visibility");
if (error) { console.error("fetch err:", error.message); process.exit(1); }
if (!data || data.length === 0) {
  console.log("page_visibility 저장 없음 · 정규화 생략");
  process.exit(0);
}

const row = data[0];
const v = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
console.log("\n=== BEFORE ===");
for (const [k, e] of Object.entries(v)) console.log(`  ${k}: pc=${e.pc} · mobile=${e.mobile}`);

const normalized = {};
let mismatchCount = 0;
for (const [k, e] of Object.entries(v)) {
  const canonical = typeof e.pc === "boolean" ? e.pc : true;
  normalized[k] = { pc: canonical, mobile: canonical };
  if (e.mobile !== canonical) mismatchCount++;
}

console.log(`\nmismatch count (pc !== mobile) before = ${mismatchCount}`);

console.log("\n=== AFTER (preview) ===");
for (const [k, e] of Object.entries(normalized)) console.log(`  ${k}: pc=${e.pc} · mobile=${e.mobile}`);

const { error: upErr } = await supabase
  .from("app_settings")
  .update({ value: normalized })
  .eq("key", "page_visibility");
if (upErr) { console.error("update err:", upErr.message); process.exit(1); }

console.log("\n✅ 정규화 완료 · mismatch after = 0");
