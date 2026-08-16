// 2026-08-16 · asyncHandler + HttpError 프레임워크 적용
// 2026-07-28 · 상품 매입 이력 조회 API (사용자 요청)
//   목적 · 1차보정 상품명 확정 후 · 매입 DB 최근 이력 조회 → raw data 매칭 재료 제공
//   2026-08-09 · 소스 교체 · ocr_confirmed_items → purchase_details (ERP · 정답 소스)
//     사용자 원칙: "매입이력은 매입이력만 · OCR fallback 없음"
import { Router } from "express";
import { supabase } from "../../../src/supabase/client";
import { fetchAllWithRange } from "../../utils/supabaseFetchAll";
import { asyncHandler } from "../../middleware/asyncHandler";
import { HttpError } from "../../middleware/errorHandler";

const router = Router();

interface HistoryStats {
  product_code: string;
  count: number;
  latest_qty: number | null;
  latest_unit_price: number | null;
  avg_qty: number | null;
  avg_unit_price: number | null;
  min_qty: number | null;
  max_qty: number | null;
  min_unit_price: number | null;
  max_unit_price: number | null;
  latest_date: string | null;
}

// GET /api/products/purchase-history?codes=CODE1,CODE2,...&limit=5
router.get("/api/products/purchase-history", asyncHandler(async (req, res) => {
  const codesParam = String(req.query.codes ?? "").trim();
  if (!codesParam) return res.json({ history: {} });
  const codes = codesParam.split(",").map(c => c.trim()).filter(Boolean);
  if (codes.length === 0) return res.json({ history: {} });
  const perCodeLimit = Math.max(1, Math.min(50, Number(req.query.limit ?? 5) || 5));

  // 상품 코드별 최근 이력 · purchase_date desc · 각 코드당 perCodeLimit 만큼 필요
  //   Supabase 는 GROUP BY LIMIT 을 SQL 하나로 표현 어려움 · 전체 조회 후 코드별 slice
  // 2026-08-06 · Supabase 1000행 cap 우회 · fetchAllWithRange
  // 2026-08-09 · 소스 · purchase_details (ERP · 정답 소스)
  let data: any[] = [];
  try {
    data = await fetchAllWithRange<any>(() => supabase
      .from("purchase_details")
      .select("product_code, quantity, unit_price, purchase_date")
      .in("product_code", codes)
      .not("product_code", "is", null)
      .order("purchase_date", { ascending: false, nullsFirst: false }), codes.length * perCodeLimit * 3);
  } catch (e: any) {
    console.warn(`[purchase-history] 조회 실패: ${e?.message}`);
    return res.json({ history: {}, note: e?.message });
  }

  // 코드별 grouping
  const byCode = new Map<string, Array<{ qty: number; price: number; date: string | null }>>();
  for (const r of data ?? []) {
    const code = String((r as any).product_code ?? "").trim();
    if (!code) continue;
    const list = byCode.get(code) ?? [];
    if (list.length >= perCodeLimit) continue;  // 코드당 상위 N개만
    const qty = Number((r as any).quantity ?? 0);
    const price = Number((r as any).unit_price ?? 0);
    if (qty <= 0 && price <= 0) continue;
    list.push({
      qty,
      price,
      date: (r as any).purchase_date ?? null,
    });
    byCode.set(code, list);
  }

  // 각 코드별 통계 계산
  const history: Record<string, HistoryStats> = {};
  for (const code of codes) {
    const rows = byCode.get(code) ?? [];
    if (rows.length === 0) {
      history[code] = {
        product_code: code, count: 0,
        latest_qty: null, latest_unit_price: null,
        avg_qty: null, avg_unit_price: null,
        min_qty: null, max_qty: null,
        min_unit_price: null, max_unit_price: null,
        latest_date: null,
      };
      continue;
    }
    const qtys = rows.map(r => r.qty).filter(v => v > 0);
    const prices = rows.map(r => r.price).filter(v => v > 0);
    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : null;
    history[code] = {
      product_code: code,
      count: rows.length,
      latest_qty: rows[0].qty || null,
      latest_unit_price: rows[0].price || null,
      avg_qty: avg(qtys),
      avg_unit_price: avg(prices),
      min_qty: qtys.length > 0 ? Math.min(...qtys) : null,
      max_qty: qtys.length > 0 ? Math.max(...qtys) : null,
      min_unit_price: prices.length > 0 ? Math.min(...prices) : null,
      max_unit_price: prices.length > 0 ? Math.max(...prices) : null,
      latest_date: rows[0].date,
    };
  }

  res.json({ history });
}));

export default router;
