// 2026-08-16 · asyncHandler + HttpError 프레임워크 적용
// server/routes/supplierPayments.ts
// 2026-07-31 · 공급사 결제·잔고 관리 시스템 · Phase 2 API
//   · Zoho / Odoo / QuickBooks 표준: payments 원장 + allocations M:N
//   · 잔액 계산: SUM(ocr_confirmed_items.amount) - SUM(supplier_payments.amount)
//   · POST /api/supplier-payments 는 payment + allocations 를 순차 insert 후
//     allocations 실패 시 payment 롤백 (Supabase JS 는 트랜잭션 미지원 → 수동)
// 2026-08-03 · #193 · VAT 통합 · supplier-ledger · supplier-purchase-detail 응답에
//   vat_amount·supply_amount 필드 추가 (vendor.vat_included 반영 · row 저장값 있으면 우선)
import { Router } from "express";
import { supabase } from "../../../src/supabase/client";
import { queryPurchaseDetails } from "../../utils/purchaseDetailsQuery";
// 2026-08-13 · #107 · 결제 요청 · 관리자 알림 (인앱 + push)
import { notificationsService } from "../../services/notificationsService";
// 2026-08-16 · #112-E1
import { authorize } from "../../middleware/requireAuth";
import { asyncHandler } from "../../middleware/asyncHandler";
import { badRequest } from "../../middleware/errorHandler";

const router = Router();

// ─────────────────────────────────────────────────────────────────────
// 공통 유틸
// ─────────────────────────────────────────────────────────────────────
const VALID_METHODS = new Set(["transfer", "cash", "card", "check", "offset", "etc"]);

const toNumOrNull = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const isYmd = (s: unknown): s is string =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

// ─────────────────────────────────────────────────────────────────────
// VAT 유틸 (2026-08-03 · #193 · 2026-08-06 개선 · null → true 기본)
//   splitVat(amount, vat_included)
//     · vat_included=true  · 총액에 VAT 포함 → vat = amount/11 · supply = amount - vat
//     · vat_included=false · 총액은 공급가액 (별도과세) → vat = amount*0.1 · supply = amount
//     · vat_included=null  · true 로 기본 처리 (사용자 요청 · 기본 VAT포함)
// ─────────────────────────────────────────────────────────────────────
export function splitVat(amount: number, vatIncluded: boolean | null): { vat: number; supply: number } {
  if (!Number.isFinite(amount) || amount <= 0) return { vat: 0, supply: 0 };
  const eff = vatIncluded === false ? false : true; // null → true (default)
  if (eff) {
    const vat = Math.round(amount / 11);
    return { vat, supply: amount - vat };
  }
  const vat = Math.round(amount * 0.1);
  return { vat, supply: amount };
}

/** 공급사명에서 vat 별도 힌트 감지 · 이름에 "vat미포함/별도/없음" 있으면 false */
function inferVatFromName(name: string | null | undefined): boolean | null {
  if (!name) return null;
  return /vat\s*(미포함|별도|없음)/i.test(String(name)) ? false : null;
}

/** 공급사명으로 vat_included lookup · 실패해도 null 반환 (컬럼 없는 DB 안전)
 *  · vendor.vat_included 우선 · 없으면 이름 힌트 · 그래도 없으면 null (호출측이 default 처리)
 */
async function fetchVatIncluded(supplier: string): Promise<boolean | null> {
  try {
    const { data, error } = await supabase
      .from("vendors")
      .select("vat_included, company_name")
      .eq("company_name", supplier)
      .maybeSingle();
    if (error) return inferVatFromName(supplier);
    const v = data?.vat_included;
    if (v === true || v === false) return v;
    // vendor 있으나 vat_included 미설정 · 이름으로 추론
    return inferVatFromName(data?.company_name ?? supplier);
  } catch {
    return inferVatFromName(supplier);
  }
}

// ─────────────────────────────────────────────────────────────────────
// GET /api/supplier-payments?supplier=X&days=90
//   · 결제 이력 (allocations 포함)
// ─────────────────────────────────────────────────────────────────────
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
    throw new Error(error.message);
  }

  const paymentIds = (payments ?? []).map(p => p.id);
  let allocMap = new Map<number, any[]>();
  if (paymentIds.length > 0) {
    const { data: allocs, error: aErr } = await supabase
      .from("supplier_payment_allocations")
      .select("id, payment_id, ocr_confirmed_item_id, allocated_amount, created_at")
      .in("payment_id", paymentIds);
    if (aErr && !/relation .* does not exist/i.test(aErr.message)) {
      console.warn("[supplier-payments] allocations fetch 실패:", aErr.message);
    }
    for (const a of allocs ?? []) {
      const arr = allocMap.get(a.payment_id) ?? [];
      arr.push(a);
      allocMap.set(a.payment_id, arr);
    }
  }

  const rows = (payments ?? []).map(p => ({
    ...p,
    allocations: allocMap.get(p.id) ?? [],
  }));
  return res.json({ rows });
}));

// ─────────────────────────────────────────────────────────────────────
// GET /api/supplier-payments/latest-per-supplier
//   · 각 공급사별 최근 결제 1건 (payment_date desc + id desc tiebreak)
//   · 응답: { rows: [{ supplier_name, latest_payment_date, latest_payment_amount }] }
//   · PaymentInfoTab 좌측 리스트 · 최근결제일·최근결제액 컬럼용 (T-TEST-공급사리스트-최근결제)
//   · 서버측 groupBy · N+1 request 회피 (100개 공급사면 100 요청 방지)
//   · supplier_payments 테이블 없으면 rows: [] 빈 배열 반환 (안전)
// ─────────────────────────────────────────────────────────────────────
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
    throw new Error(error.message);
  }
  // 이미 desc 정렬 · 각 supplier 첫 row 가 최근
  const map = new Map<string, { latest_payment_date: string; latest_payment_amount: number }>();
  for (const r of data ?? []) {
    const nm = String(r.supplier_name ?? "").trim();
    if (!nm || map.has(nm)) continue;
    map.set(nm, {
      latest_payment_date: String(r.payment_date ?? ""),
      latest_payment_amount: Number(r.amount) || 0,
    });
  }
  const rows = Array.from(map.entries()).map(([supplier_name, v]) => ({
    supplier_name,
    ...v,
  }));
  return res.json({ rows });
}));

