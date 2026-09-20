// 2026-08-16 · asyncHandler + HttpError 프레임워크 적용
// 2026-09-20 · 재설계 · 실재고 총합 vs ERP 현재고 차이 자동 계산
import { Router } from "express";
import { supabase } from "../../../src/supabase/client";
import { authorize } from "../../middleware/requireAuth";
import { asyncHandler } from "../../middleware/asyncHandler";
import { badRequest, HttpError } from "../../middleware/errorHandler";
import { validateBody } from "../../middleware/zodValidate";
import { fetchAllWithRange } from "../../utils/supabaseFetchAll";
import { z } from "zod";

const UpsertZoneMismatchSchema = z.object({
  product_code: z.string().min(1, "product_code 필수").max(50),
  product_name: z.string().max(300).optional(),
  spec_zone: z.string().max(100).optional(),
  real_zone: z.string().max(100).optional(),
});

const router = Router();

// 2026-09-20 · 실재고 총합 vs ERP 현재고 · 차이 있는 상품만 자동 계산 반환
// products.current_stock (ERP) vs inventory_checks 최신 스냅샷 5-slot 합계 비교
router.get("/api/zone-mismatches", asyncHandler(async (_req, res) => {
  // 1. products 전체 조회
  const products = await fetchAllWithRange<any>(() =>
    supabase
      .from("products")
      .select("product_code, product_name, current_stock, supplier, sale_status")
      .eq("hidden", false),
    100000
  );

  // 2. inventory_checks 최신 스냅샷 · product_code 별 최신 1건
  const invRows = await fetchAllWithRange<any>(() =>
    supabase
      .from("inventory_checks")
      .select("product_code, warehouse1_stock, warehouse2_stock, store1_stock, store2_stock, store3_stock, checked_at")
      .order("checked_at", { ascending: false }),
    100000
  );

  // 3. dedup · product_code 별 최신 1건만
  const invMap = new Map<string, {
    warehouse: number; store: number; checked_at: string;
  }>();
  for (const r of invRows ?? []) {
    const code = String(r.product_code ?? "").trim();
    if (!code || invMap.has(code)) continue;
    const wh = (r.warehouse1_stock != null ? Number(r.warehouse1_stock) : 0)
             + (r.warehouse2_stock  != null ? Number(r.warehouse2_stock)  : 0);
    const st = (r.store1_stock != null ? Number(r.store1_stock) : 0)
             + (r.store2_stock != null ? Number(r.store2_stock) : 0)
             + (r.store3_stock != null ? Number(r.store3_stock) : 0);
    invMap.set(code, {
      warehouse: Number.isFinite(wh) ? wh : 0,
      store:     Number.isFinite(st) ? st : 0,
      checked_at: r.checked_at ?? new Date().toISOString(),
    });
  }

  // 4. 비교 · 차이 있는 상품만 수집
  const rows: any[] = [];
  for (const p of products ?? []) {
    const code = String(p.product_code ?? "").trim();
    if (!code) continue;
    const inv = invMap.get(code);
    if (!inv) continue; // 실재고 미기록 · 비교 대상 아님

    // current_stock · TEXT → integer cast · NULL / 빈문자열 → 0
    const erpRaw = p.current_stock != null && p.current_stock !== ""
      ? Number(p.current_stock) : 0;
    const erp_stock = Number.isFinite(erpRaw) ? erpRaw : 0;

    const real_total = inv.warehouse + inv.store;
    const diff = erp_stock - real_total;

    if (diff === 0) continue; // 일치 · 제외

    rows.push({
      id:             code,
      product_code:   code,
      product_name:   p.product_name ?? "",
      supplier:       p.supplier ?? null,
      erp_stock,
      real_total,
      warehouse_stock: inv.warehouse,
      store_stock:     inv.store,
      diff,
      sale_status:    p.sale_status ?? null,
      registered_at:  inv.checked_at,
    });
  }

  // 5. 정렬 · abs(diff) 내림차순 (큰 차이부터)
  rows.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  res.json(rows.slice(0, 1000));
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
