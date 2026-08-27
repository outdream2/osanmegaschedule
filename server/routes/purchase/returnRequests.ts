// 2026-08-16 · asyncHandler + HttpError 프레임워크 적용
// server/routes/returnRequests.ts
// 반품요청 저장·조회 · 2026-07-30 (사용자 요청)
//   - POST   /api/return-requests               · 반품요청 생성
//   - GET    /api/return-requests               · 리스트 (?supplier=X · ?status=X · ?days=N · ?limit=N)
//   - GET    /api/return-requests/by-supplier   · 공급사별 그룹 요약 (?days=N)
//   - PATCH  /api/return-requests/:id           · status·qty·reason 수정
//   - DELETE /api/return-requests/:id           · 삭제
//   - POST   /api/return-requests/bulk-send     · 선택 반품요청 · 공급사별 그룹 발송 (이메일·문자)

import { Router } from "express";
import { supabase } from "../../../src/supabase/client";
// 2026-08-13 · #107 · 반품요청 · 관리자 알림 (인앱 + push)
import { notificationsService } from "../../services/notificationsService";
// 2026-08-16 · #112-E1 Phase 2 · 매니저 DELETE
import { authorize } from "../../middleware/requireAuth";
import { asyncHandler } from "../../middleware/asyncHandler";
import { badRequest, notFound, HttpError } from "../../middleware/errorHandler";
// 2026-08-27 · 감사 지적 #4 · Zod 입력 검증 프레임워크 표준
import { validateBody } from "../../middleware/zodValidate";
import {
  ReturnRequestCreateSchema,
  ReturnRequestUpdateSchema,
  ReturnRequestBulkSendSchema,
  canTransitionStatus,
} from "../../../src/shared/schemas/returnRequests";

const router = Router();

// POST /api/return-requests
// body: { product_code, product_name, supplier, qty, current_stock, purchase_price, reason?, requested_by?, requested_by_id? }
router.post("/api/return-requests", authorize(5), validateBody(ReturnRequestCreateSchema), asyncHandler(async (req, res) => {
  const b = req.body;  // Zod 로 검증됨 · 안전
  const row = {
    product_code: b.product_code.trim(),
    product_name: (b.product_name ?? "").trim() || null,
    supplier:     (b.supplier ?? "").trim() || null,
    qty:          b.qty,
    current_stock:  b.current_stock ?? 0,
    purchase_price: b.purchase_price ?? 0,
    reason:       (b.reason ?? b.note ?? "").trim() || null,
    requested_by: (b.requested_by ?? "").trim() || null,
    requested_by_id: b.requested_by_id ?? null,
    status: "pending" as const,
  };
  const { data, error } = await supabase
    .from("return_requests")
    .insert([row])
    .select("id, created_at, product_code, product_name, supplier, qty, current_stock, purchase_price, reason, requested_by, requested_by_id, status")
    .single();
  if (error) throw new HttpError(500, error.message);
  // 2026-08-13 · #107 · 관리자 broadcast · 반품 요청
  notificationsService.notifyAllAdmins({
    title: "↩ 반품 요청",
    body: `${row.supplier ?? "공급사 미지정"} · ${row.product_name ?? row.product_code} · ${row.qty}개 반품 요청 (요청자: ${row.requested_by ?? "-"}).`,
    type: "warning",
    push: { url: "/", tag: `return-req-${data?.id}` },
  }).catch(() => null);
  res.json({ ok: true, row: data });
}));

// GET /api/return-requests?supplier=X&status=X&days=30&limit=200
router.get("/api/return-requests", asyncHandler(async (req, res) => {
  const supplier = String(req.query.supplier ?? "").trim();
  const status = String(req.query.status ?? "").trim();
  const days = Math.max(1, Math.min(365, parseInt(String(req.query.days ?? "60"), 10) || 60));
  const limit = Math.max(1, Math.min(2000, parseInt(String(req.query.limit ?? "200"), 10) || 200));
  const since = new Date(); since.setDate(since.getDate() - days);
  let q = supabase
    .from("return_requests")
    .select("id, created_at, product_code, product_name, supplier, qty, current_stock, purchase_price, reason, requested_by, requested_by_id, status")
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(limit);
  if (supplier) q = q.ilike("supplier", `%${supplier}%`);
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) {
    if (/relation .* does not exist/i.test(error.message)) return res.json({ rows: [], count: 0, warning: "return_requests 테이블 없음" });
    throw new HttpError(500, error.message);
  }
  // T-SLIM E · 표준 shape · { rows, count } · 프론트는 rows 만 소비 (count 추가 필드)
  res.json({ rows: data ?? [], count: (data ?? []).length });
}));

