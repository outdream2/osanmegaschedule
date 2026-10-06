// 2026-10-06 · 방문예약 slot 가능여부 (#VisitorReservationEmployeeAssignment · Phase 6)
//   · GET /api/reservations/availability?date=YYYY-MM-DD&employeeId=N
//   · 서버 canonical 계산 · schedules.workingHours + 기존 예약 + buffer
//   · OFF → slots=[] · 반차 → 부분 range · 정상 → workingHours range
//   · busy 예약의 vendor/visitor 개인정보 노출 금지 · slot 자체만 반환
import { Router } from "express";
import { supabase } from "../../../src/supabase/client";
import { asyncHandler } from "../../middleware/asyncHandler";
import { authorize } from "../../middleware/requireAuth";
import { badRequest, HttpError } from "../../middleware/errorHandler";
import { isOffType, isHalfDayType } from "../../../src/shared/schedule/offTypes";

const router = Router();

const SETTINGS_KEY = "all_settings";

interface VisitorReservationSettingsLike {
  assigneeEmployeeIds: number[];
  slotMinutes: number;
  bufferMinutes: number;
  useEmployeeSchedule: boolean;
}

const DEFAULT_SETTINGS: VisitorReservationSettingsLike = {
  assigneeEmployeeIds: [],
  slotMinutes: 30,
  bufferMinutes: 10,
  useEmployeeSchedule: true,
};

async function loadVisitorReservationSettings(): Promise<VisitorReservationSettingsLike> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", SETTINGS_KEY)
    .maybeSingle();
  const value = (data?.value ?? {}) as Record<string, unknown>;
  const vr = (value.visitorReservation ?? {}) as Record<string, unknown>;
  const idsRaw = Array.isArray(vr.assigneeEmployeeIds) ? vr.assigneeEmployeeIds : [];
  const ids = (idsRaw as unknown[]).map(v => Number(v)).filter(v => Number.isInteger(v) && v > 0);
  const slot = typeof vr.slotMinutes === "number" && vr.slotMinutes >= 10 ? Math.round(vr.slotMinutes) : DEFAULT_SETTINGS.slotMinutes;
  const buffer = typeof vr.bufferMinutes === "number" && vr.bufferMinutes >= 0 ? Math.round(vr.bufferMinutes) : DEFAULT_SETTINGS.bufferMinutes;
  const useSched = typeof vr.useEmployeeSchedule === "boolean" ? vr.useEmployeeSchedule : DEFAULT_SETTINGS.useEmployeeSchedule;
  return { assigneeEmployeeIds: ids, slotMinutes: slot, bufferMinutes: buffer, useEmployeeSchedule: useSched };
}

/** "HH:MM" → minutes · 실패 시 null */
function parseHMM(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mi = parseInt(m[2], 10);
  if (!Number.isFinite(h) || !Number.isFinite(mi)) return null;
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  return h * 60 + mi;
}

/** "HH:MM-HH:MM" → [startMin, endMin] · 실패 시 null */
function parseRange(range: string | null | undefined): [number, number] | null {
  if (!range) return null;
  const m = /^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/.exec(range.trim());
  if (!m) return null;
  const s = parseHMM(m[1]);
  const e = parseHMM(m[2]);
  if (s == null || e == null) return null;
  if (e <= s) return null;
  return [s, e];
}

function toHMM(min: number): string {
  const h = Math.floor(min / 60);
  const mi = min % 60;
  return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
}

interface Slot { start: string; end: string }

/** schedules.type + workingHours → working range · 반차는 workingHours 우선, 없으면 미정 */
function computeWorkRange(type: string | null, workingHours: string | null): [number, number] | null {
  if (!type) return null;
  if (isOffType(type)) return null;
  // workingHours 명시 있으면 우선
  const explicit = parseRange(workingHours);
  if (explicit) return explicit;
  // 반차 · workingHours 없으면 미정 → null (슬롯 X)
  if (isHalfDayType(type)) return null;
  // 정상 근무 · workingHours 없으면 미정 → null
  return null;
}

