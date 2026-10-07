// 2026-10-07 · PHASE 3D · Shared schedule conflict detector
//   · 순수 함수 · 사이드이펙트 없음 · V1 (SchedulePage) · V2 (schedule-v2) 공용
//   · UI formatting 분리 (호출자가 i18n/스타일 결정)
//
// 1차 대상 conflict kinds (사용자 명시):
//   A. LEAVE_OVERLAP_WORK   : approved leave + working schedule 동일 (employeeId, date)
//                             단 schedule.source_leave_id === leave.id 이면 projection 이므로 conflict X
//   B. (schema UNIQUE 로 overlap 불가 · N/A)
//   C. INVALID_HOURS        : workingHours 문자열이 "HH:MM-HH:MM" 범위를 벗어남
//                             (end<=start · negative · malformed · HH>23 · MM>59 등)
//                             반차는 workingHours 비어도 OK (프리셋 기반) → skip
//   D. ORPHAN_EMPLOYEE      : schedule.employeeId 가 employees 목록에 없음 (레거시 데이터)
//   E. (서버 lock guard 가 차단 · runtime 데이터 상태에서는 발생 X · N/A)
//
// 금지:
//   · "약사 최소 N명" coverage rule (DB settings 미정의 · 임의 숫자 금지)
//   · schema 불가능한 overlap

import { isOffType, isHalfDayType, type HalfDayType, type OffType } from "./offTypes";

export type ConflictKind =
  | "LEAVE_OVERLAP_WORK"
  | "INVALID_HOURS"
  | "ORPHAN_EMPLOYEE";

export interface ScheduleConflict {
  kind: ConflictKind;
  employeeId: number;
  /** YYYY-MM-DD · ORPHAN_EMPLOYEE 는 schedule.date */
  date: string;
  /** 사람이 읽기 쉬운 설명 (한국어 · UI 가 그대로 표시 가능) */
  detail: string;
  /** 디버깅/추적용 · 원본 참조 */
  context?: {
    scheduleType?: string;
    workingHours?: string;
    leaveType?: string;
    leaveId?: string;
    sourceLeaveId?: string | null;
  };
}

/** 최소 shape · caller 의 Schedule / LeaveRequest 와 호환 (중복 import 방지) */
export interface ConflictScheduleRow {
  employeeId: number;
  date: string;
  type: string;
  workingHours?: string | null;
  source_leave_id?: string | null;
}

export interface ConflictLeaveRow {
  id: string;
  employee_id: number;
  leave_type: string;
  start_date: string;
  end_date: string;
  status: string;
}

export interface ConflictEmployeeRow {
  id: number;
  name?: string;
}

export interface DetectConflictsInput {
  schedules: ConflictScheduleRow[];
  leaveRequests: ConflictLeaveRow[];
  employees: ConflictEmployeeRow[];
}

/**
 * approved leave_requests 를 (employee_id, date) 쌍의 Map 으로 전개.
 * - leave_type 과 id 포함.
 * - start_date ~ end_date 범위를 inclusive 로 전개 (DATE 기반 · UTC 안전).
 */
function expandApprovedLeaves(
  leaveRequests: ConflictLeaveRow[],
): Map<string, { leaveId: string; leaveType: string }> {
  const map = new Map<string, { leaveId: string; leaveType: string }>();
  for (const lr of leaveRequests) {
    if (String(lr.status).toLowerCase() !== "approved") continue;
    const start = String(lr.start_date).slice(0, 10);
    const end = String(lr.end_date).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) continue;
    let cur = start;
    const guard = 400; // 1 approved leave 가 1 년 이상이면 비정상 · 안전 상한
    let step = 0;
    while (cur <= end && step < guard) {
      const key = `${lr.employee_id}|${cur}`;
      // 중복 승인 시 가장 먼저 발견한 ID 유지 (경합 상황은 호출측 책임)
      if (!map.has(key)) {
        map.set(key, { leaveId: lr.id, leaveType: String(lr.leave_type ?? "") });
      }
      // next day · UTC safe
      const d = new Date(cur + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() + 1);
      cur = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      step++;
    }
  }
  return map;
}

/**
 * workingHours 문자열 유효성 검증.
 * - 반차 (오전반차/오후반차/반차) 는 workingHours 비어도 OK (프리셋 기반)
 * - OFF (휴무/월차/지정휴무/결근) 는 workingHours 가 있어도 무시 (근무 X)
 * - 그 외 정상 근무 type: workingHours 가 "HH:MM-HH:MM" 또는 "HH:MM~HH:MM" 포맷 & end > start
 */
