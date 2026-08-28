// 2026-08-16 · asyncHandler + HttpError 프레임워크 적용
// server/routes/productArrivals.ts
// 상품입고 저장·조회 · 2026-07-29 (사용자 요청)
//   - POST /api/product-arrivals · 상품입고 저장 (헤더 + 아이템 리스트)
//   - GET  /api/product-arrivals · 최근 입고 리스트
//   - GET  /api/product-arrivals/:id · 상세 (헤더 + 아이템)
//   - DELETE /api/product-arrivals/:id · 삭제

import { Router } from "express";
import { supabase } from "../../../src/supabase/client";
import { authorize } from "../../middleware/requireAuth";
import { asyncHandler } from "../../middleware/asyncHandler";
import { validateBody } from "../../middleware/zodValidate";
import { badRequest, notFound, HttpError } from "../../middleware/errorHandler";
import { CreateProductArrivalSchema } from "../../../src/shared/schemas/productArrivals";

const router = Router();

// POST /api/product-arrivals
// body: { checked_by, checked_by_id?, final_decision, items: [{product_code, product_name, supplier, qty, status}] }
router.post("/api/product-arrivals", validateBody(CreateProductArrivalSchema), asyncHandler(async (req, res) => {
  const body = req.body;
  const items = body.items;

  const checked_by = body.checked_by || "익명";
  const checked_by_id = body.checked_by_id ? Number(body.checked_by_id) || null : null;
  const final_decision = body.final_decision || null;
  const note = body.note || null;

  // 카운트 계산
  let match = 0, mismatch = 0, expiring = 0, totalQty = 0;
  const supplierSet = new Set<string>();
  for (const it of items) {
    const st = String(it.status ?? "pending");
    if (st === "match") match++;
    else if (st === "mismatch") mismatch++;
    // 2026-07-29 · 사용자 요청 · expiring 은 boolean 필드로 분리 (status 와 독립)
    if (it.expiring === true) expiring++;
    totalQty += Number(it.qty ?? 0) || 0;
    if (it.supplier) supplierSet.add(String(it.supplier));
  }
  const supplierSummary = [...supplierSet].join(", ").slice(0, 500);

  // 헤더 insert
  const { data: header, error: hErr } = await supabase
    .from("product_arrivals")
    .insert([{
      arrival_date: new Date().toISOString(),
      checked_by, checked_by_id,
      total_items: items.length,
      total_qty: totalQty,
      match_count: match,
      mismatch_count: mismatch,
      expiring_count: expiring,
      final_decision,
      supplier_summary: supplierSummary,
      note,
    }])
    .select("id, arrival_date, checked_by, checked_by_id, total_items, total_qty, match_count, mismatch_count, expiring_count, final_decision, supplier_summary, note, created_at")
    .single();
  if (hErr) throw new HttpError(500, hErr.message);

  // 아이템 bulk insert
  const arrivalId = (header as any).id;
  const itemRows = items.map(it => ({
    arrival_id: arrivalId,
    product_code: String(it.product_code ?? "").trim() || null,
    product_name: String(it.product_name ?? "").trim() || null,
    supplier:     String(it.supplier ?? "").trim() || null,
    qty:          Number(it.qty ?? 0) || 0,
    status:       String(it.status ?? "pending"),
    expiring:     it.expiring === true,
  }));
  let { error: iErr } = await supabase.from("product_arrival_items").insert(itemRows);
  // 2026-08-29 · expiring 컬럼 미존재 시 · 컬럼 제외 후 재시도 (스키마 마이그 안 된 환경 방어)
  if (iErr && /expiring/i.test(iErr.message) && /(column|schema cache|not found)/i.test(iErr.message)) {
    const itemRowsNoExpiring = itemRows.map((r) => {
      const rest: Record<string, unknown> = { ...r };
      delete rest.expiring;
      return rest;
    });
    const retry = await supabase.from("product_arrival_items").insert(itemRowsNoExpiring);
    iErr = retry.error;
  }
  if (iErr) {
    await supabase.from("product_arrivals").delete().eq("id", arrivalId);
    throw new HttpError(500, iErr.message);
  }

  res.json({ ok: true, id: arrivalId, header, item_count: itemRows.length });
}));

// GET /api/product-arrivals?limit=50&days=30
router.get("/api/product-arrivals", asyncHandler(async (req, res) => {
  const limit = Math.max(1, Math.min(500, parseInt(String(req.query.limit ?? "50"), 10) || 50));
  const days = Math.max(1, Math.min(365, parseInt(String(req.query.days ?? "30"), 10) || 30));
  const since = new Date(); since.setDate(since.getDate() - days);
  const { data, error } = await supabase
    .from("product_arrivals")
    .select("id, arrival_date, checked_by, checked_by_id, total_items, total_qty, match_count, mismatch_count, expiring_count, final_decision, supplier_summary, note, created_at")
    .gte("arrival_date", since.toISOString())
    .order("arrival_date", { ascending: false })
    .limit(limit);
  if (error) {
    if (/relation .* does not exist/i.test(error.message)) return res.json({ rows: [], warning: "product_arrivals 테이블 없음" });
    throw new HttpError(500, error.message);
  }
  res.json({ rows: data ?? [] });
}));

