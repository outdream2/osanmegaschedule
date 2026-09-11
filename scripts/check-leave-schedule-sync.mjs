// scripts/check-leave-schedule-sync.mjs
// 2026-09-11 · #116 · 회귀 조사 · 승인된 연차 vs schedules 반영 매칭
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// 1. 최근 승인된 연차 요청
const { data: lrs, error: lrErr } = await supabase
  .from("leave_requests")
  .select("id, employee_id, employee_name, leave_type, start_date, end_date, status, reviewed_at")
  .eq("status", "approved")
  .order("reviewed_at", { ascending: false })
  .limit(10);

if (lrErr) { console.error("leave_requests error:", lrErr.message); process.exit(1); }
console.log(`\n━━━ 최근 승인 연차 요청 · ${lrs?.length ?? 0}건 ━━━`);
for (const lr of lrs ?? []) {
  console.log(`\n[LR#${lr.id}] emp=${lr.employee_id}(${lr.employee_name}) · ${lr.leave_type} · ${lr.start_date} ~ ${lr.end_date} · reviewed=${lr.reviewed_at}`);
  const scheduleType = ["오전반차", "오후반차"].includes(lr.leave_type) ? lr.leave_type : "월차";
  // schedules 테이블 · 대응 항목 확인
  const { data: sched } = await supabase
    .from("schedules")
    .select("employeeId, date, type, memo")
    .eq("employeeId", lr.employee_id)
    .gte("date", lr.start_date)
    .lte("date", lr.end_date);
  console.log(`  → schedules · ${sched?.length ?? 0}건 매칭:`);
  for (const s of sched ?? []) {
    console.log(`     ${s.date} · type=${s.type} · memo=${s.memo}`);
  }
  if ((sched?.length ?? 0) === 0) {
    console.log(`  ❌ 반영 안 됨 · 예상 type=${scheduleType}`);
  }
}

// 2. schedules 테이블 · type='월차' 인 데이터 존재 확인
const { data: monthlyLeave } = await supabase
  .from("schedules")
  .select("employeeId, date, type, memo")
  .eq("type", "월차")
  .order("date", { ascending: false })
  .limit(5);
console.log(`\n\n━━━ schedules · type='월차' · 최근 5건 ━━━`);
for (const s of monthlyLeave ?? []) {
  console.log(`  emp=${s.employeeId} · ${s.date} · memo=${s.memo}`);
}