// ─────────────────────────────────────────────────────────────────────
// GET /api/supplier-payments/pending-count · 2026-08-23 · #171
//   · 전체 공급사 · 미결제·부분결제 매입건 수 (관리자 랜딩 배지용)
//   · ocr_confirmed_items.amount - SUM(allocations.allocated_amount) > 0
// ─────────────────────────────────────────────────────────────────────
router.get("/api/supplier-payments/pending-count", asyncHandler(async (_req, res) => {
  const { data: invoices, error: invErr } = await supabase
    .from("ocr_confirmed_items")
    .select("id, amount");
  if (invErr) {
    if (/relation .* does not exist/i.test(invErr.message)) return res.json({ count: 0 });
    throw new Error(invErr.message);
  }
  const invList = invoices ?? [];
  if (invList.length === 0) return res.json({ count: 0 });

  const allocSumMap = new Map<number, number>();
  {
    const { data: allocs, error: aErr } = await supabase
      .from("supplier_payment_allocations")
      .select("ocr_confirmed_item_id, allocated_amount");
    if (aErr && !/relation .* does not exist/i.test(aErr.message)) {
      console.warn("[supplier-payments/pending-count] allocations sum 실패:", aErr.message);
    }
    for (const a of allocs ?? []) {
      const iid = a.ocr_confirmed_item_id;
      allocSumMap.set(iid, (allocSumMap.get(iid) ?? 0) + (Number(a.allocated_amount) || 0));
    }
  }

  let count = 0;
  for (const i of invList as Array<{ id: number; amount: number | null }>) {
    const amt = Number(i.amount) || 0;
    const alloc = allocSumMap.get(i.id) ?? 0;
    if (amt - alloc > 0.5) count++;
  }
  return res.json({ count });
}));

// ─────────────────────────────────────────────────────────────────────
// POST /api/supplier-payments
//   body: { supplier_name, payment_date, amount, method?, memo?,
//           created_by?, created_by_id?,
//           allocations?: [{ocr_confirmed_item_id, allocated_amount}] }
//   · 원자성: allocations insert 실패 시 payment 롤백 (best-effort)
// ─────────────────────────────────────────────────────────────────────
router.post("/api/supplier-payments", asyncHandler(async (req, res) => {
  const {
    supplier_name,
    payment_date,
    amount,
    method,
    memo,
    created_by,
    created_by_id,
    allocations,
  } = req.body ?? {};

  // 검증
  if (!supplier_name || typeof supplier_name !== "string" || !supplier_name.trim()) {
    throw badRequest("supplier_name 필수");
  }
  if (!isYmd(payment_date)) {
    throw badRequest("payment_date 는 YYYY-MM-DD 형식이어야 합니다");
  }
  const amt = toNumOrNull(amount);
  if (amt == null || amt <= 0) {
    throw badRequest("amount 는 양수여야 합니다");
  }
  const methodClean = String(method ?? "transfer").trim().toLowerCase();
  if (!VALID_METHODS.has(methodClean)) {
    throw badRequest(`method 는 ${Array.from(VALID_METHODS).join(",")} 중 하나여야 합니다`);
  }

  // allocations 검증
  const allocList: Array<{ ocr_confirmed_item_id: number; allocated_amount: number }> = [];
  if (Array.isArray(allocations)) {
    let sum = 0;
    for (const a of allocations) {
      const invId = Number(a?.ocr_confirmed_item_id);
      const allocAmt = toNumOrNull(a?.allocated_amount);
      if (!Number.isFinite(invId) || invId <= 0) {
        throw badRequest("allocation.ocr_confirmed_item_id 가 유효하지 않습니다");
      }
      if (allocAmt == null || allocAmt <= 0) {
        throw badRequest("allocation.allocated_amount 는 양수여야 합니다");
      }
      sum += allocAmt;
      allocList.push({ ocr_confirmed_item_id: invId, allocated_amount: allocAmt });
    }
    // 부동소수 오차 허용치 0.5 (원 단위 데이터 · 실무상 정수)
    if (sum > amt + 0.5) {
      throw badRequest(`배분 총액(${sum.toLocaleString()}) 이 결제 금액(${amt.toLocaleString()}) 을 초과할 수 없습니다`);
    }
  }

  // 1. payment insert
  const payload: Record<string, any> = {
    supplier_name: supplier_name.trim(),
    payment_date,
    amount: amt,
    method: methodClean,
    memo: memo != null && String(memo).trim() ? String(memo).trim() : null,
    created_by: created_by != null && String(created_by).trim() ? String(created_by).trim() : null,
    created_by_id: Number.isFinite(Number(created_by_id)) ? Number(created_by_id) : null,
  };

  const { data: payRow, error: payErr } = await supabase
    .from("supplier_payments")
    .insert(payload)
    .select("id, supplier_name, payment_date, amount, method, memo, created_by, created_by_id, created_at")
    .single();

  if (payErr) throw new Error(`payment insert 실패: ${payErr.message}`);
  if (!payRow?.id) throw new Error("payment id 획득 실패");

  // 2. allocations insert (있으면)
  let allocatedRows: any[] = [];
  if (allocList.length > 0) {
    const allocPayload = allocList.map(a => ({
      payment_id: payRow.id,
      ocr_confirmed_item_id: a.ocr_confirmed_item_id,
      allocated_amount: a.allocated_amount,
    }));
    const { data: allocRows, error: allocErr } = await supabase
      .from("supplier_payment_allocations")
      .insert(allocPayload)
      .select("id, payment_id, ocr_confirmed_item_id, allocated_amount, created_at");

    if (allocErr) {
      // 롤백: payment 삭제 (CASCADE 로 이미 insert 된 alloc 도 삭제됨)
      await supabase.from("supplier_payments").delete().eq("id", payRow.id);
      throw new Error(`allocations insert 실패 (payment 롤백): ${allocErr.message}`);
    }
    allocatedRows = allocRows ?? [];
  }

  // 2026-08-13 · #107 · 관리자 broadcast · 결제 등록 알림 (인앱 + push)
  notificationsService.notifyAllAdmins({
    title: "💰 결제 등록",
    body: `${supplier_name} · ${amt.toLocaleString()}원 (${methodClean}) 결제 등록됨.`,
    type: "success",
    push: { url: "/", tag: `payment-new-${payRow.id}` },
  }).catch(() => null);

  return res.status(201).json({ ...payRow, allocations: allocatedRows });
}));

// ─────────────────────────────────────────────────────────────────────
// PATCH /api/supplier-payments/:id
//   · memo · method 만 수정 (금액·날짜 변경은 삭제→재등록 유도)
// ─────────────────────────────────────────────────────────────────────
router.patch("/api/supplier-payments/:id", asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) throw badRequest("invalid id");
  const { method, memo } = req.body ?? {};
  const updates: Record<string, any> = {};
  if (method !== undefined) {
    const m = String(method ?? "").trim().toLowerCase();
    if (!VALID_METHODS.has(m)) throw badRequest(`method 는 ${Array.from(VALID_METHODS).join(",")} 중 하나`);
    updates.method = m;
  }
  if (memo !== undefined) {
    updates.memo = memo != null && String(memo).trim() ? String(memo).trim() : null;
  }
  if (Object.keys(updates).length === 0) throw badRequest("수정할 필드 없음 (method/memo 만 허용)");

  const { data, error } = await supabase
    .from("supplier_payments")
    .update(updates)
    .eq("id", id)
    .select("id, supplier_name, payment_date, amount, method, memo, created_at")
    .single();
  if (error) throw new Error(error.message);
  return res.json(data);
}));

