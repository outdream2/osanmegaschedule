// scripts/verify-badge-sync.mjs
// 2026-09-30 · Passive Alert 실제 검증 · 임시 알림 3개 생성·삭제 반복
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const EXPO_URL = "https://exp.host/--/api/v2/push/send";
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const userId = 2;

async function unread() {
  const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true })
    .eq("employee_id", userId).eq("read", false);
  return count ?? 0;
}

async function sendPassive(badge) {
  const { data: tokens } = await supabase.from("push_tokens").select("token")
    .eq("user_id", userId).eq("active", true);
  const messages = (tokens ?? []).map(r => ({
    to: r.token, title: " ", body: "", sound: null, priority: "high", badge,
    _interruptionLevel: "passive", data: { type: "badge-sync", badge },
  }));
  const res = await fetch(EXPO_URL, {
    method: "POST",
    headers: { "Accept": "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(messages),
  });
  const j = await res.json();
  return j.data?.[0]?.status === "ok";
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

console.log("=== Passive Alert 실증 테스트 ===\n");

// 1) 시작 · 초기 상태
const initial = await unread();
console.log(`[초기] unread=${initial}`);
console.log(`  → 앱 홈스크린 badge · ${initial} 이어야 정상\n`);

// 2) 임시 알림 3개 생성
console.log("[STEP 1] 임시 알림 3개 생성 (badge 3 세팅 시도)");
const { data: created } = await supabase.from("notifications").insert([
  { employee_id: userId, title: "test 1", body: "테스트 알림 1", type: "info" },
  { employee_id: userId, title: "test 2", body: "테스트 알림 2", type: "info" },
  { employee_id: userId, title: "test 3", body: "테스트 알림 3", type: "info" },
]).select("id");
const createdIds = (created ?? []).map(r => r.id);
console.log(`  생성된 id · ${createdIds.join(", ")}`);

const cnt3 = await unread();
console.log(`  unread=${cnt3}`);
const ok3 = await sendPassive(cnt3);
console.log(`  Passive Alert 발송 · ${ok3 ? "OK" : "FAIL"} · badge=${cnt3}`);
console.log(`  ✋ 앱 홈스크린 확인 · badge=${cnt3} 인가?\n`);

console.log("5초 대기 (앱 확인 시간)...");
await sleep(5000);

// 3) 1개 읽음
console.log("\n[STEP 2] 알림 1개 읽음 처리");
await supabase.from("notifications").update({ read: true }).eq("id", createdIds[0]);
const cnt2 = await unread();
console.log(`  unread=${cnt2}`);
const ok2 = await sendPassive(cnt2);
console.log(`  Passive Alert 발송 · ${ok2 ? "OK" : "FAIL"} · badge=${cnt2}`);
console.log(`  ✋ 앱 홈스크린 확인 · badge=${cnt2} 인가?\n`);

console.log("5초 대기...");
await sleep(5000);

// 4) 전체 삭제 · badge=0
console.log("\n[STEP 3] 테스트 알림 3개 완전 삭제");
await supabase.from("notifications").delete().in("id", createdIds);
const cnt0 = await unread();
console.log(`  unread=${cnt0}`);
const ok0 = await sendPassive(cnt0);
console.log(`  Passive Alert 발송 · ${ok0 ? "OK" : "FAIL"} · badge=${cnt0}`);
console.log(`  ✋ 앱 홈스크린 확인 · badge=${cnt0} 인가?`);
console.log(`  ✋ 알림센터 확인 · 공백 알림 3개 쌓였는가?\n`);

console.log("=== 완료 ===");
console.log("[결과 확인 항목]");
console.log("  1. STEP 1 후 · 앱 badge=3?");
console.log("  2. STEP 2 후 · 앱 badge=2?");
console.log("  3. STEP 3 후 · 앱 badge=0? (or 사라짐)");
console.log("  4. 알림센터 · 공백 3개 entry 확인");
