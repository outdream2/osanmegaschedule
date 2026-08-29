// server/routes/payment/borrowings.ts
// 2026-08-25 · 사용자 지시 · 결제 > 차용입력 · 공급사↔약국 상품 차용 기록
//   · GET    /api/borrowings                · 리스트 (?status · ?supplier · ?direction · ?days)
//   · POST   /api/borrowings                · 신규 등록
//   · PATCH  /api/borrowings/:id            · 상태·수량·메모·서명 수정 (settle · cancel · reopen)
//   · DELETE /api/borrowings/:id            · 삭제 (authorize(5))

import { Router } from "express";
import { supabase } from "../../../src/supabase/client";
import { authorize } from "../../middleware/requireAuth";
import { asyncHandler } from "../../middleware/asyncHandler";
import { badRequest, HttpError, unauthorized } from "../../middleware/errorHandler";
import { getSession } from "../../middleware/requireAuth";

const router = Router();

// 2026-08-29 · #130 A안 Phase 1b · return_* 필드 추가 (마이그레이션 20260829)
const SELECT_COLS = "id, created_at, direction, supplier, product_code, product_name, qty, unit_price, due_date, note, signature_url, status, settled_at, created_by, created_by_id, return_signature_url, returned_by, returned_by_id, returned_at, return_note";

// GET /api/borrowings?status=open&supplier=X&direction=lend&days=90&limit=200
router.get("/api/borrowings", asyncHandler(async (req, res) => {
  const status    = String(req.query.status ?? "").trim();
  const supplier  = String(req.query.supplier ?? "").trim();
  const direction = String(req.query.direction ?? "").trim();
  const days      = Math.max(1, Math.min(365, parseInt(String(req.query.days ?? "180"), 10) || 180));
  const limit     = Math.max(1, Math.min(2000, parseInt(String(req.query.limit ?? "500"), 10) || 500));
  const since = new Date(); since.setDate(since.getDate() - days);
  let q = supabase
    .from("borrowings")
    .select(SELECT_COLS)
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(limit);
  if (status)    q = q.eq("status", status);
  if (direction) q = q.eq("direction", direction);
  if (supplier)  q = q.ilike("supplier", `%${supplier}%`);
  const { data, error } = await q;
  if (error) {
    if (/relation .* does not exist/i.test(error.message)) {
      return res.json({ rows: [], count: 0, warning: "borrowings 테이블 없음" });
    }
    throw new HttpError(500, error.message);
  }
  res.json({ rows: data ?? [], count: (data ?? []).length });
}));

// POST /api/borrowings
// body: { direction · supplier · product_code · product_name · qty · unit_price? · due_date? · note? · signature_url? · created_by? · created_by_id? }
router.post("/api/borrowings", authorize(5), asyncHandler(async (req, res) => {
  const b = req.body ?? {};
  const direction = String(b.direction ?? "lend").trim();
  if (direction !== "lend" && direction !== "borrow") throw badRequest("direction must be lend or borrow");
  const qty = Math.max(0, Number(b.qty ?? 0) || 0);
  if (qty <= 0) throw badRequest("qty > 0 필수");
  const row = {
    direction,
    supplier:      String(b.supplier ?? "").trim() || null,
    product_code:  String(b.product_code ?? "").trim() || null,
    product_name:  String(b.product_name ?? "").trim() || null,
    qty,
    unit_price:    b.unit_price != null && b.unit_price !== "" ? Number(b.unit_price) : null,
    due_date:      String(b.due_date ?? "").trim() || null,
    note:          String(b.note ?? "").trim() || null,
    signature_url: String(b.signature_url ?? "").trim() || null,
    status:        "open",
    created_by:    String(b.created_by ?? "").trim() || null,
    created_by_id: b.created_by_id != null ? Number(b.created_by_id) : null,
  };
  const { data, error } = await supabase.from("borrowings").insert([row]).select(SELECT_COLS).single();
  if (error) throw new HttpError(500, error.message);
  res.json({ ok: true, row: data });
}));

// PATCH /api/borrowings/:id
// body: { status? · qty? · unit_price? · due_date? · note? · signature_url? }
router.patch("/api/borrowings/:id", authorize(5), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) throw badRequest("invalid id");
  const b = req.body ?? {};
  const patch: Record<string, unknown> = {};
  if (b.status != null) {
    const s = String(b.status).trim();
    if (!["open", "settled", "cancelled"].includes(s)) throw badRequest("invalid status");
    patch.status = s;
    // settled 로 전환 시 settled_at 자동 세팅 · 그 외 상태로 전환 시 null 로 되돌림
    patch.settled_at = s === "settled" ? new Date().toISOString() : null;
  }
  if (b.qty != null)           patch.qty = Math.max(0, Number(b.qty) || 0);
  if (b.unit_price !== undefined) patch.unit_price = b.unit_price === null || b.unit_price === "" ? null : Number(b.unit_price);
  if (b.due_date !== undefined)   patch.due_date = String(b.due_date ?? "").trim() || null;
  if (b.note !== undefined)       patch.note = String(b.note ?? "").trim() || null;
  if (b.signature_url !== undefined) patch.signature_url = String(b.signature_url ?? "").trim() || null;
  if (Object.keys(patch).length === 0) throw badRequest("수정 필드 없음");
  const { data, error } = await supabase.from("borrowings").update(patch).eq("id", id).select(SELECT_COLS).single();
  if (error) throw new HttpError(500, error.message);
  res.json({ ok: true, row: data });
}));

// 2026-08-29 · #130 A안 Phase 1b · PATCH /api/borrowings/:id/return · 반환 처리 + 서명 필수
// body: { return_signature_url · return_note? }
// · returned_by · returned_by_id · returned_at 서버 자동 세팅
// · status = 'settled' · settled_at 도 함께 세팅 (기존 PATCH 동일 규칙)
router.patch("/api/borrowings/:id/return", authorize(5), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) throw badRequest("invalid id");
  const session = getSession(req);
  if (!session) throw unauthorized("로그인 필요");
  const b = req.body ?? {};
  const signature = String(b.return_signature_url ?? "").trim();
  if (!signature) throw badRequest("반환 서명 필수 · return_signature_url");
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    return_signature_url: signature,
    returned_by:    session.name,
    returned_by_id: session.sub,
    returned_at:    now,
    return_note:    String(b.return_note ?? "").trim() || null,
    status:         "settled",
    settled_at:     now,
  };
  const { data, error } = await supabase.from("borrowings").update(patch).eq("id", id).select(SELECT_COLS).single();
  if (error) throw new HttpError(500, error.message);
  res.json({ ok: true, row: data });
}));

// DELETE /api/borrowings/:id · 매니저 lv5+
router.delete("/api/borrowings/:id", authorize(5), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) throw badRequest("invalid id");
  const { error } = await supabase.from("borrowings").delete().eq("id", id);
  if (error) throw new HttpError(500, error.message);
  res.json({ ok: true });
}));

export default router;
