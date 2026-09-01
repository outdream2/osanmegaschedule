// supplierPayments/purchaseDetail.ts — GET /api/supplier-purchase-detail
import { Router } from "express";
import { supabase } from "../../../../src/supabase/client";
import { asyncHandler } from "../../../middleware/asyncHandler";
import { badRequest, HttpError } from "../../../middleware/errorHandler";
import { splitVat, fetchVatIncluded } from "./helpers";

const router = Router();

// GET /api/supplier-purchase-detail?supplier=X&days=365
//   · 특정 공급사 매입 raw rows (product_code, quantity, unit_price, amount)
//   · 2026-08-09 · purchase_details 만 사용 · OCR fallback 제거
router.get("/api/supplier-purchase-detail", asyncHandler(async (req, res) => {
  const supplier = String(req.query.supplier ?? "").trim();
  if (!supplier) throw badRequest("supplier 필수");
  const days = Math.max(1, Math.min(3650, parseInt(String(req.query.days ?? "365"), 10) || 365));

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffYmd = cutoffDate.toISOString().slice(0, 10);

  const vatIncludedPromise = fetchVatIncluded(supplier);

  // supplier_code 조회 (vendors.note 우선)
  let supplierCode: string | null = null;
  try {
    const { data: vn, error: vnerr } = await supabase.from("vendors").select("note").eq("company_name", supplier).limit(1);
    if (!vnerr) {
      const c = String((vn ?? [])[0]?.note ?? "").trim();
      if (c && /^\d{1,5}$/.test(c)) supplierCode = c;
    }
    try {
      const { data: vs, error: vserr } = await supabase.from("vendors").select("supplier_code").eq("company_name", supplier).limit(1);
      if (!vserr) {
        const c = String((vs ?? [])[0]?.supplier_code ?? "").trim();
        if (c) supplierCode = c;
      }
    } catch { /* silent */ }
  } catch { /* silent */ }

  // products.supplier === 이 supplier 인 product_codes 리스트
  const productCodesForSupplier: string[] = [];
  try {
    const PPAGE = 1000;
    let pfrom = 0;
    while (true) {
      const { data, error } = await supabase.from("products").select("product_code, supplier").eq("supplier", supplier).range(pfrom, pfrom + PPAGE - 1);
      if (error) break;
      if (!data || data.length === 0) break;
      for (const p of data) {
        const pc = String(p.product_code ?? "").trim();
        if (pc) productCodesForSupplier.push(pc);
      }
      if (data.length < PPAGE) break;
      pfrom += PPAGE;
    }
  } catch { /* silent */ }

  // purchase_details 조회 헬퍼 (name + code + product_codes IN · dedup by id)
  const fetchPdByNameAndCode = async (withVatCols: boolean) => {
    const cols = withVatCols
      ? "id, purchase_date, product_code, product_name, quantity, unit_price, amount, total, vat_amount, supply_amount"
      : "id, purchase_date, product_code, product_name, quantity, unit_price, amount, total";
    const byName = supabase.from("purchase_details").select(cols).eq("supplier_name", supplier).gte("purchase_date", cutoffYmd);
    const byCode = supplierCode
      ? supabase.from("purchase_details").select(cols).eq("supplier_code", supplierCode).gte("purchase_date", cutoffYmd)
      : Promise.resolve({ data: [] as any[], error: null as any });
    const byProductCodes = async () => {
      if (productCodesForSupplier.length === 0) return { data: [] as any[], error: null as any };
      const merged: any[] = [];
      const CHUNK = 500;
      for (let i = 0; i < productCodesForSupplier.length; i += CHUNK) {
        const chunk = productCodesForSupplier.slice(i, i + CHUNK);
        const { data, error } = await supabase.from("purchase_details").select(cols).in("product_code", chunk).gte("purchase_date", cutoffYmd);
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

  let data: any[] | null = null;
  const sourceUsed: "purchase_details" = "purchase_details";
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
        amount: r.amount ?? r.total ?? 0,
        vat_amount: r.vat_amount ?? 0,
        supply_amount: r.supply_amount ?? 0,
      }));
    } else if (/vat_amount|supply_amount/i.test(pdFull.error.message)) {
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
        data = null;
      }
    } else if (/relation .* does not exist/i.test(pdFull.error.message)) {
      data = null;
    }
  } catch (e: any) {
    console.warn("[supplier-purchase-detail] purchase_details 실패:", e?.message);
    data = null;
  }

  // 2026-08-09 · OCR fallback 제거 · 빈결과여도 OCR로 넘어가지 않음
  if (!data) data = [];

  const vatIncluded = await vatIncludedPromise;
  const rows = (data ?? []).map((r: any) => {
    const date = (r.invoice_date && /^\d{4}-\d{2}-\d{2}$/.test(r.invoice_date))
      ? r.invoice_date
      : String(r.saved_at ?? "").slice(0, 10);
    const amount = Number(r.amount) || 0;
    let vat = Number(r.vat_amount) || 0;
    let supply = Number(r.supply_amount) || 0;
    if (!vat && !supply) { const s = splitVat(amount, vatIncluded); vat = s.vat; supply = s.supply; }
    else if (!supply) { supply = Math.max(0, amount - vat); }
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

export default router;
