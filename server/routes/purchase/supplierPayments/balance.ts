// supplierPayments/balance.ts — GET /api/supplier-balance/:supplier · GET /api/supplier-ledger
import { Router } from "express";
import { supabase } from "../../../../src/supabase/client";
import { queryPurchaseDetails } from "../../../utils/purchaseDetailsQuery";
import { asyncHandler } from "../../../middleware/asyncHandler";
import { badRequest, HttpError } from "../../../middleware/errorHandler";
import { splitVat, fetchVatIncluded } from "./helpers";
import logger from "../../../lib/logger";

const router = Router();

// 2026-09-10 · #59 · 사용자 지시 · 전체 공급사 · 현장 재고금액 map (VendorListEditor 좌측 리스트용)
//   · 응답 · { [supplier_name]: stock_value } · 한 번에 fetch
router.get("/api/supplier-stock-values-map", asyncHandler(async (_req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  const map: Record<string, number> = {};
  const countMap: Record<string, number> = {};
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("products")
      .select("supplier, current_stock, purchase_price, hidden")
      .range(from, from + PAGE - 1);
    if (error) {
      if (/relation .* does not exist/i.test(error.message)) break;
      throw new HttpError(500, error.message, "DB_ERROR");
    }
    if (!data || data.length === 0) break;
    for (const p of data) {
      if (p.hidden === true) continue;
      const supplier = String((p as any).supplier ?? "").trim();
      if (!supplier) continue;
      const qty = Number(p.current_stock ?? 0) || 0;
      const price = Number(p.purchase_price ?? 0) || 0;
      map[supplier] = (map[supplier] ?? 0) + qty * price;
      countMap[supplier] = (countMap[supplier] ?? 0) + 1;
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  res.json({ values: map, counts: countMap });
}));

// 2026-09-10 · 사용자 지시 · 정합성 공식 · 재고자산 = 매입액 - 결제액 = 잔고 (미지급/선지급)
//   · 전체 공급사 · balance map (전체 기간 total_purchase - total_payment)
//   · 왼쪽 리스트 총잔고 · 총재고자산 (동일 값) · 한 번에 fetch
router.get("/api/supplier-balances-map", asyncHandler(async (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  // 2026-09-14 · #140 · 기간 필터 · optional start/end (YYYY-MM-DD) · 결제대시보드 사용
  const start = String(req.query.start ?? "").trim();
  const end   = String(req.query.end ?? "").trim();
  const hasFilter = /^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end);
  const purchaseMap = new Map<string, number>();
  const paymentMap = new Map<string, number>();

  // purchase_details · supplier_name 별 · amount 합 (기간 필터 시 purchase_date 사이)
  const PD_PAGE = 1000;
  let pdFrom = 0;
  while (true) {
    let q = supabase
      .from("purchase_details")
      .select("supplier_name, amount, purchase_date")
      .range(pdFrom, pdFrom + PD_PAGE - 1);
    if (hasFilter) q = q.gte("purchase_date", start).lte("purchase_date", end);
    const { data, error } = await q;
    if (error) {
      if (/relation .* does not exist/i.test(error.message)) break;
      throw new HttpError(500, error.message, "DB_ERROR");
    }
    if (!data || data.length === 0) break;
    for (const r of data) {
      const s = String((r as any).supplier_name ?? "").trim();
      if (!s) continue;
      purchaseMap.set(s, (purchaseMap.get(s) ?? 0) + (Number((r as any).amount) || 0));
    }
    if (data.length < PD_PAGE) break;
    pdFrom += PD_PAGE;
  }

  // supplier_payments · amount 합 (기간 필터 시 payment_date 사이)
  try {
    const SP_PAGE = 1000;
    let spFrom = 0;
    while (true) {
      let q = supabase
        .from("supplier_payments")
        .select("supplier_name, amount, payment_date")
        .range(spFrom, spFrom + SP_PAGE - 1);
      if (hasFilter) q = q.gte("payment_date", start).lte("payment_date", end);
      const { data, error } = await q;
      if (error) break;
      if (!data || data.length === 0) break;
      for (const r of data) {
        const s = String((r as any).supplier_name ?? "").trim();
        if (!s) continue;
        paymentMap.set(s, (paymentMap.get(s) ?? 0) + (Number((r as any).amount) || 0));
      }
      if (data.length < SP_PAGE) break;
      spFrom += SP_PAGE;
    }
  } catch { /* silent */ }

  // 2026-09-10 · #72 · 확정 공식 · 재고자산 = 매입액 - 판매원가 (COGS) 계산 추가
  //   · 판매원가 = SUM(sale_qty × products.purchase_price) · 공급사별
  // 2026-09-11 · #119 · 사용자 신고 fix · 원가 매우 작음 · 원인 · products.purchase_price NULL 상품 대량
  //   · fix · products.purchase_price 우선 · NULL 시 · purchase_details 최근 unit_price fallback
  //   · fallback 시에도 없으면 · 0 (원가 계산 제외 · 로그로 확인 가능)
  const cogsMap = new Map<string, number>();
  try {
    // 1) products · product_code → purchase_price map
    const priceMap = new Map<string, number>();
    const productSupplierMap = new Map<string, string>();
    {
      const PAGE = 1000;
      let from = 0;
      while (true) {
        const { data } = await supabase
          .from("products")
          .select("product_code, supplier, purchase_price")
          .range(from, from + PAGE - 1);
        if (!data || data.length === 0) break;
        for (const p of data) {
          const code = String((p as any).product_code ?? "").trim();
          if (!code) continue;
          priceMap.set(code, Number((p as any).purchase_price ?? 0) || 0);
          const sup = String((p as any).supplier ?? "").trim();
          if (sup) productSupplierMap.set(code, sup);
        }
        if (data.length < PAGE) break;
        from += PAGE;
      }
    }
    // 1-b) 2026-09-11 · #119 · products.purchase_price NULL 상품 · purchase_details 최근 unit_price fallback
    //   · 각 product_code · 최근 매입 단가 · MAX(purchase_date)
    const nullPriceCodes = Array.from(priceMap.entries()).filter(([, p]) => p <= 0).map(([c]) => c);
    if (nullPriceCodes.length > 0) {
      const CHUNK = 500;
      for (let i = 0; i < nullPriceCodes.length; i += CHUNK) {
        const chunk = nullPriceCodes.slice(i, i + CHUNK);
        const { data } = await supabase
          .from("purchase_details")
          .select("product_code, unit_price, purchase_date")
          .in("product_code", chunk)
          .order("purchase_date", { ascending: false });
        for (const r of data ?? []) {
          const code = String((r as any).product_code ?? "").trim();
          if (!code) continue;
          const cur = priceMap.get(code) ?? 0;
          if (cur > 0) continue; // 이미 채워졌으면 skip (최근 date 우선)
          const p = Number((r as any).unit_price ?? 0) || 0;
          if (p > 0) priceMap.set(code, p);
        }
      }
    }
    // 2) stock_history · sale_qty × purchase_price · 공급사 (supplier_name or products.supplier fallback) 합
    //    2026-09-25 · E-2 · 사용자 지시 · 기간 필터 적용 · 매입액·판매원가·재고자산 정합
    //    매입액 (purchase_details) · 결제 (supplier_payments) · 판매원가 (stock_history) · 모두 같은 기간
    {
      const PAGE = 1000;
      let from = 0;
      while (true) {
        let q = supabase
          .from("stock_history")
          .select("supplier_name, product_code, sale_qty, snapshot_date")
          .range(from, from + PAGE - 1);
        if (hasFilter) q = q.gte("snapshot_date", start).lte("snapshot_date", end);
        const { data } = await q;
        if (!data || data.length === 0) break;
        for (const r of data) {
          const code = String((r as any).product_code ?? "").trim();
          const supRaw = String((r as any).supplier_name ?? "").trim() || productSupplierMap.get(code) || "";
          if (!supRaw) continue;
          const qty = Number((r as any).sale_qty ?? 0) || 0;
          const price = priceMap.get(code) ?? 0;
          if (qty <= 0 || price <= 0) continue;
          cogsMap.set(supRaw, (cogsMap.get(supRaw) ?? 0) + qty * price);
        }
        if (data.length < PAGE) break;
        from += PAGE;
      }
    }
  } catch (e: any) {
    logger.error(`[balance] cogs 계산 실패: ${e?.message}`);
  }

  const values: Record<string, { purchase: number; payment: number; balance: number; cogs: number; stock_asset: number }> = {};
  const allNames = new Set([...purchaseMap.keys(), ...paymentMap.keys(), ...cogsMap.keys()]);
  for (const name of allNames) {
    const purchase = purchaseMap.get(name) ?? 0;
    const payment = paymentMap.get(name) ?? 0;
    const cogs = cogsMap.get(name) ?? 0;
    values[name] = {
      purchase,
      payment,
      cogs,
      stock_asset: purchase - cogs,  // 재고자산 = 매입액 − 판매원가
      balance: purchase - payment,   // 실제잔고 = 매입액 − 결제액
    };
  }
  // 2026-09-11 · #126 · 사용자 지시 · 중요 데이터 캐시 X · 즉시 DB
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.json({ values });
}));

