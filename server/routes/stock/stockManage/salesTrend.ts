// ══════════════════════════════════════════════════════════════════════
// 판매추이 (Sales Trend) - stock_history 기간별 시계열
// GET /api/sales-trend/product?code=<상품코드>
// GET /api/sales-trend/supplier?name=<공급사명>
// GET /api/sales-trend/overview
// ══════════════════════════════════════════════════════════════════════
import { Router } from "express";
import { supabase } from "../../../../src/supabase/client";
import { resolveSeasonMonths } from "../../settings/settings";
import { asyncHandler } from "../../../middleware/asyncHandler";
import { HttpError, badRequest } from "../../../middleware/errorHandler";
import { inSeasonMonths } from "./helpers";
import logger from "../../../lib/logger";
import { parseMonthsList, isDateInSelectedMonths } from "../../../lib/periodFilter";
// 2026-09-14 · 사용자 대원칙 · salesTrendCache 제거 · 매 요청 실시간 조회

const router = Router();

// GET /api/sales-trend/product
router.get("/api/sales-trend/product", asyncHandler(async (req, res) => {
  const code = String(req.query.code ?? "").trim();
  if (!code) throw badRequest("code 필수");
  const months = Math.max(0, Math.min(24, parseInt(String(req.query.months ?? "0"), 10) || 0));
  const seasonParam = String(req.query.season ?? "").trim().toLowerCase();
  const seasonMonths = await resolveSeasonMonths(seasonParam);
  // 2026-10-06 · months_list 비연속 월 멀티선택 지원 (STANDARD · 사용자 지시)
  //   · period_end 축 · months/season 과 상호 배타 · 지정 시 range + YM post-filter
  const monthsList = parseMonthsList(req.query.months_list);
  // 2026-10-04 · schema rename · 프론트 PeriodRow 타입 이미 신규 field 사용 중 (src/lib/stockPeriodUtils.tsx)
  let q = supabase
    .from("stock_history")
    .select("period_start, period_end, period_type, supplier_name, product_name, spec, prv_stock, buy_stock, sale_stock, product_bad_stock, closing_stock, supply_amount, total_amount")
    .eq("product_code", code);
  if (!monthsList.isEmpty && monthsList.from && monthsList.to) {
    q = q.gte("period_end", monthsList.from).lte("period_end", monthsList.to);
  } else if (!seasonMonths && months > 0) {
    // 2026-07-16 fix: 정확히 N개월 back
    const today = new Date();
    const cutoff = new Date(today.getFullYear(), today.getMonth() - months, today.getDate());
    const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;
    q = q.gte("period_end", cutoffStr);
  }
  const { data, error } = await q
    .order("period_start", { ascending: true, nullsFirst: false })
    .order("period_end", { ascending: true });
  if (error) throw new HttpError(500, error.message, "DB_ERROR");
  // 2026-10-06 · months_list 비연속 월 post-filter · 중간 월 자동 포함 금지
  let rows: unknown[] = data ?? [];
  if (!monthsList.isEmpty) {
    rows = (data ?? []).filter((r: { period_end: string | null }) => isDateInSelectedMonths(r.period_end, monthsList.set));
  } else if (seasonMonths) {
    rows = (data ?? []).filter((r: { period_end: string | null }) => inSeasonMonths(String(r.period_end ?? ""), seasonMonths));
  }
  const payload = { code, months, season: seasonParam || undefined, season_months: seasonMonths ?? undefined, rows };
  res.setHeader("Cache-Control", "no-store");
  res.json(payload);
}));

