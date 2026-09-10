// server/routes/settings/events.ts
// 2026-09-10 · #52·#54 · 통계 설정 · 계절·이벤트 관리 · CRUD + 오늘 활성 조회
//   · events + event_products · FK CASCADE · 정합성 완비
import { Router } from "express";
import { supabase } from "../../../src/supabase/client";
import { asyncHandler } from "../../middleware/asyncHandler";
import { authorize } from "../../middleware/requireAuth";
import { badRequest, HttpError } from "../../middleware/errorHandler";

const router = Router();

const VALID_TYPES = ["spring", "summer", "fall", "winter", "holiday", "school", "custom"] as const;

// ═══════════════════════════════════════════════════════════
// GET /api/events · 이벤트 목록 · type · 오늘 기준 필터 옵션
// ═══════════════════════════════════════════════════════════
router.get("/api/events", asyncHandler(async (req, res) => {
  const type = String(req.query.type ?? "").trim();
  const activeOnly = String(req.query.active ?? "").trim() === "1";
  const today = new Date().toISOString().slice(0, 10);

  let q = supabase.from("events").select("*").order("start_date", { ascending: true, nullsFirst: false });
  if (type && (VALID_TYPES as readonly string[]).includes(type)) q = q.eq("type", type);
  if (activeOnly) {
    q = q.or(`and(start_date.lte.${today},end_date.gte.${today}),recurring.eq.true`);
  }
  const { data, error } = await q;
  if (error) throw new HttpError(500, error.message, "DB_ERROR");
  res.json({ rows: data ?? [] });
}));

// ═══════════════════════════════════════════════════════════
// GET /api/events/today · 오늘 활성/임박 이벤트 + 매핑 상품 통합
//   · 계절 (recurring=true · type in spring/summer/fall/winter) · 오늘 계절 자동 판정
//   · 이벤트 · start_date ≤ today+30 · end_date ≥ today
// ═══════════════════════════════════════════════════════════
router.get("/api/events/today", asyncHandler(async (_req, res) => {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const month = now.getMonth() + 1;
  const currentSeason =
    month >= 3 && month <= 5 ? "spring" :
    month >= 6 && month <= 8 ? "summer" :
    month >= 9 && month <= 11 ? "fall" : "winter";

  // 활성 이벤트 · 계절 (recurring) or 임박 (30일 이내)
  const in30 = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);
  const { data: events, error: eErr } = await supabase
    .from("events")
    .select("*")
    .or(`and(recurring.eq.true,type.eq.${currentSeason}),and(start_date.lte.${in30},end_date.gte.${today})`)
    .order("start_date", { ascending: true, nullsFirst: false });
  if (eErr) throw new HttpError(500, eErr.message, "DB_ERROR");

  const eventList = events ?? [];
  const eventIds = eventList.map(e => e.id);

  // event_products · 매핑 상품 · JOIN products (name · category · current_stock · optimal_stock 등)
  let productsMap: Record<number, any[]> = {};
  if (eventIds.length > 0) {
    const { data: ep } = await supabase
      .from("event_products")
      .select("event_id, product_code")
      .in("event_id", eventIds);
    const rows = ep ?? [];
    const codes = Array.from(new Set(rows.map(r => r.product_code)));

    const productInfo = new Map<string, any>();
    if (codes.length > 0) {
      const CHUNK = 500;
      for (let i = 0; i < codes.length; i += CHUNK) {
        const chunk = codes.slice(i, i + CHUNK);
        const { data: prods } = await supabase
          .from("products")
          .select("product_code, product_name, category, current_stock, optimal_stock, purchase_price, sale_price, supplier, sale_status, hidden")
          .in("product_code", chunk);
        for (const p of prods ?? []) {
          if (p.hidden === true) continue;
          productInfo.set(p.product_code, p);
        }
      }
    }
    for (const row of rows) {
      const p = productInfo.get(row.product_code);
      if (!p) continue;
      if (!productsMap[row.event_id]) productsMap[row.event_id] = [];
      productsMap[row.event_id].push(p);
    }
  }

  const enriched = eventList.map(e => ({
    ...e,
    products: productsMap[e.id] ?? [],
    d_day: e.start_date ? Math.ceil((new Date(e.start_date).getTime() - now.getTime()) / 86400000) : null,
  }));

  res.json({ today, current_season: currentSeason, events: enriched });
}));

