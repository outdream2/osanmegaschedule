// GET /api/stock-manage/low-stock
// 적정재고보다 현재고가 작은 상품 (current_stock < optimal_stock)
// 2026-08-05 · T-PERF-1a · 2분 in-memory 캐시 적용
// 2026-08-29 · #168 Phase 2 · queryProductsWithInventory 유틸 소비
import { Router } from "express";
import { asyncHandler } from "../../../middleware/asyncHandler";
import { lowStockCache, setLowStockCache } from "./helpers";

const router = Router();

router.get("/api/stock-manage/low-stock", asyncHandler(async (_req, res) => {
  if (lowStockCache && lowStockCache.expiresAt > Date.now()) {
    res.setHeader("X-Cache", "HIT");
    return res.json(lowStockCache.data);
  }
  const { queryProductsWithInventory } = await import("../../../utils/productInventoryQuery");
  const rows = await queryProductsWithInventory(undefined, {
    filterLowStockOnly: true,
    limit: 10000,
  });

  // 부족량 desc 정렬
  const sorted = rows.sort((a, b) => {
    const shortA = (a.optimal_stock ?? 0) - (a.current_stock ?? 0);
    const shortB = (b.optimal_stock ?? 0) - (b.current_stock ?? 0);
    return shortB - shortA;
  });

  // 응답 형식 유지 · warehouse_stock · store_stock · inv_checked_at (기존 필드명)
  const filtered = sorted.map(r => ({
    product_code:   r.product_code,
    product_name:   r.product_name,
    spec:           r.spec,
    current_stock:  r.current_stock,
    optimal_stock:  r.optimal_stock,
    supplier:       r.supplier,
    // 2026-08-31 · #71 fix · 판매 구역현황 · row 자체 location + real_map 병행 응답
    location:        (r as any).location      ?? null,
    display_location:(r as any).display_location ?? null,
    real_map:        r.real_map,
    purchase_price: r.purchase_price,
    sale_price:     r.sale_price,
    sale_status:    r.sale_status,
    warehouse_stock: r.inv_warehouse1_stock,  // 기존 필드명 · 레거시 alias
    store_stock:     r.inv_store_stock,       // 기존 필드명 · 매장1
    inv_checked_at:  r.inv_checked_at,
  }));

  setLowStockCache(filtered);
  res.setHeader("X-Cache", "MISS");
  res.json(filtered);
}));

export default router;
