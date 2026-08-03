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
import { supabase } from "../../src/supabase/client";

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

/** vat 값 (있으면 그대로 · 없으면 amount * 0.1 별도과세 가정) */
function calcVat(amount: number, vat: number): number {
  if (vat && Number.isFinite(vat) && vat > 0) return vat;
  if (amount && Number.isFinite(amount) && amount > 0) return Math.round(amount * 0.1);
  return 0;
}

// ═════════════════════════════════════════════════════════════════
// GET /api/vat/summary?period=2026-1H
//   · 기간별 매입세액 총계 · 매입가 · 공급사수 · 예상 공제액
// ═════════════════════════════════════════════════════════════════
router.get("/api/vat/summary", async (req, res) => {
  try {
    const periodParam = String(req.query.period ?? "").trim();
    const range = resolvePeriod(periodParam);
    if (!range) return res.status(400).json({ error: "period 형식 오류 · 예: 2026-1H · 2026-Q1" });

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
      throw new Error(error.message);
    }

    // 공급사별 · category 조회 (면세 여부 판단)
    const supplierNames = Array.from(new Set((rows ?? []).map(r => String(r.supplier_name ?? "").trim()).filter(Boolean)));
    const catMap = new Map<string, string | null>();
    if (supplierNames.length > 0) {
      const { data: vendors } = await supabase
        .from("vendors")
        .select("company_name, category")
        .in("company_name", supplierNames);
      for (const v of vendors ?? []) catMap.set(String((v as any).company_name), (v as any).category ?? null);
    }

    let totalAmount = 0;
    let totalVat = 0;
    let deductibleVat = 0;
    let exemptVat = 0;
    const vendorSet = new Set<string>();

    for (const r of rows ?? []) {
      const sup = String(r.supplier_name ?? "").trim();
      const amt = Number(r.amount ?? 0) || 0;
      const vat = calcVat(amt, Number(r.vat ?? 0) || 0);
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
  } catch (err: any) {
    console.error("[vat/summary] error:", err?.message);
    res.status(500).json({ error: err?.message ?? "부가세 요약 조회 실패" });
  }
});

// ═════════════════════════════════════════════════════════════════
// GET /api/vat/vendor-breakdown?period=2026-1H
//   · 공급사별 매입가·부가세·건수 집계 (내림차순)
// ═════════════════════════════════════════════════════════════════
router.get("/api/vat/vendor-breakdown", async (req, res) => {
  try {
    const periodParam = String(req.query.period ?? "").trim();
    const range = resolvePeriod(periodParam);
    if (!range) return res.status(400).json({ error: "period 형식 오류" });

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
      throw new Error(error.message);
    }

    // 공급사 카테고리·사업자번호 조회
    const supplierNames = Array.from(new Set((rows ?? []).map(r => String(r.supplier_name ?? "").trim()).filter(Boolean)));
    const vendorMap = new Map<string, { category: string | null; business_number: string | null }>();
    if (supplierNames.length > 0) {
      const { data: vendors } = await supabase
        .from("vendors")
        .select("company_name, category, business_number")
        .in("company_name", supplierNames);
      for (const v of vendors ?? []) {
        vendorMap.set(String((v as any).company_name), {
          category: (v as any).category ?? null,
          business_number: (v as any).business_number ?? null,
        });
      }
    }

    // 공급사별 집계
    interface Agg { supplier_name: string; supplier_code: string | null; category: string | null; business_number: string | null; amount: number; vat: number; total: number; count: number; deductible: boolean; }
    const map = new Map<string, Agg>();
    for (const r of rows ?? []) {
      const sup = String(r.supplier_name ?? "").trim() || "(미상)";
      const info = vendorMap.get(sup);
      const cur = map.get(sup) ?? {
        supplier_name: sup,
        supplier_code: (r.supplier_code as string) ?? null,
        category: info?.category ?? null,
        business_number: info?.business_number ?? null,
        amount: 0, vat: 0, total: 0, count: 0,
        deductible: (info?.category ?? "") !== "면세",
      };
      const amt = Number(r.amount ?? 0) || 0;
      const vat = calcVat(amt, Number(r.vat ?? 0) || 0);
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
  } catch (err: any) {
    console.error("[vat/vendor-breakdown] error:", err?.message);
    res.status(500).json({ error: err?.message ?? "공급사별 부가세 조회 실패" });
  }
});

// ═════════════════════════════════════════════════════════════════
// GET /api/vat/vendor-detail?period=2026-1H&supplier=코스트팜
//   · 특정 공급사의 기간 내 매입 상세 명세
// ═════════════════════════════════════════════════════════════════
router.get("/api/vat/vendor-detail", async (req, res) => {
  try {
    const periodParam = String(req.query.period ?? "").trim();
    const supplier = String(req.query.supplier ?? "").trim();
    const range = resolvePeriod(periodParam);
    if (!range) return res.status(400).json({ error: "period 형식 오류" });
    if (!supplier) return res.status(400).json({ error: "supplier 필요" });

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
      throw new Error(error.message);
    }

    const rowsOut = (rows ?? []).map(r => ({
      ...r,
      amount: Math.round(Number(r.amount ?? 0) || 0),
      vat: Math.round(calcVat(Number(r.amount ?? 0) || 0, Number(r.vat ?? 0) || 0)),
      total: Math.round(Number(r.total ?? 0) || 0),
    }));

    res.json({ range, supplier, rows: rowsOut });
  } catch (err: any) {
    console.error("[vat/vendor-detail] error:", err?.message);
    res.status(500).json({ error: err?.message ?? "공급사 매입 상세 조회 실패" });
  }
});

export default router;
