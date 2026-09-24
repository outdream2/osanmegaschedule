// server/routes/vendor/orderHistory.ts
// 2026-09-24 · #352 · 거래처 로그인 · 자기 발주이력 확인 페이지
//   · GET /api/vendor/order-history?days=90
//   · session.role === "vendor" · supplier=session.name · 자기 회사 발주만 조회
//   · 응답 구조 · /api/order-history 와 동일 (OrderHistoryTab 재사용 · 클라 스키마 통일)
//   · 매입확인·수정 없음 · 조회 전용 · 다른 vendor 데이터 노출 절대 X (권한 격리)
//
// 대원칙 · 공통 기능 = 단일 endpoint 지향 · 그러나 · 여기서는 별도 endpoint 필요
//   · 이유 · admin /api/order-history 는 authorize 없음 (로그인 필요) · 하지만 필터·집계 admin 관점
//   · vendor 는 · session.name 강제 필터 · 보안 격리 · 다른 vendor 데이터 절대 반환 X
//   · 응답 구조 동일 · UI 는 OrderHistoryTab 재사용 가능
import { Router } from "express";
import { supabase } from "../../../src/supabase/client";
import { asyncHandler } from "../../middleware/asyncHandler";
import { authorize, getSession } from "../../middleware/requireAuth";
import { HttpError, forbidden, unauthorized } from "../../middleware/errorHandler";
import logger from "../../lib/logger";

const router = Router();

// GET /api/vendor/order-history?days=90
//   · session role=vendor 만 접근 · admin/manager 는 /api/order-history 사용 (역할 분리)
//   · authorize(0) · level 0 이상 (모두 통과) · 실질 게이트는 role 검사
//   · supplier 필터 · session.name (vendor.company_name · vendor-login 시 저장)
router.get("/api/vendor/order-history", authorize(0), asyncHandler(async (req, res) => {
  // 발주 관련 · 캐시 절대 X (대원칙 · 즉시 업데이트)
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

  const session = getSession(req);
  if (!session) throw unauthorized();
  if (session.role !== "vendor") throw forbidden("거래처 세션만 사용 가능합니다");

  const supplierName = String(session.name ?? "").trim();
  if (!supplierName) {
    logger.warn(`[vendor/order-history] session.name 비어 있음 · vendor.id=${session.sub}`);
    throw new HttpError(400, "세션 정보 오류 · 재로그인 후 다시 시도");
  }

  const days = Math.max(1, Math.min(365, parseInt(String(req.query.days ?? "90")) || 90));
  const since = new Date(Date.now() - days * 86400000).toISOString();

  // status ordered · matched 둘 다 (매입확인 후에도 이력 보임)
  // supplier === session.name 강제 필터 (권한 격리 · 다른 vendor 데이터 노출 X)
  const { data, error } = await supabase
    .from("order_requests")
    .select("id, order_number, order_date, desired_arrival, supplier, supplier_contact, supplier_email, supplier_phone, product_code, product_name, current_stock, order_qty, unit_price, memo, sent_at, note, status")
    .in("status", ["ordered", "matched"])
    .eq("supplier", supplierName)
    .gte("sent_at", since)
    .order("sent_at", { ascending: false });

  if (error) {
    if (/column|does not exist|status/i.test(error.message)) {
      logger.warn(`[vendor/order-history] 컬럼 부재 · migration 필요 · ${error.message}`);
      return res.json({ orders: [], notice: "발주 이력 컬럼 마이그레이션 필요" });
    }
    logger.error(`[vendor/order-history] supabase error · supplier=${supplierName} · ${error.message}`);
    throw new HttpError(500, error.message);
  }

  // order_number GROUP · 발주서 단위
  const grouped = new Map<string, any>();
  for (const row of (data ?? []) as any[]) {
    const key = String(row.order_number ?? row.id);
    if (!grouped.has(key)) {
      grouped.set(key, {
        order_number: row.order_number,
        order_date: row.order_date,
        desired_arrival: row.desired_arrival,
        supplier: row.supplier,
        supplier_contact: row.supplier_contact,
        supplier_email: row.supplier_email,
        supplier_phone: row.supplier_phone,
        memo: row.memo,
        sent_at: row.sent_at,
        status: row.status ?? "ordered",
        items: [],
        total_qty: 0,
        total_amount: 0,
      });
    } else {
      const g = grouped.get(key);
      if (row.status === "ordered") g.status = "ordered";
    }
    const g = grouped.get(key);
    const qty = Number(row.order_qty ?? 0);
    const price = Number(row.unit_price ?? 0);
    g.items.push({
      id: row.id,
      product_code: row.product_code,
      product_name: row.product_name,
      order_qty: qty,
      unit_price: price,
      line_amount: qty * price,
      current_stock: row.current_stock,
    });
    g.total_qty += qty;
    g.total_amount += qty * price;
  }

  // products JOIN 폴백 · unit_price null/0 이면 products.purchase_price 로 · optimal_stock 병합
  const allCodes = new Set<string>();
  for (const g of grouped.values()) for (const it of g.items) if (it.product_code) allCodes.add(String(it.product_code));
  if (allCodes.size > 0) {
    try {
      const { data: prods } = await supabase.from("products").select("product_code, optimal_stock, purchase_price").in("product_code", [...allCodes]);
      const optMap = new Map<string, number | null>();
      const priceMap = new Map<string, number | null>();
      for (const p of prods ?? []) {
        const code = String((p as any).product_code ?? "").trim();
        const opt = (p as any).optimal_stock;
        const price = (p as any).purchase_price;
        optMap.set(code, opt != null ? Number(opt) : null);
        priceMap.set(code, price != null ? Number(price) : null);
      }
      for (const g of grouped.values()) {
        for (const it of g.items) {
          const code = String(it.product_code ?? "").trim();
          it.optimal_stock = optMap.get(code) ?? null;
          const savedPrice = Number(it.unit_price ?? 0);
          if (!savedPrice || savedPrice <= 0) {
            const currentPrice = priceMap.get(code) ?? 0;
            it.unit_price = currentPrice;
            it.line_amount = Number(it.order_qty ?? 0) * currentPrice;
          }
        }
        g.total_amount = g.items.reduce((sum: number, it: { line_amount?: number }) => sum + Number(it.line_amount ?? 0), 0);
      }
    } catch (e: unknown) {
      logger.warn(`[vendor/order-history] products JOIN 실패 · ${(e as any)?.message ?? e}`);
      /* silent · optimal_stock null · unit_price 원본 유지 */
    }
  }

  const orders = [...grouped.values()].sort((a, b) => String(b.sent_at ?? "").localeCompare(String(a.sent_at ?? "")));
  logger.info(`[vendor/order-history] supplier=${supplierName} · days=${days} · orders=${orders.length}`);
  return res.json({ orders, count: orders.length });
}));

export default router;
