// src/shared/warehouseZones.ts
// 2026-09-20 · SSOT 통합 · client(warehouseZoneMap.ts, shelfPositions.ts) + server(shelfPositionAssign.ts)
//   · 창고1(6개) / 창고2(그 외) 코드 판별 · shelf_positions 초기화 · zone→slot 배정
//   · 서버: import from "../../../src/shared/warehouseZones"
//   · 클라: import from "@/shared/warehouseZones" or "../../shared/warehouseZones"

// ── 상수 ──────────────────────────────────────────────────────────────────────

// 2026-09-02 · 사용자 지시 · 창고1은 6개만 · 나머지는 모두 창고2
//   · 창고1: 파스류 (24·25·26·27) + 한방 (7B) + 경옥고/공진단 등 (8A)
export const WAREHOUSE_1_CODES: ReadonlySet<string> = new Set<string>([
  "24", "25", "26", "27", "7B", "8A",
]);

// (호환) 창고2 명시 리스트 · 신규 로직에서는 창고1 아닌 모든 코드가 창고2
export const WAREHOUSE_2_CODES: ReadonlySet<string> = new Set<string>([
  "28", "29", "30", "31", "32", "33", "34", "35", "36", "37", "38", "39", "40",
]);

// ── 타입 ──────────────────────────────────────────────────────────────────────

export type WarehouseVisibility = {
  showW1: boolean;
  showW2: boolean;
};

export type ArrivalSlot = "w1" | "w2" | "s1" | "s2" | "s3";

export type SlotZones = {
  s1zone: string | null;
  s2zone: string | null;
  s3zone: string | null;
  w1zone: string | null;
  w2zone: string | null;
};

export type ShelfPositionsDraft = {
  warehouse1: string | null;
  warehouse2: string | null;
  store1: string | null;
  store2: string | null;
  store3: string | null;
};

// ── 유효성 ────────────────────────────────────────────────────────────────────

/**
 * 유효한 구역코드 판별 (1~4자)
 *   · 순수 숫자: 1~99
 *   · 알파뉴메릭: 2~4자 (예: "7B","8A","1A")
 *   · "10102" 같은 5자리 상품코드·카테고리코드 제외
 */
export function isValidZoneCode(c: string): boolean {
  if (!c || c.length > 4) return false;
  const num = parseInt(c, 10);
  if (!isNaN(num) && String(num) === c) return num >= 1 && num <= 99;
  return /^[0-9A-Z]{2,4}$/.test(c);
}

// ── 창고 판별 ─────────────────────────────────────────────────────────────────

/** 단일 zone code → 창고 가시성
 *  2026-09-02 · 창고1(6개) · 나머지 모두 창고2 · code 없으면 둘 다 true (안전)
 */
export function resolveWarehouseForCode(code: string | null | undefined): WarehouseVisibility {
  if (!code) return { showW1: true, showW2: true };
  const c = String(code).trim().toUpperCase().replace(/\s+/g, "");
  if (!c) return { showW1: true, showW2: true };
  if (WAREHOUSE_1_CODES.has(c)) return { showW1: true, showW2: false };
  return { showW1: false, showW2: true };
}

/** location 문자열 (예: "26" · "26/33" · "24/33/8A") → 창고 가시성
 *  · 유효 구역코드(1~4자)만 판별 · 상품코드·카테고리코드 오분류 방지
 *  · location 없거나 유효 코드 없으면 둘 다 true (기본 표시)
 */
export function resolveWarehouseVisibility(location: string | null | undefined): WarehouseVisibility {
  if (!location) return { showW1: true, showW2: true };
  const parts = String(location)
    .split(/[\/,·]/)
    .map(s => s.trim())
    .filter(Boolean);
  let showW1 = false;
  let showW2 = false;
  for (const p of parts) {
    const c = p.toUpperCase().replace(/\s+/g, "");
    if (!isValidZoneCode(c)) continue;
    if (WAREHOUSE_1_CODES.has(c)) showW1 = true;
    else showW2 = true;
  }
  if (!showW1 && !showW2) return { showW1: true, showW2: true };
  return { showW1, showW2 };
}

/** location 코드 → 자동 슬롯 판정
 *  2026-09-02 · 창고1(6개) → "w1" · 나머지 → "w2"
 *  · 매장 슬롯(s1/s2/s3)은 미사용 (향후 확장 시 사용)
 */
export function classifyArrivalSlot(locationCode: string | null | undefined): ArrivalSlot | null {
  if (!locationCode) return null;
  const c = String(locationCode).trim().toUpperCase().replace(/\s+/g, "");
  if (!c || !isValidZoneCode(c)) return null;
  if (WAREHOUSE_1_CODES.has(c)) return "w1";
  return "w2";
}

// ── Slot zone 파생 ────────────────────────────────────────────────────────────

/** location 문자열 → zone 코드를 slot에 지능 배정
 *  · 창고1 코드 → w1zone · 창고2 코드 → w2zone
 *  · 나머지 (매장 진열구역) → s1/s2/s3 순차
 *  · 예: "1/2/8A" → s1=1, s2=2, w1=8A, w2=null, s3=null
 *  2026-09-20 fix · s1/s2/s3 항상 null 버그 수정 포함 (매장 슬롯 순차 배정)
 */
export function assignZonesToSlots(
  input: string | null | undefined,
  categoryCode?: string | null,
): SlotZones {
  const codes = String(input ?? "").split(/[\/,·]/).map(s => s.trim()).filter(Boolean);
  let w1: string | null = null;
  let w2: string | null = null;
  const stores: string[] = [];
  for (const raw of codes) {
    const c = raw.toUpperCase().replace(/\s+/g, "");
    if (!isValidZoneCode(c)) continue;
    if (!w1 && WAREHOUSE_1_CODES.has(c)) { w1 = raw; continue; }
    if (!w2 && WAREHOUSE_2_CODES.has(c)) { w2 = raw; continue; }
    stores.push(raw);
  }
  if (!w1 && categoryCode) {
    const cat = String(categoryCode).trim().toUpperCase().replace(/\s+/g, "");
    if (WAREHOUSE_1_CODES.has(cat)) w1 = categoryCode.trim();
  }
  return {
    s1zone: stores[0] ?? null,
    s2zone: stores[1] ?? null,
    s3zone: stores[2] ?? null,
    w1zone: w1,
    w2zone: w2,
  };
}

// ── shelf_positions 초기값 ─────────────────────────────────────────────────────

/** location 문자열 → 자동 shelf_positions 초기값
 *  · 매장1(store1) 무조건 포함 · 창고1/2는 구역 코드 검출 시만 포함
 *  · 각 값은 null · 상세위치는 이후 편집 UI에서 사용자가 입력
 *  · 서버(shelfPositionAssign.ts) · 클라(shelfPositions.ts) 미러 → 여기서 단일 SSOT
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
