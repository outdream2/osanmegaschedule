// 2026-10-06 · PHASE 1.5 · ORPHAN FORENSIC AUDIT (READ-ONLY)
//
// 목적: leave_requests orphan 2건 (employee_id=999, employee_id=3) 의 전체 맥락을
//       삭제·수정 없이 조사. 사용자 승인 전까지 어떠한 변경도 수행하지 않는다.
//
// 조사 대상:
//   1) leave_requests row 전체 column
//   2) 해당 날짜 범위에 걸친 schedules row
//   3) employee_id = 999 / 3 의 다른 흔적 (employee_contracts, resignation_requests)
//   4) employees 에서 id=3 / id=999 가 실제 존재 여부 (파이어니어링 X · 그대로 조회)
//   5) 해당 leave 와 매칭되는 notifications row
//
// 안전 규칙:
//   - READ ONLY
//   - 이름 유사도 매칭 금지
//   - 자동 분류 시 명확한 증거 없는 사례는 "E. 판별 불가" 로 표기

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL / SUPABASE_KEY 미설정");
  process.exit(1);
}
const supabase = createClient(url, key);

const ORPHAN_IDS = [
  "30277299-9ff9-4bfb-844d-75ac96b5f81b",
  "297371b0-c0fb-4706-b783-7a42414c299c",
];

async function fetchLeaveRequest(id) {
  const { data, error } = await supabase
    .from("leave_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`leave_requests · ${error.message}`);
  return data;
}

async function fetchEmployee(id) {
  const { data, error } = await supabase
    .from("employees")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`employees · ${error.message}`);
  return data;
}

async function fetchSchedulesInRange(empId, startDate, endDate) {
  const { data, error } = await supabase
    .from("schedules")
    .select("id, employeeId, date, type, workingHours, actualHours, memo")
    .eq("employeeId", empId)
    .gte("date", startDate)
    .lte("date", endDate);
  if (error) throw new Error(`schedules · ${error.message}`);
  return data ?? [];
}

async function fetchContractsForEmp(empId) {
  const { data, error } = await supabase
    .from("employee_contracts")
    .select("*")
    .eq("employee_id", empId);
  if (error) {
    if (/relation .* does not exist/i.test(error.message)) return [];
    throw new Error(`employee_contracts · ${error.message}`);
  }
  return data ?? [];
}

async function fetchResignationsForEmp(empId) {
  const { data, error } = await supabase
    .from("resignation_requests")
    .select("*")
    .eq("employee_id", empId);
  if (error) {
    if (/relation .* does not exist/i.test(error.message)) return [];
    throw new Error(`resignation_requests · ${error.message}`);
  }
  return data ?? [];
}

async function fetchNotificationsForLeave(leaveId) {
  // notifications 테이블 schema 미확정 → 안전하게 조회 시도
  try {
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .ilike("body", `%${leaveId}%`);
    if (error) {
      if (/relation .* does not exist/i.test(error.message)) return [];
      // body column 없을 수도 있음 → 빈 배열
      return [];
    }
    return data ?? [];
  } catch (_e) {
    return [];
  }
}

async function fetchAllLeaveForEmp(empId) {
  const { data, error } = await supabase
    .from("leave_requests")
    .select("id, employee_id, employee_name, leave_type, start_date, end_date, status, created_at")
    .eq("employee_id", empId);
  if (error) throw new Error(`leave_requests all · ${error.message}`);
  return data ?? [];
}

async function fetchAllScheduleForEmp(empId, limit = 20) {
  const { data, error } = await supabase
    .from("schedules")
    .select("id, employeeId, date, type")
    .eq("employeeId", empId)
    .order("date", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`schedules all · ${error.message}`);
  return data ?? [];
}

function classify({ leaveRow, employeeRow, schedulesInRange, contracts, resignations, allLeaveForEmp, allScheduleForEmp }) {
  // 분류 규칙 (명확한 증거만):
  //   A. 실제 삭제된 과거 직원
  //      · employees row 없음 + 해당 empId 의 다른 활동 (schedules 다수, contracts, resignations) 존재
  //   B. 테스트 데이터
  //      · empId 가 비정상적 값 (ex: 999) + 해당 empId 의 다른 활동 전혀 없음 + 이름 "테스트/test" 류
  //        (단, 이름 패턴 매칭은 참고용 · 자동 처리 X)
  //   C. 잘못된 employee_id
  //      · leave_requests.employee_name 이 실제 다른 employees.name 과 "정확히 일치" 하는 경우만 (유사도 X)
  //   D. 다른 실제 직원으로 명확히 매핑 가능
  //      · 이름 정확 일치 + 날짜 범위 중복 없음 등 추가 증거
  //   E. 판별 불가
  //      · 위 모든 조건 애매

  if (employeeRow) {
    return {
      category: "N/A",
      reasoning: "employee row 존재 · orphan 아님 · 조사 재검증 필요",
    };
  }
  const otherActivity = (schedulesInRange.length + contracts.length + resignations.length + allLeaveForEmp.length + allScheduleForEmp.length);
  const empIdNum = Number(leaveRow.employee_id);
  const isAbnormalId = empIdNum === 999 || empIdNum > 500; // 메가타운 직원수 소규모 가정 (사용자 확인 전제)
  const employeeNameRaw = String(leaveRow.employee_name ?? "").trim();
  const isTestLikeName = /test|테스트|더미|dummy/i.test(employeeNameRaw);

  // 가장 신중한 분류 — 명확한 증거 외에는 E
  if (otherActivity === 0 && isAbnormalId && isTestLikeName) {
    return {
      category: "B. 테스트 데이터",
      reasoning: `empId=${empIdNum} 비정상 + 다른 활동 0건 + 이름 "${employeeNameRaw}" 가 test 패턴. 자동 처리는 금지 · 사용자 확인 필요.`,
    };
  }
  if (otherActivity > 1) {
    return {
      category: "A. 실제 삭제된 과거 직원 (가능성)",
      reasoning: `empId=${empIdNum} 로 다른 활동 ${otherActivity}건 존재 (leave=${allLeaveForEmp.length}, schedule=${allScheduleForEmp.length}, contracts=${contracts.length}, resignation=${resignations.length}). employees 에서는 삭제됨 · hard delete 흔적.`,
    };
  }
  if (empIdNum === 999) {
    return {
      category: "B. 테스트 데이터 (가능성 높음) 또는 E. 판별 불가",
      reasoning: `empId=999 는 메가타운 실제 직원ID 패턴에서 벗어남 · 그러나 명확한 "테스트" 라벨 증거 없음 · 사용자 판단 필요.`,
    };
  }
  return {
    category: "E. 판별 불가",
    reasoning: `empId=${empIdNum} · 다른 활동 ${otherActivity}건 · 명확한 분류 증거 부족. 자동 처리 금지 · 사용자 확인 필요.`,
  };
}

