// 2026-08-29 · #198 Phase 2 · product_arrivals + product_arrival_items → purchase_details 완전 통합
//   · 사용자 크리티컬 원칙: "테이블 자꾸 만들지 마" · "매입 테이블에 합쳐"
//   · 원본 두 테이블은 _archive_ prefix 로 rename됨 (2주 관찰 후 DROP)
//   · 이 라우터는 · purchase_details 를 · 검수 컬럼 (verify_status · verified_by 등) 으로 활용
//   · UI 응답 형식 (arrival_date · match_count · items 등) · 유지 (그룹핑 재구성) · 회귀 방지
//   · 그룹 id · verified_at date + verified_by 조합 (예: "20260829_홍길동")
//
// Endpoints (UI 호환):
//   - POST   /api/product-arrivals · 상품입고 검수 저장 (purchase_details UPSERT)
//   - GET    /api/product-arrivals · 최근 검수 리스트 (그룹별 헤더)
//   - GET    /api/product-arrivals/compare/orders · 발주 vs 입고 비교
//   - GET    /api/product-arrivals/:id · 그룹 상세
//   - DELETE /api/product-arrivals/:id · soft unlink (verify_status/verified_by = null)

import { Router } from "express";
import { supabase } from "../../../src/supabase/client";
import { authorize } from "../../middleware/requireAuth";
import { asyncHandler } from "../../middleware/asyncHandler";
import { validateBody } from "../../middleware/zodValidate";
import { badRequest, notFound, HttpError } from "../../middleware/errorHandler";
import { CreateProductArrivalSchema } from "../../../src/shared/schemas/productArrivals";

const router = Router();

// ─────────────────────────────────────────────────────────────────
// 그룹 id 유틸 · verified_at date (YYYYMMDD) + "_" + verified_by
// ─────────────────────────────────────────────────────────────────
function makeGroupId(verifiedAt: string, verifiedBy: string): string {
  const d = new Date(verifiedAt);
  const yyyymmdd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `${yyyymmdd}_${verifiedBy}`;
}

function parseGroupId(id: string): { dateStr: string; verifiedBy: string } | null {
  const m = /^(\d{8})_(.+)$/.exec(String(id));
  if (!m) return null;
  const [, ymd, verifiedBy] = m;
  const dateStr = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
  return { dateStr, verifiedBy };
}

