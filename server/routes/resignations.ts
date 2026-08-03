// server/routes/resignations.ts
// 2026-08-03 · #179+#180+#181 · 사직서 제출/조회/승인/반려 API
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
//
// leave.ts 라우터를 벤치마크 · 동일한 push+notifications 흐름 유지
import { Router } from "express";
import webpush from "web-push";
import { supabase } from "../../src/supabase/client";
import { notificationsService } from "../../src/services/notificationsService";

const router = Router();

// ─── 공통 · 관리자 목록 (level ≥ 8) ────────────────────────────────────────
async function fetchAdmins() {
  const { data } = await supabase
    .from("employees")
    .select("id, push_subscription")
    .gte("level", 8);
  return data ?? [];
}

// ─── GET · 리스트 ──────────────────────────────────────────────────────────
//   status=pending · 대기만 · created_at DESC
//   employeeId=<n> · 본인 전체 · created_at DESC
//   (둘 다 없으면) 전체 · created_at DESC
router.get("/api/resignations", async (req, res) => {
  const { status, employeeId } = req.query;
  try {
    let q = supabase
      .from("resignation_requests")
      .select("*")
      .order("created_at", { ascending: false });

    if (status && typeof status === "string" && status !== "all") {
      q = q.eq("status", status);
    }
    if (employeeId) {
      q = q.eq("employee_id", Number(employeeId));
    }

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return res.json(data ?? []);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET · 대기 카운트 (승인대기 배지) ────────────────────────────────────
router.get("/api/resignations/pending-count", async (_req, res) => {
  try {
    const { count, error } = await supabase
      .from("resignation_requests")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    return res.json({ count: count ?? 0 });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST · 제출 ──────────────────────────────────────────────────────────
router.post("/api/resignations", async (req, res) => {
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
  } = req.body ?? {};

  if (!employee_id || !employee_name || !last_work_date || !reason) {
    return res.status(400).json({ error: "필수 항목이 누락되었습니다 (사원·마지막 근무일·사유)." });
  }

  try {
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
        signature_data_url: signature_data_url ?? null,
        pdf_url: pdf_url ?? null,
        status: "pending",
      }])
      .select()
      .single();
    if (error) throw new Error(error.message);

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

    return res.status(201).json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── PATCH · 승인/반려 ────────────────────────────────────────────────────
router.patch("/api/resignations/:id", async (req, res) => {
  const { status, reject_reason, approved_by, approved_by_id } = req.body ?? {};
  if (!status || !["approved", "rejected", "withdrawn"].includes(status)) {
    return res.status(400).json({ error: "status must be 'approved' | 'rejected' | 'withdrawn'" });
  }
  try {
    const update: Record<string, unknown> = {
      status,
      approved_at: new Date().toISOString(),
    };
    if (approved_by)    update.approved_by = String(approved_by);
    if (approved_by_id) update.approved_by_id = Number(approved_by_id);
    if (status === "rejected" && reject_reason) update.reject_reason = String(reject_reason);

    const { data, error } = await supabase
      .from("resignation_requests")
      .update(update)
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    if (!data) return res.status(404).json({ error: "not found" });

    const label = status === "approved" ? "승인" : status === "rejected" ? "반려" : "철회";

    // ── 승인 시 · employees.retire_date 자동 세팅 (실패해도 무시) ──
    if (status === "approved" && data.employee_id && data.last_work_date) {
      await supabase
        .from("employees")
        .update({ retire_date: data.last_work_date })
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

    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── DELETE · 본인 철회 (pending 만) ─────────────────────────────────────
router.delete("/api/resignations/:id", async (req, res) => {
  try {
    const { error } = await supabase
      .from("resignation_requests")
      .delete()
      .eq("id", req.params.id)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
