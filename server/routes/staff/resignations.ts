// 2026-08-16 · asyncHandler + HttpError 프레임워크 적용
// server/routes/resignations.ts
// 2026-08-03 · #179+#180+#181 · 사직서 제출/조회/승인/반려 API
// 2026-08-03 · #204 Priority 4 · signature_data_url → Supabase Storage 업로드 · signature_url 저장
//
// 엔드포인트:
//   POST   /api/resignations                      · 직원 · 사직서 제출 · 관리자 push+in-app 알림
//   GET    /api/resignations?status=pending|all   · 관리자 · 리스트
//   GET    /api/resignations?employeeId=<n>       · 직원 · 본인 제출 이력
//   GET    /api/resignations/pending-count        · 배지 카운트용 (관리자 · 서브탭 배지)
//   PATCH  /api/resignations/:id                  · 관리자(level≥8) · 승인/반려
//                                                  · 승인 시 · employees.retire_date 자동 세팅
//   DELETE /api/resignations/:id                  · 본인 · pending 상태에서만 철회
//
// 통보:
//   - 등록 시 · 관리자(level≥8) 전원에게 Web Push + 인앱 notifications insert
//   - 승인/반려 시 · 신청자에게 Web Push + 인앱 notifications insert
//
// 안전:
//   - 최소 필드 검증만 · 상위 UI 검증에 위임
//   - status 는 4종 whitelist · CHECK 제약과 동일
//   - retire_date 실패해도 승인 자체는 성공 반환 (개별 catch)
//   - signature Storage 업로드 실패 시 · signature_url=null 로 저장 · 오류 로그만 · 제출 자체는 성공
//
// leave.ts 라우터를 벤치마크 · 동일한 push+notifications 흐름 유지
import { Router } from "express";
import webpush from "web-push";
import { supabase } from "../../../src/supabase/client";
import { notificationsService } from "../../services/notificationsService";
import { authorize, getSession } from "../../middleware/requireAuth";
import { asyncHandler } from "../../middleware/asyncHandler";
import { validateBody } from "../../middleware/zodValidate";
import { badRequest, notFound, HttpError } from "../../middleware/errorHandler";
import { CreateResignationSchema, ReviewResignationSchema } from "../../../src/shared/schemas/resignations";

// ─── Storage 설정 ────────────────────────────────────────────────────────────
// Supabase 대시보드에서 "resignation-signatures" 버킷을 Public으로 생성 필요
const SIGNATURE_BUCKET = process.env.SUPABASE_SIGNATURE_BUCKET || "resignation-signatures";

/**
 * base64 dataURL(data:<mime>;base64,<b64>) → Supabase Storage 업로드 → publicUrl 반환
 * 실패 시 null 반환 (호출자가 null로 저장 · 제출 자체는 계속)
 */
async function uploadSignatureToStorage(
  dataUrl: string,
  employeeId: number,
): Promise<string | null> {
  if (!dataUrl || typeof dataUrl !== "string") return null;
  const m = /^data:([^;,]+);base64,(.+)$/.exec(dataUrl);
  if (!m) return null;

  const mime = m[1];
  const buffer = Buffer.from(m[2], "base64");

  // 서명 이미지 크기 상한 · 2MB
  const MAX_BYTES = 2 * 1024 * 1024;
  if (buffer.length > MAX_BYTES) {
    console.warn(`[resignations/signature] 크기 초과 · emp=${employeeId} · ${(buffer.length / 1024).toFixed(0)}KB > 2048KB · Storage 업로드 생략`);
    return null;
  }

  const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  const now = Date.now();
  const objectPath = `${employeeId}/${now}.${ext}`;

  try {
    const { error: upErr } = await supabase
      .storage
      .from(SIGNATURE_BUCKET)
      .upload(objectPath, buffer, {
        contentType: mime,
        cacheControl: "31536000",
        upsert: false,
      });

    if (upErr) {
      console.warn(`[resignations/signature] Storage 업로드 실패 · emp=${employeeId} · ${upErr.message}`);
      return null;
    }

    const { data: pub } = supabase.storage.from(SIGNATURE_BUCKET).getPublicUrl(objectPath);
    if (!pub?.publicUrl) {
      console.warn(`[resignations/signature] getPublicUrl 실패 · path=${objectPath}`);
      return null;
    }

    return pub.publicUrl;
  } catch (err: any) {
    console.warn(`[resignations/signature] Storage 예외 · emp=${employeeId} · ${err?.message ?? err}`);
    return null;
  }
}