// ─────────────────────────────────────────────────────────────────
// POST /api/product-arrivals · 상품입고 검수 저장
//   · items → purchase_details UPSERT
//   · 이미 매입에 있으면 (같은 date+code+supplier+qty+amount) · verify_status 만 UPDATE
//   · 없으면 · INSERT (신규 매입 · 수동 검수)
// ─────────────────────────────────────────────────────────────────
// 2026-08-29 · #201 BUG-2 · POST authorize(3) 추가 · 상품입고 검수 · 매입 원본 오염 방지
router.post("/api/product-arrivals", authorize(3), validateBody(CreateProductArrivalSchema), asyncHandler(async (req, res) => {
  const body = req.body;
  const items = body.items;

  const checked_by = body.checked_by || "익명";
  const _final_decision = body.final_decision || null;
  const _note = body.note || null;
  void _final_decision; void _note;

  const now = new Date();
  const todayISO = now.toISOString();
  const todayDate = todayISO.split("T")[0]; // YYYY-MM-DD

  // 카운트 (응답 UI 용)
  let match = 0, mismatch = 0, expiring = 0, totalQty = 0;
  const supplierSet = new Set<string>();
  for (const it of items) {
    const st = String(it.status ?? "pending");
    if (st === "match") match++;
    else if (st === "mismatch") mismatch++;
    if (it.expiring === true) expiring++;
    totalQty += Number(it.qty ?? 0) || 0;
    if (it.supplier) supplierSet.add(String(it.supplier));
  }
  const supplierSummary = [...supplierSet].join(", ").slice(0, 500);

  // status → verify_status 매핑
  const toVerifyStatus = (status: string, isExpiring: boolean): string => {
    if (status === "mismatch") return "mismatch_noted";
    if (status === "match" || (status === "pending" && isExpiring)) return "verified";
    return "pending";
  };

  // 각 item · purchase_details 조회 후 · UPSERT
  let insertedCount = 0;
  let updatedCount = 0;
  for (const it of items) {
    const productCode = String(it.product_code ?? "").trim();
    if (!productCode) continue;
    const supplierName = String(it.supplier ?? "").trim() || null;
    const qty = Number(it.qty ?? 0) || 0;
    const isExpiring = it.expiring === true;
    const verifyStatus = toVerifyStatus(String(it.status ?? "pending"), isExpiring);

    // 오늘 자 · 이미 매입 원본 있는지 확인 (OCR/엑셀 임포트 등)
    const { data: existing } = await supabase
      .from("purchase_details")
      .select("id")
      .eq("purchase_date", todayDate)
      .eq("product_code", productCode)
      .is("verify_status", null) // 아직 미검수 · OCR 원본만
      .limit(1);

    if (existing && existing.length > 0) {
      // 기존 매입 있음 → verify_* 만 UPDATE
      const { error: uErr } = await supabase
        .from("purchase_details")
        .update({
          verify_status: verifyStatus,
          verified_by: checked_by,
          verified_at: now.toISOString(),
          verified_expiring: isExpiring,
        })
        .eq("id", existing[0].id);
      if (uErr) throw new HttpError(500, `verify update 실패: ${uErr.message}`);
      updatedCount++;
    } else {
      // 신규 매입 · INSERT
      const { error: iErr } = await supabase
        .from("purchase_details")
        .insert({
          purchase_date: todayDate,
          supplier_name: supplierName,
          product_code: productCode,
          product_name: String(it.product_name ?? "").trim() || null,
          quantity: qty,
          unit_price: 0,
          amount: 0,
          verified_by: checked_by,
          verify_status: verifyStatus,
          verified_at: now.toISOString(),
          verified_expiring: isExpiring,
          imported_at: now.toISOString(),
        });
      if (iErr) throw new HttpError(500, `verify insert 실패: ${iErr.message}`);
      insertedCount++;
    }
  }

  const groupId = makeGroupId(todayISO, checked_by);
  res.json({
    ok: true,
    id: groupId,
    header: {
      id: groupId,
      arrival_date: todayISO,
      checked_by,
      total_items: items.length,
      total_qty: totalQty,
      match_count: match,
      mismatch_count: mismatch,
      expiring_count: expiring,
      supplier_summary: supplierSummary,
    },
    inserted: insertedCount,
    updated: updatedCount,
    item_count: items.length,
  });
}));

