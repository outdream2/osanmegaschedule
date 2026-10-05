// 2026-09-25 · #1 · 발주매입 대조 시스템 · 서버 API (사용자 지시)
//   목적:
//     · 발주 (order_requests, status='ordered'|'matched') 와
//       매입 (purchase_details, 같은 상품/공급사/기간) 을 자동 매칭
//     · 결과를 order_requests 신규 컬럼에 저장 (match_status·matched_at·matched_by·exception_type·exception_note)
//
//   대원칙 준수:
//     · asyncHandler + HttpError · Zod validateBody
//     · Cache-Control: no-store (발주 대원칙 · feedback_order_no_cache_2026-09-11)
//     · JOIN 조회 · 파생·스냅샷 X · 매칭 결과 5개 컬럼만 저장
//     · 단일 endpoint · 신규만 · 기존 무변경
//     · authorize(1) · 로그인 필수
//
//   매칭 규칙 (사용자 default):
//     1. 수량 · 정확 일치 (합산 부분 배송 허용)
//     2. 단가 · ±1% 오차 허용
//     3. 매칭 기간 · 발주일 (sent_at) ~ +7일
//     4. 부분 배송 · 허용 (1 발주 = N 매입 합산)
//     5. 초과 배송 · exception (qty_over)
//     6. 미발주 매입 · unregistered 섹션
//     7. Undo · match_status = null
//
//   Endpoints:
//     GET  /api/order-purchase-match?days=7
//     GET  /api/order-purchase-match/order/:order_number?days=7   (2026-09-25 · 사용자 정정 · 단일 발주 매칭 · OrderPurchaseMatchTab 오른쪽 패널 재사용)
//     POST /api/order-purchase-match/:order_id/confirm

import { Router } from "express";
import { supabase } from "../../../src/supabase/client";
import { asyncHandler } from "../../middleware/asyncHandler";
import { HttpError, badRequest } from "../../middleware/errorHandler";
import { authorize } from "../../middleware/requireAuth";
import { validateBody } from "../../middleware/zodValidate";
import { MatchConfirmSchema, ExceptionRequestsBulkSendSchema } from "../../../src/shared/schemas/orderPurchaseMatch";
import logger from "../../lib/logger";
import type { AuthedRequest } from "../../types/auth";
import { handleExceptionBulkSend } from "./orderPurchaseMatch.exceptionBulkSend";

const router = Router();

// ═════════════════════════════════════════════════════════════════
// 유틸
// ═════════════════════════════════════════════════════════════════

const DAY_MS = 86400 * 1000;
const PRICE_TOLERANCE = 0.01; // ±1%
const DEFAULT_MATCH_WINDOW_DAYS = 7;

interface OrderRow {
  id: number | string;
  order_number: string | null;
  order_date: string | null;
  sent_at: string | null;
  supplier: string | null;
  product_code: string;
  product_name: string | null;
  order_qty: number;
  unit_price: number | null;
  status: string | null;
  match_status: string | null;
  matched_at: string | null;
  matched_by: number | null;
  exception_type: string | null;
  exception_note: string | null;
}

interface PurchaseRow {
  id: number | string;
  purchase_date: string | null;
  supplier_name: string | null;
  supplier_code: string | null;
  product_code: string | null;
  product_name: string | null;
  quantity: number;
  unit_price: number;
  amount: number;
}

interface MatchResultRow extends OrderRow {
  purchase_matches: Array<{
    purchase_id: number | string;
    purchase_date: string | null;
    quantity: number;
    unit_price: number;
    amount: number;
    supplier_name: string | null;
  }>;
  purchase_total_qty: number;
  purchase_avg_price: number | null;
  price_diff_pct: number | null;
  auto_status: "matched" | "exception" | "unmatched";
  auto_exception_type: "qty_short" | "qty_over" | "price_diff" | "no_purchase" | null;
}

