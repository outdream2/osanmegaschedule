// GET /api/stock-manage/top-sales
// 재고 스냅샷의 상품별 흐름 — season/months/single-snapshot 3가지 모드
import { Router } from "express";
import { supabase } from "../../../../src/supabase/client";
import { resolveSeasonMonths } from "../../settings/settings";
import { fetchAllWithRange } from "../../../utils/supabaseFetchAll";
import { asyncHandler } from "../../../middleware/asyncHandler";
import { HttpError } from "../../../middleware/errorHandler";
import { inSeasonMonths, topSalesCache, TOP_SALES_TTL } from "./helpers";

const router = Router();

router.get("/api/stock-manage/top-sales", asyncHandler(async (req, res) => {
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
  // 2026-07-29 · Phase 2 · Lazy Loading
  const skipPurchase = String(req.query.skip_purchase ?? "").trim() === "1";

  const cacheKey = `${dateParam}::${monthsParam}::${seasonParam}::${sort}::${dir}::${limit}::${supplierFilter}::${supplierCodeFilter}::${skipPurchase ? "basic" : "full"}`;
  const cached = topSalesCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    res.setHeader("X-Cache", "HIT");
    return res.json(cached.data);
  }

  {
    // ── season 지정 시: 년도 무관 · 해당 월들의 전 데이터 aggregation ──
    if (seasonMonths) {
      const rawRows: any[] = [];
      const PAGE = 1000;
      let from = 0;
      while (true) {
        let q = supabase
          .from("stock_history")
          .select("snapshot_date, product_code, product_name, supplier_name, supplier_code, spec, opening_stock, purchase_qty, sale_qty, disposal_qty, closing_stock, total_amount")
          .order("snapshot_date", { ascending: true });
        if (supplierFilter)     q = q.eq("supplier_name", supplierFilter);
        if (supplierCodeFilter) q = q.eq("supplier_code", supplierCodeFilter);
        const { data, error } = await q.range(from, from + PAGE - 1);
        if (error) {
          if (/relation|does not exist/i.test(error.message)) return res.json({ snapshot_date: null, dates: [], rows: [] });
          throw new HttpError(500, error.message, "DB_ERROR");
        }
        if (!data || data.length === 0) break;
        for (const r of data) if (inSeasonMonths(String(r.snapshot_date ?? ""), seasonMonths)) rawRows.push(r);
        if (data.length < PAGE) break;
        from += PAGE;
      }

      // products 매핑 (숨김 제외)
      // 2026-08-31 · #71 fix · location + real_map 추가
      const codesRaw = Array.from(new Set(rawRows.map(r => String(r.product_code ?? "").trim()).filter(Boolean)));
      const productMap = new Map<string, { optimal_stock: number; sale_price: number; purchase_price: number; current_stock: number; min_order: number; location: string | null; real_map: string | null }>();
      const hiddenSet = new Set<string>();
      try {
        const CHUNK = 500;
        for (let i = 0; i < codesRaw.length; i += CHUNK) {
          const chunk = codesRaw.slice(i, i + CHUNK);
          const { data: page } = await supabase
            .from("products")
            .select("product_code, optimal_stock, sale_price, purchase_price, current_stock, min_order, hidden, location, display_location, real_map")
            .in("product_code", chunk);
          for (const p of page ?? []) {
            const code = String(p.product_code ?? "").trim();
            if (!code) continue;
            if (p.hidden === true) { hiddenSet.add(code); continue; }
            productMap.set(code, {
              optimal_stock:  Number(p.optimal_stock  ?? 0) || 0,
              sale_price:     Number(p.sale_price     ?? 0) || 0,
              purchase_price: Number(p.purchase_price ?? 0) || 0,
              current_stock:  Number(p.current_stock  ?? 0) || 0,
              min_order:      Number(p.min_order      ?? 0) || 0,
              location:  (String(p.location ?? p.display_location ?? "").trim() || null),
              real_map:  (String(p.real_map ?? "").trim() || null),
            });
          }
        }
      } catch { /* silent */ }

      const byCode = new Map<string, any>();
      let latestSnapshot = "";
      const snapshotSet = new Set<string>();
      for (const r of rawRows) {
        const code = String(r.product_code ?? "").trim();
        if (!code || hiddenSet.has(code)) continue;
        const snap = String(r.snapshot_date ?? "");
        snapshotSet.add(snap);
        if (snap > latestSnapshot) latestSnapshot = snap;
        if (!byCode.has(code)) {
          const prod = productMap.get(code);
          byCode.set(code, {
            product_code:  code,
            product_name:  String(r.product_name ?? code),
            supplier:      r.supplier_name ?? null,
            spec:          r.spec ?? null,
            opening_stock: Number(r.opening_stock ?? 0) || 0,
            purchase_qty:  0,
            sale_qty:      0,
            disposal_qty:  0,
            closing_stock: Number(r.closing_stock ?? 0) || 0,
            total_amount:  0,
            first_snap:    snap,
            last_snap:     snap,
            optimal_stock: prod?.optimal_stock ?? 0,
            sale_price:    prod?.sale_price ?? 0,
            purchase_price:prod?.purchase_price ?? 0,
            current_stock: prod?.current_stock ?? 0,
            last_purchase_date:  null as string | null,
            first_purchase_date: null as string | null,
            purchase_count: 0,
            min_order:     prod?.min_order ?? 0,
            location:      prod?.location ?? null,
            real_map:      prod?.real_map ?? null,
          });
        }
        const agg = byCode.get(code)!;
        agg.purchase_qty += Number(r.purchase_qty ?? 0) || 0;
        agg.sale_qty     += Number(r.sale_qty ?? 0) || 0;
        agg.disposal_qty += Number(r.disposal_qty ?? 0) || 0;
        agg.total_amount += Number(r.total_amount ?? 0) || 0;
        if (snap < agg.first_snap) {
          agg.first_snap = snap;
          agg.opening_stock = Number(r.opening_stock ?? 0) || 0;
        }
        if (snap > agg.last_snap) {
          agg.last_snap = snap;
          agg.closing_stock = Number(r.closing_stock ?? 0) || 0;
        }
        // 2026-07-29 · 매입일 stock_history fallback 완전 제거 · 아래 purchase_details 조인만 신뢰
      }

      // ═══ purchase_details 조인 (season 모드) ═══
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
              const cur = purchaseInfoMap.get(code) ?? { lastDate: null, firstDate: null, totalQty: 0, totalAmount: 0, lastAmount: 0, dateSet: new Set<string>() };
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
          }
        }
        console.log(`[top-sales/season] purchase_details 조인: ${purchaseInfoMap.size}개 상품 · distinct date 카운트`);
      } catch (e: any) {
        console.warn(`[top-sales/season] purchase_details 조인 실패:`, e?.message);
      }

      const aggRows = Array.from(byCode.values()).map(({ first_snap: _fs, last_snap: _ls, ...rest }) => rest);
      const sign = dir === "asc" ? 1 : -1;
      const sorted = aggRows.sort((a, b) => {
        switch (sort) {
          case "purchase": return sign * (a.purchase_qty  - b.purchase_qty);
          case "amount":   return sign * (a.sale_price    - b.sale_price);
          case "closing":  return sign * (a.closing_stock - b.closing_stock);
          case "sale":
          default:         return sign * (a.sale_qty      - b.sale_qty);
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
      topSalesCache.set(cacheKey, { data: payload, expiresAt: Date.now() + TOP_SALES_TTL });
      res.setHeader("X-Cache", "MISS");
      return res.json(payload);
    }

    // ── months 지정 시: 범위 aggregation 모드 ──
    if (monthsParam > 0) {
      // 2026-07-16 fix: 정확히 N개월 back
      const today = new Date();
      const cutoff = new Date(today.getFullYear(), today.getMonth() - monthsParam, today.getDate());
      const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

      // 2026-07-29 · Phase 3 (A) · Supabase RPC get_stock_flow 사용 · 단일 SQL 조인
      if (!supplierFilter && !supplierCodeFilter) {
        try {
          const t0 = Date.now();
          const { data: rpcData, error: rpcError } = await supabase.rpc("get_stock_flow", {
            p_from: cutoffStr,
            p_to: todayStr,
          });
          if (!rpcError && Array.isArray(rpcData)) {
            const rpcMs = Date.now() - t0;
            const rows = rpcData.map((r: any) => ({
              product_code:  r.product_code,
              product_name:  r.product_name,
              supplier:      r.supplier,
              spec:          r.spec,
              opening_stock: r.opening_stock,
              purchase_qty:  r.purchase_qty,
              sale_qty:      r.sale_qty,
              disposal_qty:  r.disposal_qty,
              closing_stock: r.closing_stock,
              total_amount:  r.total_amount,
              optimal_stock: r.optimal_stock,
              sale_price:    r.sale_price,
              purchase_price:r.purchase_price,
              current_stock: r.current_stock,
              min_order:     r.min_order,
              last_purchase_date:    r.last_purchase_date,
              first_purchase_date:   r.first_purchase_date,
              purchase_count:        r.purchase_count ?? 0,
              purchase_total_qty:    r.purchase_total_qty ?? 0,
              purchase_total_amount: r.purchase_total_amount ?? 0,
              sale_qty_month:  r.sale_qty_month  ?? 0,
              sale_amount_month: r.sale_amount_month ?? 0,
              last_purchase_qty: r.last_purchase_qty ?? null,
              // 2026-08-31 · #71 · RPC 미포함 · 아래 batch fetch 로 주입
              location: null as string | null,
              real_map: null as string | null,
            }));
            // 2026-07-30 · 반품필요 리스트 · sale_qty_month · last_purchase_qty
            // 2026-08-03 · 60d/90d 추가
            const needsMonthBoost = rows.length > 0 && rpcData[0].sale_qty_month === undefined;
            const needsExtended = rows.length > 0;
            try {
              const targetCodes = needsExtended ? rows.slice(0, limit).map(r => String(r.product_code ?? "").trim()).filter(Boolean) : [];
              if (targetCodes.length > 0) {
                const lastQtyMap = new Map<string, number>();
                const CHUNK = 200; const PAGE = 1000;
                if (needsMonthBoost) {
                  for (let i = 0; i < targetCodes.length; i += CHUNK) {
                    const chunk = targetCodes.slice(i, i + CHUNK);
                    let fromRow = 0;
                    while (true) {
                      const { data: pd } = await supabase
                        .from("purchase_details")
                        .select("product_code, purchase_date, quantity")
                        .in("product_code", chunk)
                        .order("purchase_date", { ascending: false })
                        .range(fromRow, fromRow + PAGE - 1);
                      if (!pd || pd.length === 0) break;
                      for (const r of pd) {
                        const code = String(r.product_code ?? "").trim();
                        if (!code || lastQtyMap.has(code)) continue;
                        lastQtyMap.set(code, Number(r.quantity ?? 0) || 0);
                      }
                      if (pd.length < PAGE) break;
                      fromRow += PAGE;
                    }
                  }
                }
                // ── 2) stock_history · 최근 90일 · sale_qty + total_amount 윈도우
                const _now = Date.now();
                const day30 = new Date(_now - 30 * 86400 * 1000).toISOString().slice(0, 10);
                const day60 = new Date(_now - 60 * 86400 * 1000).toISOString().slice(0, 10);
                const day90 = new Date(_now - 90 * 86400 * 1000).toISOString().slice(0, 10);
                const salesWindowMap = new Map<string, { qty30: number; amt30: number; qty60: number; qty90: number }>();
                for (let i = 0; i < targetCodes.length; i += CHUNK) {
                  const chunk = targetCodes.slice(i, i + CHUNK);
                  let fromRow = 0;
                  while (true) {
                    const { data: sh } = await supabase
                      .from("stock_history")
                      .select("product_code, sale_qty, total_amount, snapshot_date")
                      .in("product_code", chunk)
                      .gte("snapshot_date", day90)
                      .lte("snapshot_date", todayStr)
                      .range(fromRow, fromRow + PAGE - 1);
                    if (!sh || sh.length === 0) break;
                    for (const r of sh) {
                      const code = String(r.product_code ?? "").trim();
                      if (!code) continue;
                      const snap = String(r.snapshot_date ?? "");
                      const q = Number(r.sale_qty ?? 0) || 0;
                      const a = Number(r.total_amount ?? 0) || 0;
                      const cur = salesWindowMap.get(code) ?? { qty30: 0, amt30: 0, qty60: 0, qty90: 0 };
                      cur.qty90 += q;
                      if (snap >= day60) cur.qty60 += q;
                      if (snap >= day30) { cur.qty30 += q; cur.amt30 += a; }
                      salesWindowMap.set(code, cur);
                    }
                    if (sh.length < PAGE) break;
                    fromRow += PAGE;
                  }
                }
                // 3) rows 에 필드 주입
                for (const r of rows) {
                  const code = String(r.product_code ?? "").trim();
                  if (needsMonthBoost) {
                    r.last_purchase_qty = lastQtyMap.get(code) ?? null;
                  }
                  const w = salesWindowMap.get(code);
                  if (needsMonthBoost) {
                    r.sale_qty_month    = w?.qty30 ?? 0;
                    r.sale_amount_month = w?.amt30 ?? 0;
                  }
                  (r as any).sale_qty_60d = w?.qty60 ?? 0;
                  (r as any).sale_qty_90d = w?.qty90 ?? 0;
                }
              }
            } catch (e: any) {
              console.warn(`[top-sales/rpc] boost fetch 실패:`, e?.message);
            }
            // 2026-08-31 · #71 · location + real_map 배치 조회
            try {
              const targetCodes = rows.slice(0, limit).map(r => String(r.product_code ?? "").trim()).filter(Boolean);
              if (targetCodes.length > 0) {
                const locMap = new Map<string, { location: string | null; real_map: string | null }>();
                const CHUNK = 500;
                for (let i = 0; i < targetCodes.length; i += CHUNK) {
                  const chunk = targetCodes.slice(i, i + CHUNK);
                  const { data: page } = await supabase
                    .from("products")
                    .select("product_code, location, display_location, real_map")
                    .in("product_code", chunk);
                  for (const p of page ?? []) {
                    const code = String(p.product_code ?? "").trim();
                    if (!code) continue;
                    locMap.set(code, {
                      location: (String(p.location ?? p.display_location ?? "").trim() || null),
                      real_map: (String(p.real_map ?? "").trim() || null),
                    });
                  }
                }
                for (const r of rows) {
                  const code = String(r.product_code ?? "").trim();
                  const info = locMap.get(code);
                  if (info) { r.location = info.location; r.real_map = info.real_map; }
                }
              }
            } catch (e: any) {
              console.warn(`[top-sales/rpc] location fetch 실패:`, e?.message);
            }
            const sign = dir === "asc" ? 1 : -1;
            const sorted = rows.sort((a: any, b: any) => {
              switch (sort) {
                case "purchase": return sign * (a.purchase_qty  - b.purchase_qty);
                case "amount":   return sign * (a.sale_price    - b.sale_price);
                case "closing":  return sign * (a.closing_stock - b.closing_stock);
                case "sale":
                default:         return sign * (a.sale_qty      - b.sale_qty);
              }
            });
            const payload = {
              snapshot_date: todayStr,
              period_type: null,
              months: monthsParam,
              season: null,
              dates: [],
              dates_with_period: [],
              rows: sorted.slice(0, limit),
              _rpc_ms: rpcMs,
            };
            topSalesCache.set(cacheKey, { data: payload, expiresAt: Date.now() + TOP_SALES_TTL });
            res.setHeader("X-Cache", "MISS");
            res.setHeader("X-Source", "rpc-fast");
            console.log(`[top-sales/rpc] months=${monthsParam} · ${rows.length} rows · ${rpcMs}ms`);
            return res.json(payload);
          } else if (rpcError) {
            console.warn(`[top-sales/rpc] RPC 실패 · fallback:`, rpcError.message);
          }
        } catch (e: any) {
          console.warn(`[top-sales/rpc] 예외 · fallback:`, e?.message);
        }
      }
      // fallback · 기존 로직 (supplier 필터 또는 RPC 실패 시)

      const rawRows: any[] = [];
      const PAGE = 1000;
      let from = 0;
      while (true) {
        let q = supabase
          .from("stock_history")
          .select("snapshot_date, product_code, product_name, supplier_name, spec, opening_stock, purchase_qty, sale_qty, disposal_qty, closing_stock, total_amount")
          .gte("snapshot_date", cutoffStr)
          .order("snapshot_date", { ascending: true });
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

      // products 매핑 (숨김 제외)
      // 2026-08-31 · #71 · location + real_map 추가
      const productMap = new Map<string, { optimal_stock: number; sale_price: number; purchase_price: number; current_stock: number; last_purchase_date: string | null; min_order: number; location: string | null; real_map: string | null }>();
      const hiddenSet = new Set<string>();
      try {
        const OP_PAGE = 1000;
        let opFrom = 0;
        while (true) {
          const { data: page } = await supabase
            .from("products")
            .select("product_code, optimal_stock, sale_price, purchase_price, current_stock, last_purchase_date, min_order, hidden, location, display_location, real_map")
            .range(opFrom, opFrom + OP_PAGE - 1);
          if (!page || page.length === 0) break;
          for (const p of page) {
            const code = String(p.product_code ?? "").trim();
            if (!code) continue;
            if (p.hidden === true) { hiddenSet.add(code); continue; }
            productMap.set(code, {
              optimal_stock:  Number(p.optimal_stock  ?? 0) || 0,
              sale_price:     Number(p.sale_price     ?? 0) || 0,
              purchase_price: Number(p.purchase_price ?? 0) || 0,
              current_stock:  Number(p.current_stock  ?? 0) || 0,
              last_purchase_date: p.last_purchase_date ?? null,
              min_order:      Number(p.min_order      ?? 0) || 0,
              location:  (String(p.location ?? p.display_location ?? "").trim() || null),
              real_map:  (String(p.real_map ?? "").trim() || null),
            });
          }
          if (page.length < OP_PAGE) break;
          opFrom += OP_PAGE;
        }
      } catch { /* silent */ }

      const byCode = new Map<string, any>();
      let latestSnapshot = "";
      const snapshotSet = new Set<string>();
      for (const r of rawRows) {
        const code = String(r.product_code ?? "").trim();
        if (!code || hiddenSet.has(code)) continue;
        const snap = String(r.snapshot_date ?? "");
        snapshotSet.add(snap);
        if (snap > latestSnapshot) latestSnapshot = snap;
        if (!byCode.has(code)) {
          byCode.set(code, {
            product_code:  code,
            product_name:  String(r.product_name ?? code),
            supplier:      r.supplier_name ?? null,
            spec:          r.spec ?? null,
            opening_stock: Number(r.opening_stock ?? 0) || 0,
            purchase_qty:  0,
            sale_qty:      0,
            disposal_qty:  0,
            closing_stock: Number(r.closing_stock ?? 0) || 0,
            total_amount:  0,
            first_snap:    snap,
            last_snap:     snap,
            optimal_stock: productMap.get(code)?.optimal_stock ?? 0,
            sale_price:    productMap.get(code)?.sale_price    ?? 0,
            purchase_price:productMap.get(code)?.purchase_price ?? 0,
            current_stock: productMap.get(code)?.current_stock ?? 0,
            // 2026-07-29 · 매입 관련 필드는 purchase_details 조인에서만 세팅
            last_purchase_date:  null as string | null,
            min_order:     productMap.get(code)?.min_order ?? 0,
            purchase_count: 0,
            first_purchase_date: null as string | null,
            // 2026-08-31 · #71
            location:  productMap.get(code)?.location ?? null,
            real_map:  productMap.get(code)?.real_map ?? null,
          });
        }
        const agg = byCode.get(code)!;
        agg.purchase_qty += Number(r.purchase_qty ?? 0) || 0;
        agg.sale_qty     += Number(r.sale_qty ?? 0) || 0;
        agg.disposal_qty += Number(r.disposal_qty ?? 0) || 0;
        agg.total_amount += Number(r.total_amount ?? 0) || 0;
        if (snap < agg.first_snap) {
          agg.first_snap = snap;
          agg.opening_stock = Number(r.opening_stock ?? 0) || 0;
        }
        if (snap > agg.last_snap) {
          agg.last_snap = snap;
          agg.closing_stock = Number(r.closing_stock ?? 0) || 0;
        }
      }
      // 2026-07-28 · purchase_details 조인
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
        console.log(`[top-sales/months] purchase_details 조인: ${purchaseInfoMap.size}/${codesInResult.length}개 매치 · 누락 ${missingCodes.length}개 · 1회만 매입 ${singleDate.length}개`);
        if (missingCodes.length > 0 && missingCodes.length <= 20) {
          console.log(`[top-sales/months] 누락 codes 샘플:`, missingCodes.slice(0, 10));
        }
      } catch (e: any) {
        console.warn(`[top-sales/months] purchase_details 조인 실패:`, e?.message);
      }
      // 2026-07-28 · 회전율 = 최근매입일 ~ 그 전매입일 사이 판매량
      const salesByCodeByDate = new Map<string, Map<string, { qty: number; amount: number }>>();
      for (const r of rawRows) {
        const code = String(r.product_code ?? "").trim();
        if (!code) continue;
        const snap = String(r.snapshot_date ?? "");
        if (!snap) continue;
        const q = Number(r.sale_qty ?? 0) || 0;
        const a = Number(r.total_amount ?? 0) || 0;
        if (q <= 0 && a <= 0) continue;
        const bySup = salesByCodeByDate.get(code) ?? new Map<string, { qty: number; amount: number }>();
        const prev = bySup.get(snap) ?? { qty: 0, amount: 0 };
        bySup.set(snap, { qty: prev.qty + q, amount: prev.amount + a });
        salesByCodeByDate.set(code, bySup);
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
      const sorted = aggRows.sort((a, b) => {
        switch (sort) {
          case "purchase": return sign * (a.purchase_qty  - b.purchase_qty);
          case "amount":   return sign * (a.sale_price    - b.sale_price);
          case "closing":  return sign * (a.closing_stock - b.closing_stock);
          case "sale":
          default:         return sign * (a.sale_qty      - b.sale_qty);
        }
      });
      // 2026-07-28 · 3개월 재고회전율
      const compute3mMap = new Map<string, { sale_qty_3m: number; opening_3m: number; closing_3m: number }>();
      if (monthsParam === 3) {
        for (const agg of aggRows) {
          compute3mMap.set(agg.product_code, {
            sale_qty_3m: agg.sale_qty,
            opening_3m:  agg.opening_stock,
            closing_3m:  agg.closing_stock,
          });
        }
      } else {
        const today3 = new Date();
        const cutoff3 = new Date(today3.getFullYear(), today3.getMonth() - 3, today3.getDate());
        const cutoff3Str = `${cutoff3.getFullYear()}-${String(cutoff3.getMonth() + 1).padStart(2, "0")}-${String(cutoff3.getDate()).padStart(2, "0")}`;
        try {
          const rows3: any[] = [];
          const PAGE3 = 1000;
          let from3 = 0;
          while (true) {
            let q3 = supabase.from("stock_history")
              .select("snapshot_date, product_code, opening_stock, sale_qty, closing_stock")
              .gte("snapshot_date", cutoff3Str)
              .order("snapshot_date", { ascending: true });
            if (supplierFilter)     q3 = q3.eq("supplier_name", supplierFilter);
            if (supplierCodeFilter) q3 = q3.eq("supplier_code", supplierCodeFilter);
            const { data, error } = await q3.range(from3, from3 + PAGE3 - 1);
            if (error || !data || data.length === 0) break;
            rows3.push(...data);
            if (data.length < PAGE3) break;
            from3 += PAGE3;
          }
          const by3 = new Map<string, { first_snap: string; last_snap: string; opening: number; closing: number; sale_qty: number }>();
          for (const r of rows3) {
            const code = String(r.product_code ?? "").trim();
            if (!code) continue;
            const snap = String(r.snapshot_date ?? "");
            if (!by3.has(code)) {
              by3.set(code, { first_snap: snap, last_snap: snap, opening: Number(r.opening_stock ?? 0) || 0, closing: Number(r.closing_stock ?? 0) || 0, sale_qty: 0 });
            }
            const agg3 = by3.get(code)!;
            agg3.sale_qty += Number(r.sale_qty ?? 0) || 0;
            if (snap < agg3.first_snap) { agg3.first_snap = snap; agg3.opening = Number(r.opening_stock ?? 0) || 0; }
            if (snap > agg3.last_snap)  { agg3.last_snap  = snap; agg3.closing = Number(r.closing_stock ?? 0) || 0; }
          }
          for (const [code, v] of by3) {
            compute3mMap.set(code, { sale_qty_3m: v.sale_qty, opening_3m: v.opening, closing_3m: v.closing });
          }
        } catch { /* silent */ }
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
      topSalesCache.set(cacheKey, { data: payload, expiresAt: Date.now() + TOP_SALES_TTL });
      res.setHeader("X-Cache", "MISS");
      return res.json(payload);
    }

    // ── 단일 스냅샷 모드 ──
    let targetDate = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : "";
    if (!targetDate) {
      const today = new Date();
      const dd = today.getDate();
      const currentPeriod: "early" | "mid" | "late" =
        dd <= 10 ? "early" : dd <= 20 ? "mid" : "late";
      const { data: matchPeriod } = await supabase
        .from("stock_history")
        .select("snapshot_date")
        .eq("period_type", currentPeriod)
        .order("snapshot_date", { ascending: false })
        .limit(1);
      if (matchPeriod?.[0]?.snapshot_date) {
        targetDate = matchPeriod[0].snapshot_date;
      } else {
        const { data: latest } = await supabase
          .from("stock_history")
          .select("snapshot_date")
          .order("snapshot_date", { ascending: false })
          .limit(1);
        targetDate = latest?.[0]?.snapshot_date ?? "";
      }
    }
    if (!targetDate) return res.json({ snapshot_date: null, dates: [], rows: [] });

    let dates: string[] = [];
    let dateToPeriodMap = new Map<string, string>();
    try {
      const { data: dRows } = await supabase
        .from("stock_history")
        .select("snapshot_date, period_type")
        .order("snapshot_date", { ascending: false })
        .limit(1000);
      const set = new Set<string>();
      for (const d of dRows ?? []) {
        const dt = d.snapshot_date;
        const pt = d.period_type;
        if (!dt) continue;
        if (!set.has(dt)) { set.add(dt); if (pt) dateToPeriodMap.set(dt, pt); }
      }
      dates = Array.from(set).sort((a, b) => b.localeCompare(a));
    } catch (e: any) {
      console.warn("[top-sales] dates 조회 실패, 계속:", e?.message);
    }
    const dates_with_period = dates.map(dt => ({ snapshot_date: dt, period_type: dateToPeriodMap.get(dt) ?? null }));
    const targetPeriodType = dateToPeriodMap.get(targetDate) ?? null;

    const data: any[] = [];
    const dbSortColumn: Record<string, string> = {
      sale: "sale_qty",
      purchase: "purchase_qty",
      closing: "closing_stock",
    };
    const dbCol = dbSortColumn[sort];
    if (dbCol && !supplierFilter && !supplierCodeFilter) {
      const fetchLimit = Math.max(limit * 3, 300);
      try {
        const page = await fetchAllWithRange<any>(() => supabase
          .from("stock_history")
          .select("product_code, product_name, supplier_code, supplier_name, spec, opening_stock, purchase_qty, sale_qty, disposal_qty, internal_qty, adjustment_qty, closing_stock, total_amount")
          .eq("snapshot_date", targetDate)
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
        let q = supabase
          .from("stock_history")
          .select("product_code, product_name, supplier_code, supplier_name, spec, opening_stock, purchase_qty, sale_qty, disposal_qty, internal_qty, adjustment_qty, closing_stock, total_amount")
          .eq("snapshot_date", targetDate);
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

    // products 조회 (결과 rows 의 product_code 만 in() 으로 최소 fetch)
    // 2026-08-31 · #71 · location + real_map 추가
    const productMap = new Map<string, { optimal_stock: number; sale_price: number; purchase_price: number; current_stock: number; last_purchase_date: string | null; min_order: number; location: string | null; real_map: string | null }>();
    const hiddenSet = new Set<string>();
    const codesInResult = Array.from(new Set(data.map(r => String(r.product_code ?? "").trim()).filter(Boolean)));
    try {
      const CHUNK = 500;
      for (let i = 0; i < codesInResult.length; i += CHUNK) {
        const chunk = codesInResult.slice(i, i + CHUNK);
        const { data: page } = await supabase
          .from("products")
          .select("product_code, optimal_stock, sale_price, purchase_price, current_stock, last_purchase_date, min_order, hidden, location, display_location, real_map")
          .in("product_code", chunk);
        for (const p of page ?? []) {
          const code = String(p.product_code ?? "").trim();
          if (!code) continue;
          if (p.hidden === true) { hiddenSet.add(code); continue; }
          productMap.set(code, {
            optimal_stock:  Number(p.optimal_stock  ?? 0) || 0,
            sale_price:     Number(p.sale_price     ?? 0) || 0,
            purchase_price: Number(p.purchase_price ?? 0) || 0,
            current_stock:  Number(p.current_stock  ?? 0) || 0,
            last_purchase_date: p.last_purchase_date ?? null,
            min_order:      Number(p.min_order      ?? 0) || 0,
            location:  (String(p.location ?? p.display_location ?? "").trim() || null),
            real_map:  (String(p.real_map ?? "").trim() || null),
          });
        }
      }
    } catch (e: any) {
      console.warn("[top-sales] products fetch 실패:", e?.message);
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
      console.log(`[top-sales] purchase_details 조인: ${purchaseInfoMap.size}개 상품 · distinct date 카운트`);
    } catch (e: any) {
      console.warn("[top-sales] purchase_details 조인 실패 (계속 진행):", e?.message);
    }

    // 2026-07-29 · 매입이력 필드는 무조건 purchase_details 만 사용
    const rows = (data ?? []).filter(r => !hiddenSet.has(String(r.product_code ?? ""))).map(r => {
      const prod = productMap.get(String(r.product_code ?? ""));
      const purchaseInfo = purchaseInfoMap.get(String(r.product_code ?? ""));
      return {
        product_code:   String(r.product_code ?? ""),
        product_name:   String(r.product_name ?? r.product_code ?? ""),
        supplier:       r.supplier_name ?? null,
        spec:           r.spec ?? null,
        opening_stock:  Number(r.opening_stock  ?? 0) || 0,
        purchase_qty:   Number(r.purchase_qty   ?? 0) || 0,
        sale_qty:       Number(r.sale_qty       ?? 0) || 0,
        disposal_qty:   Number(r.disposal_qty   ?? 0) || 0,
        internal_qty:   Number(r.internal_qty   ?? 0) || 0,
        adjustment_qty: Number(r.adjustment_qty ?? 0) || 0,
        closing_stock:  Number(r.closing_stock  ?? 0) || 0,
        total_amount:   Number(r.total_amount   ?? 0) || 0,
        optimal_stock:  prod?.optimal_stock  ?? 0,
        sale_price:     prod?.sale_price     ?? 0,
        purchase_price: prod?.purchase_price ?? 0,
        current_stock:  prod?.current_stock  ?? 0,
        last_purchase_date:    purchaseInfo?.lastDate  ?? null,
        purchase_last_amount:  purchaseInfo?.lastAmount  ?? 0,
        purchase_total_qty:    purchaseInfo?.totalQty    ?? 0,
        purchase_total_amount: purchaseInfo?.totalAmount ?? 0,
        purchase_count:        purchaseInfo?.count       ?? 0,
        first_purchase_date:   purchaseInfo?.firstDate   ?? null,
        min_order: Number(prod?.min_order ?? 0) || 0,
        // 2026-08-31 · #71
        location: prod?.location ?? null,
        real_map: prod?.real_map ?? null,
      };
    });
    const sign = dir === "asc" ? 1 : -1;
    const sorted = rows.sort((a, b) => {
      switch (sort) {
        case "purchase": return sign * (a.purchase_qty  - b.purchase_qty);
        case "amount":   return sign * (a.sale_price    - b.sale_price);
        case "closing":  return sign * (a.closing_stock - b.closing_stock);
        case "sale":
        default:         return sign * (a.sale_qty      - b.sale_qty);
      }
    });
    const payload = { snapshot_date: targetDate, period_type: targetPeriodType, dates, dates_with_period, rows: sorted.slice(0, limit) };
    topSalesCache.set(cacheKey, { data: payload, expiresAt: Date.now() + TOP_SALES_TTL });
    res.setHeader("X-Cache", "MISS");
    res.json(payload);
  }
}));

export default router;
