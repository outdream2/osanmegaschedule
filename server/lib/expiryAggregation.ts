// server/lib/expiryAggregation.ts
// 2026-09-18 · 유통기한 임박 · 3소스 UNION + MIN 집계 · 순수 함수 · 회귀 테스트 지원
//   · SSOT · inventory_checks.expiry_date
//   · Legacy 1 · products.expiry_date (임포트 시 저장 · 사용 중단 방향)
//   · Legacy 2 · purchase_details.expiry_date (Phase A DATE 컬럼 · 상품입고 검수)
//   · 각 소스 rows · [{ product_code, expiry_date }] · MIN(expiry_date) per product_code

export interface ExpiryRow {
  product_code: string | null | undefined;
  expiry_date: string | null | undefined;
}

/**
 * 단일 소스 · product_code 별 · MIN(expiry_date) 집계 · 기존 map 에 병합
 *   · 빈 값 · null · 무효 date 제외
 *   · 이미 map 에 있으면 · 더 이른 날짜로만 업데이트
 * @param rows 소스 rows (supabase select 결과 등)
 * @param minExpiry 누적 Map · product_code → 최소 expiry_date (YYYY-MM-DD)
 */
export function mergeMinExpiry(rows: ExpiryRow[] | null | undefined, minExpiry: Map<string, string>): void {
  if (!Array.isArray(rows)) return;
  for (const r of rows) {
    if (!r || !r.product_code || !r.expiry_date) continue;
    const code = String(r.product_code);
    const dateStr = String(r.expiry_date).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;
    const cur = minExpiry.get(code);
    if (!cur || dateStr < cur) minExpiry.set(code, dateStr);
  }
}

/**
 * 3소스 병합 결과 · 배열로 반환 · 정렬 (오래된 유통기한 우선)
 */
export function aggregateExpirySources(
  sources: (ExpiryRow[] | null | undefined)[],
): Map<string, string> {
  const minExpiry = new Map<string, string>();
  for (const src of sources) mergeMinExpiry(src, minExpiry);
  return minExpiry;
}
