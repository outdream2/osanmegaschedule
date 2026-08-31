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
// 2026-08-31 · #9 Phase A · lender_party_id · borrower_party_id · contract_no · overdue_notified_at
const SELECT_COLS = "id, created_at, direction, supplier, product_code, product_name, qty, unit_price, due_date, note, signature_url, status, settled_at, created_by, created_by_id, return_signature_url, returned_by, returned_by_id, returned_at, return_note, lender_party_id, borrower_party_id, contract_no, overdue_notified_at";

// GET /api/borrowings?status=open&supplier=X&direction=lend&days=90&limit=200
// 2026-08-29 · 보안 감사 P2 fix · authorize(1) · 서명 dataURL 등 민감정보 노출 방지
router.get("/api/borrowings", authorize(1), asyncHandler(async (req, res) => {
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
// 2026-08-31 · #9 Phase A · lender_party_id · borrower_party_id · signatures[] 확장
//   · signatures = [{ role, signer_name, signature_url, stamp_url?, intent_text? }]
router.post("/api/borrowings", authorize(5), asyncHandler(async (req, res) => {
  const b = req.body ?? {};
  const direction = String(b.direction ?? "lend").trim();
  if (direction !== "lend" && direction !== "borrow") throw badRequest("direction must be lend or borrow");
  const qty = Math.max(0, Number(b.qty ?? 0) || 0);
  if (qty <= 0) throw badRequest("qty > 0 필수");
  const row: Record<string, unknown> = {
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
    lender_party_id:   b.lender_party_id != null ? Number(b.lender_party_id) : null,
    borrower_party_id: b.borrower_party_id != null ? Number(b.borrower_party_id) : null,
  };
  const { data, error } = await supabase.from("borrowings").insert([row]).select(SELECT_COLS).single();
  if (error) throw new HttpError(500, error.message);
  // Phase A · signatures[] 있으면 · borrowing_signatures insert
  const signatures = Array.isArray(b.signatures) ? b.signatures : [];
  if (signatures.length > 0 && data?.id) {
    const sigRows = signatures
      .filter((s: any) => s && s.role && s.signature_url)
      .map((s: any) => ({
        borrowing_id: data.id,
        role: String(s.role),
        signer_name: String(s.signer_name ?? "").trim() || "-",
        signer_id: s.signer_id != null ? Number(s.signer_id) : null,
        party_id: s.party_id != null ? Number(s.party_id) : null,
        signature_url: String(s.signature_url),
        stamp_url: s.stamp_url ? String(s.stamp_url) : null,
        ip_address: (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || (req as any).ip || null,
        user_agent: String(req.headers["user-agent"] ?? ""),
        intent_text: s.intent_text ? String(s.intent_text) : null,
      }));
    if (sigRows.length > 0) {
      const { error: sigErr } = await supabase.from("borrowing_signatures").insert(sigRows);
      if (sigErr) console.warn("[borrowings POST · signatures]", sigErr.message);
    }
  }
  res.json({ ok: true, row: data });
}));

// ═══════════════════════════════════════════════════════
// 2026-08-31 · #9 Phase A · 당사자 (parties) · 자동완성·upsert
// ═══════════════════════════════════════════════════════
// GET /api/borrowings/parties?q=...  · 검색 (name·contact_name)
router.get("/api/borrowings/parties", authorize(1), asyncHandler(async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  let query = supabase
    .from("borrowing_parties")
    .select("id, party_type, vendor_id, employee_id, name, contact_name, contact_phone, contact_email, address, memo")
    .order("created_at", { ascending: false })
    .limit(50);
  if (q) query = query.or(`name.ilike.%${q}%,contact_name.ilike.%${q}%`);
  const { data, error } = await query;
  if (error) {
    if (/relation .* does not exist/i.test(error.message)) {
      return res.json({ rows: [], warning: "borrowing_parties 테이블 없음 (SQL 미실행)" });
    }
    throw new HttpError(500, error.message);
  }
  res.json({ rows: data ?? [] });
}));

// POST /api/borrowings/parties · upsert (name+phone dedup 없음 · 명시 create)
router.post("/api/borrowings/parties", authorize(5), asyncHandler(async (req, res) => {
  const b = req.body ?? {};
  const name = String(b.name ?? "").trim();
  if (!name) throw badRequest("name 필수");
  const partyType = String(b.party_type ?? "external").trim();
  if (!["self", "vendor", "external"].includes(partyType)) throw badRequest("party_type invalid");
  const row = {
    party_type: partyType,
    vendor_id: b.vendor_id != null ? Number(b.vendor_id) : null,
    employee_id: b.employee_id != null ? Number(b.employee_id) : null,
    name,
    contact_name: String(b.contact_name ?? "").trim() || null,
    contact_phone: String(b.contact_phone ?? "").trim() || null,
    contact_email: String(b.contact_email ?? "").trim() || null,
    address: String(b.address ?? "").trim() || null,
    memo: String(b.memo ?? "").trim() || null,
  };
  const { data, error } = await supabase.from("borrowing_parties").insert([row]).select("*").single();
  if (error) throw new HttpError(500, error.message);
  res.json({ ok: true, row: data });
}));

// POST /api/borrowings/:id/signatures · 사후 서명 추가 (반환·증인 등)
router.post("/api/borrowings/:id/signatures", authorize(5), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) throw badRequest("invalid id");
  const b = req.body ?? {};
  const role = String(b.role ?? "").trim();
  if (!["lender", "borrower", "lender_return", "borrower_return", "witness"].includes(role)) throw badRequest("role invalid");
  const signatureUrl = String(b.signature_url ?? "").trim();
  if (!signatureUrl) throw badRequest("signature_url 필수");
  const row = {
    borrowing_id: id,
    role,
    signer_name: String(b.signer_name ?? "").trim() || "-",
    signer_id: b.signer_id != null ? Number(b.signer_id) : null,
    party_id: b.party_id != null ? Number(b.party_id) : null,
    signature_url: signatureUrl,
    stamp_url: b.stamp_url ? String(b.stamp_url) : null,
    ip_address: (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || (req as any).ip || null,
    user_agent: String(req.headers["user-agent"] ?? ""),
    intent_text: b.intent_text ? String(b.intent_text) : null,
  };
  const { data, error } = await supabase.from("borrowing_signatures").insert([row]).select("*").single();
  if (error) throw new HttpError(500, error.message);
  res.json({ ok: true, row: data });
}));

// GET /api/borrowings/:id/signatures · 서명 이력 조회
router.get("/api/borrowings/:id/signatures", authorize(1), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) throw badRequest("invalid id");
  const { data, error } = await supabase
    .from("borrowing_signatures")
    .select("id, role, signer_name, signer_id, party_id, signature_url, stamp_url, signed_at, ip_address, intent_text")
    .eq("borrowing_id", id)
    .order("signed_at", { ascending: true });
  if (error) {
    if (/relation .* does not exist/i.test(error.message)) return res.json({ rows: [] });
    throw new HttpError(500, error.message);
  }
  res.json({ rows: data ?? [] });
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
