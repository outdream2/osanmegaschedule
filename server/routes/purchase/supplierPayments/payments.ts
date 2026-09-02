// supplierPayments/payments.ts — /api/supplier-payments CRUD + /api/supplier-payments/latest-per-supplier + pending-count + open-invoices
import { Router } from "express";
import { supabase } from "../../../../src/supabase/client";
import { notificationsService } from "../../../services/notificationsService";
import { authorize } from "../../../middleware/requireAuth";
import { asyncHandler } from "../../../middleware/asyncHandler";
import { badRequest, HttpError } from "../../../middleware/errorHandler";
import { validateBody } from "../../../middleware/zodValidate";
import { CreateSupplierPaymentSchema, UpdateSupplierPaymentSchema } from "../../../../src/shared/schemas/supplierPayments";

const router = Router();

// GET /api/supplier-payments?supplier=X&days=90
router.get("/api/supplier-payments", asyncHandler(async (req, res) => {
  const supplier = String(req.query.supplier ?? "").trim();
  const days = Math.max(1, Math.min(3650, parseInt(String(req.query.days ?? "90"), 10) || 90));

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffYmd = cutoffDate.toISOString().slice(0, 10);

  let q = supabase
    .from("supplier_payments")
    .select("id, supplier_name, payment_date, amount, method, memo, created_by, created_by_id, created_at")
    .gte("payment_date", cutoffYmd)
    .order("payment_date", { ascending: false })
    .order("id", { ascending: false });

  if (supplier) q = q.eq("supplier_name", supplier);

  const { data: payments, error } = await q;
  if (error) {
    if (/relation .* does not exist/i.test(error.message)) {
      return res.json({ rows: [], warning: "supplier_payments 테이블 없음 (docs SQL 실행 필요)" });
    }
    throw new HttpError(500, error.message);
  }

  // 2026-08-30 · allocations 기능 제거 · 항상 빈 배열 반환 (프론트 호환)
  const rows = (payments ?? []).map(p => ({ ...p, allocations: [] as any[] }));
  return res.json({ rows });
}));

// GET /api/supplier-payments/latest-per-supplier
router.get("/api/supplier-payments/latest-per-supplier", asyncHandler(async (_req, res) => {
  const { data, error } = await supabase
    .from("supplier_payments")
    .select("supplier_name, payment_date, amount, id")
    .order("payment_date", { ascending: false })
    .order("id", { ascending: false });
  if (error) {
    if (/relation .* does not exist/i.test(error.message)) {
      return res.json({ rows: [], warning: "supplier_payments 테이블 없음" });
    }
    throw new HttpError(500, error.message);
  }
  const map = new Map<string, { latest_payment_date: string; latest_payment_amount: number }>();
  for (const r of data ?? []) {
    const nm = String(r.supplier_name ?? "").trim();
    if (!nm || map.has(nm)) continue;
    map.set(nm, {
      latest_payment_date: String(r.payment_date ?? ""),
      latest_payment_amount: Number(r.amount) || 0,
    });
  }
  const rows = Array.from(map.entries()).map(([supplier_name, v]) => ({ supplier_name, ...v }));
  return res.json({ rows });
}));

// GET /api/supplier-payments/pending-count
// 2026-09-01 · P3 최적화 · ocr_confirmed_items 2회→1회 · Promise.all 병렬 (3→2 왕복)
router.get("/api/supplier-payments/pending-count", asyncHandler(async (_req, res) => {
  const [invRes, payRes] = await Promise.all([
    supabase.from("ocr_confirmed_items").select("supplier_name, amount"),
    supabase.from("supplier_payments").select("supplier_name, amount"),
  ]);
  if (invRes.error) {
    if (/relation .* does not exist/i.test(invRes.error.message)) return res.json({ count: 0 });
    throw new HttpError(500, invRes.error.message);
  }
  const invList = invRes.data ?? [];
  if (invList.length === 0) return res.json({ count: 0 });

  // 2026-08-30 · allocations 제거 · 공급사별 SUM 매입 vs SUM 결제 · 차액 > 0 인 공급사 수
  const paidBySupplier = new Map<string, number>();
  for (const p of payRes.data ?? []) {
    const nm = String((p as any).supplier_name ?? "").trim();
    if (!nm) continue;
    paidBySupplier.set(nm, (paidBySupplier.get(nm) ?? 0) + (Number((p as any).amount) || 0));
  }
  const invBySupplier = new Map<string, number>();
  for (const i of invList) {
    const nm = String((i as any).supplier_name ?? "").trim();
    if (!nm) continue;
    invBySupplier.set(nm, (invBySupplier.get(nm) ?? 0) + (Number((i as any).amount) || 0));
  }
  let count = 0;
  for (const [nm, invSum] of invBySupplier) {
    const paidSum = paidBySupplier.get(nm) ?? 0;
    if (invSum - paidSum > 0.5) count++;
  }
  return res.json({ count });
}));

