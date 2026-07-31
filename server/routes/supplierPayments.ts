// server/routes/supplierPayments.ts
// 2026-07-31 · 공급사 결제·잔고 관리 시스템 · Phase 2 API
//   · Zoho / Odoo / QuickBooks 표준: payments 원장 + allocations M:N
//   · 잔액 계산: SUM(ocr_confirmed_items.amount) - SUM(supplier_payments.amount)
//   · POST /api/supplier-payments 는 payment + allocations 를 순차 insert 후
//     allocations 실패 시 payment 롤백 (Supabase JS 는 트랜잭션 미지원 → 수동)
import { Router } from "express";
import { supabase } from "../../src/supabase/client";

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
// GET /api/supplier-payments?supplier=X&days=90
//   · 결제 이력 (allocations 포함)
// ─────────────────────────────────────────────────────────────────────
router.get("/api/supplier-payments", async (req, res) => {
  try {
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
  } catch (err: any) {
    console.error("[GET supplier-payments] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────
// POST /api/supplier-payments
//   body: { supplier_name, payment_date, amount, method?, memo?,
//           created_by?, created_by_id?,
//           allocations?: [{ocr_confirmed_item_id, allocated_amount}] }
//   · 원자성: allocations insert 실패 시 payment 롤백 (best-effort)
// ─────────────────────────────────────────────────────────────────────
router.post("/api/supplier-payments", async (req, res) => {
  try {
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
      return res.status(400).json({ error: "supplier_name 필수" });
    }
    if (!isYmd(payment_date)) {
      return res.status(400).json({ error: "payment_date 는 YYYY-MM-DD 형식이어야 합니다" });
    }
    const amt = toNumOrNull(amount);
    if (amt == null || amt <= 0) {
      return res.status(400).json({ error: "amount 는 양수여야 합니다" });
    }
    const methodClean = String(method ?? "transfer").trim().toLowerCase();
    if (!VALID_METHODS.has(methodClean)) {
      return res.status(400).json({ error: `method 는 ${Array.from(VALID_METHODS).join(",")} 중 하나여야 합니다` });
    }

    // allocations 검증
    const allocList: Array<{ ocr_confirmed_item_id: number; allocated_amount: number }> = [];
    if (Array.isArray(allocations)) {
      let sum = 0;
      for (const a of allocations) {
        const invId = Number(a?.ocr_confirmed_item_id);
        const allocAmt = toNumOrNull(a?.allocated_amount);
        if (!Number.isFinite(invId) || invId <= 0) {
          return res.status(400).json({ error: "allocation.ocr_confirmed_item_id 가 유효하지 않습니다" });
        }
        if (allocAmt == null || allocAmt <= 0) {
          return res.status(400).json({ error: "allocation.allocated_amount 는 양수여야 합니다" });
        }
        sum += allocAmt;
        allocList.push({ ocr_confirmed_item_id: invId, allocated_amount: allocAmt });
      }
      // 부동소수 오차 허용치 0.5 (원 단위 데이터 · 실무상 정수)
      if (sum > amt + 0.5) {
        return res.status(400).json({
          error: `배분 총액(${sum.toLocaleString()}) 이 결제 금액(${amt.toLocaleString()}) 을 초과할 수 없습니다`,
        });
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

    return res.status(201).json({ ...payRow, allocations: allocatedRows });
  } catch (err: any) {
    console.error("[POST supplier-payments] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────
// PATCH /api/supplier-payments/:id
//   · memo · method 만 수정 (금액·날짜 변경은 삭제→재등록 유도)
// ─────────────────────────────────────────────────────────────────────
router.patch("/api/supplier-payments/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: "invalid id" });
    }
    const { method, memo } = req.body ?? {};
    const updates: Record<string, any> = {};
    if (method !== undefined) {
      const m = String(method ?? "").trim().toLowerCase();
      if (!VALID_METHODS.has(m)) {
        return res.status(400).json({ error: `method 는 ${Array.from(VALID_METHODS).join(",")} 중 하나` });
      }
      updates.method = m;
    }
    if (memo !== undefined) {
      updates.memo = memo != null && String(memo).trim() ? String(memo).trim() : null;
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "수정할 필드 없음 (method/memo 만 허용)" });
    }

    const { data, error } = await supabase
      .from("supplier_payments")
      .update(updates)
      .eq("id", id)
      .select("id, supplier_name, payment_date, amount, method, memo, created_at")
      .single();
    if (error) throw new Error(error.message);
    return res.json(data);
  } catch (err: any) {
    console.error("[PATCH supplier-payments] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────
// DELETE /api/supplier-payments/:id
//   · allocations 은 FK ON DELETE CASCADE 로 자동 삭제
// ─────────────────────────────────────────────────────────────────────
router.delete("/api/supplier-payments/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: "invalid id" });
    }
    const { error } = await supabase.from("supplier_payments").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return res.json({ ok: true });
  } catch (err: any) {
    console.error("[DELETE supplier-payments] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────
// GET /api/supplier-balance/:supplier
//   · 현재 잔액 = SUM(ocr_confirmed_items.amount) - SUM(supplier_payments.amount)
//   · supplier 는 URL 인코딩된 회사명
// ─────────────────────────────────────────────────────────────────────
router.get("/api/supplier-balance/:supplier", async (req, res) => {
  try {
    const supplier = decodeURIComponent(req.params.supplier ?? "").trim();
    if (!supplier) return res.status(400).json({ error: "supplier 필수" });

    // 매입 합계 (ocr_confirmed_items · supplier column)
    // supabase-js 는 SQL aggregate 를 count 외 직접 미지원 · 조회 후 서버 합산
    // (규모 소~중 · 페이지네이션 없이 amount·id 만 select · <10ms 예상)
    let totalPurchase = 0;
    let purchaseCount = 0;
    {
      const { data, error } = await supabase
        .from("ocr_confirmed_items")
        .select("id, amount")
        .eq("supplier", supplier);
      if (error && !/relation .* does not exist/i.test(error.message)) throw new Error(error.message);
      for (const r of data ?? []) {
        totalPurchase += Number((r as any).amount) || 0;
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
        totalPayment += Number((r as any).amount) || 0;
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
  } catch (err: any) {
    console.error("[GET supplier-balance] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────
// GET /api/supplier-ledger?supplier=X&days=90
//   · 매입(ocr_confirmed_items) + 결제(supplier_payments) UNION
//   · 시간순 asc → running balance 계산
// ─────────────────────────────────────────────────────────────────────
router.get("/api/supplier-ledger", async (req, res) => {
  try {
    const supplier = String(req.query.supplier ?? "").trim();
    if (!supplier) return res.status(400).json({ error: "supplier 필수" });
    const days = Math.max(1, Math.min(3650, parseInt(String(req.query.days ?? "90"), 10) || 90));

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffYmd = cutoffDate.toISOString().slice(0, 10);

    // 매입 (ocr_confirmed_items)
    const purchases: any[] = [];
    {
      const { data, error } = await supabase
        .from("ocr_confirmed_items")
        .select("id, invoice_date, saved_at, supplier, product_name, amount")
        .eq("supplier", supplier)
        .gte("saved_at", cutoffYmd);
      if (error && !/relation .* does not exist/i.test(error.message)) throw new Error(error.message);
      for (const r of data ?? []) {
        const date = ((r as any).invoice_date && /^\d{4}-\d{2}-\d{2}$/.test((r as any).invoice_date))
          ? (r as any).invoice_date
          : (r as any).saved_at;
        purchases.push({
          type: "purchase",
          id: (r as any).id,
          date,
          amount: Number((r as any).amount) || 0,
          method: null,
          memo: (r as any).product_name ?? null,
          allocations: null,
        });
      }
    }

    // 결제 (supplier_payments)
    const payments: any[] = [];
    {
      const { data, error } = await supabase
        .from("supplier_payments")
        .select("id, supplier_name, payment_date, amount, method, memo")
        .eq("supplier_name", supplier)
        .gte("payment_date", cutoffYmd);
      if (error && !/relation .* does not exist/i.test(error.message)) throw new Error(error.message);
      for (const r of data ?? []) {
        payments.push({
          type: "payment",
          id: (r as any).id,
          date: (r as any).payment_date,
          amount: Number((r as any).amount) || 0,
          method: (r as any).method ?? null,
          memo: (r as any).memo ?? null,
          allocations: null,
        });
      }
    }

    // 시간순 asc · date 동일 시 매입 먼저 (재무 관례)
    const merged = [...purchases, ...payments].sort((a, b) => {
      if (a.date !== b.date) return String(a.date).localeCompare(String(b.date));
      if (a.type !== b.type) return a.type === "purchase" ? -1 : 1;
      return a.id - b.id;
    });

    // running balance · 매입(+) · 결제(-)
    let running = 0;
    const rows = merged.map(m => {
      running += m.type === "purchase" ? m.amount : -m.amount;
      return { ...m, running_balance: running };
    });

    // 프론트는 desc 로 보여주는 경우가 많으니 반전 옵션 제공
    // (여기선 asc 로 반환 · 프론트에서 정렬)
    return res.json({
      supplier,
      rows,
      total_purchase: purchases.reduce((s, r) => s + r.amount, 0),
      total_payment: payments.reduce((s, r) => s + r.amount, 0),
      current_balance: running,
    });
  } catch (err: any) {
    console.error("[GET supplier-ledger] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────
// GET /api/supplier-open-invoices?supplier=X
//   · 결제 미할당 or 부분할당 된 매입건 리스트
//   · PaymentRegisterModal 에서 체크박스 매칭용
// ─────────────────────────────────────────────────────────────────────
router.get("/api/supplier-open-invoices", async (req, res) => {
  try {
    const supplier = String(req.query.supplier ?? "").trim();
    if (!supplier) return res.status(400).json({ error: "supplier 필수" });

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
    const invIds = invList.map(i => (i as any).id);
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
        const iid = (a as any).ocr_confirmed_item_id as number;
        allocSumMap.set(iid, (allocSumMap.get(iid) ?? 0) + (Number((a as any).allocated_amount) || 0));
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
  } catch (err: any) {
    console.error("[GET supplier-open-invoices] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
