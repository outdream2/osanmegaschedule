// scripts/check-push-tokens-table.mjs
// 2026-09-30 · P1-2 확인 · push_tokens 테이블 존재 여부 · Supabase 조회
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;
if (!url || !key) {
  console.error("[check-push-tokens] SUPABASE_URL / SUPABASE_KEY 없음");
  process.exit(1);
}
const supabase = createClient(url, key);

const { count, error } = await supabase
  .from("push_tokens")
  .select("id", { count: "exact", head: true });

if (error) {
  if (error.message?.includes("does not exist") || error.code === "42P01") {
    console.log("❌ push_tokens 테이블 · 없음 · P1-2 SQL 실행 필요");
    console.log("   에러 · " + error.message);
  } else {
    console.log("⚠ 조회 에러 · " + error.message);
    console.log("   code · " + error.code);
  }
  process.exit(1);
}

console.log("✅ push_tokens 테이블 · 있음");
console.log("   등록된 토큰 수 · " + (count ?? 0));

if ((count ?? 0) === 0) {
  console.log("⚠ 토큰 0개 · 앱에서 savePushToken 아직 성공 못함");
  console.log("   원인 후보 · 앱 미실행 · window.OSAN_APP.pushToken 미제공 · 401 미인증");
} else {
  const { data: rows } = await supabase
    .from("push_tokens")
    .select("id, user_id, platform, active, last_used_at, created_at")
    .order("last_used_at", { ascending: false })
    .limit(10);
  console.log("\n[최근 토큰 10개]");
  for (const r of rows ?? []) {
    console.log(`  #${r.id} · user=${r.user_id} · ${r.platform} · active=${r.active} · last=${r.last_used_at}`);
  }
}