// POST /api/supplier-payments
router.post("/api/supplier-payments", authorize(5), validateBody(CreateSupplierPaymentSchema), asyncHandler(async (req, res) => {
  const b = req.body;
  const allocations = b.allocations;

  const allocList: Array<{ ocr_confirmed_item_id: number; allocated_amount: number }> = [];
  if (Array.isArray(allocations) && allocations.length > 0) {
    let sum = 0;
    for (const a of allocations) {
      sum += a.allocated_amount;
      allocList.push({ ocr_confirmed_item_id: a.ocr_confirmed_item_id, allocated_amount: a.allocated_amount });
    }
    if (sum > b.amount + 0.5) {
      throw badRequest(`배분 총액(${sum.toLocaleString()}) 이 결제 금액(${b.amount.toLocaleString()}) 을 초과할 수 없습니다`);
    }
  }

  const payload: Record<string, any> = {
    supplier_name: b.supplier_name.trim(),
    payment_date:  b.payment_date,
    amount:        b.amount,
    method:        b.method ?? "transfer",
    memo:          b.memo ? String(b.memo).trim() || null : null,
    // 2026-09-02 · #69 · card_id · 결제방법=card 시 credit_cards.id 매핑
    card_id:       b.card_id ?? null,
    created_by:    b.created_by ? String(b.created_by).trim() || null : null,
    created_by_id: b.created_by_id ?? null,
  };

  const { data: payRow, error: payErr } = await supabase
    .from("supplier_payments")
    .insert(payload)
    .select("id, supplier_name, payment_date, amount, method, memo, created_by, created_by_id, created_at")
    .single();

  if (payErr) throw new HttpError(500, `payment insert 실패: ${payErr.message}`);
  if (!payRow?.id) throw new HttpError(500, "payment id 획득 실패");

  // 2026-08-30 · allocations 제거 · 결제만 등록
  const allocatedRows: any[] = [];

  // 2026-08-13 · #107 · 관리자 broadcast
  notificationsService.notifyAllAdmins({
    title: "💰 결제 등록",
    body: `${b.supplier_name} · ${b.amount.toLocaleString()}원 (${payload.method}) 결제 등록됨.`,
    type: "success",
    push: { url: "/", tag: `payment-new-${payRow.id}` },
  }).catch(() => null);

  return res.status(201).json({ ...payRow, allocations: allocatedRows });
}));

// PATCH /api/supplier-payments/:id
router.patch("/api/supplier-payments/:id", authorize(5), validateBody(UpdateSupplierPaymentSchema), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) throw badRequest("invalid id");
  const b = req.body;
  const updates: Record<string, any> = {};
  if (b.method !== undefined) updates.method = b.method;
  if (b.memo !== undefined) {
    updates.memo = b.memo != null && String(b.memo).trim() ? String(b.memo).trim() : null;
  }
  const { data, error } = await supabase
    .from("supplier_payments")
    .update(updates)
    .eq("id", id)
    .select("id, supplier_name, payment_date, amount, method, memo, created_at")
    .single();
  if (error) throw new HttpError(500, error.message);
  return res.json(data);
}));

// DELETE /api/supplier-payments/:id
router.delete("/api/supplier-payments/:id", authorize(9), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) throw badRequest("invalid id");
  const { error } = await supabase.from("supplier_payments").delete().eq("id", id);
  if (error) throw new HttpError(500, error.message);
  return res.json({ ok: true });
}));

// GET /api/supplier-open-invoices?supplier=X
router.get("/api/supplier-open-invoices", asyncHandler(async (req, res) => {
  const supplier = String(req.query.supplier ?? "").trim();
  if (!supplier) throw badRequest("supplier 필수");

  const { data: invoices, error: invErr } = await supabase
    .from("ocr_confirmed_items")
    .select("id, invoice_date, saved_at, supplier, product_name, amount")
    .eq("supplier", supplier)
    .order("invoice_date", { ascending: false })
    .order("saved_at", { ascending: false })
    .limit(500);
  if (invErr) {
    if (/relation .* does not exist/i.test(invErr.message)) return res.json({ rows: [] });
    throw new HttpError(500, invErr.message);
  }
  const invList = invoices ?? [];
  if (invList.length === 0) return res.json({ rows: [] });

  // 2026-08-30 · allocations 제거 · 모두 default 값 (프론트 호환)
  const rows = invList.map((i: any) => {
    const amount = Number(i.amount) || 0;
    const date = (i.invoice_date && /^\d{4}-\d{2}-\d{2}$/.test(i.invoice_date)) ? i.invoice_date : i.saved_at;
    return {
      id: i.id,
      date,
      product_name: i.product_name,
      amount,
      allocated: 0,
      remaining: amount,
      status: "open" as const,
    };
  });

  return res.json({ rows });
}));

export default router;
