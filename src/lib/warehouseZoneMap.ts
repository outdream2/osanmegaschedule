// src/lib/warehouseZoneMap.ts
// 2026-08-26 · 사용자 지시 · zone code → 창고1/창고2 매핑 (하드코딩)
//   · storage1_description / storage2_description 이미지 기반
//   · 상품 진열구역 (real_map) 으로부터 창고 소속 판별
//   · 스캔페이지 등 · 재고위치 표시 시 · 해당 상품 소속 창고만 노출 (반대 창고 슬롯 숨김)

// 창고1 · 파스류 (24·25·26·27) + 한방 (7B) + 경옥고/공진단 등 (8A)
export const WAREHOUSE_1_CODES = new Set<string>([
  "24", "25", "26", "27", "7B", "8A",
]);

// 2026-08-27 · 사용자 지시 · 창고2 실제 창고 zone 만 (매장 진열대 코드 제외)
//   · 왼쪽측면 (28·29·30·31·34·35·36·37·38·39·40) + 화장품 (32·33)
//   · 진열대 (1A~7A · 10~23) 은 매장 진열 · 창고2 아님
export const WAREHOUSE_2_CODES = new Set<string>([
  "28", "29", "30", "31", "32", "33", "34", "35", "36", "37", "38", "39", "40",
]);

// 두 창고 공용 (예: 40 드림크냉장고)
export const WAREHOUSE_BOTH_CODES = new Set<string>([
  "40",
]);

export type WarehouseVisibility = {
  showW1: boolean;
  showW2: boolean;
};

/** 단일 zone code 매핑 · 알 수 없으면 both true (안전 기본값 · 슬롯 안 사라짐) */
export function resolveWarehouseForCode(code: string | null | undefined): WarehouseVisibility {
  if (!code) return { showW1: true, showW2: true };
  const c = String(code).trim().toUpperCase().replace(/\s+/g, "");
  if (!c) return { showW1: true, showW2: true };
  if (WAREHOUSE_BOTH_CODES.has(c)) return { showW1: true, showW2: true };
  const w1 = WAREHOUSE_1_CODES.has(c);
  const w2 = WAREHOUSE_2_CODES.has(c);
  if (w1 && w2) return { showW1: true, showW2: true };
  if (w1) return { showW1: true, showW2: false };
  if (w2) return { showW1: false, showW2: true };
  // 알 수 없는 코드 · 안전 · 둘 다 표시
  return { showW1: true, showW2: true };
}

/** real_map 문자열 (예: "26" · "26/33" · "24/33/8A") 을 파싱해 창고 가시성 결정
 *  여러 zone 이 있으면 union (하나라도 창고1 이면 showW1=true) */
export function resolveWarehouseVisibility(realMap: string | null | undefined): WarehouseVisibility {
  if (!realMap) return { showW1: true, showW2: true };
  const parts = String(realMap)
    .split(/[\/,·]/)
    .map(s => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return { showW1: true, showW2: true };
  let showW1 = false;
  let showW2 = false;
  let unknown = false;
  for (const p of parts) {
    const c = p.toUpperCase().replace(/\s+/g, "");
    if (WAREHOUSE_BOTH_CODES.has(c)) { showW1 = true; showW2 = true; continue; }
    const inW1 = WAREHOUSE_1_CODES.has(c);
    const inW2 = WAREHOUSE_2_CODES.has(c);
    if (inW1) showW1 = true;
    if (inW2) showW2 = true;
    if (!inW1 && !inW2) unknown = true;
  }
  // 아무것도 매칭 안됐고 unknown 있으면 · 안전 · 둘 다 표시
  if (!showW1 && !showW2 && unknown) return { showW1: true, showW2: true };
  return { showW1, showW2 };
}

// 2026-08-27 · 사용자 지시 · zone 코드를 slot 에 지능 배정
//   · 창고1 코드 (예: 8A) → w1zone · 창고2 코드 (예: 32) → w2zone
//   · 나머지 (매장 진열구역) → s1/s2/s3 순차
//   · A제품 real_map = "1/2/8A" · s1=1 · s2=2 · w1=8A · w2=null · s3=null
export type SlotZones = {
  s1zone: string | null;
  s2zone: string | null;
  s3zone: string | null;
  w1zone: string | null;
  w2zone: string | null;
};
// 2026-08-27 · 사용자 지시 재정리
//   · ERP 위치 (location · 진열위치) → 매장 slot 만 배정 (창고 코드 감지 X)
//   · 창고 zone (w1/w2zone) → 창고 카테고리 매핑 · category_code 룩업 fallback
//   · 예: location "1/2/3" → 매장1=1·매장2=2·매장3=3 · 창고=null
//   · 예: category_code "8A" (드물) → 창고1=8A (매핑 있으면 표시)
export function assignZonesToSlots(
  input: string | null | undefined,
  categoryCode?: string | null,
): SlotZones {
  const stores = String(input ?? "").split(/[\/,·]/).map(s => s.trim()).filter(Boolean);
  let w1: string | null = null; let w2: string | null = null;
  if (categoryCode) {
    const cat = String(categoryCode).trim().toUpperCase().replace(/\s+/g, "");
    if (WAREHOUSE_1_CODES.has(cat)) w1 = cat;
    else if (WAREHOUSE_2_CODES.has(cat)) w2 = cat;
  }
  return {
    s1zone: stores[0] ?? null,
    s2zone: stores[1] ?? null,
    s3zone: stores[2] ?? null,
    w1zone: w1,
    w2zone: w2,
  };
}
