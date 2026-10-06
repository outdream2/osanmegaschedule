// 2026-08-16 · asyncHandler + HttpError + validateBody + shared 스키마/DTO
import { Router } from "express";
import webpush from "web-push";
import { supabase } from "../../../src/supabase/client";
import { scheduleService } from "../../services/scheduleService";
import { notificationsService } from "../../services/notificationsService";
import { checkOwnershipOrAdmin } from "../../lib/ownershipCheck";
import { asyncHandler } from "../../middleware/asyncHandler";
import { authorize } from "../../middleware/requireAuth";
import { validateBody } from "../../middleware/zodValidate";
import { badRequest, notFound, HttpError } from "../../middleware/errorHandler";
import { CreateLeaveRequestSchema, ReviewLeaveRequestSchema } from "../../../src/shared/schemas/leave";
import type { LeaveBalanceResponse, LeaveStatsResponse } from "../../../src/shared/dtos/leave";
import { nextKstYmd, compareYmd, getKstYmd } from "../../lib/kstDate";
import logger from "../../lib/logger";
// 2026-09-21 · #328 · iOS 앱 Expo 푸시 알림 · 연차 승인 트리거
import { sendPushSafe } from "../../services/expoPushService";
// 2026-10-06 · PHASE 1 · schedule lock bypass fix · 연차 승인/삭제 경로 공통 guard
import { assertScheduleNotLockedForDates } from "../../lib/scheduleLock";
import type { AuthedRequest } from "../../types/auth";

const router = Router();

router.get("/api/leave-stats", asyncHandler(async (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  const { year } = req.query;
  if (!year || typeof year !== "string") throw badRequest("year required");
  const { data, error } = await supabase
    .from("schedules").select("employeeId").like("date", `${year}-%`).eq("type", "월차");
  if (error) throw new HttpError(500, error.message);
  const counts: LeaveStatsResponse = {};
  for (const row of (data ?? [])) {
    const id = row.employeeId as number;
    counts[id] = (counts[id] ?? 0) + 1;
  }
  res.json(counts);
}));

// T-SLIM E · List endpoint · 현재 array 반환 · v2 { rows, count } 예정
router.get("/api/leave-requests", asyncHandler(async (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  const { employeeId, all } = req.query;
  let q = supabase.from("leave_requests")
    .select("id, employee_id, employee_name, leave_type, start_date, end_date, reason, status, reviewer_note, created_at, reviewed_at")
    .order("created_at", { ascending: false });
  if (all !== "true" && employeeId) q = q.eq("employee_id", Number(employeeId));
  const { data, error } = await q;
  if (error) throw new HttpError(500, error.message);
  res.json(data ?? []);
}));

// 남은 연차 잔여 계산
router.get("/api/leave-balance", asyncHandler(async (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  const { employeeId } = req.query;
  if (!employeeId) throw badRequest("employeeId required");
  const empIdNum = Number(employeeId);
  const { data: emp, error: empErr } = await supabase
    .from("employees").select("annual_leave_days").eq("id", empIdNum).maybeSingle();
  if (empErr) throw new HttpError(500, empErr.message);
  const total = Number(emp?.annual_leave_days ?? 15);

  const { data: rows, error: reqErr } = await supabase
    .from("leave_requests")
    .select("leave_type, start_date, end_date")
    .eq("employee_id", empIdNum).eq("status", "approved");
  if (reqErr) throw new HttpError(500, reqErr.message);

  let used = 0;
  for (const r of (rows ?? [])) {
    const t = String(r.leave_type ?? "");
    if (t === "병가" || t === "특별휴가") continue;
    if (t === "반차" || t === "오전반차" || t === "오후반차") { used += 0.5; continue; }
    const s = new Date(String(r.start_date) + "T00:00:00");
    const e = new Date(String(r.end_date) + "T00:00:00");
    const days = Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000) + 1);
    used += days;
  }
  const body: LeaveBalanceResponse = { total, used, remaining: Math.max(0, total - used) };
  res.json(body);
}));

router.get("/api/leave-requests/pending-count", asyncHandler(async (_req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  const { count, error } = await supabase
    .from("leave_requests").select("*", { count: "exact", head: true }).eq("status", "pending");
  if (error) throw new HttpError(500, error.message);
  res.json({ count: count ?? 0 });
}));