/** 매칭 판정 · 사용자 default 규칙 */
function judgeMatch(
  orderQty: number,
  orderPrice: number | null,
  purchases: PurchaseRow[],
  orderSentAt: string | null,
  windowDays: number,
): {
  auto_status: "matched" | "exception" | "unmatched";
  auto_exception_type: "qty_short" | "qty_over" | "price_diff" | "no_purchase" | null;
  purchase_total_qty: number;
  purchase_avg_price: number | null;
  price_diff_pct: number | null;
} {
  const totalQty = purchases.reduce((s, p) => s + Number(p.quantity || 0), 0);
  // amount-weighted avg price · 가중 평균
  const totalAmt = purchases.reduce((s, p) => s + Number(p.amount || 0), 0);
  const avgPrice = totalQty > 0 ? totalAmt / totalQty : null;

  const priceDiffPct =
    orderPrice != null && orderPrice > 0 && avgPrice != null
      ? Math.abs(avgPrice - orderPrice) / orderPrice
      : null;

  // 발주+windowDays 초과 여부 판정
  const now = Date.now();
  const sentAtMs = orderSentAt ? new Date(orderSentAt).getTime() : null;
  const beyondWindow =
    sentAtMs != null && Number.isFinite(sentAtMs)
      ? now - sentAtMs > windowDays * DAY_MS
      : false;

  if (purchases.length === 0) {
    // 매입 없음
    if (beyondWindow) {
      return {
        auto_status: "exception",
        auto_exception_type: "no_purchase",
        purchase_total_qty: 0,
        purchase_avg_price: null,
        price_diff_pct: null,
      };
    }
    return {
      auto_status: "unmatched",
      auto_exception_type: null,
      purchase_total_qty: 0,
      purchase_avg_price: null,
      price_diff_pct: null,
    };
  }

  // 초과 배송
  if (totalQty > orderQty) {
    return {
      auto_status: "exception",
      auto_exception_type: "qty_over",
      purchase_total_qty: totalQty,
      purchase_avg_price: avgPrice,
      price_diff_pct: priceDiffPct,
    };
  }

  // 수량 부족
  if (totalQty < orderQty) {
    if (beyondWindow) {
      return {
        auto_status: "exception",
        auto_exception_type: "qty_short",
        purchase_total_qty: totalQty,
        purchase_avg_price: avgPrice,
        price_diff_pct: priceDiffPct,
      };
    }
    return {
      auto_status: "unmatched",
      auto_exception_type: null,
      purchase_total_qty: totalQty,
      purchase_avg_price: avgPrice,
      price_diff_pct: priceDiffPct,
    };
  }

  // 수량 정확 일치 · 단가 검사
  if (priceDiffPct != null && priceDiffPct > PRICE_TOLERANCE) {
    return {
      auto_status: "exception",
      auto_exception_type: "price_diff",
      purchase_total_qty: totalQty,
      purchase_avg_price: avgPrice,
      price_diff_pct: priceDiffPct,
    };
  }

  return {
    auto_status: "matched",
    auto_exception_type: null,
    purchase_total_qty: totalQty,
    purchase_avg_price: avgPrice,
    price_diff_pct: priceDiffPct,
  };
}

