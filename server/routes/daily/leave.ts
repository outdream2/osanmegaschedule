// 2026-08-16 · asyncHandler + HttpError + validateBody + shared 스키마/DTO
import { Router } from "express";
import webpush from "web-push";
import { supabase } from "../../../src/supabase/client";
// 2026-10-06 · PHASE 1.5 · scheduleService 직접 호출 제거 · 승인은 RPC canonical path 사용
// (삭제 경로는 schedules 직접 DELETE · scheduleService 미사용)
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
  const authSession = (req as AuthedRequest).authUser;
  const authLevel = authSession?.level ?? 0;
  const reviewerId = Number(authSession?.sub ?? 0);

  // 2026-10-06 · PHASE 1.5 · 승인 분기 · RPC canonical path (approve_leave_request)
  //   · leave_requests UPDATE + schedules UPSERT (source_leave_id 포함) 를 하나의 PL/pgSQL 트랜잭션으로 수행
  //   · app-level compensation 제거 (RPC 로 atomicity 보장)
  //   · 서버 route 는 사전 lock 검증 (가독성 · 명확 에러) + RPC 재검증 (중복 안전장치)
  //   · lv≥9 bypass 는 p_bypass_lock=true 로 명시 전달
  //
  // ** 적용 전제 **
  //   · DB 에 다음 migration 선 적용 필요:
  //     1. migrations/schedule_phase_1_5_source_leave_id_2026-10-06.sql
  //     2. migrations/schedule_phase_1_approve_leave_rpc_2026-10-06.sql
  //   · RPC 미적용 환경에서는 Supabase 가 "function not found" 반환 → 서버 500 → 사용자 선 적용 후 코드 deploy.
  //
  // 반려(rejected) 는 schedules 미영향 → 기존 단순 UPDATE 로 처리.
  if (status === "approved") {
    // 요청 row read-only 조회 (아직 update 안 함) · 사전 lock 검증 + 반환 메타 수집용
    const { data: pre, error: preErr } = await supabase
      .from("leave_requests")
      .select("id, employee_id, employee_name, leave_type, start_date, end_date, status")
      .eq("id", req.params.id)
      .maybeSingle();
    if (preErr) throw new HttpError(500, preErr.message);
    if (!pre) throw notFound();
    if (pre.status !== "pending") throw new HttpError(409, "이미 처리된 요청입니다.", "LEAVE_NOT_PENDING");

    const startDate: string = String(pre.start_date).slice(0, 10);
    const endDate: string = String(pre.end_date).slice(0, 10);
    // 날짜 범위 전개
    const dates: string[] = [];
    let cur = startDate;
    while (compareYmd(cur, endDate) <= 0) {
      dates.push(cur);
      cur = nextKstYmd(cur);
    }
    // 공통 guard · 월(들) lock 상태 검증 · lv≥9 bypass (서버 측 명시 에러 메시지용)
    await assertScheduleNotLockedForDates(dates, authLevel);

    // RPC canonical 호출 · atomic transaction
    const { error: rpcErr } = await supabase.rpc("approve_leave_request", {
      p_request_id: req.params.id,
      p_reviewer_id: reviewerId,
      p_reviewer_note: reviewer_note ?? "",
      p_bypass_lock: authLevel >= 9,
    });
    if (rpcErr) {
      const msg = rpcErr.message ?? "";
      logger.error(`[LEAVE APPROVE RPC] id=${req.params.id} · reviewer=${reviewerId} · ${msg}`);
      if (/SCHEDULE_LOCKED/.test(msg)) {
        throw new HttpError(403, "확정된 달은 수정할 수 없습니다. 관리자(lv≥9)만 수정 가능합니다.", "SCHEDULE_LOCKED");
      }
      if (/LEAVE_NOT_FOUND/.test(msg)) {
        throw notFound();
      }
      if (/LEAVE_NOT_PENDING/.test(msg)) {
        throw new HttpError(409, "이미 처리된 요청입니다.", "LEAVE_NOT_PENDING");
      }
      // RPC 가 아직 미적용된 환경 (production migration 선행 필요)
      if (/function .* does not exist|could not find the function/i.test(msg)) {
        throw new HttpError(
          500,
          "서버 설정 오류: approve_leave_request RPC 가 DB 에 아직 적용되지 않았습니다. 관리자에게 문의하세요.",
          "RPC_NOT_APPLIED",
        );
      }
      throw new HttpError(500, msg);
    }
    logger.info(`[LEAVE APPROVE RPC] emp=${pre.employee_id} · leave_type=${pre.leave_type} · dates=[${dates.join(",")}] · atomic approve 성공`);
  }

  // approved 는 RPC 가 이미 UPDATE 수행 · 반려(rejected) 만 여기서 직접 UPDATE
  // 2026-10-06 · PHASE 1.5 · unknown shape · 명시 타입 (DB row 스냅샷)
  type LeaveRequestRow = {
    id: string;
    employee_id: number;
    employee_name: string;
    leave_type: string;
    start_date: string;
    end_date: string;
    reason: string | null;
    status: string;
    reviewer_note: string | null;
    created_at: string | null;
    reviewed_at: string | null;
  };
  let data: LeaveRequestRow;
  if (status === "approved") {
    const { data: fresh, error: freshErr } = await supabase
      .from("leave_requests")
      .select("*")
      .eq("id", req.params.id)
      .maybeSingle();
    if (freshErr) throw new HttpError(500, freshErr.message);
    if (!fresh) throw notFound();
    data = fresh;
  } else {
    const { data: updated, error: updErr } = await supabase
      .from("leave_requests")
      .update({ status, reviewer_note: reviewer_note ?? "", reviewed_at: new Date().toISOString() })
      .eq("id", req.params.id).select().single();
    if (updErr) throw new HttpError(500, updErr.message);
    if (!updated) throw notFound();
    data = updated;
  }

  const label = status === "approved" ? "승인" : "반려";

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
    // 2026-10-06 · PHASE 1.5 · provenance 기반 cleanup
    //   1차: source_leave_id = <this leave id> 인 schedules 만 삭제 (정확 매칭)
    //        — 사용자가 승인 후 schedule 을 수동으로 "오픈" 등으로 바꾼 경우 자동 skip
    //        — 다른 사유로 입력된 같은 날짜 월차/반차는 영향 없음
    //   2차 (레거시 호환): source_leave_id IS NULL 인 레거시 schedules 는 (employeeId, date range, type) 매칭으로 삭제
    //        — PHASE 1.5 적용 전 승인된 연차 (source_leave_id 없음) 는 이 경로로 정리
    //        — PHASE 1.5 적용 후 신규 승인된 연차는 source_leave_id 매칭만 사용
    //
    // 안전 정책:
    //   · source_leave_id 매칭이 1건 이상 있으면 레거시 매칭 skip (중복 삭제 방지)
    //   · 두 삭제 모두 실패해도 leave_requests DELETE 는 이미 성공 → warn 로그만 (기존 거동 유지)

    // 1차 · provenance 기반 삭제
    const { data: provRows, error: provSelErr } = await supabase
      .from("schedules")
      .select("id")
      .eq("source_leave_id", req.params.id);
    if (provSelErr) {
      // source_leave_id 컬럼 미적용 환경 (migration 선행 필요) → 레거시 경로로 폴백
      if (/column .* does not exist|source_leave_id/i.test(provSelErr.message)) {
        logger.warn(`[LEAVE DELETE · schedules] source_leave_id 컬럼 없음 (DB migration 미적용) · 레거시 매칭으로 폴백`);
      } else {
        logger.warn(`[LEAVE DELETE · schedules provenance select] ${provSelErr.message}`);
      }
    }

    const provenanceMatched = Array.isArray(provRows) && provRows.length > 0;

    if (provenanceMatched) {
      const { error: schedErr } = await supabase
        .from("schedules")
        .delete()
        .eq("source_leave_id", req.params.id);
      if (schedErr) {
        logger.warn(`[LEAVE DELETE · schedules provenance cleanup failed] ${schedErr.message}`);
      } else {
        logger.info(`[LEAVE DELETE] emp=${empId} · leave=${req.params.id} · provenance 기반 schedules ${provRows!.length}건 정리`);
      }
    } else {
      // 2차 · 레거시 호환 (source_leave_id = NULL 인 schedule 만 대상)
      //   · PHASE 1.5 적용 후에는 provenance 가 보장되므로 이 경로는 레거시 데이터에만 활성
      //   · identity 가 불명확하지만 사용자 삭제 의도상 cleanup 수행 (기존 거동 유지)
      const { error: legacyErr } = await supabase
        .from("schedules")
        .delete()
        .eq("employeeId", empId)
        .is("source_leave_id", null)
        .in("type", ["월차", "오전반차", "오후반차"])
        .gte("date", startDate)
        .lte("date", endDate);
      if (legacyErr) {
        // source_leave_id 컬럼 자체가 없는 환경 → 완전 레거시 경로로 폴백
        if (/column .* does not exist|source_leave_id/i.test(legacyErr.message)) {
          const { error: fullLegacyErr } = await supabase
            .from("schedules")
            .delete()
            .eq("employeeId", empId)
            .in("type", ["월차", "오전반차", "오후반차"])
            .gte("date", startDate)
            .lte("date", endDate);
          if (fullLegacyErr) {
            logger.warn(`[LEAVE DELETE · schedules full-legacy cleanup failed] ${fullLegacyErr.message}`);
          } else {
            logger.info(`[LEAVE DELETE · full-legacy] emp=${empId} · ${startDate}~${endDate} · (source_leave_id 컬럼 없음)`);
          }
        } else {
          logger.warn(`[LEAVE DELETE · schedules legacy cleanup failed] ${legacyErr.message}`);
        }
      } else {
        logger.info(`[LEAVE DELETE · legacy-null-only] emp=${empId} · ${startDate}~${endDate}`);
      }
    }
  }
  res.json({ ok: true });
}));

export default router;