const router = Router();

// ─── 공통 · 관리자 목록 (level ≥ 9) · 2026-08-13 · #107 · 통일 ─────────────
async function fetchAdmins() {
  const { data } = await supabase
    .from("employees")
    .select("id, push_subscription")
    .gte("level", 9);
  return data ?? [];
}

// ─── GET · 리스트 ──────────────────────────────────────────────────────────
//   status=pending · 대기만 · created_at DESC
//   employeeId=<n> · 본인 전체 · created_at DESC
//   (둘 다 없으면) 전체 · created_at DESC
router.get("/api/resignations", asyncHandler(async (req, res) => {
  const { status, employeeId } = req.query;
  let q = supabase
    .from("resignation_requests")
    .select("id, employee_id, employee_name, position, hire_date, last_work_date, reason, reason_detail, handover_notes, signature_url, pdf_url, status, approved_by, approved_by_id, approved_at, reject_reason, created_at")
    .order("created_at", { ascending: false });

  if (status && typeof status === "string" && status !== "all") {
    q = q.eq("status", status);
  }
  if (employeeId) {
    q = q.eq("employee_id", Number(employeeId));
  }

  const { data, error } = await q;
  if (error) {
    // 테이블 미생성 시 · 빈 배열 + 안내 (500 대신 200)
    if (/relation .* does not exist|table .* not found/i.test(error.message)) {
      console.warn("[resignations] resignation_requests 테이블 미생성 · migrations/create_resignation_requests.sql 실행 필요");
      return res.json([]);
    }
    throw new HttpError(500, error.message);
  }
  res.json(data ?? []);
}));

// ─── GET · 대기 카운트 (승인대기 배지) ────────────────────────────────────
router.get("/api/resignations/pending-count", asyncHandler(async (_req, res) => {
  const { count, error } = await supabase
    .from("resignation_requests")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending");
  if (error) {
    if (/relation .* does not exist|table .* not found/i.test(error.message)) {
      return res.json({ count: 0 });
    }
    throw new HttpError(500, error.message);
  }
  res.json({ count: count ?? 0 });
}));

// ─── POST · 제출 ──────────────────────────────────────────────────────────
router.post("/api/resignations", authorize(1), validateBody(CreateResignationSchema), asyncHandler(async (req, res) => {
  const {
    employee_id,
    employee_name,
    position,
    hire_date,
    last_work_date,
    reason,
    reason_detail,
    handover_notes,
    signature_data_url,
    pdf_url,
  } = req.body;

  // 2026-08-29 · 보안 P1 N14 fix · IDOR 방어 · 본인 or 관리자(lv9) 만 자신 명의 사직서 제출 가능
  const session = getSession(req);
  if (session && Number(session.sub) !== Number(employee_id) && (session.level ?? 0) < 9) {
    throw new HttpError(403, "본인 또는 관리자만 사직서 제출 가능", "FORBIDDEN");
  }

  // ── 서명 이미지 · Storage 업로드 (실패해도 제출 계속) ──────────────────
  let signature_url: string | null = null;
  if (signature_data_url) {
    signature_url = await uploadSignatureToStorage(
      String(signature_data_url),
      Number(employee_id),
    );
  }

  const { data, error } = await supabase
    .from("resignation_requests")
    .insert([{
      employee_id: Number(employee_id),
      employee_name: String(employee_name),
      position: position ?? null,
      hire_date: hire_date || null,
      last_work_date,
      reason: String(reason),
      reason_detail: reason_detail ?? null,
      handover_notes: handover_notes ?? null,
      // deprecated · 하위 호환 · 신규 레코드도 임시 유지 (클라이언트 이관 완료 후 중단 예정)
      signature_data_url: signature_data_url ?? null,
      // 신규 · Storage URL
      signature_url,
      pdf_url: pdf_url ?? null,
      status: "pending",
    }])
    .select()
    .single();
  if (error) throw new HttpError(500, error.message);

  // ── 관리자 통보 (level ≥ 8) · Web Push + in-app notifications ──
  const admins = await fetchAdmins();
  const pushTargets = admins.filter(a => a.push_subscription);
  await Promise.allSettled(
    pushTargets.map(a =>
      webpush.sendNotification(
        a.push_subscription as webpush.PushSubscription,
        JSON.stringify({
          title: "사직서 제출 도착",
          body: `${employee_name}님이 사직서를 제출했습니다. (사유: ${reason})`,
          url: "/",
          tag: `resignation-new-${data?.id}`,
        })
      ).catch(() => null)
    )
  );
  await Promise.allSettled(
    admins.map(a =>
      notificationsService.create({
        employee_id: a.id,
        title: "사직서 제출 도착",
        body: `${employee_name}님이 사직서를 제출했습니다.` +
              ` (마지막 근무일: ${last_work_date} · 사유: ${reason})`,
        type: "warning",
      }).catch(() => null)
    )
  );

  res.status(201).json(data);
}));

