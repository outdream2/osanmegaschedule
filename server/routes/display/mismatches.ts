// 2026-08-16 · asyncHandler + HttpError 프레임워크 적용
import { Router } from "express";
import { supabase } from "../../../src/supabase/client";
import { authorize } from "../../middleware/requireAuth";
import { asyncHandler } from "../../middleware/asyncHandler";
import { badRequest, HttpError } from "../../middleware/errorHandler";
import { validateBody } from "../../middleware/zodValidate";
import { z } from "zod";

const UpsertZoneMismatchSchema = z.object({
  product_code: z.string().min(1, "product_code 필수").max(50),
  product_name: z.string().max(300).optional(),
  spec_zone: z.string().max(100).optional(),
  real_zone: z.string().max(100).optional(),
});

const router = Router();

// T-SLIM E · 표준 shape 주석 · List endpoint
// 현재: res.json(array) · 직접 배열 반환 · 프론트 소비 패턴과 breaking 없이 유지
// 미래 v2: { rows: array, count: number } 로 전환 예정 (프론트 마이그레이션 후)
router.get("/api/zone-mismatches", asyncHandler(async (_req, res) => {
  // 2026-09-04 · real_map 컬럼 제거 · legacy zone_mismatches 테이블 데이터만 반환
  const { data: legacy, error } = await supabase
    .from("zone_mismatches")
    .select("product_code, product_name, spec_zone, real_zone, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[zone-mismatches] 쿼리 오류:", error.message);
    throw new HttpError(500, error.message);
  }

  const rows = (legacy ?? []).map(r => ({
    id: r.product_code,
    product_code: r.product_code,
    product_name: r.product_name ?? "",
    supplier: null,
    spec_zone: r.spec_zone ?? "미지정",
    real_zone: r.real_zone ?? "",
    sale_status: null,
    registered_at: r.created_at ?? new Date().toISOString(),
  }));

  res.json(rows);
}));

router.post("/api/zone-mismatches", authorize(1), validateBody(UpsertZoneMismatchSchema), asyncHandler(async (req, res) => {
  const b = req.body;
  const { error } = await supabase.from("zone_mismatches").upsert([{
    product_code: b.product_code,
    product_name: b.product_name ?? "",
    spec_zone: b.spec_zone ?? "",
    real_zone: b.real_zone ?? "",
  }], { onConflict: "product_code" });
  if (error) throw new HttpError(500, error.message);
  res.json({ ok: true });
}));

router.delete("/api/zone-mismatches/by-code/:code", authorize(1), asyncHandler(async (req, res) => {
  const code = decodeURIComponent(req.params.code ?? "").trim();
  if (!code) throw badRequest("code required");
  const { error } = await supabase.from("zone_mismatches").delete().eq("product_code", code);
  if (error) throw new HttpError(500, error.message);
  res.json({ ok: true });
}));

router.delete("/api/zone-mismatches/:id", authorize(2), asyncHandler(async (req, res) => {
  const id = decodeURIComponent(req.params.id ?? "").trim();
  const { error } = await supabase.from("zone_mismatches").delete().eq("product_code", id);
  if (error) throw new HttpError(500, error.message);
  res.json({ ok: true });
}));

export default router;
