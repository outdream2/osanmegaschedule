// scripts/check-notifications-unread.mjs
// 2026-09-30 · 알람 불일치 진단 · notifications unread count · user_id 별
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;
if (!url || !key) { console.error("SUPABASE_URL/KEY missing"); process.exit(1); }
const supabase = createClient(url, key);

// 1) push_tokens 에 있는 user 목록
const { data: tokens } = await supabase
  .from("push_tokens")
  .select("user_id, platform, active, last_used_at")
  .eq("active", true);

const userIds = [...new Set((tokens ?? []).map(t => t.user_id))];
console.log(`[push_tokens active] users · ${userIds.join(", ") || "(없음)"}`);

// 2) 각 user · unread count + employee info
for (const uid of userIds) {
  const [{ data: emp }, { count: unread }] = await Promise.all([
    supabase.from("employees").select("id, name, phone, level").eq("id", uid).single(),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("employee_id", uid).eq("read", false),
  ]);
  console.log(`\n[user=${uid}] ${emp?.name ?? "unknown"} · lv=${emp?.level ?? "?"} · phone=${emp?.phone ?? "?"}`);
  console.log(`  unread notifications · ${unread ?? 0}건`);
  // 최근 알림 5개
  const { data: notis } = await supabase
    .from("notifications")
    .select("id, title, body, read, type, created_at")
    .eq("employee_id", uid)
    .order("created_at", { ascending: false })
    .limit(5);
  console.log(`  [최근 5건]`);
  for (const n of notis ?? []) {
    const flag = n.read ? "  " : "★ ";
    console.log(`   ${flag}#${n.id} ${n.title?.slice(0, 40) ?? ""} · ${n.type ?? ""} · ${n.created_at?.slice(0, 16)}`);
  }
}

// 3) 전체 notifications · unread 분포
const { data: allUnread } = await supabase
  .from("notifications")
  .select("employee_id")
  .eq("read", false);
const byUser = {};
for (const r of allUnread ?? []) {
  byUser[r.employee_id] = (byUser[r.employee_id] ?? 0) + 1;
}
console.log("\n[전체 unread 분포]");
Object.entries(byUser).sort((a, b) => b[1] - a[1]).forEach(([uid, cnt]) => {
  console.log(`  user=${uid} · unread=${cnt}`);
});
