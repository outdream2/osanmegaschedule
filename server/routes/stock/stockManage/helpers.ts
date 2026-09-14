// Shared helpers for stockManage sub-routes
// 2026-09-14 · 사용자 대원칙 · 실시간 정확성 · 캐시 4종 제거 (lowStock·ocrAgg·salesTrend·topSales)
//   · 매 요청 · DB 직접 조회 · 발주·매출·매입 · stale 위험 원천 제거
//   · clear* 함수 · no-op 스텁 유지 (호출 사이트 호환 · 점진 제거 예정)

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

// 2026-09-14 · 캐시 제거 · clear* 함수 · no-op 스텁 (호출 사이트 호환)
export function clearOcrAggCache(): void { /* cache removed */ }
export function clearLowStockCache(): void { /* cache removed */ }
export function clearSalesTrendCache(): void { /* cache removed */ }
export function clearTopSalesCache(): void { /* cache removed */ }