// ─── PATCH · 승인/반려 ────────────────────────────────────────────────────
router.patch("/api/resignations/:id", authorize(5), validateBody(ReviewResignationSchema), asyncHandler(async (req, res) => {
  const { status, reject_reason } = req.body;

  // 2026-08-29 · 보안 P1 N15 fix · approved_by/id · 세션에서 서버 파생 · 클라이언트 위조 방지
  const session = getSession(req);
  const update: Record<string, unknown> = {
    status,
    approved_at: new Date().toISOString(),
    approved_by: session?.name ?? null,
    approved_by_id: session?.sub ?? null,
  };
  if (status === "rejected" && reject_reason) update.reject_reason = String(reject_reason);

  const { data, error } = await supabase
    .from("resignation_requests")
    .update(update)
    .eq("id", req.params.id)
    .select()
    .single();
  if (error) throw new HttpError(500, error.message);
  if (!data) throw notFound("not found");

  const label = status === "approved" ? "승인" : status === "rejected" ? "반려" : "철회";

  // ── 승인 시 · employees.retire_date 자동 세팅 (실패해도 무시) ──
  if (status === "approved" && data.employee_id && data.last_work_date) {
    await supabase
      .from("employees")
      .update({ "retireDate": data.last_work_date })
      .eq("id", data.employee_id)
      .then(() => null, () => null);
  }

  // ── 신청자에게 통보 ──
  const { data: emp } = await supabase
    .from("employees")
    .select("push_subscription")
    .eq("id", data.employee_id)
    .maybeSingle();

  await notificationsService.create({
    employee_id: data.employee_id,
    title: `사직서 ${label}`,
    body: `제출하신 사직서가 ${label}되었습니다.` +
          (status === "rejected" && reject_reason ? ` — ${reject_reason}` : ""),
    type: status === "approved" ? "success" : status === "rejected" ? "alert" : "info",
  }).catch(() => null);

  if (emp?.push_subscription) {
    await webpush.sendNotification(
      emp.push_subscription as webpush.PushSubscription,
      JSON.stringify({
        title: `사직서 ${label}`,
        body: `제출하신 사직서가 ${label}되었습니다.` +
              (status === "rejected" && reject_reason ? ` (${reject_reason})` : ""),
        url: "/",
        tag: `resignation-reviewed-${data.id}`,
      })
    ).catch(() => null);
  }

  res.json(data);
}));

// ─── DELETE · 본인 철회 (pending 만) ─────────────────────────────────────
router.delete("/api/resignations/:id", authorize(9), asyncHandler(async (req, res) => {
  const { error } = await supabase
    .from("resignation_requests")
    .delete()
    .eq("id", req.params.id)
    .eq("status", "pending");
  if (error) throw new HttpError(500, error.message);
  res.json({ ok: true });
}));

export default router;