// ═══════════════════════════════════════════════════════════
// POST /api/events · 이벤트 신규 등록 (관리자 level ≥ 9)
// ═══════════════════════════════════════════════════════════
router.post("/api/events", authorize(9), asyncHandler(async (req, res) => {
  const b = req.body ?? {};
  const name = String(b.name ?? "").trim();
  const type = String(b.type ?? "").trim();
  const start_date = b.start_date ? String(b.start_date).trim() : null;
  const end_date = b.end_date ? String(b.end_date).trim() : null;
  const recurring = !!b.recurring;

  if (!name) throw badRequest("name 필수");
  if (!(VALID_TYPES as readonly string[]).includes(type)) throw badRequest(`type 유효하지 않음 (허용: ${VALID_TYPES.join(",")})`);
  if (start_date && end_date && start_date > end_date) throw badRequest("start_date 는 end_date 이하여야 함");

  const { data, error } = await supabase
    .from("events")
    .insert({ name, type, start_date, end_date, recurring })
    .select()
    .single();
  if (error) throw new HttpError(500, error.message, "DB_ERROR");
  res.json({ ok: true, event: data });
}));

// ═══════════════════════════════════════════════════════════
// PATCH /api/events/:id · 이벤트 수정
// ═══════════════════════════════════════════════════════════
router.patch("/api/events/:id", authorize(9), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!id) throw badRequest("id 필수");
  const b = req.body ?? {};
  const updates: Record<string, any> = {};
  if (b.name != null) updates.name = String(b.name).trim();
  if (b.type != null) {
    const t = String(b.type).trim();
    if (!(VALID_TYPES as readonly string[]).includes(t)) throw badRequest("type 유효하지 않음");
    updates.type = t;
  }
  if (b.start_date !== undefined) updates.start_date = b.start_date || null;
  if (b.end_date !== undefined) updates.end_date = b.end_date || null;
  if (b.recurring !== undefined) updates.recurring = !!b.recurring;
  if (Object.keys(updates).length === 0) throw badRequest("수정 필드 없음");

  const { data, error } = await supabase.from("events").update(updates).eq("id", id).select().single();
  if (error) throw new HttpError(500, error.message, "DB_ERROR");
  res.json({ ok: true, event: data });
}));

// ═══════════════════════════════════════════════════════════
// DELETE /api/events/:id · 이벤트 삭제 (event_products CASCADE)
// ═══════════════════════════════════════════════════════════
router.delete("/api/events/:id", authorize(9), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!id) throw badRequest("id 필수");
  const { error } = await supabase.from("events").delete().eq("id", id);
  if (error) throw new HttpError(500, error.message, "DB_ERROR");
  res.json({ ok: true });
}));

// ═══════════════════════════════════════════════════════════
// GET /api/events/:id/products · 이벤트 매핑 상품
// ═══════════════════════════════════════════════════════════
router.get("/api/events/:id/products", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!id) throw badRequest("id 필수");
  const { data: rows } = await supabase.from("event_products").select("product_code").eq("event_id", id);
  const codes = (rows ?? []).map(r => r.product_code);
  if (codes.length === 0) return res.json({ products: [] });
  const { data: prods } = await supabase
    .from("products")
    .select("product_code, product_name, category, current_stock, optimal_stock, purchase_price, sale_price, supplier, sale_status")
    .in("product_code", codes);
  res.json({ products: (prods ?? []).filter((p: any) => p.hidden !== true) });
}));

// ═══════════════════════════════════════════════════════════
// POST /api/events/:id/products · 상품 매핑 (single or bulk)
//   · body · { product_codes: string[] }
// ═══════════════════════════════════════════════════════════
router.post("/api/events/:id/products", authorize(9), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!id) throw badRequest("id 필수");
  const codes: string[] = Array.isArray(req.body?.product_codes)
    ? req.body.product_codes.map((c: any) => String(c).trim()).filter(Boolean)
    : [];
  if (codes.length === 0) throw badRequest("product_codes 배열 필수");

  const rows = codes.map(code => ({ event_id: id, product_code: code }));
  const { error } = await supabase.from("event_products").upsert(rows, { onConflict: "event_id,product_code", ignoreDuplicates: true });
  if (error) throw new HttpError(500, error.message, "DB_ERROR");
  res.json({ ok: true, added: codes.length });
}));

// ═══════════════════════════════════════════════════════════
// DELETE /api/events/:id/products/:code · 상품 매핑 제거
// ═══════════════════════════════════════════════════════════
router.delete("/api/events/:id/products/:code", authorize(9), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const code = String(req.params.code ?? "").trim();
  if (!id || !code) throw badRequest("id·code 필수");
  const { error } = await supabase.from("event_products").delete().eq("event_id", id).eq("product_code", code);
  if (error) throw new HttpError(500, error.message, "DB_ERROR");
  res.json({ ok: true });
}));

export default router;