// ─────────────────────────────────────────────────────────────────────
// DELETE /api/supplier-payments/:id
//   · allocations 은 FK ON DELETE CASCADE 로 자동 삭제
// ─────────────────────────────────────────────────────────────────────
router.delete("/api/supplier-payments/:id", authorize(9), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) throw badRequest("invalid id");
  const { error } = await supabase.from("supplier_payments").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return res.json({ ok: true });
}));

// ─────────────────────────────────────────────────────────────────────
// GET /api/supplier-balance/:supplier
//   · 현재 잔액 = SUM(purchase_details.amount) - SUM(supplier_payments.amount)
//   · supplier 는 URL 인코딩된 회사명
//   · 2026-08-09 · 소스 · ocr_confirmed_items → purchase_details (사용자 원칙)
// ─────────────────────────────────────────────────────────────────────
router.get("/api/supplier-balance/:supplier", asyncHandler(async (req, res) => {
  const supplier = decodeURIComponent(req.params.supplier ?? "").trim();
  if (!supplier) throw badRequest("supplier 필수");

  // 매입 합계 (purchase_details · queryPurchaseDetails 헬퍼 · NULL supplier fallback 포함)
  let totalPurchase = 0;
  let purchaseCount = 0;
  {
    const rows = await queryPurchaseDetails({ supplier });
    for (const r of rows) {
      totalPurchase += r.amount;
      purchaseCount++;
    }
  }

  // 결제 합계 (supplier_payments)
  let totalPayment = 0;
  let paymentCount = 0;
  {
    const { data, error } = await supabase
      .from("supplier_payments")
      .select("id, amount")
      .eq("supplier_name", supplier);
    if (error && !/relation .* does not exist/i.test(error.message)) throw new Error(error.message);
    for (const r of data ?? []) {
      totalPayment += Number(r.amount) || 0;
      paymentCount++;
    }
  }

  const balance = totalPurchase - totalPayment;
  return res.json({
    supplier,
    total_purchase: totalPurchase,
    total_payment: totalPayment,
    balance,
    purchase_count: purchaseCount,
    payment_count: paymentCount,
  });
}));

// ─────────────────────────────────────────────────────────────────────
// GET /api/supplier-ledger?supplier=X&days=90
//   · 매입(purchase_details) + 결제(supplier_payments) UNION
//   · 시간순 asc → running balance 계산
//   · 2026-08-09 · 소스 · ocr_confirmed_items → purchase_details (사용자 원칙)
// ─────────────────────────────────────────────────────────────────────
router.get("/api/supplier-ledger", asyncHandler(async (req, res) => {
  const supplier = String(req.query.supplier ?? "").trim();
  if (!supplier) throw badRequest("supplier 필수");
  const days = Math.max(1, Math.min(3650, parseInt(String(req.query.days ?? "90"), 10) || 90));

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffYmd = cutoffDate.toISOString().slice(0, 10);

  // 공급사 VAT 설정 (병렬 fetch 는 아래에서 · 여기선 결과만 사용)
  const vatIncludedPromise = fetchVatIncluded(supplier);

  // 매입 (purchase_details · queryPurchaseDetails 헬퍼) · vat_amount·supply_amount 있으면 우선 사용
  const purchases: any[] = [];
  {
    const rows = await queryPurchaseDetails({ supplier, sinceYmd: cutoffYmd });
    for (const r of rows) {
      purchases.push({
        type: "purchase",
        id: r.id,
        date: r.purchase_date,
        amount: r.amount,
        _raw_vat: r.vat_amount,
        _raw_supply: r.supply_amount,
        method: null,
        memo: r.product_name || null,
        allocations: null,
      });
    }
  }

  // 결제 (supplier_payments) · vat_amount 있으면 우선 사용
  const payments: any[] = [];
  {
    let data: any[] | null = null;
    const r1 = await supabase
      .from("supplier_payments")
      .select("id, supplier_name, payment_date, amount, method, memo, vat_amount, tax_invoice_no")
      .eq("supplier_name", supplier)
      .gte("payment_date", cutoffYmd);
    if (!r1.error) data = r1.data ?? [];
    else if (/vat_amount|tax_invoice_no/i.test(r1.error.message)) {
      const r2 = await supabase
        .from("supplier_payments")
        .select("id, supplier_name, payment_date, amount, method, memo")
        .eq("supplier_name", supplier)
        .gte("payment_date", cutoffYmd);
      if (!r2.error) data = (r2.data ?? []).map((x: any) => ({ ...x, vat_amount: 0, tax_invoice_no: null }));
      else if (!/relation .* does not exist/i.test(r2.error.message)) throw new Error(r2.error.message);
    } else if (!/relation .* does not exist/i.test(r1.error.message)) throw new Error(r1.error.message);

    for (const r of data ?? []) {
      payments.push({
        type: "payment",
        id: r.id,
        date: r.payment_date,
        amount: Number(r.amount) || 0,
        _raw_vat: Number(r.vat_amount) || 0,
        method: r.method ?? null,
        memo: r.memo ?? null,
        tax_invoice_no: r.tax_invoice_no ?? null,
        allocations: null,
      });
    }
  }

  // VAT 계산 · row 에 저장된 값 있으면 우선 · 없으면 vendor.vat_included 로 계산
  const vatIncluded = await vatIncludedPromise;
  const decoratePurchase = (m: any) => {
    let vat = m._raw_vat;
    let supply = m._raw_supply;
    if (!vat && !supply) {
      const s = splitVat(m.amount, vatIncluded);
      vat = s.vat;
      supply = s.supply;
    } else if (!supply) {
      supply = Math.max(0, m.amount - vat);
    }
    return { ...m, vat_amount: vat, supply_amount: supply };
  };
  const decoratePayment = (m: any) => {
    let vat = m._raw_vat;
    if (!vat) {
      // 결제에서는 vendor.vat_included=true 인 경우만 자동분리 (별도과세는 결제 시점에 VAT 라인 별도 X)
      vat = vatIncluded === true ? splitVat(m.amount, true).vat : 0;
    }
    const supply = Math.max(0, m.amount - vat);
    return { ...m, vat_amount: vat, supply_amount: supply };
  };

  const decoratedP = purchases.map(decoratePurchase);
  const decoratedY = payments.map(decoratePayment);

  // 시간순 asc · date 동일 시 매입 먼저 (재무 관례)
  const merged = [...decoratedP, ...decoratedY].sort((a, b) => {
    if (a.date !== b.date) return String(a.date).localeCompare(String(b.date));
    if (a.type !== b.type) return a.type === "purchase" ? -1 : 1;
    return a.id - b.id;
  });

  // running balance · 매입(+) · 결제(-)
  let running = 0;
  const rows = merged.map(m => {
    running += m.type === "purchase" ? m.amount : -m.amount;
    const { _raw_vat, _raw_supply, ...clean } = m;
    void _raw_vat; void _raw_supply;
    return { ...clean, running_balance: running };
  });

  const totalPurchaseVat = decoratedP.reduce((s, r) => s + (r.vat_amount || 0), 0);
  const totalPurchaseSupply = decoratedP.reduce((s, r) => s + (r.supply_amount || 0), 0);
  const totalPaymentVat = decoratedY.reduce((s, r) => s + (r.vat_amount || 0), 0);
  const totalPaymentSupply = decoratedY.reduce((s, r) => s + (r.supply_amount || 0), 0);

  // 프론트는 desc 로 보여주는 경우가 많으니 반전 옵션 제공
  // (여기선 asc 로 반환 · 프론트에서 정렬)
  return res.json({
    supplier,
    vat_included: vatIncluded,
    rows,
    total_purchase: decoratedP.reduce((s, r) => s + r.amount, 0),
    total_purchase_vat: Math.round(totalPurchaseVat),
    total_purchase_supply: Math.round(totalPurchaseSupply),
    total_payment: decoratedY.reduce((s, r) => s + r.amount, 0),
    total_payment_vat: Math.round(totalPaymentVat),
    total_payment_supply: Math.round(totalPaymentSupply),
    current_balance: running,
  });
}));