// GET /api/return-requests/by-supplier?days=60
// 공급사별 요약 · [{ supplier, count, total_qty, total_amount, statuses: {pending, sent, done, cancelled} }]
router.get("/api/return-requests/by-supplier", asyncHandler(async (req, res) => {
  const days = Math.max(1, Math.min(365, parseInt(String(req.query.days ?? "60"), 10) || 60));
  const since = new Date(); since.setDate(since.getDate() - days);
  const { data, error } = await supabase
    .from("return_requests")
    .select("id, created_at, product_code, product_name, supplier, qty, current_stock, purchase_price, reason, requested_by, requested_by_id, status")
    .gte("created_at", since.toISOString());
  if (error) {
    if (/relation .* does not exist/i.test(error.message)) return res.json({ groups: [] });
    throw new HttpError(500, error.message);
  }
  const map = new Map<string, { supplier: string; count: number; total_qty: number; total_amount: number; statuses: Record<string, number>; latest_at: string; items: any[] }>();
  for (const r of (data ?? [])) {
    const sup = String((r as any).supplier ?? "미지정");
    const cur = map.get(sup) ?? { supplier: sup, count: 0, total_qty: 0, total_amount: 0, statuses: {}, latest_at: "", items: [] };
    cur.count++;
    cur.total_qty += Number((r as any).qty ?? 0) || 0;
    cur.total_amount += (Number((r as any).qty ?? 0) || 0) * (Number((r as any).purchase_price ?? 0) || 0);
    const st = String((r as any).status ?? "pending");
    cur.statuses[st] = (cur.statuses[st] ?? 0) + 1;
    const ca = String((r as any).created_at ?? "");
    if (!cur.latest_at || ca > cur.latest_at) cur.latest_at = ca;
    cur.items.push(r);
    map.set(sup, cur);
  }
  const groups = [...map.values()].sort((a, b) => b.total_amount - a.total_amount);
  res.json({ days, groups });
}));

// PATCH /api/return-requests/:id
// body: { qty?, reason?, status?  }
router.patch("/api/return-requests/:id", authorize(5), validateBody(ReturnRequestUpdateSchema), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) throw badRequest("invalid id");
  const b = req.body;  // Zod 검증됨
  const patch: any = {};
  if (b.qty !== undefined) patch.qty = b.qty;
  if (b.reason !== undefined) patch.reason = b.reason ? String(b.reason).trim() : null;
  // 2026-08-27 · 감사 #4 2차 · 상태 전이 규칙 검증
  if (b.status !== undefined) {
    const { data: cur, error: fErr } = await supabase.from("return_requests").select("status").eq("id", id).single();
    if (fErr) throw new HttpError(500, fErr.message);
    if (cur?.status && !canTransitionStatus(cur.status as any, b.status)) {
      throw badRequest(`상태 전이 금지: ${cur.status} → ${b.status}`);
    }
    patch.status = b.status;
  }
  const { data, error } = await supabase
    .from("return_requests")
    .update(patch)
    .eq("id", id)
    .select("id, created_at, product_code, product_name, supplier, qty, current_stock, purchase_price, reason, requested_by, requested_by_id, status")
    .single();
  if (error) throw new HttpError(500, error.message);
  res.json({ ok: true, row: data });
}));

// DELETE /api/return-requests/:id
router.delete("/api/return-requests/:id", authorize(5), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) throw badRequest("invalid id");
  const { error } = await supabase.from("return_requests").delete().eq("id", id);
  if (error) throw new HttpError(500, error.message);
  res.json({ ok: true });
}));

// POST /api/return-requests/bulk-send
// body: { ids: number[], channels: { email: boolean, sms: boolean }, sender_note?: string }
// 공급사별로 그룹핑 · 각 공급사 담당자에게 반품요청 발송 · 발송된 요청은 status=sent 로 업데이트
router.post("/api/return-requests/bulk-send", authorize(5), validateBody(ReturnRequestBulkSendSchema), asyncHandler(async (req, res) => {
  const ids: number[] = req.body.ids;  // Zod 검증됨 (min 1 · max 500)
  // 대상 조회
  const { data: rows, error } = await supabase
    .from("return_requests")
    .select("id, created_at, product_code, product_name, supplier, qty, current_stock, purchase_price, reason, requested_by, requested_by_id, status")
    .in("id", ids);
  if (error) throw new HttpError(500, error.message);
  if (!rows || rows.length === 0) throw notFound("대상 없음");
  // 공급사별 그룹핑 · 발송 로직 (별도 이메일/문자 서비스 연동은 후속)
  const bySup = new Map<string, any[]>();
  for (const r of rows) {
    const sup = String((r as any).supplier ?? "미지정");
    const arr = bySup.get(sup) ?? [];
    arr.push(r);
    bySup.set(sup, arr);
  }
  // status=sent 로 업데이트 (실제 발송 채널 연동은 후속)
  const { error: uErr } = await supabase
    .from("return_requests")
    .update({ status: "sent" })
    .in("id", ids);
  if (uErr) throw new HttpError(500, uErr.message);
  const groups = [...bySup.entries()].map(([supplier, items]) => ({
    supplier,
    count: items.length,
    total_qty: items.reduce((s, x) => s + (Number(x.qty ?? 0) || 0), 0),
  }));
  // 2026-08-13 · #107 · 반품 일괄 발송 · 관리자 알림
  notificationsService.notifyAllAdmins({
    title: "↩ 반품 발송",
    body: `${groups.length}개 공급사 · ${rows.length}건 반품 요청 발송됨.`,
    type: "success",
    push: { url: "/", tag: `return-bulk-${Date.now()}` },
  }).catch(() => null);
  res.json({ ok: true, sent_count: rows.length, groups });
}));

export default router;