/** 2026-10-06 · GET /api/reservations/availability
 *   · 모든 로그인 사용자 (vendor 포함) 접근 가능 (authorize(0))
 *   · 담당자는 settings 에 명시된 ID 만 조회 가능 (불일치 → 403)
 */
router.get("/api/reservations/availability", authorize(0), asyncHandler(async (req, res) => {
  const { date, employeeId: rawEmpId } = req.query;
  if (!date || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw badRequest("date YYYY-MM-DD required");
  }
  const employeeId = Number(rawEmpId);
  if (!Number.isInteger(employeeId) || employeeId <= 0) {
    throw badRequest("employeeId required (positive integer)");
  }

  const settings = await loadVisitorReservationSettings();
  if (!settings.assigneeEmployeeIds.includes(employeeId)) {
    throw new HttpError(403, "지정된 방문예약 담당자가 아닙니다.", "VENDOR_EMPLOYEE_NOT_ALLOWED");
  }

  // 재직 확인 · retireDate IS NULL
  const { data: empRow, error: empErr } = await supabase
    .from("employees")
    .select('id, name, "retireDate"')
    .eq("id", employeeId)
    .maybeSingle();
  if (empErr && !/column|does not exist/i.test(empErr.message)) {
    throw new HttpError(500, empErr.message);
  }
  if (!empRow) {
    throw new HttpError(404, "직원을 찾을 수 없습니다", "EMPLOYEE_NOT_FOUND");
  }
  if ((empRow as any).retireDate) {
    throw new HttpError(403, "퇴직 처리된 직원입니다", "EMPLOYEE_NOT_ACTIVE");
  }

  // schedules 조회
  let workRange: [number, number] | null = null;
  let scheduleType: string | null = null;
  if (settings.useEmployeeSchedule) {
    const { data: schedRow } = await supabase
      .from("schedules")
      .select("type, workingHours")
      .eq("employeeId", employeeId)
      .eq("date", date)
      .maybeSingle();
    scheduleType = (schedRow as any)?.type ?? null;
    const wh = (schedRow as any)?.workingHours ?? null;
    workRange = computeWorkRange(scheduleType, wh);
  } else {
    // use default 10:00-20:00 if no schedule mode
    workRange = [10 * 60, 20 * 60];
  }

  if (!workRange) {
    res.json({ employeeId, date, scheduleType, slots: [] });
    return;
  }

  // 기존 예약 조회 · (date, assigned_employee_id)
  const { data: busyRows } = await supabase
    .from("reservations")
    .select("time, assigned_employee_id")
    .eq("date", date)
    .eq("assigned_employee_id", employeeId);
  const busyStarts = new Set<number>();
  for (const r of (busyRows ?? [])) {
    const t = parseHMM((r as any).time);
    if (t != null) busyStarts.add(t);
  }

  // slot 생성 · workRange 안 · slotMinutes 단위 · buffer 적용
  const slots: Slot[] = [];
  const { slotMinutes, bufferMinutes } = settings;
  const [workStart, workEnd] = workRange;
  for (let s = workStart; s + slotMinutes <= workEnd; s += slotMinutes) {
    const e = s + slotMinutes;
    // busy 체크 · buffer window 내 start 가 겹치면 제외
    let conflict = false;
    for (const b of busyStarts) {
      const bufferedStart = b - bufferMinutes;
      const bufferedEnd = b + slotMinutes + bufferMinutes;
      // 요청 slot (s..e) 과 겹침?
      if (s < bufferedEnd && e > bufferedStart) {
        conflict = true;
        break;
      }
    }
    if (!conflict) slots.push({ start: toHMM(s), end: toHMM(e) });
  }

  res.json({
    employeeId,
    date,
    scheduleType,
    slotMinutes,
    bufferMinutes,
    workingRange: { start: toHMM(workStart), end: toHMM(workEnd) },
    slots,
  });
}));

export default router;
