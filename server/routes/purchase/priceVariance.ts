// server/routes/purchase/priceVariance.ts
// 2026-10-06 · 매입 단가변동 관리 API
//   · GET  /api/purchases/price-variance             · list (window LAG via RPC)
//   · PATCH /api/purchases/price-variance/:id/review · upsert review status
//   · GET  /api/purchases/price-variance/:id/history · expand 상세 (최근 N건)
//
// 사용자 지시:
//   · RPC via Supabase client · frontend 가 Supabase 직접 호출 금지
//   · 서버에서 LAG 계산 → 그 후 월 필터 (cross-month 보존 · RPC 안)
//   · pagination / sort / filter / search 전부 server-side

import { Router } from "express";
import { supabase } from "../../../src/supabase/client";
import { asyncHandler } from "../../middleware/asyncHandler";
import { badRequest, HttpError } from "../../middleware/errorHandler";
import { validateQuery, validateBody } from "../../middleware/zodValidate";
import {
  PriceVarianceQuerySchema,
  PriceReviewUpsertSchema,
  type PriceVarianceRow,
  type PriceVarianceListResponse,
  type PriceHistoryRow,
  type PriceHistoryResponse,
} from "../../../src/shared/schemas/priceVariance";

const router = Router();

/**
 * GET /api/purchases/price-variance
 *
 * Query:
 *   months_list, change_type, review_status, supplier_search, product_search,
 *   sort, page, page_size
 *
 * 응답:
 *   { rows: PriceVarianceRow[], total, page, page_size }
 */
router.get(
  "/api/purchases/price-variance",
  validateQuery(PriceVarianceQuerySchema),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as import("../../../src/shared/schemas/priceVariance").PriceVarianceQuery;
    const page = q.page ?? 1;
    const page_size = Math.min(q.page_size ?? 50, 200);
    const sort = q.sort ?? "recent";

    const { data, error } = await supabase.rpc("get_purchase_price_variance", {
      p_months_list: q.months_list ?? null,
      p_change_type: q.change_type ?? null,
      p_review_status: q.review_status ?? null,
      p_supplier_search: q.supplier_search ?? null,
      p_product_search: q.product_search ?? null,
      p_sort: sort,
      p_page: page,
      p_page_size: page_size,
    });
    if (error) throw new HttpError(500, `price-variance RPC 실패 · ${error.message}`);

    const list = (data ?? []) as Array<PriceVarianceRow & { total_count?: number | string; pending_count?: number | string }>;
    const total = list.length > 0 ? Number(list[0].total_count ?? 0) : 0;
    const pendingCount = list.length > 0 ? Number(list[0].pending_count ?? 0) : 0;
    const rows: PriceVarianceRow[] = list.map((r) => {
      // total_count / pending_count 제거 · 응답 contract 유지
      const { total_count: _tc, pending_count: _pc, ...rest } = r;
      void _tc; void _pc;
      return rest as PriceVarianceRow;
    });

    const payload: PriceVarianceListResponse = { rows, total, pendingCount, page, page_size };
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.json(payload);
  }),
);

/**
 * PATCH /api/purchases/price-variance/:id/review
 *
 * Body: { status, note?, reviewed_by?, reviewed_previous_*, reviewed_current_price? }
 *
 * 사용자 섹션 15 stale protection:
 *   · reviewed_previous_* / reviewed_current_price 스냅샷 저장
 *   · 다음 조회 시 현재 variance 와 다르면 effective = PENDING
 *
 * 사용자 섹션 16:
 *   · PRICE_CHANGED 전부 자동 insert 금지
 *   · 사용자 수동 처리 시에만 upsert
 */
router.patch(
  "/api/purchases/price-variance/:id/review",
  validateBody(PriceReviewUpsertSchema),
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id < 1) throw badRequest("invalid purchase_detail_id");
    const body = req.body as import("../../../src/shared/schemas/priceVariance").PriceReviewUpsert;

    const payload = {
      purchase_detail_id: id,
      status: body.status,
      note: body.note ?? null,
      reviewed_by: body.reviewed_by ?? null,
      reviewed_at: new Date().toISOString(),
      reviewed_previous_purchase_detail_id: body.reviewed_previous_purchase_detail_id ?? null,
      reviewed_previous_price: body.reviewed_previous_price ?? null,
      reviewed_current_price: body.reviewed_current_price ?? null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("purchase_price_reviews")
      .upsert(payload, { onConflict: "purchase_detail_id" })
      .select()
      .single();
    if (error) throw new HttpError(500, `review upsert 실패 · ${error.message}`);

    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.json({ ok: true, review: data });
  }),
);

/**
 * GET /api/purchases/price-variance/:id/history
 *
 * expand 전용 · 해당 purchase_detail_id 의 (product_code, supplier_code) 기반 최근 N건
 */
router.get(
  "/api/purchases/price-variance/:id/history",
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id < 1) throw badRequest("invalid purchase_detail_id");
    const limit = Math.min(Number(req.query.limit) || 10, 50);

    // 1차: 대상 row 의 product_code / supplier_code 조회
    const { data: anchor, error: anchorErr } = await supabase
      .from("purchase_details")
      .select("product_code, supplier_code")
      .eq("id", id)
      .single();
    if (anchorErr || !anchor) throw new HttpError(404, "purchase_detail not found");
    if (!anchor.product_code) throw badRequest("product_code null · history 조회 불가");
    if (!anchor.supplier_code) throw badRequest("supplier_code null · history 조회 불가");

    // 2026-10-12 · 사용자 리포트 "timeline 데이터 이상 · 가격 345,670원 등 완전히 다른 상품"
    //   · RPC `get_purchase_price_history` 가 잘못된 결과 반환 (다른 상품 섞임)
    //   · fix · RPC 폐기 + 직접 쿼리 (product_code + supplier_code 명시 WHERE)
    const { data: histRows, error: histErr } = await supabase
      .from("purchase_details")
      .select("id, purchase_date, unit_price, quantity, bm_code, row_num")
      .eq("product_code", anchor.product_code)
      .eq("supplier_code", anchor.supplier_code)
      .order("purchase_date", { ascending: false })
      .limit(limit);
    if (histErr) throw new HttpError(500, `history 조회 실패 · ${histErr.message}`);

    const rows: PriceHistoryRow[] = (histRows ?? []).map((r: any) => ({
      purchase_detail_id: Number(r.id),
      purchase_date: String(r.purchase_date ?? ""),
      unit_price: Number(r.unit_price ?? 0),
      quantity: Number(r.quantity ?? 0),
      bm_code: r.bm_code ?? null,
      row_num: r.row_num ?? null,
    }));
    const payload: PriceHistoryResponse = { rows };
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.json(payload);
  }),
);

export default router;