// GET /api/sales-trend/supplier
// 2026-10-05 · 사용자 지시 D · 공급사 연결은 supplier_code eq 만 사용
//   · 이전 · normalizeSupplierName + 양방향 contains (fuzzy) · 대원칙 feedback_no_data_fabrication 위배 · 제거
//   · 신규 · ?supplier_code= 또는 ?name= 입력 받음
//     - supplier_code 직접 제공 시 · 그 code 로만 조인
//     - name 만 제공 시 · products.supplier eq name 완전일치로 supplier_code 변환 (단일 매핑)
//     - 변환 실패 시 · UNMAPPED 로그 + 빈 결과 반환
router.get("/api/sales-trend/supplier", asyncHandler(async (req, res) => {
  const name = String(req.query.name ?? "").trim();
  const codeParam = String(req.query.supplier_code ?? "").trim();
  if (!name && !codeParam) throw badRequest("name 또는 supplier_code 필수");
  const months = Math.max(0, Math.min(24, parseInt(String(req.query.months ?? "0"), 10) || 0));
  const seasonParam = String(req.query.season ?? "").trim().toLowerCase();
  const seasonMonths = await resolveSeasonMonths(seasonParam);
  // 2026-10-06 · months_list 비연속 월 멀티선택 지원 (STANDARD · 사용자 지시)
  //   · period_end 축 · months / season 과 상호 배타 · 지정 시 range + YM post-filter
  const monthsList = parseMonthsList(req.query.months_list);
  // 2026-07-16 fix: 정확히 N개월 back
  //   · months_list 지정 시 · min YM-01 ~ max YM-last_day range
  let cutoffStr: string | null = null;
  let cutoffStrTo: string | null = null;
  if (!monthsList.isEmpty && monthsList.from && monthsList.to) {
    cutoffStr = monthsList.from;
    cutoffStrTo = monthsList.to;
  } else if (!seasonMonths && months > 0) {
    const t = new Date(); const c = new Date(t.getFullYear(), t.getMonth() - months, t.getDate());
    cutoffStr = `${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, "0")}-${String(c.getDate()).padStart(2, "0")}`;
  }

  // supplier_code 집합 결정 (fuzzy 금지 · 대원칙 D)
  const supplierCodes = new Set<string>();
  if (codeParam) {
    supplierCodes.add(codeParam);
  } else {
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("products")
        .select("supplier_code")
        .eq("supplier", name)
        .range(from, from + PAGE - 1);
      if (error) break;
      if (!data || data.length === 0) break;
      for (const p of data) {
        const sc = String((p as any).supplier_code ?? "").trim();
        if (sc) supplierCodes.add(sc);
      }
      if (data.length < PAGE) break;
      from += PAGE;
    }
    if (supplierCodes.size === 0) {
      logger.warn(`[sales-trend/supplier] UNMAPPED · name="${name}" · products.supplier_code 매핑 없음 · 빈 결과 반환`);
      res.setHeader("Cache-Control", "no-store");
      return res.json({ supplier: name, months, season: seasonParam || undefined, season_months: seasonMonths ?? undefined, series: [], unmapped: true });
    }
  }

  // supplier_code 기반 상품 code 수집
  const matchedCodes = new Set<string>();
  {
    const codesArr = Array.from(supplierCodes);
    const CHUNK = 500;
    for (let i = 0; i < codesArr.length; i += CHUNK) {
      const chunk = codesArr.slice(i, i + CHUNK);
      let from = 0;
      const PAGE = 1000;
      while (true) {
        const { data, error } = await supabase
          .from("products")
          .select("product_code")
          .in("supplier_code", chunk)
          .range(from, from + PAGE - 1);
        if (error) break;
        if (!data || data.length === 0) break;
        for (const p of data) {
          const code = String((p as any).product_code ?? "").trim();
          if (code) matchedCodes.add(code);
        }
        if (data.length < PAGE) break;
        from += PAGE;
      }
    }
  }
  // 2026-09-10 · 사용자 지시 · 팔린만큼의 사입액 (COGS) 계산용 · 상품별 purchase_price map
  //   + 판매액 정확 계산용 · sale_price map (xlsx total_amount 대신 · sale_qty × sale_price)
  const priceMap = new Map<string, number>();
  const salePriceMap = new Map<string, number>();
  {
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("products")
        .select("product_code, purchase_price, sale_price")
        .range(from, from + PAGE - 1);
      if (error) break;
      if (!data || data.length === 0) break;
      for (const p of data) {
        const code = String((p as any).product_code ?? "").trim();
        if (!code) continue;
        priceMap.set(code, Number(p.purchase_price ?? 0) || 0);
        salePriceMap.set(code, Number((p as any).sale_price ?? 0) || 0);
      }
      if (data.length < PAGE) break;
      from += PAGE;
    }
  }
  {
    const all: any[] = [];
    const PAGE = 1000;
    let from = 0;
    while (true) {
      // 2026-10-04 · schema rename · 신규 column 직접 사용 (프론트 PeriodRow 타입과 일치)
      let q = supabase
        .from("stock_history")
        .select("period_start, period_end, period_type, product_code, supplier_name, buy_stock, sale_stock, closing_stock, supply_amount, total_amount");
      if (cutoffStr) q = q.gte("period_end", cutoffStr);
      if (cutoffStrTo) q = q.lte("period_end", cutoffStrTo);
      const { data, error } = await q
        .order("period_start", { ascending: true, nullsFirst: false })
        .range(from, from + PAGE - 1);
      if (error) throw new HttpError(500, error.message, "DB_ERROR");
      if (!data || data.length === 0) break;
      for (const r of data) {
        const code = String((r as any).product_code ?? "").trim();
        // 2026-10-05 · 사용자 지시 D · supplier_code 기반 매칭 only · supplier_name fuzzy/eq fallback 제거
        if (!matchedCodes.has(code)) continue;
        if (seasonMonths && !inSeasonMonths(String((r as any).period_end ?? ""), seasonMonths)) continue;
        // 2026-10-06 · months_list 비연속 월 post-filter · 중간 월 자동 포함 금지
        if (!monthsList.isEmpty && !isDateInSelectedMonths(String((r as any).period_end ?? ""), monthsList.set)) continue;
        all.push(r);
      }
      if (data.length < PAGE) break;
      from += PAGE;
    }
    // 기간별 집계
    // 2026-09-10 · 사용자 지시 · 정합성 공식 · 재고자산 + 판매원가(사입액) = 매입액(원가)
    //   · cogs_amount = 판매 수량 × 사입단가 (팔린 것의 원가 · 판매원가)
    //   · purchase_cost = 매입 수량 × 사입단가 (실제 매입 원가)
    // 2026-10-04 · schema rename · period_start_date→period_start · snapshot_date→period_end
    //   · purchase_qty→buy_stock · sale_qty→sale_stock (프론트 PeriodRow 타입과 일치)
    const byPeriod = new Map<string, {
      period_start: string;
      period_end: string;
      period_type: string | null;
      product_count: number;
      buy_stock: number;
      sale_stock: number;
      closing_stock: number;
      supply_amount: number;
      total_amount: number;
      cogs_amount: number;
      purchase_cost: number;
    }>();
    // 2026-09-10 · #69 · 사용자 지시 · 상품별 집계 (상품명 · 판매수량 · 매입수량 · 매출액)
    const byProduct = new Map<string, {
      product_code: string;
      product_name: string;
      buy_stock: number;
      sale_stock: number;
      closing_stock: number;
      total_amount: number;
      cogs_amount: number;
    }>();
    for (const r of all) {
      const code = String((r as any).product_code ?? "").trim();
      const pp = priceMap.get(code) ?? 0;
      const sp = salePriceMap.get(code) ?? 0;
      const sqty = Number((r as any).sale_stock ?? 0) || 0;
      const pqty = Number((r as any).buy_stock ?? 0) || 0;
      const cogs = sqty * pp;
      const pcost = pqty * pp;
      // 2026-09-10 · 사용자 지시 · 판매액 = sale_stock × sale_price (xlsx total_amount 대신)
      const saleAmount = sqty * sp;

      const key = String((r as any).period_start ?? (r as any).period_end);
      if (!byPeriod.has(key)) {
        byPeriod.set(key, {
          period_start: (r as any).period_start ?? (r as any).period_end,
          period_end: (r as any).period_end,
          period_type: (r as any).period_type,
          product_count: 0,
          buy_stock: 0,
          sale_stock: 0,
          closing_stock: 0,
          supply_amount: 0,
          total_amount: 0,
          cogs_amount: 0,
          purchase_cost: 0,
        });
      }
      const agg = byPeriod.get(key)!;
      agg.product_count += 1;
      agg.buy_stock     += pqty;
      agg.sale_stock    += sqty;
      agg.closing_stock += Number((r as any).closing_stock ?? 0) || 0;
      agg.supply_amount += Number((r as any).supply_amount ?? 0) || 0;
      // 2026-09-10 · 사용자 지시 · 합계 컬럼(total_amount) 사용 금지 · 판매수량 × 판매단가 계산
      agg.total_amount  += saleAmount;
      agg.cogs_amount   += cogs;
      agg.purchase_cost += pcost;
      if ((r as any).period_end > agg.period_end) agg.period_end = (r as any).period_end;

      // 상품별 aggregate · 판매액 · sale_stock × sale_price (합계 컬럼 아님)
      if (code) {
        const p = byProduct.get(code) ?? { product_code: code, product_name: "", buy_stock: 0, sale_stock: 0, closing_stock: 0, total_amount: 0, cogs_amount: 0 };
        p.buy_stock    += pqty;
        p.sale_stock   += sqty;
        p.total_amount += saleAmount;
        p.cogs_amount  += cogs;
        p.closing_stock = Number((r as any).closing_stock ?? 0) || 0; // 최신 마감 재고 (덮어씀)
        byProduct.set(code, p);
      }
    }

    // 상품명 · products JOIN (stock_history 에는 product_name 없을 수 있음)
    const productCodes = Array.from(byProduct.keys());
    if (productCodes.length > 0) {
      // 2026-10-06 · 대원칙 · DB 2단계 JOIN · code 우선 + pcode fallback
      const CHUNK = 500;
      for (let i = 0; i < productCodes.length; i += CHUNK) {
        const chunk = productCodes.slice(i, i + CHUNK);
        const { data } = await supabase.from("products").select("product_code, pcode, product_name").in("product_code", chunk);
        for (const p of data ?? []) {
          const code = String(p.product_code ?? "").trim();
          const item = byProduct.get(code);
          if (item && !item.product_name) item.product_name = String(p.product_name ?? "").trim() || null;
        }
      }
      // 2단계: 아직 product_name null 인 code 들을 pcode 로 재조회
      const stillNull = Array.from(byProduct.entries()).filter(([, v]) => !v.product_name).map(([c]) => c);
      if (stillNull.length > 0) {
        for (let i = 0; i < stillNull.length; i += CHUNK) {
          const chunk = stillNull.slice(i, i + CHUNK);
          const { data } = await supabase.from("products").select("pcode, product_name").in("pcode", chunk);
          for (const p of data ?? []) {
            const pc = String(p.pcode ?? "").trim();
            const item = byProduct.get(pc);
            if (item && !item.product_name) item.product_name = String(p.product_name ?? "").trim() || null;
          }
        }
      }
    }

    const rows = Array.from(byPeriod.values()).sort((a, b) => a.period_start.localeCompare(b.period_start));
    const products = Array.from(byProduct.values()).sort((a, b) => b.sale_stock - a.sale_stock); // 판매수량 desc
    res.setHeader("Cache-Control", "no-store");
    res.json({ supplier: name, season: seasonParam || undefined, season_months: seasonMonths ?? undefined, rows, products });
  }
}));

