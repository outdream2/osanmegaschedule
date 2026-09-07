// src/lib/warehouseZoneMap.ts
// 2026-08-26 · zone code → 창고1/창고2 매핑 (하드코딩)
//   · storage1_description / storage2_description 이미지 기반
//   · 상품 진열위치 (location) 으로부터 창고 소속 판별
//   · 스캔페이지 등 · 재고위치 표시 시 · 해당 상품 소속 창고만 노출 (반대 창고 슬롯 숨김)

// 2026-09-02 · 사용자 지시 · 창고1은 6개만 · 나머지는 모두 창고2
//   · 창고1: 파스류 (24·25·26·27) + 한방 (7B) + 경옥고/공진단 등 (8A)
//   · 창고2: 위 6개 이외 모든 zone (매장 진열대 포함 · 진열대 자체가 창고2 진열)
export const WAREHOUSE_1_CODES = new Set<string>([
  "24", "25", "26", "27", "7B", "8A",
]);

// (호환) 창고2 명시 리스트 · 신규 로직에서는 · 창고1 아니면 모두 창고2
export const WAREHOUSE_2_CODES = new Set<string>([
  "28", "29", "30", "31", "32", "33", "34", "35", "36", "37", "38", "39", "40",
]);

// 두 창고 공용 (레거시 · 신규 규칙에서는 사용 안 함)
export const WAREHOUSE_BOTH_CODES = new Set<string>([]);

export type WarehouseVisibility = {
  showW1: boolean;
  showW2: boolean;
};

/** 단일 zone code 매핑
 *  2026-09-02 · 사용자 규칙 · 창고1(6개) · 나머지 모두 창고2 · code 없으면 둘 다 표시 (안전)
 */
export function resolveWarehouseForCode(code: string | null | undefined): WarehouseVisibility {
  if (!code) return { showW1: true, showW2: true };
  const c = String(code).trim().toUpperCase().replace(/\s+/g, "");
  if (!c) return { showW1: true, showW2: true };
  if (WAREHOUSE_1_CODES.has(c)) return { showW1: true, showW2: false };
  // 창고1 아니면 모두 창고2
  return { showW1: false, showW2: true };
}

/** location 문자열 (예: "26" · "26/33" · "24/33/8A") 을 파싱해 창고 가시성 결정
 *  · 유효 구역코드(1~4자)만 판별 · 상품코드·카테고리코드 오분류 방지
 *  · location 없거나 유효 코드 없으면 · 둘 다 true (기본 표시)
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
    if (!isValidZoneCode(c)) continue;   // "10102" 같은 코드 무시
    if (WAREHOUSE_1_CODES.has(c)) showW1 = true;
    else showW2 = true;
  }
  // 유효 구역코드가 하나도 없으면 · 둘 다 표시 (안전)
  if (!showW1 && !showW2) return { showW1: true, showW2: true };
  return { showW1, showW2 };
}

// 2026-09-01 · #92 · 입고 구역 지정 → 자동 슬롯 판정
//   · 창고1 코드 → "w1" · 창고2 코드 → "w2" · 나머지 매장 진열 → "s1" (기본)
//   · MajorZone 기반 세분화: 중앙상비약존·상담존 → s1 · 뷰티식품존 → s2 · 카운터테마존 → s3
export type ArrivalSlot = "w1" | "w2" | "s1" | "s2" | "s3";

/** location 코드 → 자동 슬롯 판정
 *  2026-09-02 · 사용자 규칙 · 창고1(6개) 이외 모두 창고2 (매장 진열대도 창고2)
 *  · 반환 · "w1" | "w2" · 매장 슬롯은 미사용 (사용자 요청 시 확장)
 */
export function classifyArrivalSlot(locationCode: string | null | undefined): ArrivalSlot | null {
  if (!locationCode) return null;
  const c = String(locationCode).trim().toUpperCase().replace(/\s+/g, "");
  if (!c || !isValidZoneCode(c)) return null;   // 유효하지 않은 코드 무시
  if (WAREHOUSE_1_CODES.has(c)) return "w1";
  return "w2";
}

// 2026-08-27 · 사용자 지시 · zone 코드를 slot 에 지능 배정
//   · 창고1 코드 (예: 8A) → w1zone · 창고2 코드 (예: 32) → w2zone
//   · 나머지 (매장 진열구역) → s1/s2/s3 순차
//   · 예: location = "1/2/8A" · s1=1 · s2=2 · w1=8A · w2=null · s3=null
export type SlotZones = {
  s1zone: string | null;
  s2zone: string | null;
  s3zone: string | null;
  w1zone: string | null;
  w2zone: string | null;
};

// 유효한 구역코드 패턴: 1~4자, 숫자(1~99) 또는 알파뉴메릭 (예: "1A","7B","28","41")
// "10102" 같은 5자리 상품코드·카테고리코드는 구역코드로 인정하지 않음
function isValidZoneCode(c: string): boolean {
  if (!c || c.length > 4) return false;
  // 순수 숫자: 1~99
  const num = parseInt(c, 10);
  if (!isNaN(num) && String(num) === c) return num >= 1 && num <= 99;
  // 알파뉴메릭: 2~4자 (예: "7B","8A","1A","1B")
  return /^[0-9A-Z]{2,4}$/.test(c);
}

// 2026-09-07 · 창고2 = 창고1(6개) 제외 모든 유효 구역코드
//   · 유효 구역코드만 (1~4자·숫자1-99·알파뉴메릭) · 상품코드·카테고리코드 오분류 방지
export function assignZonesToSlots(
  input: string | null | undefined,
  categoryCode?: string | null,
): SlotZones {
  const codes = String(input ?? "").split(/[\/,·]/).map(s => s.trim()).filter(Boolean);
  let w1: string | null = null; let w2: string | null = null;
  for (const raw of codes) {
    const c = raw.toUpperCase().replace(/\s+/g, "");
    if (!isValidZoneCode(c)) continue;   // 유효하지 않은 코드 무시
    if (!w1 && WAREHOUSE_1_CODES.has(c)) { w1 = raw; continue; }
    if (!w2) { w2 = raw; continue; }    // 창고1 제외 모두 창고2
  }
  // fallback · category_code 가 유효 창고1 코드면 사용
  if (!w1 && categoryCode) {
    const cat = String(categoryCode).trim().toUpperCase().replace(/\s+/g, "");
    if (WAREHOUSE_1_CODES.has(cat)) w1 = categoryCode.trim();
  }
  return {
    s1zone: null,
    s2zone: null,
    s3zone: null,
    w1zone: w1,
    w2zone: w2,
  };
}