async function investigate(leaveId) {
  console.log(`\n===== 조사 대상: ${leaveId} =====`);
  const leaveRow = await fetchLeaveRequest(leaveId);
  if (!leaveRow) {
    console.log("leave_requests row 없음 (이미 삭제됨)");
    return { leaveId, status: "MISSING" };
  }

  console.log("[leave_requests row]");
  console.log(JSON.stringify(leaveRow, null, 2));

  const empId = Number(leaveRow.employee_id);
  const employeeRow = await fetchEmployee(empId);
  console.log(`\n[employees · id=${empId}]`);
  console.log(employeeRow ? JSON.stringify(employeeRow, null, 2) : "(없음 — hard delete 흔적)");

  const schedulesInRange = await fetchSchedulesInRange(empId, leaveRow.start_date, leaveRow.end_date);
  console.log(`\n[schedules · emp=${empId} · ${leaveRow.start_date}~${leaveRow.end_date}]`);
  console.log(JSON.stringify(schedulesInRange, null, 2));

  const contracts = await fetchContractsForEmp(empId);
  console.log(`\n[employee_contracts · emp=${empId}] · ${contracts.length}건`);
  if (contracts.length) console.log(JSON.stringify(contracts, null, 2));

  const resignations = await fetchResignationsForEmp(empId);
  console.log(`\n[resignation_requests · emp=${empId}] · ${resignations.length}건`);
  if (resignations.length) console.log(JSON.stringify(resignations, null, 2));

  const allLeaveForEmp = await fetchAllLeaveForEmp(empId);
  console.log(`\n[leave_requests · emp=${empId} 전체] · ${allLeaveForEmp.length}건`);
  console.log(JSON.stringify(allLeaveForEmp, null, 2));

  const allScheduleForEmp = await fetchAllScheduleForEmp(empId);
  console.log(`\n[schedules · emp=${empId} 최근 20건]`);
  console.log(JSON.stringify(allScheduleForEmp, null, 2));

  const notifications = await fetchNotificationsForLeave(leaveId);
  console.log(`\n[notifications · leaveId=${leaveId} 포함] · ${notifications.length}건`);
  if (notifications.length) console.log(JSON.stringify(notifications, null, 2));

  const classification = classify({ leaveRow, employeeRow, schedulesInRange, contracts, resignations, allLeaveForEmp, allScheduleForEmp });
  console.log(`\n[분류]`);
  console.log(JSON.stringify(classification, null, 2));

  return {
    leaveId,
    status: "FOUND",
    leaveRow,
    employeeExists: Boolean(employeeRow),
    employeeRow,
    schedulesInRange,
    contracts,
    resignations,
    allLeaveForEmp,
    allScheduleForEmp,
    notifications,
    classification,
  };
}

async function main() {
  console.log("===== SCHEDULE PHASE 1.5 · ORPHAN FORENSIC AUDIT (READ-ONLY) · 2026-10-06 =====");
  const results = [];
  for (const id of ORPHAN_IDS) {
    const r = await investigate(id);
    results.push(r);
  }
  console.log("\n===== 최종 요약 =====");
  for (const r of results) {
    if (r.status === "MISSING") {
      console.log(`  ${r.leaveId} · MISSING (row 없음)`);
    } else {
      console.log(`  ${r.leaveId} · emp=${r.leaveRow.employee_id} · emp_name=${r.leaveRow.employee_name} · ${r.classification.category}`);
      console.log(`     reasoning: ${r.classification.reasoning}`);
    }
  }
  console.log("\n[중요] 자동 처리는 수행하지 않습니다. 사용자 승인 후 명시적 지시 필요.");
}

main().catch(err => {
  console.error("[FATAL]", err?.message ?? err);
  process.exit(1);
});
