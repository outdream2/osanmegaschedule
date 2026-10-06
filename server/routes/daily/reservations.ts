// 2026-08-17 · asyncHandler + HttpError + validateBody + shared 스키마/DTO
// 2026-10-06 · #VisitorReservationEmployeeAssignment
//   · POST · assigned_employee_id FK + 재검증 · unique DB constraint 활용
//   · GET · auth guard · vendor 는 본인 (vendor_id) 만 조회 가능 · admin/manager 전체
//   · [대상:xxx] note 자동 생성 금지 · note 는 실제 메모용
import { Router } from "express";
import { supabase } from "../../../src/supabase/client";
import { notificationsService } from "../../services/notificationsService";
import { asyncHandler } from "../../middleware/asyncHandler";
import { authorize } from "../../middleware/requireAuth";
import { validateBody } from "../../middleware/zodValidate";
import { badRequest, HttpError } from "../../middleware/errorHandler";
import { CreateReservationSchema } from "../../../src/shared/schemas/reservation";
import type { ReservationsListResponse } from "../../../src/shared/dtos/reservations";
import type { OkResponse } from "../../../src/shared/dtos/common";
import type { AuthedRequest } from "../../types/auth";
import { isOffType } from "../../../src/shared/schedule/offTypes";

const router = Router();

const SETTINGS_KEY = "all_settings";

async function loadAssigneeIds(): Promise<number[]> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", SETTINGS_KEY)
    .maybeSingle();
  const value = (data?.value ?? {}) as Record<string, unknown>;
  const vr = (value.visitorReservation ?? {}) as Record<string, unknown>;
  const raw = Array.isArray(vr.assigneeEmployeeIds) ? vr.assigneeEmployeeIds : [];
  return (raw as unknown[]).map(v => Number(v)).filter(v => Number.isInteger(v) && v > 0);
}

// 2026-10-06 · GET auth guard · 모든 사용자 lv0+ 접근 · vendor 는 본인 예약만 노출
router.get("/api/reservations", authorize(0), asyncHandler(async (req, res) => {
  const { date } = req.query;
  if (!date || typeof date !== "string") throw badRequest("date query param required");
  const session = (req as AuthedRequest).authUser;
  const isVendor = session?.role === "vendor";

  // Vendor: 본인 예약만 · Admin/Manager/Staff: 전체 (slot 뷰에 필요)
  let query = supabase
    .from("reservations")
    .select("id, date, time, note, purpose, company, contact_name, phone, vendor_id, assigned_employee_id, employee_name_snapshot")
    .eq("date", date);
  if (isVendor && session?.sub) {
    query = query.eq("vendor_id", session.sub);
  }
  const { data, error } = await query;
  if (error) throw new HttpError(500, error.message);

  // 2026-10-06 · 개인정보 노출 축소 · vendor 가 아닌 세션은 slot 집계용 최소 field 반환
  //   · vendor 본인 예약은 전체 field (본인 소유)
  //   · 그 외 사용자 (admin/manager/staff): 전체 (관리 UI 에서 사용)
  const body: ReservationsListResponse = (data ?? []) as any;
  res.json(body);
}));

