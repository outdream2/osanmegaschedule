// 2026-10-06 · PHASE 1.5 · RPC canonical path · atomic approve_leave_request 테스트
//
// 테스트 전략:
//   · Supabase RPC 호출 자체를 inline shim 으로 재현
//   · RPC 내부 PL/pgSQL semantics 를 TypeScript 함수로 모사
//     - leave row lock + status pending 검증
//     - 월별 lock 검증 (p_bypass_lock=false 일 때)
//     - leave_requests UPDATE
//     - schedules UPSERT (source_leave_id 포함)
//     - 어느 단계 실패 시 전체 롤백 (in-memory rollback)
//
// 커버 시나리오:
//   [A] unlocked month approval → leave approved + schedule rows 생성 (source_leave_id 세팅)
//   [B] locked month · bypass=false (manager lv5) → 전체 실패 · leave previous status · schedule 변화 없음
//   [C] schedule insert 강제 실패 → leave 변화 없음 (RPC 전체 롤백)
//   [D] invalid request_id → 전체 실패
//   [E] multi-day leave → 모든 schedule 생성 또는 0 (부분 생성 금지)
//   [F] lv≥9 bypass_lock=true · locked month → 승인 성공
//   [G] already approved (idempotency) → LEAVE_NOT_PENDING 에러
//
// 참고:
//   · 실제 DB 적용 전 코드만 작성 · 사용자 승인 후 Supabase SQL Editor 적용
//   · 이 shim 은 migrations/schedule_phase_1_approve_leave_rpc_2026-10-06.sql 의 contract 와 1:1 매칭

import { describe, it, expect } from "vitest";

// ── 타입 ─────────────────────────────────────────────────────────────────────
type LeaveRow = {
  id: string;
  employee_id: number;
  leave_type: string;
  start_date: string;
  end_date: string;
  status: "pending" | "approved" | "rejected";
  reviewer_note: string;
  reviewed_at: string | null;
};
type ScheduleRow = {
  employeeId: number;
  date: string;
  type: string;
  workingHours: string;
  actualHours: string;
  memo: string;
  source_leave_id: string | null;
};
type RpcError = { message: string };
type RpcResult = { data: any; error: RpcError | null };

// ── 전역 메모리 DB · 각 test case 가 새 instance 생성 ───────────────────────────
function makeDb() {
  const leaves = new Map<string, LeaveRow>();
  const schedules = new Map<string, ScheduleRow>(); // key = `${empId}:${date}`
  const locks = new Map<string, boolean>();
  const key = (empId: number, date: string) => `${empId}:${date}`;
  return { leaves, schedules, locks, key };
}
type Db = ReturnType<typeof makeDb>;

