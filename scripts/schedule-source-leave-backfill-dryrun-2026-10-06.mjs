// 2026-10-06 · PHASE 1.5 · schedules.source_leave_id backfill DRY-RUN (READ-ONLY)
//
// 목적:
//   PHASE 1.5 로 schedules.source_leave_id 컬럼 신설 · 기존 (연차 승인본) schedules row 는
//   NULL 상태. 이들을 과거 leave_requests 와 매칭하여 backfill 할 수 있는지 조사.
//
// 매칭 규칙 (사용자 지시):
//   · schedules.employeeId == leave_requests.employee_id
//   · schedules.date BETWEEN leave_requests.start_date AND leave_requests.end_date
//   · schedules.type ↔ leave_requests.leave_type 매핑:
//       - schedules.type IN ("월차") → leave_type NOT IN ("오전반차","오후반차")
//       - schedules.type == "오전반차" → leave_type == "오전반차"
//       - schedules.type == "오후반차" → leave_type == "오후반차"
//   · leave_requests.status == "approved"
//
// 분류:
//   · 1 match → SAFE_BACKFILL (dry-run count 만, 실제 UPDATE 수행 X)
//   · 0 match → UNMAPPED
//   · 2+ match → AMBIGUOUS (MAX/MIN 임의 선택 금지 · 사용자 승인 필요)
//
// 안전 규칙:
//   · READ ONLY · 어떤 UPDATE/DELETE 도 수행하지 않는다
//   · source_leave_id 컬럼이 아직 추가 안 된 환경에서도 조사 가능 (스캔만 수행)
//
// 전제:
//   · schedules.source_leave_id 컬럼 미존재여도 가능 (migration 선 적용 전에도 실행 가능)
//   · 사용자가 column 존재 여부 상관없이 "backfill 가능 regions" 를 파악하기 위함

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const LEAVE_SCHED_TYPES = ["월차", "오전반차", "오후반차"];

function matchesScheduleType(scheduleType, leaveType) {
  if (scheduleType === "오전반차") return leaveType === "오전반차";
  if (scheduleType === "오후반차") return leaveType === "오후반차";
  if (scheduleType === "월차") return !["오전반차", "오후반차"].includes(String(leaveType ?? ""));
  return false;
}

async function fetchAllSchedulesWithLeaveTypes() {
  const out = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("schedules")
      .select("id, employeeId, date, type")
      .in("type", LEAVE_SCHED_TYPES)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`schedules · ${error.message}`);
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

async function fetchApprovedLeaves() {
  const { data, error } = await supabase
    .from("leave_requests")
    .select("id, employee_id, leave_type, start_date, end_date, status")
    .eq("status", "approved");
  if (error) throw new Error(`leave_requests · ${error.message}`);
  return data ?? [];
}

async function main() {
  console.log("===== PHASE 1.5 · source_leave_id BACKFILL DRY-RUN (READ-ONLY) · 2026-10-06 =====\n");

  const schedules = await fetchAllSchedulesWithLeaveTypes();
  console.log(`schedules (type ∈ 월차/반차): ${schedules.length}`);
  const leaves = await fetchApprovedLeaves();
  console.log(`approved leave_requests: ${leaves.length}\n`);

  let safe = 0;
  let unmapped = 0;
  let ambiguous = 0;
  const ambiguousSamples = [];
  const unmappedSamples = [];

  for (const s of schedules) {
    const sd = String(s.date).slice(0, 10);
    const matches = leaves.filter(lv => {
      if (Number(lv.employee_id) !== Number(s.employeeId)) return false;
      const start = String(lv.start_date).slice(0, 10);
      const end = String(lv.end_date).slice(0, 10);
      if (sd < start || sd > end) return false;
      if (!matchesScheduleType(s.type, lv.leave_type)) return false;
      return true;
    });
    if (matches.length === 1) {
      safe++;
    } else if (matches.length === 0) {
      unmapped++;
      if (unmappedSamples.length < 10) unmappedSamples.push({ schedule_id: s.id, employeeId: s.employeeId, date: sd, type: s.type });
    } else {
      ambiguous++;
      if (ambiguousSamples.length < 10) ambiguousSamples.push({ schedule_id: s.id, employeeId: s.employeeId, date: sd, type: s.type, matches: matches.map(m => m.id) });
    }
  }

  console.log("===== 결과 (DRY-RUN · 실제 UPDATE 수행 X) =====");
  console.log(`SAFE_BACKFILL (1 match): ${safe}`);
  console.log(`UNMAPPED      (0 match): ${unmapped}`);
  console.log(`AMBIGUOUS     (2+ match): ${ambiguous}`);
  console.log("");
  if (ambiguousSamples.length) {
    console.log("[AMBIGUOUS 샘플 10건]");
    for (const a of ambiguousSamples) console.log(`  schedule_id=${a.schedule_id} emp=${a.employeeId} date=${a.date} type=${a.type} · matches=${a.matches.length} [${a.matches.join(", ")}]`);
    console.log("");
  }
  if (unmappedSamples.length) {
    console.log("[UNMAPPED 샘플 10건] · 수동 schedule or 레거시 미기록 leave");
    for (const u of unmappedSamples) console.log(`  schedule_id=${u.schedule_id} emp=${u.employeeId} date=${u.date} type=${u.type}`);
    console.log("");
  }
  console.log("[중요] 자동 UPDATE 는 수행하지 않습니다. 사용자 승인 후 명시적 지시 필요.");
  // 결과 export (리포트용)
  console.log(`\nMETRICS_JSON=${JSON.stringify({ total: schedules.length, safe, unmapped, ambiguous })}`);
}

main().catch(err => {
  console.error("[FATAL]", err?.message ?? err);
  process.exit(1);
});