// ═════════════════════════════════════════════════════════════════
// GET /api/order-purchase-match?days=7
//   대상: order_requests · status IN ('ordered', 'matched') · sent_at 최근 14일
//   각 발주 라인마다 · purchase_details 후보 조회 (같은 product_code · 공급사 · sent_at ~ sent_at+days)
//   응답: { matched, exceptions, unmatched, unregistered_purchases, counts }
// ═════════════════════════════════════════════════════════════════
router.get(
  "/api/order-purchase-match",
  authorize(1),
  asyncHandler(async (req, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    const days = Math.max(
      1,
      Math.min(30, parseInt(String(req.query.days ?? DEFAULT_MATCH_WINDOW_DAYS), 10) || DEFAULT_MATCH_WINDOW_DAYS),
    );

    // 발주 라인 조회 · status='ordered'|'matched' · sent_at 최근 14일 (window 여유)
    const lookbackDays = Math.max(14, days * 2);
    const since = new Date(Date.now() - lookbackDays * DAY_MS).toISOString();

    const { data: orderData, error: orderErr } = await supabase
      .from("order_requests")
      .select(
        [
          "id",
          "order_number",
          "order_date",
          "sent_at",
          "supplier",
          "product_code",
          "product_name",
          "order_qty",
          "unit_price",
          "status",
          "match_status",
          "matched_at",
          "matched_by",
          "exception_type",
          "exception_note",
        ].join(", "),
      )
      .in("status", ["ordered", "matched"])
      .gte("sent_at", since)
      .order("sent_at", { ascending: false });

    if (orderErr) {
      // match_status 컬럼 없으면 · 마이그레이션 안내
      if (/match_status|matched_at|exception_type|column|does not exist/i.test(orderErr.message)) {
        logger.warn(`[order-purchase-match] 컬럼 없음: ${orderErr.message}`);
        throw new HttpError(
          500,
          "order_requests 에 매칭 컬럼 (match_status·matched_at·matched_by·exception_type·exception_note) 이 없습니다. 마이그레이션을 실행해주세요.",
          "MIGRATION_REQUIRED",
        );
      }
      throw new HttpError(500, orderErr.message, "DB_ERROR");
    }

    const orders: OrderRow[] = (orderData ?? []).map((raw: unknown) => {
      const r = raw as Record<string, unknown>;
      return {
        id: (r.id as number | string),
        order_number: (r.order_number as string | null) ?? null,
        order_date: (r.order_date as string | null) ?? null,
        sent_at: (r.sent_at as string | null) ?? null,
        supplier: (r.supplier as string | null) ?? null,
        product_code: String(r.product_code ?? ""),
        product_name: (r.product_name as string | null) ?? null,
        order_qty: Number(r.order_qty ?? 0),
        unit_price: r.unit_price != null ? Number(r.unit_price) : null,
        status: (r.status as string | null) ?? null,
        match_status: (r.match_status as string | null) ?? null,
        matched_at: (r.matched_at as string | null) ?? null,
        matched_by: r.matched_by != null ? Number(r.matched_by) : null,
        exception_type: (r.exception_type as string | null) ?? null,
        exception_note: (r.exception_note as string | null) ?? null,
      };
    });

    // 후보 매입 조회 · 발주 sent_at 기준 · [sent_at, sent_at+days] 범위
    //   · product_code 기준 IN 조회 (공급사·일자 필터는 클라 후처리)
    const productCodes = Array.from(new Set(orders.map((o) => o.product_code).filter(Boolean)));
    const purchasesByCode = new Map<string, PurchaseRow[]>();

    if (productCodes.length > 0) {
      const CHUNK = 300;
      // 전체 후보 기간 · orders 중 가장 이른 sent_at ~ 가장 늦은 sent_at + days
      const sentAts = orders
        .map((o) => (o.sent_at ? new Date(o.sent_at).getTime() : null))
        .filter((v): v is number => v != null && Number.isFinite(v));
      if (sentAts.length > 0) {
        const minSent = Math.min(...sentAts);
        const maxSent = Math.max(...sentAts);
        // 2026-10-05 · 사용자 지시 · 발주일 ±N일 window (기존 [sent, sent+N] → [sent-N, sent+N])
        const fromDate = new Date(minSent - days * DAY_MS).toISOString().slice(0, 10);
        const toDate = new Date(maxSent + days * DAY_MS).toISOString().slice(0, 10);

        for (let i = 0; i < productCodes.length; i += CHUNK) {
          const chunk = productCodes.slice(i, i + CHUNK);
          const { data: pdRows, error: pdErr } = await supabase
            .from("purchase_details")
            .select("id, purchase_date, supplier_name, supplier_code, product_code, product_name, quantity, unit_price, amount")
            .in("product_code", chunk)
            .gte("purchase_date", fromDate)
            .lte("purchase_date", toDate)
            .order("purchase_date", { ascending: true });
          if (pdErr) {
            logger.warn(`[order-purchase-match] purchase_details 조회 실패 (계속): ${pdErr.message}`);
            continue;
          }
          for (const raw of pdRows ?? []) {
            const p = raw as Record<string, unknown>;
            const code = String(p.product_code ?? "");
            if (!code) continue;
            const arr = purchasesByCode.get(code) ?? [];
            arr.push({
              id: p.id as number | string,
              purchase_date: (p.purchase_date as string | null) ?? null,
              supplier_name: (p.supplier_name as string | null) ?? null,
              supplier_code: (p.supplier_code as string | null) ?? null,
              product_code: code,
              product_name: (p.product_name as string | null) ?? null,
              quantity: Number(p.quantity ?? 0),
              unit_price: Number(p.unit_price ?? 0),
              amount: Number(p.amount ?? 0),
            });
            purchasesByCode.set(code, arr);
          }
        }
      }
    }

    // 공급사명 정규화 (vendor 매칭 · 케이스/공백 무시)
    const normalize = (s: string | null | undefined): string =>
      String(s ?? "")
        .trim()
        .replace(/\s+/g, "")
        .toLowerCase();

    // 매칭 계산 + 매입 소비 추적 (unregistered 판정용)
    const consumedPurchaseIds = new Set<string>();
    const results: MatchResultRow[] = orders.map((o) => {
      const candidates = purchasesByCode.get(o.product_code) ?? [];
      const orderNorm = normalize(o.supplier);
      const sentAtMs = o.sent_at ? new Date(o.sent_at).getTime() : null;

      // 필터 · 공급사 + 기간 [sent_at, sent_at + days]
      const matched = candidates.filter((p) => {
        // 공급사 매칭 · 발주 supplier 있으면 필수 매칭 · 없으면 상품 code 만
        if (orderNorm) {
          const pNorm = normalize(p.supplier_name);
          if (pNorm && orderNorm && pNorm !== orderNorm) return false;
        }
        if (sentAtMs != null && p.purchase_date) {
          const pMs = new Date(p.purchase_date).getTime();
          if (!Number.isFinite(pMs)) return false;
          // 2026-10-05 · 사용자 지시 · 발주일 ±N일 window (기존 [sent-1, sent+N] → [sent-N, sent+N])
          if (pMs < sentAtMs - days * DAY_MS) return false;
          if (pMs > sentAtMs + days * DAY_MS) return false;
        }
        return true;
      });

      // 소비 추적 · unregistered 계산에서 제외
      for (const p of matched) consumedPurchaseIds.add(String(p.id));

      const judged = judgeMatch(o.order_qty, o.unit_price, matched, o.sent_at, days);

      return {
        ...o,
        purchase_matches: matched.map((p) => ({
          purchase_id: p.id,
          purchase_date: p.purchase_date,
          quantity: p.quantity,
          unit_price: p.unit_price,
          amount: p.amount,
          supplier_name: p.supplier_name,
        })),
        purchase_total_qty: judged.purchase_total_qty,
        purchase_avg_price: judged.purchase_avg_price,
        price_diff_pct: judged.price_diff_pct,
        auto_status: judged.auto_status,
        auto_exception_type: judged.auto_exception_type,
      };
    });

    // 사용자 판정 우선 · match_status 이미 지정된 경우 그것 유지
    //   · match_status = matched | exception → 그것으로 분류
    //   · match_status = null → auto_status 로 분류
    function effectiveStatus(r: MatchResultRow): "matched" | "exception" | "unmatched" {
      if (r.match_status === "matched") return "matched";
      if (r.match_status === "exception") return "exception";
      if (r.match_status === "unmatched") return "unmatched";
      return r.auto_status;
    }

    const matched: MatchResultRow[] = [];
    const exceptions: MatchResultRow[] = [];
    const unmatched: MatchResultRow[] = [];
    for (const r of results) {
      const s = effectiveStatus(r);
      if (s === "matched") matched.push(r);
      else if (s === "exception") exceptions.push(r);
      else unmatched.push(r);
    }

    // 미발주 매입 · 최근 7일 · consumed 아님
    const unregSince = new Date(Date.now() - 7 * DAY_MS).toISOString().slice(0, 10);
    let unregistered: PurchaseRow[] = [];
    {
      const { data: unregData, error: unregErr } = await supabase
        .from("purchase_details")
        .select("id, purchase_date, supplier_name, supplier_code, product_code, product_name, quantity, unit_price, amount")
        .gte("purchase_date", unregSince)
        .order("purchase_date", { ascending: false })
        .limit(500);
      if (unregErr) {
        logger.warn(`[order-purchase-match] unregistered 조회 실패 (계속): ${unregErr.message}`);
      } else {
        unregistered = (unregData ?? [])
          .map((raw: unknown) => raw as Record<string, unknown>)
          .filter((p) => !consumedPurchaseIds.has(String(p.id ?? "")))
          .map((p) => ({
            id: (p.id as number | string),
            purchase_date: (p.purchase_date as string | null) ?? null,
            supplier_name: (p.supplier_name as string | null) ?? null,
            supplier_code: (p.supplier_code as string | null) ?? null,
            product_code: (p.product_code as string | null) ?? null,
            product_name: (p.product_name as string | null) ?? null,
            quantity: Number(p.quantity ?? 0),
            unit_price: Number(p.unit_price ?? 0),
            amount: Number(p.amount ?? 0),
          }));
      }
    }

    return res.json({
      matched,
      exceptions,
      unmatched,
      unregistered_purchases: unregistered,
      counts: {
        matched: matched.length,
        exceptions: exceptions.length,
        unmatched: unmatched.length,
        unregistered: unregistered.length,
      },
      window_days: days,
      lookback_days: lookbackDays,
    });
  }),
);