// ─────────────────────────────────────────────────────────────────────
// GET /api/supplier-open-invoices?supplier=X
//   · 결제 미할당 or 부분할당 된 매입건 리스트
//   · PaymentRegisterModal 에서 체크박스 매칭용
// ─────────────────────────────────────────────────────────────────────
router.get("/api/supplier-open-invoices", asyncHandler(async (req, res) => {
  const supplier = String(req.query.supplier ?? "").trim();
  if (!supplier) throw badRequest("supplier 필수");

  // 매입건 조회
  const { data: invoices, error: invErr } = await supabase
    .from("ocr_confirmed_items")
    .select("id, invoice_date, saved_at, supplier, product_name, amount")
    .eq("supplier", supplier)
    .order("invoice_date", { ascending: false })
    .order("saved_at", { ascending: false })
    .limit(500);
  if (invErr) {
    if (/relation .* does not exist/i.test(invErr.message)) return res.json({ rows: [] });
    throw new Error(invErr.message);
  }
  const invList = invoices ?? [];
  if (invList.length === 0) return res.json({ rows: [] });

  // 각 invoice 에 배분된 금액 합
  const invIds = invList.map(i => i.id);
  const allocSumMap = new Map<number, number>();
  {
    const { data: allocs, error: aErr } = await supabase
      .from("supplier_payment_allocations")
      .select("ocr_confirmed_item_id, allocated_amount")
      .in("ocr_confirmed_item_id", invIds);
    if (aErr && !/relation .* does not exist/i.test(aErr.message)) {
      console.warn("[supplier-open-invoices] allocations sum 실패:", aErr.message);
    }
    for (const a of allocs ?? []) {
      const iid = a.ocr_confirmed_item_id;
      allocSumMap.set(iid, (allocSumMap.get(iid) ?? 0) + (Number(a.allocated_amount) || 0));
    }
  }

  const rows = invList.map((i: any) => {
    const amount = Number(i.amount) || 0;
    const allocated = allocSumMap.get(i.id) ?? 0;
    const remaining = Math.max(0, amount - allocated);
    const date = (i.invoice_date && /^\d{4}-\d{2}-\d{2}$/.test(i.invoice_date)) ? i.invoice_date : i.saved_at;
    return {
      id: i.id,
      date,
      product_name: i.product_name,
      amount,
      allocated,
      remaining,
      status: remaining <= 0.5 ? "paid" : allocated > 0 ? "partial" : "open",
    };
  });

  return res.json({ rows });
}));

