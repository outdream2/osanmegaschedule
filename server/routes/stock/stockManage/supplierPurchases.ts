// GET /api/stock-manage/supplier-purchases?period_end=YYYY-MM-DD&months=N&limit=20
// stock_history 기반 공급사별 매입/판매/재고 집계 (금액·수량·상품수)
// 2026-07-16: months 파라미터 추가 · 기간 범위 (오늘-months 개월 ~ 오늘) 집계
import { Router } from "express";
import { supabase } from "../../../../src/supabase/client";
import { resolveSeasonMonths } from "../../settings/settings";
import { asyncHandler } from "../../../middleware/asyncHandler";
import { HttpError } from "../../../middleware/errorHandler";
import { inSeasonMonths } from "./helpers";
import { parseMonthsList } from "../../../lib/periodFilter";

const router = Router();

router.get("/api/stock-manage/supplier-purchases", asyncHandler(async (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  const limit = Math.max(1, Math.min(50000, parseInt(String(req.query.limit ?? "20"), 10) || 20));
  const dateParam = String(req.query.period_end ?? "").trim();
  const monthsParam = Math.max(0, Math.min(24, parseInt(String(req.query.months ?? "0"), 10) || 0));
  // 계절 필터 · 지정 시 년도 무관 · months/period_end 무시
  const seasonParam = String(req.query.season ?? "").trim().toLowerCase();
  const seasonMonths = await resolveSeasonMonths(seasonParam);
  // 2026-10-05 · 사용자 지시 · months_list=YM1,YM2 비연속 월 지원
  // 2026-10-06 · 공통 parser 재사용 (server/lib/periodFilter · 복붙 통일)
  const monthsParsed = parseMonthsList(req.query.months_list);
  const monthsListSet = monthsParsed.set;
  const useMonthsList = !monthsParsed.isEmpty;
  {
    // months > 0: 기간 범위 · 없으면 단일 스냅샷
    let targetDate = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : "";
    let fromDateStr: string | null = null;
    if (seasonMonths || useMonthsList) {
      // 전체 stock_history 스캔 → 계절 월 필터 · targetDate 는 latest 로 표기
      const { data: latest } = await supabase
        .from("stock_history")
        .select("period_end")
        .order("period_end", { ascending: false })
        .limit(1);
      targetDate = latest?.[0]?.period_end ?? new Date().toISOString().slice(0, 10);
    } else if (monthsParam > 0) {
      const today = new Date();
      const from = new Date(today.getFullYear(), today.getMonth() - monthsParam, today.getDate());
      fromDateStr = from.toISOString().slice(0, 10);
      targetDate = today.toISOString().slice(0, 10);
    } else if (!targetDate) {
      const { data: latest } = await supabase
        .from("stock_history")
        .select("period_end")
        .order("period_end", { ascending: false })
        .limit(1);
      targetDate = latest?.[0]?.period_end ?? "";
    }
    if (!targetDate) return res.json({ period_end: null, top: null, rows: [] });

    // 2026-09-14 · #73 · SSOT · products.sale_price 사전 fetch · totalStockAmount 파생 계산
    //   · 이전 · stock_history.total_amount 원본 누적 (xlsx 원본 · 정확도 저하)
    //   · fix · sale_stock × sale_price (판매액 = 수량 × 판매가 · 대원칙)
    // 2026-10-01 · 사용자 지시 · 공통기능 공식 통일 · purchase_price 도 fetch · cogs·stock_asset 계산
    //   · stock_asset = purchase_amount − cogs (대원칙 #1 · /api/supplier-balances-map 와 동일 공식)
    const salePriceMap = new Map<string, number>();
    const purchasePriceMap = new Map<string, number>();
    // 2026-10-05 · 사용자 공식 재확정 (대원칙 #1) · 재고자산 = SUM(current_stock × purchase_price) by 공급사
    //   · hidden 포함 (사용자 지시 F · 자산 존재 여부는 노출 여부와 무관)
    const stockAssetBySupplier = new Map<string, number>();
    {
      const PP = 1000;
      let pf = 0;
      while (true) {
        const { data } = await supabase
          .from("products")
          .select("product_code, supplier, current_stock, sale_price, purchase_price")
          .range(pf, pf + PP - 1);
        if (!data || data.length === 0) break;
        for (const p of data) {
          const code = String((p as any).product_code ?? "").trim();
          if (!code) continue;
          const sp = Number((p as any).sale_price ?? 0) || 0;
          const pp = Number((p as any).purchase_price ?? 0) || 0;
          const cs = Number((p as any).current_stock ?? 0) || 0;
          salePriceMap.set(code, sp);
          purchasePriceMap.set(code, pp);
          const sup = String((p as any).supplier ?? "").trim();
          if (sup && cs > 0 && pp > 0) {
            stockAssetBySupplier.set(sup, (stockAssetBySupplier.get(sup) ?? 0) + cs * pp);
          }
        }
        if (data.length < PP) break;
        pf += PP;
      }
    }

    // 2026-10-05 · 사용자 지시 · 매입 SSOT = purchase_details (대원칙)
    //   · 매입 (purchaseQty/purchaseAmount) = purchase_details.quantity/amount SUM · 기간은 purchase_date 축
    //   · 판매 (saleQty/saleAmount/cogsAmount) = stock_history.sale_stock × price (판매 전환은 2단계 이후)
    //   · 이전 · stock_history.buy_stock / supply_amount 1차 집계 + purchase_details MAX merge → 완전 제거
    const map = new Map<string, {
      supplier: string;
      supplier_code: string | null;
      names: Set<string>;
      products: Set<string>;
      purchaseQty: number;
      purchaseAmount: number;
      saleQty: number;
      saleAmount: number;
      totalStockAmount: number;
      // 2026-10-01 · 사용자 지시 · 공통기능 공식 통일 · 재고자산 = 매입액 − 판매원가 (대원칙 #1)
      cogsAmount: number;      // 판매원가 · sale_stock × purchase_price
      stockAssetAmount: number; // 재고자산 · purchase − cogs (balances-map 과 동일)
    }>();

    // ═══ 1차 · stock_history → 판매 집계 (판매는 아직 stock_history · 2단계 이후 sales 로 전환) ═══
    const PAGE = 1000;
    let from = 0;
    while (true) {
      let query = supabase
        .from("stock_history")
        .select("product_code, supplier_code, supplier_name, sale_stock, period_end");
      if (seasonMonths || useMonthsList) {
        // 전 데이터 스캔 · 후 필터 (Supabase 는 EXTRACT 미지원 · YM 매칭도 서버 측 필터)
      } else if (fromDateStr) {
        query = query.gte("period_end", fromDateStr).lte("period_end", targetDate);
      } else {
        query = query.eq("period_end", targetDate);
      }
      const { data, error } = await query.range(from, from + PAGE - 1);
      if (error) {
        if (/relation|does not exist/i.test(error.message)) break;
        throw new HttpError(500, error.message, "DB_ERROR");
      }
      if (!data || data.length === 0) break;
      for (const r of data) {
        if (seasonMonths && !inSeasonMonths(String(r.period_end ?? ""), seasonMonths)) continue;
        if (useMonthsList) {
          const ym = /^(\d{4}-\d{2})/.exec(String(r.period_end ?? ""))?.[1];
          if (!ym || !monthsListSet.has(ym)) continue;
        }
        const supName = String(r.supplier_name ?? "").trim();
        const supCode = String(r.supplier_code ?? "").trim();
        if (!supName && !supCode) continue;
        const key = supCode ? `c:${supCode}` : `n:${supName}`;
        const cur = map.get(key) ?? {
          supplier: supName || supCode,
          supplier_code: supCode || null,
          names: new Set<string>(),
          products: new Set<string>(),
          purchaseQty: 0, purchaseAmount: 0, saleQty: 0, saleAmount: 0, totalStockAmount: 0,
          cogsAmount: 0, stockAssetAmount: 0,
        };
        if (supName) cur.names.add(supName);
        // 2026-07-28: distinct product code 만 카운트
        const productCode = String(r.product_code ?? "").trim();
        if (productCode) cur.products.add(productCode);
        const saleQty = Number(r.sale_stock ?? 0) || 0;
        cur.saleQty += saleQty;
        // 2026-09-14 · #73 · SSOT · 판매액 = sale_stock × sale_price (파생 · total_amount 원본 X)
        const salePrice = productCode ? (salePriceMap.get(productCode) ?? 0) : 0;
        cur.totalStockAmount += saleQty * salePrice;
        // 2026-10-01 · 사용자 지시 · cross-endpoint 공식 통일 · 판매액 = sq × sale_price
        cur.saleAmount += saleQty * salePrice;
        // 2026-10-01 · 사용자 지시 · 공통기능 공식 통일 · 판매원가 (COGS) · sale_stock × purchase_price
        const purchasePrice = productCode ? (purchasePriceMap.get(productCode) ?? 0) : 0;
        cur.cogsAmount += saleQty * purchasePrice;
        map.set(key, cur);
      }
      if (data.length < PAGE) break;
      from += PAGE;
    }

    // ═══ 2차 · purchase_details → 매입 집계 (SSOT · purchase_date 축) ═══
    // 2026-10-05 · 사용자 지시 · 매입 공용 API 전환 1단계
    //   · 이전 · stock_history 1차 집계 + purchase_details MAX merge (근사치)
    //   · 이후 · purchase_details SSOT 직접 할당 (ERP Buy_Status 원본 그대로)
    // 2026-10-05 · 기간 필터 수정 (A안)
    //   · months_list 모드 · min YM-01 ~ max YM-last_day 조회 + 비연속 중간 월 post-filter 제외
    //   · season 모드 · 전 데이터 fetch + inSeasonMonths post-filter (년도 무관)
    //   · 그 외 · fromDateStr/targetDate 그대로 (단일 스냅샷/months 하위호환)
    {
      let purFrom: string | null;
      let purTo: string | null;
      if (useMonthsList) {
        // 2026-10-06 · 공통 parser 가 min/max 사전 계산 · 로컬 재계산 제거
        purFrom = monthsParsed.from;
        purTo = monthsParsed.to;
      } else if (seasonMonths) {
        purFrom = null;
        purTo = null;
      } else {
        purFrom = fromDateStr ?? targetDate;
        purTo = targetDate;
      }
      const PAGE2 = 1000;
      let from2 = 0;
      const pdMap = new Map<string, { supplier: string; supplier_code: string | null; qty: number; amount: number; products: Set<string> }>();
      while (true) {
        let q = supabase
          .from("purchase_details")
          .select("supplier_name, supplier_code, product_code, purchase_date, quantity, amount, total");
        if (purFrom) q = q.gte("purchase_date", purFrom);
        if (purTo) q = q.lte("purchase_date", purTo);
        const { data: pdData, error: pdErr } = await q.range(from2, from2 + PAGE2 - 1);
        if (pdErr) { break; }
        if (!pdData || pdData.length === 0) break;
        for (const r of pdData) {
          if (useMonthsList) {
            const ym = /^(\d{4}-\d{2})/.exec(String(r.purchase_date ?? ""))?.[1];
            if (!ym || !monthsListSet.has(ym)) continue;
          }
          if (seasonMonths && !inSeasonMonths(String(r.purchase_date ?? ""), seasonMonths)) continue;
          const nm = String(r.supplier_name ?? "").trim();
          const cd = String(r.supplier_code ?? "").trim();
          if (!nm && !cd) continue;
          const key = cd ? `c:${cd}` : `n:${nm}`;
          const cur = pdMap.get(key) ?? { supplier: nm || cd, supplier_code: cd || null, qty: 0, amount: 0, products: new Set<string>() };
          cur.qty += Number(r.quantity ?? 0) || 0;
          cur.amount += Number(r.amount ?? r.total ?? 0) || 0;
          const pc = String(r.product_code ?? "").trim();
          if (pc) cur.products.add(pc);
          pdMap.set(key, cur);
        }
        if (pdData.length < PAGE2) break;
        from2 += PAGE2;
      }
      // 매입 SSOT 직접 할당 (MAX merge 완전 제거)
      for (const [key, pv] of pdMap) {
        const existing = map.get(key);
        if (!existing) {
          map.set(key, {
            supplier: pv.supplier,
            supplier_code: pv.supplier_code,
            names: new Set([pv.supplier]),
            products: pv.products,
            purchaseQty: pv.qty,
            purchaseAmount: pv.amount,
            saleQty: 0,
            saleAmount: 0,
            totalStockAmount: 0,
            cogsAmount: 0,
            stockAssetAmount: pv.amount,
          });
        } else {
          existing.purchaseQty = pv.qty;
          existing.purchaseAmount = pv.amount;
          for (const pc of pv.products) existing.products.add(pc);
        }
      }
      // stock_history 에 있지만 purchase_details 기간에 없는 supplier 는 매입 0 유지 (판매만 있음)
    }

    // 이름 충돌 감지
    const nameToCodes = new Map<string, Set<string>>();
    for (const v of map.values()) {
      for (const n of v.names) {
        const s = nameToCodes.get(n) ?? new Set<string>();
        if (v.supplier_code) s.add(v.supplier_code);
        nameToCodes.set(n, s);
      }
    }

    // 2026-10-05 · 사용자 공식 재확정 (대원칙 #1) · 재고자산 = 매입단가 × 현재고
    //   · 이전 · purchaseAmount − cogsAmount (기간 재고자산) · 폐기
    //   · 신규 · SUM(products.current_stock × products.purchase_price) by 공급사명
    for (const v of map.values()) {
      v.stockAssetAmount = stockAssetBySupplier.get(v.supplier) ?? 0;
    }
    const rows = [...map.values()].map(v => ({
      supplier: v.supplier,
      supplier_code: v.supplier_code,
      names: [...v.names],
      code_conflict: [...v.names].some(n => (nameToCodes.get(n)?.size ?? 0) > 1),
      purchaseQty: v.purchaseQty,
      purchaseAmount: v.purchaseAmount,
      saleQty: v.saleQty,
      saleAmount: Math.round(v.saleAmount),
      itemCount: v.products.size,
      totalStockAmount: v.totalStockAmount, // 판매액 (sale_stock × sale_price) · 레거시 이름
      // 2026-10-01 · 사용자 지시 · 공통기능 공식 통일 · 신규 필드 · 실제 재고자산 (대원칙 #1)
      cogsAmount: Math.round(v.cogsAmount),
      stockAssetAmount: Math.round(v.stockAssetAmount),
    })).sort((a, b) => b.totalStockAmount - a.totalStockAmount);
    const top = rows.length > 0 ? rows[0] : null;
    res.json({ period_end: targetDate, season: seasonParam || undefined, season_months: seasonMonths ?? undefined, top, rows: rows.slice(0, limit) });
  }
}));

export default router;
