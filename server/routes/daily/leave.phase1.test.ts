// 2026-10-06 · PHASE 1 · 연차 승인/삭제 lock 우회 제거 + atomicity 테스트
//
// 테스트 전략:
//   · 실제 supabase/HTTP 를 띄우지 않고, 핵심 서버 로직을 inline shim 으로 재현
//   · lock 검증은 scheduleLock.assertScheduleNotLockedForDates 와 동일한 contract
//   · atomicity 는 "schedule upsert 실패 → leave status 롤백" compensation 패턴을 shim 으로 검증
//
// 커버 시나리오:
//   [L1] lock=true · lv<9 · 승인 시도 → 403 · leave status 변경 안 됨 · schedule write 0
//   [L2] lock=false · lv<9 · 승인 시도 → 성공 · leave status=approved · schedule write>0
//   [L3] lock=true · lv=9 · 승인 시도 → 성공 (bypass) · leave status=approved
//   [A1] schedule upsert 실패 → leave status 롤백 (approved → pending)
//   [A2] 승인 성공 플로우 전체 (lock 통과 + schedule 성공)
//
// 삭제 (DELETE):
//   [D1] lock=true · lv<9 · approved 연차 삭제 시도 → 403 · leave_requests 삭제 안 됨 · schedules 삭제 0
//   [D2] lock=false · lv<9 · approved 연차 삭제 시도 → 성공
//   [D3] lock=true · lv=9 · bypass

import { describe, it, expect } from "vitest";
import { HttpError } from "../../middleware/errorHandler";

// ── scheduleLock shim (실제 라이브러리와 동일 contract) ────────────────────
async function assertScheduleNotLockedForDatesShim(
  dates: string[],
  authLevel: number,
  isLocked: (ym: string) => Promise<boolean>,
): Promise<void> {
  if (authLevel >= 9) return;
  const months = Array.from(new Set(dates.map(d => String(d).slice(0, 7))));
  for (const ym of months) {
    if (await isLocked(ym)) {
      throw new HttpError(
        403,
        "확정된 달은 수정할 수 없습니다. 관리자(lv≥9)만 수정 가능합니다.",
        "SCHEDULE_LOCKED",
      );
    }
  }
}

// ── 연차 승인 서버 로직 shim (routes/daily/leave.ts 와 동일 흐름 핵심만) ─
type LeaveRow = { id: string; employee_id: number; start_date: string; end_date: string; status: "pending" | "approved" | "rejected"; reviewer_note: string | null; reviewed_at: string | null };

