// supplierPayments/purchaseSummary.ts — GET /api/supplier-purchase-summary
import { Router } from "express";
import { supabase } from "../../../../src/supabase/client";
import { asyncHandler } from "../../../middleware/asyncHandler";
import { HttpError } from "../../../middleware/errorHandler";

const router = Router();

// GET /api/supplier-purchase-summary?days=90
//   · 모든 공급사 매입 요약 (좌측 vendor 카드용)
//   · 2026-08-09 · purchase_details 만 · OCR fallback 제거
router.get("/api/supplier-purchase-summary", asyncHandler(async (req, res) => {
  const days = Math.max(1, Math.min(3650, parseInt(String(req.query.days ?? "90"), 10) || 90));
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffYmd = cutoffDate.toISOString().slice(0, 10);

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  interface NormRow { supplier: string; date: string; amount: number; code: string; }
  const normRows: NormRow[] = [];
  let pdOk = false;
  let pdRowCount = 0;
  let pdSkippedNullSupplier = 0;
  let pdRelationMissing = false;
  let pdTotalAllTime: number | null = null;
  let pdLatestDate: string | null = null;

  try {
    const { count } = await supabase.from("purchase_details").select("id", { count: "exact", head: true });
    if (count != null) pdTotalAllTime = count;
    const { data: latestRow } = await supabase.from("purchase_details").select("purchase_date").order("purchase_date", { ascending: false }).limit(1);
    const l = (latestRow ?? [])[0];
    pdLatestDate = l?.purchase_date ? String(l.purchase_date).slice(0, 10) : null;
  } catch (e: any) {
    if (/relation .* does not exist/i.test(String(e?.message ?? ""))) pdRelationMissing = true;
  }

  // supplier_code → supplier_name 매핑 (vendors.note 에 code 저장)
  const codeToName = new Map<string, string>();
  try {
    const { data: vdata, error: verr } = await supabase.from("vendors").select("company_name, note");
    if (!verr) {
      for (const v of vdata ?? []) {
        const code = String(v.note ?? "").trim();
        const name = String(v.company_name ?? "").trim();
        if (code && name && /^\d{1,5}$/.test(code)) codeToName.set(code, name);
      }
    }
    try {
      const { data: sdata, error: serr } = await supabase.from("vendors").select("company_name, supplier_code");
      if (!serr) {
        for (const v of sdata ?? []) {
          const code = String(v.supplier_code ?? "").trim();
          const name = String(v.company_name ?? "").trim();
          if (code && name) codeToName.set(code, name);
        }
      }
    } catch { /* silent */ }
  } catch { /* silent */ }

  // products.product_code → supplier 매핑
  const productCodeToSupplier = new Map<string, string>();
  try {
    const PPAGE = 1000;
    let pfrom = 0;
    while (true) {
      const { data, error } = await supabase.from("products").select("product_code, supplier").range(pfrom, pfrom + PPAGE - 1);
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
  } catch { /* silent */ }

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
        throw new HttpError(500, error.message);
      }
      if (!data || data.length === 0) break;
      for (const r of data) {
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
      console.warn(`[supplier-purchase-summary] purchase_details · supplier_name NULL 로 스킵된 행 ${pdSkippedNullSupplier}개`);
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
          console.warn(`[supplier-purchase-summary] 매핑 실패 supplier_code 예시:`, codes);
          console.warn(`[supplier-purchase-summary] 매핑 실패 product_code 예시:`, prodCodes);
        }
      } catch { /* silent */ }
    }
  } catch (e: any) {
    console.warn("[supplier-purchase-summary] purchase_details 실패:", e?.message);
  }

  // ─── 2026-08-09 · OCR fallback 제거 ───

  interface Agg {
    supplier: string;
    last_purchase_date: string | null;
    first_purchase_date: string | null;
    this_month_amount: number;
    total_amount: number;
    purchase_count: number;
    sku_set: Set<string>;
    date_set: Set<string>;
    weekly: number[];
  }
  const bucket = new Map<string, Agg>();
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const nowMs = now.getTime();

  for (const r of normRows) {
    let agg = bucket.get(r.supplier);
    if (!agg) {
      agg = {
        supplier: r.supplier,
        last_purchase_date: null, first_purchase_date: null,
        this_month_amount: 0, total_amount: 0, purchase_count: 0,
        sku_set: new Set<string>(), date_set: new Set<string>(),
        weekly: new Array(12).fill(0),
      };
      bucket.set(r.supplier, agg);
    }
    if (!agg.last_purchase_date || r.date > agg.last_purchase_date) agg.last_purchase_date = r.date;
    if (!agg.first_purchase_date || r.date < agg.first_purchase_date) agg.first_purchase_date = r.date;
    agg.total_amount += r.amount;
    agg.purchase_count += 1;
    if (r.code) agg.sku_set.add(r.code);
    agg.date_set.add(r.date);
    if (r.date >= monthStart) agg.this_month_amount += r.amount;
    const dMs = new Date(r.date + "T00:00:00Z").getTime();
    if (!Number.isNaN(dMs)) {
      const weeksAgo = Math.floor((nowMs - dMs) / WEEK_MS);
      if (weeksAgo >= 0 && weeksAgo < 12) agg.weekly[11 - weeksAgo] += r.amount;
    }
  }

  const suppliers = Array.from(bucket.values()).map(a => {
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
      pd_total_all_time: pdTotalAllTime,
      pd_latest_date: pdLatestDate,
      total_rows: normRows.length,
    },
  });
}));

export default router;