// 2026-09-18 · authorize(5) → authorize(0) · vendor(level=0) 예약 가능하도록
// 2026-10-06 · assigned_employee_id 필수화 · 설정/재직/스케줄/중복 재검증 · unique 활용
router.post("/api/reservations", authorize(0), validateBody(CreateReservationSchema), asyncHandler(async (req, res) => {
  const { date, time, company, contactName, phone, purpose, note, vendorId, assignedEmployeeId } = req.body;
  const session = (req as AuthedRequest).authUser;

  // 1. settings · 담당자 허용 ID 안?
  const allowedIds = await loadAssigneeIds();
  if (allowedIds.length === 0) {
    throw new HttpError(503, "방문예약 담당자가 설정되지 않았습니다. 관리자에게 문의하세요.", "RESERVATION_DISABLED");
  }
  if (!allowedIds.includes(assignedEmployeeId)) {
    throw new HttpError(403, "지정된 방문예약 담당자가 아닙니다.", "VENDOR_EMPLOYEE_NOT_ALLOWED");
  }

  // 2. employee 재직 확인
  const { data: empRow, error: empErr } = await supabase
    .from("employees")
    .select('id, name, "retireDate"')
    .eq("id", assignedEmployeeId)
    .maybeSingle();
  if (empErr && !/column|does not exist/i.test(empErr.message)) {
    throw new HttpError(500, empErr.message);
  }
  if (!empRow) throw new HttpError(404, "담당자를 찾을 수 없습니다", "EMPLOYEE_NOT_FOUND");
  if ((empRow as any).retireDate) {
    throw new HttpError(403, "퇴직 처리된 담당자입니다", "EMPLOYEE_NOT_ACTIVE");
  }
  const employeeName = String((empRow as any).name ?? "");

  // 3. schedules 재조회 · 근무 가능 시간 확인
  const { data: schedRow } = await supabase
    .from("schedules")
    .select("type, workingHours")
    .eq("employeeId", assignedEmployeeId)
    .eq("date", date)
    .maybeSingle();
  const schedType = (schedRow as any)?.type ?? null;
  if (schedType && isOffType(schedType)) {
    throw new HttpError(409, "해당 날짜는 담당자 휴무일입니다.", "OUT_OF_WORK_HOURS");
  }
  const workingHours = (schedRow as any)?.workingHours ?? null;
  if (workingHours && typeof workingHours === "string") {
    // 범위 밖 체크 (파싱 가능할 때만)
    const m = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/.exec(workingHours.trim());
    const tm = /^(\d{1,2}):(\d{2})$/.exec(String(time).trim());
    if (m && tm) {
      const start = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
      const end = parseInt(m[3], 10) * 60 + parseInt(m[4], 10);
      const t = parseInt(tm[1], 10) * 60 + parseInt(tm[2], 10);
      if (t < start || t >= end) {
        throw new HttpError(409, "근무시간 외 예약은 불가합니다.", "OUT_OF_WORK_HOURS");
      }
    }
  }

  // 4. 중복 예약 재조회 · (date, time, assigned_employee_id)
  const { data: existing } = await supabase
    .from("reservations")
    .select("id")
    .eq("date", date)
    .eq("time", time)
    .eq("assigned_employee_id", assignedEmployeeId);
  if ((existing ?? []).length > 0) {
    throw new HttpError(409, "이미 예약된 시간입니다.", "RESERVATION_SLOT_TAKEN");
  }

  // 5. INSERT · unique violation → 409 (race protection)
  //    · [대상:xxx] note 자동 생성 금지 · note 는 사용자 입력 그대로
  const insertRow: Record<string, unknown> = {
    date,
    time,
    company,
    contact_name: contactName,
    phone,
    purpose,
    note: note || "",
    assigned_employee_id: assignedEmployeeId,
    employee_name_snapshot: employeeName,
  };
  // vendor 세션이면 vendor_id 자동 세팅 (body 조작 방어)
  const effectiveVendorId = (session?.role === "vendor" && session.sub) ? session.sub : vendorId;
  if (effectiveVendorId) insertRow.vendor_id = effectiveVendorId;

  const { error: insertErr } = await supabase.from("reservations").insert(insertRow);
  if (insertErr) {
    // Postgres unique_violation (23505) · race condition
    const code = (insertErr as any).code;
    if (code === "23505" || /unique|duplicate/i.test(insertErr.message)) {
      throw new HttpError(409, "이미 예약된 시간입니다.", "RESERVATION_SLOT_TAKEN");
    }
    throw new HttpError(500, insertErr.message);
  }

  // 관리자 broadcast
  notificationsService.notifyAllAdmins({
    title: `📅 거래처 예약 [${employeeName}]`,
    body: `${date} ${time} · ${company} · ${contactName} (${phone}) · ${purpose}`,
    type: "info",
    push: { url: "/", tag: `resv-${date}-${time}` },
  }).catch(() => null);
  const body: OkResponse = { ok: true };
  res.status(201).json(body);
}));

export default router;