function datesBetween(start: string, end: string): string[] {
  const out: string[] = [];
  const s = new Date(start + "T00:00:00Z");
  const e = new Date(end + "T00:00:00Z");
  for (let d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

async function approveLeaveFlow(opts: {
  leave: LeaveRow;
  authLevel: number;
  isLocked: (ym: string) => Promise<boolean>;
  upsertSchedules: (rows: Array<{ employeeId: number; date: string; type: string }>) => Promise<void>;
  updateLeave: (id: string, patch: Partial<LeaveRow>) => Promise<void>;
}) {
  const { leave, authLevel, isLocked, upsertSchedules, updateLeave } = opts;
  const dates = datesBetween(leave.start_date, leave.end_date);

  // 1. lock 사전 검증 (approved 분기만)
  await assertScheduleNotLockedForDatesShim(dates, authLevel, isLocked);

  // 2. leave_requests UPDATE
  await updateLeave(leave.id, { status: "approved", reviewer_note: "", reviewed_at: new Date().toISOString() });

  // 3. schedules UPSERT · 실패 시 compensation (status 롤백)
  try {
    await upsertSchedules(dates.map(date => ({ employeeId: leave.employee_id, date, type: "월차" })));
  } catch (schedErr: any) {
    await updateLeave(leave.id, { status: "pending", reviewer_note: null, reviewed_at: null });
    throw new HttpError(500, `연차는 승인되었으나 스케쥴 반영 실패: ${schedErr?.message ?? schedErr}`);
  }
}

async function deleteLeaveFlow(opts: {
  leave: LeaveRow;
  authLevel: number;
  isAdmin: boolean;
  isLocked: (ym: string) => Promise<boolean>;
  deleteSchedules: (empId: number, start: string, end: string) => Promise<void>;
  deleteLeave: (id: string) => Promise<void>;
}) {
  const { leave, authLevel, isAdmin, isLocked, deleteSchedules, deleteLeave } = opts;
  const wasApproved = leave.status === "approved";
  if (isAdmin && wasApproved) {
    const dates = datesBetween(leave.start_date, leave.end_date);
    await assertScheduleNotLockedForDatesShim(dates, authLevel, isLocked);
  }
  await deleteLeave(leave.id);
  if (isAdmin && wasApproved) {
    await deleteSchedules(leave.employee_id, leave.start_date, leave.end_date);
  }
}

// ══ [LEAVE APPROVE · LOCK] ══════════════════════════════════════════════
describe("[PHASE 1] 연차 승인 · schedule lock 우회 제거", () => {
  const baseLeave: LeaveRow = {
    id: "lv-1",
    employee_id: 1,
    start_date: "2026-10-15",
    end_date: "2026-10-15",
    status: "pending",
    reviewer_note: null,
    reviewed_at: null,
  };

  it("[L1] lock=true · lv5 · 승인 시도 → 403 · leave status 변경 X · schedule write 0", async () => {
    const leave = { ...baseLeave };
    const updates: Array<Partial<LeaveRow>> = [];
    const scheduleRows: any[] = [];
    const err = await approveLeaveFlow({
      leave,
      authLevel: 5,
      isLocked: async (_ym) => true,
      upsertSchedules: async rows => { scheduleRows.push(...rows); },
      updateLeave: async (_id, patch) => { updates.push(patch); Object.assign(leave, patch); },
    }).catch(e => e);
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(403);
    expect((err as HttpError).code).toBe("SCHEDULE_LOCKED");
    expect(updates.length).toBe(0);        // leave update 자체가 실행 안 됨
    expect(scheduleRows.length).toBe(0);   // schedule write 0
    expect(leave.status).toBe("pending");  // 상태 유지
  });

  it("[L2] lock=false · lv5 · 승인 → 성공 · leave=approved · schedule write=1", async () => {
    const leave = { ...baseLeave };
    const scheduleRows: any[] = [];
    await approveLeaveFlow({
      leave,
      authLevel: 5,
      isLocked: async (_ym) => false,
      upsertSchedules: async rows => { scheduleRows.push(...rows); },
      updateLeave: async (_id, patch) => { Object.assign(leave, patch); },
    });
    expect(leave.status).toBe("approved");
    expect(scheduleRows.length).toBe(1);
    expect(scheduleRows[0].type).toBe("월차");
  });

  it("[L3] lock=true · lv=9 bypass → 승인 성공", async () => {
    const leave = { ...baseLeave };
    const scheduleRows: any[] = [];
    await approveLeaveFlow({
      leave,
      authLevel: 9,
      isLocked: async (_ym) => true,
      upsertSchedules: async rows => { scheduleRows.push(...rows); },
      updateLeave: async (_id, patch) => { Object.assign(leave, patch); },
    });
    expect(leave.status).toBe("approved");
    expect(scheduleRows.length).toBe(1);
  });
});

// ══ [LEAVE APPROVE · ATOMICITY (COMPENSATION)] ════════════════════════════
describe("[PHASE 1] 연차 승인 · atomicity · schedule 실패 시 leave 롤백", () => {
  const baseLeave: LeaveRow = {
    id: "lv-2",
    employee_id: 2,
    start_date: "2026-10-20",
    end_date: "2026-10-20",
    status: "pending",
    reviewer_note: null,
    reviewed_at: null,
  };

  it("[A1] schedules upsert 실패 → leave status pending 으로 롤백", async () => {
    const leave = { ...baseLeave };
    const statusHistory: string[] = [];
    const err = await approveLeaveFlow({
      leave,
      authLevel: 5,
      isLocked: async () => false,
      upsertSchedules: async () => { throw new Error("supabase upsert failed"); },
      updateLeave: async (_id, patch) => { Object.assign(leave, patch); statusHistory.push(leave.status); },
    }).catch(e => e);
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(500);
    // 1차: approved, 2차: pending (롤백)
    expect(statusHistory).toEqual(["approved", "pending"]);
    expect(leave.status).toBe("pending");
    expect(leave.reviewed_at).toBeNull();
  });

  it("[A2] schedules upsert 성공 → leave=approved 유지 · 롤백 없음", async () => {
    const leave = { ...baseLeave };
    const statusHistory: string[] = [];
    await approveLeaveFlow({
      leave,
      authLevel: 5,
      isLocked: async () => false,
      upsertSchedules: async () => { /* 성공 */ },
      updateLeave: async (_id, patch) => { Object.assign(leave, patch); statusHistory.push(leave.status); },
    });
    expect(statusHistory).toEqual(["approved"]);
    expect(leave.status).toBe("approved");
  });
});

// ══ [LEAVE DELETE · LOCK] ═════════════════════════════════════════════════
describe("[PHASE 1] 연차 삭제 · 승인된 연차 cleanup · lock 검증", () => {
  const baseApproved: LeaveRow = {
    id: "lv-3",
    employee_id: 3,
    start_date: "2026-10-15",
    end_date: "2026-10-16",
    status: "approved",
    reviewer_note: "",
    reviewed_at: new Date().toISOString(),
  };

  it("[D1] lock=true · lv5 admin · approved 삭제 → 403 · leave 삭제 X · schedules 삭제 X", async () => {
    let leaveDeleted = false;
    let scheduleDeleted = false;
    const err = await deleteLeaveFlow({
      leave: baseApproved,
      authLevel: 5,
      isAdmin: true,
      isLocked: async () => true,
      deleteLeave: async () => { leaveDeleted = true; },
      deleteSchedules: async () => { scheduleDeleted = true; },
    }).catch(e => e);
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(403);
    expect(leaveDeleted).toBe(false);
    expect(scheduleDeleted).toBe(false);
  });

  it("[D2] lock=false · lv5 admin · approved 삭제 → 성공 · 둘 다 삭제", async () => {
    let leaveDeleted = false;
    let scheduleDeleted = false;
    await deleteLeaveFlow({
      leave: baseApproved,
      authLevel: 5,
      isAdmin: true,
      isLocked: async () => false,
      deleteLeave: async () => { leaveDeleted = true; },
      deleteSchedules: async () => { scheduleDeleted = true; },
    });
    expect(leaveDeleted).toBe(true);
    expect(scheduleDeleted).toBe(true);
  });

  it("[D3] lock=true · lv=9 bypass → 성공", async () => {
    let leaveDeleted = false;
    let scheduleDeleted = false;
    await deleteLeaveFlow({
      leave: baseApproved,
      authLevel: 9,
      isAdmin: true,
      isLocked: async () => true,
      deleteLeave: async () => { leaveDeleted = true; },
      deleteSchedules: async () => { scheduleDeleted = true; },
    });
    expect(leaveDeleted).toBe(true);
    expect(scheduleDeleted).toBe(true);
  });
});