// ─────────────────────────────────────────────────────────────────
// GET /api/product-arrivals?limit=50&days=30
//   · purchase_details WHERE verify_status IS NOT NULL · 최근 days
//   · verified_at date + verified_by 로 그룹핑 · 헤더 형식 재구성 (UI 호환)
// ─────────────────────────────────────────────────────────────────
router.get("/api/product-arrivals", asyncHandler(async (req, res) => {
  const limit = Math.max(1, Math.min(500, parseInt(String(req.query.limit ?? "50"), 10) || 50));
  const days = Math.max(1, Math.min(365, parseInt(String(req.query.days ?? "30"), 10) || 30));
  const since = new Date(); since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from("purchase_details")
    .select("id, purchase_date, supplier_name, product_code, product_name, quantity, verified_by, verify_status, verified_expiring, verified_at")
    .not("verify_status", "is", null)
    .gte("verified_at", since.toISOString())
    .order("verified_at", { ascending: false })
    .limit(5000); // 그룹핑 위해 넉넉히
  if (error) throw new HttpError(500, error.message);

  const rows = data ?? [];
  // 그룹핑 · groupId 별로 헤더 집계
  const groups = new Map<string, {
    id: string;
    arrival_date: string;
    checked_by: string;
    checked_by_id: number | null;
    total_items: number;
    total_qty: number;
    match_count: number;
    mismatch_count: number;
    expiring_count: number;
    final_decision: string | null;
    supplier_summary: string;
    note: string | null;
    created_at: string;
    _suppliers: Set<string>;
  }>();

  for (const r of rows) {
    if (!r.verified_at || !r.verified_by) continue;
    const gid = makeGroupId(r.verified_at, String(r.verified_by));
    const g = groups.get(gid) ?? {
      id: gid,
      arrival_date: r.verified_at,
      checked_by: String(r.verified_by),
      checked_by_id: null,
      total_items: 0,
      total_qty: 0,
      match_count: 0,
      mismatch_count: 0,
      expiring_count: 0,
      final_decision: null,
      supplier_summary: "",
      note: null,
      created_at: r.verified_at,
      _suppliers: new Set<string>(),
    };
    g.total_items++;
    g.total_qty += Number(r.quantity ?? 0) || 0;
    if (r.verify_status === "verified" && !r.verified_expiring) g.match_count++;
    if (r.verify_status === "mismatch_noted") g.mismatch_count++;
    if (r.verified_expiring === true) g.expiring_count++;
    if (r.supplier_name) g._suppliers.add(String(r.supplier_name));
    groups.set(gid, g);
  }

  const headers = Array.from(groups.values())
    .map(g => ({
      ...g,
      supplier_summary: Array.from(g._suppliers).join(", ").slice(0, 500),
      final_decision: g.mismatch_count > 0 ? "has_mismatch" : (g.total_items > 0 ? "all_match" : null),
      _suppliers: undefined,
    }))
    .sort((a, b) => (a.arrival_date > b.arrival_date ? -1 : 1))
    .slice(0, limit);

  res.json({ rows: headers });
}));

// ─────────────────────────────────────────────────────────────────
// GET /api/product-arrivals/compare/orders?days=7
//   · 최근 발주 (order_requests) vs 검수 이력 (purchase_details verify_status IS NOT NULL)
// ─────────────────────────────────────────────────────────────────
router.get("/api/product-arrivals/compare/orders", asyncHandler(async (req, res) => {
  const days = Math.max(1, Math.min(90, parseInt(String(req.query.days ?? "7"), 10) || 7));
  const since = new Date(); since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString();

  const { data: orders, error: oErr } = await supabase
    .from("order_requests")
    .select("id, product_code, product_name, current_stock, optimal_stock, note, requested_at")
    .gte("requested_at", sinceStr)
    .order("requested_at", { ascending: false })
    .limit(1000);
  if (oErr && !/relation .* does not exist/i.test(oErr.message)) throw new HttpError(500, oErr.message);

  const { data: verifyItems } = await supabase
    .from("purchase_details")
    .select("id, purchase_date, product_code, product_name, supplier_name, quantity, verify_status, verified_by, verified_at")
    .not("verify_status", "is", null)
    .gte("verified_at", sinceStr)
    .limit(2000);

  const items = verifyItems ?? [];
  const arrivalByCode = new Map<string, { qty: number; arrivals: any[] }>();
  for (const it of items) {
    const code = String(it.product_code ?? "").trim();
    if (!code) continue;
    const cur = arrivalByCode.get(code) ?? { qty: 0, arrivals: [] };
    cur.qty += Number(it.quantity ?? 0) || 0;
    cur.arrivals.push({
      id: it.id,
      arrival_id: makeGroupId(it.verified_at ?? "", String(it.verified_by ?? "")),
      product_code: it.product_code,
      product_name: it.product_name,
      supplier: it.supplier_name,
      qty: it.quantity,
      status: it.verify_status === "mismatch_noted" ? "mismatch" : "match",
      created_at: it.verified_at,
    });
    arrivalByCode.set(code, cur);
  }

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
    arrival_count: items.length,
    rows: compareRows,
  });
}));