router.post("/api/leave-requests", authorize(1), validateBody(CreateLeaveRequestSchema), asyncHandler(async (req, res) => {
  const { employee_id, employee_name, leave_type, start_date, end_date, reason } = req.body;
  const { data, error } = await supabase.from("leave_requests").insert([{
    employee_id: Number(employee_id),
    employee_name,
    leave_type,
    start_date,
    end_date,
    reason: reason ?? "",
    status: "pending",
  }]).select().single();
  if (error) throw new HttpError(500, error.message);

  notificationsService.notifyAllAdmins({
    title: "연차 신청 도착",
    body: `${employee_name}님이 ${leave_type} (${start_date} ~ ${end_date}) 신청.`,
    type: "info",
    push: { url: "/", tag: `leave-new-${data?.id}` },
  }).catch(() => null);
  res.status(201).json(data);
}));

router.put("/api/leave-requests/:id", authorize(5), validateBody(ReviewLeaveRequestSchema), asyncHandler(async (req, res) => {
  const { status, reviewer_note } = req.body;
  const authLevel = (req as AuthedRequest).authUser?.level ?? 0;

  // 2026-10-06 · PHASE 1 · 승인 전 lock 사전 검증 (approved 분기만)
  //   · pending → approved 시 schedules 자동 반영 · 해당 월(들) lock 상태 미리 확인
  //   · lv≥9 bypass (기존 semantics 유지) · lock 월에 lv<9 승인 시도 → 403 · leave status 변경 안 함
  //   · 반려(rejected)·반려→승인 외 상태는 schedules 미반영 → lock 검증 skip
  if (status === "approved") {
    // 요청 row read-only 조회 (아직 update 안 함)
    const { data: pre, error: preErr } = await supabase
      .from("leave_requests")
      .select("start_date, end_date, status")
      .eq("id", req.params.id)
      .maybeSingle();
    if (preErr) throw new HttpError(500, preErr.message);
    if (!pre) throw notFound();
    const startDate: string = String(pre.start_date).slice(0, 10);
    const endDate: string = String(pre.end_date).slice(0, 10);
    // 날짜 범위 전개
    const dates: string[] = [];
    let cur = startDate;
    while (compareYmd(cur, endDate) <= 0) {
      dates.push(cur);
      cur = nextKstYmd(cur);
    }
    // 공통 guard · 월(들) lock 상태 검증 · lv≥9 bypass
    await assertScheduleNotLockedForDates(dates, authLevel);
  }

  const { data, error } = await supabase
    .from("leave_requests")
    .update({ status, reviewer_note: reviewer_note ?? "", reviewed_at: new Date().toISOString() })
    .eq("id", req.params.id).select().single();
  if (error) throw new HttpError(500, error.message);
  if (!data) throw notFound();

  const label = status === "approved" ? "승인" : "반려";

  if (status === "approved") {
    const scheduleType = ["오전반차", "오후반차"].includes(data.leave_type) ? data.leave_type : "월차";
    // 2026-09-11 · #116 · KST off-by-one fix · 문자열 기반 · Date/UTC 변환 회피
    const dates: string[] = [];
    let cur: string = String(data.start_date).slice(0, 10);
    const end: string = String(data.end_date).slice(0, 10);
    while (compareYmd(cur, end) <= 0) {
      dates.push(cur);
      cur = nextKstYmd(cur);
    }
    if (dates.length > 0) {
      // 2026-09-11 · #116 · 에러 삼킴 제거 · 스케쥴 반영 실패 원인 표면화 · try/catch + 자세한 로그
      // 2026-10-06 · PHASE 1 · atomicity · schedule upsert 실패 시 leave_requests 롤백 (app-level compensation)
      //   · 이상적 (A안) RPC function 적용 전까지는 compensation 패턴으로 부분 불일치 방지
      //   · 이후 approve_leave_request RPC 적용 시 이 블록 제거 가능 (migrations/schedule_phase_1_approve_leave_rpc_2026-10-06.sql)
      try {
        const result = await scheduleService.batchUpdateSchedules(
          dates.map(date => ({
            employeeId: data.employee_id,
            date,
            type: scheduleType,
            workingHours: "",
            actualHours: "",
            memo: `연차 승인 (${data.leave_type})`,
          })),
        );
        logger.info(`[LEAVE APPROVE] emp=${data.employee_id} type=${scheduleType} dates=[${dates.join(",")}] · ${result.count}건 스케쥴 반영`);
      } catch (schedErr: any) {
        logger.error(`[LEAVE APPROVE FAILED] emp=${data.employee_id} type=${scheduleType} dates=[${dates.join(",")}] · ${schedErr?.message ?? schedErr}`);
        // 2026-10-06 · PHASE 1 · app-level compensation · leave_requests.status 롤백
        //   · schedules upsert 실패 → leave status 를 pending 으로 되돌려 부분 불일치 제거
        //   · rollback 자체 실패 시에도 원 에러를 500 으로 전파 (관리자 수동 복구 로그만 남김)
        try {
          const { error: rbErr } = await supabase
            .from("leave_requests")
            .update({ status: "pending", reviewer_note: "", reviewed_at: null })
            .eq("id", req.params.id);
          if (rbErr) {
            logger.error(`[LEAVE APPROVE ROLLBACK FAILED] id=${req.params.id} · ${rbErr.message}`);
          } else {
            logger.warn(`[LEAVE APPROVE ROLLBACK] id=${req.params.id} · status=approved → pending (schedule upsert 실패로 인한 자동 복구)`);
          }
        } catch (rbCatch: any) {
          logger.error(`[LEAVE APPROVE ROLLBACK EXCEPTION] id=${req.params.id} · ${rbCatch?.message ?? rbCatch}`);
        }
        // 연차 승인은 완료된 상태에서 · schedule 반영 실패 · 클라이언트에 500 반환
        throw new HttpError(500, `연차는 승인되었으나 스케쥴 반영 실패: ${schedErr?.message ?? String(schedErr)}`);
      }
    }
  }

  const { data: emp } = await supabase.from("employees").select("push_subscription").eq("id", data.employee_id).maybeSingle();

  await notificationsService.create({
    employee_id: data.employee_id,
    title: `연차 신청 ${label}`,
    body: `${data.leave_type} (${data.start_date} ~ ${data.end_date}) 신청이 ${label}되었습니다.${reviewer_note ? ` — ${reviewer_note}` : ""}`,
    type: status === "approved" ? "success" : "alert",
  }).catch(() => null);

  // 2026-09-21 · #328 · iOS 앱 Expo 푸시 알림 · 연차 승인·반려 결과 통지 (fire-and-forget)
  //   · 기존 인앱 알림 · web push 유지 · Expo push 추가 (WebView 앱 홈화면 배지)
  //   · sendPushSafe · 실패해도 응답 흐름 방해 X · 로그만 남김
  sendPushSafe({
    userId: Number(data.employee_id),
    title: `연차 신청 ${label}`,
    body: `${data.leave_type} (${data.start_date} ~ ${data.end_date}) 신청이 ${label}되었습니다.${reviewer_note ? ` — ${reviewer_note}` : ""}`,
    url: "/",
  });

  if (emp?.push_subscription) {
    await webpush.sendNotification(
      emp.push_subscription as webpush.PushSubscription,
      JSON.stringify({
        title: `연차 신청 ${label}`,
        body: `${data.leave_type} 신청이 ${label}되었습니다.${reviewer_note ? ` (${reviewer_note})` : ""}`,
        url: "/",
        tag: `leave-reviewed-${data.id}`,
      }),
    ).catch(() => null);
  }

  if (status === "approved") {
    const { data: managers } = await supabase.from("employees").select("id").gte("level", 9);
    if (managers && managers.length > 0) {
      await Promise.all(
        managers
          .filter(m => m.id !== data.employee_id)
          .map(m =>
            notificationsService.create({
              employee_id: m.id,
              title: "연차 자동 반영",
              body: `${data.employee_name}님의 ${data.leave_type} (${data.start_date} ~ ${data.end_date})이 승인되어 스케줄에 반영되었습니다.`,
              type: "info",
            }).catch(() => null),
          ),
      );
    }
  }
  res.json(data);
}));

