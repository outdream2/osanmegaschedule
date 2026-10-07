// 2026-10-07 · PHASE 3D · Shared conflict detector 단위 테스트
//   · 1차 대상 5 종 중 유효한 3 종 검증 (LEAVE_OVERLAP_WORK / INVALID_HOURS / ORPHAN_EMPLOYEE)
//   · B (same emp overlap) · E (locked write) 는 schema/runtime 에서 불가능 · N/A

import { describe, it, expect } from "vitest";
import {
  detectConflicts,
  conflictCount,
  hasConflictAt,
  type ConflictScheduleRow,
  type ConflictLeaveRow,
  type ConflictEmployeeRow,
} from "./conflicts";

const EMP: ConflictEmployeeRow[] = [
  { id: 1, name: "홍길동" },
  { id: 2, name: "김약사" },
];

describe("[Phase 3D] detectConflicts · LEAVE_OVERLAP_WORK", () => {
  it("approved leave 와 근무(오픈) 동시 → 1 conflict", () => {
    const schedules: ConflictScheduleRow[] = [
      { employeeId: 1, date: "2026-10-10", type: "오픈", workingHours: "09:30-18:30" },
    ];
    const leaves: ConflictLeaveRow[] = [
      { id: "L1", employee_id: 1, leave_type: "연차", start_date: "2026-10-10", end_date: "2026-10-10", status: "approved" },
    ];
    const out = detectConflicts({ schedules, leaveRequests: leaves, employees: EMP });
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("LEAVE_OVERLAP_WORK");
    expect(out[0].employeeId).toBe(1);
    expect(out[0].date).toBe("2026-10-10");
  });

  it("approved leave 와 schedule.source_leave_id 매칭 (projection) → conflict 없음", () => {
    const schedules: ConflictScheduleRow[] = [
      { employeeId: 1, date: "2026-10-10", type: "월차", workingHours: "", source_leave_id: "L1" },
    ];
    const leaves: ConflictLeaveRow[] = [
      { id: "L1", employee_id: 1, leave_type: "연차", start_date: "2026-10-10", end_date: "2026-10-10", status: "approved" },
    ];
    expect(detectConflicts({ schedules, leaveRequests: leaves, employees: EMP })).toHaveLength(0);
  });

  it("pending leave 는 conflict X · approved 상태만 트리거", () => {
    const schedules: ConflictScheduleRow[] = [
      { employeeId: 1, date: "2026-10-10", type: "오픈", workingHours: "09:30-18:30" },
    ];
    const leaves: ConflictLeaveRow[] = [
      { id: "L1", employee_id: 1, leave_type: "연차", start_date: "2026-10-10", end_date: "2026-10-10", status: "pending" },
    ];
    expect(detectConflicts({ schedules, leaveRequests: leaves, employees: EMP })).toHaveLength(0);
  });

  it("approved leave 와 schedule.type=휴무 (OFF) → projection 간주 · conflict 없음", () => {
    const schedules: ConflictScheduleRow[] = [
      { employeeId: 1, date: "2026-10-10", type: "휴무", workingHours: "" },
    ];
    const leaves: ConflictLeaveRow[] = [
      { id: "L1", employee_id: 1, leave_type: "연차", start_date: "2026-10-10", end_date: "2026-10-10", status: "approved" },
    ];
    expect(detectConflicts({ schedules, leaveRequests: leaves, employees: EMP })).toHaveLength(0);
  });

  it("approved leave 범위 (3일) 전개 · 중간날 근무 지정 → 1 conflict", () => {
    const schedules: ConflictScheduleRow[] = [
      { employeeId: 1, date: "2026-10-11", type: "오픈", workingHours: "09:30-18:30" },
    ];
    const leaves: ConflictLeaveRow[] = [
      { id: "L1", employee_id: 1, leave_type: "연차", start_date: "2026-10-10", end_date: "2026-10-12", status: "approved" },
    ];
    const out = detectConflicts({ schedules, leaveRequests: leaves, employees: EMP });
    expect(out).toHaveLength(1);
    expect(out[0].date).toBe("2026-10-11");
  });
});

