// scripts/restore-leave-approval.mjs
// 2026-09-10 · 승인요청 · 연차승인 페이지 복원 (hidden 해제)
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const { data } = await supabase.from("app_settings").select("value").eq("key", "page_permissions").maybeSingle();
const perms = data?.value ?? {};
console.log("변경 전:");
console.log(JSON.stringify({
  "approval-request:leave": perms["approval-request:leave"],
  "approval-request:lunch": perms["approval-request:lunch"],
  "requests:leave": perms["requests:leave"],
  "requests:lunch": perms["requests:lunch"],
}, null, 2));

// 연차승인·연차신청 hidden 해제
const targets = ["approval-request:leave", "requests:leave"];
for (const k of targets) {
  if (perms[k]) perms[k].hidden = false;
  else perms[k] = { hidden: false };
}

const { error } = await supabase.from("app_settings").upsert(
  { key: "page_permissions", value: perms, updated_at: new Date().toISOString() },
  { onConflict: "key" }
);
if (error) { console.error("업데이트 오류:", error.message); process.exit(1); }

console.log("\n변경 후:");
console.log(JSON.stringify({
  "approval-request:leave": perms["approval-request:leave"],
  "requests:leave": perms["requests:leave"],
}, null, 2));
console.log("\n✔ 연차승인·연차신청 페이지 복원 완료");