// #311 · 다가오는 연차 알림 · GET /api/upcoming-leaves?days=N · 관리자용 (lv>=2)
//   · schedules 테이블 · type IN (월차, 오전반차, 오후반차) · today ~ today+days
//   · employees JOIN · name 포함 · 날짜 오름차순
router.get("/api/upcoming-leaves", authorize(2), asyncHandler(async (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  const days = Math.min(Math.max(Number(req.query.days ?? 14), 1), 90);

  const today = getKstYmd();
  // today + days 계산 (문자열 + 순수 산술)
  const todayDate = new Date(`${today}T00:00:00Z`);
  todayDate.setUTCDate(todayDate.getUTCDate() + days);
  const toDate = `${todayDate.getUTCFullYear()}-${String(todayDate.getUTCMonth() + 1).padStart(2, "0")}-${String(todayDate.getUTCDate()).padStart(2, "0")}`;

  const LEAVE_TYPES = ["월차", "오전반차", "오후반차"];

  const { data, error } = await supabase
    .from("schedules")
    .select("id, employeeId, date, type")
    .in("type", LEAVE_TYPES)
    .gte("date", today)
    .lte("date", toDate)
    .order("date", { ascending: true })
    .order("employeeId", { ascending: true });

  if (error) throw new HttpError(500, error.message);
  const rows = data ?? [];

  if (rows.length === 0) {
    res.json({ items: [] });
    return;
  }

  // 직원 이름 JOIN
  const empIds = [...new Set(rows.map((r: any) => r.employeeId as number))];
  const { data: emps, error: empErr } = await supabase
    .from("employees")
    .select("id, name")
    .in("id", empIds);
  if (empErr) throw new HttpError(500, empErr.message);

  const nameMap: Record<number, string> = {};
  for (const e of (emps ?? [])) {
    nameMap[Number(e.id)] = String(e.name ?? "");
  }

  const items = rows.map((r: any) => ({
    employeeId: Number(r.employeeId),
    employeeName: nameMap[Number(r.employeeId)] ?? String(r.employeeId),
    date: String(r.date),
    type: String(r.type),
  }));

  res.json({ items });
}));