describe("[Phase 3D] detectConflicts · INVALID_HOURS", () => {
  it("정상 범위 (09:30-18:30) · conflict 없음", () => {
    const schedules: ConflictScheduleRow[] = [
      { employeeId: 1, date: "2026-10-10", type: "오픈", workingHours: "09:30-18:30" },
    ];
    expect(detectConflicts({ schedules, leaveRequests: [], employees: EMP })).toHaveLength(0);
  });

  it("end <= start → INVALID_HOURS", () => {
    const schedules: ConflictScheduleRow[] = [
      { employeeId: 1, date: "2026-10-10", type: "오픈", workingHours: "18:30-09:30" },
    ];
    const out = detectConflicts({ schedules, leaveRequests: [], employees: EMP });
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("INVALID_HOURS");
    expect(out[0].detail).toContain("종료 ≤ 시작");
  });

  it("포맷 오류 → INVALID_HOURS", () => {
    const schedules: ConflictScheduleRow[] = [
      { employeeId: 1, date: "2026-10-10", type: "오픈", workingHours: "nine to five" },
    ];
    const out = detectConflicts({ schedules, leaveRequests: [], employees: EMP });
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("INVALID_HOURS");
    expect(out[0].detail).toContain("포맷 오류");
  });

  it("빈 workingHours · 근무 type → INVALID_HOURS", () => {
    const schedules: ConflictScheduleRow[] = [
      { employeeId: 1, date: "2026-10-10", type: "오픈", workingHours: "" },
    ];
    const out = detectConflicts({ schedules, leaveRequests: [], employees: EMP });
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("INVALID_HOURS");
    expect(out[0].detail).toContain("비어 있음");
  });

  it("반차 (오전반차) · workingHours 비어도 OK · conflict 없음", () => {
    const schedules: ConflictScheduleRow[] = [
      { employeeId: 1, date: "2026-10-10", type: "오전반차", workingHours: "" },
    ];
    expect(detectConflicts({ schedules, leaveRequests: [], employees: EMP })).toHaveLength(0);
  });

  it("OFF (휴무) · workingHours 유무 무관 · conflict 없음", () => {
    const schedules: ConflictScheduleRow[] = [
      { employeeId: 1, date: "2026-10-10", type: "휴무", workingHours: "" },
      { employeeId: 2, date: "2026-10-10", type: "지정휴무", workingHours: "" },
    ];
    expect(detectConflicts({ schedules, leaveRequests: [], employees: EMP })).toHaveLength(0);
  });

  it("hour >23 → INVALID_HOURS", () => {
    const schedules: ConflictScheduleRow[] = [
      { employeeId: 1, date: "2026-10-10", type: "오픈", workingHours: "25:00-26:00" },
    ];
    const out = detectConflicts({ schedules, leaveRequests: [], employees: EMP });
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("INVALID_HOURS");
    expect(out[0].detail).toContain("범위 오류");
  });
});

describe("[Phase 3D] detectConflicts · ORPHAN_EMPLOYEE", () => {
  it("employees 에 없는 ID 가 schedules 에 등장 → ORPHAN_EMPLOYEE", () => {
    const schedules: ConflictScheduleRow[] = [
      { employeeId: 999, date: "2026-10-10", type: "오픈", workingHours: "09:30-18:30" },
    ];
    const out = detectConflicts({ schedules, leaveRequests: [], employees: EMP });
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("ORPHAN_EMPLOYEE");
    expect(out[0].employeeId).toBe(999);
    // orphan 은 추가 conflict 검출 skip (employee 존재 전제)
  });

  it("employees 에 있는 ID 는 orphan 아님", () => {
    const schedules: ConflictScheduleRow[] = [
      { employeeId: 1, date: "2026-10-10", type: "휴무", workingHours: "" },
    ];
    expect(detectConflicts({ schedules, leaveRequests: [], employees: EMP })).toHaveLength(0);
  });
});

describe("[Phase 3D] detectConflicts · 결과 정렬", () => {
  it("employeeId asc → date asc", () => {
    const schedules: ConflictScheduleRow[] = [
      { employeeId: 2, date: "2026-10-11", type: "오픈", workingHours: "" }, // INVALID
      { employeeId: 1, date: "2026-10-10", type: "오픈", workingHours: "" }, // INVALID
      { employeeId: 1, date: "2026-10-05", type: "오픈", workingHours: "" }, // INVALID
    ];
    const out = detectConflicts({ schedules, leaveRequests: [], employees: EMP });
    expect(out.map(c => `${c.employeeId}|${c.date}`)).toEqual([
      "1|2026-10-05",
      "1|2026-10-10",
      "2|2026-10-11",
    ]);
  });
});

describe("[Phase 3D] convenience helpers", () => {
  it("conflictCount · kind 필터", () => {
    const schedules: ConflictScheduleRow[] = [
      { employeeId: 999, date: "2026-10-10", type: "오픈", workingHours: "" }, // ORPHAN
      { employeeId: 1, date: "2026-10-10", type: "오픈", workingHours: "25:00-26:00" }, // INVALID
    ];
    const out = detectConflicts({ schedules, leaveRequests: [], employees: EMP });
    expect(conflictCount(out)).toBe(2);
    expect(conflictCount(out, "ORPHAN_EMPLOYEE")).toBe(1);
    expect(conflictCount(out, "INVALID_HOURS")).toBe(1);
    expect(conflictCount(out, "LEAVE_OVERLAP_WORK")).toBe(0);
  });

  it("hasConflictAt · 특정 (empId,date) 조회", () => {
    const schedules: ConflictScheduleRow[] = [
      { employeeId: 1, date: "2026-10-10", type: "오픈", workingHours: "" },
    ];
    const out = detectConflicts({ schedules, leaveRequests: [], employees: EMP });
    expect(hasConflictAt(out, 1, "2026-10-10")).toBe(true);
    expect(hasConflictAt(out, 1, "2026-10-11")).toBe(false);
    expect(hasConflictAt(out, 2, "2026-10-10")).toBe(false);
  });
});