function detectInvalidHours(row: ConflictScheduleRow): string | null {
  if (!row.type) return null;
  if (isOffType(row.type)) return null;        // OFF: 시간 무시
  if (isHalfDayType(row.type)) return null;    // 반차: 비어 있어도 OK · 포맷 검증 skip
  const wh = String(row.workingHours ?? "").trim();
  if (!wh) {
    // 정상 근무 type 인데 workingHours 비어 있음 → malformed
    return "근무시간 비어 있음";
  }
  const m = wh.match(/^(\d{1,2}):(\d{2})\s*[-~]\s*(\d{1,2}):(\d{2})$/);
  if (!m) return `근무시간 포맷 오류 ("${wh}" · 기대: "HH:MM-HH:MM")`;
  const sh = parseInt(m[1], 10), sm = parseInt(m[2], 10);
  const eh = parseInt(m[3], 10), em = parseInt(m[4], 10);
  if (sh > 23 || sm > 59 || eh > 24 || em > 59) {
    return `근무시간 범위 오류 ("${wh}")`;
  }
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  if (endMin <= startMin) {
    return `근무시간 종료 ≤ 시작 ("${wh}" · 교차 자정은 현재 미지원)`;
  }
  return null;
}

/**
 * 전체 conflict 집합 반환.
 * - 호출 측에서 kind 별로 필터/UI 표시
 * - 정렬: employeeId → date → kind
 */
export function detectConflicts(input: DetectConflictsInput): ScheduleConflict[] {
  const employeeSet = new Set<number>((input.employees ?? []).map(e => Number(e.id)));
  const employeeNameMap = new Map<number, string>();
  for (const e of (input.employees ?? [])) {
    if (e.name) employeeNameMap.set(Number(e.id), String(e.name));
  }
  const approvedLeaveMap = expandApprovedLeaves(input.leaveRequests ?? []);
  const out: ScheduleConflict[] = [];

  for (const sched of (input.schedules ?? [])) {
    const empId = Number(sched.employeeId);
    const dateStr = String(sched.date).slice(0, 10);
    if (!Number.isFinite(empId) || empId <= 0) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;

    // D. ORPHAN_EMPLOYEE
    if (!employeeSet.has(empId)) {
      out.push({
        kind: "ORPHAN_EMPLOYEE",
        employeeId: empId,
        date: dateStr,
        detail: `직원 ID ${empId} 가 현재 직원 목록에 없습니다 (레거시 데이터)`,
        context: { scheduleType: sched.type },
      });
      // orphan 은 다른 conflict 추적 skip (employee 존재 전제)
      continue;
    }

    // A. LEAVE_OVERLAP_WORK
    //    schedule.source_leave_id 가 있으면 projection → 매칭되는 leave 와 동일성 체크 후 skip
    const leaveMatch = approvedLeaveMap.get(`${empId}|${dateStr}`);
    if (leaveMatch) {
      const schedIsOff = isOffType(sched.type);
      const schedIsHalf = isHalfDayType(sched.type);
      const isSameProvenance = sched.source_leave_id && sched.source_leave_id === leaveMatch.leaveId;
      if (!schedIsOff && !schedIsHalf && !isSameProvenance) {
        // approved leave 가 있는데 schedule 은 정상 근무로 표시됨 → 실제 conflict
        out.push({
          kind: "LEAVE_OVERLAP_WORK",
          employeeId: empId,
          date: dateStr,
          detail: `승인된 연차(${leaveMatch.leaveType}) 가 있는데 근무(${sched.type}) 로 지정됨`,
          context: {
            scheduleType: sched.type,
            workingHours: String(sched.workingHours ?? ""),
            leaveType: leaveMatch.leaveType,
            leaveId: leaveMatch.leaveId,
            sourceLeaveId: sched.source_leave_id ?? null,
          },
        });
      }
    }

    // C. INVALID_HOURS
    const invalid = detectInvalidHours(sched);
    if (invalid) {
      out.push({
        kind: "INVALID_HOURS",
        employeeId: empId,
        date: dateStr,
        detail: invalid,
        context: { scheduleType: sched.type, workingHours: String(sched.workingHours ?? "") },
      });
    }
  }

  // 정렬: employeeId asc → date asc → kind asc
  out.sort((a, b) => {
    if (a.employeeId !== b.employeeId) return a.employeeId - b.employeeId;
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0;
  });
  return out;
}

/** convenience: 특정 (employeeId, date) 에 대해 conflict 가 있는지 즉시 조회 */
export function hasConflictAt(
  conflicts: ScheduleConflict[],
  employeeId: number,
  date: string,
): boolean {
  const d = String(date).slice(0, 10);
  return conflicts.some(c => c.employeeId === employeeId && c.date === d);
}

/** convenience: UI badge 등에서 사용 */
export function conflictCount(conflicts: ScheduleConflict[], kind?: ConflictKind): number {
  if (!kind) return conflicts.length;
  return conflicts.filter(c => c.kind === kind).length;
}

/** Re-export OFF/half types · V2 가 중복 import 하지 않도록 */
export type { OffType, HalfDayType };