// ═════════════════════════════════════════════════════════════════
// GET /api/order-purchase-match/order/:order_number?days=7
//   2026-09-25 · 사용자 정정 · 왼쪽=OrderHistoryTab · 오른쪽=단일 발주 매칭 상세
//   · 특정 order_number 그룹의 매칭 결과 (rows·counts·요약) 반환
//   · GET 전체 조회 로직 재사용 · 하나의 발주만 필터
//   · Cache-Control · no-store (발주 대원칙)
// ═════════════════════════════════════════════════════════════════
router.get(
  "/api/order-purchase-match/order/:order_number",
  authorize(1),
  asyncHandler(async (req, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    const orderNumber = String(req.params.order_number ?? "").trim();
    if (!orderNumber) throw badRequest("order_number 필수");

    const days = Math.max(
      1,
      Math.min(30, parseInt(String(req.query.days ?? DEFAULT_MATCH_WINDOW_DAYS), 10) || DEFAULT_MATCH_WINDOW_DAYS),
    );

    // 발주 라인 조회 · order_number 매칭
    const { data: orderData, error: orderErr } = await supabase
      .from("order_requests")
      .select(
        [
          "id",
          "order_number",
          "order_date",
          "sent_at",
          "supplier",
          "product_code",
          "product_name",
          "order_qty",
          "unit_price",
          "status",
          "match_status",
          "matched_at",
          "matched_by",
          "exception_type",
          "exception_note",
        ].join(", "),
      )
      .eq("order_number", orderNumber)
      .in("status", ["ordered", "matched"]);

    if (orderErr) {
      if (/match_status|matched_at|exception_type|column|does not exist/i.test(orderErr.message)) {
        logger.warn(`[order-purchase-match/order] 컬럼 없음: ${orderErr.message}`);
        throw new HttpError(
          500,
          "order_requests 에 매칭 컬럼이 없습니다. 마이그레이션을 실행해주세요.",
          "MIGRATION_REQUIRED",
        );
      }
      throw new HttpError(500, orderErr.message, "DB_ERROR");
    }

    const orders: OrderRow[] = (orderData ?? []).map((raw: unknown) => {
      const r = raw as Record<string, unknown>;
      return {
        id: (r.id as number | string),
        order_number: (r.order_number as string | null) ?? null,
        order_date: (r.order_date as string | null) ?? null,
        sent_at: (r.sent_at as string | null) ?? null,
        supplier: (r.supplier as string | null) ?? null,
        product_code: String(r.product_code ?? ""),
        product_name: (r.product_name as string | null) ?? null,
        order_qty: Number(r.order_qty ?? 0),
        unit_price: r.unit_price != null ? Number(r.unit_price) : null,
        status: (r.status as string | null) ?? null,
        match_status: (r.match_status as string | null) ?? null,
        matched_at: (r.matched_at as string | null) ?? null,
        matched_by: r.matched_by != null ? Number(r.matched_by) : null,
        exception_type: (r.exception_type as string | null) ?? null,
        exception_note: (r.exception_note as string | null) ?? null,
      };
    });

    if (orders.length === 0) {
      return res.json({
        order_number: orderNumber,
        rows: [],
        counts: { matched: 0, exceptions: 0, unmatched: 0 },
        window_days: days,
      });
    }

    // 후보 매입 조회 · 발주 sent_at 기준 · [sent_at - 1일, sent_at + days]
    const productCodes = Array.from(new Set(orders.map((o) => o.product_code).filter(Boolean)));
    const purchasesByCode = new Map<string, PurchaseRow[]>();

    if (productCodes.length > 0) {
      const sentAts = orders
        .map((o) => (o.sent_at ? new Date(o.sent_at).getTime() : null))
        .filter((v): v is number => v != null && Number.isFinite(v));
      if (sentAts.length > 0) {
        const minSent = Math.min(...sentAts);
        const maxSent = Math.max(...sentAts);
        const fromDate = new Date(minSent - DAY_MS).toISOString().slice(0, 10);
        const toDate = new Date(maxSent + days * DAY_MS).toISOString().slice(0, 10);

        const { data: pdRows, error: pdErr } = await supabase
          .from("purchase_details")
          .select("id, purchase_date, supplier_name, supplier_code, product_code, product_name, quantity, unit_price, amount")
          .in("product_code", productCodes)
          .gte("purchase_date", fromDate)
          .lte("purchase_date", toDate)
          .order("purchase_date", { ascending: true });
        if (pdErr) {
          logger.warn(`[order-purchase-match/order] purchase_details 조회 실패: ${pdErr.message}`);
        } else {
          for (const raw of pdRows ?? []) {
            const p = raw as Record<string, unknown>;
            const code = String(p.product_code ?? "");
            if (!code) continue;
            const arr = purchasesByCode.get(code) ?? [];
            arr.push({
              id: p.id as number | string,
              purchase_date: (p.purchase_date as string | null) ?? null,
              supplier_name: (p.supplier_name as string | null) ?? null,
              supplier_code: (p.supplier_code as string | null) ?? null,
              product_code: code,
              product_name: (p.product_name as string | null) ?? null,
              quantity: Number(p.quantity ?? 0),
              unit_price: Number(p.unit_price ?? 0),
              amount: Number(p.amount ?? 0),
            });
            purchasesByCode.set(code, arr);
          }
        }
      }
    }

    // 공급사명 정규화
    const normalize = (s: string | null | undefined): string =>
      String(s ?? "")
        .trim()
        .replace(/\s+/g, "")
        .toLowerCase();

    // 매칭 계산 · GET 전체 로직 재사용
    const results: MatchResultRow[] = orders.map((o) => {
      const candidates = purchasesByCode.get(o.product_code) ?? [];
      const orderNorm = normalize(o.supplier);
      const sentAtMs = o.sent_at ? new Date(o.sent_at).getTime() : null;

      const matched = candidates.filter((p) => {
        if (orderNorm) {
          const pNorm = normalize(p.supplier_name);
          if (pNorm && orderNorm && pNorm !== orderNorm) return false;
        }
        if (sentAtMs != null && p.purchase_date) {
          const pMs = new Date(p.purchase_date).getTime();
          if (!Number.isFinite(pMs)) return false;
          if (pMs < sentAtMs - DAY_MS) return false;
          if (pMs > sentAtMs + days * DAY_MS) return false;
        }
        return true;
      });

      const judged = judgeMatch(o.order_qty, o.unit_price, matched, o.sent_at, days);

      return {
        ...o,
        purchase_matches: matched.map((p) => ({
          purchase_id: p.id,
          purchase_date: p.purchase_date,
          quantity: p.quantity,
          unit_price: p.unit_price,
          amount: p.amount,
          supplier_name: p.supplier_name,
        })),
        purchase_total_qty: judged.purchase_total_qty,
        purchase_avg_price: judged.purchase_avg_price,
        price_diff_pct: judged.price_diff_pct,
        auto_status: judged.auto_status,
        auto_exception_type: judged.auto_exception_type,
      };
    });

    let matched = 0;
    let exceptions = 0;
    let unmatched = 0;
    for (const r of results) {
      const s = r.match_status === "matched" || r.match_status === "exception" || r.match_status === "unmatched"
        ? r.match_status
        : r.auto_status;
      if (s === "matched") matched++;
      else if (s === "exception") exceptions++;
      else unmatched++;
    }

    return res.json({
      order_number: orderNumber,
      supplier: orders[0]?.supplier ?? null,
      sent_at: orders[0]?.sent_at ?? null,
      order_date: orders[0]?.order_date ?? null,
      rows: results,
      counts: { matched, exceptions, unmatched },
      window_days: days,
    });
  }),
);