// ─────────────────────────────────────────────────────────────────────
// GET /api/supplier-purchase-summary?days=90
//   · 모든 공급사 매입 요약 (좌측 vendor 카드용)
//   · 반환: [{ supplier, last_purchase_date, this_month_amount, sku_count,
//              weekly_sparkline: number[12], total_amount, purchase_count,
//              first_purchase_date, avg_cycle_days }]
//   · 2026-08-09 · 원칙 확정 · purchase_details 만 · OCR fallback 제거
//     사용자 요청: "매입이력없으면 ocr로넘어가면 안돼 · 매입이력은 매입이력만"
// ─────────────────────────────────────────────────────────────────────
router.get("/api/supplier-purchase-summary", asyncHandler(async (req, res) => {
  const days = Math.max(1, Math.min(3650, parseInt(String(req.query.days ?? "90"), 10) || 90));
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffYmd = cutoffDate.toISOString().slice(0, 10);

    // 이번달 시작 (YYYY-MM-01)
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

    // ─── primary · purchase_details (ERP · 사용자 명시 정답 소스) ─────────
    //   supplier_name · purchase_date · amount|total · product_code
    //   페이지네이션 (row 1000 초과 대비)
    interface NormRow {
      supplier: string;
      date: string;
      amount: number;
      code: string;
    }
    const normRows: NormRow[] = [];
    let pdOk = false;
    let pdRowCount = 0; // 2026-08-04 fix · primary(purchase_details) 실제 push 된 행 수 (fallback 이 normRows 덮어써도 원본 판별)
    let pdSkippedNullSupplier = 0; // 2026-08-03 fix · supplier_name NULL 인 행 카운트 (진단용)
    let pdRelationMissing = false; // 2026-08-04 · purchase_details 테이블 자체 존재하는지
    // 전체(=cutoff 무관) 통계 · 사용자 진단용 (매입이력이 안들어온다 지적)
    //   - 90일보다 오래된 매입만 있을 때 · pd_row_count=0 인데 pd_total_all_time>0
    let pdTotalAllTime: number | null = null;
    let pdLatestDate: string | null = null;
    try {
      const { count } = await supabase
        .from("purchase_details")
        .select("id", { count: "exact", head: true });
      if (count != null) pdTotalAllTime = count;
      const { data: latestRow } = await supabase
        .from("purchase_details")
        .select("purchase_date")
        .order("purchase_date", { ascending: false })
        .limit(1);
      const l = (latestRow ?? [])[0];
      pdLatestDate = l?.purchase_date ? String(l.purchase_date).slice(0, 10) : null;
    } catch (e: any) {
      if (/relation .* does not exist/i.test(String(e?.message ?? ""))) pdRelationMissing = true;
    }
    // supplier_code → supplier_name 매핑 (vendors 테이블 · code null 인 raw 매입행 보완용)
    //   2026-08-04 근본원인 fix · vendors 에 supplier_code 컬럼 없음 · note 컬럼에 code 저장됨
    //   (예: "0038", "172") · 이걸 못 잡아서 6307행 스킵 · OCR 폴백 오작동
    //   supplier_code + note 둘 다 조회 (supplier_code 우선 · 미래 컬럼 추가 대비)
    const codeToName = new Map<string, string>();
    try {
      // note (실제 code 저장 위치) 우선 조회 · supplier_code 도 있으면 병행
      const { data: vdata, error: verr } = await supabase
        .from("vendors")
        .select("company_name, note");
      if (!verr) {
        for (const v of vdata ?? []) {
          const code = String(v.note ?? "").trim();
          const name = String(v.company_name ?? "").trim();
          // note 는 자유형식 텍스트 · 숫자 3~5자리 code 만 매핑 (오탐 방지)
          if (code && name && /^\d{1,5}$/.test(code)) codeToName.set(code, name);
        }
      }
      // supplier_code 컬럼도 있으면 병행 (없으면 무해하게 skip)
      try {
        const { data: sdata, error: serr } = await supabase
          .from("vendors")
          .select("company_name, supplier_code");
        if (!serr) {
          for (const v of sdata ?? []) {
            const code = String(v.supplier_code ?? "").trim();
            const name = String(v.company_name ?? "").trim();
            if (code && name) codeToName.set(code, name); // supplier_code 우선 덮어씀
          }
        }
      } catch { /* silent · 컬럼 없음 */ }
    } catch { /* silent · vendors 없어도 무관 */ }
    // 2026-08-04 · products.product_code → supplier 매핑 (원칙 준수 · 있는 테이블 조회)
    //   6307행이 supplier_name·supplier_code 모두 NULL 인 케이스 대응
    //   products.supplier 로 fallback · 파생컬럼 생성 X · 런타임 조회 (원칙 위배 X)
    const productCodeToSupplier = new Map<string, string>();
    try {
      const PPAGE = 1000;
      let pfrom = 0;
      while (true) {
        const { data, error } = await supabase
          .from("products")
          .select("product_code, supplier")
          .range(pfrom, pfrom + PPAGE - 1);
        if (error) break;
        if (!data || data.length === 0) break;
        for (const p of data) {
          const pc = String(p.product_code ?? "").trim();
          const sup = String(p.supplier ?? "").trim();
          if (pc && sup) productCodeToSupplier.set(pc, sup);
        }
        if (data.length < PPAGE) break;
        pfrom += PPAGE;
      }
    } catch { /* silent · products 없어도 무관 */ }
    try {
      const PAGE = 1000;
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("purchase_details")
          .select("supplier_name, supplier_code, purchase_date, amount, total, product_code")
          .gte("purchase_date", cutoffYmd)
          .range(from, from + PAGE - 1);
        if (error) {
          if (/relation .* does not exist/i.test(error.message)) { pdRelationMissing = true; break; }
          if (/column .* does not exist/i.test(error.message)) break;
          throw new Error(error.message);
        }
        if (!data || data.length === 0) break;
        for (const r of data) {
          // supplier_name 결정 순서 (2026-08-04):
          //   1. raw supplier_name
          //   2. supplier_code → vendors.note or vendors.supplier_code
          //   3. product_code → products.supplier (마지막 fallback · 임포트 정책 정합)
          let supplier = String(r.supplier_name ?? "").trim();
          if (!supplier) {
            const code = String(r.supplier_code ?? "").trim();
            if (code && codeToName.has(code)) supplier = codeToName.get(code)!;
          }
          if (!supplier) {
            const pcode = String(r.product_code ?? "").trim();
            if (pcode && productCodeToSupplier.has(pcode)) supplier = productCodeToSupplier.get(pcode)!;
          }
          if (!supplier) { pdSkippedNullSupplier++; continue; }
          const date: string = (r.purchase_date && /^\d{4}-\d{2}-\d{2}/.test(String(r.purchase_date)))
            ? String(r.purchase_date).slice(0, 10)
            : "";
          if (!date) continue;
          // 2026-08-03 fix (이슈 A) · amount 우선 · total fallback (xlsx total 이 amount 와 다르게 부풀린 케이스 방지)
          //   purchase.ts 임포트 시 amount = 순매입금액 (반품 차감 후) · 정답 값
          //   total 은 xlsx "총합계" 컬럼 raw 저장 · VAT 포함 여부가 파일마다 상이 · 신뢰 불가
          const amount = Number(r.amount ?? r.total ?? 0) || 0;
          const code = String(r.product_code ?? "").trim();
          normRows.push({ supplier, date, amount, code });
          pdRowCount++;
        }
        pdOk = true;
        if (data.length < PAGE) break;
        from += PAGE;
      }
      if (pdSkippedNullSupplier > 0) {
        console.warn(`[supplier-purchase-summary] purchase_details · supplier_name NULL 로 스킵된 행 ${pdSkippedNullSupplier}개 (supplier_code 매핑 실패)`);
        // 2026-08-06 · 진단 강화 · 실패 케이스 · 어떤 supplier_code · product_code 가 매핑 안 됐는지
        //   사용자가 vendors 등록 or products.supplier 채워서 해결 가능
        try {
          const { data: skipRows } = await supabase
            .from("purchase_details")
            .select("supplier_code, product_code, purchase_date")
            .is("supplier_name", null)
            .gte("purchase_date", cutoffYmd)
            .limit(50);
          if (skipRows && skipRows.length > 0) {
            const codes = Array.from(new Set(skipRows.map((r: any) => r.supplier_code).filter(Boolean))).slice(0, 10);
            const prodCodes = Array.from(new Set(skipRows.map((r: any) => r.product_code).filter(Boolean))).slice(0, 10);
            console.warn(`[supplier-purchase-summary] 매핑 실패 supplier_code 예시 (최대 10):`, codes);
            console.warn(`[supplier-purchase-summary] 매핑 실패 product_code 예시 (최대 10):`, prodCodes);
            console.warn(`[supplier-purchase-summary] 조치: vendors 테이블에 supplier_code 등록 or products.supplier 채우기`);
          }
        } catch { /* silent */ }
      }
    } catch (e: any) {
      console.warn("[supplier-purchase-summary] purchase_details 실패 · fallback:", e?.message);
    }

    // ─── 2026-08-09 · OCR fallback 제거 · purchase_details 만 사용 ───
    //   사용자 원칙: "매입이력은 매입이력만" · 빈결과여도 OCR로 넘어가지 않음

    // 공급사별 집계
    interface Agg {
      supplier: string;
      last_purchase_date: string | null;
      first_purchase_date: string | null;
      this_month_amount: number;
      total_amount: number;
      purchase_count: number;
      sku_set: Set<string>;
      date_set: Set<string>; // 매입주기 계산용 · 서로 다른 매입일 수
      // 12주 weekly buckets · 최근주=index 11
      weekly: number[];
    }
    const bucket = new Map<string, Agg>();

    // 12주 · 오늘 기준 · week[i] = (now - (12 - i) 주 ~ now - (11 - i) 주)
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    const nowMs = now.getTime();

    for (const r of normRows) {
      let agg = bucket.get(r.supplier);
      if (!agg) {
        agg = {
          supplier: r.supplier,
          last_purchase_date: null,
          first_purchase_date: null,
          this_month_amount: 0,
          total_amount: 0,
          purchase_count: 0,
          sku_set: new Set<string>(),
          date_set: new Set<string>(),
          weekly: new Array(12).fill(0),
        };
        bucket.set(r.supplier, agg);
      }

      // 최근 · 최초 매입일
      if (!agg.last_purchase_date || r.date > agg.last_purchase_date) agg.last_purchase_date = r.date;
      if (!agg.first_purchase_date || r.date < agg.first_purchase_date) agg.first_purchase_date = r.date;
      agg.total_amount += r.amount;
      agg.purchase_count += 1;
      if (r.code) agg.sku_set.add(r.code);
      agg.date_set.add(r.date);
      if (r.date >= monthStart) agg.this_month_amount += r.amount;

      // weekly bucket · 최근 12주
      const dMs = new Date(r.date + "T00:00:00Z").getTime();
      if (!Number.isNaN(dMs)) {
        const weeksAgo = Math.floor((nowMs - dMs) / WEEK_MS);
        if (weeksAgo >= 0 && weeksAgo < 12) {
          // weeksAgo=0 → 이번주 → index 11 (오른쪽 끝)
          agg.weekly[11 - weeksAgo] += r.amount;
        }
      }
    }

    const suppliers = Array.from(bucket.values()).map(a => {
      // 매입주기 · 서로 다른 매입일 2회 이상일 때만 계산 · (last - first) / (distinct - 1)
      let avg_cycle_days: number | null = null;
      const distinctDates = a.date_set.size;
      if (distinctDates >= 2 && a.first_purchase_date && a.last_purchase_date) {
        const first = new Date(a.first_purchase_date + "T00:00:00Z").getTime();
        const last = new Date(a.last_purchase_date + "T00:00:00Z").getTime();
        if (!Number.isNaN(first) && !Number.isNaN(last) && last > first) {
          avg_cycle_days = Math.round((last - first) / (86400 * 1000) / (distinctDates - 1));
        }
      }
      return {
        supplier: a.supplier,
        last_purchase_date: a.last_purchase_date,
        first_purchase_date: a.first_purchase_date,
        this_month_amount: a.this_month_amount,
        total_amount: a.total_amount,
        purchase_count: a.purchase_count,
        sku_count: a.sku_set.size,
        avg_cycle_days,
        weekly_sparkline: a.weekly,
      };
    });

    // source · pdRowCount 로 정확 판별 (2026-08-04 fix)
    //   pdRowCount > 0 = purchase_details 에서 실제로 rows push 됨
    //   pdRowCount == 0 & normRows.length > 0 = fallback(ocr) 만 데이터 있음
    //   둘 다 있으면 mixed (fallback 은 primary 비었을 때만 도는 로직이라 사실 mixed 없음)
    return res.json({
      suppliers,
      cutoff: cutoffYmd,
      days,
      source: "purchase_details",
      diagnostics: {
        pd_ok: pdOk,
        pd_row_count: pdRowCount,
        pd_skipped_null_supplier: pdSkippedNullSupplier,
        pd_relation_missing: pdRelationMissing,
        pd_total_all_time: pdTotalAllTime,    // 90d 무관 · 전체 행 수
        pd_latest_date: pdLatestDate,          // 가장 최근 매입일 (전체) · 90d 밖이면 여기서 확인
        total_rows: normRows.length,
      },
    });
}));