// GET /api/sales-trend/overview
router.get("/api/sales-trend/overview", asyncHandler(async (_req, res) => {
  {
    // 2026-09-14 · #72·#73 · SSOT · 판매액 = sale_qty × sale_price (파생 · total_amount 원본 X)
    //   · supplier·product endpoint (라인 216·226) 와 동일한 공식 · 일관성 유지
    const all: any[] = [];
    const PAGE = 1000;
    let from = 0;
    while (true) {
      // 2026-10-04 · schema rename · 신규 column 직접 사용 (프론트 PeriodRow 타입과 일치)
      const { data, error } = await supabase
        .from("stock_history")
        .select("period_start, period_end, period_type, buy_stock, sale_stock, sale_price, closing_stock, supply_amount")
        .order("period_start", { ascending: true, nullsFirst: false })
        .range(from, from + PAGE - 1);
      if (error) throw new HttpError(500, error.message, "DB_ERROR");
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < PAGE) break;
      from += PAGE;
    }
    const byPeriod = new Map<string, any>();
    for (const r of all) {
      const key = String((r as any).period_start ?? (r as any).period_end);
      if (!byPeriod.has(key)) {
        byPeriod.set(key, {
          period_start: (r as any).period_start ?? (r as any).period_end,
          period_end: (r as any).period_end,
          period_type: (r as any).period_type,
          product_count: 0,
          buy_stock: 0,
          sale_stock: 0,
          closing_stock: 0,
          supply_amount: 0,
          total_amount: 0,
        });
      }
      const agg = byPeriod.get(key)!;
      agg.product_count += 1;
      agg.buy_stock     += Number((r as any).buy_stock ?? 0) || 0;
      const q = Number((r as any).sale_stock ?? 0) || 0;
      const p = Number((r as any).sale_price ?? 0) || 0;
      agg.sale_stock    += q;
      agg.closing_stock += Number((r as any).closing_stock ?? 0) || 0;
      agg.supply_amount += Number((r as any).supply_amount ?? 0) || 0;
      // 2026-09-14 · SSOT · 판매액 = sale_stock × sale_price (파생)
      agg.total_amount  += q * p;
      if ((r as any).period_end > agg.period_end) agg.period_end = (r as any).period_end;
    }
    const rows = Array.from(byPeriod.values()).sort((a, b) => a.period_start.localeCompare(b.period_start));
    res.setHeader("Cache-Control", "no-store");
    res.json({ rows });
  }
}));

export default router;
