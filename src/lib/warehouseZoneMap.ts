// src/lib/warehouseZoneMap.ts
// 2026-08-26 · 사용자 지시 · zone code → 창고1/창고2 매핑 (하드코딩)
//   · storage1_description / storage2_description 이미지 기반
//   · 상품 진열구역 (real_map) 으로부터 창고 소속 판별
//   · 스캔페이지 등 · 재고위치 표시 시 · 해당 상품 소속 창고만 노출 (반대 창고 슬롯 숨김)

// 창고1 · 파스류 (24·25·26·27) + 한방 (7B) + 경옥고/공진단 등 (8A)
export const WAREHOUSE_1_CODES = new Set<string>([
  "24", "25", "26", "27", "7B", "8A",
]);

// 창고2 · 왼쪽측면 (28·29·30·31·34·35·36·37·38·39·40)
//   + 중앙 (1A~7A · 감기약/소화제/연고/피부)
//   + 오른쪽 (10~23 · 건강기능)
//   + 화장품 (32·33)
export const WAREHOUSE_2_CODES = new Set<string>([
  // 왼쪽측면
  "28", "29", "30", "31", "34", "35", "36", "37", "38", "39", "40",
  // 중앙 진열대
  "1A", "1B", "2A", "2B", "3A", "3B", "4A", "4B",
  "5A", "5B", "6A", "6B", "7A",
  // 오른쪽 건강기능
  "10", "11", "12", "13", "14", "15", "16", "17", "18", "19",
  "20", "21", "22", "23",
  // 화장품
  "32", "33",
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
