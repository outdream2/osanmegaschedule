// 2026-08-16 · asyncHandler + HttpError 프레임워크 적용
// server/routes/vat.ts
// 2026-08-03 · 부가세 준비 API · #197
//   · 매입세액 집계 (기간별 · 공급사별)
//   · Supabase · purchase_details (매입 상세) + vendors (사업자번호·카테고리) 조인
//   · 반기·확정신고 기간 파라미터: 2026-1H (1~6월), 2026-2H (7~12월), 2026-Q1..Q4 (법인 예정신고)
//   · 매입세액 계산:
//       - purchase_details.vat 컬럼 값 우선 (엑셀 임포트 시 부가세 컬럼)
//       - vat 이 0/누락 시 amount 기준으로 별도과세 가정 (amount * 0.1)
//       - vendors.category === "면세" 인 공급사는 매입세액 공제 대상 제외 (약국 처방전 관련 매입 · 면세)
//   · 폴백: purchase_details 테이블 없으면 goods_receipts (있으면) 시도 · 없으면 warning
//
// 리서치 요약 (2026 한국 부가세):
//   · 일반과세자 개인사업자 · 1년 2회 신고 (1~6월분 → 7/25, 7~12월분 → 1/25 다음해)
//   · 일반과세자 법인 · 1년 4회 (예정 4/25 · 확정 7/25 · 예정 10/25 · 확정 1/25)
//   · 간이과세자 · 1년 1회 (1/25 다음해)
//   · 세율 · 10% (표준) · 면세 항목 별도 (약국 조제료·전문의약품 대부분 면세)
//   · 매입세액 공제 = SUM(매입 부가세) · 단 면세사업 관련 매입은 불공제 (안분계산)
//   · 홈택스 신고서 서식: 매입처별 세금계산서 합계표 · 신용카드 매출전표 수령명세서 등
//
import { Router } from "express";
import { supabase } from "../../../src/supabase/client";
import { asyncHandler } from "../../middleware/asyncHandler";
import { badRequest, HttpError } from "../../middleware/errorHandler";

const router = Router();

// ─── 유틸 ────────────────────────────────────────────────────────
type PeriodKey =
  | `${number}-1H` | `${number}-2H`
  | `${number}-Q1` | `${number}-Q2` | `${number}-Q3` | `${number}-Q4`;

interface PeriodRange { from: string; to: string; label: string; type: "예정" | "확정"; dueDate: string; }

/** period 문자열 → { from, to } (YYYY-MM-DD) */
function resolvePeriod(period: string): PeriodRange | null {
  const m = /^(\d{4})-(1H|2H|Q1|Q2|Q3|Q4)$/.exec(period);
  if (!m) return null;
  const y = Number(m[1]);
  const p = m[2];
  const nextY = y + 1;
  switch (p) {
    case "1H": return { from: `${y}-01-01`, to: `${y}-06-30`, label: `${y}년 1기 확정`,    type: "확정", dueDate: `${y}-07-25` };
    case "2H": return { from: `${y}-07-01`, to: `${y}-12-31`, label: `${y}년 2기 확정`,    type: "확정", dueDate: `${nextY}-01-25` };
    case "Q1": return { from: `${y}-01-01`, to: `${y}-03-31`, label: `${y}년 1기 예정`,    type: "예정", dueDate: `${y}-04-25` };
    case "Q2": return { from: `${y}-04-01`, to: `${y}-06-30`, label: `${y}년 1기 확정`,    type: "확정", dueDate: `${y}-07-25` };
    case "Q3": return { from: `${y}-07-01`, to: `${y}-09-30`, label: `${y}년 2기 예정`,    type: "예정", dueDate: `${y}-10-25` };
    case "Q4": return { from: `${y}-10-01`, to: `${y}-12-31`, label: `${y}년 2기 확정`,    type: "확정", dueDate: `${nextY}-01-25` };
  }
  return null;
}