// 2026-09-10 · 사용자 지시 · 공급사별 · 월별 재고자산
//   · 각 월 마지막 snapshot_date · closing_stock × purchase_price · 공급사 상품 합산
//   · 응답 · [{ ym: "YYYY-MM", stock_value: number }]
router.get("/api/supplier-monthly-stock-values/:supplier", asyncHandler(async (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  const supplier = decodeURIComponent(req.params.supplier ?? "").trim();
  if (!supplier) throw badRequest("supplier 필수");
  const months = Math.max(1, Math.min(24, parseInt(String(req.query.months ?? "12"), 10) || 12));

  // 공급사 상품 · purchase_price map
  const priceMap = new Map<string, number>();
  {
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("products")
        .select("product_code, purchase_price, hidden")
        .eq("supplier", supplier)
        .range(from, from + PAGE - 1);
      if (error) {
        if (/relation .* does not exist/i.test(error.message)) break;
        throw new HttpError(500, error.message, "DB_ERROR");
      }
      if (!data || data.length === 0) break;
      for (const p of data) {
        if (p.hidden === true) continue;
        const code = String((p as any).product_code ?? "").trim();
        if (!code) continue;
        priceMap.set(code, Number(p.purchase_price ?? 0) || 0);
      }
      if (data.length < PAGE) break;
      from += PAGE;
    }
  }

  if (priceMap.size === 0) {
    return res.json({ supplier, rows: [] as { ym: string; stock_value: number }[] });
  }

  // stock_history · 최근 months 개월 · 공급사 상품 · 각 (product_code, ym) 최신 snapshot 의 closing_stock
  const today = new Date();
  const cutoff = new Date(today.getFullYear(), today.getMonth() - months + 1, 1);
  const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-01`;

  const codes = Array.from(priceMap.keys());
  const latestByProductYm = new Map<string, { snap: string; closing: number }>(); // key = `${code}::${ym}`

  const CHUNK = 200;
  const PAGE = 1000;
  for (let i = 0; i < codes.length; i += CHUNK) {
    const chunk = codes.slice(i, i + CHUNK);
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("stock_history")
        .select("snapshot_date, product_code, closing_stock")
        .in("product_code", chunk)
        .gte("snapshot_date", cutoffStr)
        .order("snapshot_date", { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) {
        if (/relation .* does not exist/i.test(error.message)) break;
        throw new HttpError(500, error.message, "DB_ERROR");
      }
      if (!data || data.length === 0) break;
      for (const r of data) {
        const code = String(r.product_code ?? "").trim();
        const snap = String(r.snapshot_date ?? "");
        if (!code || !snap) continue;
        const ym = snap.slice(0, 7);
        const key = `${code}::${ym}`;
        const cur = latestByProductYm.get(key);
        if (!cur || snap > cur.snap) {
          latestByProductYm.set(key, { snap, closing: Number(r.closing_stock ?? 0) || 0 });
        }
      }
      if (data.length < PAGE) break;
      from += PAGE;
    }
  }

  // ym 별 합산
  const ymMap = new Map<string, number>();
  for (const [key, v] of latestByProductYm) {
    const [code, ym] = key.split("::");
    const price = priceMap.get(code) ?? 0;
    ymMap.set(ym, (ymMap.get(ym) ?? 0) + v.closing * price);
  }

  const rows = Array.from(ymMap.entries())
    .map(([ym, stock_value]) => ({ ym, stock_value: Math.round(stock_value) }))
    .sort((a, b) => b.ym.localeCompare(a.ym)); // 최신 월 먼저

  res.json({ supplier, rows });
}));

// 2026-09-10 · #58 · 사용자 지시 · 공급사별 현장 재고금액
//   · ERP 기준 · SUM(current_stock × purchase_price) · 공급사별 · hidden 제외
router.get("/api/supplier-stock-value/:supplier", asyncHandler(async (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  const supplier = decodeURIComponent(req.params.supplier ?? "").trim();
  if (!supplier) throw badRequest("supplier 필수");

  let stockValue = 0;
  let productCount = 0;
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("products")
      .select("product_code, current_stock, purchase_price, hidden")
      .eq("supplier", supplier)
      .range(from, from + PAGE - 1);
    if (error) {
      if (/relation .* does not exist/i.test(error.message)) break;
      throw new HttpError(500, error.message, "DB_ERROR");
    }
    if (!data || data.length === 0) break;
    for (const p of data) {
      if (p.hidden === true) continue;
      const qty = Number(p.current_stock ?? 0) || 0;
      const price = Number(p.purchase_price ?? 0) || 0;
      stockValue += qty * price;
      productCount++;
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }

  res.json({ supplier, stock_value: stockValue, product_count: productCount });
}));

// GET /api/supplier-balance/:supplier
// 2026-09-01 · P3 최적화 · purchases + payments 병렬 Promise.all (2→1 왕복)
router.get("/api/supplier-balance/:supplier", asyncHandler(async (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
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
  // 2026-09-11 · #127·#126 · 대원칙 · 캐시 X · 즉시 업데이트
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
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
        // 2026-09-11 · #127 · SSOT · 우측 매입내역 탭 표시용
        product_code: r.product_code || null,
        product_name: r.product_name || null,
        quantity: Number((r as any).quantity ?? 0),
        unit_price: Number((r as any).unit_price ?? 0),
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