// ═════════════════════════════════════════════════════════════════
// POST /api/order-purchase-match/:order_id/confirm
//   body: { action: 'matched' | 'exception' | 'undo', exception_type?, note? }
//   authorize(1) · 로그인 필수
// ═════════════════════════════════════════════════════════════════
router.post(
  "/api/order-purchase-match/:order_id/confirm",
  authorize(1),
  validateBody(MatchConfirmSchema),
  asyncHandler(async (req, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    const orderId = String(req.params.order_id ?? "").trim();
    if (!orderId) throw badRequest("order_id 필수");

    const { action, exception_type, note } = req.body as {
      action: "matched" | "exception" | "undo";
      exception_type?: string | null;
      note?: string | null;
    };

    const userId = (req as AuthedRequest).authUser?.sub ?? null;
    const now = new Date().toISOString();

    let patch: Record<string, any>;
    if (action === "undo") {
      patch = {
        match_status: null,
        matched_at: null,
        matched_by: null,
        exception_type: null,
        exception_note: null,
      };
    } else if (action === "matched") {
      patch = {
        match_status: "matched",
        matched_at: now,
        matched_by: userId,
        exception_type: null,
        exception_note: note ?? null,
      };
    } else {
      // exception
      if (!exception_type) throw badRequest("exception_type 필수 (qty_short·qty_over·price_diff·no_purchase)");
      patch = {
        match_status: "exception",
        matched_at: now,
        matched_by: userId,
        exception_type,
        exception_note: note ?? null,
      };
    }

    const { data, error } = await supabase
      .from("order_requests")
      .update(patch)
      .eq("id", orderId)
      .select("id, match_status, matched_at, matched_by, exception_type, exception_note")
      .maybeSingle();

    if (error) {
      if (/match_status|matched_at|exception_type|column|does not exist/i.test(error.message)) {
        throw new HttpError(
          500,
          "order_requests 매칭 컬럼 미존재 · 마이그레이션 필요",
          "MIGRATION_REQUIRED",
        );
      }
      throw new HttpError(500, error.message, "DB_ERROR");
    }
    if (!data) throw new HttpError(404, `order_id=${orderId} 발주 라인이 없습니다`, "NOT_FOUND");

    logger.info(
      `[order-purchase-match] confirm · id=${orderId} · action=${action} · by=${userId ?? "?"} · type=${exception_type ?? "-"}`,
    );

    return res.json({ ok: true, id: data.id, ...patch });
  }),
);

// ═════════════════════════════════════════════════════════════════
// POST /api/order-purchase-match/exception-requests/bulk-send
//   2026-09-27 · 사용자 지시 · 발주이상 요청서 발송
//     · handler 는 orderPurchaseMatch.exceptionBulkSend.ts 로 분리 (large-file 회피)
//     · Zod 검증 · validateBody 우회 · safeParse (동일 schema 재사용)
// ═════════════════════════════════════════════════════════════════
router.post(
  "/api/order-purchase-match/exception-requests/bulk-send",
  authorize(1),
  (req, _res, next) => {
    const parsed = ExceptionRequestsBulkSendSchema.safeParse(req.body);
    if (!parsed.success) {
      const msg = parsed.error.issues
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join(" · ");
      return next(new HttpError(400, `요청 검증 실패 · ${msg}`, "VALIDATION"));
    }
    req.body = parsed.data;
    next();
  },
  asyncHandler(handleExceptionBulkSend),
);

export default router;