// ─────────────────────────────────────────────────────────────────
// GET /api/product-arrivals/:id · 그룹 상세
//   · id · groupId (YYYYMMDD_verifiedBy)
// ─────────────────────────────────────────────────────────────────
router.get("/api/product-arrivals/:id", asyncHandler(async (req, res) => {
  const parsed = parseGroupId(String(req.params.id));
  if (!parsed) throw badRequest("잘못된 group id");
  const { dateStr, verifiedBy } = parsed;
  const dayStart = new Date(`${dateStr}T00:00:00`);
  const dayEnd = new Date(`${dateStr}T23:59:59.999`);

  const { data: rows, error } = await supabase
    .from("purchase_details")
    .select("id, purchase_date, supplier_name, product_code, product_name, quantity, verify_status, verified_by, verified_at, verified_expiring")
    .not("verify_status", "is", null)
    .eq("verified_by", verifiedBy)
    .gte("verified_at", dayStart.toISOString())
    .lte("verified_at", dayEnd.toISOString())
    .order("verified_at", { ascending: true });
  if (error) throw new HttpError(500, error.message);
  if (!rows || rows.length === 0) throw notFound("not found");

  let match = 0, mismatch = 0, expiring = 0, totalQty = 0;
  const supplierSet = new Set<string>();
  const items = rows.map((r: any) => {
    totalQty += Number(r.quantity ?? 0) || 0;
    if (r.verify_status === "verified" && !r.verified_expiring) match++;
    if (r.verify_status === "mismatch_noted") mismatch++;
    if (r.verified_expiring === true) expiring++;
    if (r.supplier_name) supplierSet.add(String(r.supplier_name));
    return {
      id: r.id,
      arrival_id: req.params.id,
      product_code: r.product_code,
      product_name: r.product_name,
      supplier: r.supplier_name,
      qty: r.quantity,
      status: r.verify_status === "mismatch_noted" ? "mismatch" : "match",
      expiring: r.verified_expiring === true,
      created_at: r.verified_at,
    };
  });

  const first = rows[0];
  const header = {
    id: req.params.id,
    arrival_date: first.verified_at,
    checked_by: first.verified_by,
    checked_by_id: null,
    total_items: rows.length,
    total_qty: totalQty,
    match_count: match,
    mismatch_count: mismatch,
    expiring_count: expiring,
    final_decision: mismatch > 0 ? "has_mismatch" : "all_match",
    supplier_summary: Array.from(supplierSet).join(", ").slice(0, 500),
    note: null,
    created_at: first.verified_at,
  };

  res.json({ header, items });
}));

// ─────────────────────────────────────────────────────────────────
// DELETE /api/product-arrivals/:id · soft unlink (verify_* = null)
//   · 매입 원본 행은 유지 · verified_by · verify_status 만 null 로 · 검수 이력만 제거
// ─────────────────────────────────────────────────────────────────
router.delete("/api/product-arrivals/:id", authorize(2), asyncHandler(async (req, res) => {
  const parsed = parseGroupId(String(req.params.id));
  if (!parsed) throw badRequest("잘못된 group id");
  const { dateStr, verifiedBy } = parsed;
  const dayStart = new Date(`${dateStr}T00:00:00`);
  const dayEnd = new Date(`${dateStr}T23:59:59.999`);

  const { error } = await supabase
    .from("purchase_details")
    .update({
      verify_status: null,
      verified_by: null,
      verified_at: null,
      verified_expiring: false,
      verify_note: null,
    })
    .eq("verified_by", verifiedBy)
    .gte("verified_at", dayStart.toISOString())
    .lte("verified_at", dayEnd.toISOString());
  if (error) throw new HttpError(500, error.message);
  res.json({ ok: true });
}));

export default router;
