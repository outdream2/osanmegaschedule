// Shared helpers and in-memory caches for stockManage sub-routes

/**
 * 스냅샷 날짜(YYYY-MM-DD)가 season 월 배열에 속하는지 검사
 * season 이 null/[] 이면 항상 true (필터 미적용)
 */
export function inSeasonMonths(snapshotDate: string, months: number[] | null): boolean {
  if (!months || months.length === 0) return true;
  const m = /^\d{4}-(\d{2})/.exec(String(snapshotDate));
  if (!m) return false;
  return months.includes(Number(m[1]));
}

export function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

// ── purchase aggregation cache (TTL 5분) ──────────────────────────────────
// 2026-07-31 · performance QW1 · purchase_details 풀스캔 반복 요청 감소
// 2026-08-09 · 소스: ocr_confirmed_items → purchase_details · 캐시 이름 유지(하위호환)
export const ocrAggCache = new Map<string, { data: any; expiresAt: number }>();
export const OCR_AGG_TTL = 5 * 60 * 1000;
export function clearOcrAggCache(): void { ocrAggCache.clear(); }

// ── low-stock cache (TTL 2분) ─────────────────────────────────────────────
// 2026-08-05 · T-PERF-1a · products + inventory_checks 풀스캔 반복 방지
// inventory-checks POST/PATCH/DELETE 시 무효화
export let lowStockCache: { data: any; expiresAt: number } | null = null;
export const LOW_STOCK_TTL = 2 * 60 * 1000;
export function clearLowStockCache(): void { lowStockCache = null; }
export function setLowStockCache(data: any): void {
  lowStockCache = { data, expiresAt: Date.now() + LOW_STOCK_TTL };
}

// ── sales-trend cache (TTL 5분) ───────────────────────────────────────────
// stock_history 업로드/변경 시 clearSalesTrendCache() 호출
export const salesTrendCache = new Map<string, { data: any; expiresAt: number }>();
export const SALES_TREND_TTL = 5 * 60 * 1000;
export function clearSalesTrendCache(): void { salesTrendCache.clear(); }

// ── top-sales cache (TTL 10분) ────────────────────────────────────────────
// 2026-07-29 · Phase 1 · 로딩 속도 개선 (3분 → 10분)
export const topSalesCache = new Map<string, { data: any; expiresAt: number }>();
export const TOP_SALES_TTL = 10 * 60 * 1000;
