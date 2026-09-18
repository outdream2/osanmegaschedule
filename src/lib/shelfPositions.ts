// src/lib/shelfPositions.ts
// 2026-09-08 · 상세 진열위치 표시·조회 헬퍼
//   · shelf_positions JSON · key=location code · value=3자리 or null
//   · storage_locations KV · location code → name·kind·required_detail 매핑
//   · UI 32개 파일에서 진열위치 옆에 뱃지로 표시 · 매장 미입력 빨간 강조
// 2026-09-18 · 사용자 지시 · 계층 2 (클라 폴백)
//   · shelf_positions 비어있어도 · location 있으면 · UI 렌더 시 default 슬롯 계산
//   · 서버 buildInitialShelfPositions 와 동일 로직 (SSOT)

import type { StorageLocation } from "@/shared/schemas/settings";

export type ShelfPositions = Record<string, string | null | undefined>;

// 2026-09-18 · 서버 utils/shelfPositionAssign.ts 와 동일 규칙 (SSOT)
const WAREHOUSE_1_CODES = new Set<string>(["24", "25", "26", "27", "7B", "8A"]);

function isValidZoneCode(c: string): boolean {
  if (!c || c.length > 4) return false;
  const num = parseInt(c, 10);
  if (!isNaN(num) && String(num) === c) return num >= 1 && num <= 99;
  return /^[0-9A-Z]{2,4}$/.test(c);
}

/**
 * location 문자열 → 자동 shelf_positions 초기값
 *   · 서버 buildInitialShelfPositions 클라이언트 미러 · SSOT
 *   · 매장1 default + 창고1/2 (구역 코드 기반)
 *   · 각 값은 null · 상세위치는 사용자가 편집으로 채움
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

/**
 * shelf_positions (DB 저장값) + location (진열구역) → 렌더용 병합 결과
 *   · shelf_positions 있고 · key 있으면 그대로 사용
 *   · shelf_positions 비어있거나 · key 없으면 · location 기반 default 자리 확보 (값 null)
 *   · **계층 2 클라 폴백** · 레거시 상품 · DB 미갱신 상태에서도 UI 즉시 표시
 *   · 사용자가 슬롯 값 입력·저장 시 그때 DB 반영 (자동 DB 쓰기 X)
 */
export function mergeShelfPositionsWithFallback(
  shelf: ShelfPositions | null | undefined,
  location: string | null | undefined,
  categoryCode?: string | null,
): Record<string, string | null> {
  const existing = { ...(shelf ?? {}) } as Record<string, string | null>;
  const fallback = buildInitialShelfPositions(location, categoryCode);
  for (const [k, v] of Object.entries(fallback)) {
    if (!Object.prototype.hasOwnProperty.call(existing, k)) {
      existing[k] = v; // null · 사용자 편집 대기
    }
  }
  return existing;
}

/** 3자리 → 하이픈 표시 · "332" → "3-3-2" · 2026-09-09 · 사용자 지시 UI 포맷 */
export function formatShelfDetail(v: string | null | undefined): string {
  if (typeof v !== "string" || v.length !== 3) return typeof v === "string" ? v : "";
  return `${v[0]}-${v[1]}-${v[2]}`;
}

export interface FormattedShelfPosition {
  code: string;                        // "store1" · "warehouse1"
  name: string;                        // "매장1" · "창고1"
  kind: "store" | "warehouse";
  detail: string | null;               // "332" or null
  isMissing: boolean;                  // 매장이면서 미입력 (빨간 강조 대상)
}

/** shelf_positions + storage_locations → 표시용 정렬 리스트
 *  · storage_locations sort_order 순 · active=true 만
 *  · 값이 없어도 shelf_positions 에 key 있으면 포함 (미입력 뱃지)
 *  · 값이 없고 key 도 없으면 · 제외 (해당 위치 미보유)
 */
export function formatShelfPositions(
  shelf: ShelfPositions | null | undefined,
  locations: StorageLocation[],
): FormattedShelfPosition[] {
  if (!locations?.length) return [];
  const posMap = (shelf ?? {}) as ShelfPositions;
  const activeLocs = locations.filter(l => l.active).sort((a, b) => a.sort_order - b.sort_order);
  const out: FormattedShelfPosition[] = [];
  for (const loc of activeLocs) {
    const hasKey = Object.prototype.hasOwnProperty.call(posMap, loc.code);
    if (!hasKey) continue;
    const raw = posMap[loc.code];
    const detail = typeof raw === "string" && raw.length === 3 ? raw : null;
    out.push({
      code: loc.code,
      name: loc.name,
      kind: loc.kind,
      detail,
      isMissing: loc.required_detail && !detail,
    });
  }
  return out;
}

/** 짧은 문자열 요약 · "매장1:3-3-2 · 매장2:2-1-2 · 창고1"
 *  · null 값은 "미입력" 대신 그냥 이름만 표시 (공간 절약)
 *  · 2026-09-09 · 상세는 formatShelfDetail 로 하이픈 표시 (사용자 지시)
 */
export function summarizeShelfPositions(list: FormattedShelfPosition[]): string {
  return list
    .map(p => (p.detail ? `${p.name}:${formatShelfDetail(p.detail)}` : p.isMissing ? `${p.name}:미입력` : p.name))
    .join(" · ");
}
