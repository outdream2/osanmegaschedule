// scripts/test-silent-push.mjs
// 2026-09-30 · silent push 강제 발송 · Expo fetch API · 응답 확인
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPT_URL = "https://exp.host/--/api/v2/push/getReceipts";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;
const supabase = createClient(url, key);

const userId = 2;

// 1) push_tokens
const { data: rows } = await supabase
  .from("push_tokens")
  .select("token, platform, active, last_used_at")
  .eq("user_id", userId)
  .eq("active", true);

console.log(`[user=${userId}] active tokens · ${rows?.length ?? 0}`);
for (const r of rows ?? []) {
  console.log(`  · ${r.platform} · last=${r.last_used_at}`);
  console.log(`    token=${r.token}`);
}
if (!rows?.length) process.exit(1);

// 2) unread count
const { count } = await supabase
  .from("notifications")
  .select("id", { count: "exact", head: true })
  .eq("employee_id", userId)
  .eq("read", false);
console.log(`[unread] ${count ?? 0}건`);

// 3) Passive Alert · iOS 15+ · 배너·소리 X · badge 자동 반영
const messages = rows.map(r => ({
  to: r.token,
  title: " ",
  body: "",
  sound: null,
  priority: "high",
  badge: count ?? 0,
  _interruptionLevel: "passive",
  data: { type: "badge-sync", badge: count ?? 0 },
}));

console.log(`\n[Silent push payload]`);
console.log(JSON.stringify(messages[0], null, 2));

const res = await fetch(EXPO_PUSH_URL, {
  method: "POST",
  headers: {
    "Accept": "application/json",
    "Accept-Encoding": "gzip, deflate",
    "Content-Type": "application/json",
  },
  body: JSON.stringify(messages),
});

console.log(`\n[Expo POST 응답] status=${res.status}`);
const json = await res.json();
console.log(JSON.stringify(json, null, 2));

// 4) Receipt · 3초 후
const ticketIds = (json.data ?? []).filter(t => t.status === "ok" && t.id).map(t => t.id);
if (ticketIds.length > 0) {
  console.log(`\n[Receipts · 3초 대기]`);
  await new Promise(r => setTimeout(r, 3000));
  const rec = await fetch(EXPO_RECEIPT_URL, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ids: ticketIds }),
  });
  const recJson = await rec.json();
  console.log(JSON.stringify(recJson, null, 2));
}

console.log(`\n[안내] iOS 앱 홈스크린 badge · ${count ?? 0} 으로 갱신 확인`);
