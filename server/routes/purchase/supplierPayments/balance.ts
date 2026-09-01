// supplierPayments/balance.ts — GET /api/supplier-balance/:supplier · GET /api/supplier-ledger
import { Router } from "express";
import { supabase } from "../../../../src/supabase/client";
import { queryPurchaseDetails } from "../../../utils/purchaseDetailsQuery";
import { asyncHandler } from "../../../middleware/asyncHandler";
import { badRequest, HttpError } from "../../../middleware/errorHandler";
import { splitVat, fetchVatIncluded } from "./helpers";

const router = Router();

// GET /api/supplier-balance/:supplier
// 2026-09-01 · P3 최적화 · purchases + payments 병렬 Promise.all (2→1 왕복)
router.get("/api/supplier-balance/:supplier", asyncHandler(async (req, res) => {
  const supplier = decodeURIComponent(req.params.supplier ?? "").trim();
  if (!supplier) throw badRequest("supplier 필수");

  const [purchaseRows, payRes] = await Promise.all([
    queryPurchaseDetails({ supplier }),
    supabase
      .from("supplier_payments")
      .select("id, amount")
      .eq("supplier_name", supplier),
  ]);

  let totalPurchase = 0;
  let purchaseCount = 0;
  for (const r of purchaseRows) { totalPurchase += r.amount; purchaseCount++; }

  let totalPayment = 0;
  let paymentCount = 0;
  if (payRes.error && !/relation .* does not exist/i.test(payRes.error.message)) {
    throw new HttpError(500, payRes.error.message);
  }
  for (const r of payRes.data ?? []) { totalPayment += Number(r.amount) || 0; paymentCount++; }

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

// GET /api/supplier-ledger?supplier=X&days=90
//   · 매입(purchase_details) + 결제(supplier_payments) UNION · running balance 계산
router.get("/api/supplier-ledger", asyncHandler(async (req, res) => {
  const supplier = String(req.query.supplier ?? "").trim();
  if (!supplier) throw badRequest("supplier 필수");
  const days = Math.max(1, Math.min(3650, parseInt(String(req.query.days ?? "90"), 10) || 90));

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffYmd = cutoffDate.toISOString().slice(0, 10);

  const vatIncludedPromise = fetchVatIncluded(supplier);

  // 매입 (purchase_details)
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

  // 결제 (supplier_payments)
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
      else if (!/relation .* does not exist/i.test(r2.error.message)) throw new HttpError(500, r2.error.message);
    } else if (!/relation .* does not exist/i.test(r1.error.message)) throw new HttpError(500, r1.error.message);

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

  const vatIncluded = await vatIncludedPromise;
  const decoratePurchase = (m: any) => {
    let vat = m._raw_vat;
    let supply = m._raw_supply;
    if (!vat && !supply) { const s = splitVat(m.amount, vatIncluded); vat = s.vat; supply = s.supply; }
    else if (!supply) { supply = Math.max(0, m.amount - vat); }
    return { ...m, vat_amount: vat, supply_amount: supply };
  };
  const decoratePayment = (m: any) => {
    let vat = m._raw_vat;
    if (!vat) { vat = vatIncluded === true ? splitVat(m.amount, true).vat : 0; }
    const supply = Math.max(0, m.amount - vat);
    return { ...m, vat_amount: vat, supply_amount: supply };
  };

  const decoratedP = purchases.map(decoratePurchase);
  const decoratedY = payments.map(decoratePayment);

  const merged = [...decoratedP, ...decoratedY].sort((a, b) => {
    if (a.date !== b.date) return String(a.date).localeCompare(String(b.date));
    if (a.type !== b.type) return a.type === "purchase" ? -1 : 1;
    return a.id - b.id;
  });

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

export default router;
