// 2026-08-16 · asyncHandler + HttpError 프레임워크 적용
// 2026-10-06 · 방문예약 담당자 FK 전환 (#VisitorReservationEmployeeAssignment)
//   · resigned_at 컬럼 bug fix · 실제 컬럼 "retireDate" 로 교정
//   · 하드코드 RESERVATION_RANKS/env STAFF_IDS 제거 · settings.visitorReservation.assigneeEmployeeIds 로 전환
//   · 공통 OFF_TYPES helper (shared/schedule/offTypes) · 중복 배열 제거
import { Router } from "express";
import { supabase } from "../../../src/supabase/client";
import { asyncHandler } from "../../middleware/asyncHandler";
import { badRequest, HttpError } from "../../middleware/errorHandler";
// 2026-10-13 · 보안 fix S-2 · authorize(1) · 직원 스케줄 조회 vendor(level=0) 차단
import { authorize } from "../../middleware/requireAuth";
import { isOffType } from "../../../src/shared/schedule/offTypes";

const router = Router();

const SETTINGS_KEY = "all_settings";

/** 재직 중 담당자 로드 · settings.visitorReservation.assigneeEmployeeIds 기준 · 퇴직자 (retireDate IS NOT NULL) 제외 · 담당자 ID 순서 보존 */
async function loadReservationStaffList(): Promise<Array<{ id: number; name: string; rank: string | null }>> {
  // 1. settings 조회
  const { data: settingsRow } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", SETTINGS_KEY)
    .maybeSingle();
  const value = (settingsRow?.value ?? {}) as Record<string, unknown>;
  const vrSetting = (value.visitorReservation ?? {}) as { assigneeEmployeeIds?: unknown };
  const idsRaw = Array.isArray(vrSetting.assigneeEmployeeIds) ? vrSetting.assigneeEmployeeIds : [];
  const ids: number[] = (idsRaw as unknown[])
    .map(v => Number(v))
    .filter(v => Number.isInteger(v) && v > 0);
  if (ids.length === 0) return [];

  // 2. employees 조회 · retireDate IS NULL (재직자) · camelCase 컬럼 (실제 DB)
  const { data, error } = await supabase
    .from("employees")
    .select('id, name, rank, "retireDate"')
    .in("id", ids)
    .is("retireDate", null);
  if (error) {
    // 2026-10-06 · retireDate 컬럼 없을 수도 (스키마 마이그 안 된 환경) → 다시 조회 (filter 제거)
    if (/column|does not exist/i.test(error.message)) {
      const { data: data2, error: e2 } = await supabase
        .from("employees")
        .select("id, name, rank")
        .in("id", ids);
      if (e2) return [];
      const rows2 = (data2 ?? []) as Array<{ id: number; name: string; rank: string | null }>;
      return ids
        .map(id => rows2.find(r => r.id === id))
        .filter((r): r is { id: number; name: string; rank: string | null } => Boolean(r));
    }
    return [];
  }
  const rows = (data ?? []) as Array<{ id: number; name: string; rank: string | null }>;
  // 설정 순서 유지
  return ids
    .map(id => rows.find(r => r.id === id))
    .filter((r): r is { id: number; name: string; rank: string | null } => Boolean(r));
}

router.get("/api/staff-availability", authorize(1), asyncHandler(async (req, res) => {
  const { date } = req.query;
  if (!date || typeof date !== "string") throw badRequest("date query param required");
  const staffList = await loadReservationStaffList();
  if (staffList.length === 0) { res.json([]); return; }
  const { data, error } = await supabase
    .from("schedules")
    .select("employeeId, type, workingHours")
    .eq("date", date)
    .in("employeeId", staffList.map(s => s.id));
  if (error) throw new HttpError(500, error.message);
  const result = staffList.map(({ id, name, rank }) => {
    const row = (data ?? []).find((r: any) => r.employeeId === id);
    const scheduleType: string | null = row?.type ?? null;
    return {
      employeeId: id,
      // 2026-10-06 · 하드코드 rank(대표/이사) 제거 · 실제 이름 노출
      //   · 기존 UI 호환 · name/displayName 두 필드 모두 실제 이름으로 공급
      name,
      displayName: name,
      rank: rank ?? null,
      scheduleType,
      workingHours: (row as any)?.workingHours ?? null,
      isOff: isOffType(scheduleType),
    };
  });
  res.json(result);
}));

router.get("/api/staff-monthly", authorize(1), asyncHandler(async (req, res) => {
  const { year, month } = req.query;
  if (!year || !month) throw badRequest("year and month required");
  const staffList = await loadReservationStaffList();
  if (staffList.length === 0) { res.json({}); return; }
  const monthStr = String(month).padStart(2, "0");
  const datePrefix = `${year}-${monthStr}-`;
  const { data, error } = await supabase
    .from("schedules")
    .select("employeeId, date, type")
    .like("date", `${datePrefix}%`)
    .in("employeeId", staffList.map(s => s.id));
  if (error) throw new HttpError(500, error.message);
  const result: Record<string, string[]> = {};
  for (const row of (data ?? [])) {
    if (!isOffType(row.type)) continue;
    const staff = staffList.find(s => s.id === row.employeeId);
    if (!staff) continue;
    if (!result[row.date]) result[row.date] = [];
    // 2026-10-06 · 하드코드 rank(대표/이사) 제거 · 실제 이름 저장
    result[row.date].push(staff.name);
  }
  res.json(result);
}));

export default router;
export { loadReservationStaffList };
