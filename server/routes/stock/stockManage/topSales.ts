// GET /api/stock-manage/top-sales
// 재고 스냅샷의 상품별 흐름 — season/months/single-snapshot 3가지 모드
// 2026-10-06 · 사용자 지시 · 판매 SSOT = sales (판매원장)
//   · stock_history 는 재고 snapshot/movement 전용 (prv/buy/closing/bad)
//   · sale_stock, total_amount, sale_qty_month/60d/90d, sale_qty_cycle 모두 sales 축으로 재계산
//   · 날짜 축: sales.sale_date · 상품 relation: sales.pcode → products.pcode
import { Router } from "express";
import { supabase } from "../../../../src/supabase/client";
import { resolveSeasonMonths } from "../../settings/settings";
import { fetchAllWithRange } from "../../../utils/supabaseFetchAll";
import { asyncHandler } from "../../../middleware/asyncHandler";
import { HttpError } from "../../../middleware/errorHandler";
import { inSeasonMonths } from "./helpers";
import logger from "../../../lib/logger";
import { parseMonthsList } from "../../../lib/periodFilter";
// 2026-09-14 · 사용자 대원칙 · topSalesCache 제거 · 매 요청 실시간 조회

const router = Router();

// ─── sales SSOT 집계 helper ────────────────────────────────────────────────
// 2026-10-06 · 사용자 지시 · 판매 데이터는 sales 테이블만 소스
//   · 반품/취소 (total_stock <= 0) 제외 · 사용자 지시 (trending.ts 동일 규칙)
//   · pcode → code 매핑 · join 실패 silent drop 금지 · 로그
interface SalesAggOptions {
  fromYmd: string | null;         // "YYYY-MM-DD" · 하한 (null = 생략)
  toYmd: string | null;           // "YYYY-MM-DD" · 상한 (null = 생략)
  monthsListSet?: Set<string>;    // 비연속 YM post-filter (season/months_list 모드)
  seasonMonths?: number[] | null; // season 1~12 월 번호
  pcodeToCode: Map<string, string>;      // sales.pcode → products.product_code
  salePriceByCode: Map<string, number>;  // products.sale_price for amount 계산
  codeFilter?: Set<string> | null;       // supplier filter 적용 결과 code 제한 (null = 제한 없음)
}
async function aggregateSalesByCode(opts: SalesAggOptions): Promise<Map<string, { qty: number; amount: number }>> {
  const out = new Map<string, { qty: number; amount: number }>();
  let unmatched = 0;
  const PAGE = 1000;
  let from = 0;
  while (true) {
    let q = supabase
      .from("sales")
      .select("pcode, sale_date, total_stock")
      .not("pcode", "is", null)
      .range(from, from + PAGE - 1);
    if (opts.fromYmd) q = q.gte("sale_date", opts.fromYmd);
    if (opts.toYmd) q = q.lte("sale_date", opts.toYmd);
    const { data, error } = await q;
    if (error) {
      if (/relation|does not exist/i.test(error.message)) return out;
      throw new HttpError(500, error.message, "DB_ERROR");
    }
    if (!data || data.length === 0) break;
    for (const r of data) {
      const pc = String((r as any).pcode ?? "").trim();
      if (!pc) continue;
      const code = opts.pcodeToCode.get(pc);
      if (!code) { unmatched++; continue; }
      if (opts.codeFilter && !opts.codeFilter.has(code)) continue;
      const d = String((r as any).sale_date ?? "");
      if (opts.seasonMonths && !inSeasonMonths(d, opts.seasonMonths)) continue;
      if (opts.monthsListSet) {
        const ym = /^(\d{4}-\d{2})/.exec(d)?.[1];
        if (!ym || !opts.monthsListSet.has(ym)) continue;
      }
      const qty = Number((r as any).total_stock ?? 0) || 0;
      if (qty <= 0) continue;  // 반품/취소 제외
      const price = opts.salePriceByCode.get(code) ?? 0;
      const cur = out.get(code) ?? { qty: 0, amount: 0 };
      cur.qty += qty;
      cur.amount += qty * price;
      out.set(code, cur);
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  if (unmatched > 0) {
    logger.info(`[top-sales/sales-ssot] sales.pcode → products.pcode join 실패 ${unmatched} rows (silent drop 금지 · 로그만)`);
  }
  return out;
}

router.get("/api/stock-manage/top-sales", asyncHandler(async (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  const limit = Math.max(1, Math.min(50000, parseInt(String(req.query.limit ?? "500"), 10) || 500));
  let sort = String(req.query.sort ?? "sale");
  let dir  = String(req.query.dir ?? "desc").toLowerCase() === "asc" ? "asc" : "desc";
  const supplierFilter     = String(req.query.supplier ?? "").trim();
  const supplierCodeFilter = String(req.query.supplier_code ?? "").trim();
  // 하위 호환: closing_desc / closing_asc
  if (sort === "closing_desc") { sort = "closing"; dir = "desc"; }
  else if (sort === "closing_asc") { sort = "closing"; dir = "asc"; }
  const dateParam = String(req.query.snapshot_date ?? "").trim();
  const monthsParam = Math.max(0, Math.min(24, parseInt(String(req.query.months ?? "0"), 10) || 0));
  const seasonParam = String(req.query.season ?? "").trim().toLowerCase();
  const seasonMonths = await resolveSeasonMonths(seasonParam);
  // 2026-10-05 · 사용자 지시 · months_list=YM1,YM2 비연속 월 멀티 선택 지원
  //   · 각 YM 은 "YYYY-MM" · 선택된 월만 포함 · 중간 월 자동 포함 X
  //   · season/months 보다 우선 (양립 X · 하나만 사용)
  // 2026-10-06 · 공통 parser 재사용 (server/lib/periodFilter · 복붙 통일)
  const monthsListSet = parseMonthsList(req.query.months_list).set;
  // 2026-07-29 · Phase 2 · Lazy Loading
  const skipPurchase = String(req.query.skip_purchase ?? "").trim() === "1";

  {
    // ── season 또는 months_list 지정 시: 월 필터 aggregation ──
    //   · season: 년도 무관 · 월 번호 매칭 (1~12)
    //   · months_list: 년도 포함 · YM 매칭 (비연속 멀티 월 지원 · 2026-10-05 사용자 지시)
    if (seasonMonths || monthsListSet.size > 0) {
      const rawRows: any[] = [];
      const PAGE = 1000;
      let from = 0;
      while (true) {
        // 2026-10-04 · schema rename · 신규 column 직접 사용 (프론트 StockFlowRow 타입과 일치)
        // 2026-10-06 · 대원칙 · pcode 2단계 JOIN · stock_history.pcode 추가 로드
        let q = supabase
          .from("stock_history")
          .select("period_end, product_code, pcode, supplier_name, supplier_code, spec, prv_stock, buy_stock, sale_stock, product_bad_stock, closing_stock, total_amount")
          .order("period_end", { ascending: true });
        if (supplierFilter)     q = q.eq("supplier_name", supplierFilter);
        if (supplierCodeFilter) q = q.eq("supplier_code", supplierCodeFilter);
        const { data, error } = await q.range(from, from + PAGE - 1);
        if (error) {
          if (/relation|does not exist/i.test(error.message)) return res.json({ snapshot_date: null, dates: [], rows: [] });
          throw new HttpError(500, error.message, "DB_ERROR");
        }
        if (!data || data.length === 0) break;
        for (const r of data) {
          const periodEnd = String((r as any).period_end ?? "");
          let match: boolean;
          if (seasonMonths) {
            match = inSeasonMonths(periodEnd, seasonMonths);
          } else {
            // months_list 모드 · period_end 의 YYYY-MM 매칭 (비연속 지원)
            const ymMatch = /^(\d{4}-\d{2})/.exec(periodEnd)?.[1];
            match = ymMatch ? monthsListSet.has(ymMatch) : false;
          }
          if (match) rawRows.push(r);
        }
        if (data.length < PAGE) break;
        from += PAGE;
      }

      // products 매핑 (숨김 제외)
      // 2026-10-06 · 대원칙 · DB 2단계 JOIN · products 전수 로드 (code + pcode 양방향 Map)
      // 2026-10-06 · 사용자 지시 · sales SSOT · pcodeToCode 매핑도 함께 구성 (sales.pcode → products.product_code)
      type ProductInfo = { product_name: string | null; optimal_stock: number; sale_price: number; purchase_price: number; current_stock: number; min_order: number; location: string | null; sale_status: string | null };
      const productMap = new Map<string, ProductInfo>();
      const productByPcode = new Map<string, ProductInfo>();
      const pcodeToCode = new Map<string, string>();
      const salePriceByCode = new Map<string, number>();
      const hiddenSet = new Set<string>();
      const hiddenPcodeSet = new Set<string>();
      try {
        const PAGE = 1000;
        let pf = 0;
        while (true) {
          const { data: page } = await supabase
            .from("products")
            .select("product_code, pcode, product_name, optimal_stock, sale_price, purchase_price, current_stock, min_order, hidden, display_location, sale_status")
            .range(pf, pf + PAGE - 1);
          if (!page || page.length === 0) break;
          for (const p of page) {
            const code = String(p.product_code ?? "").trim();
            const pcode = String(p.pcode ?? "").trim();
            if (!code && !pcode) continue;
            if (p.hidden === true) {
              if (code) hiddenSet.add(code);
              if (pcode) hiddenPcodeSet.add(pcode);
              continue;
            }
            const info: ProductInfo = {
              product_name:   (String(p.product_name ?? "").trim() || null),
              optimal_stock:  Number(p.optimal_stock  ?? 0) || 0,
              sale_price:     Number(p.sale_price     ?? 0) || 0,
              purchase_price: Number(p.purchase_price ?? 0) || 0,
              current_stock:  Number(p.current_stock  ?? 0) || 0,
              min_order:      Number(p.min_order      ?? 0) || 0,
              location:  (String(p.display_location ?? "").trim() || null),
              sale_status: (String(p.sale_status ?? "").trim() || null),
            };
            if (code)  productMap.set(code, info);
            if (pcode) productByPcode.set(pcode, info);
            if (code && pcode) pcodeToCode.set(pcode, code);
            if (code) salePriceByCode.set(code, info.sale_price);
          }
          if (page.length < PAGE) break;
          pf += PAGE;
        }
      } catch { /* silent */ }

      // 2026-10-04 · schema rename · 신규 field 명 사용 (프론트 StockFlowRow 타입과 일치)
      const byCode = new Map<string, any>();
      let latestSnapshot = "";
      const snapshotSet = new Set<string>();
      for (const r of rawRows) {
        const code = String((r as any).product_code ?? "").trim();
        const pcode = String((r as any).pcode ?? "").trim();
        // 2026-10-06 · 대원칙 · DB 2단계 JOIN · code 매칭 실패 시 pcode 재조회
        const prod = (code ? productMap.get(code) : undefined) ?? (pcode ? productByPcode.get(pcode) : undefined);
        const key = code || pcode;
        if (!key) continue;
        if (code && hiddenSet.has(code)) continue;
        if (pcode && hiddenPcodeSet.has(pcode)) continue;
        const snap = String((r as any).period_end ?? "");
        snapshotSet.add(snap);
        if (snap > latestSnapshot) latestSnapshot = snap;
        if (!byCode.has(key)) {
          byCode.set(key, {
            product_code:    code || null,
            pcode:           pcode || null,
            product_name:    prod?.product_name ?? null,
            supplier:        (r as any).supplier_name ?? null,
            spec:            (r as any).spec ?? null,
            prv_stock:       Number((r as any).prv_stock ?? 0) || 0,
            buy_stock:       0,
            sale_stock:      0,
            product_bad_stock: 0,
            closing_stock:   Number((r as any).closing_stock ?? 0) || 0,
            total_amount:    0,
            first_snap:      snap,
            last_snap:       snap,
            optimal_stock:   prod?.optimal_stock ?? 0,
            sale_price:      prod?.sale_price ?? 0,
            purchase_price:  prod?.purchase_price ?? 0,
            current_stock:   prod?.current_stock ?? 0,
            last_purchase_date:  null as string | null,
            first_purchase_date: null as string | null,
            purchase_count:  0,
            min_order:       prod?.min_order ?? 0,
            location:        prod?.location ?? null,
            // 2026-09-08 · CRITICAL-1 · 판매대시보드 판매중 필터 정상화
            sale_status:     prod?.sale_status ?? null,
          });
        }
        const agg = byCode.get(key)!;
        void prod;
        // 2026-10-05 · 사용자 지시 · 매입 SSOT = purchase_details · stock_history.buy_stock 집계 제거
        // 2026-10-06 · 사용자 지시 · 판매 SSOT = sales · stock_history.sale_stock 집계 제거
        //   · agg.sale_stock, agg.total_amount 은 아래 sales SSOT 블록에서 재할당
        agg.product_bad_stock += Number((r as any).product_bad_stock ?? 0) || 0;
        if (snap < agg.first_snap) {
          agg.first_snap = snap;
          agg.prv_stock = Number((r as any).prv_stock ?? 0) || 0;
        }
        if (snap > agg.last_snap) {
          agg.last_snap = snap;
          agg.closing_stock = Number((r as any).closing_stock ?? 0) || 0;
        }
        // 2026-07-29 · 매입일 stock_history fallback 완전 제거 · 아래 purchase_details 조인만 신뢰
      }

      // ═══ sales SSOT 집계 (season/months_list 모드) · 판매 SSOT · sale_date 축 ═══
      // 2026-10-06 · 사용자 지시 · 판매 데이터는 sales 테이블만 소스 · stock_history 사용 금지
      try {
        const codesInResult = new Set(Array.from(byCode.values()).map(a => a.product_code).filter(Boolean) as string[]);
        // 기간 범위 (sales.sale_date 축) · season/months_list 각각
        let fromYmd: string | null = null;
        let toYmd: string | null = null;
        if (seasonMonths) {
          // season 은 년도 무관 월 번호 매칭 → 전체 스캔 후 post-filter (범위 생략)
        } else if (monthsListSet.size > 0) {
          const sortedYm = [...monthsListSet].sort();
          fromYmd = `${sortedYm[0]}-01`;
          const [yy, mm] = sortedYm[sortedYm.length - 1].split("-").map(Number);
          toYmd = `${sortedYm[sortedYm.length - 1]}-${String(new Date(yy, mm, 0).getDate()).padStart(2, "0")}`;
        }
        const salesAgg = await aggregateSalesByCode({
          fromYmd,
          toYmd,
          monthsListSet: monthsListSet.size > 0 ? monthsListSet : undefined,
          seasonMonths: seasonMonths ?? null,
          pcodeToCode,
          salePriceByCode,
          codeFilter: codesInResult,
        });
        for (const agg of byCode.values()) {
          const s = agg.product_code ? salesAgg.get(agg.product_code) : undefined;
          agg.sale_stock = s?.qty ?? 0;
          agg.total_amount = s?.amount ?? 0;
        }
        logger.info(`[top-sales/season] sales SSOT 집계: ${salesAgg.size}개 상품 · sale_date 축 (판매 SSOT=sales · 대원칙)`);
      } catch (e: any) {
        logger.warn(`[top-sales/season] sales SSOT 집계 실패:`, e?.message);
      }

      // ═══ purchase_details 조인 (season 모드) · 매입 SSOT · 기간 필터 적용 ═══
      // 2026-10-05 · 사용자 지시 · 매입 공용 API 전환 1단계
      //   · season/months_list 필터를 purchase_date 축에도 동일 적용 → 기간 정합성
      //   · agg.buy_stock = info.totalQty 로 할당 (응답 contract 유지)
      if (!skipPurchase) try {
        const codesInResult = Array.from(byCode.keys());
        const CHUNK = 200;
        const PAGE = 1000;
        const purchaseInfoMap = new Map<string, { lastDate: string | null; firstDate: string | null; totalQty: number; totalAmount: number; lastAmount: number; dateSet: Set<string> }>();
        for (let i = 0; i < codesInResult.length; i += CHUNK) {
          const chunk = codesInResult.slice(i, i + CHUNK);
          let fromRow = 0;
          while (true) {
            const { data: pdRows, error: pdError } = await supabase
              .from("purchase_details")
              .select("product_code, purchase_date, quantity, amount, total")
              .in("product_code", chunk)
              .order("purchase_date", { ascending: false })
              .range(fromRow, fromRow + PAGE - 1);
            if (pdError) throw new HttpError(500, pdError.message, "DB_ERROR");
            if (!pdRows || pdRows.length === 0) break;
            for (const r of pdRows) {
              const code = String(r.product_code ?? "").trim();
              if (!code) continue;
              const d = String(r.purchase_date ?? "");
              // 기간 필터 (purchase_date 축) · season or months_list
              if (seasonMonths) {
                if (!inSeasonMonths(d, seasonMonths)) continue;
              } else {
                const ym = /^(\d{4}-\d{2})/.exec(d)?.[1];
                if (!ym || !monthsListSet.has(ym)) continue;
              }
              const cur = purchaseInfoMap.get(code) ?? { lastDate: null, firstDate: null, totalQty: 0, totalAmount: 0, lastAmount: 0, dateSet: new Set<string>() };
              const amt = Number(r.total ?? r.amount ?? 0) || 0;
              const qty = Number(r.quantity ?? 0) || 0;
              if (d && (!cur.lastDate || d > cur.lastDate)) { cur.lastDate = d; cur.lastAmount = amt; }
              if (d && (!cur.firstDate || d < cur.firstDate)) { cur.firstDate = d; }
              cur.totalQty += qty;
              cur.totalAmount += amt;
              if (d) cur.dateSet.add(d);
              purchaseInfoMap.set(code, cur);
            }
            if (pdRows.length < PAGE) break;
            fromRow += PAGE;
          }
        }
        for (const agg of byCode.values()) {
          const info = purchaseInfoMap.get(agg.product_code);
          if (info && info.dateSet.size > 0) {
            agg.last_purchase_date  = info.lastDate;
            agg.first_purchase_date = info.firstDate;
            agg.purchase_count      = info.dateSet.size;
            agg.purchase_total_qty    = info.totalQty;
            agg.purchase_total_amount = info.totalAmount;
            agg.purchase_last_amount  = info.lastAmount;
            // 2026-10-05 · 사용자 지시 · 매입 SSOT · buy_stock = purchase_details.quantity SUM
            agg.buy_stock = info.totalQty;
          }
        }
        logger.info(`[top-sales/season] purchase_details 조인: ${purchaseInfoMap.size}개 상품 · 기간 필터 적용 · buy_stock=purchase_details SSOT`);
      } catch (e: any) {
        logger.warn(`[top-sales/season] purchase_details 조인 실패:`, e?.message);
      }

      const aggRows = Array.from(byCode.values()).map(({ first_snap: _fs, last_snap: _ls, ...rest }) => rest);
      const sign = dir === "asc" ? 1 : -1;
      // 2026-10-04 · schema rename · sort key → 신규 field 이름
      const sorted = aggRows.sort((a, b) => {
        switch (sort) {
          case "purchase": return sign * (a.buy_stock     - b.buy_stock);
          case "amount":   return sign * (a.sale_price    - b.sale_price);
          case "closing":  return sign * (a.closing_stock - b.closing_stock);
          case "sale":
          default:         return sign * (a.sale_stock    - b.sale_stock);
        }
      });
      const datesArr = Array.from(snapshotSet).sort((a, b) => b.localeCompare(a));
      const payload = {
        snapshot_date: latestSnapshot || null,
        period_type: null,
        months: 0,
        season: seasonParam,
        season_months: seasonMonths,
        dates: datesArr,
        dates_with_period: datesArr.map(d => ({ snapshot_date: d, period_type: null })),
        rows: sorted.slice(0, limit),
      };
      return res.json(payload);
    }

    // ── months 지정 시: 범위 aggregation 모드 ──
    if (monthsParam > 0) {
      // 2026-07-16 fix: 정확히 N개월 back
      const today = new Date();
      const cutoff = new Date(today.getFullYear(), today.getMonth() - monthsParam, today.getDate());
      const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

      // 2026-09-08 · 사용자 지시 · RPC → 직접 쿼리 (LIMIT 1000 이슈 · 유지보수)
      //   get_stock_flow RPC 제거 · 직접 stock_history 집계 사용
      // 기존 로직 (모든 경우 동일 경로)

      const rawRows: any[] = [];
      const PAGE = 1000;
      let from = 0;
      while (true) {
        // 2026-10-06 · 대원칙 · pcode 2단계 JOIN · stock_history.pcode 추가 로드
        let q = supabase
          .from("stock_history")
          .select("period_end, product_code, pcode, supplier_name, spec, prv_stock, buy_stock, sale_stock, product_bad_stock, closing_stock, total_amount")
          .gte("period_end", cutoffStr)
          .order("period_end", { ascending: true });
        if (supplierFilter)     q = q.eq("supplier_name", supplierFilter);
        if (supplierCodeFilter) q = q.eq("supplier_code", supplierCodeFilter);
        const { data, error } = await q.range(from, from + PAGE - 1);
        if (error) {
          if (/relation|does not exist/i.test(error.message)) return res.json({ snapshot_date: null, dates: [], rows: [] });
          throw new HttpError(500, error.message, "DB_ERROR");
        }
        if (!data || data.length === 0) break;
        rawRows.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
      }

      // 2026-10-06 · 대원칙 · DB 2단계 JOIN · products 전수 로드 (code + pcode 양방향 Map)
      // 2026-10-06 · 사용자 지시 · sales SSOT · pcodeToCode / salePriceByCode 매핑 구성
      type ProductInfoM = { product_name: string | null; optimal_stock: number; sale_price: number; purchase_price: number; current_stock: number; last_purchase_date: string | null; min_order: number; location: string | null; sale_status: string | null };
      const productMap = new Map<string, ProductInfoM>();
      const productByPcode = new Map<string, ProductInfoM>();
      const pcodeToCode = new Map<string, string>();
      const salePriceByCode = new Map<string, number>();
      const hiddenSet = new Set<string>();
      const hiddenPcodeSet = new Set<string>();
      try {
        const OP_PAGE = 1000;
        let opFrom = 0;
        while (true) {
          const { data: page } = await supabase
            .from("products")
            .select("product_code, pcode, product_name, optimal_stock, sale_price, purchase_price, current_stock, last_purchase_date, min_order, hidden, display_location, sale_status")
            .range(opFrom, opFrom + OP_PAGE - 1);
          if (!page || page.length === 0) break;
          for (const p of page) {
            const code = String(p.product_code ?? "").trim();
            const pcode = String(p.pcode ?? "").trim();
            if (!code && !pcode) continue;
            if (p.hidden === true) {
              if (code) hiddenSet.add(code);
              if (pcode) hiddenPcodeSet.add(pcode);
              continue;
            }
            const info: ProductInfoM = {
              product_name:   (String(p.product_name ?? "").trim() || null),
              optimal_stock:  Number(p.optimal_stock  ?? 0) || 0,
              sale_price:     Number(p.sale_price     ?? 0) || 0,
              purchase_price: Number(p.purchase_price ?? 0) || 0,
              current_stock:  Number(p.current_stock  ?? 0) || 0,
              last_purchase_date: p.last_purchase_date ?? null,
              min_order:      Number(p.min_order      ?? 0) || 0,
              location:  (String(p.display_location ?? "").trim() || null),
              sale_status: (String(p.sale_status ?? "").trim() || null),
            };
            if (code)  productMap.set(code, info);
            if (pcode) productByPcode.set(pcode, info);
            if (code && pcode) pcodeToCode.set(pcode, code);
            if (code) salePriceByCode.set(code, info.sale_price);
          }
          if (page.length < OP_PAGE) break;
          opFrom += OP_PAGE;
        }
      } catch { /* silent */ }

      // 2026-10-04 · schema rename · 신규 field 명 사용 (프론트 StockFlowRow 타입과 일치)
      const byCode = new Map<string, any>();
      let latestSnapshot = "";
      const snapshotSet = new Set<string>();
      for (const r of rawRows) {
        const code = String((r as any).product_code ?? "").trim();
        const pcode = String((r as any).pcode ?? "").trim();
        // 2026-10-06 · 대원칙 · DB 2단계 JOIN · code 매칭 실패 시 pcode 재조회
        const prod = (code ? productMap.get(code) : undefined) ?? (pcode ? productByPcode.get(pcode) : undefined);
        const key = code || pcode;
        if (!key) continue;
        if (code && hiddenSet.has(code)) continue;
        if (pcode && hiddenPcodeSet.has(pcode)) continue;
        const snap = String((r as any).period_end ?? "");
        snapshotSet.add(snap);
        if (snap > latestSnapshot) latestSnapshot = snap;
        if (!byCode.has(key)) {
          byCode.set(key, {
            product_code:    code || null,
            pcode:           pcode || null,
            product_name:    prod?.product_name ?? null,
            supplier:        (r as any).supplier_name ?? null,
            spec:            (r as any).spec ?? null,
            prv_stock:       Number((r as any).prv_stock ?? 0) || 0,
            buy_stock:       0,
            sale_stock:      0,
            product_bad_stock: 0,
            closing_stock:   Number((r as any).closing_stock ?? 0) || 0,
            total_amount:    0,
            first_snap:      snap,
            last_snap:       snap,
            optimal_stock:   prod?.optimal_stock ?? 0,
            sale_price:      prod?.sale_price    ?? 0,
            purchase_price:  prod?.purchase_price ?? 0,
            current_stock:   prod?.current_stock ?? 0,
            last_purchase_date:  null as string | null,
            min_order:       prod?.min_order ?? 0,
            purchase_count:  0,
            first_purchase_date: null as string | null,
            location:        prod?.location ?? null,
            // 2026-09-08 · CRITICAL-1 · 판매대시보드 판매중 필터 정상화
            sale_status:     prod?.sale_status ?? null,
          });
        }
        const agg = byCode.get(key)!;
        void prod;
        // 2026-10-05 · 사용자 지시 · 매입 SSOT = purchase_details · stock_history.buy_stock 집계 제거
        // 2026-10-06 · 사용자 지시 · 판매 SSOT = sales · stock_history.sale_stock 집계 제거
        //   · agg.sale_stock, agg.total_amount 은 아래 sales SSOT 블록에서 재할당
        agg.product_bad_stock += Number((r as any).product_bad_stock ?? 0) || 0;
        if (snap < agg.first_snap) {
          agg.first_snap = snap;
          agg.prv_stock = Number((r as any).prv_stock ?? 0) || 0;
        }
        if (snap > agg.last_snap) {
          agg.last_snap = snap;
          agg.closing_stock = Number((r as any).closing_stock ?? 0) || 0;
        }
      }
      // 2026-07-28 · purchase_details 조인 · 2026-10-05 · 기간 필터 추가 (purchase_date >= cutoffStr)
      const codesInResult = Array.from(byCode.keys());
      // 2026-07-30 · lastQty 추가
      const purchaseInfoMap = new Map<string, { lastDate: string | null; firstDate: string | null; count: number; totalQty: number; totalAmount: number; lastAmount: number; lastQty: number; dates: string[]; dateSet: Set<string> }>();
      if (!skipPurchase) try {
        const CHUNK = 200;
        const PAGE = 1000;
        for (let i = 0; i < codesInResult.length; i += CHUNK) {
          const chunk = codesInResult.slice(i, i + CHUNK);
          let fromRow = 0;
          const allPdRows: any[] = [];
          while (true) {
            const { data: pdRows, error: pdError } = await supabase
              .from("purchase_details")
              .select("product_code, purchase_date, quantity, amount, total")
              .in("product_code", chunk)
              .gte("purchase_date", cutoffStr)
              .order("purchase_date", { ascending: false })
              .range(fromRow, fromRow + PAGE - 1);
            if (pdError) throw new HttpError(500, pdError.message, "DB_ERROR");
            if (!pdRows || pdRows.length === 0) break;
            allPdRows.push(...pdRows);
            if (pdRows.length < PAGE) break;
            fromRow += PAGE;
          }
          const pdRows = allPdRows;
          for (const r of pdRows ?? []) {
            const code = String(r.product_code ?? "").trim();
            if (!code) continue;
            const cur = purchaseInfoMap.get(code) ?? { lastDate: null, firstDate: null, count: 0, totalQty: 0, totalAmount: 0, lastAmount: 0, lastQty: 0, dates: [], dateSet: new Set<string>() };
            const d = String(r.purchase_date ?? "");
            const amt = Number(r.total ?? r.amount ?? 0) || 0;
            const qty = Number(r.quantity ?? 0) || 0;
            if (d && !cur.lastDate) { cur.lastDate = d; cur.lastAmount = amt; cur.lastQty = qty; }
            else if (d && d > (cur.lastDate ?? "")) { cur.lastDate = d; cur.lastAmount = amt; cur.lastQty = qty; }
            if (d && (!cur.firstDate || d < cur.firstDate)) { cur.firstDate = d; }
            cur.totalQty += qty;
            cur.totalAmount += amt;
            if (d) { cur.dates.push(d); cur.dateSet.add(d); }
            purchaseInfoMap.set(code, cur);
          }
        }
        for (const info of purchaseInfoMap.values()) {
          info.count = info.dateSet.size;
        }
        const missingCodes = codesInResult.filter(c => !purchaseInfoMap.has(c));
        const singleDate = [...purchaseInfoMap.entries()].filter(([, v]) => v.count === 1);
        logger.info(`[top-sales/months] purchase_details 조인: ${purchaseInfoMap.size}/${codesInResult.length}개 매치 · 누락 ${missingCodes.length}개 · 1회만 매입 ${singleDate.length}개`);
        if (missingCodes.length > 0 && missingCodes.length <= 20) {
          logger.info(`[top-sales/months] 누락 codes 샘플:`, missingCodes.slice(0, 10));
        }
      } catch (e: any) {
        logger.warn(`[top-sales/months] purchase_details 조인 실패:`, e?.message);
      }
      // 2026-07-28 · 회전율 = 최근매입일 ~ 그 전매입일 사이 판매량
      // 2026-10-06 · 사용자 지시 · 판매 SSOT = sales · stock_history 참조 제거
      //   · sale_date 축 집계 · 날짜별 (sale_date) 집계 Map 구성
      //   · 반품/취소 (total_stock <= 0) 제외
      const salesByCodeByDate = new Map<string, Map<string, { qty: number; amount: number }>>();
      try {
        const PAGE = 1000;
        let from = 0;
        // sales 전체 fetch · cutoffStr 하한 · supplier filter 는 pcode→code→supplier_code 로 간접
        while (true) {
          const { data, error } = await supabase
            .from("sales")
            .select("pcode, sale_date, total_stock")
            .not("pcode", "is", null)
            .gte("sale_date", cutoffStr)
            .lte("sale_date", todayStr)
            .range(from, from + PAGE - 1);
          if (error) {
            if (/relation|does not exist/i.test(error.message)) break;
            throw new HttpError(500, error.message, "DB_ERROR");
          }
          if (!data || data.length === 0) break;
          for (const r of data) {
            const pc = String((r as any).pcode ?? "").trim();
            if (!pc) continue;
            const code = pcodeToCode.get(pc);
            if (!code) continue;
            // supplier filter 적용 (byCode 에 포함된 code 만 집계 대상)
            if (!byCode.has(code)) continue;
            const d = String((r as any).sale_date ?? "");
            const q = Number((r as any).total_stock ?? 0) || 0;
            if (q <= 0) continue;  // 반품/취소 제외
            const sp = salePriceByCode.get(code) ?? 0;
            const bySup = salesByCodeByDate.get(code) ?? new Map<string, { qty: number; amount: number }>();
            const prev = bySup.get(d) ?? { qty: 0, amount: 0 };
            bySup.set(d, { qty: prev.qty + q, amount: prev.amount + q * sp });
            salesByCodeByDate.set(code, bySup);
          }
          if (data.length < PAGE) break;
          from += PAGE;
        }
        logger.info(`[top-sales/months] sales SSOT 집계: ${salesByCodeByDate.size}개 상품 · sale_date 축 (판매 SSOT=sales)`);
      } catch (e: any) {
        logger.warn(`[top-sales/months] sales SSOT 집계 실패:`, e?.message);
      }
      // sale_stock / total_amount 재할당 (전체 기간 SUM)
      for (const agg of byCode.values()) {
        const bySup = agg.product_code ? salesByCodeByDate.get(agg.product_code) : undefined;
        let totalQty = 0, totalAmount = 0;
        if (bySup) {
          for (const v of bySup.values()) { totalQty += v.qty; totalAmount += v.amount; }
        }
        agg.sale_stock = totalQty;
        agg.total_amount = totalAmount;
      }
      // 2026-07-30 · 최근 한달 판매량 + 판매액
      // 2026-08-03 · 60일/90일 판매량 추가
      const _todayIso = new Date().toISOString().slice(0, 10);
      const _monthAgo = new Date(Date.now() - 30 * 86400 * 1000).toISOString().slice(0, 10);
      const _day60    = new Date(Date.now() - 60 * 86400 * 1000).toISOString().slice(0, 10);
      const _day90    = new Date(Date.now() - 90 * 86400 * 1000).toISOString().slice(0, 10);
      for (const agg of byCode.values()) {
        {
          const bySup = salesByCodeByDate.get(agg.product_code);
          let salesMonth = 0, amountMonth = 0, sales60 = 0, sales90 = 0;
          if (bySup) {
            for (const [snap, v] of bySup) {
              if (snap > _todayIso) continue;
              if (snap >= _monthAgo) { salesMonth += v.qty; amountMonth += v.amount; }
              if (snap >= _day60) sales60 += v.qty;
              if (snap >= _day90) sales90 += v.qty;
            }
          }
          agg.sale_qty_month    = salesMonth;
          agg.sale_amount_month = amountMonth;
          agg.sale_qty_60d      = sales60;
          agg.sale_qty_90d      = sales90;
        }
        const info = purchaseInfoMap.get(agg.product_code);
        if (info && info.count > 0) {
          agg.purchase_count        = info.count;
          agg.first_purchase_date   = info.firstDate;
          agg.last_purchase_date    = info.lastDate;
          agg.purchase_total_qty    = info.totalQty;
          agg.purchase_total_amount = info.totalAmount;
          agg.purchase_last_amount  = info.lastAmount;
          agg.last_purchase_qty     = info.lastQty;
          // 2026-10-05 · 사용자 지시 · 매입 SSOT · buy_stock = purchase_details.quantity SUM
          agg.buy_stock = info.totalQty;
          const sortedDates = [...new Set(info.dates)].sort().reverse();
          if (sortedDates.length >= 2) {
            const latest = sortedDates[0];
            const prev   = sortedDates[1];
            const bySup  = salesByCodeByDate.get(agg.product_code);
            let cycleSales = 0;
            if (bySup) {
              for (const [snap, v] of bySup) {
                if (snap > prev && snap <= latest) cycleSales += v.qty;
              }
            }
            agg.sale_qty_cycle = cycleSales;
            agg.cycle_from = prev;
            agg.cycle_to   = latest;
          } else {
            agg.sale_qty_cycle = 0;
            agg.cycle_from = null;
            agg.cycle_to   = null;
          }
        } else {
          agg.sale_qty_cycle = 0;
          agg.cycle_from = null;
          agg.cycle_to   = null;
        }
      }
      const aggRows = Array.from(byCode.values()).map(({ first_snap, last_snap, ...rest }) => rest);
      const sign = dir === "asc" ? 1 : -1;
      // 2026-10-04 · schema rename · sort key → 신규 field 이름
      const sorted = aggRows.sort((a, b) => {
        switch (sort) {
          case "purchase": return sign * (a.buy_stock     - b.buy_stock);
          case "amount":   return sign * (a.sale_price    - b.sale_price);
          case "closing":  return sign * (a.closing_stock - b.closing_stock);
          case "sale":
          default:         return sign * (a.sale_stock    - b.sale_stock);
        }
      });
      // 2026-07-28 · 3개월 재고회전율
      // 2026-10-06 · 사용자 지시 · 판매 SSOT = sales · 재고 축은 stock_history 유지
      //   · sale_qty_3m 는 sales 집계 · opening/closing 은 stock_history snapshot
      const compute3mMap = new Map<string, { sale_qty_3m: number; opening_3m: number; closing_3m: number }>();
      {
        const today3 = new Date();
        const cutoff3 = new Date(today3.getFullYear(), today3.getMonth() - 3, today3.getDate());
        const cutoff3Str = `${cutoff3.getFullYear()}-${String(cutoff3.getMonth() + 1).padStart(2, "0")}-${String(cutoff3.getDate()).padStart(2, "0")}`;
        // 재고 축 (opening/closing) · stock_history 유지
        const by3Stock = new Map<string, { first_snap: string; last_snap: string; opening: number; closing: number }>();
        try {
          const rows3: any[] = [];
          const PAGE3 = 1000;
          let from3 = 0;
          while (true) {
            let q3 = supabase.from("stock_history")
              .select("period_end, product_code, prv_stock, closing_stock")
              .gte("period_end", cutoff3Str)
              .order("period_end", { ascending: true });
            if (supplierFilter)     q3 = q3.eq("supplier_name", supplierFilter);
            if (supplierCodeFilter) q3 = q3.eq("supplier_code", supplierCodeFilter);
            const { data, error } = await q3.range(from3, from3 + PAGE3 - 1);
            if (error || !data || data.length === 0) break;
            rows3.push(...data);
            if (data.length < PAGE3) break;
            from3 += PAGE3;
          }
          for (const r of rows3) {
            const code = String((r as any).product_code ?? "").trim();
            if (!code) continue;
            const snap = String((r as any).period_end ?? "");
            if (!by3Stock.has(code)) {
              by3Stock.set(code, { first_snap: snap, last_snap: snap, opening: Number((r as any).prv_stock ?? 0) || 0, closing: Number((r as any).closing_stock ?? 0) || 0 });
            }
            const agg3 = by3Stock.get(code)!;
            if (snap < agg3.first_snap) { agg3.first_snap = snap; agg3.opening = Number((r as any).prv_stock ?? 0) || 0; }
            if (snap > agg3.last_snap)  { agg3.last_snap  = snap; agg3.closing = Number((r as any).closing_stock ?? 0) || 0; }
          }
        } catch { /* silent */ }
        // 판매 축 (sale_qty_3m) · sales SSOT
        const sales3Map = new Map<string, number>();
        try {
          const PAGE = 1000;
          let from = 0;
          while (true) {
            const { data, error } = await supabase
              .from("sales")
              .select("pcode, sale_date, total_stock")
              .not("pcode", "is", null)
              .gte("sale_date", cutoff3Str)
              .range(from, from + PAGE - 1);
            if (error) break;
            if (!data || data.length === 0) break;
            for (const r of data) {
              const pc = String((r as any).pcode ?? "").trim();
              if (!pc) continue;
              const code = pcodeToCode.get(pc);
              if (!code) continue;
              const q = Number((r as any).total_stock ?? 0) || 0;
              if (q <= 0) continue;
              sales3Map.set(code, (sales3Map.get(code) ?? 0) + q);
            }
            if (data.length < PAGE) break;
            from += PAGE;
          }
        } catch { /* silent */ }
        // 병합
        const allCodes = new Set<string>([...by3Stock.keys(), ...sales3Map.keys()]);
        for (const code of allCodes) {
          const stock = by3Stock.get(code);
          compute3mMap.set(code, {
            sale_qty_3m: sales3Map.get(code) ?? 0,
            opening_3m:  stock?.opening ?? 0,
            closing_3m:  stock?.closing ?? 0,
          });
        }
      }
      for (const agg of aggRows) {
        const m3 = compute3mMap.get(agg.product_code);
        if (m3) {
          agg.sale_qty_3m  = m3.sale_qty_3m;
          agg.avg_stock_3m = (m3.opening_3m + m3.closing_3m) / 2;
          agg.turnover_3m  = agg.avg_stock_3m > 0 ? m3.sale_qty_3m / agg.avg_stock_3m : 0;
        } else {
          agg.sale_qty_3m  = 0;
          agg.avg_stock_3m = 0;
          agg.turnover_3m  = 0;
        }
      }
      const datesArr = Array.from(snapshotSet).sort((a, b) => b.localeCompare(a));
      const payload = {
        snapshot_date: latestSnapshot || null,
        period_type: null,
        months: monthsParam,
        cutoff: cutoffStr,
        dates: datesArr,
        dates_with_period: datesArr.map(d => ({ snapshot_date: d, period_type: null })),
        rows: sorted.slice(0, limit),
      };
      return res.json(payload);
    }

    // ── 단일 스냅샷 모드 ──
    let targetDate = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : "";
    if (!targetDate) {
      const today = new Date();
      const dd = today.getDate();
      const currentPeriod: "early" | "mid" | "late" =
        dd <= 10 ? "early" : dd <= 20 ? "mid" : "late";
      // 2026-10-04 · schema rename · snapshot_date → period_end
      const { data: matchPeriod } = await supabase
        .from("stock_history")
        .select("period_end")
        .eq("period_type", currentPeriod)
        .order("period_end", { ascending: false })
        .limit(1);
      if ((matchPeriod?.[0] as any)?.period_end) {
        targetDate = (matchPeriod![0] as any).period_end;
      } else {
        const { data: latest } = await supabase
          .from("stock_history")
          .select("period_end")
          .order("period_end", { ascending: false })
          .limit(1);
        targetDate = (latest?.[0] as any)?.period_end ?? "";
      }
    }
    if (!targetDate) return res.json({ snapshot_date: null, dates: [], rows: [] });

    let dates: string[] = [];
    let dateToPeriodMap = new Map<string, string>();
    try {
      // 2026-10-04 · schema rename · 신규 column 직접 사용
      const { data: dRows } = await supabase
        .from("stock_history")
        .select("period_end, period_type")
        .order("period_end", { ascending: false })
        .limit(1000);
      const set = new Set<string>();
      for (const d of dRows ?? []) {
        const dt = (d as any).period_end;
        const pt = (d as any).period_type;
        if (!dt) continue;
        if (!set.has(dt)) { set.add(dt); if (pt) dateToPeriodMap.set(dt, pt); }
      }
      dates = Array.from(set).sort((a, b) => b.localeCompare(a));
    } catch (e: any) {
      logger.warn("[top-sales] dates 조회 실패, 계속:", e?.message);
    }
    const dates_with_period = dates.map(dt => ({ snapshot_date: dt, period_type: dateToPeriodMap.get(dt) ?? null }));
    const targetPeriodType = dateToPeriodMap.get(targetDate) ?? null;

    const data: any[] = [];
    // 2026-10-04 · schema rename · DB sort column → 신규 이름 매핑
    const dbSortColumn: Record<string, string> = {
      sale: "sale_stock",
      purchase: "buy_stock",
      closing: "closing_stock",
    };
    const dbCol = dbSortColumn[sort];
    if (dbCol && !supplierFilter && !supplierCodeFilter) {
      const fetchLimit = Math.max(limit * 3, 300);
      try {
        // 2026-10-04 · schema rename · 신규 column 직접 사용 (프론트 StockFlowRow 타입과 일치)
        const page = await fetchAllWithRange<any>(() => supabase
          .from("stock_history")
          .select("product_code, pcode, supplier_code, supplier_name, spec, prv_stock, buy_stock, sale_stock, product_bad_stock, internal_qty, adjustment_qty, closing_stock, total_amount")
          .eq("period_end", targetDate)
          .order(dbCol, { ascending: dir === "asc" }), fetchLimit);
        data.push(...page);
      } catch (err: any) {
        if (/relation|does not exist/i.test(err?.message ?? "")) return res.json({ snapshot_date: null, dates: [], rows: [] });
        throw err;
      }
    } else {
      const PAGE = 1000;
      let from = 0;
      while (true) {
        // 2026-10-04 · schema rename · 신규 column 직접 사용
        let q = supabase
          .from("stock_history")
          .select("product_code, pcode, supplier_code, supplier_name, spec, prv_stock, buy_stock, sale_stock, product_bad_stock, internal_qty, adjustment_qty, closing_stock, total_amount")
          .eq("period_end", targetDate);
        if (supplierCodeFilter) q = q.eq("supplier_code", supplierCodeFilter);
        else if (supplierFilter) q = q.eq("supplier_name", supplierFilter);
        const { data: page, error } = await q.range(from, from + PAGE - 1);
        if (error) {
          if (/relation|does not exist/i.test(error.message)) return res.json({ snapshot_date: null, dates: [], rows: [] });
          throw new HttpError(500, error.message, "DB_ERROR");
        }
        if (!page || page.length === 0) break;
        data.push(...page);
        if (page.length < PAGE) break;
        from += PAGE;
      }
    }

    // 2026-10-06 · 대원칙 · DB 2단계 JOIN · products 전수 로드 (code + pcode 양방향 Map)
    // 2026-10-06 · 사용자 지시 · sales SSOT · pcodeToCode / salePriceByCode 매핑 구성
    type ProductInfoS = { product_name: string | null; optimal_stock: number; sale_price: number; purchase_price: number; current_stock: number; last_purchase_date: string | null; min_order: number; location: string | null; sale_status: string | null };
    const productMap = new Map<string, ProductInfoS>();
    const productByPcode = new Map<string, ProductInfoS>();
    const pcodeToCode = new Map<string, string>();
    const salePriceByCode = new Map<string, number>();
    const hiddenSet = new Set<string>();
    const hiddenPcodeSet = new Set<string>();
    const codesInResult = Array.from(new Set(data.map(r => String(r.product_code ?? "").trim()).filter(Boolean)));
    try {
      const OP_PAGE = 1000;
      let opFrom = 0;
      while (true) {
        const { data: page } = await supabase
          .from("products")
          .select("product_code, pcode, product_name, optimal_stock, sale_price, purchase_price, current_stock, last_purchase_date, min_order, hidden, display_location, sale_status")
          .range(opFrom, opFrom + OP_PAGE - 1);
        if (!page || page.length === 0) break;
        for (const p of page) {
          const code = String(p.product_code ?? "").trim();
          const pcode = String(p.pcode ?? "").trim();
          if (!code && !pcode) continue;
          if (p.hidden === true) {
            if (code) hiddenSet.add(code);
            if (pcode) hiddenPcodeSet.add(pcode);
            continue;
          }
          const info: ProductInfoS = {
            product_name:   (String(p.product_name ?? "").trim() || null),
            optimal_stock:  Number(p.optimal_stock  ?? 0) || 0,
            sale_price:     Number(p.sale_price     ?? 0) || 0,
            purchase_price: Number(p.purchase_price ?? 0) || 0,
            current_stock:  Number(p.current_stock  ?? 0) || 0,
            last_purchase_date: p.last_purchase_date ?? null,
            min_order:      Number(p.min_order      ?? 0) || 0,
            location:  (String(p.display_location ?? "").trim() || null),
            sale_status: (String(p.sale_status ?? "").trim() || null),
          };
          if (code)  productMap.set(code, info);
          if (pcode) productByPcode.set(pcode, info);
          if (code && pcode) pcodeToCode.set(pcode, code);
          if (code) salePriceByCode.set(code, info.sale_price);
        }
        if (page.length < OP_PAGE) break;
        opFrom += OP_PAGE;
      }
    } catch (e: any) {
      logger.warn("[top-sales] products fetch 실패:", e?.message);
    }

    // ═══ sales SSOT 집계 (snapshot 모드) · 그 날짜 (targetDate) 판매 ═══
    // 2026-10-06 · 사용자 지시 · 판매 SSOT = sales · sale_date = targetDate 단일 날짜
    //   · stock_history.sale_stock 사용 금지 · sales SSOT 로 재계산
    const salesSnapshotMap = new Map<string, { qty: number; amount: number }>();
    try {
      const PAGE = 1000;
      let from = 0;
      while (true) {
        const { data: sRows, error: sErr } = await supabase
          .from("sales")
          .select("pcode, total_stock")
          .not("pcode", "is", null)
          .eq("sale_date", targetDate)
          .range(from, from + PAGE - 1);
        if (sErr) {
          if (/relation|does not exist/i.test(sErr.message)) break;
          throw new HttpError(500, sErr.message, "DB_ERROR");
        }
        if (!sRows || sRows.length === 0) break;
        for (const r of sRows) {
          const pc = String((r as any).pcode ?? "").trim();
          if (!pc) continue;
          const code = pcodeToCode.get(pc);
          if (!code) continue;
          const q = Number((r as any).total_stock ?? 0) || 0;
          if (q <= 0) continue;
          const sp = salePriceByCode.get(code) ?? 0;
          const cur = salesSnapshotMap.get(code) ?? { qty: 0, amount: 0 };
          cur.qty += q;
          cur.amount += q * sp;
          salesSnapshotMap.set(code, cur);
        }
        if (sRows.length < PAGE) break;
        from += PAGE;
      }
      logger.info(`[top-sales/snapshot] sales SSOT 집계: ${salesSnapshotMap.size}개 상품 · targetDate=${targetDate} (판매 SSOT=sales)`);
    } catch (e: any) {
      logger.warn("[top-sales/snapshot] sales SSOT 집계 실패:", e?.message);
    }

    // ═══ purchase_details 조인 · 최근/최초 매입일 + 매입 금액 + 횟수
    const purchaseInfoMap = new Map<string, { lastDate: string | null; firstDate: string | null; lastAmount: number; totalQty: number; totalAmount: number; count: number; dateSet: Set<string> }>();
    if (!skipPurchase) try {
      const CHUNK = 200;
      const PAGE = 1000;
      for (let i = 0; i < codesInResult.length; i += CHUNK) {
        const chunk = codesInResult.slice(i, i + CHUNK);
        let fromRow = 0;
        const allPdRows: any[] = [];
        while (true) {
          const { data: pdRows, error: pdError } = await supabase
            .from("purchase_details")
            .select("product_code, purchase_date, quantity, amount, total")
            .in("product_code", chunk)
            .order("purchase_date", { ascending: false })
            .range(fromRow, fromRow + PAGE - 1);
          if (pdError) throw new HttpError(500, pdError.message, "DB_ERROR");
          if (!pdRows || pdRows.length === 0) break;
          allPdRows.push(...pdRows);
          if (pdRows.length < PAGE) break;
          fromRow += PAGE;
        }
        for (const r of allPdRows) {
          const code = String(r.product_code ?? "").trim();
          if (!code) continue;
          const cur = purchaseInfoMap.get(code) ?? { lastDate: null, firstDate: null, lastAmount: 0, totalQty: 0, totalAmount: 0, count: 0, dateSet: new Set<string>() };
          const d = String(r.purchase_date ?? "");
          const amt = Number(r.total ?? r.amount ?? 0) || 0;
          const qty = Number(r.quantity ?? 0) || 0;
          if (d && (!cur.lastDate || d > cur.lastDate)) { cur.lastDate = d; cur.lastAmount = amt; }
          if (d && (!cur.firstDate || d < cur.firstDate)) { cur.firstDate = d; }
          cur.totalQty += qty;
          cur.totalAmount += amt;
          if (d) cur.dateSet.add(d);
          purchaseInfoMap.set(code, cur);
        }
      }
      for (const info of purchaseInfoMap.values()) info.count = info.dateSet.size;
      logger.info(`[top-sales] purchase_details 조인: ${purchaseInfoMap.size}개 상품 · distinct date 카운트`);
    } catch (e: any) {
      logger.warn("[top-sales] purchase_details 조인 실패 (계속 진행):", e?.message);
    }

    // 2026-07-29 · 매입이력 필드는 무조건 purchase_details 만 사용
    // 2026-10-01 · 사용자 지시 · 공통기능 공식 통일 · total_amount 는 sale_stock × sale_price (파생) · raw 사용 금지
    // 2026-10-04 · schema rename · 신규 field 명 사용 (프론트 StockFlowRow 타입과 일치)
    const rows = (data ?? []).filter(r => {
      const c = String((r as any).product_code ?? "");
      const pc = String((r as any).pcode ?? "");
      return !(c && hiddenSet.has(c)) && !(pc && hiddenPcodeSet.has(pc));
    }).map(r => {
      const code = String((r as any).product_code ?? "").trim();
      const pcode = String((r as any).pcode ?? "").trim();
      // 2026-10-06 · 대원칙 · DB 2단계 JOIN · code 매칭 실패 시 pcode 재조회
      const prod = (code ? productMap.get(code) : undefined) ?? (pcode ? productByPcode.get(pcode) : undefined);
      const purchaseInfo = code ? purchaseInfoMap.get(code) : undefined;
      // 2026-10-06 · 사용자 지시 · 판매 SSOT = sales · stock_history.sale_stock 사용 금지
      const salesInfo = code ? salesSnapshotMap.get(code) : undefined;
      return {
        product_code:      code || null,
        pcode:             pcode || null,
        product_name:      prod?.product_name ?? null,
        supplier:          (r as any).supplier_name ?? null,
        spec:              (r as any).spec ?? null,
        prv_stock:         Number((r as any).prv_stock         ?? 0) || 0,
        // 2026-10-05 · 사용자 지시 · 매입 SSOT = purchase_details · stock_history.buy_stock 참조 중단
        //   · 단일 snapshot 모드는 "그 날짜 재고" 라 매입 기간이 불명 → purchase_total_qty (전체 기간 누적) 노출
        buy_stock:         purchaseInfo?.totalQty ?? 0,
        sale_stock:        salesInfo?.qty ?? 0,
        product_bad_stock: Number((r as any).product_bad_stock ?? 0) || 0,
        internal_qty:      Number((r as any).internal_qty      ?? 0) || 0,
        adjustment_qty:    Number((r as any).adjustment_qty    ?? 0) || 0,
        closing_stock:     Number((r as any).closing_stock     ?? 0) || 0,
        // 2026-10-01 · 사용자 대원칙 #3 · 판매액 = 수량 × 판매가 (xlsx raw total_amount 금지)
        total_amount:      salesInfo?.amount ?? 0,
        optimal_stock:     prod?.optimal_stock  ?? 0,
        sale_price:        prod?.sale_price     ?? 0,
        purchase_price:    prod?.purchase_price ?? 0,
        current_stock:     prod?.current_stock  ?? 0,
        last_purchase_date:    purchaseInfo?.lastDate   ?? null,
        purchase_last_amount:  purchaseInfo?.lastAmount ?? 0,
        purchase_total_qty:    purchaseInfo?.totalQty   ?? 0,
        purchase_total_amount: purchaseInfo?.totalAmount ?? 0,
        purchase_count:        purchaseInfo?.count      ?? 0,
        first_purchase_date:   purchaseInfo?.firstDate  ?? null,
        min_order: Number(prod?.min_order ?? 0) || 0,
        location: prod?.location ?? null,
        // 2026-09-08 · CRITICAL-1 · 판매대시보드 판매중 필터 정상화
        sale_status: prod?.sale_status ?? null,
      };
    });
    const sign = dir === "asc" ? 1 : -1;
    // 2026-10-04 · schema rename · sort key → 신규 field 이름
    const sorted = rows.sort((a, b) => {
      switch (sort) {
        case "purchase": return sign * (a.buy_stock     - b.buy_stock);
        case "amount":   return sign * (a.sale_price    - b.sale_price);
        case "closing":  return sign * (a.closing_stock - b.closing_stock);
        case "sale":
        default:         return sign * (a.sale_stock    - b.sale_stock);
      }
    });
    const payload = { snapshot_date: targetDate, period_type: targetPeriodType, dates, dates_with_period, rows: sorted.slice(0, limit) };
    res.json(payload);
  }
}));

export default router;