/** 다음 신고 기한 안내 (오늘 기준 · 개인·일반과세자 기준 · 1H/2H) */
function getNextDeadline(today: Date): { period: PeriodKey; label: string; type: "예정" | "확정"; dueDate: string; daysLeft: number } {
  const y = today.getFullYear();
  const candidates: Array<{ period: PeriodKey; deadline: Date; label: string; type: "예정" | "확정" }> = [
    { period: `${y}-1H` as PeriodKey,     deadline: new Date(`${y}-07-25`),     label: `${y}년 1기 확정 신고`, type: "확정" },
    { period: `${y}-2H` as PeriodKey,     deadline: new Date(`${y + 1}-01-25`), label: `${y}년 2기 확정 신고`, type: "확정" },
    { period: `${y + 1}-1H` as PeriodKey, deadline: new Date(`${y + 1}-07-25`), label: `${y + 1}년 1기 확정 신고`, type: "확정" },
  ];
  const upcoming = candidates.filter(c => c.deadline.getTime() >= today.getTime()).sort((a, b) => a.deadline.getTime() - b.deadline.getTime())[0];
  const c = upcoming ?? candidates[candidates.length - 1];
  const days = Math.ceil((c.deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return { period: c.period, label: c.label, type: c.type, dueDate: c.deadline.toISOString().slice(0, 10), daysLeft: days };
}

/** vat 값 (row 저장값 우선 · 없으면 vendor.vat_included 반영해서 amount 로 계산)
 *  · vat_included=true  · amount 가 총액(VAT 포함) → vat = amount/11
 *  · vat_included=false · amount 가 공급가액(별도)  → vat = amount*0.1
 *  · vat_included=null  · 기존 폴백 · 별도과세 가정 (amount*0.1) · #197 원래 동작 유지
 */
function calcVat(amount: number, vat: number, vatIncluded: boolean | null = null): number {
  if (vat && Number.isFinite(vat) && vat > 0) return vat;
  if (!(amount && Number.isFinite(amount) && amount > 0)) return 0;
  if (vatIncluded === true) return Math.round(amount / 11);
  return Math.round(amount * 0.1);
}

// ═════════════════════════════════════════════════════════════════
// GET /api/vat/summary?period=2026-1H
//   · 기간별 매입세액 총계 · 매입가 · 공급사수 · 예상 공제액
// ═════════════════════════════════════════════════════════════════
router.get("/api/vat/summary", asyncHandler(async (req, res) => {
  const periodParam = String(req.query.period ?? "").trim();
  const range = resolvePeriod(periodParam);
  if (!range) throw badRequest("period 형식 오류 · 예: 2026-1H · 2026-Q1");

  const { data: rows, error } = await supabase
    .from("purchase_details")
    .select("supplier_name, amount, vat, total")
    .gte("purchase_date", range.from)
    .lte("purchase_date", range.to)
    .limit(50000);

  if (error) {
    if (/relation .* does not exist/i.test(error.message)) {
      return res.json({
        range, next: getNextDeadline(new Date()),
        totalAmount: 0, totalVat: 0, deductibleVat: 0, exemptVat: 0,
        vendorCount: 0, rowCount: 0,
        warning: "purchase_details 테이블 없음 (매입 데이터 임포트 필요)",
      });
    }
    throw new HttpError(500, error.message, "DB_ERROR");
  }

  // 공급사별 · category + vat_included 조회 (면세·VAT 포함 여부 판단)
  const supplierNames = Array.from(new Set((rows ?? []).map(r => String(r.supplier_name ?? "").trim()).filter(Boolean)));
  const catMap = new Map<string, string | null>();
  const vatIncMap = new Map<string, boolean | null>();
  if (supplierNames.length > 0) {
    // vat_included 컬럼 없는 DB fallback
    let vendors: any[] | null = null;
    const rv1 = await supabase
      .from("vendors")
      .select("company_name, category, vat_included")
      .in("company_name", supplierNames);
    if (!rv1.error) vendors = rv1.data ?? [];
    else if (/vat_included/i.test(rv1.error.message)) {
      const rv2 = await supabase
        .from("vendors")
        .select("company_name, category")
        .in("company_name", supplierNames);
      if (!rv2.error) vendors = (rv2.data ?? []).map((v: any) => ({ ...v, vat_included: null }));
    }
    for (const v of vendors ?? []) {
      const name = String((v as any).company_name);
      catMap.set(name, (v as any).category ?? null);
      const vi = (v as any).vat_included;
      vatIncMap.set(name, vi === true || vi === false ? vi : null);
    }
  }

  let totalAmount = 0;
  let totalVat = 0;
  let deductibleVat = 0;
  let exemptVat = 0;
  const vendorSet = new Set<string>();

  for (const r of rows ?? []) {
    const sup = String(r.supplier_name ?? "").trim();
    const amt = Number(r.amount ?? 0) || 0;
    const vi = vatIncMap.get(sup) ?? null;
    const vat = calcVat(amt, Number(r.vat ?? 0) || 0, vi);
    totalAmount += amt;
    totalVat += vat;
    if (sup) vendorSet.add(sup);
    const cat = catMap.get(sup) ?? "";
    if (cat === "면세") exemptVat += vat;
    else deductibleVat += vat;
  }

  res.json({
    range,
    next: getNextDeadline(new Date()),
    totalAmount: Math.round(totalAmount),
    totalVat: Math.round(totalVat),
    deductibleVat: Math.round(deductibleVat),
    exemptVat: Math.round(exemptVat),
    vendorCount: vendorSet.size,
    rowCount: (rows ?? []).length,
  });
}));

// ═════════════════════════════════════════════════════════════════
// GET /api/vat/vendor-breakdown?period=2026-1H
//   · 공급사별 매입가·부가세·건수 집계 (내림차순)
// ═════════════════════════════════════════════════════════════════
router.get("/api/vat/vendor-breakdown", asyncHandler(async (req, res) => {
  const periodParam = String(req.query.period ?? "").trim();
  const range = resolvePeriod(periodParam);
  if (!range) throw badRequest("period 형식 오류");

  const { data: rows, error } = await supabase
    .from("purchase_details")
    .select("supplier_name, supplier_code, amount, vat, total, purchase_date")
    .gte("purchase_date", range.from)
    .lte("purchase_date", range.to)
    .limit(50000);

  if (error) {
    if (/relation .* does not exist/i.test(error.message)) {
      return res.json({ range, rows: [], warning: "purchase_details 테이블 없음" });
    }
    throw new HttpError(500, error.message, "DB_ERROR");
  }

  // 공급사 카테고리·사업자번호·vat_included 조회
  const supplierNames = Array.from(new Set((rows ?? []).map(r => String(r.supplier_name ?? "").trim()).filter(Boolean)));
  const vendorMap = new Map<string, { category: string | null; business_number: string | null; vat_included: boolean | null }>();
  if (supplierNames.length > 0) {
    let vendors: any[] | null = null;
    const rv1 = await supabase
      .from("vendors")
      .select("company_name, category, business_number, vat_included")
      .in("company_name", supplierNames);
    if (!rv1.error) vendors = rv1.data ?? [];
    else if (/vat_included/i.test(rv1.error.message)) {
      const rv2 = await supabase
        .from("vendors")
        .select("company_name, category, business_number")
        .in("company_name", supplierNames);
      if (!rv2.error) vendors = (rv2.data ?? []).map((v: any) => ({ ...v, vat_included: null }));
    }
    for (const v of vendors ?? []) {
      const vi = (v as any).vat_included;
      vendorMap.set(String((v as any).company_name), {
        category: (v as any).category ?? null,
        business_number: (v as any).business_number ?? null,
        vat_included: vi === true || vi === false ? vi : null,
      });
    }
  }

  // 공급사별 집계
  interface Agg { supplier_name: string; supplier_code: string | null; category: string | null; business_number: string | null; vat_included: boolean | null; amount: number; vat: number; total: number; count: number; deductible: boolean; }
  const map = new Map<string, Agg>();
  for (const r of rows ?? []) {
    const sup = String(r.supplier_name ?? "").trim() || "(미상)";
    const info = vendorMap.get(sup);
    const cur = map.get(sup) ?? {
      supplier_name: sup,
      supplier_code: (r.supplier_code as string) ?? null,
      category: info?.category ?? null,
      business_number: info?.business_number ?? null,
      vat_included: info?.vat_included ?? null,
      amount: 0, vat: 0, total: 0, count: 0,
      deductible: (info?.category ?? "") !== "면세",
    };
    const amt = Number(r.amount ?? 0) || 0;
    const vat = calcVat(amt, Number(r.vat ?? 0) || 0, info?.vat_included ?? null);
    cur.amount += amt;
    cur.vat += vat;
    cur.total += Number(r.total ?? 0) || (amt + vat);
    cur.count += 1;
    map.set(sup, cur);
  }

  const rowsOut = Array.from(map.values())
    .map(v => ({
      ...v,
      amount: Math.round(v.amount),
      vat: Math.round(v.vat),
      total: Math.round(v.total),
    }))
    .sort((a, b) => b.vat - a.vat);

  res.json({ range, rows: rowsOut });
}));

// ═════════════════════════════════════════════════════════════════
// GET /api/vat/vendor-detail?period=2026-1H&supplier=코스트팜
//   · 특정 공급사의 기간 내 매입 상세 명세
// ═════════════════════════════════════════════════════════════════
router.get("/api/vat/vendor-detail", asyncHandler(async (req, res) => {
  const periodParam = String(req.query.period ?? "").trim();
  const supplier = String(req.query.supplier ?? "").trim();
  const range = resolvePeriod(periodParam);
  if (!range) throw badRequest("period 형식 오류");
  if (!supplier) throw badRequest("supplier 필요");

  // vendor.vat_included lookup (병렬 · 실패해도 null 폴백)
  const vendorLookupPromise = (async () => {
    const rv1 = await supabase.from("vendors").select("vat_included").eq("company_name", supplier).maybeSingle();
    if (!rv1.error) {
      const vi = (rv1.data as any)?.vat_included;
      return vi === true || vi === false ? vi : null;
    }
    return null;
  })();

  const { data: rows, error } = await supabase
    .from("purchase_details")
    .select("id, purchase_date, product_code, product_name, spec, quantity, unit_price, amount, vat, total")
    .eq("supplier_name", supplier)
    .gte("purchase_date", range.from)
    .lte("purchase_date", range.to)
    .order("purchase_date", { ascending: false })
    .limit(2000);

  if (error) {
    if (/relation .* does not exist/i.test(error.message)) {
      return res.json({ range, supplier, rows: [], warning: "purchase_details 테이블 없음" });
    }
    throw new HttpError(500, error.message, "DB_ERROR");
  }

  const vatIncluded = await vendorLookupPromise;
  const rowsOut = (rows ?? []).map(r => ({
    ...r,
    amount: Math.round(Number(r.amount ?? 0) || 0),
    vat: Math.round(calcVat(Number(r.amount ?? 0) || 0, Number(r.vat ?? 0) || 0, vatIncluded)),
    total: Math.round(Number(r.total ?? 0) || 0),
  }));

  res.json({ range, supplier, vat_included: vatIncluded, rows: rowsOut });
}));

// ═════════════════════════════════════════════════════════════════
// GET /api/vat/monthly-summary?from=YYYY-MM-DD&to=YYYY-MM-DD
//   · 월별 매출·매입 통합 · 예상 부가세 계산 base 데이터
//   · 매출 · stock_history.total_amount (SKU 별 판매액 · snapshot_date 로 월 그룹)
//     - VAT 포함 총액으로 가정 · 매출세액 = total / 11 (10/110 rule)
//     - 참고 · POS 데이터 상 과세/면세 구분 없음 · 사용자 안내 필요
//   · 매입 · purchase_details.amount + vendor.vat_included flag 로 VAT 계산
//     - vat_included=true  · 매입세액 = amount / 11 · 공급가액 = amount × 10/11
//     - vat_included=false · 매입세액 = amount × 0.1 · 공급가액 = amount
//     - 면세 (vendor.category === "면세") · 매입세액 = 0 (불공제)
//   · 반환 · months[] 오름차순 · 각 월 { month, salesTotal, salesVat, salesSupply,
//                                        purchaseGross, purchaseSupply, purchaseVat, purchaseDeductibleVat }
// ═════════════════════════════════════════════════════════════════
router.get("/api/vat/monthly-summary", asyncHandler(async (req, res) => {
  const fromParam = String(req.query.from ?? "").trim();
  const toParam = String(req.query.to ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromParam) || !/^\d{4}-\d{2}-\d{2}$/.test(toParam)) {
    throw badRequest("from, to (YYYY-MM-DD) 필수");
  }
  if (fromParam > toParam) {
    throw badRequest("from > to");
  }

  const monthsAgg = new Map<string, {
    month: string;
    salesTotal: number;         // 매출 총액 (VAT 포함 가정)
    salesVat: number;           // 매출세액 (total / 11)
    salesSupply: number;        // 공급가액 (total - vat)
    salesRowCount: number;
    purchaseGross: number;      // 매입 총액 (amount + vat)
    purchaseSupply: number;     // 공급가액
    purchaseVat: number;        // 매입세액 (총)
    purchaseDeductibleVat: number; // 매입세액 중 공제 가능분 (면세 공급사 제외)
    purchaseRowCount: number;
  }>();

  const getBucket = (month: string) => {
    if (!monthsAgg.has(month)) {
      monthsAgg.set(month, {
        month,
        salesTotal: 0,
        salesVat: 0,
        salesSupply: 0,
        salesRowCount: 0,
        purchaseGross: 0,
        purchaseSupply: 0,
        purchaseVat: 0,
        purchaseDeductibleVat: 0,
        purchaseRowCount: 0,
      });
    }
    return monthsAgg.get(month)!;
  };

  const warnings: string[] = [];

  // ── 매출 · stock_history · snapshot_date 로 그룹 ───────────
  //   NOTE · stock_history 는 SKU × 일자 매트릭스 · total_amount = sale_qty × sale_price
  //   snapshot_date 기준 월 그룹 · VAT 포함 총액으로 간주
  try {
    const PAGE = 1000;
    let fromRow = 0;
    let salesTableMissing = false;
    while (true) {
      const { data: pg, error: pgErr } = await supabase
        .from("stock_history")
        .select("snapshot_date, total_amount")
        .gte("snapshot_date", fromParam)
        .lte("snapshot_date", toParam)
        .range(fromRow, fromRow + PAGE - 1);
      if (pgErr) {
        if (/relation .* does not exist/i.test(pgErr.message)) {
          salesTableMissing = true;
          break;
        }
        throw new HttpError(500, pgErr.message, "DB_ERROR");
      }
      if (!pg || pg.length === 0) break;
      for (const r of pg) {
        const date = String((r as any).snapshot_date ?? "");
        const month = date.slice(0, 7);
        if (!/^\d{4}-\d{2}$/.test(month)) continue;
        const amt = Number((r as any).total_amount ?? 0) || 0;
        if (amt <= 0) continue;
        const bucket = getBucket(month);
        bucket.salesTotal += amt;
        bucket.salesRowCount += 1;
      }
      if (pg.length < PAGE) break;
      fromRow += PAGE;
    }
    if (salesTableMissing) {
      warnings.push("stock_history 테이블 없음 · 매출 데이터 0 표시");
    }
  } catch (e: any) {
    warnings.push(`매출 조회 실패: ${e?.message ?? "unknown"}`);
  }

  // 매출 · VAT 포함 총액 기준 매출세액 계산 (총액 / 11 · 반올림)
  for (const bucket of monthsAgg.values()) {
    if (bucket.salesTotal > 0) {
      bucket.salesVat = Math.round(bucket.salesTotal / 11);
      bucket.salesSupply = bucket.salesTotal - bucket.salesVat;
    }
  }

  // ── 매입 · purchase_details + vendors.vat_included ─────────
  const purchaseRows: Array<{ supplier: string; date: string; amount: number; vat: number }> = [];
  try {
    const PAGE = 1000;
    let fromRow = 0;
    let purchaseTableMissing = false;
    while (true) {
      const { data: pg, error: pgErr } = await supabase
        .from("purchase_details")
        .select("supplier_name, purchase_date, amount, vat")
        .gte("purchase_date", fromParam)
        .lte("purchase_date", toParam)
        .range(fromRow, fromRow + PAGE - 1);
      if (pgErr) {
        if (/relation .* does not exist/i.test(pgErr.message)) {
          purchaseTableMissing = true;
          break;
        }
        throw new HttpError(500, pgErr.message, "DB_ERROR");
      }
      if (!pg || pg.length === 0) break;
      for (const r of pg) {
        const sup = String((r as any).supplier_name ?? "").trim();
        const date = String((r as any).purchase_date ?? "");
        if (!/^\d{4}-\d{2}-\d{2}/.test(date)) continue;
        purchaseRows.push({
          supplier: sup,
          date,
          amount: Number((r as any).amount ?? 0) || 0,
          vat: Number((r as any).vat ?? 0) || 0,
        });
      }
      if (pg.length < PAGE) break;
      fromRow += PAGE;
    }
    if (purchaseTableMissing) {
      warnings.push("purchase_details 테이블 없음 · 매입 데이터 0 표시");
    }
  } catch (e: any) {
    warnings.push(`매입 조회 실패: ${e?.message ?? "unknown"}`);
  }

  // 공급사 정보 lookup
  const supplierNames = Array.from(new Set(purchaseRows.map(r => r.supplier).filter(Boolean)));
  const catMap = new Map<string, string | null>();
  const vatIncMap = new Map<string, boolean | null>();
  if (supplierNames.length > 0) {
    let vendors: any[] | null = null;
    const rv1 = await supabase
      .from("vendors")
      .select("company_name, category, vat_included")
      .in("company_name", supplierNames);
    if (!rv1.error) vendors = rv1.data ?? [];
    else if (/vat_included/i.test(rv1.error.message)) {
      const rv2 = await supabase
        .from("vendors")
        .select("company_name, category")
        .in("company_name", supplierNames);
      if (!rv2.error) vendors = (rv2.data ?? []).map((v: any) => ({ ...v, vat_included: null }));
    }
    for (const v of vendors ?? []) {
      const name = String((v as any).company_name);
      catMap.set(name, (v as any).category ?? null);
      const vi = (v as any).vat_included;
      vatIncMap.set(name, vi === true || vi === false ? vi : null);
    }
  }

  for (const r of purchaseRows) {
    const month = r.date.slice(0, 7);
    const bucket = getBucket(month);
    const vi = vatIncMap.get(r.supplier) ?? null;
    const cat = catMap.get(r.supplier) ?? "";
    const vat = calcVat(r.amount, r.vat, vi);

    // VAT 포함 매입 · amount 가 총액 · 공급가액 = amount - vat
    // VAT 별도 매입 · amount 가 공급가액 · 총액 = amount + vat
    // 면세 (cat === "면세") · vat 를 0 처리 · 공급가액 = amount · 총액 = amount
    let supply: number;
    let gross: number;
    let effectiveVat: number;
    if (cat === "면세") {
      effectiveVat = 0;
      supply = r.amount;
      gross = r.amount;
    } else if (vi === true) {
      effectiveVat = vat;
      supply = r.amount - vat;
      gross = r.amount;
    } else {
      // vi === false or null · 별도 과세 가정
      effectiveVat = vat;
      supply = r.amount;
      gross = r.amount + vat;
    }

    bucket.purchaseGross += gross;
    bucket.purchaseSupply += supply;
    bucket.purchaseVat += effectiveVat;
    if (cat !== "면세") {
      bucket.purchaseDeductibleVat += effectiveVat;
    }
    bucket.purchaseRowCount += 1;
  }

  // ── 월 시퀀스 채우기 (from ~ to 사이 · 빈 월도 포함) ───────
  const [fy, fm] = fromParam.slice(0, 7).split("-").map(Number);
  const [ty, tm] = toParam.slice(0, 7).split("-").map(Number);
  const monthList: string[] = [];
  let cy = fy, cm = fm;
  while (cy < ty || (cy === ty && cm <= tm)) {
    monthList.push(`${cy}-${String(cm).padStart(2, "0")}`);
    cm += 1;
    if (cm > 12) { cm = 1; cy += 1; }
    if (monthList.length > 60) break; // safety
  }
  for (const m of monthList) getBucket(m); // ensure empty months exist

  const months = Array.from(monthsAgg.values())
    .filter(b => monthList.includes(b.month))
    .sort((a, b) => (a.month < b.month ? -1 : 1))
    .map(b => ({
      month: b.month,
      salesTotal: Math.round(b.salesTotal),
      salesVat: Math.round(b.salesVat),
      salesSupply: Math.round(b.salesSupply),
      salesRowCount: b.salesRowCount,
      purchaseGross: Math.round(b.purchaseGross),
      purchaseSupply: Math.round(b.purchaseSupply),
      purchaseVat: Math.round(b.purchaseVat),
      purchaseDeductibleVat: Math.round(b.purchaseDeductibleVat),
      purchaseRowCount: b.purchaseRowCount,
    }));

  res.json({
    from: fromParam,
    to: toParam,
    months,
    warning: warnings.length > 0 ? warnings.join(" · ") : undefined,
  });
}));

export default router;