// #112-E1 Phase 2 · 본인 or 관리자만 삭제
router.delete("/api/leave-requests/:id", authorize(5), asyncHandler(async (req, res) => {
  const check = await checkOwnershipOrAdmin(req, { table: "leave_requests", id: req.params.id });
  if (check.ok !== true) throw new HttpError(check.status, check.error);
  if (!check.isAdmin && check.row?.status !== "pending") throw badRequest("승인/거절된 요청은 삭제할 수 없습니다");
  // 2026-09-11 · #130 · 관리자 · 승인/거절 이력도 삭제 가능 · pending 조건 skip
  //   · 관리자 삭제 시 · 관련 schedules (승인된 연차) 도 함께 제거
  const wasApproved = check.row?.status === "approved";
  const empId = check.row?.employee_id;
  const startDate = check.row?.start_date;
  const endDate = check.row?.end_date;
  const authLevel = (req as AuthedRequest).authUser?.level ?? 0;

  // 2026-10-06 · PHASE 1 · schedules cleanup 전 lock 검증
  //   · 이미 승인된 연차 삭제 시 schedules DELETE 가 발생 → 해당 월(들) lock 상태 미리 확인
  //   · lv≥9 bypass (기존 semantics 유지) · lock 월에 lv<9 삭제 시도 → 403 · leave_requests 도 변경 안 함
  //   · pending/rejected 삭제는 schedules 미영향 → lock 검증 skip
  if (check.isAdmin && wasApproved && empId && startDate && endDate) {
    const dates: string[] = [];
    let cur: string = String(startDate).slice(0, 10);
    const end: string = String(endDate).slice(0, 10);
    while (compareYmd(cur, end) <= 0) {
      dates.push(cur);
      cur = nextKstYmd(cur);
    }
    await assertScheduleNotLockedForDates(dates, authLevel);
  }

  let q = supabase.from("leave_requests").delete().eq("id", req.params.id);
  if (!check.isAdmin) q = q.eq("status", "pending");
  const { error } = await q;
  if (error) throw new HttpError(500, error.message);
  // 관리자 · 이미 승인된 연차 · schedules 에서 · 대응 항목 제거
  //
  // identity audit (PHASE 1 리포트 참고):
  //   현재 삭제 조건은 (employeeId, date range, type IN [월차,오전반차,오후반차]) 로만 매칭.
  //   leave_requests.id 를 schedules 로우에 기록하지 않음 → "이 schedule 이 이 leave 로부터 생성됐다"
  //   는 역추적 불가능.
  //   사용자가 승인 후 해당 schedule 을 수동으로 다른 type (예: "오픈") 으로 바꿨다면 자동으로 skip 됨 (SAFE).
  //   같은 날짜·같은 type 을 다른 사유 (관리자 수동 입력) 로 넣은 뒤 삭제하면 그 schedule 이 함께 삭제될 수 있음
  //   → identity 불명확 영역 · 자동 수정 금지 · 리포트에 명시.
  if (check.isAdmin && wasApproved && empId && startDate && endDate) {
    const { error: schedErr } = await supabase
      .from("schedules")
      .delete()
      .eq("employeeId", empId)
      .in("type", ["월차", "오전반차", "오후반차"])
      .gte("date", startDate)
      .lte("date", endDate);
    if (schedErr) {
      logger.warn(`[LEAVE DELETE · schedules cleanup failed] ${schedErr.message}`);
      // 스케쥴 삭제 실패는 경고만 · leave_requests 삭제는 이미 성공
    } else {
      logger.info(`[LEAVE DELETE] emp=${empId} · ${startDate}~${endDate} · schedules 정리`);
    }
  }
  res.json({ ok: true });
}));

export default router;
