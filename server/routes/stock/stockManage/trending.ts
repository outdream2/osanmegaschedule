// GET /api/stock-manage/trending?months_list=YYYY-MM,YYYY-MM&limit=100
// GET /api/stock-manage/trending-period?from=YYYY-MM-DD&to=YYYY-MM-DD&prior_from=...&prior_to=...&limit=20
// 최근 판매 급상승 상품
import { Router } from "express";
import { supabase } from "../../../../src/supabase/client";
import { asyncHandler } from "../../../middleware/asyncHandler";
import { HttpError, badRequest } from "../../../middleware/errorHandler";
import logger from "../../../lib/logger";

const router = Router();

// GET /api/stock-manage/trending
// 2026-10-06 · 사용자 지시 · 월 멀티선택 (months_list) 전환
//   · recent = months_list 에 포함된 월 · 비연속 지원
//   · prior  = min(months_list) 바로 전부터 N개월 (contiguous · N = months_list.length)
//   · days window 모드 제거 · 월 선택 UX 로 통일
router.get("/api/stock-manage/trending", asyncHandler(async (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  const limit = Math.max(1, Math.min(50000, parseInt(String(req.query.limit ?? "500"), 10) || 500));
  const minRecentQty = Math.max(0, parseInt(String(req.query.min_recent_qty ?? "0"), 10) || 0);
  const minGrowthPctRaw = String(req.query.min_growth_pct ?? "").trim();
  const hasMinGrowthPct = minGrowthPctRaw !== "" && !Number.isNaN(Number(minGrowthPctRaw));
  const minGrowthPct = hasMinGrowthPct ? Number(minGrowthPctRaw) : null;
  const supplierCodeFilter = String(req.query.supplier_code ?? "").trim();
  if (String(req.query.supplier ?? "").trim()) {
    logger.warn(`[trending] 'supplier' name query 미지원 (fuzzy 금지) · 'supplier_code' 사용 필요`);
  }
  // months_list 파싱 · 비면 현재월 default
  const monthsListParam = String(req.query.months_list ?? "").trim();
  const parsedMonths = monthsListParam
    ? monthsListParam.split(",").map((s) => s.trim()).filter((s) => /^\d{4}-\d{2}$/.test(s))
    : [];
  const now = new Date();
  const defaultYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const recentMonths = parsedMonths.length > 0 ? [...new Set(parsedMonths)] : [defaultYm];
  const n = recentMonths.length;
  {
    // 2026-10-06 · 사용자 지시 · prior = 각 선택월의 "직전월" 1:1 매핑
    //   · selected=[2026-10]            → prior=[2026-09]
    //   · selected=[2026-10, 2026-09]   → prior=[2026-09, 2026-08]
    //   · selected=[2026-10, 2026-08]   → prior=[2026-09, 2026-07]
    //   · priorMonths 내부 중복 unique 처리 (집계 중복 방지)
    //   · recent/prior overlap (예: Case B 의 2026-09) 은 양쪽 집계 → delta 가 자연스럽게 window slide 효과
    const prevMonthYm = (ym: string): string => {
      const [y, m] = ym.split("-").map(Number);
      const d = new Date(y, m - 2, 1); // m - 1 (0-indexed) - 1 month
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    };
    void n; // 사용 안 함 (prior = 각 선택월 매핑 방식)
    const sortedRecent = [...recentMonths].sort();
    const maxRecent = sortedRecent[sortedRecent.length - 1];
    const priorMonths = [...new Set(recentMonths.map(prevMonthYm))];
    const sortedPrior = [...priorMonths].sort();
    const priorMinYm = sortedPrior[0];
    const priorMaxYm = sortedPrior[sortedPrior.length - 1];

    // 조회 범위 (sales 쿼리 YYYY-MM-DD gte/lte) · recent 와 prior 전체 커버
    const scanMinYm = sortedRecent[0] < priorMinYm ? sortedRecent[0] : priorMinYm;
    const scanMaxYm = maxRecent > priorMaxYm ? maxRecent : priorMaxYm;
    const scanFromStr = `${scanMinYm}-01`;
    const [scanMaxY, scanMaxM] = scanMaxYm.split("-").map(Number);
    const scanToStr = `${scanMaxYm}-${String(new Date(scanMaxY, scanMaxM, 0).getDate()).padStart(2, "0")}`;

    const recentSet = new Set(recentMonths);
    const priorSet = new Set(priorMonths);

    // 2026-10-05 · 판매 SSOT = sales.total_stock (pcode backfill 완료 · coverage 99.82%)
    // 2026-10-06 · 사용자 지시 · products 1회 조회로 pcodeToCode + productMap 동시 구성 (중복 fetch 제거)
    const pcodeToCode = new Map<string, { code: string; supplier: string | null }>();
    const productMap = new Map<string, { product_name: string | null; current_stock: number; optimal_stock: number; hidden: boolean; sale_price: number; supplier: string | null; supplier_code: string | null }>();
    {
      const PP = 1000;
      let fp = 0;
      while (true) {
        const { data, error } = await supabase
          .from("products")
          .select("product_code, pcode, product_name, supplier, supplier_code, current_stock, optimal_stock, sale_price, hidden")
          .range(fp, fp + PP - 1);
        if (error) break;
        if (!data || data.length === 0) break;
        for (const p of data) {
          const code = String((p as any).product_code ?? "").trim();
          if (!code) continue;
          const supplier = String((p as any).supplier ?? "").trim() || null;
          const pc = String((p as any).pcode ?? "").trim();
          if (pc) pcodeToCode.set(pc, { code, supplier });
          productMap.set(code, {
            product_name:  (String((p as any).product_name ?? "").trim() || null),
            current_stock: Number((p as any).current_stock ?? 0) || 0,
            optimal_stock: Number((p as any).optimal_stock ?? 0) || 0,
            sale_price:    Number((p as any).sale_price    ?? 0) || 0,
            hidden: (p as any).hidden === true,
            supplier,
            supplier_code: (String((p as any).supplier_code ?? "").trim() || null),
          });
        }
        if (data.length < PP) break;
        fp += PP;
      }
    }

    // 2026-10-06 · 사용자 지시 · sales.pcode → products.pcode join 실패 집계 + 로그 (silent drop 금지)
    let unmatchedPcodeCount = 0;
    const unmatchedPcodeSamples = new Set<string>();
    const UNMATCHED_SAMPLE_MAX = 10;

    const salesMap = new Map<string, { recent: number; prior: number; supplier: string | null }>();
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("sales")
        .select("pcode, sale_date, total_stock")
        .gte("sale_date", scanFromStr)
        .lte("sale_date", scanToStr)
        .not("pcode", "is", null)
        .range(from, from + PAGE - 1);
      if (error) {
        if (/relation|does not exist/i.test(error.message)) return res.json({ rows: [] });
        throw new HttpError(500, error.message, "DB_ERROR");
      }
      if (!data || data.length === 0) break;
      for (const r of data) {
        const pc = String((r as any).pcode ?? "").trim();
        if (!pc) continue;
        const info = pcodeToCode.get(pc);
        if (!info) {
          unmatchedPcodeCount++;
          if (unmatchedPcodeSamples.size < UNMATCHED_SAMPLE_MAX) unmatchedPcodeSamples.add(pc);
          continue;
        }
        // 2026-10-06 · 사용자 지시 · Phase 1 조사 결과 · total_stock < 0 = 반품/취소 확정 · 음수/0 제외
        //   · 순수 판매수요 상승률 기준 · 반품은 집계 금지
        const q = Number((r as any).total_stock ?? 0) || 0;
        if (q <= 0) continue;
        const snap = String((r as any).sale_date ?? "").slice(0, 10);
        if (!snap) continue;
        const ym = snap.slice(0, 7);
        const cur = salesMap.get(info.code) ?? {
          recent: 0, prior: 0,
          supplier: info.supplier,
        };
        // 2026-10-06 · recent/prior 양쪽 집계 (overlap 허용) · 1:1 매핑 slide window 효과
        if (recentSet.has(ym)) cur.recent += q;
        if (priorSet.has(ym))  cur.prior  += q;
        // 그 외 YM → 집계 안 함 (범위 밖)
        salesMap.set(info.code, cur);
      }
      if (data.length < PAGE) break;
      from += PAGE;
    }

    if (unmatchedPcodeCount > 0) {
      logger.warn(`[trending] sales.pcode → products.pcode join 실패 · ${unmatchedPcodeCount}건 · 샘플 pcode: ${[...unmatchedPcodeSamples].join(",")}`);
    }

    // 2026-10-06 · 사용자 지시 · "갑자기 판매량 늘은 후보" · 심플 1줄
    //   · 음수/0 이미 집계 전 제외 → recent, prior 둘 다 >= 0
    //   · recent > prior ⟺ recent > 0 && 상승 (newly 포함 · 하락/정체 제외)
    const rows = [];
    for (const [code, s] of salesMap) {
      const prod = productMap.get(code);
      if (prod?.hidden) continue;
      if (s.recent <= s.prior) continue; // 급상승 조건

      const delta = s.recent - s.prior;
      const newlyTrending = s.prior === 0;
      const growthRate = s.prior > 0 ? Math.round((delta / s.prior) * 100) : null;

      // 명시적 요청 필터 (query param)
      if (minRecentQty > 0 && s.recent < minRecentQty) continue;
      if (minGrowthPct != null && !newlyTrending && (growthRate ?? 0) < minGrowthPct) continue;
      if (supplierCodeFilter && String(prod?.supplier_code ?? "").trim() !== supplierCodeFilter) continue;

      rows.push({
        product_code:  code,
        product_name:  prod?.product_name ?? null,
        supplier:      s.supplier,
        recent_sale:   s.recent,
        prior_sale:    s.prior,
        growth_rate:   growthRate,
        delta,
        newly_trending: newlyTrending,
        current_stock: prod?.current_stock ?? 0,
        optimal_stock: prod?.optimal_stock ?? 0,
        sale_price:    prod?.sale_price    ?? 0,
        below_optimal: (prod?.optimal_stock ?? 0) > 0 && (prod?.current_stock ?? 0) < (prod?.optimal_stock ?? 0),
      });
    }
    // 2026-10-06 · 사용자 지시 · 기본 정렬 (newly 최상단 강제 X · badge 로 구분)
    //   1. delta desc · 2. growth_rate desc · 3. recent desc
    rows.sort((a, b) => {
      if (b.delta !== a.delta) return b.delta - a.delta;
      const ga = a.growth_rate ?? -1;
      const gb = b.growth_rate ?? -1;
      if (gb !== ga) return gb - ga;
      return b.recent_sale - a.recent_sale;
    });

    const minRecentYm = sortedRecent[0];
    const [maxRY, maxRM] = maxRecent.split("-").map(Number);
    const recentToDay = String(new Date(maxRY, maxRM, 0).getDate()).padStart(2, "0");
    const [maxPY, maxPM] = priorMaxYm.split("-").map(Number);
    const priorToDay = String(new Date(maxPY, maxPM, 0).getDate()).padStart(2, "0");
    void scanToStr; // 조회 범위 메타는 recent_to/prior_to 로 분리 노출
    res.json({
      recent_months: [...sortedRecent],
      prior_months:  [...sortedPrior],
      recent_from:   `${minRecentYm}-01`,
      recent_to:     `${maxRecent}-${recentToDay}`,
      prior_from:    `${priorMinYm}-01`,
      prior_to:      `${priorMaxYm}-${priorToDay}`,
      filters: {
        min_recent_qty: minRecentQty || null,
        min_growth_pct: minGrowthPct,
        supplier_code: supplierCodeFilter || null,
      },
      diagnostics: {
        unmatched_pcode_count: unmatchedPcodeCount,
        unmatched_pcode_samples: [...unmatchedPcodeSamples],
      },
      total: rows.length,
      rows:  rows.slice(0, limit),
    });
  }
}));