// GET /api/product-arrivals/compare/orders?days=7
// ⚠️ 반드시 /:id 보다 먼저 등록 — Express 는 등록 순서대로 평가하므로 compare 가 뒤에 있으면 /:id 에 가로채임
// 최근 N일 발주 vs 입고 비교 (order_requests · product_arrival_items 조인)
router.get("/api/product-arrivals/compare/orders", asyncHandler(async (req, res) => {
  const days = Math.max(1, Math.min(90, parseInt(String(req.query.days ?? "7"), 10) || 7));
  const since = new Date(); since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString();

  // 최근 발주 (order_requests)
  const { data: orders, error: oErr } = await supabase
    .from("order_requests")
    .select("id, product_code, product_name, current_stock, optimal_stock, note, requested_at")
    .gte("requested_at", sinceStr)
    .order("requested_at", { ascending: false })
    .limit(1000);
  if (oErr && !/relation .* does not exist/i.test(oErr.message)) throw new HttpError(500, oErr.message);

  // 최근 입고 아이템 (product_arrival_items · arrival_date 필터)
  const { data: arrivals } = await supabase
    .from("product_arrivals")
    .select("id, arrival_date, checked_by, supplier_summary, final_decision")
    .gte("arrival_date", sinceStr)
    .order("arrival_date", { ascending: false })
    .limit(500);
  const arrivalIds = (arrivals ?? []).map((a: any) => a.id);
  let items: any[] = [];
  if (arrivalIds.length > 0) {
    const { data: itemsData } = await supabase
      .from("product_arrival_items")
      .select("id, arrival_id, product_code, product_name, supplier, qty, status, created_at")
      .in("arrival_id", arrivalIds);
    items = itemsData ?? [];
  }
  // 상품코드별 · 총 입고량 계산
  const arrivalByCode = new Map<string, { qty: number; arrivals: any[] }>();
  for (const it of items) {
    const code = String(it.product_code ?? "").trim();
    if (!code) continue;
    const cur = arrivalByCode.get(code) ?? { qty: 0, arrivals: [] };
    cur.qty += Number(it.qty ?? 0) || 0;
    cur.arrivals.push(it);
    arrivalByCode.set(code, cur);
  }
  // 발주별 · 입고 매칭
  const compareRows = (orders ?? []).map((o: any) => {
    const code = String(o.product_code ?? "").trim();
    const arrival = code ? arrivalByCode.get(code) : null;
    const orderQty = Number(o.qty ?? o.request_qty ?? 0) || 0;
    const arrivedQty = arrival?.qty ?? 0;
    const match = arrivedQty > 0 && arrivedQty >= orderQty;
    const partial = arrivedQty > 0 && arrivedQty < orderQty;
    return {
      order_id: o.id,
      product_code: code,
      product_name: o.product_name ?? o.note ?? "",
      supplier: o.supplier ?? o.assigned_staff_name ?? "",
      assigned_staff_id: o.assigned_staff_id ?? null,
      assigned_staff_name: o.assigned_staff_name ?? "",
      requested_at: o.requested_at,
      order_qty: orderQty,
      arrived_qty: arrivedQty,
      status: match ? "match" : partial ? "partial" : "missing",
      arrival_items: arrival?.arrivals ?? [],
    };
  });
  res.json({
    days,
    order_count: (orders ?? []).length,
    arrival_count: (arrivals ?? []).length,
    rows: compareRows,
  });
}));

// GET /api/product-arrivals/:id
// ⚠️ /:id 는 반드시 /compare/orders 보다 뒤에 등록
router.get("/api/product-arrivals/:id", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) throw badRequest("잘못된 id");
  const { data: header, error: hErr } = await supabase
    .from("product_arrivals")
    .select("id, arrival_date, checked_by, checked_by_id, total_items, total_qty, match_count, mismatch_count, expiring_count, final_decision, supplier_summary, note, created_at")
    .eq("id", id)
    .maybeSingle();
  if (hErr) throw new HttpError(500, hErr.message);
  if (!header) throw notFound("not found");
  const { data: items, error: iErr } = await supabase
    .from("product_arrival_items")
    .select("id, arrival_id, product_code, product_name, supplier, qty, status, created_at")
    .eq("arrival_id", id)
    .order("id", { ascending: true });
  if (iErr) throw new HttpError(500, iErr.message);
  res.json({ header, items: items ?? [] });
}));

// DELETE /api/product-arrivals/:id
router.delete("/api/product-arrivals/:id", authorize(2), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) throw badRequest("잘못된 id");
  const { error } = await supabase.from("product_arrivals").delete().eq("id", id);
  if (error) throw new HttpError(500, error.message);
  res.json({ ok: true });
}));

export default router;
