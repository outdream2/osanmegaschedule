// 2026-08-16 · asyncHandler + HttpError 프레임워크 적용
import { Router } from "express";
import { supabase } from "../../../src/supabase/client";
import { authorize } from "../../middleware/requireAuth";
import { asyncHandler } from "../../middleware/asyncHandler";
import { badRequest, HttpError } from "../../middleware/errorHandler";

const router = Router();

// T-SLIM E · 표준 shape 주석 · List endpoint
// 현재: res.json(array) · 직접 배열 반환 · 프론트 소비 패턴과 breaking 없이 유지
// 미래 v2: { rows: array, count: number } 로 전환 예정 (프론트 마이그레이션 후)
router.get("/api/zone-mismatches", asyncHandler(async (_req, res) => {
  const { data: productRows, error: prodErr } = await supabase
    .from("products")
    .select("product_code, product_name, spec, real_map, category_code, last_modified_at")
    .eq("hidden", false)
    .not("real_map", "is", null)
    .neq("real_map", "");

  if (prodErr) {
    console.error("[zone-mismatches] products 쿼리 오류:", prodErr.message);
    throw new HttpError(500, prodErr.message);
  }
  console.log(`[zone-mismatches] real_map 있는 상품 ${productRows?.length ?? 0}건`);
  if (productRows?.length) {
    console.log("[zone-mismatches] sample:", JSON.stringify(productRows[0]));
  }

  const computed = (productRows ?? [])
    .filter(p => {
      const specZone = (p.spec ?? "").trim();
      const real = (p.real_map ?? "").trim();
      return real && specZone !== real;
    })
    .map(p => ({
      id: p.product_code,
      product_code: p.product_code,
      product_name: p.product_name ?? "",
      category_code: (p as any).category_code ?? null,
      spec_zone: (p.spec ?? "").trim() || "미지정",
      real_zone: (p.real_map ?? "").trim(),
      registered_at: p.last_modified_at ?? new Date().toISOString(),
    }));

  const { data: legacy } = await supabase
    .from("zone_mismatches")
    .select("product_code, product_name, spec_zone, real_zone, created_at")
    .order("created_at", { ascending: false });

  const computedCodes = new Set(computed.map(c => c.product_code));
  const legacyRows = (legacy ?? [])
    .filter(r => !computedCodes.has(r.product_code))
    .map(r => ({
      id: r.product_code,
      product_code: r.product_code,
      product_name: r.product_name ?? "",
      spec_zone: r.spec_zone ?? "미지정",
      real_zone: r.real_zone ?? "",
      registered_at: r.created_at ?? new Date().toISOString(),
    }));

  res.json([...computed, ...legacyRows]);
}));

router.post("/api/zone-mismatches", asyncHandler(async (req, res) => {
  const b = req.body ?? {};
  const { error } = await supabase.from("zone_mismatches").upsert([{
    product_code: String(b.product_code ?? ""),
    product_name: String(b.product_name ?? ""),
    spec_zone: String(b.spec_zone ?? ""),
    real_zone: String(b.real_zone ?? ""),
  }], { onConflict: "product_code" });
  if (error) throw new HttpError(500, error.message);
  res.json({ ok: true });
}));

router.delete("/api/zone-mismatches/by-code/:code", asyncHandler(async (req, res) => {
  const code = decodeURIComponent(req.params.code ?? "").trim();
  if (!code) throw badRequest("code required");
  const { error } = await supabase.from("zone_mismatches").delete().eq("product_code", code);
  if (error) throw new HttpError(500, error.message);
  res.json({ ok: true });
}));

router.delete("/api/zone-mismatches/:id", authorize(2), asyncHandler(async (req, res) => {
  const id = decodeURIComponent(req.params.id ?? "").trim();
  const { error } = await supabase.from("products").update({ real_map: null }).eq("product_code", id);
  if (error) throw new HttpError(500, error.message);
  try { await supabase.from("zone_mismatches").delete().eq("product_code", id); } catch {}
  res.json({ ok: true });
}));

export default router;