// GET /api/stock-manage/trending-period
// 2026-07-30 · 명시적 기간 · 급상승 상품
router.get("/api/stock-manage/trending-period", asyncHandler(async (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  const from      = String(req.query.from       ?? "").trim();
  const to        = String(req.query.to         ?? "").trim();
  const priorFrom = String(req.query.prior_from ?? "").trim();
  const priorTo   = String(req.query.prior_to   ?? "").trim();
  const limit = Math.max(1, Math.min(1000, parseInt(String(req.query.limit ?? "20"), 10) || 20));
  if (!from || !to || !priorFrom || !priorTo) {
    throw badRequest("from · to · prior_from · prior_to 필수 (YYYY-MM-DD)");
  }
  {
    // 2026-10-05 · 판매 SSOT = sales.total_stock (pcode backfill 완료 · coverage 99.82%)
    // 2026-10-06 · 사용자 지시 · products 1회 조회 · pcodeToCode + productMap 동시 구성
    const pcodeToCode = new Map<string, { code: string; supplier: string | null }>();
    const productMap = new Map<string, { product_name: string | null; current_stock: number; hidden: boolean; supplier: string | null }>();
    {
      const PP = 1000;
      let fp = 0;
      while (true) {
        const { data, error } = await supabase
          .from("products")
          .select("product_code, pcode, product_name, supplier, current_stock, hidden")
          .range(fp, fp + PP - 1);
        if (error) break;
        if (!data || data.length === 0) break;
        for (const p of data) {
          const code = String((p as any).product_code ?? "").trim();
          if (!code) continue;
          const supplier = String((p as any).supplier ?? "").trim() || null;
          const pc = String((p as any).pcode ?? "").trim();
          if (pc) pcodeToCode.set(pc, { code, supplier });
          productMap.set(code, {
            product_name:  (String((p as any).product_name ?? "").trim() || null),
            current_stock: Number((p as any).current_stock ?? 0) || 0,
            hidden: (p as any).hidden === true,
            supplier,
          });
        }
        if (data.length < PP) break;
        fp += PP;
      }
    }

    // 2026-10-06 · 사용자 지시 · pcode join 실패 집계
    let unmatchedPcodeCount = 0;
    const unmatchedPcodeSamples = new Set<string>();
    const UNMATCHED_SAMPLE_MAX = 10;

    const salesMap = new Map<string, { recent: number; prior: number; supplier: string | null }>();
    const PAGE = 1000;
    let fromRow = 0;
    while (true) {
      const { data, error } = await supabase
        .from("sales")
        .select("pcode, sale_date, total_stock")
        .gte("sale_date", priorFrom)
        .lte("sale_date", to)
        .not("pcode", "is", null)
        .range(fromRow, fromRow + PAGE - 1);
      if (error) {
        if (/relation|does not exist/i.test(error.message)) return res.json({ rows: [] });
        throw new HttpError(500, error.message, "DB_ERROR");
      }
      if (!data || data.length === 0) break;
      for (const r of data) {
        const pc = String((r as any).pcode ?? "").trim();
        if (!pc) continue;
        const info = pcodeToCode.get(pc);
        if (!info) {
          unmatchedPcodeCount++;
          if (unmatchedPcodeSamples.size < UNMATCHED_SAMPLE_MAX) unmatchedPcodeSamples.add(pc);
          continue;
        }
        // 2026-10-06 · 사용자 지시 · Phase 1 조사 확정 · 음수/0 제외 (반품/취소 · 순수 판매수요 상승률 기준)
        const q = Number((r as any).total_stock ?? 0) || 0;
        if (q <= 0) continue;
        const snap = String((r as any).sale_date ?? "").slice(0, 10);
        if (!snap) continue;
        const cur = salesMap.get(info.code) ?? {
          recent: 0, prior: 0,
          supplier: info.supplier,
        };
        if (snap >= from && snap <= to)                 cur.recent += q;
        else if (snap >= priorFrom && snap <= priorTo)  cur.prior  += q;
        salesMap.set(info.code, cur);
      }
      if (data.length < PAGE) break;
      fromRow += PAGE;
    }

    if (unmatchedPcodeCount > 0) {
      logger.warn(`[trending-period] sales.pcode → products.pcode join 실패 · ${unmatchedPcodeCount}건 · 샘플 pcode: ${[...unmatchedPcodeSamples].join(",")}`);
    }

    // 2026-10-06 · 사용자 지시 · 급상승 포함 조건 · 하락/정체 제외
    const rows: any[] = [];
    for (const [code, s] of salesMap) {
      const prod = productMap.get(code);
      if (prod?.hidden) continue;
      if (s.recent <= 0) continue;
      const newlyTrending = s.prior === 0 && s.recent > 0;
      if (!newlyTrending && s.recent <= s.prior) continue;
      const delta = s.recent - s.prior;
      const growthRate = s.prior > 0 ? Math.round(((s.recent - s.prior) / s.prior) * 100) : null;
      rows.push({
        product_code:   code,
        product_name:   prod?.product_name ?? null,
        supplier:       s.supplier,
        recent_sale:    s.recent,
        prior_sale:     s.prior,
        growth_rate:    growthRate,
        delta,
        newly_trending: newlyTrending,
        current_stock:  prod?.current_stock ?? 0,
      });
    }
    // 2026-10-06 · 사용자 지시 · delta desc > growth desc > recent desc
    rows.sort((a, b) => {
      if (b.delta !== a.delta) return b.delta - a.delta;
      const ga = a.growth_rate ?? -1;
      const gb = b.growth_rate ?? -1;
      if (gb !== ga) return gb - ga;
      return b.recent_sale - a.recent_sale;
    });

    res.json({
      from, to, prior_from: priorFrom, prior_to: priorTo,
      diagnostics: {
        total_rows: rows.length,
        unmatched_pcode_count: unmatchedPcodeCount,
        unmatched_pcode_samples: [...unmatchedPcodeSamples],
      },
      total: rows.length,
      rows:  rows.slice(0, limit),
    });
  }
}));

export default router;
