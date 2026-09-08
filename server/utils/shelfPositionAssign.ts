// 2026-09-08 · 상품 등록 시 · 구역(display_location/location) → shelf_positions 자동 초기화
//   · 창고1 코드 (6개) 검출 → shelf_positions.warehouse1 = null (진열 자리만 확보)
//   · 그 외 유효 구역 코드 → shelf_positions.warehouse2 = null
//   · 매장1 (store1) · 무조건 default 자리 확보 (사용자 지시)
//   · 값은 null · 상세위치는 이후 편집 UI 에서 사용자가 입력
//   · assignZonesToSlots (src/lib/warehouseZoneMap.ts) 와 동일한 규칙 (서버 사이드 사본)

const WAREHOUSE_1_CODES = new Set<string>(["24", "25", "26", "27", "7B", "8A"]);

function isValidZoneCode(c: string): boolean {
  if (!c || c.length > 4) return false;
  const num = parseInt(c, 10);
  if (!isNaN(num) && String(num) === c) return num >= 1 && num <= 99;
  return /^[0-9A-Z]{2,4}$/.test(c);
}

/** location 문자열 (예 "26" · "26/33" · "24/33/8A") 파싱 → 자동 shelf_positions 초기값
 *  · 반환 · 매장1 (필수 default) + 창고1/2 (구역에 따라)
 *  · 각 값은 null · 상세위치는 이후 편집으로 채움
 */
export function buildInitialShelfPositions(
  location: string | null | undefined,
  categoryCode?: string | null,
): Record<string, string | null> {
  const positions: Record<string, string | null> = { store1: null };
  const codes = String(location ?? "")
    .split(/[\/,·]/)
    .map(s => s.trim().toUpperCase().replace(/\s+/g, ""))
    .filter(Boolean);
  let hasW1 = false;
  let hasW2 = false;
  for (const c of codes) {
    if (!isValidZoneCode(c)) continue;
    if (WAREHOUSE_1_CODES.has(c)) hasW1 = true;
    else hasW2 = true;
  }
  if (!hasW1 && categoryCode) {
    const cat = String(categoryCode).trim().toUpperCase().replace(/\s+/g, "");
    if (WAREHOUSE_1_CODES.has(cat)) hasW1 = true;
  }
  if (hasW1) positions.warehouse1 = null;
  if (hasW2) positions.warehouse2 = null;
  return positions;
}
