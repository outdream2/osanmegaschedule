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
  // 2026-08-27 · 사용자 지시 · 실제위치 (real_map) 입력 안 되면 · 비교 대상에서 제외
  //   · location (진열위치 · 전산구역) 도 없으면 비교 무의미 · 제외
  //   · 이전 · spec (원본 규격 · EA·Z 등) 과 비교 · 대다수 무의미 mismatch · 1000건 폭발
  //   · 신 · location (display_location ?? spec) 파생 · 둘 다 값 있을 때만 비교
  // 2026-08-29 · #154 Phase 1 · sale_status join · 프론트 3-way 필터
  const { data: productRows, error: prodErr } = await supabase
    .from("products")
    .select("product_code, product_name, supplier, spec, display_location, location, real_map, category_code, sale_status, last_modified_at")
    .eq("hidden", false)
    .not("real_map", "is", null)
    .neq("real_map", "");

  if (prodErr) {
    console.error("[zone-mismatches] products 쿼리 오류:", prodErr.message);
    throw new HttpError(500, prodErr.message);
  }
  console.log(`[zone-mismatches] real_map 있는 상품 ${productRows?.length ?? 0}건 스캔 시작`);

  const computed = (productRows ?? [])
    .filter(p => {
      const locZone = String((p as any).location ?? (p as any).display_location ?? "").trim();
      const real = (p.real_map ?? "").trim();
      // 실제위치 없거나 · 진열위치 (location) 없으면 · 비교 대상 아님
      if (!real || !locZone) return false;
      return locZone !== real;
    })
    .map(p => {
      const locZone = String((p as any).location ?? (p as any).display_location ?? "").trim();
      return {
        id: p.product_code,
        product_code: p.product_code,
        product_name: p.product_name ?? "",
        supplier: (p as any).supplier ?? null,
        category_code: (p as any).category_code ?? null,
        spec_zone: locZone || "미지정",
        real_zone: (p.real_map ?? "").trim(),
        sale_status: (p as any).sale_status ?? null,
        registered_at: p.last_modified_at ?? new Date().toISOString(),
      };
    });
  console.log(`[zone-mismatches] 실제 불일치 ${computed.length}건 (실제위치·진열위치 둘 다 있는 상품만)`);

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
      supplier: null, // 2026-08-30 · legacy · products join 없음 · null
      spec_zone: r.spec_zone ?? "미지정",
      real_zone: r.real_zone ?? "",
      sale_status: null, // 2026-08-29 · legacy 는 판매상태 없음 · null 로 통일
      registered_at: r.created_at ?? new Date().toISOString(),
    }));

  res.json([...computed, ...legacyRows]);
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
  const { error } = await supabase.from("products").update({ real_map: null }).eq("product_code", id);
  if (error) throw new HttpError(500, error.message);
  try { await supabase.from("zone_mismatches").delete().eq("product_code", id); } catch {}
  res.json({ ok: true });
}));

export default router;