// ── 날짜 범위 전개 ──────────────────────────────────────────────────────────────
function datesBetween(start: string, end: string): string[] {
  const out: string[] = [];
  const s = new Date(start + "T00:00:00Z");
  const e = new Date(end + "T00:00:00Z");
  for (let d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

// ── RPC shim · approve_leave_request PL/pgSQL 과 동일 contract ────────────────
// 옵션: schedulesUpsertFailOn = { date: string } → 특정 날짜 upsert 시 강제 실패 (atomicity 테스트)
async function approveLeaveRequestRpc(
  db: Db,
  params: {
    p_request_id: string;
    p_reviewer_id: number;
    p_reviewer_note: string;
    p_bypass_lock: boolean;
  },
  failInjection?: { scheduleUpsertFailOnDate?: string },
): Promise<RpcResult> {
  // 트랜잭션 snapshot (롤백용)
  const snapshotLeave = db.leaves.get(params.p_request_id);
  const leaveBefore = snapshotLeave ? { ...snapshotLeave } : null;
  const schedulesBefore: Array<[string, ScheduleRow | undefined]> = [];
  try {
    // 1. SELECT FOR UPDATE
    const leave = db.leaves.get(params.p_request_id);
    if (!leave) {
      return { data: null, error: { message: "LEAVE_NOT_FOUND: leave request not found" } };
    }
    // 2. pending guard
    if (leave.status !== "pending") {
      return { data: null, error: { message: `LEAVE_NOT_PENDING: current status is ${leave.status}` } };
    }
    // 3. 월 lock 재검증
    const dates = datesBetween(leave.start_date, leave.end_date);
    if (params.p_bypass_lock === false) {
      for (const d of dates) {
        const ym = d.slice(0, 7);
        if (db.locks.get(ym) === true) {
          return { data: null, error: { message: `SCHEDULE_LOCKED: month ${ym} is locked` } };
        }
      }
    }
    // 4. schedule type 결정
    const scheduleType = ["오전반차", "오후반차"].includes(leave.leave_type) ? leave.leave_type : "월차";
    const memo = `연차 승인 (${leave.leave_type})`;
    // 5. leave UPDATE
    const updatedLeave: LeaveRow = {
      ...leave,
      status: "approved",
      reviewer_note: params.p_reviewer_note ?? "",
      reviewed_at: new Date().toISOString(),
    };
    db.leaves.set(leave.id, updatedLeave);

    // 6. schedules UPSERT
    for (const d of dates) {
      if (failInjection?.scheduleUpsertFailOnDate === d) {
        // 강제 실패 → 전체 롤백
        throw new Error(`forced upsert failure on ${d}`);
      }
      const k = db.key(leave.employee_id, d);
      schedulesBefore.push([k, db.schedules.get(k)]);
      db.schedules.set(k, {
        employeeId: leave.employee_id,
        date: d,
        type: scheduleType,
        workingHours: "",
        actualHours: "",
        memo,
        source_leave_id: leave.id,
      });
    }

    return {
      data: {
        request_id: leave.id,
        employee_id: leave.employee_id,
        schedule_type: scheduleType,
        dates_count: dates.length,
        reviewer_id: params.p_reviewer_id,
      },
      error: null,
    };
  } catch (err: any) {
    // ROLLBACK · snapshot 복원
    if (leaveBefore) db.leaves.set(params.p_request_id, leaveBefore);
    else db.leaves.delete(params.p_request_id);
    for (const [k, prev] of schedulesBefore) {
      if (prev) db.schedules.set(k, prev);
      else db.schedules.delete(k);
    }
    return { data: null, error: { message: `UNEXPECTED: ${err?.message ?? err}` } };
  }
}

// ══ [A] unlocked · lv5 승인 → approved · schedules 생성 (source_leave_id) ═════
describe("[PHASE 1.5] approve_leave_request RPC · atomic approve", () => {
  it("[A] unlocked · lv5 · 승인 → leave=approved + schedules 생성 + source_leave_id=request_id", async () => {
    const db = makeDb();
    db.leaves.set("lv-A", {
      id: "lv-A",
      employee_id: 7,
      leave_type: "연차",
      start_date: "2026-10-15",
      end_date: "2026-10-15",
      status: "pending",
      reviewer_note: "",
      reviewed_at: null,
    });
    const r = await approveLeaveRequestRpc(db, {
      p_request_id: "lv-A",
      p_reviewer_id: 99,
      p_reviewer_note: "ok",
      p_bypass_lock: false,
    });
    expect(r.error).toBeNull();
    expect(db.leaves.get("lv-A")!.status).toBe("approved");
    const sched = db.schedules.get(db.key(7, "2026-10-15"));
    expect(sched).toBeDefined();
    expect(sched!.type).toBe("월차");
    expect(sched!.source_leave_id).toBe("lv-A");
  });

  it("[B] locked month · bypass=false (lv5) → SCHEDULE_LOCKED · leave 상태 유지 · schedule 변화 없음", async () => {
    const db = makeDb();
    db.locks.set("2026-10", true);
    db.leaves.set("lv-B", {
      id: "lv-B",
      employee_id: 7,
      leave_type: "연차",
      start_date: "2026-10-15",
      end_date: "2026-10-15",
      status: "pending",
      reviewer_note: "",
      reviewed_at: null,
    });
    const r = await approveLeaveRequestRpc(db, {
      p_request_id: "lv-B",
      p_reviewer_id: 99,
      p_reviewer_note: "ok",
      p_bypass_lock: false,
    });
    expect(r.error?.message).toMatch(/SCHEDULE_LOCKED/);
    expect(db.leaves.get("lv-B")!.status).toBe("pending");
    expect(db.schedules.size).toBe(0);
  });

  it("[C] schedule upsert 실패 → RPC 전체 롤백 · leave=pending · schedule 변화 없음", async () => {
    const db = makeDb();
    db.leaves.set("lv-C", {
      id: "lv-C",
      employee_id: 7,
      leave_type: "연차",
      start_date: "2026-10-15",
      end_date: "2026-10-17",
      status: "pending",
      reviewer_note: "",
      reviewed_at: null,
    });
    const r = await approveLeaveRequestRpc(
      db,
      {
        p_request_id: "lv-C",
        p_reviewer_id: 99,
        p_reviewer_note: "ok",
        p_bypass_lock: false,
      },
      { scheduleUpsertFailOnDate: "2026-10-16" },
    );
    expect(r.error?.message).toMatch(/UNEXPECTED|forced upsert failure/);
    expect(db.leaves.get("lv-C")!.status).toBe("pending");
    expect(db.schedules.size).toBe(0); // 2026-10-15 는 1회 성공했지만 롤백으로 복원
  });

  it("[D] invalid request_id → LEAVE_NOT_FOUND · 전체 실패", async () => {
    const db = makeDb();
    const r = await approveLeaveRequestRpc(db, {
      p_request_id: "lv-missing",
      p_reviewer_id: 99,
      p_reviewer_note: "",
      p_bypass_lock: false,
    });
    expect(r.error?.message).toMatch(/LEAVE_NOT_FOUND/);
    expect(db.leaves.size).toBe(0);
    expect(db.schedules.size).toBe(0);
  });

  it("[E] multi-day leave (3일) · 모든 schedule 생성 · source_leave_id 동일", async () => {
    const db = makeDb();
    db.leaves.set("lv-E", {
      id: "lv-E",
      employee_id: 7,
      leave_type: "연차",
      start_date: "2026-10-15",
      end_date: "2026-10-17",
      status: "pending",
      reviewer_note: "",
      reviewed_at: null,
    });
    const r = await approveLeaveRequestRpc(db, {
      p_request_id: "lv-E",
      p_reviewer_id: 99,
      p_reviewer_note: "",
      p_bypass_lock: false,
    });
    expect(r.error).toBeNull();
    expect(db.schedules.size).toBe(3);
    const ids = Array.from(db.schedules.values()).map(s => s.source_leave_id);
    expect(new Set(ids).size).toBe(1);
    expect(ids[0]).toBe("lv-E");
  });

  it("[F] lv≥9 bypass_lock=true · locked month → 승인 성공", async () => {
    const db = makeDb();
    db.locks.set("2026-10", true);
    db.leaves.set("lv-F", {
      id: "lv-F",
      employee_id: 7,
      leave_type: "오전반차",
      start_date: "2026-10-15",
      end_date: "2026-10-15",
      status: "pending",
      reviewer_note: "",
      reviewed_at: null,
    });
    const r = await approveLeaveRequestRpc(db, {
      p_request_id: "lv-F",
      p_reviewer_id: 99,
      p_reviewer_note: "",
      p_bypass_lock: true,
    });
    expect(r.error).toBeNull();
    expect(db.leaves.get("lv-F")!.status).toBe("approved");
    const sched = db.schedules.get(db.key(7, "2026-10-15"));
    expect(sched!.type).toBe("오전반차");
    expect(sched!.source_leave_id).toBe("lv-F");
  });

  it("[G] 이미 approved · 재호출 → LEAVE_NOT_PENDING · 변화 없음 (idempotency)", async () => {
    const db = makeDb();
    db.leaves.set("lv-G", {
      id: "lv-G",
      employee_id: 7,
      leave_type: "연차",
      start_date: "2026-10-15",
      end_date: "2026-10-15",
      status: "approved",
      reviewer_note: "prev",
      reviewed_at: "2026-10-05T00:00:00Z",
    });
    const r = await approveLeaveRequestRpc(db, {
      p_request_id: "lv-G",
      p_reviewer_id: 99,
      p_reviewer_note: "",
      p_bypass_lock: false,
    });
    expect(r.error?.message).toMatch(/LEAVE_NOT_PENDING/);
    expect(db.leaves.get("lv-G")!.status).toBe("approved");
    expect(db.leaves.get("lv-G")!.reviewer_note).toBe("prev");
  });
});

// ══ [COPY LOCK] POST /api/schedules/copy · target month lock ═══════════════════
// 라우터 로직 inline shim (routes/schedule/schedules.ts 의 copy 라우트 핵심)
async function copyRouteGuard(
  authLevel: number,
  targetYear: number,
  targetMonth: number,
  isLocked: (ym: string) => Promise<boolean>,
): Promise<{ error?: string } | null> {
  if (authLevel >= 9) return null;
  const ym = `${targetYear}-${String(targetMonth).padStart(2, "0")}`;
  if (await isLocked(ym)) {
    return { error: "SCHEDULE_LOCKED" };
  }
  return null;
}

describe("[PHASE 1.5] POST /api/schedules/copy · target month lock", () => {
  it("[COPY-1] unlocked target → copy 성공 (guard 통과)", async () => {
    const r = await copyRouteGuard(5, 2026, 11, async () => false);
    expect(r).toBeNull();
  });

  it("[COPY-2] locked target + lv5 → 403 (SCHEDULE_LOCKED)", async () => {
    const r = await copyRouteGuard(5, 2026, 11, async () => true);
    expect(r?.error).toBe("SCHEDULE_LOCKED");
  });

  it("[COPY-3] locked target + lv9 → bypass 성공", async () => {
    const r = await copyRouteGuard(9, 2026, 11, async () => true);
    expect(r).toBeNull();
  });
});

// ══ [DELETE PROVENANCE] source_leave_id 기반 cleanup · 레거시 폴백 ═══════════
// 핵심 분기: provenance 매칭 1건+ → source_leave_id 삭제만, 0건 → legacy 매칭
async function deleteSchedulesCleanupShim(
  db: Db,
  leaveId: string,
  empId: number,
  startDate: string,
  endDate: string,
): Promise<{ provenanceDeleted: number; legacyDeleted: number }> {
  // 1. provenance 매칭
  const provKeys: string[] = [];
  for (const [k, v] of db.schedules.entries()) {
    if (v.source_leave_id === leaveId) provKeys.push(k);
  }
  if (provKeys.length > 0) {
    for (const k of provKeys) db.schedules.delete(k);
    return { provenanceDeleted: provKeys.length, legacyDeleted: 0 };
  }
  // 2. legacy (source_leave_id = NULL) 매칭
  const legacyKeys: string[] = [];
  for (const [k, v] of db.schedules.entries()) {
    if (v.employeeId !== empId) continue;
    if (v.source_leave_id !== null) continue;
    if (!["월차", "오전반차", "오후반차"].includes(v.type)) continue;
    if (v.date < startDate || v.date > endDate) continue;
    legacyKeys.push(k);
  }
  for (const k of legacyKeys) db.schedules.delete(k);
  return { provenanceDeleted: 0, legacyDeleted: legacyKeys.length };
}

describe("[PHASE 1.5] leave cancel · provenance 기반 schedule cleanup", () => {
  it("[DEL-1] source_leave_id 매칭 schedule 만 삭제 · 수동 schedule 보존", async () => {
    const db = makeDb();
    // provenance 매칭 (연차 승인본)
    db.schedules.set(db.key(7, "2026-10-15"), {
      employeeId: 7, date: "2026-10-15", type: "월차",
      workingHours: "", actualHours: "", memo: "", source_leave_id: "lv-X",
    });
    // 수동 schedule (source_leave_id=null · 같은 날짜 · 다른 직원)
    db.schedules.set(db.key(8, "2026-10-15"), {
      employeeId: 8, date: "2026-10-15", type: "월차",
      workingHours: "", actualHours: "", memo: "", source_leave_id: null,
    });
    // 사용자가 승인 후 수동 변경한 schedule (type=오픈)
    db.schedules.set(db.key(7, "2026-10-16"), {
      employeeId: 7, date: "2026-10-16", type: "오픈",
      workingHours: "", actualHours: "", memo: "", source_leave_id: "lv-X",
    });

    const r = await deleteSchedulesCleanupShim(db, "lv-X", 7, "2026-10-15", "2026-10-16");
    expect(r.provenanceDeleted).toBe(2); // 두 provenance 매칭 모두 삭제
    expect(r.legacyDeleted).toBe(0);
    expect(db.schedules.has(db.key(8, "2026-10-15"))).toBe(true); // 수동 schedule 보존
  });

  it("[DEL-2] provenance 매칭 0 · 레거시 데이터 → (empId, date, type) 매칭으로 fallback", async () => {
    const db = makeDb();
    // 레거시 (source_leave_id=null · PHASE 1.5 적용 전 승인된 데이터)
    db.schedules.set(db.key(7, "2026-10-15"), {
      employeeId: 7, date: "2026-10-15", type: "월차",
      workingHours: "", actualHours: "", memo: "연차 승인", source_leave_id: null,
    });
    const r = await deleteSchedulesCleanupShim(db, "lv-Y", 7, "2026-10-15", "2026-10-15");
    expect(r.provenanceDeleted).toBe(0);
    expect(r.legacyDeleted).toBe(1);
  });

  it("[DEL-3] 사용자가 승인 후 다른 type (오픈) 으로 수동 변경 · source_leave_id=null (조건 가정) → 자동 skip", async () => {
    const db = makeDb();
    // 사용자가 수동 변경 (type=오픈 · source_leave_id=null · 승인된 월차와 분리)
    db.schedules.set(db.key(7, "2026-10-15"), {
      employeeId: 7, date: "2026-10-15", type: "오픈",
      workingHours: "", actualHours: "", memo: "수동", source_leave_id: null,
    });
    const r = await deleteSchedulesCleanupShim(db, "lv-Z", 7, "2026-10-15", "2026-10-15");
    expect(r.provenanceDeleted).toBe(0);
    expect(r.legacyDeleted).toBe(0); // 오픈 type 은 legacy 매칭 범위 밖
    expect(db.schedules.size).toBe(1);
  });
});