// ─────────────────────────────────────────────────────────────────────
// GET /api/supplier-purchase-detail?supplier=X&days=365
//   · 특정 공급사 매입 raw rows (product_code, quantity, unit_price, amount)
//   · Tab 2 상품별 집계 · Tab 3 매입 추이용 · running_balance 없음
//   · 2026-08-09 · 원칙 확정 · purchase_details 만 사용 · OCR fallback 제거
//     사용자 요청: "매입이력없으면 ocr로넘어가면 안돼 · 매입이력은 매입이력만"
// ─────────────────────────────────────────────────────────────────────
router.get("/api/supplier-purchase-detail", asyncHandler(async (req, res) => {
  const supplier = String(req.query.supplier ?? "").trim();
  if (!supplier) throw badRequest("supplier 필수");
    const days = Math.max(1, Math.min(3650, parseInt(String(req.query.days ?? "365"), 10) || 365));

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffYmd = cutoffDate.toISOString().slice(0, 10);

    // vendor VAT 설정 (병렬)
    const vatIncludedPromise = fetchVatIncluded(supplier);

    // ─── purchase_details (ERP · 사용자 명시 정답 소스 · 유일 소스) ─────────
    //   vat_amount·supply_amount 컬럼 없을 수 있음 · 실패 시 재시도
    //   2026-08-09 · OCR fallback 제거 (사용자 지시)
    let data: any[] | null = null;
    const sourceUsed: "purchase_details" = "purchase_details";
    // 2026-08-03 fix · supplier_name NULL 인 매입행 회수 · supplier_code (or note) 로도 조회
    //   2026-08-04 · vendors 에 supplier_code 컬럼 없음 · vendors.note 에 code 저장됨 (숫자 3~5자리)
    //   product_code → products.supplier 도 fallback 으로 추가 (매입이력 ERP 데이터 반드시 로드)
    let supplierCode: string | null = null;
    try {
      // note 우선 조회 (실제 code 저장 위치)
      const { data: vn, error: vnerr } = await supabase
        .from("vendors")
        .select("note")
        .eq("company_name", supplier)
        .limit(1);
      if (!vnerr) {
        const c = String((vn ?? [])[0]?.note ?? "").trim();
        if (c && /^\d{1,5}$/.test(c)) supplierCode = c;
      }
      // supplier_code 컬럼 있으면 우선 사용 (미래 호환)
      try {
        const { data: vs, error: vserr } = await supabase
          .from("vendors")
          .select("supplier_code")
          .eq("company_name", supplier)
          .limit(1);
        if (!vserr) {
          const c = String((vs ?? [])[0]?.supplier_code ?? "").trim();
          if (c) supplierCode = c;
        }
      } catch { /* silent · 컬럼 없어도 무관 */ }
    } catch { /* silent · vendors 없어도 무관 */ }

    // 2026-08-04 · products.supplier === 이 supplier 인 product_codes 리스트 (fallback)
    //   supplier_name/code 모두 NULL 인 purchase_details 행 · product_code 로 supplier 재구성
    const productCodesForSupplier: string[] = [];
    try {
      const PPAGE = 1000;
      let pfrom = 0;
      while (true) {
        const { data, error } = await supabase
          .from("products")
          .select("product_code, supplier")
          .eq("supplier", supplier)
          .range(pfrom, pfrom + PPAGE - 1);
        if (error) break;
        if (!data || data.length === 0) break;
        for (const p of data) {
          const pc = String(p.product_code ?? "").trim();
          if (pc) productCodesForSupplier.push(pc);
        }
        if (data.length < PPAGE) break;
        pfrom += PPAGE;
      }
    } catch { /* silent · products 없어도 무관 */ }
    // 2026-08-04 · 헬퍼 · purchase_details 조회 (name + code + product_codes IN · dedup by id)
    const fetchPdByNameAndCode = async (withVatCols: boolean) => {
      const cols = withVatCols
        ? "id, purchase_date, product_code, product_name, quantity, unit_price, amount, total, vat_amount, supply_amount"
        : "id, purchase_date, product_code, product_name, quantity, unit_price, amount, total";
      const byName = supabase
        .from("purchase_details")
        .select(cols)
        .eq("supplier_name", supplier)
        .gte("purchase_date", cutoffYmd);
      const byCode = supplierCode
        ? supabase
            .from("purchase_details")
            .select(cols)
            .eq("supplier_code", supplierCode)
            .gte("purchase_date", cutoffYmd)
        : Promise.resolve({ data: [] as any[], error: null as any });
      // 2026-08-04 · product_codes IN 조회 (fallback · supplier_name/code 모두 NULL 인 행)
      //   IN 은 Supabase max ~1000 · 청킹 필요
      const byProductCodes = async () => {
        if (productCodesForSupplier.length === 0) return { data: [] as any[], error: null as any };
        const merged: any[] = [];
        const CHUNK = 500;
        for (let i = 0; i < productCodesForSupplier.length; i += CHUNK) {
          const chunk = productCodesForSupplier.slice(i, i + CHUNK);
          const { data, error } = await supabase
            .from("purchase_details")
            .select(cols)
            .in("product_code", chunk)
            .gte("purchase_date", cutoffYmd);
          if (error) return { data: [] as any[], error };
          merged.push(...(data ?? []));
        }
        return { data: merged, error: null as any };
      };
      const [rn, rc, rp] = await Promise.all([byName, byCode, byProductCodes()]);
      if (rn.error) return rn;
      const merged: any[] = [...(rn.data ?? [])];
      const seen = new Set(merged.map(x => x.id));
      for (const r of ((rc as any).data ?? [])) {
        if (!seen.has((r as any).id)) { merged.push(r); seen.add((r as any).id); }
      }
      for (const r of ((rp as any).data ?? [])) {
        if (!seen.has((r as any).id)) { merged.push(r); seen.add((r as any).id); }
      }
      return { data: merged, error: null as any };
    };
    try {
      const pdFull = await fetchPdByNameAndCode(true);
      if (!pdFull.error) {
        data = (pdFull.data ?? []).map((r: any) => ({
          id: r.id,
          invoice_date: r.purchase_date,
          saved_at: r.purchase_date,
          product_code: r.product_code,
          product_name: r.product_name,
          quantity: r.quantity,
          unit_price: r.unit_price,
          // 2026-08-03 fix (이슈 A) · amount 우선 · total fallback · 이중산정 방지
          amount: r.amount ?? r.total ?? 0,
          vat_amount: r.vat_amount ?? 0,
          supply_amount: r.supply_amount ?? 0,
        }));
      } else if (/vat_amount|supply_amount/i.test(pdFull.error.message)) {
        // VAT 컬럼 없는 DB · 다시 조회
        const pdSlim = await fetchPdByNameAndCode(false);
        if (!pdSlim.error) {
          data = (pdSlim.data ?? []).map((r: any) => ({
            id: r.id,
            invoice_date: r.purchase_date,
            saved_at: r.purchase_date,
            product_code: r.product_code,
            product_name: r.product_name,
            quantity: r.quantity,
            unit_price: r.unit_price,
            amount: r.amount ?? r.total ?? 0,
            vat_amount: 0,
            supply_amount: 0,
          }));
        } else if (/relation .* does not exist/i.test(pdSlim.error.message)) {
          data = null; // relation 없음 → fallback 시도
        }
      } else if (/relation .* does not exist/i.test(pdFull.error.message)) {
        data = null; // relation 없음 → fallback 시도
      }
    } catch (e: any) {
      console.warn("[supplier-purchase-detail] purchase_details 실패 · fallback:", e?.message);
      data = null;
    }

    // ─── 2026-08-09 · OCR fallback 제거 · purchase_details 만 사용 ───
    //   사용자 원칙: "매입이력은 매입이력만" · 빈결과여도 OCR로 넘어가지 않음
    if (!data) data = [];

    const vatIncluded = await vatIncludedPromise;
    const rows = (data ?? []).map((r: any) => {
      const date = (r.invoice_date && /^\d{4}-\d{2}-\d{2}$/.test(r.invoice_date))
        ? r.invoice_date
        : String(r.saved_at ?? "").slice(0, 10);
      const amount = Number(r.amount) || 0;
      let vat = Number(r.vat_amount) || 0;
      let supply = Number(r.supply_amount) || 0;
      if (!vat && !supply) {
        const s = splitVat(amount, vatIncluded);
        vat = s.vat;
        supply = s.supply;
      } else if (!supply) {
        supply = Math.max(0, amount - vat);
      }
      return {
        id: r.id,
        date,
        product_code: r.product_code ?? null,
        product_name: r.product_name ?? null,
        quantity: Number(r.quantity) || 0,
        unit_price: Number(r.unit_price) || 0,
        amount,
        vat_amount: vat,
        supply_amount: supply,
      };
    });
  return res.json({ supplier, vat_included: vatIncluded, rows, source: sourceUsed });
}));

// ─────────────────────────────────────────────────────────────────────
// GET /api/supplier-monthly-breakdown?supplier=X&months=N
//   2026-08-09 · 결제탭 우측 상단 7행 표 (사용자 요청)
//   반환: 월별 매입·결제·판매·실재고액 + 각 합계
//   소스 (원칙 준수):
//     - 매입 · purchase_details (queryPurchaseDetails 헬퍼 · NULL supplier fallback)
//     - 결제 · supplier_payments
//     - 판매액 · stock_history (supply_amount × sale_qty/(purchase_qty+sale_qty) 프록시)
//     - 실재고액 · stock_history.total_amount 월별 합
// ─────────────────────────────────────────────────────────────────────
router.get("/api/supplier-monthly-breakdown", asyncHandler(async (req, res) => {
  const supplier = String(req.query.supplier ?? "").trim();
  if (!supplier) throw badRequest("supplier 필수");
    const months = Math.max(1, Math.min(24, parseInt(String(req.query.months ?? "3"), 10) || 3));

    // 월 키 배열 (오래된 → 최근)
    const now = new Date();
    const monthKeys: string[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    const startYm = monthKeys[0];
    const cutoffYmd = `${startYm}-01`;

    const purchases: Record<string, number> = {};
    const payments: Record<string, number> = {};
    const sales: Record<string, number> = {};
    const stockValue: Record<string, number> = {};
    let stockValueCurrent = 0; // 2026-08-09 · 현재 실재고액 (실재고 × 매입단가 합계 · 사용자 요청)

    await Promise.all([
      // 매입 · purchase_details
      (async () => {
        try {
          const rows = await queryPurchaseDetails({ supplier, sinceYmd: cutoffYmd });
          for (const r of rows) {
            const ym = r.purchase_date.slice(0, 7);
            purchases[ym] = (purchases[ym] ?? 0) + r.amount;
          }
        } catch (e: any) {
          console.warn("[supplier-monthly-breakdown] purchases 실패:", e?.message);
        }
      })(),
      // 결제 · supplier_payments
      (async () => {
        try {
          const { data, error } = await supabase
            .from("supplier_payments")
            .select("payment_date, amount")
            .eq("supplier_name", supplier)
            .gte("payment_date", cutoffYmd);
          if (!error) {
            for (const r of data ?? []) {
              const ym = String(r.payment_date ?? "").slice(0, 7);
              if (!ym) continue;
              payments[ym] = (payments[ym] ?? 0) + (Number(r.amount) || 0);
            }
          }
        } catch (e: any) {
          console.warn("[supplier-monthly-breakdown] payments 실패:", e?.message);
        }
      })(),
      // 판매액 · stock_history · 페이지네이션 (1000행씩) · 실재고액은 아래 별도 계산
      (async () => {
        try {
          const PAGE = 1000;
          let from = 0;
          const monthlyAgg = new Map<string, { saleAmount: number }>();
          while (true) {
            const { data, error } = await supabase
              .from("stock_history")
              .select("snapshot_date, purchase_qty, sale_qty, supply_amount")
              .eq("supplier_name", supplier)
              .gte("snapshot_date", cutoffYmd)
              .range(from, from + PAGE - 1);
            if (error) {
              if (/relation .* does not exist/i.test(error.message)) break;
              throw new Error(error.message);
            }
            if (!data || data.length === 0) break;
            for (const r of data) {
              const ym = String(r.snapshot_date ?? "").slice(0, 7);
              if (!ym) continue;
              const pq = Number(r.purchase_qty) || 0;
              const sq = Number(r.sale_qty) || 0;
              const supAmt = Number(r.supply_amount) || 0;
              const saleProxy = (pq + sq) > 0 ? supAmt * (sq / (pq + sq)) : 0;
              const cur = monthlyAgg.get(ym) ?? { saleAmount: 0 };
              cur.saleAmount += saleProxy;
              monthlyAgg.set(ym, cur);
            }
            if (data.length < PAGE) break;
            from += PAGE;
          }
          for (const [ym, v] of monthlyAgg) {
            sales[ym] = v.saleAmount;
          }
        } catch (e: any) {
          console.warn("[supplier-monthly-breakdown] stock_history 실패:", e?.message);
        }
      })(),
      // 실재고액 · 사용자 요청 (2026-08-09) · 실재고(창고1+2+매장1+2+3) × 매입단가 합계
      //   1) products where supplier=X → product_codes
      //   2) inventory_checks · 각 product 최근 1건 · 5개 컬럼 합
      //   3) purchase_details · 각 product 최근 unit_price
      //   4) 상품별 · qty × unit_price · 합계
      //   현재 값 · 월별 스냅샷 아님 · 각 월 컬럼에 동일값 표시 (프론트에서 처리)
      (async () => {
        try {
          // 1) supplier 의 product_codes 수집
          const productCodes: string[] = [];
          const PPAGE = 1000;
          let pfrom = 0;
          while (true) {
            const { data } = await supabase
              .from("products")
              .select("product_code")
              .eq("supplier", supplier)
              .range(pfrom, pfrom + PPAGE - 1);
            if (!data || data.length === 0) break;
            for (const p of data) {
              const pc = String(p.product_code ?? "").trim();
              if (pc) productCodes.push(pc);
            }
            if (data.length < PPAGE) break;
            pfrom += PPAGE;
          }
          if (productCodes.length === 0) return;

          // 2) inventory_checks · 각 product 최근 1건 · 청킹 IN
          const invMap = new Map<string, { qty: number }>();
          const CHUNK = 500;
          for (let i = 0; i < productCodes.length; i += CHUNK) {
            const chunk = productCodes.slice(i, i + CHUNK);
            const { data } = await supabase
              .from("inventory_checks")
              .select("product_code, warehouse1_stock, warehouse2_stock, warehouse_stock, store_stock, store_stock_2, store3_stock, checked_at")
              .in("product_code", chunk)
              .order("checked_at", { ascending: false });
            for (const r of data ?? []) {
              const code = String(r.product_code ?? "").trim();
              if (!code || invMap.has(code)) continue; // 최근 것만
              const w1 = Number(r.warehouse1_stock ?? r.warehouse_stock ?? 0) || 0;
              const w2 = Number(r.warehouse2_stock ?? 0) || 0;
              const s1 = Number(r.store_stock ?? 0) || 0;
              const s2 = Number(r.store_stock_2 ?? 0) || 0;
              const s3 = Number(r.store3_stock ?? 0) || 0;
              invMap.set(code, { qty: w1 + w2 + s1 + s2 + s3 });
            }
          }

          // 3) purchase_details · 각 product 최근 unit_price · 청킹 IN
          const priceMap = new Map<string, number>();
          for (let i = 0; i < productCodes.length; i += CHUNK) {
            const chunk = productCodes.slice(i, i + CHUNK);
            const { data } = await supabase
              .from("purchase_details")
              .select("product_code, unit_price, purchase_date")
              .in("product_code", chunk)
              .order("purchase_date", { ascending: false });
            for (const r of data ?? []) {
              const code = String(r.product_code ?? "").trim();
              if (!code || priceMap.has(code)) continue;
              const price = Number(r.unit_price) || 0;
              if (price > 0) priceMap.set(code, price);
            }
          }

          // 4) 합계 계산
          let total = 0;
          for (const code of productCodes) {
            const inv = invMap.get(code);
            const price = priceMap.get(code);
            if (!inv || inv.qty <= 0 || !price) continue;
            total += inv.qty * price;
          }
          stockValueCurrent = total;
        } catch (e: any) {
          console.warn("[supplier-monthly-breakdown] 실재고액 계산 실패:", e?.message);
        }
      })(),
    ]);

    // 행 합계 (선택 기간 내)
    const sum = (o: Record<string, number>) => Object.values(o).reduce((s, v) => s + v, 0);
    const totals = {
      purchases: sum(purchases),
      payments: sum(payments),
      balance: sum(purchases) - sum(payments),
      sales: sum(sales),
      // 실재고액 · stockValueCurrent (현재 값 · 월별 스냅샷 아님 · 사용자 명시)
      stockValue: stockValueCurrent,
    };

  return res.json({
    supplier,
    months: monthKeys,
    purchases,
    payments,
    sales,
    stockValue,
    stockValueCurrent,
    totals,
  });
}));

export default router;
